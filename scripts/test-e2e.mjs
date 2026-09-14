// Regression test for the mic restart bug.
//
// Feeds a synthetic 120 BPM click track through Chromium's fake audio device
// and checks that tempo locks -- then that it locks AGAIN after Stop mic /
// Start mic. That restart used to fail: the next-analysis timestamp belonged to
// the closed AudioContext's clock, so analysis stayed blocked for roughly the
// length of the previous session.

import { launchApp, sleep } from './cdp.mjs';

const BPM = 120;
const app = await launchApp({ port: 9223, bpm: BPM });
const fail = (m) => { console.error(`\nFAIL: ${m}`); app.close(); process.exit(1); };

try {
  console.log(`\nFeeding a synthetic ${BPM} BPM click track through the fake mic.\n`);

  await app.goto('Setup');
  const start1 = await app.clickButton('Start mic');
  if (start1 !== 'OK') fail(`Start mic (1st): ${start1}`);
  const bpm1 = await app.waitForLock('pass 1');
  if (Math.abs(bpm1 - BPM) > 3) fail(`pass 1: expected ~${BPM} BPM, got ${bpm1}`);

  // Hold the mic open a while first. The bug delays the next lock by roughly the
  // length of the PREVIOUS session, so a short first pass hides it entirely --
  // which is why only a real show (minutes of runtime) looked like "never
  // detects again".
  const SOAK_MS = 20000;
  console.log(`  soak  : holding the mic open ${SOAK_MS / 1000}s before restarting`);
  await sleep(SOAK_MS);

  await app.goto('Setup');
  const stop = await app.clickButton('Stop mic');
  if (stop !== 'OK') fail(`Stop mic: ${stop}`);
  await sleep(1000);

  await app.goto('Perform');
  const afterStop = await app.readBpm();
  if (!afterStop.includes('-')) fail(`after stop: display should reset, showed "${afterStop}"`);
  console.log(`  stop  : display reset to "${afterStop}"`);

  await app.goto('Setup');
  const start2 = await app.clickButton('Start mic');
  if (start2 !== 'OK') fail(`Start mic (2nd): ${start2}`);
  const bpm2 = await app.waitForLock('pass 2', 15000);
  if (Math.abs(bpm2 - BPM) > 3) fail(`pass 2: expected ~${BPM} BPM, got ${bpm2}`);

  await app.goto('Setup');
  await app.clickButton('Stop mic');
  await sleep(800);
  await app.clickButton('Start mic');
  const bpm3 = await app.waitForLock('pass 3', 15000);
  if (Math.abs(bpm3 - BPM) > 3) fail(`pass 3: expected ~${BPM} BPM, got ${bpm3}`);

  console.log(`\nOK: locked at ${BPM} BPM across 3 mic restarts (${bpm1}, ${bpm2}, ${bpm3})`);
  app.close();
  process.exit(0);
} catch (err) {
  fail(err.message);
}
