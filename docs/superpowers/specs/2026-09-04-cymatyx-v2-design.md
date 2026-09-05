# Cymatyx v2 — Design

**Date:** 2026-09-04 · **Author:** Fable (lead) · **Status:** approved by delegation ("this is your ride")

## 1. Thesis

Cymatyx is a **closed-loop bio-resonance instrument**: a webcam measures the body (rPPG → heart rate, HRV, coherence), and the sound adapts to the body in real time. Every other entrainment app is open-loop. v2 exists to make the loop **legible, honest, and local** — and to be built so that the loop *is* the architecture, not a feature bolted onto a settings maze.

v1 (archived) died of exactly that maze: 2×2 audio-settings pages, a coach voice buried two tabs deep, a two-way voice mode that only spoke Gemini, and no visible camera. v2 is a rewrite, not a port. Knowledge carries forward; code does not.

## 2. Scope by milestone

| | milestone | must work end-to-end | not included |
|:--:|---|---|---|
| **M1** | **The pure loop** | camera → rPPG (GREEN/CHROM/POS/AUTO) → HR/HRV/coherence → offline rule engine → adaptive binaural + isochronic audio + paced breathing guide. One rack screen, one START, session persisted locally. | AI, voice, gamma, cloud, history charts |
| **M2** | **The coach** | spoken encouragement from a local LLM (LM Studio/Ollama, OpenAI-compatible) or fixed lines, through ONE local TTS jack (Kokoro proven; OmniVoice via shim). Tone can react to coherence. | cloud TTS, two-way voice |
| **M3** | **40 Hz gamma (ISF)** | click train + visual flicker behind the mandatory photosensitive-epilepsy gate, audio-only alternative, reduced-motion honored. | — |
| later | history/trends UI, two-way voice (local STT), Elata backend, EEG | | |

Non-goals for v2 entirely: cloud biometrics by default, medical claims, imaginary hardware in the UI, Gemini Live.

## 3. Architecture spine: the control-voltage bus

The whole app is one signal path, modeled literally.

```
[Sensor] --frames--> [rPPG Engine (Worker)] --BioFrame--> [Bus] <-- [Modulators] --params--> [Synth (AudioWorklet)]
                                                            ^                                        |
                                                     UI views read the bus                speakers -> body -> camera
```

- **Bus** — a single typed, in-memory store of named control signals with timestamps: `bpm`, `hrv_rmssd`, `coherence`, `sqi`, `confidence`, `breath_phase`, `breath_rate`, `beat_hz`, `carrier_hz`, `pulse_depth`, `master_gain`, plus state signals `cam_live`, `session_state`, `engine_method`. Signals are `null` when no real reading exists. **Nothing in the UI may display a value that is not on the bus** — the honesty rule becomes a type constraint.
- **Modulators** — pure functions `(bus, goal, rules) -> param patches`, run on a fixed tick. M1 ships the offline rule engine as the only modulator (HR-zone + coherence → beat/carrier/breath targets, with slew limiting so nothing jumps). M2 adds the coach as a *listener* (bus → speech), not a modulator.
- **Rack flip** — the front of the rack shows bus signals as instruments; the back of the rack shows the same bus as patch cables and raw traces (waveform, spectrum, ROI camera, provider wiring). Same data, two faces. This replaces "settings pages": every knob on the back is a bus parameter with a visible cable to what it drives.

## 4. Modules (one purpose each, testable in isolation)

| module | does | interface | depends on |
|---|---|---|---|
| `sensor/camera` | owns getUserMedia, frame loop, MediaPipe face landmarks, ROI extraction (forehead + both cheeks) | `start()/stop()`, emits `RoiSample {t, rois: {forehead, cheekL, cheekR}: {r,g,b}}` | MediaPipe tasks-vision |
| `engine/rppg` (Web Worker) | sliding window per ROI → GREEN/CHROM/POS candidates → per-ROI spectral SQI → SNR-weighted ROI fusion → DFT peak (parabolic refined) → R-peaks → RMSSD → coherence | `process(sample) -> BioFrame {bpm, hrv, coherence, sqi, confidence, method, waveform}` — pure, synchronous inside; worker wrapper outside | none (plain TS math; ported from v1's tested engine + QualityPhys reference) |
| `bus` | typed signal store + subscribe; every write stamped | `set(name, value, t)`, `get()`, `subscribe(cb)` | none |
| `rules/offline` | goal presets + HR-zone/coherence tables → parameter targets with slew | `modulate(bus, goal) -> ParamPatch` | bus types |
| `synth` (AudioWorklet) | binaural stack (3 harmonic layers), isochronic amplitude pulse, breathing-guide timing clock, master bus + analyser | `setParams(patch)`, `start()/stop()`, `analyser` | Web Audio |
| `session` | state machine idle → calibrating → active → summary; persistence via Dexie; RSA calibration from guided breath | `start(goal)`, `end()`, `export()` | bus, Dexie |
| `ui/rack` | front (instruments) and back (patch bay) as React views of the bus | props = bus snapshot | bus |
| `voice` (M2) | coach: bus → line generator (local LLM or fixed) → TTS jack (OpenAI-compatible `/v1/audio/speech`) | `speak(text)`, `discover()` | fetch |
| `gamma` (M3) | 40 Hz click train + flicker + gate | behind `consent` signal | synth, bus |

## 5. Data flow, one session

1. START → camera starts; `cam_live` = true (tally lamp lit — the camera is never invisible).
2. Calibration: paced-breath guide for ~30 s; engine warms (`bpm` null until ≥60 samples); RSA baseline written to bus.
3. Active: each frame → RoiSample → worker → BioFrame → bus. Modulator tick (2 Hz) reads bus → slewed param patch → synth. UI redraws from bus only.
4. End → summary from the session's bus history (durations, averages, peak coherence) → Dexie.
5. Everything stays on the machine. Cloud providers are opt-in, later, and labeled.

## 6. Honesty and safety, as constraints

- `null` renders as `--`. No zeros that aren't measurements. No LEDs that aren't bus-driven.
- Camera visible whenever sampling; red tally = `cam_live`.
- Photosensitive gate (M3) is a blocking consent state in the session machine, not a modal someone can forget to mount.
- No medical/outcome claims in copy. The instrument reports what it measured.
- Biometrics never leave the machine unless a labeled cloud provider is chosen (M2+).

## 7. Stack

React 19 · Vite · TypeScript strict · Tailwind v4 · Zustand (bus) · Dexie · MediaPipe tasks-vision · Web Worker (engine) · AudioWorklet (synth) · Vitest + Testing Library · Playwright. Node 26 (test setup provides a real Storage mock — lesson from v1). PWA later, not M1.

## 8. Visual world

The Stitch **Silver Rack** (design-vault/stitch/.../variant_3) is the face: nixie BPM tubes, coiled cables, backlit round goal buttons, cream VU for coherence, red mushroom START, dymo/engraved labels. Rules inherited: never cyan; honest skeuomorphism (every control maps to a bus signal; no imaginary hardware). M1 ships in that world at CSS fidelity; the asset/texture wave comes after the loop works.

## 9. Testing

- Engine: synthetic RGB tests (pulse + common-mode drift; POS/CHROM must recover BPM where GREEN degrades; SQI ordering; parabolic sub-BPM; RMSSD on synthetic R-R; multi-ROI fusion prefers the higher-SNR ROI).
- Rules: table-driven — given bus state + goal, expect param targets; slew never exceeds limits.
- Bus: type-level — a component cannot render a non-bus value (typed hook).
- Session machine: state-transition tests incl. calibration abort and camera denial.
- Synth: worklet param plumbing tested via a fake AudioContext; a real-browser Playwright smoke that a session starts and the analyser shows non-zero output.
- Camera: Playwright with a fake video device for the ROI pipeline.

## 10. Repo layout

```
Cymatyx/
├── src/
│   ├── sensor/     camera + face landmarks + ROI
│   ├── engine/     rppg math (pure) + worker wrapper
│   ├── bus/        control-voltage bus + types
│   ├── rules/      offline modulator + goal presets
│   ├── synth/      audio worklet + node graph
│   ├── session/    state machine + persistence
│   ├── ui/         rack front / rack back / instruments
│   └── voice/      (M2)
├── tests/          mirrors src
├── docs/superpowers/{specs,plans}
└── PRODUCT.md      carried forward from v1 (product truth), refreshed
```

## 11. Risks

- Multi-ROI + POS in a worker at 30 fps is fine on desktop; budget it (< 4 ms/frame).
- AudioWorklet + autoplay policy: START is the user gesture that unlocks audio; design the state machine around it.
- MediaPipe model load (~4 MB) needs a visible warm-up state, not a frozen START.
- Slew limiting is the difference between "adaptive" and "seasick" — table values get tuned on Kyle's face, not in theory.
