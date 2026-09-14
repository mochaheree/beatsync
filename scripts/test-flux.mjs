// Tempo accuracy over synthetic drum patterns, run entirely in Node.
//
// scripts/test-accuracy.mjs is the ground truth -- it drives the real app --
// but it costs about two minutes a run. This reproduces the same pipeline
// offline so onset-detection changes can be measured in seconds, over more
// material than a click track.
//
//   node scripts/test-flux.mjs                        # current pipeline
//   node scripts/test-flux.mjs --mode bands --weights 4,2,1,1,0.5
//
// The estimator only needs to land on the right BPM; the octave it folds into
// is a separate, deliberate choice, so a result is counted correct if it
// matches the true tempo or a power-of-two relative of it.

import { renderPattern, STYLE_NAMES } from './lib/patterns.mjs';
import { fluxSeries, toGrid } from './lib/flux.mjs';
import { estimate } from '../src/renderer/lib/tempo.js';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const mode = arg('mode', 'current');
const weights = arg('weights', '1,1,1,1,1').split(',').map(Number);
const styles = arg('styles', STYLE_NAMES.join(',')).split(',');
const tempos = arg('tempos', '96,100,105,110,120,128,140,150').split(',').map(Number);
const detrendSeconds = Number(arg('detrend', '0'));
// Models an operator who knows roughly what tempo the material sits at:
// the BPM range is set to +/- this fraction around the true tempo.
const bandPct = Number(arg('band', '0'));
const quiet = process.argv.includes('--quiet');

const TOLERANCE = 2.5;

// Folding into the BPM range is intentional, so accept octave relatives.
function offBy(got, want) {
  let best = Infinity;
  for (const mult of [0.25, 0.5, 1, 2, 4]) {
    best = Math.min(best, Math.abs(got - want * mult));
  }
  return best;
}

const rows = [];
for (const style of styles) {
  for (const bpm of tempos) {
    const { samples, sampleRate } = renderPattern({ bpm, style, seconds: 20 });
    const series = fluxSeries(samples, sampleRate, { mode, weights, detrendSeconds });
    const range = bandPct > 0
      ? { minBpm: bpm * (1 - bandPct), maxBpm: bpm * (1 + bandPct) }
      : { minBpm: 80, maxBpm: 160 };
    const est = estimate(toGrid(series), range);
    const got = est ? est.bpm : null;
    const err = got == null ? Infinity : offBy(got, bpm);
    rows.push({ style, bpm, got, err, ok: err <= TOLERANCE, conf: est?.confidence ?? 0 });
  }
}

if (!quiet) {
  let last = null;
  for (const r of rows) {
    if (r.style !== last) { console.log(`\n  ${r.style}`); last = r.style; }
    const got = r.got == null ? '  --  ' : r.got.toFixed(1).padStart(6);
    const ratio = r.got == null ? '  -  ' : (r.got / r.bpm).toFixed(3);
    console.log(`    ${String(r.bpm).padEnd(5)} -> ${got}   x${ratio}  conf ${r.conf.toFixed(2)}  ${r.ok ? 'ok' : 'WRONG'}`);
  }
}

const passed = rows.filter((r) => r.ok).length;
const label = (mode === 'bands' ? `bands [${weights.join(',')}]` : mode) + (detrendSeconds ? ` detrend ${detrendSeconds}s` : '') + (bandPct ? ` range +/-${(bandPct*100).toFixed(0)}%` : ' range 80-160');
console.log(`\n${label}: ${passed}/${rows.length} correct`);
process.exit(passed === rows.length ? 0 : 1);
