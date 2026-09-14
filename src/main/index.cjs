const { app, BrowserWindow, ipcMain, session, shell, clipboard } = require('electron');
const path = require('node:path');
const oscClient = require('./osc.cjs');

const DEV_URL = process.env.BEATSYNC_DEV_URL || 'http://localhost:5174';
// Kept in step with the header height in App.svelte.
const TITLEBAR_HEIGHT = 48;
const isDev = !app.isPackaged;

// Chromium stops requestAnimationFrame and clamps timers in a window that is
// backgrounded, minimised or occluded. During a show this app sits behind
// Resolume, so beat detection and beat scheduling would silently stop. These
// must be set before the app is ready.
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    // Matches --background, so the window does not flash pale before the
    // renderer paints.
    backgroundColor: '#0a0a0a',
    title: 'CUEVO BeatSync',
    icon: path.join(__dirname, '..', '..', 'icon', 'app-icon.ico'),
    autoHideMenuBar: true,
    // VS Code-style title bar: the system bar is hidden and the app's own
    // header takes its place. The window controls stay NATIVE via the overlay
    // rather than being redrawn in HTML, which keeps Windows 11 Snap Layouts
    // (the flyout on hovering maximise) and correct close-button behaviour.
    // The renderer positions around them with the env(titlebar-area-*) vars.
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 16, y: 16 } }
      : {
          titleBarOverlay: {
            color: '#0a0a0a',      // --background
            symbolColor: '#a1a1a1', // --muted-foreground
            height: TITLEBAR_HEIGHT,
          },
        }),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  // External links (donate/contact) must open in the system browser, not a
  // second app window -- Electron's default for window.open()/target=_blank.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    win.loadURL(DEV_URL);
    // Opt-in: a detached DevTools window on every launch gets in the way when
    // you are running this on the same screen as Resolume.
    if (process.env.BEATSYNC_DEVTOOLS === '1') {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    win.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  }

  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  // Electron denies getUserMedia unless we explicitly grant it.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === 'media' || permission === 'audioCapture');
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) =>
    permission === 'media' || permission === 'audioCapture');

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  oscClient.disconnect();
  if (process.platform !== 'darwin') app.quit();
});

const handle = (channel, fn) => ipcMain.handle(channel, async (_e, ...args) => {
  try {
    return { ok: true, data: await fn(...args) };
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) };
  }
});

handle('osc:connect', (host, port) => oscClient.connect(host, port));
handle('osc:disconnect', () => oscClient.disconnect());
handle('osc:status', () => oscClient.status());
handle('osc:send', (address, args) => oscClient.send(address, args));
handle('osc:playClip', (layer, clip) => oscClient.playClip(layer, clip));
handle('osc:stopClip', (layer, clip) => oscClient.stopClip(layer, clip));
handle('osc:setTempo', (bpm, range) => oscClient.setTempo(bpm, range));
handle('osc:setTempoNormalised', (value) => oscClient.setTempoNormalised(value));
handle('osc:resync', () => oscClient.resync());
handle('osc:tempoTap', () => oscClient.tempoTap());

// The renderer's own clipboard.writeText() is denied: the permission handler
// above only allows microphone access, and broadening it to clipboard just to
// support one Copy button is a bigger surface than routing the copy through
// the main process, which always has clipboard access.
handle('system:copyText', (text) => { clipboard.writeText(String(text)); });
