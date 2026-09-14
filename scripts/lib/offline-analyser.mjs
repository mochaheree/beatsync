// An offline stand-in for the renderer's AnalyserNode + flux loop, so onset
// detection can be iterated on in seconds instead of two minutes per run
// through Electron.
//
// It mirrors what Web Audio does: Blackman window, FFT, magnitude normalised by
// fftSize, converted to dB. The pipeline it feeds must stay in step with
// src/renderer/lib/audioEngine.js -- scripts/test-flux.mjs checks that the
// failures it reproduces match the ones the real app produces.

const FFT_SIZE = 2048;

// ---- radix-2 FFT -----------------------------------------------------------

function makeFft(n) {
  const levels = Math.log2(n) | 0;
  if (2 ** levels !== n) throw new Error('FFT size must be a power of two');
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = Math.sin((2 * Math.PI * i) / n);
  }
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let x = i, r = 0;
    for (let j = 0; j < levels; j++) { r = (r << 1) | (x & 1); x >>= 1; }
    rev[i] = r;
  }

  return function fft(re, im) {
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const l = j + half;
          const tre = re[l] * cos[k] + im[l] * sin[k];
          const tim = -re[l] * sin[k] + im[l] * cos[k];
          re[l] = re[j] - tre; im[l] = im[j] - tim;
          re[j] += tre;        im[j] += tim;
        }
      }
    }
  };
}

// ---- analyser --------------------------------------------------------------

export class OfflineAnalyser {
  constructor(sampleRate, fftSize = FFT_SIZE) {
    this.sampleRate = sampleRate;
    this.fftSize = fftSize;
    this.bins = fftSize / 2;
    this.binHz = sampleRate / fftSize;
    this.fft = makeFft(fftSize);
    this.re = new Float64Array(fftSize);
    this.im = new Float64Array(fftSize);
    this.db = new Float32Array(this.bins);

    // Blackman, the window Web Audio's AnalyserNode applies.
    this.window = new Float64Array(fftSize);
    const a0 = 0.42, a1 = 0.5, a2 = 0.08;
    for (let i = 0; i < fftSize; i++) {
      const t = (2 * Math.PI * i) / (fftSize - 1);
      this.window[i] = a0 - a1 * Math.cos(t) + a2 * Math.cos(2 * t);
    }
  }

  // samples: Float32Array of the whole signal; offset: start index
  analyse(samples, offset) {
    const { fftSize, re, im, window } = this;
    for (let i = 0; i < fftSize; i++) {
      const s = offset + i < samples.length ? samples[offset + i] : 0;
      re[i] = s * window[i];
      im[i] = 0;
    }
    this.fft(re, im);
    for (let i = 0; i < this.bins; i++) {
      const mag = Math.hypot(re[i], im[i]) / fftSize;
      this.db[i] = mag > 0 ? 20 * Math.log10(mag) : -1000;
    }
    return this.db;
  }
}

// ---- WAV ------------------------------------------------------------------

export function decodeWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error('not a RIFF file');
  let pos = 12;
  let fmt = null;
  let data = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ') {
      fmt = {
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bits: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      data = buf.subarray(body, body + size);
    }
    pos = body + size + (size & 1);
  }
  if (!fmt || !data) throw new Error('missing fmt or data chunk');
  if (fmt.bits !== 16) throw new Error(`expected 16-bit PCM, got ${fmt.bits}`);

  const frames = data.length / 2 / fmt.channels;
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < fmt.channels; c++) {
      sum += data.readInt16LE((i * fmt.channels + c) * 2) / 32768;
    }
    out[i] = sum / fmt.channels;
  }
  return { samples: out, sampleRate: fmt.sampleRate };
}
