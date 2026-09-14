// Measures whether requestAnimationFrame keeps running in a backgrounded /
// minimised window. Run twice: FIX=0 (Electron defaults) and FIX=1 (our
// settings) to show the difference.
//
//   FIX=1 node scripts/dev-electron.mjs scripts/test-background.cjs
//
// A locked beat clock needs steady frames; anything near 0 fps while minimised
// means sync dies the moment the user clicks over to Resolume.

const { app, BrowserWindow } = require('electron');

const FIX = process.env.FIX === '1';

if (FIX) {
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 600,
    height: 400,
    show: true,
    webPreferences: { backgroundThrottling: !FIX },
  });

  await win.loadURL('about:blank');
  await win.webContents.executeJavaScript(`
    window.__n = 0;
    (function loop() { window.__n++; requestAnimationFrame(loop); })();
    window.__mark = () => { const v = window.__n; window.__n = 0; return v; };
    true;
  `);

  const sample = async (label, ms) => {
    await win.webContents.executeJavaScript('window.__mark()');
    await new Promise((r) => setTimeout(r, ms));
    const n = await win.webContents.executeJavaScript('window.__mark()');
    const fps = n / (ms / 1000);
    console.log(`  ${label.padEnd(12)} ${String(n).padStart(4)} frames / ${ms}ms = ${fps.toFixed(1)} fps`);
    return fps;
  };

  console.log(`\nFIX=${FIX ? '1 (backgroundThrottling off + switches)' : '0 (Electron defaults)'}`);

  const fg = await sample('foreground', 2000);
  win.minimize();
  const min = await sample('minimised', 3000);
  win.restore();
  const restored = await sample('restored', 2000);

  const verdict = min >= fg * 0.5 ? 'KEEPS RUNNING' : 'THROTTLED';
  console.log(`  => minimised is ${(min / fg * 100).toFixed(0)}% of foreground: ${verdict}`);

  win.destroy();
  app.quit();
  process.exitCode = min >= fg * 0.5 ? 0 : 1;
});
