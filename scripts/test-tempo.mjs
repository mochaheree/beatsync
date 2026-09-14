// Headless sanity check for the tempo estimator.
// Synthesises an onset-strength signal at a known BPM (with jitter, noise and
// off-beat hats) and checks that estimate() recovers the tempo and phase.

import { FluxGrid, estimate, GRID_SECONDS } from '../src/renderer/lib/tempo.js';

const FRAME = 1 / 60; // renderer pushes at ~60 fps

function synth({ bpm, seconds = GRID_SECONDS, noise = 0.15, jitterMs = 6, offbeat = 0.4 }) {
  const grid = new FluxGrid();
  const period = 60 / bpm;
  const rnd = mulberry(12345 + bpm);
  for (let t = 0; t < seconds; t += FRAME) {
    const phase = (t % period) / period;
    let v = noise * rnd();
    const jitter = (rnd() - 0.5) * (jitterMs / 1000);
    const dist = Math.min(phase, 1 - phase) * period + jitter;
    if (Math.abs(dist) < FRAME) v += 1;                       // kick on the beat
    const halfDist = Math.abs(phase - 0.5) * period;
    if (halfDist < FRAME) v += offbeat;                       // hat off the beat
    grid.push(t, Math.max(0, v));
  }
  return grid;
}

// deterministic PRNG so failures are reproducible
function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cases = [90, 100, 112, 120, 124, 128, 132, 140, 150, 174];
let pass = 0;

console.log('bpm_in  bpm_out  err     conf   phase_err_ms  result');
for (const bpm of cases) {
  const grid = synth({ bpm });
  const est = estimate(grid, { minBpm: 80, maxBpm: 160 });
  if (!est) { console.log(`${bpm}\t-- no estimate --  FAIL`); continue; }

  // expected tempo after octave folding into 80..160
  let expected = bpm;
  while (expected < 80) expected *= 2;
  while (expected > 160) expected /= 2;

  const err = Math.abs(est.bpm - expected);
  // Phase is judged against the INPUT beat grid: when the tempo is folded down
  // an octave, landing on any true beat is correct, not just the odd ones.
  const inPeriod = 60 / bpm;
  let pe = est.lastBeatTime % inPeriod;
  if (pe > inPeriod / 2) pe -= inPeriod;
  // The synthesiser itself quantises onsets to a 60fps frame and a 10ms bin,
  // so ~25ms of slop is baked into the ground truth.
  const peMs = Math.abs(pe) * 1000;

  const ok = err < 2.0 && peMs < 30;
  if (ok) pass++;
  console.log(
    `${String(bpm).padEnd(7)} ${est.bpm.toFixed(2).padEnd(8)} ${err.toFixed(2).padEnd(7)} ` +
    `${est.confidence.toFixed(2).padEnd(6)} ${peMs.toFixed(1).padEnd(13)} ${ok ? 'ok' : 'FAIL'}`
  );
}

console.log(`\n${pass}/${cases.length} passed`);
process.exit(pass === cases.length ? 0 : 1);
