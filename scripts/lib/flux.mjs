// Onset-strength extraction, offline. Mirrors src/renderer/lib/audioEngine.js
// so variants can be measured before any of them reach the app.

import { OfflineAnalyser } from './offline-analyser.mjs';
import { FluxGrid } from '../../src/renderer/lib/tempo.js';

export const DEFAULT_BANDS = [
  [20, 150],      // kick
  [150, 400],     // low body, bass notes
  [400, 1200],    // snare body
  [1200, 3500],   // snare snap, transients
  [3500, 10000],  // hats, cymbals
];

/**
 * @param {Float32Array} samples
 * @param {number} sampleRate
 * @returns {{t:number, flux:number}[]}
 */
export function fluxSeries(samples, sampleRate, opts = {}) {
  const {
    fftSize = 2048,
    fps = 60,
    jitter = 0.25,      // fraction of a hop, mimicking requestAnimationFrame
    mode = 'current',
    bands = DEFAULT_BANDS,
    weights = [1, 1, 1, 1, 1],
    cutoffHz = 5000,
    noiseFloor = 0.02,
    gain = 1,
    seed = 3,
    detrendSeconds = 0,
  } = opts;

  const an = new OfflineAnalyser(sampleRate, fftSize);
  const bins = an.bins;
  const binHz = an.binHz;
  const prev = new Float32Array(bins);
  const cur = new Float32Array(bins);

  const cutoffBin = Math.min(bins - 1, Math.floor(cutoffHz / binHz));
  const bandBins = bands.map(([lo, hi]) => [
    Math.max(0, Math.floor(lo / binHz)),
    Math.min(bins - 1, Math.ceil(hi / binHz)),
  ]);

  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const hop = sampleRate / fps;
  const out = [];
  let pos = 0;
  let first = true;

  while (pos + fftSize < samples.length) {
    const db = an.analyse(samples, Math.round(pos));
    for (let i = 0; i < bins; i++) {
      // Same dB -> 0..1 mapping the renderer uses.
      cur[i] = Math.max(0, (db[i] + 90) / 80);
    }

    let flux = 0;
    if (first) {
      first = false;
    } else if (mode === 'current') {
      for (let i = 0; i <= cutoffBin; i++) {
        const d = cur[i] - prev[i];
        if (d > 0) flux += d;
      }
      flux = (flux / cutoffBin) * gain;
    } else if (mode === 'bands') {
      // Per-band rectified flux, each normalised by its own width so a wide
      // band does not simply out-vote a narrow one, then weighted.
      let sum = 0;
      let wsum = 0;
      for (let b = 0; b < bandBins.length; b++) {
        const [lo, hi] = bandBins[b];
        let f = 0;
        for (let i = lo; i <= hi; i++) {
          const d = cur[i] - prev[i];
          if (d > 0) f += d;
        }
        f /= Math.max(1, hi - lo + 1);
        sum += f * weights[b];
        wsum += weights[b];
      }
      flux = (sum / (wsum || 1)) * gain;
    } else {
      throw new Error(`unknown flux mode: ${mode}`);
    }

    out.push({ t: pos / sampleRate, flux });

    prev.set(cur);
    pos += hop * (1 + (rnd() - 0.5) * 2 * jitter);
  }

  if (detrendSeconds > 0) detrend(out, detrendSeconds, fps);
  for (const f of out) if (f.flux < noiseFloor) f.flux = 0;

  return out;
}

// Subtract a local moving average and rectify. Standard onset-envelope
// pre-processing: it removes slow swells so only the attacks survive, which is
// what the comb filter is trying to line up against.
function detrend(series, seconds, fps) {
  const w = Math.max(1, Math.round(seconds * fps));
  const n = series.length;
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + series[i].flux;
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - w);
    const hi = Math.min(n, i + w + 1);
    const avg = (prefix[hi] - prefix[lo]) / (hi - lo);
    series[i].flux = Math.max(0, series[i].flux - avg);
  }
}

export function toGrid(series) {
  const grid = new FluxGrid();
  for (const { t, flux } of series) grid.push(t, flux);
  return grid;
}
