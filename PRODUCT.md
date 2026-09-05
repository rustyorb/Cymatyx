# Product

> Carried forward from v1 on 2026-09-04 (product truth held; the code did not). v2 is a from-scratch rebuild — see docs/superpowers/specs/2026-09-04-cymatyx-v2-design.md.

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Kyle (the author) first — an n=1 self-experimenter validating whether closed-loop entrainment produces measurable effects at all. After that: self-experimenters — biofeedback-curious people who have tried open-loop entrainment (audio tracks, apps) and are comfortable bringing their own AI API key or running fully offline. Not (yet) the general wellness public, not practitioners.

## Product Purpose

Cymatyx measures heart rate and HRV in real time from the webcam (rPPG via MediaPipe FaceMesh + DFT on the green channel), computes a coherence score, and uses those live biometrics to continuously adapt binaural/isochronic audio, breathing guidance, and a 40Hz gamma audio-visual protocol. Sessions persist locally for later review. Success means: the loop demonstrably closes (biometrics visibly steer the audio), and outcomes are reported as measured HRV/coherence numbers — nothing more.

## Positioning

Every other entrainment product is open-loop: it plays at you. Cymatyx watches the body's response (rPPG → HRV/coherence) and adjusts the stimulus in a closed loop, with AI (any of 15 BYOK providers, or Gemini Live voice) or an offline rule engine driving the adaptation. As of 2026-09, no shipped product does closed-loop webcam-rPPG → entrainment audio (camera-HRV apps like HRV4Biofeedback stop at breathing guidance; binaural apps have no sensor).

## Operating Context

Solo sessions at a desk or couch: face visible to the webcam, reasonable lighting (the app scores signal quality and lighting and says so), headphones for binaural audio. Users may be fully offline (rule-based engine) or online with their own API key. Sessions run idle → calibrating (guided-breath RSA baseline) → active → summary.

## Capabilities and Constraints

- **The app is local-first and runs on the user's machine** (git clone → npm install → npm run dev). cymatyx.com will host the site FOR the app, later.
- **Biometric data never leaves the machine by default.** The full loop runs on-device: offline rule engine, local LLMs (Ollama / LM Studio), local TTS (Kokoro-FastAPI / Chatterbox). Choosing a cloud AI provider sends biometric summaries inside prompts — surfaces and docs state this plainly rather than burying it.
- **Efficacy is honestly unproven.** The author's own position: results unknown until self-experimentation says otherwise. All claims must stay at the level of real physics (binaural beat perception, measured HRV); no medical, consciousness, or outcome promises.
- **Real data only** — UI renders real computed/session values; no mock, placeholder, or simulated data in production paths.
- **Photosensitive-epilepsy safety is non-negotiable**: visual flicker requires the consent flow, audio-only alternative offered, `prefers-reduced-motion` respected.
- Provider keys are user-supplied, encrypted in a local vault, never sent anywhere but the chosen provider. Falls back to the offline rule engine automatically.
- All audio paths share one AudioContext/master bus; Web Audio nodes are lifecycle-managed.
- Terminology: rPPG, HRV (RMSSD), RSA, coherence, entrainment, ISF (Intermittent Sensory Flickering), BYOK.

## Brand Commitments

**NEVER cyan. Ever** (Kyle, 2026-09-01 — permanent, applies to every surface). The app's current slate-950/cyan look is incumbent code, not approved identity: it is slated for replacement by the visual world chosen for cymatyx.com. Dark-neon "biohacker dashboard" and soft wellness pastels are both named ruts to avoid.

**Visual north star (Kyle, 2026-09-01): instrument-grade skeuomorphism** at the audio-plugin craft bar (UAD / Kontakt-library level — photoreal panels, sculpted controls, worn hardware). Bound by the honesty rule that plugin skeuomorphism usually breaks: every rendered control, meter, jack, and lamp maps to a real parameter or real pipeline state — no imaginary-hardware decoration, no controls that do nothing. v2 builds its face on the Stitch "Silver Rack" render (design-vault/stitch/stitch-drop-2026-09-01, variant 3): nixie readouts, coiled cables, cream VU, red mushroom START. Asset/texture waves follow the working loop.

Name: Cymatyx. Domain: cymatyx.com. Voice: honest instrumentation over wellness marketing — the author is explicitly motivated to redirect frequency/entrainment tech toward transparent, measurable, helpful use. Cited research (Oster 1973; Iaccarino et al., Nature 2016; Martorell et al., Cell 2019; Thaut 2005) is part of the product's credibility posture and must not be overstated.

## Evidence on Hand

Peer-reviewed citations listed above (for mechanism plausibility, not product efficacy). No user testimonials, no efficacy data, no case studies — these absences are real and must not be fabricated. First evidence will be the author's own logged sessions.

## Product Principles

1. The closed loop is the product — every surface should make the loop legible (what was measured, how the stimulus responded).
2. Measurable claims only — show numbers and confidence, never promised outcomes.
3. Safety gates outrank aesthetics and delight.
4. Private by construction — offline-capable, keys local, sessions in the user's browser.
5. Instrument honesty — surface signal quality, confidence, and data source (AI / offline rules) rather than hiding uncertainty.

## Accessibility & Inclusion

Photosensitive-epilepsy consent flow and `prefers-reduced-motion` support are product requirements, not polish. Existing a11y work (ARIA landmarks, focus traps, `aria-live` biometric readouts, keyboard nav) is load-bearing and must be preserved.
