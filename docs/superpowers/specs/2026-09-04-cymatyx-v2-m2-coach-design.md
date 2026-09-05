# Cymatyx v2 — M2 "The Coach" Design

**Date:** 2026-09-04 · **Author:** Fable (lead) · **Status:** approved by delegation (Kyle: "this is your ride"; "we can do that later" — no design gates while he is unavailable)

## 1. Thesis

M1 made the loop honest. M2 gives it a voice that is *equally* honest: a coach that speaks only about numbers the bus actually holds, through hardware that is local, and whose every setting is a visible jack on the back of the rack. Nothing here is a settings page; it is three modules on the patch bay and one strip on the front.

The coach is a **listener** on the bus (spec §3): bus events → a line of text → a TTS jack → the speakers. It never modulates the audio parameters itself; the rules do that. It may duck the synth while it speaks.

## 2. Scope

| in M2 | not in M2 |
|---|---|
| One **TTS jack**: any OpenAI-compatible `/v1/audio/speech` server (Kokoro-FastAPI proven; OmniVoice once it has a shim). Voices and models fetched from the server. | Cloud TTS, cloud LLM, API keys |
| One **Brain jack**: any OpenAI-compatible `/v1/chat/completions` server (Ollama, LM Studio). Models fetched from the server. Mode `off` / `fixed lines` / `LLM`. | Two-way voice, STT |
| The **coach listener**: session events → line → speech; coherence-aware tone; rate-limited; template fallback when the LLM is off, slow, or wrong. | Long conversations, memory across sessions |
| **Rack**: Voice Jack, Brain Jack and Coach modules on the back; COACH strip (mute latch + last line) on the front. | A separate settings page |
| **Persistence** of jack settings (localStorage). Status lamps lit only by a server that answered. | Provider presets beyond the three URLs |

## 3. Modules

| module | does | interface | depends on |
|---|---|---|---|
| `voice/settings` | persisted jack config (zustand + localStorage): tts `{baseUrl, model, voice, enabled}`, brain `{mode, baseUrl, model}`, coach `{enabled, intervalS}` | `useSettings()`, `settings.getState().set(...)` | zustand |
| `voice/tts` | discovery + synthesis against an OpenAI-compatible TTS server | `discoverTts(baseUrl) → {models[], voices[]}`, `synthesize(cfg, text, signal) → Blob` | fetch |
| `voice/brain` | discovery + one-line generation against an OpenAI-compatible chat server | `discoverModels(baseUrl) → string[]`, `generateLine(cfg, moment, signal) → string` | fetch |
| `voice/lines` | the fixed-line generator: `(moment) → string`, per event × tone band, numbers interpolated, nulls never mentioned | `templateLine(moment)` | none |
| `voice/player` | plays a Blob through an `<audio>` element; resolves when done; `stop()` | `createPlayer()` | DOM |
| `voice/coach` | the listener: subscribes to the bus, detects events, rate-limits, composes (brain → template fallback), speaks, writes `coach_*` bus signals | `createCoach(deps).start()/stop()/say(moment)` | bus, settings, tts, brain, lines, player |
| `ui/instruments/VoiceJack`, `BrainJack`, `CoachModule`, `CoachStrip` | back-of-rack jacks and the front strip; read bus + settings only | props: none | bus, settings |
| `session/orchestrate` (modify) | starts/stops the coach with the session; ducks the synth via `coach_speaking`; speaks the session-end line from the record | — | coach |
| `vite.config` dev-only `/mock` middleware | deterministic fake TTS + LLM endpoints for the e2e smoke | `/mock/v1/models`, `/mock/v1/audio/voices`, `/mock/v1/audio/speech` (WAV), `/mock/v1/chat/completions` | — |

## 4. New bus signals

`coach_enabled: boolean` (mirrors the front latch), `coach_speaking: boolean`, `coach_last_line: string | null` (exactly what was spoken; the front strip shows it), `tts_status: 'off' | 'ok' | 'error'`, `brain_status: 'off' | 'ok' | 'error'`. Statuses become `ok` only after a real server answered discovery; `error` carries the reason into `last_error` when a speak attempt fails.

## 5. The coach, precisely

**Moment** = `{ event, goal, minutes, bpm, hrv, coherence, breath_rate, rsa_baseline, band, trend }` built from the bus at the instant of the event; `band` is `low` (<40), `mid` (40–70), `high` (>70) with 5-point hysteresis; `trend` compares coherence to the previous line's coherence (`rising | falling | flat | unknown`). Nulls stay null and are never spoken.

**Events** (each fires at most once unless noted): `calibration_start` (state → calibrating), `first_lock` (bpm null → number, once per session), `active_start`, `band_change` (crossing with hysteresis), `checkin` (every `intervalS`, default 90 s, while active), `session_end` (after the record exists; uses avg/peak from the record, not the live bus).

**Rate limit**: at least 40 s between lines, except `session_end`. One pending line at a time; a newer event replaces an older pending one; nothing interrupts a line in progress.

**Composition**: `brain.mode === 'llm'` → `generateLine` with an 8 s timeout, then validation (≤ 30 words, no digits that are not in the moment, no banned claims); any failure → `templateLine`. `fixed` → `templateLine`. `off` → no line. The prompt states the honesty rules: speak only to the numbers given, one sentence, no medical claims, tone by band (`low`: steady and unhurried, no judgment; `mid`: encouraging; `high`: quiet affirmation).

**Speech**: `tts.enabled` and `tts_status === 'ok'` → synthesize → play; while playing `coach_speaking = true` and the orchestrator's tick sends `master_gain × 0.35` to the synth (the patch bay shows the ducked value — the bus carries what the synth is actually told). TTS failure → `tts_status = 'error'`, the line still appears on the strip. Coach disabled → nothing is composed.

## 6. Rack

Back: **Voice Jack** (base URL, model select, voice select, Test button that speaks a fixed test line, lamp), **Brain Jack** (mode latch off / fixed lines / LLM; base URL; model select; Test button that composes one line and shows it; lamp), **Coach** (enabled, check-in interval, last line). Selects fetch their lists from the server on demand (Fetch button + on URL blur) — never hand-typed lists (house rule). A failed fetch prints the reason under the jack (e.g. LM Studio needs CORS enabled in its server settings).

Front, in the Session Controller: **COACH strip** — a small latch (mute) and the last spoken line in glass. Same data as the back.

## 7. Honesty and safety

- The coach speaks only bus values; `--` is never verbalized; a null is omitted from the sentence.
- Every lamp is a server that answered. Every line shown was actually sent to the TTS or, if TTS is off, would have been.
- No medical or outcome claims in templates or prompt; the LLM's output is validated and replaced by a template if it wanders.
- All endpoints default to `http://localhost:…`; nothing leaves the machine unless the user types another host.

## 8. Testing

- `lines`: every event × band yields a line; numbers present appear, nulls never do; no banned words.
- `brain`: OpenAI shapes parsed (models list, chat completion), timeout → rejects, validation rejects digits not in the moment.
- `tts`: discovery parses Kokoro's `/v1/audio/voices` (`{voices:[...]}`) and `/v1/models`; `synthesize` posts the right body and returns a Blob.
- `coach`: fake bus timeline → expected events in order; rate limiting; fallback to template on brain failure; `coach_speaking` toggles around a fake player; disabled → silent.
- `settings`: persists and reloads.
- UI: jacks render lamps from the bus, never lit without `ok`.
- e2e: with `/mock` as both base URLs, START → calibration line appears on the strip within 5 s, `coach_speaking` toggled (the fake WAV is 0.3 s), STOP → session-end line.

## 9. Risks

- LM Studio blocks browser origins until CORS is enabled — surfaced as a jack message, not a silent failure.
- Autoplay: the first `<audio>.play()` happens after the START gesture, so it is unlocked; the Test buttons are also user gestures.
- An LLM that rambles: the validator + 30-word cap + template fallback keep the coach terse.
- Kokoro takes ~1–3 s per line on GPU; the coach never queues more than one line, so latency cannot pile up.
