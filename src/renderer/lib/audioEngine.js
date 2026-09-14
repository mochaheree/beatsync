// Mic capture -> FFT -> spectral flux onset strength.

import { FluxGrid, estimate } from './tempo.js';

const FFT_SIZE = 2048;

// Roughly: kick, bass body, snare body, transients, hats. Each band's flux is
// normalised by its own width, so a narrow drum is not out-voted by a wide one.
const FLUX_BANDS = [
  [20, 150],
  [150, 400],
  [400, 1200],
  [1200, 3500],
  [3500, 10000],
];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.stream = null;
    this.analyser = null;
    this.grid = new FluxGrid();
    this.prevMag = null;
    this.raf = null;
    this.running = false;

    this.gain = 1;
    this.noiseFloor = 0.02;   // flux below this is ignored
    this.onFrame = null;      // ({ bands, flux, level }) => void
    this.onTick = null;       // called every frame after analysis
  }

  get currentTime() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  async listDevices() {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === 'audioinput');
  }

  openStream(deviceId) {
    return navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        // All of these would destroy the transient we detect onsets from.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });
  }

  async start(deviceId) {
    await this.stop();

    // A saved deviceId goes stale whenever the interface is unplugged, moved to
    // another USB port, or re-enumerated by Windows. Without this fallback the
    // app just refuses to start with "OverconstrainedError" and the only way
    // out is knowing to pick a different device by hand.
    let fellBack = false;
    try {
      this.stream = await this.openStream(deviceId);
    } catch (err) {
      const gone = err?.name === 'OverconstrainedError' || err?.name === 'NotFoundError';
      if (!deviceId || !gone) throw err;
      this.stream = await this.openStream(undefined);
      fellBack = true;
    }

    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    await this.ctx.resume();

    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = FFT_SIZE;
    this.analyser.smoothingTimeConstant = 0; // we want raw frames for flux
    this.analyser.minDecibels = -90;
    this.analyser.maxDecibels = -10;
    src.connect(this.analyser);

    this.bins = this.analyser.frequencyBinCount;
    this.mag = new Float32Array(this.bins);
    this.prevMag = new Float32Array(this.bins);
    this.grid.reset();

    this.binHz = this.ctx.sampleRate / FFT_SIZE;
    this.fluxBands = FLUX_BANDS.map(([lo, hi]) => [
      Math.max(0, Math.floor(lo / this.binHz)),
      Math.min(this.bins - 1, Math.ceil(hi / this.binHz)),
    ]);
    this.running = true;
    this.loop();
    return {
      sampleRate: this.ctx.sampleRate,
      label: this.stream.getAudioTracks()[0]?.label,
      fellBack,
    };
  }

  async stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.ctx) { try { await this.ctx.close(); } catch {} }
    this.ctx = null;
    this.analyser = null;
    this.grid.reset();
  }

  bandEnergy(loHz, hiHz) {
    const lo = Math.max(0, Math.floor(loHz / this.binHz));
    const hi = Math.min(this.bins - 1, Math.ceil(hiHz / this.binHz));
    let s = 0;
    for (let i = lo; i <= hi; i++) s += this.mag[i];
    return s / Math.max(1, hi - lo + 1);
  }

  loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);

    this.analyser.getFloatFrequencyData(this.mag);
    // dB -> linear-ish 0..1, clamped
    for (let i = 0; i < this.bins; i++) {
      this.mag[i] = Math.max(0, (this.mag[i] + 90) / 80); // -90..-10 dB -> 0..1
    }

    // Half-wave rectified spectral flux, computed PER BAND and each band
    // normalised by its own width before averaging. Summing the whole spectrum
    // instead lets bandwidth stand in for loudness: a kick occupies a handful
    // of low bins while a hi-hat smears across hundreds, so a flat sum makes
    // the hats look stronger than the kick. The beat then reads as ambiguous
    // and the estimator settles on 3:2 of the real tempo.
    let flux = 0;
    for (let b = 0; b < this.fluxBands.length; b++) {
      const [lo, hi] = this.fluxBands[b];
      let f = 0;
      for (let i = lo; i <= hi; i++) {
        const d = this.mag[i] - this.prevMag[i];
        if (d > 0) f += d;
      }
      flux += f / (hi - lo + 1);
    }
    flux = (flux / this.fluxBands.length) * this.gain;
    this.prevMag.set(this.mag);
    if (flux < this.noiseFloor) flux = 0;

    this.grid.push(this.ctx.currentTime, flux);

    if (this.onFrame) {
      this.onFrame({
        flux,
        low: this.bandEnergy(20, 150),
        mid: this.bandEnergy(150, 2000),
        high: this.bandEnergy(2000, 8000),
        spectrum: this.mag,
      });
    }
    if (this.onTick) this.onTick();
  };

  analyze(opts) {
    return estimate(this.grid, opts);
  }
}
