// Wires the audio engine, the beat clock and the OSC bridge together.

import { AudioEngine } from './audioEngine.js';
import { BeatClock } from './beatClock.js';
import { settings, live, log, persist } from './store.svelte.js';

const ANALYSIS_INTERVAL = 0.4; // seconds between tempo estimates

const engine = new AudioEngine();
// Both are timestamps on engine.currentTime, which belongs to the AudioContext.
// Starting the mic builds a NEW context whose clock restarts near zero, so these
// must be cleared too -- otherwise the next-analysis check compares against the
// previous session's clock and never fires again.
let lastAnalysis = 0;
let lastTempoPush = 0;
let lastFrameAt = 0;
let stalled = false;

const clock = new BeatClock({
  now: () => engine.currentTime,
  onBeat: (info) => onBeat(info),
});

export function getDevices() {
  return engine.listDevices();
}

export async function startMic() {
  live.error = '';
  try {
    engine.gain = settings.audio.gain;
    engine.noiseFloor = settings.audio.noiseFloor;
    engine.onFrame = (f) => {
      live.level = { low: f.low, mid: f.mid, high: f.high, flux: f.flux };
    };
    engine.onTick = onTick;

    const info = await engine.start(settings.audio.deviceId || undefined);
    lastAnalysis = 0;
    lastTempoPush = 0;
    lastFrameAt = 0;
    stalled = false;
    clock.reset();
    clock.beatsPerBar = settings.tempo.beatsPerBar;
    clock.offsetMs = settings.tempo.offsetMs;
    live.micRunning = true;
    live.micLabel = info.label || 'default input';
    live.sampleRate = info.sampleRate;
    log('audio', `Mic started — ${live.micLabel} @ ${info.sampleRate} Hz`);

    if (info.fellBack) {
      // Point the dropdown at what is actually open, so the stale id does not
      // get retried on the next start.
      settings.audio.deviceId = '';
      persist();
      live.error = 'Saved input device is gone — fell back to the system default.';
      log('error', live.error);
    }
  } catch (err) {
    live.error = describeMicError(err);
    log('error', `Mic failed: ${live.error}`);
  }
}

function describeMicError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
      return 'Microphone access denied — allow it in Windows Settings → Privacy → Microphone.';
    case 'NotFoundError':
      return 'No audio input device found.';
    case 'OverconstrainedError':
      return `Input device unavailable (constraint: ${err.constraint || 'unknown'}). Pick another device.`;
    case 'NotReadableError':
      return 'Audio device is busy — another app may have exclusive use of it.';
    default:
      return err?.message || String(err);
  }
}

export async function stopMic() {
  clock.stop();
  await engine.stop();
  lastAnalysis = 0;
  lastTempoPush = 0;
  lastFrameAt = 0;
  stalled = false;
  if (live.armed) {
    live.armed = false;
    log('osc', 'Disarmed — mic stopped');
  }
  live.micRunning = false;
  live.locked = false;
  live.bpm = 0;
  live.confidence = 0;
  live.stalled = false;
  live.level = { low: 0, mid: 0, high: 0, flux: 0 };
  log('audio', 'Mic stopped');
}

export function markDownbeat() {
  clock.markDownbeat();
  log('beat', 'Downbeat re-aligned');
}

export function relock() {
  clock.reset();
  clock.beatsPerBar = settings.tempo.beatsPerBar;
  clock.offsetMs = settings.tempo.offsetMs;
  engine.grid.reset();
  lastAnalysis = 0;
  live.locked = false;
  live.bpm = 0;
  live.confidence = 0;
  log('beat', 'Tempo lock cleared — re-acquiring');
}

function onTick() {
  const t = engine.currentTime;

  // requestAnimationFrame stops in a backgrounded window. That is fatal here --
  // during a show this app is behind Resolume -- so make the gap visible rather
  // than letting the beat clock quietly drift.
  const wall = performance.now();
  if (lastFrameAt) {
    const gapMs = wall - lastFrameAt;
    if (gapMs > 400 && !stalled) {
      stalled = true;
      live.stalled = true;
      log('error', `Frame loop stalled ${Math.round(gapMs)}ms — sync paused`);
    } else if (gapMs < 200 && stalled) {
      stalled = false;
      live.stalled = false;
      log('audio', 'Frame loop recovered');
    }
  }
  lastFrameAt = wall;

  if (t - lastAnalysis >= ANALYSIS_INTERVAL) {
    lastAnalysis = t;
    const est = engine.analyze({
      minBpm: settings.tempo.minBpm,
      maxBpm: settings.tempo.maxBpm,
    });
    clock.update(est, settings.tempo.minConfidence);
    live.bpm = clock.locked ? clock.bpm : (est?.bpm ?? 0);
    live.confidence = est?.confidence ?? 0;
    if (clock.locked !== live.locked) {
      live.locked = clock.locked;
      if (clock.locked) log('beat', `Locked at ${clock.bpm.toFixed(1)} BPM`);
    }
  }

  clock.beatsPerBar = settings.tempo.beatsPerBar;
  clock.offsetMs = settings.tempo.offsetMs;
  engine.gain = settings.audio.gain;
  engine.noiseFloor = settings.audio.noiseFloor;
  clock.tick();
}

async function fire(address, args, label) {
  if (!live.oscConnected) return;
  const res = await window.api.send(address, args);
  if (!res.ok) log('error', `${label}: ${res.error}`);
}

function onBeat(info) {
  live.bar = info.bar;
  live.beatInBar = info.beatInBar;
  live.beatPulse++;
  if (info.isDownbeat) live.downbeatPulse++;

  // Opening a socket must never start driving the show. Nothing automatic goes
  // out until the operator explicitly arms output; manual test triggers are the
  // only thing that bypasses this.
  if (!live.oscConnected || !live.armed) return;

  if (settings.sync.pushTempo && info.isDownbeat) {
    const t = performance.now();
    if (t - lastTempoPush > 2000) {
      lastTempoPush = t;
      pushTempo(info.bpm);
    }
  }

  if (settings.sync.resyncOnDownbeat && info.isDownbeat && info.bar % 8 === 0) {
    fire('/composition/tempocontroller/resync', [{ type: 'f', value: 1 }], 'resync');
  }

  if (!info.isDownbeat) return;

  for (const tr of settings.triggers) {
    if (!tr.enabled) continue;
    const every = Math.max(1, tr.everyBars | 0);
    const rel = info.bar - (tr.offsetBars | 0);
    if (rel < 0 || rel % every !== 0) continue;

    const clip = pickClip(tr, rel / every);
    fire(
      `/composition/layers/${tr.layer}/clips/${clip}/connect`,
      [{ type: 'f', value: 1 }],
      `trigger ${tr.name}`,
    );
    log('osc', `bar ${info.bar} → ${tr.name}: L${tr.layer} C${clip}`);
  }
}

function pickClip(tr, step) {
  if (tr.mode === 'fixed') return tr.clip;
  const from = Math.min(tr.clipFrom, tr.clipTo);
  const to = Math.max(tr.clipFrom, tr.clipTo);
  const span = to - from + 1;
  if (tr.mode === 'random') return from + Math.floor(Math.random() * span);
  return from + (step % span);
}

export function setArmed(on) {
  if (on && !live.oscConnected) {
    log('error', 'Open the OSC socket before arming');
    return;
  }
  if (on && !live.micRunning) {
    log('error', 'Start the mic before arming');
    return;
  }
  live.armed = !!on;
  log('osc', live.armed
    ? 'ARMED — scheduled triggers are now driving Resolume'
    : 'Disarmed — automatic output held');
}

export function toggleArm() {
  setArmed(!live.armed);
}

export async function connectOsc() {
  const { host, port } = settings.osc;
  const res = await window.api.connect(host, port);
  if (res.ok) {
    live.oscConnected = true;
    live.oscTarget = `${host}:${port}`;
    live.error = '';
    log('osc', `OSC socket open → ${host}:${port} (UDP is one-way; Resolume is not verified)`);
  } else {
    live.oscConnected = false;
    live.error = res.error;
    log('error', `OSC connect failed: ${res.error}`);
  }
  persist();
}

export async function disconnectOsc() {
  await window.api.disconnect();
  live.oscConnected = false;
  live.oscTarget = '';
  if (live.armed) {
    live.armed = false;
    log('osc', 'Disarmed — OSC socket closed');
  }
  log('osc', 'OSC socket closed');
}

export async function testClip(layer, clip) {
  if (!live.oscConnected) { log('error', 'Connect OSC first'); return; }
  const res = await window.api.playClip(layer, clip);
  log(res.ok ? 'osc' : 'error', res.ok ? `Test → L${layer} C${clip}` : res.error);
}

async function pushTempo(bpm) {
  const range = { min: settings.sync.tempoMin, max: settings.sync.tempoMax };
  const res = await window.api.setTempo(bpm, range);
  if (!res.ok) log('error', `tempo push: ${res.error}`);
}

// Calibration: send an exact normalised value and read what Arena displays.
export async function probeTempo(value) {
  if (!live.oscConnected) { log('error', 'Connect OSC first'); return; }
  const res = await window.api.setTempoNormalised(value);
  log(res.ok ? 'osc' : 'error',
    res.ok ? `Probe sent: normalised ${value.toFixed(2)} — read the BPM in Resolume`
           : res.error);
}

export async function tapTempo() {
  if (!live.oscConnected) return;
  await window.api.tempoTap();
  log('osc', 'Tempo tap sent');
}
