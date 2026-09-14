// Predictive beat clock.
//
// Reacting to a detected onset is always late (analysis + IPC + UDP + Resolume
// render = tens of ms). So we never trigger on detection. We lock a period and
// phase, extrapolate the next beat, and schedule the OSC send LOOKAHEAD ahead
// of it so it lands on time.

const LOOKAHEAD = 0.12;      // seconds of scheduling headroom
const PERIOD_SMOOTH = 0.12;  // how fast the locked tempo follows new estimates
const PHASE_SMOOTH = 0.18;   // how hard we pull phase toward the estimate

export class BeatClock {
  constructor({ onBeat, now }) {
    this.onBeat = onBeat;      // (info) => void, called ~LOOKAHEAD early
    this.now = now;            // () => seconds, same clock as estimates
    this.reset();
  }

  reset() {
    // Drop scheduled beats from the previous lock first. Replacing the Set
    // without clearing it orphans live timers, which then fire against the new
    // tempo.
    if (this.pending) for (const t of this.pending) clearTimeout(t);
    this.agreeBpm = 0;
    this.agreeCount = 0;
    this.locked = false;
    this.period = 0.5;
    this.nextBeat = 0;
    this.beatIndex = 0;
    this.beatsPerBar = 4;
    this.confidence = 0;
    this.pending = new Set();
    this.offsetMs = 0;         // manual latency trim
  }

  stop() {
    for (const t of this.pending) clearTimeout(t);
    this.pending.clear();
    this.locked = false;
  }

  get bpm() {
    return this.period > 0 ? 60 / this.period : 0;
  }

  get bar() {
    return Math.floor(this.beatIndex / this.beatsPerBar);
  }

  // Re-align so the very next beat becomes beat 1 of a bar.
  markDownbeat() {
    this.beatIndex = 0;
  }

  // How many consecutive estimates must agree before the clock will act.
  // A single estimate is not evidence: the first full window of audio includes
  // the microphone opening and often reads a metrical relative of the real
  // tempo. Locking onto that and then smoothing means the wrong tempo sticks,
  // which is exactly what "it says 140 when the track is 100" looked like.
  static LOCK_AGREEMENTS = 2;
  static JUMP_AGREEMENTS = 3;

  // Counts how many estimates in a row have named the same tempo.
  agree(bpm) {
    const same = this.agreeBpm > 0
      && Math.abs(Math.log2(bpm / this.agreeBpm)) < 0.03;
    this.agreeCount = same ? this.agreeCount + 1 : 1;
    this.agreeBpm = bpm;
    return this.agreeCount;
  }

  // Feed a fresh estimate from tempo.estimate()
  update(est, minConfidence = 0.25) {
    if (!est) return;
    this.confidence = est.confidence;
    const agreements = this.agree(est.bpm);

    if (!this.locked) {
      if (est.confidence < minConfidence) return;
      if (agreements < BeatClock.LOCK_AGREEMENTS) return;
      this.period = est.period;
      const t = this.now();
      // first beat strictly in the future
      const elapsed = t - est.lastBeatTime;
      const beatsAhead = Math.ceil(elapsed / this.period);
      this.nextBeat = est.lastBeatTime + beatsAhead * this.period;
      this.beatIndex = 0;
      this.locked = true;
      return;
    }

    if (est.confidence < minConfidence * 0.5) return;

    // Tempo: follow slowly, but accept a big jump if the estimate is strong AND
    // has held for several readings. A single confident outlier is usually a
    // 3:2 relative, not a tempo change.
    const ratio = est.period / this.period;
    if (ratio > 0.92 && ratio < 1.08) {
      this.period += PERIOD_SMOOTH * (est.period - this.period);
    } else if (est.confidence > 0.6 && agreements >= BeatClock.JUMP_AGREEMENTS) {
      this.period = est.period;
      this.beatIndex = 0;
    }

    // Phase: wrap the error into +/- half a beat and nudge.
    let err = est.lastBeatTime - this.nextBeat;
    const P = this.period;
    err = err - P * Math.round(err / P);
    if (Math.abs(err) < P * 0.35) {
      this.nextBeat += PHASE_SMOOTH * err;
    }
  }

  // Call every animation frame.
  tick() {
    if (!this.locked) return;
    const t = this.now();

    // If we fell badly behind (tab throttled, device change), resync forward.
    if (t - this.nextBeat > this.period * 4) {
      const skip = Math.ceil((t - this.nextBeat) / this.period);
      this.nextBeat += skip * this.period;
      this.beatIndex += skip;
    }

    while (this.nextBeat < t + LOOKAHEAD) {
      const beatTime = this.nextBeat;
      const index = this.beatIndex;
      const info = {
        beatTime,
        beatIndex: index,
        beatInBar: index % this.beatsPerBar,
        bar: Math.floor(index / this.beatsPerBar),
        isDownbeat: index % this.beatsPerBar === 0,
        bpm: 60 / this.period,
        confidence: this.confidence,
      };
      const delayMs = (beatTime - t) * 1000 + this.offsetMs;
      const timer = setTimeout(() => {
        this.pending.delete(timer);
        this.onBeat(info);
      }, Math.max(0, delayMs));
      this.pending.add(timer);

      this.nextBeat += this.period;
      this.beatIndex++;
    }
  }
}
