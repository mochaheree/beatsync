// Tempo accuracy through the REAL audio path.
//
// scripts/test-tempo.mjs exercises the estimator on a synthetic onset signal.
// This one goes the whole way: a WAV click track -> Chromium's fake microphone
// -> AnalyserNode FFT -> spectral flux -> the estimator -> the UI readout. The
// two disagree more than you would hope, which is the point of having both.

import { launchApp } from './cdp.mjs';

// Models an operator who sets the BPM range around the material they are
// playing. 0 means leave it at the blind 80-160 default.
let bandPct = 0;
const TEMPOS = [];
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--band') { bandPct = Number(process.argv[++i]); continue; }
  const n = Number(process.argv[i]);
  if (Number.isFinite(n) && n > 0) TEMPOS.push(n);
}
const cases = TEMPOS.length ? TEMPOS : [100, 110, 120, 128, 140, 150];
const TOLERANCE = 2.5;

const results = [];

for (const bpm of cases) {
  // The fake device reads one WAV chosen at launch, so each tempo needs its own
  // app instance.
  const app = await launchApp({ port: 9250, bpm });
  try {
    await app.goto('Setup');
    if (bandPct > 0) {
      await app.setInput('min-bpm', Math.round(bpm * (1 - bandPct)));
      await app.setInput('max-bpm', Math.round(bpm * (1 + bandPct)));
    }
    const start = await app.clickButton('Start mic');
    if (start !== 'OK') throw new Error(`Start mic: ${start}`);
    const got = await app.waitForLock(`${bpm} BPM`.padEnd(8), 25000);
    results.push({ bpm, got, ok: Math.abs(got - bpm) <= TOLERANCE });
  } catch (err) {
    results.push({ bpm, got: null, ok: false, err: err.message });
  } finally {
    app.close();
  }
}

console.log('\n  in     out      ratio   verdict');
for (const r of results) {
  const ratio = r.got ? (r.got / r.bpm).toFixed(3) : '  -  ';
  const verdict = r.ok ? 'ok' : (r.got ? 'WRONG TEMPO' : 'no lock: ' + r.err);
  console.log(`  ${String(r.bpm).padEnd(6)} ${String(r.got ?? '--').padEnd(8)} ${ratio}   ${verdict}`);
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} recovered within ${TOLERANCE} BPM`);
process.exit(passed === results.length ? 0 : 1);
