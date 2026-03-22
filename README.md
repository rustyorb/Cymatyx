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
- Goal presets: Relaxation, Focus, Energy, Neuro Regen (40Hz Gamma), Self-Love

### Visualization
- 3D visual entrainment via Three.js / React Three Fiber
- Binaural beat audio synthesis with spatial panning

## Architecture
- **State Management**: Zustand stores (`stores/`) — `useSessionStore` (app state, biometrics, calibration, logs), `useAudioStore` (entrainment config, volume, live mode), `useSettingsStore` (provider setup, self-love settings)
- App.tsx consumes stores via hooks; no prop-drilling for shared state

## Tech Stack
- React 18 + TypeScript + Vite
- Zustand (state management)
- MediaPipe Tasks Vision (face tracking)
- Three.js / @react-three/fiber + @react-three/drei (3D visuals)
- Recharts (signal visualization)
- Google GenAI SDK (Gemini Live)

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
