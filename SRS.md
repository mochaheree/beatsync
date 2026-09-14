# Software Requirements Specification — CUEVO BeatSync

| | |
|---|---|
| **Product** | CUEVO BeatSync |
| **Version** | 0.1.0 |
| **Document status** | Reverse-engineered from the implementation at `src/` and `scripts/`, 2026-09-13 |
| **Scope of this document** | Describes the system **as built**. Items not yet implemented are marked ❓ *Not implemented*. |

---

## 1. Introduction

### 1.1 Purpose
BeatSync listens to a room or line-level audio signal, estimates musical tempo and beat phase, and fires Resolume Arena clip triggers over OSC/UDP, scheduled **ahead** of each beat so they land on time. It removes manual beat-matching from the VJ's hands during a live set.

### 1.2 Intended users

| Actor | Description |
|---|---|
| **Operator (VJ)** | Primary user. Configures input and OSC target before a set, arms output, monitors tempo during the show. Assumed competent with Resolume, not with audio DSP. |
| **Resolume Arena** | External system. Receives OSC over UDP. Does not respond — the channel is one-way. |

### 1.3 Definitions
- **Lock** — the beat clock has accepted a tempo estimate and is extrapolating beats forward.
- **Arm** — explicit operator consent for automatic OSC output. Nothing automatic is sent while disarmed.
- **Flux** — half-wave-rectified spectral flux; the onset-strength signal driving tempo estimation.
- **Lookahead** — 120 ms of scheduling headroom (`LOOKAHEAD`, [beatClock.js:8](src/renderer/lib/beatClock.js#L8)) so an OSC send lands on the beat rather than after it.
- **Normalised tempo** — Resolume's tempo OSC parameter is a 0–1 float, not a BPM.

### 1.4 Product perspective
Standalone Electron desktop application. No server, no account, no network dependency beyond the local UDP socket. All state is local (`localStorage` for settings; in-memory for runtime).

---

## 2. Overall description

### 2.1 System context

```
   microphone / line-in
            │
            ▼
  ┌───────────────────────────────┐
  │ Renderer (Svelte 5)           │
  │  audioEngine → tempo →        │
  │  beatClock → controller       │
  └──────────────┬────────────────┘
                 │ IPC (contextBridge, invoke)
                 ▼
  ┌───────────────────────────────┐
  │ Electron main (Node)          │
  │  osc.cjs / oscMessage.cjs     │
  └──────────────┬────────────────┘
                 │ UDP :7000 (one-way)
                 ▼
          Resolume Arena
```

### 2.2 Operating environment
- **OS**: Windows 11 is the reference and packaging target (NSIS installer). macOS paths exist in code (`trafficLightPosition`) but are unverified.
- **Runtime**: Electron 33, Chromium renderer, Node main process.
- **Build**: Vite 6 + Svelte 5 + Tailwind v4. Zero runtime `dependencies` — everything is bundled.
- **Network**: loopback or LAN UDP to the Resolume host.

### 2.3 Design constraints

| ID | Constraint | Rationale |
|---|---|---|
| **DC-1** | Preload must be CommonJS ([src/preload.cjs](src/preload.cjs)) | Electron's sandboxed preload does not support ESM even under `"type": "module"`. |
| **DC-2** | Main-process files are `.cjs` | The same package is `"type": "module"` for the renderer. |
| **DC-3** | The renderer must never touch Node APIs | `contextIsolation: true`, `nodeIntegration: false`. All OSC goes through IPC. |
| **DC-4** | Chromium background throttling must be disabled | The window sits behind Resolume during a show; throttled rAF stops beat detection dead. |
| **DC-5** | Dark theme only | A light theme flashing up mid-set is a hazard in a booth. |
| **DC-6** | Fonts bundled, not fetched | Venues have no reliable internet. |

### 2.4 Assumptions and dependencies
- **A-1** Resolume Arena 7 clip-connect addresses (`/composition/layers/N/clips/M/connect`) — ✅ confirmed.
- **A-2** Tempo-controller addresses (`/tempo`, `/resync`, `/tempotap`) — ⚠️ version-dependent, unverified across Arena builds.
- **A-3** The default Resolume tempo range 20–500 BPM used for normalisation — ⚠️ an assumption; the product ships a calibration probe (FR-6.3) precisely because it may be wrong or non-linear.
- **A-4** Microphone input is representative of the music. A line-in or virtual audio cable is materially more stable than an open mic in a room with applause and speech.

---

## 3. Functional requirements

### 3.1 FR-1 — Audio capture

| ID | Requirement |
|---|---|
| **FR-1.1** | The system shall enumerate available audio input devices and let the operator select one; the selection is persisted. |
| **FR-1.2** | The capture stream shall be opened with `echoCancellation`, `noiseSuppression` and `autoGainControl` **disabled** and `channelCount: 1` — each of these destroys the transient that onset detection depends on. |
| **FR-1.3** | If a persisted `deviceId` is unavailable (`OverconstrainedError` / `NotFoundError`), the system shall fall back to the system default device, clear the stored id, and report the fallback in the UI and log. |
| **FR-1.4** | `getUserMedia` failures shall be translated into operator-actionable text (permission denied → Windows privacy settings; device busy → exclusive use by another app). See `describeMicError`, [controller.svelte.js:68](src/renderer/lib/controller.svelte.js#L68). |
| **FR-1.5** | Electron main shall grant `media` / `audioCapture` permission requests; without this Electron denies capture. |
| **FR-1.6** | The system shall expose live per-band levels (low / mid / high) and flux for metering. |

### 3.2 FR-2 — Tempo estimation

| ID | Requirement |
|---|---|
| **FR-2.1** | The system shall compute half-wave-rectified spectral flux from a 2048-point FFT with `smoothingTimeConstant = 0`, across five bands (20–150, 150–400, 400–1200, 1200–3500, 3500–10000 Hz), each normalised by its own width. |
| **FR-2.2** | Per-band normalisation is mandatory: summing flux across the full spectrum lets **bandwidth stand in for loudness**, so a hi-hat smeared over hundreds of bins out-votes a kick occupying a handful. |
| **FR-2.3** | Flux shall be resampled onto a fixed 10 ms grid, independent of frame rate. |
| **FR-2.4** | Candidate periods shall be proposed by autocorrelation and selected by a comb filter that scores **fractional** periods — whole-bin scoring mis-ranks tempi such as 96 BPM (62.5 bins). |
| **FR-2.5** | Beat phase shall be fitted with the fractional period over approximately the last 3 s. |
| **FR-2.6** | Estimation shall run every 400 ms (`ANALYSIS_INTERVAL`), not every frame. |
| **FR-2.7** | The operator-set BPM range shall act as a **search constraint** during estimation, not merely a final octave fold. |
| **FR-2.8** | Flux below the configured noise floor shall be ignored; input gain shall be operator-adjustable. |

### 3.3 FR-3 — Beat clock and lock

| ID | Requirement |
|---|---|
| **FR-3.1** | The system shall **never trigger on a detected onset.** It shall lock a period and phase and schedule the *next* beat. Reacting to detection is structurally late (analysis + IPC + UDP + Resolume render). |
| **FR-3.2** | Initial lock shall require **2 consecutive agreeing estimates** (within 0.03 in log₂ tempo ratio) *and* confidence ≥ the operator's lock threshold. A single estimate off a freshly filled window is often a metrical relative; locking on it makes the wrong tempo stick. |
| **FR-3.3** | A large tempo jump (period ratio outside 0.92–1.08) shall require **3 agreements** and confidence > 0.6; otherwise the period follows the estimate with 0.12 smoothing. |
| **FR-3.4** | Phase error shall be wrapped into ±½ beat and corrected at 0.18 smoothing, only when the error is under 0.35 of a period. |
| **FR-3.5** | Each predicted beat shall be dispatched via `setTimeout` at `(beatTime − now) × 1000 + offsetMs`, floored at 0, with the timer tracked so it can be cancelled. |
| **FR-3.6** | `reset()` shall clear all pending timers **before** replacing the pending set — orphaned timers would fire against the new tempo. |
| **FR-3.7** | If the clock falls more than 4 periods behind, it shall skip forward rather than fire a burst of stale beats. |
| **FR-3.8** | The operator shall be able to (a) mark a downbeat, re-aligning bar counting so the next beat becomes beat 1, and (b) clear the lock and re-acquire. |
| **FR-3.9** | Beats per bar shall be operator-configurable and shall drive bar counting. |

### 3.4 FR-4 — OSC transport

| ID | Requirement |
|---|---|
| **FR-4.1** | The system shall implement an OSC 1.0 encoder supporting float, int and string arguments ([oscMessage.cjs](src/main/oscMessage.cjs)). |
| **FR-4.2** | The system shall open a UDP4 socket bound to an ephemeral port, targeting an operator-supplied host and port (default `127.0.0.1:7000`). |
| **FR-4.3** | Port input shall be validated as an integer in 1–65535 and rejected with a message otherwise. |
| **FR-4.4** | Connecting shall first disconnect any existing socket. |
| **FR-4.5** | The UI shall state **"socket open"**, never "connected to Resolume". UDP is fire-and-forget; a successful send proves nothing about a listener. This wording is a requirement, not a style preference. |
| **FR-4.6** | Post-bind socket errors shall be logged, not thrown into the renderer. |
| **FR-4.7** | All IPC handlers shall return `{ ok, data }` / `{ ok, error }` and never reject, so a transport failure cannot crash the renderer. |
| **FR-4.8** | The socket shall be closed when all windows close. |

### 3.5 FR-5 — Arming (safety)

| ID | Requirement |
|---|---|
| **FR-5.1** | No automatic output — clip triggers, tempo push, resync — shall leave the app until the operator presses **ARM**. |
| **FR-5.2** | Armed state shall **never** be persisted. The app must not start up already sending. |
| **FR-5.3** | The system shall disarm automatically if the mic stops or the OSC socket closes. |
| **FR-5.4** | Arming shall be refused, with a logged reason, unless both the OSC socket is open and the mic is running. |
| **FR-5.5** | **Test trigger** shall work armed or disarmed — the only path that bypasses arming — so connectivity can be verified without the app taking over the show. |
| **FR-5.6** | The header shall always display `safe` or `armed`, on every tab. |
| **FR-5.7** | The Perform screen shall name what is missing to arm and offer a one-click fix. |
| **FR-5.8** | While armed, the UI shall display the OSC target and the next scheduled trigger (name, layer, bars away) — no surprises. |

### 3.6 FR-6 — Resolume control

| ID | Requirement |
|---|---|
| **FR-6.1** | Clip connect/disconnect shall be sent as `/composition/layers/{layer}/clips/{clip}/connect` with float `1` / `0`. |
| **FR-6.2** | Tempo push shall convert BPM to a normalised 0–1 value using the operator-calibrated range, clamped to [0,1], and send `/composition/tempocontroller/tempo`. A raw BPM clamps to 1.0 and reads as the range maximum in Arena. |
| **FR-6.3** | The system shall provide a calibration escape hatch: send exact normalised 0.00 / 0.50 / 1.00 probes, let the operator enter what Arena displayed, and derive the range. If 0.50 does not land near the midpoint the mapping is non-linear and tempo push should be left off. |
| **FR-6.4** | Tempo push shall be rate-limited to at most one send per 2 s, and only on a downbeat. |
| **FR-6.5** | Optional resync (`/composition/tempocontroller/resync`) shall fire every 8 bars on the downbeat when enabled. |
| **FR-6.6** | Tempo tap (`/composition/tempocontroller/tempotap`) shall be available. |

### 3.7 FR-7 — Triggers

| ID | Requirement |
|---|---|
| **FR-7.1** | A trigger shall define: `enabled`, `name`, `everyBars`, `offsetBars`, `layer`, and a clip selection `mode`. |
| **FR-7.2** | Clip modes shall be `fixed` (one clip), `cycle` (walk `clipFrom..clipTo` in order) and `random` (uniform within the range). |
| **FR-7.3** | Triggers shall fire **only on downbeats**, when `(bar − offsetBars) mod everyBars === 0` and the result is non-negative. |
| **FR-7.4** | `everyBars` shall be floored at 1 to prevent a modulo-zero fire-every-bar runaway. |
| **FR-7.5** | Multiple triggers shall be supported and evaluated independently on each downbeat. |
| **FR-7.6** | Each fired trigger shall be logged as `bar N → name: L{layer} C{clip}`. |

### 3.8 FR-8 — Background operation

| ID | Requirement |
|---|---|
| **FR-8.1** | `backgroundThrottling: false` plus `disable-background-timer-throttling`, `disable-renderer-backgrounding` and `disable-backgrounding-occluded-windows` shall be set **before app ready**. |
| **FR-8.2** | Measured target: 60 fps foreground **and** minimised. Electron defaults give 0.0 fps minimised — total failure of the product. |
| **FR-8.3** | If the frame gap exceeds 400 ms the system shall surface *"frame loop stalled — sync paused"* rather than let the beat clock drift silently; recovery below 200 ms shall clear it. |

### 3.9 FR-9 — Persistence

| ID | Requirement |
|---|---|
| **FR-9.1** | Persisted to `localStorage` key `beatsync.settings.v1`: OSC host/port, audio device/gain/noise floor, tempo settings, sync settings, triggers. |
| **FR-9.2** | Loading shall merge saved values over defaults per section, so settings written by an older version never lose new keys; a parse failure shall fall back to defaults silently. |
| **FR-9.3** | **Not persisted**: armed state, mic running, OSC connection, BPM, lock, bar position, levels, activity log. |
| **FR-9.4** | Settings shall be flushed on `beforeunload` and on each explicit change. |
| **FR-9.5** | A reset-to-defaults action shall be available. |

### 3.10 FR-10 — Activity log

| ID | Requirement |
|---|---|
| **FR-10.1** | The log shall record kind (`audio` / `osc` / `beat` / `error`) and an `HH:MM:SS.mmm` stamp, newest first. |
| **FR-10.2** | The log shall be capped at 200 entries and is in-memory only — it does not survive a restart. |

### 3.11 FR-11 — User interface

| ID | Requirement |
|---|---|
| **FR-11.1** | Three screens: **Perform** (tempo, bar position, ARM), **Setup** (audio, Resolume, triggers, sync), **Activity** (log). |
| **FR-11.2** | Perform shall show BPM large enough to read across a dark room, a per-beat visual pulse, bar/beat position, and confidence. |
| **FR-11.3** | The system title bar shall be hidden and replaced by the app header (48 px, matching `titleBarOverlay.height`); min/max/close shall remain **native** via `titleBarOverlay`, preserving Windows 11 Snap Layouts and correct close behaviour. |
| **FR-11.4** | The header shall lay out inside `env(titlebar-area-*)` so it never collides with the native controls at any window size or DPI, and shall act as the window drag handle, with interactive children marked `.no-drag`. |
| **FR-11.5** | `--primary` (`#335C67`, 7.32:1 as fill) shall be used only for fills; `--primary-bright` (`#7ca7b3`, 7.53:1) shall carry all text and thin marks. `#335C67` as text on the background measures **2.70:1** — below even the 3.0 large-text floor, which would make the BPM unreadable in a venue. |
| **FR-11.6** | The window background colour shall match `--background` (`#0a0a0a`) so the window does not flash pale before the renderer paints. |

---

## 4. Non-functional requirements

### 4.1 Timing and accuracy

| ID | Requirement | Status |
|---|---|---|
| **NFR-1.1** | OSC sends shall be scheduled ~120 ms ahead of the beat, adjustable by an operator latency trim (negative fires earlier). | ✅ |
| **NFR-1.2** | The analysis loop shall sustain 60 fps foreground and minimised. | ✅ measured, `npm run test:background` |
| **NFR-1.3** | Tempo accuracy through the full audio path, over ten tempi: **6/10 blind** (default 80–160), **10/10** with the BPM range set to ≈ ±12 % of the material. | ✅ measured, `npm run test:accuracy` |
| **NFR-1.4** | Offline over 72 cases (4 drum patterns × 18 tempi): **58/72 blind, 70/72 at ±15 %, 72/72 at ±10 %**. | ✅ measured, `npm run test:flux` |

Measured against synthetic click tracks and drum patterns. ⚠️ **Live-room accuracy is unverified** — a real room is materially harder than a click track.

### 4.2 Safety
- **NFR-2.1** The single most important safety property is FR-5.1: a connected, tempo-locked, disarmed app emits **zero** UDP datagrams. `npm run test:e2e` holds the app in that state for six bars and asserts zero datagrams leave, then that arming starts them and disarming stops them.

### 4.3 Security
- **NFR-3.1** `contextIsolation: true`, `nodeIntegration: false`; the renderer's only privileged surface is the ten explicitly listed `window.api` methods in [preload.cjs](src/preload.cjs).
- **NFR-3.2** No outbound network traffic other than UDP to the operator-specified OSC target.
- **NFR-3.3** No telemetry, no accounts, no remote configuration.

### 4.4 Reliability
- **NFR-4.1** No failure in the OSC path shall crash or hang the renderer (FR-4.7).
- **NFR-4.2** Device disappearance shall degrade to the default device, not to an error state (FR-1.3).
- **NFR-4.3** Loss of the frame loop shall be visible, not silent (FR-8.3).

### 4.5 Usability
- **NFR-5.1** Everything needed mid-set lives on one screen; everything configured once lives in Setup.
- **NFR-5.2** Failure messages shall name the fix, not the exception.

### 4.6 Maintainability
- **NFR-6.1** Tempo estimation shall remain testable headlessly and offline ([scripts/lib/offline-analyser.mjs](scripts/lib/offline-analyser.mjs) stands in for `AnalyserNode`), so accuracy regressions are caught in seconds rather than minutes.

---

## 5. External interfaces

### 5.1 IPC (`window.api`, [src/preload.cjs](src/preload.cjs))

| Method | Channel | Arguments | Returns |
|---|---|---|---|
| `connect` | `osc:connect` | `host, port` | `{ok, data:{host, port}}` |
| `disconnect` | `osc:disconnect` | — | `{ok}` |
| `status` | `osc:status` | — | `{ok, data:{connected, target}}` |
| `send` | `osc:send` | `address, args[]` | `{ok, data:{bytes}}` |
| `playClip` / `stopClip` | `osc:playClip` / `osc:stopClip` | `layer, clip` | `{ok}` |
| `setTempo` | `osc:setTempo` | `bpm, {min,max}` | `{ok, data:{bpm, normalised}}` |
| `setTempoNormalised` | `osc:setTempoNormalised` | `value 0..1` | `{ok, data:{normalised}}` |
| `resync` | `osc:resync` | — | `{ok}` |
| `tempoTap` | `osc:tempoTap` | — | `{ok}` |

Every handler is wrapped so an exception returns `{ok:false, error}` rather than rejecting.

### 5.2 OSC addresses sent

| Address | Args | Confidence |
|---|---|---|
| `/composition/layers/{1-8}/clips/{n}/connect` | `f 1` / `f 0` | ✅ Arena 7 confirmed |
| `/composition/tempocontroller/tempo` | `f 0..1` normalised | ⚠️ normalisation confirmed by observation; range assumed |
| `/composition/tempocontroller/resync` | `f 1` | ❓ unverified across versions |
| `/composition/tempocontroller/tempotap` | `f 1` | ❓ unverified across versions |

### 5.3 Settings schema (v1)

```js
{
  osc:     { host: '127.0.0.1', port: 7000 },
  audio:   { deviceId: '', gain: 1, noiseFloor: 0.02 },
  tempo:   { minBpm: 80, maxBpm: 160, beatsPerBar: 4,
             minConfidence: 0.25, offsetMs: 0 },
  sync:    { pushTempo: true, resyncOnDownbeat: false,
             tempoMin: 20, tempoMax: 500 },   // Resolume's range, for normalisation
  triggers: [{ id, enabled, name, everyBars, offsetBars,
               layer, mode: 'fixed'|'cycle'|'random', clip, clipFrom, clipTo }]
}
```

---

## 6. Verification

| Command | Verifies |
|---|---|
| `npm test` | Tempo estimator against synthetic onset signals; OSC encode/decode round-trip over UDP loopback. |
| `npm run test:e2e` | Mic-restart regression and arm gating, driving the real UI over CDP with a fake mic. Requires Vite running. |
| `npm run test:accuracy` | Tempo accuracy through the whole audio path; `--band 0.12` models an operator-set BPM range. |
| `npm run test:flux` | Tempo accuracy offline over synthetic drum patterns — seconds per run instead of minutes. |
| `npm run test:background` | rAF survival in a minimised window. |

**Requirement → test coverage**

| Requirement | Covered by |
|---|---|
| FR-2.x (estimation) | `test-tempo`, `test-accuracy`, `test-flux` |
| FR-4.1–4.2 (encoding, transport) | `test-osc` |
| FR-5.1–5.3 (arming) | `test-arm`, `test-e2e` |
| FR-1.3 (device fallback) | `test-e2e` |
| FR-8.1–8.2 (background) | `test-background` |
| FR-3.x (beat clock) | indirectly via `test-accuracy` — ❓ no direct unit test |
| FR-7.x (trigger scheduling) | ❓ no automated test |
| FR-9.x (persistence) | ❓ no automated test |
| FR-6.2–6.3 (tempo normalisation) | ❓ manual calibration only |

---

## 7. Known limitations

| ID | Limitation |
|---|---|
| **L-1** | OSC is one-way UDP. "Socket open" means the socket opened and nothing more. The only real confirmation is a clip firing. |
| **L-2** | Mic input picks up the room — applause, speech, crowd. A line-in or virtual audio cable is far more stable. |
| **L-3** | Octave ambiguity is a *choice*, not a solve: 174 BPM inside an 80–160 range is reported as 87. Setting the BPM range is the single most useful operator action. |
| **L-4** | The first lock is deliberately slower than it could be (FR-3.2) — correctness over speed. |
| **L-5** | Accuracy figures come from click tracks and synthetic patterns. Live-room performance is unverified. |
| **L-6** | Tempo-controller OSC addresses are unverified across Arena versions (A-2). |
| **L-7** | The 20–500 tempo range is an assumption; if the 0.50 probe does not land near the midpoint the mapping is non-linear and tempo push should be left off in favour of clip triggers (FR-6.3). |

### 7.1 Approaches measured and rejected
Recorded so they are not re-attempted: a log-normal tempo prior (strong enough to fix 128 BPM, it broke 174), heavier kick-band weighting, detrending the onset envelope, and robust comb statistics (minimum, geometric mean and trimmed mean — each beat the plain average on the patterns it was tuned against and lost on unseen tempi).

---

## 8. Out of scope / future

❓ *Not implemented* — listed for planning, no commitment implied:

- MIDI clock or Ableton Link as an alternative sync source
- OSC input (listening to Resolume's state) — would remove L-1, but requires Resolume-side output configuration
- Per-trigger clip banks tied to detected sections rather than fixed bar counts
- Persisted activity log / session export
- macOS and Linux packaging and verification
- Settings schema migration beyond v1's per-section merge
