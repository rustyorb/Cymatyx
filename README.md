# Cymatyx

Closed-loop bio-resonance app originally built with Gemini Live; now multi-provider with OpenAI-compatible backends + local Ollama/LM Studio. Includes provider setup UI, model fetch, and live audio “Neural Connector.”

## Features
- Provider setup panel (localStorage): OpenAI, Anthropic, OpenRouter, VeniceAI, Groq, Mistral, Cohere, Together, Perplexity, XAI, DeepSeek, Nebius, Ollama (127.0.0.1:11434), LM Studio (http://192.168.0.177:6969)
- Enter API key → Fetch /v1/models → alphabetized dropdown → set default model
- Gemini Live key field for the audio “Neural Connector”
- Entrainment generation via selected provider (/chat/completions JSON)
- Start/stop scripts: start.sh/stop.sh and start.bat/stop.bat

## Quickstart
```bash
cd projects/cymatyx
npm install
npm run dev
```
Then open the app, set provider + key in the right column, fetch models, choose default.

Start/stop helpers:
- Linux/mac: `./start.sh` (runs Vite dev on 0.0.0.0:4173; logs to ../../logs/cymatyx-dev.log; PID in .cymatyx.pid)
- `./stop.sh` to stop
- Windows: `start.bat` / `stop.bat`

## Notes
- Provider setup stored in browser localStorage; keys are not committed.
- Some providers may block /v1/models from the browser (CORS). Add a small local proxy if needed.
- Gemini Live still supported via the Gemini key field.
