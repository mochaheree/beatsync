// Synthetic drum patterns for onset-detection work.
//
// A bare click track is a poor stand-in for music: every onset is identical and
// lands exactly on the beat, so it hides the ambiguity that makes real tracks
// read as 3/2 or 4/3 of their true tempo. These patterns put energy on offbeats
// and give each hit its own spectrum, which is where the estimator actually
// gets into trouble.

const RATE = 48000;

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addHit(buf, at, { freq, sweep = 0, decay, noise, amp }, rnd) {
  const start = Math.round(at * RATE);
  const len = Math.round(decay * RATE);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const j = start + i;
    if (j < 0 || j >= buf.length) continue;
    const t = i / RATE;
    const env = Math.exp(-t / (decay / 4));
    // Pitch sweep gives a kick its thump instead of a pure tone.
    const f = freq * (1 + sweep * Math.exp(-t / (decay / 6)));
    phase += (2 * Math.PI * f) / RATE;
    buf[j] += amp * env * (Math.sin(phase) * (1 - noise) + (rnd() * 2 - 1) * noise);
  }
}

const KICK  = { freq: 50,   sweep: 2.2, decay: 0.22, noise: 0.05, amp: 1.00 };
const SNARE = { freq: 190,  sweep: 0.6, decay: 0.16, noise: 0.75, amp: 0.70 };
const HAT   = { freq: 9000, sweep: 0,   decay: 0.04, noise: 0.95, amp: 0.28 };
const OPEN  = { freq: 8000, sweep: 0,   decay: 0.14, noise: 0.95, amp: 0.30 };
const BASS  = { freq: 80,   sweep: 0,   decay: 0.20, noise: 0.02, amp: 0.45 };

// Each entry is [instrument, positions in beats within one bar of 4]
const STYLES = {
  // What the existing tests use: one kick per beat, hat between.
  click: [[KICK, [0, 1, 2, 3]], [HAT, [0.5, 1.5, 2.5, 3.5]]],

  // Four-on-the-floor with offbeat hats and an offbeat bass -- the offbeat
  // energy is what tempts a comb filter onto 3/2 of the real period.
  house: [
    [KICK, [0, 1, 2, 3]],
    [SNARE, [1, 3]],
    [HAT, [0.5, 1.5, 2.5, 3.5]],
    [BASS, [0.5, 1.5, 2.5, 3.5]],
  ],

  // Backbeat-led, kick not on every beat: the classic half/three-quarter trap.
  backbeat: [
    [KICK, [0, 2.5]],
    [SNARE, [1, 3]],
    [HAT, [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]],
  ],

  // Syncopated, sparse kick, open hat on the and-of-4.
  broken: [
    [KICK, [0, 1.75, 2.5]],
    [SNARE, [1, 3]],
    [HAT, [0.25, 0.75, 1.25, 2.25, 2.75, 3.25]],
    [OPEN, [3.5]],
  ],
};

export const STYLE_NAMES = Object.keys(STYLES);

/**
 * @returns {{samples: Float32Array, sampleRate: number}}
 */
export function renderPattern({ bpm, style = 'house', seconds = 20, seed = 7 }) {
  const beat = 60 / bpm;
  const bar = beat * 4;
  const bars = Math.max(1, Math.floor(seconds / bar));
  const total = Math.round(bars * bar * RATE);
  const buf = new Float32Array(total);
  const rnd = mulberry(seed + bpm);

  const spec = STYLES[style];
  if (!spec) throw new Error(`unknown style: ${style}`);

  for (let b = 0; b < bars; b++) {
    for (const [inst, positions] of spec) {
      for (const p of positions) {
        // Slight human jitter and level variation, so nothing lines up perfectly.
        const jitter = (rnd() - 0.5) * 0.006;
        const level = 0.85 + rnd() * 0.3;
        addHit(buf, b * bar + p * beat + jitter,
          { ...inst, amp: inst.amp * level }, rnd);
      }
    }
  }

  let peak = 0;
  for (const v of buf) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < buf.length; i++) buf[i] = (buf[i] / peak) * 0.9;

  return { samples: buf, sampleRate: RATE };
}
