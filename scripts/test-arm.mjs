// Regression test: opening the OSC socket must NOT start driving Resolume.
//
// The app used to fire scheduled triggers the moment the socket opened, while
// the operator was only trying to verify connectivity. Automatic output is now
// gated behind an explicit ARM; manual Test trigger still bypasses it.
//
// Listens on a real UDP socket and counts what the app actually sends.

import dgram from 'node:dgram';
import { launchApp, sleep } from './cdp.mjs';
import { decode } from './osc-decode.mjs';

const BPM = 120;
const BAR_MS = (60 / BPM) * 4 * 1000; // 2s per bar; the default trigger is every 4 bars

let received = [];
const server = dgram.createSocket('udp4');
server.on('message', (msg) => {
  try { received.push(decode(msg)); } catch { received.push({ address: '<undecodable>' }); }
});
await new Promise((r) => server.bind(0, '127.0.0.1', r));
const oscPort = server.address().port;
const drain = () => { const r = received; received = []; return r; };

const app = await launchApp({ port: 9225, bpm: BPM });
const fail = (m) => { console.error(`\nFAIL: ${m}`); app.close(); server.close(); process.exit(1); };

try {
  console.log(`\nListening for OSC on 127.0.0.1:${oscPort}, fake mic at ${BPM} BPM.\n`);

  // Point the app at our listener, open the socket and start listening.
  await app.goto('Setup');
  await app.setInput('osc-host', '127.0.0.1');
  await app.setInput('osc-port', oscPort);
  const opened = await app.clickButton('Open OSC socket');
  if (opened !== 'OK') fail(`Open OSC socket: ${opened}`);
  await sleep(1000);

  const start = await app.clickButton('Start mic');
  if (start !== 'OK') fail(`Start mic: ${start}`);
  await app.waitForLock('lock  ');

  // --- 1. connected + locked, but NOT armed: nothing may go out ---
  drain();
  const watchBars = 6;
  console.log(`  safe  : watching ${watchBars} bars (${(watchBars * BAR_MS) / 1000}s) with OSC open, not armed`);
  await sleep(watchBars * BAR_MS);
  const leaked = drain();
  if (leaked.length) {
    fail(`${leaked.length} message(s) sent while disarmed: ` +
         leaked.map((m) => m.address).join(', '));
  }
  console.log('  safe  : 0 messages sent — correct');

  // --- 2. manual test trigger must still work without arming ---
  await app.goto('Setup');
  const test = await app.clickButton('Test trigger');
  if (test !== 'OK') fail(`Test trigger: ${test}`);
  await sleep(600);
  const manual = drain();
  if (manual.length !== 1) fail(`manual test trigger sent ${manual.length} messages, want 1`);
  if (!manual[0].address.includes('/clips/')) fail(`unexpected manual address ${manual[0].address}`);
  console.log(`  manual: Test trigger sent ${manual[0].address} while disarmed — correct`);

  // --- 3. arming starts output ---
  await app.goto('Perform');
  const armed = await app.clickButtonStartingWith('ARM');
  if (armed !== 'OK') fail(`ARM: ${armed}`);
  console.log(`  armed : watching ${watchBars} bars for scheduled triggers`);
  await sleep(watchBars * BAR_MS);
  const sent = drain();
  const clips = sent.filter((m) => m.address.includes('/clips/'));
  if (clips.length === 0) {
    fail(`armed but nothing was sent (got: ${sent.map((m) => m.address).join(', ') || 'nothing'})`);
  }
  console.log(`  armed : ${sent.length} message(s), ${clips.length} clip trigger(s) — e.g. ${clips[0].address}`);

  // --- 4. disarming stops it again ---
  const dis = await app.clickButtonStartingWith('DISARM');
  if (dis !== 'OK') fail(`DISARM: ${dis}`);
  await sleep(500);
  drain();
  console.log(`  disarm: watching ${watchBars} bars again`);
  await sleep(watchBars * BAR_MS);
  const after = drain();
  if (after.length) {
    fail(`${after.length} message(s) sent after disarming: ${after.map((m) => m.address).join(', ')}`);
  }
  console.log('  disarm: 0 messages sent — correct');

  console.log('\nOK: output is gated behind ARM; manual test trigger unaffected');
  app.close();
  server.close();
  process.exit(0);
} catch (err) {
  fail(err.message);
}
