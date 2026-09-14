const KEY = 'beatsync.settings.v1';

const defaults = {
  osc: { host: '127.0.0.1', port: 7000 },
  audio: { deviceId: '', gain: 1, noiseFloor: 0.02 },
  tempo: { minBpm: 80, maxBpm: 160, beatsPerBar: 4, minConfidence: 0.25, offsetMs: 0 },
  // tempoMin/tempoMax describe Resolume's own tempo range, because the OSC
  // parameter is normalised 0..1 rather than a BPM. Calibrate them in the UI.
  sync: {
    pushTempo: true,
    resyncOnDownbeat: false,
    tempoMin: 20,
    tempoMax: 500,
  },
  triggers: [
    {
      id: 't1', enabled: true, name: 'Main deck',
      everyBars: 4, offsetBars: 0, layer: 1,
      mode: 'cycle', clip: 1, clipFrom: 1, clipTo: 4,
    },
  ],
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(defaults);
    const saved = JSON.parse(raw);
    return {
      osc: { ...defaults.osc, ...saved.osc },
      audio: { ...defaults.audio, ...saved.audio },
      tempo: { ...defaults.tempo, ...saved.tempo },
      sync: { ...defaults.sync, ...saved.sync },
      triggers: Array.isArray(saved.triggers) && saved.triggers.length
        ? saved.triggers
        : structuredClone(defaults.triggers),
    };
  } catch {
    return structuredClone(defaults);
  }
}

export const settings = $state(load());

export function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {}
}

export function resetSettings() {
  const d = structuredClone(defaults);
  Object.assign(settings, d);
  persist();
}

// Live, non-persisted runtime state
export const live = $state({
  micRunning: false,
  micLabel: '',
  sampleRate: 0,
  oscConnected: false,
  // Deliberately NOT persisted: the app must never start up already sending.
  armed: false,
  oscTarget: '',
  bpm: 0,
  confidence: 0,
  locked: false,
  bar: 0,
  beatInBar: 0,
  beatPulse: 0,      // increments on every beat, drives the UI flash
  downbeatPulse: 0,
  level: { low: 0, mid: 0, high: 0, flux: 0 },
  stalled: false,
  error: '',
});

export const logs = $state({ items: [] });

export function log(kind, message) {
  const t = new Date();
  const stamp = t.toTimeString().slice(0, 8) + '.' + String(t.getMilliseconds()).padStart(3, '0');
  logs.items.unshift({ id: crypto.randomUUID(), stamp, kind, message });
  if (logs.items.length > 200) logs.items.length = 200;
}
