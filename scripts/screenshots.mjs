// Captures the README screenshots from the REAL app, driven over CDP with the
// same fake 120 BPM click track the e2e test uses. Regenerate rather than
// re-cropping by hand:
//
//   npm run dev:renderer     # Vite on 5174, in another terminal
//   npm run screenshots
//
// Nothing here touches the operator's profile -- launchApp isolates it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchApp, sleep } from './cdp.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const WIDTH = 1180;
const SCALE = 2; // capture at 2x so the images stay sharp on a HiDPI screen

fs.mkdirSync(OUT, { recursive: true });

const app = await launchApp({ port: 9224, bpm: 120 });
const die = (m) => { console.error(`\nFAILED: ${m}`); app.close(); process.exit(1); };

// The armed shot has to be a real armed app, so it opens a socket to loopback.
// Nothing is listening there; the datagrams are dropped by the OS.
// The page itself never scrolls -- <main> does, inside a full-height flex
// column. So body.scrollHeight is always the window height and measuring it
// silently clips every tab that is taller than the window.
// `fit` trims the shot to one element plus the header, for tabs whose content
// is shorter than the window and would otherwise be mostly empty floor.
async function shot(name, { fit = null, min = 780 } = {}) {
  const measured = await app.evaluate(`(() => {
    const header = document.querySelector('header');
    const top = header?.offsetHeight || 0;
    const target = ${JSON.stringify(fit)}
      ? document.querySelector(${JSON.stringify(fit)})
      : document.querySelector('main');
    if (!target) return 0;
    const h = ${JSON.stringify(!!fit)} ? target.getBoundingClientRect().height : target.scrollHeight;
    return Math.ceil(top + h) + 48;
  })()`);
  const height = Math.max(min, measured || min);
  await app.cmd('Emulation.setDeviceMetricsOverride', {
    width: WIDTH, height, deviceScaleFactor: SCALE, mobile: false,
  });
  await sleep(500); // let the layout settle at the new size
  const r = await app.cmd('Page.captureScreenshot', { format: 'png' });
  const data = r?.result?.data;
  if (!data) die(`no image data for ${name}`);
  const file = path.join(OUT, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  const kb = (fs.statSync(file).size / 1024).toFixed(0);
  console.log(`  ${name}.png  ${WIDTH}x${height} @${SCALE}x  ${kb} KB`);
  await app.cmd('Emulation.clearDeviceMetricsOverride');
}

try {
  await app.cmd('Page.enable');
  console.log('\nCapturing into docs/\n');

  // 1. Cold start: the "here is what is missing" state, which is what a new
  //    user actually sees first.
  await app.goto('Perform');
  await shot('perform-idle');

  // 2. Setup with the mic live and the socket open, so the meters and the
  //    badges show real values rather than zeros.
  await app.goto('Setup');
  if (await app.clickButton('Start mic') !== 'OK') die('Start mic');
  await sleep(2500);
  if (await app.clickButton('Open OSC socket') !== 'OK') die('Open OSC socket');
  await sleep(800);
  await shot('setup');

  // 3. Locked and armed. Wait for a stable lock first -- the first reading off
  //    a freshly filled window is often a metrical relative.
  const bpm = await app.waitForLock('screenshot', 40000);
  console.log(`  (locked at ${bpm} BPM)`);
  if (await app.clickButtonStartingWith('ARM') !== 'OK') die('ARM');
  await sleep(4000); // let a few bars pass so the bar counter is not on 1
  await shot('perform-armed');

  // 4. The log. Hold armed a while first: at 120 BPM a 4-bar trigger fires
  //    every 8s, and a log showing only "mic started" is not worth a picture.
  console.log('  holding armed 36s so the log fills with real trigger lines');
  await sleep(36000);
  await app.goto('Activity');
  await shot('activity', { fit: 'main > div', min: 520 });

  await app.goto('Perform');
  await app.clickButtonStartingWith('DISARM');
  await sleep(300);

  console.log('\nDone.\n');
  app.close();
  process.exit(0);
} catch (err) {
  die(err.message);
}
