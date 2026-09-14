// Generates a WAV click track at a known BPM, for Chromium's
// --use-file-for-fake-audio-capture (16-bit PCM mono, looped by the browser).

import fs from 'node:fs';

export function makeClickTrack({ bpm = 120, seconds = 20, rate = 48000 } = {}) {
  // Loop cleanly: trim to a whole number of beats so the seam is still on grid.
  const period = 60 / bpm;
  const beats = Math.floor(seconds / period);
  const total = Math.round(beats * period * rate);
  const pcm = new Float32Array(total);

  let seed = 1234567;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x3fffffff - 1;
  };

  const addHit = (startSec, { freq, decay, noise, amp }) => {
    const start = Math.round(startSec * rate);
    const len = Math.round(decay * rate);
    for (let i = 0; i < len && start + i < total; i++) {
      const t = i / rate;
      const env = Math.exp(-t / (decay / 4));
      const tone = Math.sin(2 * Math.PI * freq * t);
      pcm[start + i] += amp * env * (tone * (1 - noise) + rnd() * noise);
    }
  };

  for (let b = 0; b < beats; b++) {
    // kick on the beat
    addHit(b * period, { freq: 60, decay: 0.18, noise: 0.15, amp: 0.9 });
    // quieter hat off the beat -- this is what makes the 1.5x metrical error
    // tempting, so the estimator gets a realistic test
    addHit(b * period + period / 2, { freq: 8000, decay: 0.05, noise: 0.9, amp: 0.25 });
  }

  const buf = Buffer.alloc(44 + total * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + total * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);          // PCM
  buf.writeUInt16LE(1, 22);          // mono
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);   // byte rate
  buf.writeUInt16LE(2, 32);          // block align
  buf.writeUInt16LE(16, 34);         // bits
  buf.write('data', 36);
  buf.writeUInt32LE(total * 2, 40);

  for (let i = 0; i < total; i++) {
    const v = Math.max(-1, Math.min(1, pcm[i]));
    buf.writeInt16LE(Math.round(v * 32000), 44 + i * 2);
  }
  return buf;
}

if (process.argv[2]) {
  const bpm = Number(process.argv[3] || 120);
  fs.writeFileSync(process.argv[2], makeClickTrack({ bpm }));
  console.log(`wrote ${process.argv[2]} @ ${bpm} BPM`);
}
