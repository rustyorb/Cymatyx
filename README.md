# Cymatyx

Closed-loop bio-resonance app: webcam rPPG heart rate monitoring → AI-driven binaural beats and visuals. Multi-provider with OpenAI-compatible backends + local Ollama/LM Studio. Includes Gemini Live audio "Neural Connector."

## Features

### rPPG Biometrics (Heart Rate & HRV)
- **MediaPipe FaceMesh face tracking** — real-time forehead ROI via 478-point facial landmarks (GPU-accelerated WebGL). Falls back to fixed ROI if face detection fails
- **Heart rate (BPM)** — extracted from green channel of webcam video via DFT spectral analysis
- **HRV (RMSSD)** — real-time Heart Rate Variability from R-R interval peak detection with rolling history
- Signal quality / confidence scoring, lighting condition detection
- Debug mode with live signal waveform, DFT spectrum, video feed with ROI overlay

### AI Entrainment
- Provider setup panel (localStorage): OpenAI, Anthropic, OpenRouter, VeniceAI, Groq, Mistral, Cohere, Together, Perplexity, XAI, DeepSeek, Nebius, Ollama, LM Studio
- Enter API key → Fetch /v1/models → alphabetized dropdown → set default model
- Gemini Live key field for real-time audio "Neural Connector"
- Entrainment generation via selected provider (/chat/completions JSON)
- Goal presets: Relaxation, Focus, Energy, ⚡ 40Hz Gamma (Alzheimer's Protocol), Self-Love

### 40Hz Gamma Audio-Visual Module (ISF)
- **Intermittent Sensory Flickering (ISF)** — combined 40Hz auditory click train + synchronized visual flicker for multi-sensory gamma entrainment
- **40Hz Click Train** (`GammaClickTrain`) — amplitude-modulated white noise via Web Audio API: bandpass-filtered noise → 40Hz square-wave AM envelope → distinct auditory clicks at exactly 40Hz
- **40Hz Visual Flicker** (`GammaFlickerOverlay`) — precise requestAnimationFrame-driven screen flash at 40Hz with configurable intensity and duty cycle
- **Gamma Control Panel** — collapsible UI with ISF master toggle, click train volume, flicker intensity, and duty cycle controls; only visible when Neuro Regen goal is selected
- **Photosensitive epilepsy safety** — mandatory warning modal with informed consent before any visual flicker is enabled; "Audio Only" option for users who decline flicker
- **Configurable duty cycle** — adjustable on/off ratio (default 50% = square wave, per standard protocol)
- **Independent audio path** — click train runs alongside binaural beat engine (separate AudioContext) for layered entrainment
- **Zustand state** (`useGammaStore`) — dedicated store for ISF config, auto-reset on session end
- Based on: Iaccarino et al. (Nature 2016) 40Hz gamma reduces amyloid-β; Martorell et al. (Cell 2019) combined audio-visual more effective than unimodal

### Visualization
- 3D visual entrainment via Three.js / React Three Fiber
- Binaural beat audio synthesis with spatial panning
- 40Hz flicker overlay (ISF mode) with screen-blend compositing

### Session Persistence & History
- **IndexedDB via Dexie.js** (`services/sessionDb.ts`) — stores full session records: biometric timeseries, entrainment config snapshots, goal, duration, calibration data
- **Biometric recording** — HR, HRV, signal quality sampled ~1Hz during active sessions; entrainment config changes logged on every telemetry update
- **Session history page** (`/history`) — aggregate stats (total sessions, total time, avg BPM, avg HRV), session list with summary cards, delete
- **Session detail page** (`/history/:id`) — deep dive into individual sessions with interactive Recharts graphs: BPM over time, HRV (RMSSD), signal quality %, entrainment parameter timeline (beat freq, breathing rate, visual pulse)
- **JSON export** — export individual sessions or all sessions as JSON for external analysis
- **Auto-save** — sessions automatically persist to IndexedDB when transitioning from active session to summary

### Offline Therapeutic Fallback
- **Rule-based therapeutic engine** (`services/therapeuticFallback.ts`) — generates entrainment parameters from neuroscience research without any AI provider
- HR zone classification (resting → low → moderate → elevated → high) drives real-time parameter adaptation
- Goal-specific presets with HR zone offsets: beat frequency, carrier tone, breathing rate, visual color, spatial panning
- **Animated breathing guide** — expanding/contracting circle with 4-7-8 ratio, SVG progress ring, phase countdown, coherence indicator (HRV+RSA), and mobile haptic feedback
- HRV-based refinement: low HRV (autonomic stress) deepens calming effect; high HRV allows more aggressive targeting
- **Automatic activation** when: no AI provider configured, API call fails, Gemini Live disconnects mid-session, or Self-Love goal selected
- **Entrainment source indicator** in Telemetry Panel shows current engine: AI Provider, Offline Rules, Gemini Live, or Initializing
- Based on: Oster (1973) auditory beats, Iaccarino et al. (2016) 40Hz gamma protocol, Thaut (2005) rhythmic entrainment

## Architecture
- **Routing**: React Router v7 — `Layout` (persistent header) + page-level routes
- **State Management**: Zustand stores (`stores/`) — `useSessionStore` (app state, biometrics, calibration, logs), `useAudioStore` (entrainment config, volume, live mode, entrainment source tracking), `useSettingsStore` (provider setup, self-love settings), `useGammaStore` (40Hz ISF config, panel state)
- **Orchestration**: `useSessionOrchestrator` hook — consolidates calibration, telemetry loops, Gemini connection, canvas rendering, and gamma state reset
- **Pages**: `pages/SessionPage.tsx` (main session flow), `pages/HistoryPage.tsx` (session list + aggregate stats, lazy-loaded), `pages/SessionDetailPage.tsx` (individual session detail with biometric charts, lazy-loaded)
- **Error Boundaries**: Two-tier crash recovery — app-level boundary (fatal errors) + route-level boundaries (isolate page crashes, nav still works). Auto-retries chunk load failures with backoff. Factory reset clears IndexedDB/localStorage for corrupt state recovery. Global handlers catch unhandled rejections
- **Code Splitting**: Vendor chunks (react, three.js, recharts, genai, data) + route-level lazy loading. Initial load ~210KB gzipped; three.js/recharts deferred until needed
- **Styling**: Tailwind CSS v4 via `@tailwindcss/vite` plugin — compiled at build time, tree-shaken, zero runtime overhead. Custom theme in `index.css`
- **PWA**: Installable Progressive Web App via `vite-plugin-pwa` + Workbox. Auto-updating service worker precaches app shell; runtime caching for Google Fonts. Fully offline-capable. Add-to-home-screen on mobile with themed splash screen
- **Accessibility**: Skip navigation, ARIA landmarks, `role="dialog"` + focus trap on modals, `role="switch"` on toggle buttons, `aria-live` regions for dynamic content (BPM, HRV, logs), keyboard navigation on session list, `prefers-reduced-motion` support disabling 40Hz flicker, labeled form inputs, `aria-hidden` on decorative elements
- **Components**: Focused single-responsibility components in `components/` — views (GoalSelection, CalibrationView, SessionView, SummaryView), panels (TelemetryPanel, NeuralConnector, SelfLoveCoach, KernelLog), and gamma module (GammaControlPanel, GammaClickTrain, GammaFlickerOverlay, EpilepsyWarning)

## Tech Stack
- React 18 + TypeScript + Vite
- Tailwind CSS v4 (build-time via @tailwindcss/vite)
- React Router v7 (client-side routing)
- Zustand (state management)
- MediaPipe Tasks Vision (face tracking)
- Three.js / @react-three/fiber + @react-three/drei (3D visuals)
- Dexie.js (IndexedDB session persistence)
- Recharts (signal & biometric visualization)
- Google GenAI SDK (Gemini Live) with AudioWorklet-based mic capture
- Web Audio API (binaural beats + 40Hz AM click train)
- vite-plugin-pwa + Workbox (PWA service worker & caching)
- Vitest + @testing-library/react (test suite)

## Testing

Vitest + React Testing Library with jsdom environment. 177 tests covering core logic:

```bash
npm test              # Run all tests once
npm run test:watch    # Watch mode (re-run on file changes)
```

**Test coverage:**
- `tests/utils/signalProcessing.test.ts` — HeartbeatEngine (DFT pipeline, BPM detection, HRV/RMSSD, window management, confidence scoring) + lighting status
- `tests/utils/audioUtils.test.ts` — PCM conversion (float32↔int16, base64↔ArrayBuffer, resampling) with roundtrip verification
- `tests/services/therapeuticFallback.test.ts` — Offline rule engine (all 5 goal types, HR zone boundaries, HRV adjustments, clamping, shouldUseOfflineFallback)
- `tests/stores/stores.test.ts` — All 4 Zustand stores (useSessionStore, useAudioStore, useGammaStore, useSettingsStore) — state mutations, array caps, merge semantics
- `tests/components/ErrorBoundary.test.tsx` — Error boundary (error classification, crash screen rendering, retry/recovery, chunk load detection, custom fallback, onError callback)
- `tests/components/GoalSelection.test.tsx` — Goal selection UI (all 5 goals, store updates, mode switching, self-love toggles, start button)
- `tests/components/CalibrationView.test.tsx` — Calibration display (BreathingGuide integration, BPM display, ambient pulse)
- `tests/components/BreathingGuide.test.tsx` — Animated breathing circle (phase labels, coherence indicator, SVG ring, haptic feedback, compact mode)
- `tests/components/TelemetryPanel.test.tsx` — Telemetry readouts (BPM, RSA, all 4 entrainment source states with color indicators)
- `tests/components/EpilepsyWarning.test.tsx` — Epilepsy warning modal (accept/decline callbacks, warning content, overlay rendering, ARIA dialog role, focus trap, Escape key dismiss)
- `tests/services/keyVault.test.ts` — Key vault (store/load round-trip, clear single/all, storage mode switching, env key lookup)
- `tests/services/encouragementService.test.ts` — Encouragement service (API call construction, fallback on error/missing config, response parsing, array content format)

## Quickstart
```bash
npm install
npm run dev
```
Then open the app, set provider + key in the right column, fetch models, choose default. Allow webcam access for rPPG heart rate monitoring.

Start/stop helpers:
- Linux/mac: `./start.sh` (runs Vite dev on 0.0.0.0:4173; logs to ../../logs/cymatyx-dev.log; PID in .cymatyx.pid)
- `./stop.sh` to stop
- Windows: `start.bat` / `stop.bat`

## Notes
- Provider setup stored in browser localStorage; keys are not committed.
- Some providers may block /v1/models from the browser (CORS). Add a small local proxy if needed.
- Gemini Live still supported via the Gemini key field.
- Face tracking model (~4MB) loads from CDN on first use. Works offline after browser caches it.
- GPU delegate preferred for face tracking; falls back to CPU if WebGL unavailable.
- Mic input uses AudioWorklet API (modern replacement for deprecated ScriptProcessorNode) for zero main-thread audio jank. Worklet processor runs on dedicated audio rendering thread.
- **40Hz Gamma ISF** requires user consent before visual flicker activates. Audio-only mode available for photosensitive users.
