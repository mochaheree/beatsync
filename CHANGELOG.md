# Changelog

## v0.1.0 — first release

2026-09-15

BeatSync listens to the music, works out the tempo, and fires your Resolume
clips on the beat over OSC. This is the first build that's worth putting in
front of anyone.

**Download:** `CUEVO-BeatSync-Setup-0.1.0.exe` below. Windows only.

The installer is unsigned, so Windows SmartScreen will put up a blue "Windows
protected your PC" box. *More info → Run anyway.* Getting rid of that needs a
code-signing certificate, which this doesn't have yet.

---

### What it does

- **Predicts beats, never reacts to them.** By the time a kick has been
  analysed, sent over IPC, pushed through UDP and rendered by Resolume, the beat
  is already gone. BeatSync locks a tempo, extrapolates the next beat, and
  schedules the OSC message ~120 ms early so it lands on time.
- **Tempo detection** from mic or line input — spectral flux per band,
  autocorrelation, comb filter, PLL beat clock.
- **Bar-based triggers.** Fire every N bars, with an offset, on any layer, in
  fixed / cycle / random clip mode. As many rules as you want, running at once.
- **Tempo push and resync** to Resolume's own clock, with a calibration probe
  (see Known issues — the parameter is not a BPM).
- **Manual downbeat alignment** and relock, because the app can hear beats but
  can't know which one you count as "1".
- **Runs behind Resolume.** Chromium normally kills `requestAnimationFrame` in a
  minimised window, which would stop beat detection dead. That's disabled, and
  measured: 60.0 fps foreground *and* minimised, against 0.0 fps minimised on
  Electron defaults.
- **Latency trim, sensitivity, noise gate, lock threshold, beats per bar** — all
  adjustable while running.
- **Activity log**, 200 entries, millisecond stamps, for when something goes
  wrong mid-set.

### Arming

Opening the OSC socket does not start driving the show. No triggers, no tempo
push, no resync goes out until you press **ARM**. Arming is deliberately not
persisted — the app can never start up already sending into a venue — and it
disarms itself if the mic stops or the socket closes.

**Test trigger** works either way, so you can prove Resolume is receiving
without handing over the show.

`npm run test:e2e` holds the app connected and tempo-locked for six bars and
asserts that zero UDP datagrams leave, then that arming starts them and
disarming stops them again.

### Measured

Tempo accuracy through the whole audio path, over ten tempi
(`npm run test:accuracy`):

| BPM range | correct |
|---|---|
| blind, default 80–160 | 6 / 10 |
| set to about ±12% around the material | **10 / 10** |

Offline over 72 cases — 4 drum patterns × 18 tempi (`npm run test:flux`): 58/72
blind, 70/72 at ±15%, 72/72 at ±10%.

Setting the BPM range in **Setup → Tempo and timing** is the single most useful
thing you can do. It's a real search constraint, not a tidy-up at the end.

---

### Known issues

- **Tempo push is on by default and will read 500 BPM in Arena until you
  calibrate it.** Resolume's tempo parameter is a normalised 0–1 float, not a
  BPM — a raw value clamps to 1.0. Either run the three calibration probes in
  Setup → Tempo range calibration, or turn *Push detected BPM to Resolume* off
  and drive Resolume with clip triggers. This default is wrong and will flip in
  the next release.
- **OSC is one-way UDP.** "Socket open" means the socket opened and nothing
  more. If OSC Input is off in Resolume, BeatSync sends happily into a void and
  cannot tell. Always fire a test trigger first.
- **Clip addresses are confirmed on Arena 7 only.** The tempo controller
  addresses (`/tempo`, `/resync`, `/tempotap`) are less certain across versions
  — verify before relying on them in a show.
- **Octave ambiguity is not solved.** 174 BPM inside an 80–160 range comes out
  as 87. Set the range.
- **Accuracy is measured on click tracks and synthetic drum patterns.** A real
  room — applause, speech, crowd — is harder, and live accuracy is unverified
  even for tempi that pass here. A line feed or virtual audio cable is
  substantially more stable than a room mic.
- **Windows only.** macOS code paths exist and are untested; there's no Linux
  build.
- **The activity log doesn't survive a restart**, and there's no export.

### Not tested automatically yet

Trigger scheduling arithmetic, settings persistence, and the beat clock in
isolation have no unit tests — the beat clock is only covered indirectly through
the accuracy run. Everything else in `scripts/` is.

---

### Getting started

The [README](README.md) has the full walkthrough. The short version:

1. Resolume → Preferences → OSC → enable **OSC Input**, port 7000.
2. BeatSync → Setup → Resolume → **Open OSC socket**.
3. **Test trigger** on a clip you know has content. If it doesn't fire, stop and
   fix that first.
4. Setup → Audio → **Start mic**. Watch the Onset meter move on hits.
5. Setup → Tempo and timing → set the **BPM range** around your material.
6. Perform → wait for the BPM to go teal, then **Set downbeat** on a "1".
7. Setup → Triggers → build your rules, **Test** each one.
8. **ARM.**
