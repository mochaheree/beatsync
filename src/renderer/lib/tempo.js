// Tempo estimation from an onset-strength (spectral flux) signal.
//
// The audio thread pushes flux values at whatever rate requestAnimationFrame
// gives us (~60Hz, jittery). We resample onto a fixed 10ms grid so that
// autocorrelation lags map cleanly to tempo periods.

export const BIN = 0.01;          // grid resolution, seconds
export const GRID_SECONDS = 8;    // analysis window
const N = Math.round(GRID_SECONDS / BIN);

export class FluxGrid {
  constructor() {
    this.buf = new Float32Array(N);
    this.head = -1; // absolute bin index of the newest bin
  }

  reset() {
    this.buf.fill(0);
    this.head = -1;
  }

  // t: seconds (monotonic, e.g. AudioContext.currentTime)
  push(t, value) {
    const bin = Math.floor(t / BIN);
    if (this.head < 0) {
      this.head = bin;
      this.buf[bin % N] = value;
      return;
    }
    if (bin < this.head) {
      // same or older bin — keep the strongest onset in it
      const idx = bin % N;
      if (bin > this.head - N) this.buf[idx] = Math.max(this.buf[idx], value);
      return;
    }
    // zero-fill any bins we skipped over
    for (let k = this.head + 1; k <= bin; k++) this.buf[k % N] = 0;
    this.buf[bin % N] = value;
    this.head = bin;
  }

  at(bin) {
    if (this.head < 0 || bin > this.head || bin <= this.head - N) return 0;
    return this.buf[bin % N];
  }

  get filled() {
    return this.head >= 0;
  }

  // Oldest -> newest, zero-mean / unit-variance
  normalized() {
    const out = new Float32Array(N);
    const start = this.head - N + 1;
    let mean = 0;
    for (let i = 0; i < N; i++) {
      out[i] = this.at(start + i);
      mean += out[i];
    }
    mean /= N;
    let varSum = 0;
    for (let i = 0; i < N; i++) {
      out[i] -= mean;
      varSum += out[i] * out[i];
    }
    const sd = Math.sqrt(varSum / N) || 1;
    for (let i = 0; i < N; i++) out[i] /= sd;
    return out;
  }
}

function autocorr(x, lag) {
  let sum = 0;
  for (let i = lag; i < x.length; i++) sum += x[i] * x[i - lag];
  return sum / (x.length - lag);
}

// Fold a BPM into the preferred octave, e.g. 190 -> 95, 62 -> 124
export function foldBpm(bpm, min, max) {
  let b = bpm;
  let guard = 0;
  while (b < min && guard++ < 8) b *= 2;
  guard = 0;
  while (b > max && guard++ < 8) b /= 2;
  return b;
}

// Can this tempo reach the range by halving or doubling?
export function foldsIntoRange(bpm, min, max) {
  const folded = foldBpm(bpm, min, max);
  return folded >= min - 1e-6 && folded <= max + 1e-6;
}

const COMB_SECONDS = 6;                       // window every candidate is judged over
const COMB_BINS = Math.round(COMB_SECONDS / BIN);
const COMB_PULSES = 8;                        // pulses scored per candidate
const PHASE_STEP = 0.25;                      // sub-bin phase resolution
const TOLERANCE = 0.5;                        // bins either side of each pulse

// Grid value at a fractional bin position.
function sampleBin(grid, b) {
  const i = Math.floor(b);
  const f = b - i;
  return grid.at(i) * (1 - f) + grid.at(i + 1) * f;
}

// Average onset strength landing on a pulse train of `period` bins, at its best
// phase. Autocorrelation alone cannot tell a real tempo from 1.5x it (off-beat
// hats line up just as well); a comb filter can, because at the wrong period
// half the pulses land on the weaker hat instead of the kick.
//
// The period is FRACTIONAL and sampled by interpolation. Rounding it to whole
// bins looks harmless but is not: 96 BPM is 62.5 bins, and a 63-bin train slips
// half a bin per pulse until it has walked clean off the beat, so the true
// tempo scores worse than a wrong one that happens to land near a whole number.
// That alone accounted for every 3:2 error this estimator used to make.
//
// The per-pulse values are averaged. Robust alternatives -- minimum, geometric
// mean, trimmed mean -- all scored better on the patterns they were tuned
// against and WORSE on unseen tempos, so the plain mean stays.
function combScore(grid, period) {
  // Every candidate is judged on the SAME number of pulses. Deriving the count
  // from a fixed time window instead gives long periods fewer pulses, and the
  // best-phase search then has fewer constraints to satisfy -- a lucky
  // alignment of 5 pulses beats an honest alignment of 12. That is selection
  // bias, not evidence, and it pulled the estimate toward slow tempi.
  const pulses = Math.max(2, Math.min(COMB_PULSES, Math.floor((N - 2) / period)));
  const hits = new Float64Array(pulses);
  let bestPhase = 0;
  let best = -Infinity;
  for (let p = 0; p < period; p += PHASE_STEP) {
    for (let m = 0; m < pulses; m++) {
      const b = grid.head - p - m * period;
      hits[m] = Math.max(
        sampleBin(grid, b - TOLERANCE),
        sampleBin(grid, b),
        sampleBin(grid, b + TOLERANCE),
      );
    }
    let s = 0;
    for (let m = 0; m < pulses; m++) s += hits[m];
    s /= pulses;
    if (s > best) { best = s; bestPhase = p; }
  }
  return { score: best, phase: bestPhase };
}

// Linear interpolation of the grid at an arbitrary time, in seconds.
function sampleAt(grid, t) {
  return sampleBin(grid, t / BIN);
}

// Phase of the most recent beat, fitted with the FRACTIONAL period over a short
// recent window. Fitting phase over the whole analysis window instead lets a
// sub-BPM period error accumulate across a dozen beats and land the "current"
// beat tens of milliseconds off.
function estimatePhase(grid, period, seconds = 3) {
  const now = grid.head * BIN;
  const pulses = Math.max(2, Math.floor(seconds / period));
  const step = BIN / 4;
  let best = -Infinity;
  let bestPhase = 0;
  for (let p = 0; p < period; p += step) {
    let s = 0;
    for (let m = 0; m < pulses; m++) {
      // recent pulses carry more weight -- the groove may have drifted
      s += sampleAt(grid, now - p - m * period) * (1 - (m / pulses) * 0.6);
    }
    if (s > best) { best = s; bestPhase = p; }
  }
  return now - bestPhase;
}

// Sub-bin position of an autocorrelation peak, by fitting a parabola to it.
function refineLag(acf, lag, loLag, hiLag) {
  if (lag <= loLag || lag >= hiLag) return lag;
  const a = acf[lag - 1], b = acf[lag], c = acf[lag + 1];
  const denom = a - 2 * b + c;
  if (denom === 0) return lag;
  const shift = (0.5 * (a - c)) / denom;
  return Math.abs(shift) < 1 ? lag + shift : lag;
}

function gridStats(grid) {
  let sum = 0;
  let max = 0;
  for (let i = 0; i < COMB_BINS; i++) {
    const v = grid.at(grid.head - i);
    sum += v;
    if (v > max) max = v;
  }
  return { mean: sum / COMB_BINS, max };
}

// Exposes what estimate() had to choose between. Used by scripts/_diag and the
// offline tuning harness; not used by the app.
export function debugCandidates(grid, opts = {}) {
  const out = [];
  estimate(grid, { ...opts, _trace: out });
  return out;
}

/**
 * @returns {{bpm:number, period:number, confidence:number, lastBeatTime:number}|null}
 */
export function estimate(grid, opts = {}) {
  const { minBpm = 80, maxBpm = 160 } = opts;
  if (!grid.filled) return null;
  const x = grid.normalized();
  const maxLag = N >> 1;

  const loLag = Math.max(2, Math.round(60 / 220 / BIN)); // 220 BPM
  const hiLag = Math.min(maxLag, Math.round(60 / 60 / BIN)); // 60 BPM

  // --- stage 1: autocorrelation, purely to propose candidate periods ---
  const acf = new Float64Array(hiLag + 2);
  for (let lag = loLag; lag <= hiLag; lag++) {
    let s = autocorr(x, lag);
    if (lag * 2 <= maxLag) s += 0.5 * autocorr(x, lag * 2);
    if (lag * 3 <= maxLag) s += 0.25 * autocorr(x, lag * 3);
    acf[lag] = s;
  }

  const peaks = [];
  for (let lag = loLag + 1; lag < hiLag; lag++) {
    if (acf[lag] > acf[lag - 1] && acf[lag] >= acf[lag + 1]) peaks.push(lag);
  }
  if (peaks.length === 0) return null;
  peaks.sort((a, b) => acf[b] - acf[a]);

  const candidates = new Set();
  for (const lag of peaks.slice(0, 8)) {
    candidates.add(lag);
    // octave relatives, so folding never has to invent a period we never scored
    const half = Math.round(lag / 2);
    const dbl = lag * 2;
    if (half >= loLag) candidates.add(half);
    if (dbl <= hiLag) candidates.add(dbl);
  }

  // --- stage 2: comb filter decides ---
  // Each candidate is refined to a fractional period FIRST. Scoring whole-bin
  // lags and only refining the winner is what let a wrong tempo win: the true
  // period was being judged on a pulse train that had drifted off the beat.
  // The BPM range is a SEARCH CONSTRAINT, not just a final fold. A candidate
  // that cannot be folded into the range by octaves is discarded outright.
  // Blind, a 3:2 relative fits real music almost as well as the true tempo --
  // 100 BPM reads as 133 -- and no amount of scoring reliably separates them.
  // Telling the estimator roughly where the tempo lives does separate them, and
  // that is one thing the operator actually knows.
  const scored = [];
  for (const lag of candidates) {
    const period = refineLag(acf, lag, loLag, hiLag);
    const raw = 60 / (period * BIN);
    if (!foldsIntoRange(raw, minBpm, maxBpm)) continue;
    const { score, phase } = combScore(grid, period);
    scored.push({ lag, period, score, phase, acf: acf[lag] });
  }
  if (opts._trace) opts._trace.push(...scored.map((c) => ({ ...c, bpm: 60 / (c.period * BIN) })));
  if (!scored.length) return null;

  let best = scored[0];
  for (const c of scored) if (c.score > best.score) best = c;

  const refined = best.period;

  const { mean, max } = gridStats(grid);
  const confidence = max <= mean
    ? 0
    : Math.max(0, Math.min(1, (best.score - mean) / (max - mean)));

  const rawBpm = 60 / (refined * BIN);
  const bpm = foldBpm(rawBpm, minBpm, maxBpm);
  const period = 60 / bpm;

  // Re-derive phase at the folded period so the clock and the meter agree.
  const lastBeatTime = estimatePhase(grid, period);

  return { bpm, period, confidence, lastBeatTime };
}
