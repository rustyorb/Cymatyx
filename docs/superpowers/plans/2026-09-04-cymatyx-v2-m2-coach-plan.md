# Cymatyx v2 — M2 "The Coach" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local coach voice that speaks only about numbers on the bus, through one local TTS jack, optionally composed by one local LLM jack, with every setting a visible jack on the back of the rack.

**Architecture:** The coach is a *listener* on the control-voltage bus: bus events → `Moment` → line (LLM with template fallback, or template) → TTS blob → `<audio>`. Jack configuration lives in a small persisted settings store (not on the bus); live status (`tts_status`, `coach_speaking`, `coach_last_line`…) lives on the bus so the rack can only show what is true. A dev-only Vite middleware serves fake providers under `/mock/v1` so the e2e smoke is deterministic.

**Tech Stack:** as M1 (React 19, Vite 7, TS strict, Zustand 5 + `persist`, Vitest 3, Playwright). Providers: OpenAI-compatible `/v1/models`, `/v1/audio/voices`, `/v1/audio/speech`, `/v1/chat/completions` (Kokoro-FastAPI, Ollama, LM Studio).

**Spec:** `docs/superpowers/specs/2026-09-04-cymatyx-v2-m2-coach-design.md`

---

## File structure

```
src/voice/
  settings.ts     persisted jack config (zustand persist → localStorage)
  lines.ts        Moment type, template lines per event × band, validateLine
  tts.ts          discoverTts, synthesize (OpenAI-compatible)
  brain.ts        discoverModels, generateLine, SYSTEM_PROMPT
  player.ts       Blob → <audio>, awaitable, stoppable
  probe.ts        probeTts/probeBrain: discovery → bus status lamps
  coach.ts        the listener: events, rate limit, compose, speak
src/ui/instruments/
  VoiceJack.tsx   back: TTS url/model/voice/fetch/test/lamp
  BrainJack.tsx   back: mode/url/model/fetch/test/lamp
  CoachModule.tsx back: enabled, interval, last line
  CoachStrip.tsx  front: mute latch + last line in glass
src/bus/types.ts        + coach_enabled, coach_speaking, coach_last_line, tts_status, brain_status
src/session/orchestrate.ts   + coach lifecycle, ducking, session-end line
src/ui/rack/Rack.tsx, RackBack.tsx   mount the strip / the jacks
vite.config.ts          + mockProviders() dev middleware
tests/voice/*.test.ts, tests/ui/jacks.test.tsx, e2e/smoke.spec.ts (extended)
```

---

### Task 1: Bus signals + settings store

**Files:** modify `src/bus/types.ts`; create `src/voice/settings.ts`; test `tests/voice/settings.test.ts`

- [ ] **Step 1: Bus signals** — add to `BusSignals`:

```ts
  // coach (M2)
  coach_enabled: boolean;          // front latch; persists across resets
  coach_speaking: boolean;
  coach_last_line: string | null;  // exactly what was spoken (or would have been, TTS off)
  tts_status: 'off' | 'ok' | 'error';
  brain_status: 'off' | 'ok' | 'error';
```
initial: `coach_enabled: true, coach_speaking: false, coach_last_line: null, tts_status: 'off', brain_status: 'off'`; add `'coach_enabled'` to `PERSISTENT`.

- [ ] **Step 2: Settings store** — `src/voice/settings.ts`:

```ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type BrainMode = 'off' | 'fixed' | 'llm';
export interface VoiceSettings {
  tts: { enabled: boolean; baseUrl: string; model: string; voice: string };
  brain: { mode: BrainMode; baseUrl: string; model: string };
  coach: { enabled: boolean; intervalS: number };
}
export const DEFAULT_SETTINGS: VoiceSettings = {
  tts: { enabled: true, baseUrl: 'http://localhost:8880/v1', model: 'kokoro', voice: 'af_sky' },
  brain: { mode: 'fixed', baseUrl: 'http://localhost:11434/v1', model: '' },
  coach: { enabled: true, intervalS: 90 },
};
type Patch = { [K in keyof VoiceSettings]?: Partial<VoiceSettings[K]> };
interface SettingsStore extends VoiceSettings {
  set: (patch: Patch) => void;
  reset: () => void;
}
/** Jack configuration. Persisted locally; never on the bus (the bus carries live state, not config). */
export const settings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (patch) =>
        set((s) => ({
          tts: { ...s.tts, ...patch.tts },
          brain: { ...s.brain, ...patch.brain },
          coach: { ...s.coach, ...patch.coach },
        })),
      reset: () => set({ ...DEFAULT_SETTINGS }),
    }),
    { name: 'cymatyx-voice-settings', storage: createJSONStorage(() => localStorage), partialize: (s) => ({ tts: s.tts, brain: s.brain, coach: s.coach }) },
  ),
);
export const useSettings = settings;
```

- [ ] **Step 3: Test** — `tests/voice/settings.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { settings, DEFAULT_SETTINGS } from '../../src/voice/settings';

describe('voice settings', () => {
  beforeEach(() => settings.getState().reset());
  it('defaults point at local jacks only', () => {
    const s = settings.getState();
    expect(s.tts.baseUrl).toMatch(/^http:\/\/localhost/);
    expect(s.brain.baseUrl).toMatch(/^http:\/\/localhost/);
    expect(s.brain.mode).toBe('fixed');
  });
  it('set merges per section and persists to localStorage', () => {
    settings.getState().set({ tts: { voice: 'am_adam' }, brain: { mode: 'llm' } });
    const s = settings.getState();
    expect(s.tts.voice).toBe('am_adam');
    expect(s.tts.baseUrl).toBe(DEFAULT_SETTINGS.tts.baseUrl);
    expect(s.brain.mode).toBe('llm');
    expect(JSON.parse(localStorage.getItem('cymatyx-voice-settings')!).state.tts.voice).toBe('am_adam');
  });
});
```

- [ ] **Step 4:** `npx vitest run tests/voice tests/bus` → pass. Commit: `feat(voice): bus signals + persisted jack settings`.

---

### Task 2: Template lines + validation

**Files:** create `src/voice/lines.ts`; test `tests/voice/lines.test.ts`

- [ ] **Step 1: Implement** — `src/voice/lines.ts`:

```ts
import type { Goal } from '../bus/types';

export type CoachEvent = 'calibration_start' | 'first_lock' | 'active_start' | 'band_change' | 'checkin' | 'session_end' | 'test';
export type Band = 'low' | 'mid' | 'high';
export type Trend = 'rising' | 'falling' | 'flat' | 'unknown';

/** Everything the coach may speak about, captured at the instant of an event. Nulls are never verbalized. */
export interface Moment {
  event: CoachEvent;
  goal: Goal;
  minutes: number;
  bpm: number | null;
  hrv: number | null;
  coherence: number | null;
  breath_rate: number | null;
  rsa_baseline: number | null;
  band: Band | null;
  trend: Trend;
  avgBpm?: number | null;
  peakCoherence?: number | null;
}

export const BANNED = [/\bcure/i, /\bheal/i, /diagnos/i, /disease/i, /\btreat/i, /medical/i, /guarantee/i, /anxiety/i, /depress/i];
export const MAX_WORDS = 30;

const pick = <T,>(arr: T[], variant: number) => arr[Math.abs(variant) % arr.length];
const n = (v: number | null, d = 0) => (v === null ? null : v.toFixed(d));

/** Fixed lines, per event × band. Numbers present appear; nulls are simply left out. */
export function templateLine(m: Moment, variant = 0): string {
  const bpm = n(m.bpm);
  const coh = n(m.coherence);
  const tail = m.band === 'high' ? 'Stay right there.' : m.band === 'mid' ? 'Keep the breath long.' : 'No rush — follow the ring and let it come.';
  switch (m.event) {
    case 'calibration_start':
      return pick(["Breathe with the ring. Slow in, slow out. I'm listening for your pulse.", 'Let the ring set your pace. In as it grows, out as it shrinks. I am listening for your pulse.'], variant);
    case 'first_lock':
      return bpm ? pick([`Got you — ${bpm} beats a minute. Keep breathing with the ring.`, `There's your pulse, ${bpm} a minute. Stay with the ring.`], variant) : 'I have your pulse. Keep breathing with the ring.';
    case 'active_start': {
      const rsa = n(m.rsa_baseline, 1);
      return rsa && Number(rsa) > 0 ? `Calibration done. Your breath moves your heart by about ${rsa} beats. Let's settle in.` : "Calibration done. Let's settle in.";
    }
    case 'band_change':
      if (coh === null) return tail;
      if (m.band === 'high') return pick([`Coherence ${coh} — that's a clean rhythm. ${tail}`, `${coh} coherence. Beautiful. ${tail}`], variant);
      if (m.band === 'mid') return `Coherence ${coh}${m.trend === 'rising' ? ' and rising' : m.trend === 'falling' ? ', easing back' : ''}. ${tail}`;
      return `Coherence ${coh}. ${tail}`;
    case 'checkin': {
      const mins = `${Math.max(1, Math.round(m.minutes))} minute${Math.round(m.minutes) === 1 ? '' : 's'} in.`;
      if (!bpm) return `${mins} I lost the pulse for a moment — face the camera and keep breathing.`;
      return `${mins} Heart ${bpm}${coh !== null ? `, coherence ${coh}` : ''}. ${tail}`;
    }
    case 'session_end': {
      const parts = ['Session complete.'];
      if (m.avgBpm) parts.push(`Average heart rate ${Math.round(m.avgBpm)}.`);
      if (m.peakCoherence) parts.push(`Peak coherence ${Math.round(m.peakCoherence)}.`);
      parts.push('Well done.');
      return parts.join(' ');
    }
    case 'test':
      return 'Voice jack test. If you can hear this, the coach can speak.';
  }
}

/** A line is honest if it is short, makes no banned claims, and every number in it is a number from the moment. */
export function validateLine(text: string, m: Moment): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length || words.length > MAX_WORDS) return false;
  if (BANNED.some((re) => re.test(text))) return false;
  const allowed = new Set<string>();
  for (const v of [m.bpm, m.hrv, m.coherence, m.breath_rate, m.rsa_baseline, m.avgBpm ?? null, m.peakCoherence ?? null])
    if (v !== null && v !== undefined) for (const d of [0, 1]) allowed.add(v.toFixed(d));
  allowed.add(String(Math.round(m.minutes)));
  allowed.add(String(Math.max(1, Math.round(m.minutes))));
  const numbers = text.match(/\d+(?:\.\d+)?/g) ?? [];
  return numbers.every((x) => allowed.has(x) || allowed.has(Number(x).toFixed(0)) || allowed.has(Number(x).toFixed(1)));
}
```

- [ ] **Step 2: Test** — `tests/voice/lines.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { templateLine, validateLine, type Moment, type CoachEvent, type Band } from '../../src/voice/lines';

const base: Moment = { event: 'checkin', goal: 'RELAXATION', minutes: 3, bpm: 68, hrv: 42, coherence: 55, breath_rate: 10, rsa_baseline: 6.5, band: 'mid', trend: 'rising' };
const EVENTS: CoachEvent[] = ['calibration_start', 'first_lock', 'active_start', 'band_change', 'checkin', 'session_end', 'test'];
const BANDS: (Band | null)[] = ['low', 'mid', 'high', null];

describe('template lines', () => {
  it('every event × band yields a valid, honest line', () => {
    for (const event of EVENTS)
      for (const band of BANDS)
        for (const variant of [0, 1]) {
          const m = { ...base, event, band, avgBpm: 70, peakCoherence: 80 };
          const line = templateLine(m, variant);
          expect(line.length).toBeGreaterThan(5);
          expect(validateLine(line, m), `${event}/${band}: ${line}`).toBe(true);
        }
  });
  it('speaks the numbers it has and never the ones it lacks', () => {
    expect(templateLine({ ...base, event: 'first_lock' })).toContain('68');
    const noBpm = templateLine({ ...base, event: 'checkin', bpm: null, coherence: null });
    expect(noBpm).not.toMatch(/\d+ (beats|coherence)/);
    expect(noBpm).not.toContain('--');
    expect(templateLine({ ...base, event: 'session_end', avgBpm: null, peakCoherence: null })).toBe('Session complete. Well done.');
  });
  it('validateLine rejects invented numbers, banned claims and rambling', () => {
    expect(validateLine('Your heart is at 68 and coherence 55.', base)).toBe(true);
    expect(validateLine('Your heart is at 72.', base)).toBe(false);
    expect(validateLine('This will cure your stress.', base)).toBe(false);
    expect(validateLine(Array(31).fill('word').join(' '), base)).toBe(false);
    expect(validateLine('', base)).toBe(false);
  });
});
```

- [ ] **Step 3:** run → pass. Commit: `feat(voice): template lines + honesty validator`.

---

### Task 3: TTS + brain clients

**Files:** create `src/voice/tts.ts`, `src/voice/brain.ts`; tests `tests/voice/tts.test.ts`, `tests/voice/brain.test.ts`

- [ ] **Step 1:** `src/voice/tts.ts`:

```ts
export interface TtsConfig { baseUrl: string; model: string; voice: string }
const trim = (u: string) => u.replace(/\/+$/, '');
const ids = (list: unknown): string[] =>
  (Array.isArray(list) ? list : []).map((x) => (typeof x === 'string' ? x : ((x as { id?: string; name?: string }).id ?? (x as { name?: string }).name ?? ''))).filter(Boolean);

/** GET /models + /audio/voices (Kokoro-FastAPI shapes: {data:[{id}]} and {voices:[...]}). */
export async function discoverTts(baseUrl: string, signal?: AbortSignal): Promise<{ models: string[]; voices: string[] }> {
  const base = trim(baseUrl);
  const [m, v] = await Promise.all([fetch(`${base}/models`, { signal }), fetch(`${base}/audio/voices`, { signal })]);
  if (!m.ok) throw new Error(`TTS models: HTTP ${m.status}`);
  if (!v.ok) throw new Error(`TTS voices: HTTP ${v.status}`);
  const mj = (await m.json()) as { data?: unknown; models?: unknown };
  const vj = (await v.json()) as { voices?: unknown } | unknown[];
  return { models: ids(mj.data ?? mj.models), voices: ids(Array.isArray(vj) ? vj : vj.voices) };
}

/** POST /audio/speech → audio Blob. */
export async function synthesize(cfg: TtsConfig, text: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(`${trim(cfg.baseUrl)}/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: cfg.model, voice: cfg.voice, input: text, response_format: 'mp3' }),
    signal,
  });
  if (!res.ok) throw new Error(`TTS speech: HTTP ${res.status}`);
  return res.blob();
}
```

- [ ] **Step 2:** `src/voice/brain.ts`:

```ts
import type { Moment } from './lines';

export interface BrainConfig { baseUrl: string; model: string }
const trim = (u: string) => u.replace(/\/+$/, '');

export const SYSTEM_PROMPT = [
  'You are the coach voice inside Cymatyx, a biofeedback instrument that reads heart rate from a webcam.',
  'You receive one JSON "moment" with live numbers. Reply with ONE sentence, at most 25 words, plain text, no quotes, no emoji.',
  'Only mention numbers that appear in the moment; never invent, round or estimate; never mention a value that is null.',
  'No medical, health-outcome or diagnostic claims of any kind.',
  'Tone by band: low = steady and unhurried, no judgment; mid = encouraging; high = quiet affirmation.',
  'Events: calibration_start = ask them to breathe with the ring; first_lock = say you have their pulse; active_start = settle in;',
  'band_change = acknowledge the change; checkin = brief status; session_end = brief close using avgBpm and peakCoherence.',
].join(' ');

/** GET /models → ids (Ollama and LM Studio both answer the OpenAI shape). */
export async function discoverModels(baseUrl: string, signal?: AbortSignal): Promise<string[]> {
  const res = await fetch(`${trim(baseUrl)}/models`, { signal });
  if (!res.ok) throw new Error(`Brain models: HTTP ${res.status}`);
  const j = (await res.json()) as { data?: { id: string }[] };
  return (j.data ?? []).map((m) => m.id).filter(Boolean);
}

/** POST /chat/completions → one line of text (unvalidated; the coach validates). */
export async function generateLine(cfg: BrainConfig, moment: Moment, signal?: AbortSignal): Promise<string> {
  const res = await fetch(`${trim(cfg.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(moment) },
      ],
      temperature: 0.7,
      max_tokens: 60,
      stream: false,
    }),
    signal,
  });
  if (!res.ok) throw new Error(`Brain: HTTP ${res.status}`);
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = (j.choices?.[0]?.message?.content ?? '').trim().replace(/^["'“”]+|["'“”]+$/g, '').split('\n')[0].trim();
  if (!text) throw new Error('Brain: empty reply');
  return text;
}
```

- [ ] **Step 3: Tests** (mocked `fetch`):

```ts
// tests/voice/tts.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { discoverTts, synthesize } from '../../src/voice/tts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('tts jack', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('discovers Kokoro-shaped models and voices', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.endsWith('/models') ? json({ data: [{ id: 'kokoro' }, { id: 'tts-1' }] }) : json({ voices: ['af_sky', 'am_adam'] }))));
    const d = await discoverTts('http://localhost:8880/v1/');
    expect(d.models).toEqual(['kokoro', 'tts-1']);
    expect(d.voices).toEqual(['af_sky', 'am_adam']);
  });
  it('rejects on HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 500)));
    await expect(discoverTts('http://x/v1')).rejects.toThrow(/HTTP 500/);
  });
  it('posts the OpenAI speech body and returns a blob', async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => { calls.push({ url, body: JSON.parse(String(init.body)) }); return new Response(new Uint8Array([1, 2, 3]), { status: 200 }); }));
    const blob = await synthesize({ baseUrl: 'http://localhost:8880/v1', model: 'kokoro', voice: 'af_sky' }, 'hello');
    expect(calls[0].url).toBe('http://localhost:8880/v1/audio/speech');
    expect(calls[0].body).toMatchObject({ model: 'kokoro', voice: 'af_sky', input: 'hello' });
    expect(blob.size).toBe(3);
  });
});
```

```ts
// tests/voice/brain.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { discoverModels, generateLine } from '../../src/voice/brain';
import type { Moment } from '../../src/voice/lines';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const moment: Moment = { event: 'checkin', goal: 'FOCUS', minutes: 2, bpm: 70, hrv: null, coherence: 61, breath_rate: 6, rsa_baseline: null, band: 'mid', trend: 'flat' };

describe('brain jack', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('lists models from the OpenAI shape', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ data: [{ id: 'llama3' }, { id: 'qwen' }] })));
    expect(await discoverModels('http://localhost:11434/v1')).toEqual(['llama3', 'qwen']);
  });
  it('sends the moment and returns the first line, unquoted', async () => {
    let body: { messages: { role: string; content: string }[] } | null = null;
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return json({ choices: [{ message: { content: '"Two minutes in, heart 70, coherence 61 — keep the breath long."\nSecond line' } }] }); }));
    const line = await generateLine({ baseUrl: 'http://localhost:11434/v1', model: 'llama3' }, moment);
    expect(line).toBe('Two minutes in, heart 70, coherence 61 — keep the breath long.');
    expect(body!.messages[0].role).toBe('system');
    expect(JSON.parse(body!.messages[1].content)).toMatchObject({ bpm: 70, coherence: 61 });
  });
  it('rejects on empty reply and on abort', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ choices: [{ message: { content: '' } }] })));
    await expect(generateLine({ baseUrl: 'http://x/v1', model: 'm' }, moment)).rejects.toThrow(/empty/);
    vi.stubGlobal('fetch', vi.fn((_u: string, init: RequestInit) => new Promise((_, rej) => init.signal?.addEventListener('abort', () => rej(new Error('aborted'))))));
    await expect(generateLine({ baseUrl: 'http://x/v1', model: 'm' }, moment, AbortSignal.timeout(10))).rejects.toThrow();
  });
});
```

- [ ] **Step 4:** run → pass. Commit: `feat(voice): OpenAI-compatible TTS and brain jack clients`.

---

### Task 4: Player + probe + the coach

**Files:** create `src/voice/player.ts`, `src/voice/probe.ts`, `src/voice/coach.ts`; test `tests/voice/coach.test.ts`

- [ ] **Step 1:** `src/voice/player.ts`:

```ts
export interface Player {
  play(blob: Blob): Promise<void>;
  stop(): void;
  readonly playing: boolean;
}

/** One <audio> at a time. play() resolves when playback ends or is stopped; rejects if the element errors. */
export function createPlayer(): Player {
  let el: HTMLAudioElement | null = null;
  let url: string | null = null;
  let finish: (() => void) | null = null;
  const cleanup = () => {
    if (el) { el.pause(); el.removeAttribute('src'); el.load(); }
    if (url) URL.revokeObjectURL(url);
    el = null; url = null;
    const f = finish; finish = null; f?.();
  };
  return {
    get playing() { return el !== null; },
    async play(blob) {
      cleanup();
      const a = new Audio();
      url = URL.createObjectURL(blob);
      a.src = url;
      el = a;
      await new Promise<void>((resolve, reject) => {
        finish = resolve;
        a.onended = () => cleanup();
        a.onerror = () => { cleanup(); reject(new Error('audio playback failed')); };
        a.play().catch((e) => { cleanup(); reject(e instanceof Error ? e : new Error(String(e))); });
      });
    },
    stop: cleanup,
  };
}
```

- [ ] **Step 2:** `src/voice/probe.ts`:

```ts
import { bus } from '../bus/store';
import { settings } from './settings';
import { discoverTts } from './tts';
import { discoverModels } from './brain';

/** Discovery → lamps. A lamp is 'ok' only because the server answered. Returns the lists for the jacks. */
export async function probeTts(): Promise<{ models: string[]; voices: string[] } | null> {
  const s = settings.getState().tts;
  if (!s.enabled) { bus.getState().set('tts_status', 'off'); return null; }
  try {
    const d = await discoverTts(s.baseUrl, AbortSignal.timeout(5000));
    bus.getState().set('tts_status', 'ok');
    return d;
  } catch (e) {
    bus.getState().patch({ tts_status: 'error', last_error: `Voice jack: ${e instanceof Error ? e.message : String(e)}` });
    return null;
  }
}

export async function probeBrain(): Promise<string[] | null> {
  const s = settings.getState().brain;
  if (s.mode !== 'llm') { bus.getState().set('brain_status', 'off'); return null; }
  try {
    const models = await discoverModels(s.baseUrl, AbortSignal.timeout(5000));
    bus.getState().set('brain_status', 'ok');
    return models;
  } catch (e) {
    bus.getState().patch({ brain_status: 'error', last_error: `Brain jack: ${e instanceof Error ? e.message : String(e)} (LM Studio: enable CORS in server settings)` });
    return null;
  }
}
```

- [ ] **Step 3:** `src/voice/coach.ts`:

```ts
import { bus } from '../bus/store';
import type { BusSignals, SessionState } from '../bus/types';
import { settings, type VoiceSettings } from './settings';
import { templateLine, validateLine, type Band, type Moment, type Trend, type CoachEvent } from './lines';
import { generateLine as brainGenerate } from './brain';
import { synthesize as ttsSynthesize } from './tts';
import { createPlayer, type Player } from './player';
import type { SessionRecord } from '../session/db';

export const MIN_GAP_MS = 40_000;
export const BRAIN_TIMEOUT_MS = 8_000;
export const TTS_TIMEOUT_MS = 15_000;
const BAND_LOW = 40;
const BAND_HIGH = 70;
const HYST = 5;

export interface CoachDeps {
  settings?: () => VoiceSettings;
  brain?: (m: Moment, signal: AbortSignal) => Promise<string>;
  tts?: (text: string, signal: AbortSignal) => Promise<Blob>;
  player?: Player;
  now?: () => number;
  variant?: () => number;
}

/** The listener. Reads the bus, never modulates audio params; speaks only about bus values. */
export function createCoach(deps: CoachDeps = {}) {
  const getSettings = deps.settings ?? (() => settings.getState());
  const now = deps.now ?? Date.now;
  const player = deps.player ?? createPlayer();
  const brain = deps.brain ?? ((m, signal) => brainGenerate(getSettings().brain, m, signal));
  const tts = deps.tts ?? ((text, signal) => ttsSynthesize(getSettings().tts, text, signal));
  let variantCounter = 0;
  const variant = deps.variant ?? (() => variantCounter++);

  let unsub: (() => void) | null = null;
  let checkin = 0;
  let startedAt = 0;
  let lastSpokeAt = -Infinity;
  let lastCoherence: number | null = null;
  let band: Band | null = null;
  let locked = false;
  let busy = false;
  let pending: Moment | null = null;

  const bandOf = (c: number | null, prev: Band | null): Band | null => {
    if (c === null) return prev;
    if (prev === 'high') return c < BAND_HIGH - HYST ? (c < BAND_LOW ? 'low' : 'mid') : 'high';
    if (prev === 'low') return c >= BAND_LOW + HYST ? (c >= BAND_HIGH ? 'high' : 'mid') : 'low';
    if (prev === 'mid') return c >= BAND_HIGH + HYST ? 'high' : c < BAND_LOW - HYST ? 'low' : 'mid';
    return c >= BAND_HIGH ? 'high' : c >= BAND_LOW ? 'mid' : 'low';
  };

  const moment = (event: CoachEvent, extra: Partial<Moment> = {}): Moment => {
    const s = bus.getState().signals;
    const trend: Trend = s.coherence === null || lastCoherence === null ? 'unknown' : s.coherence - lastCoherence > 5 ? 'rising' : lastCoherence - s.coherence > 5 ? 'falling' : 'flat';
    return { event, goal: s.goal, minutes: startedAt ? (now() - startedAt) / 60_000 : 0, bpm: s.bpm, hrv: s.hrv_rmssd, coherence: s.coherence, breath_rate: s.breath_rate, rsa_baseline: s.rsa_baseline, band, trend, ...extra };
  };

  async function compose(m: Moment): Promise<string | null> {
    const mode = getSettings().brain.mode;
    if (mode === 'off') return null;
    if (mode === 'llm') {
      try {
        const line = await brain(m, AbortSignal.timeout(BRAIN_TIMEOUT_MS));
        if (validateLine(line, m)) return line;
      } catch {
        /* fall through to the template */
      }
    }
    return templateLine(m, variant());
  }

  async function speak(text: string): Promise<void> {
    bus.getState().set('coach_last_line', text);
    const s = getSettings().tts;
    if (!s.enabled || bus.getState().signals.tts_status !== 'ok') return;
    try {
      const blob = await tts(text, AbortSignal.timeout(TTS_TIMEOUT_MS));
      bus.getState().set('coach_speaking', true);
      await player.play(blob);
    } catch (e) {
      bus.getState().patch({ tts_status: 'error', last_error: `Voice jack: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      bus.getState().set('coach_speaking', false);
    }
  }

  /** Rate-limited entry point for events. A newer pending moment replaces an older one; nothing interrupts a line in progress. */
  async function say(m: Moment, force = false): Promise<void> {
    if (!bus.getState().signals.coach_enabled || !getSettings().coach.enabled) return;
    if (!force && now() - lastSpokeAt < MIN_GAP_MS) return;
    if (busy) { pending = m; return; }
    busy = true;
    try {
      const line = await compose(m);
      if (line) {
        lastSpokeAt = now();
        if (m.coherence !== null) lastCoherence = m.coherence;
        await speak(line);
      }
    } finally {
      busy = false;
      const next = pending;
      pending = null;
      if (next) void say(next);
    }
  }

  function onBus(s: BusSignals, prev: BusSignals) {
    const state: SessionState = s.session_state;
    if (state !== prev.session_state) {
      if (state === 'calibrating') void say(moment('calibration_start'), true);
      if (state === 'active') {
        void say(moment('active_start'), true);
        clearInterval(checkin);
        checkin = window.setInterval(() => void say(moment('checkin')), Math.max(15, getSettings().coach.intervalS) * 1000);
      }
      if (state !== 'active') { clearInterval(checkin); checkin = 0; }
    }
    if (!locked && s.bpm !== null && prev.bpm === null && (state === 'calibrating' || state === 'active')) {
      locked = true;
      void say(moment('first_lock'), true);
    }
    const nb = bandOf(s.coherence, band);
    if (nb !== band) {
      const had = band !== null;
      band = nb;
      if (had && state === 'active') void say(moment('band_change'));
    }
  }

  return {
    start() {
      startedAt = now();
      lastSpokeAt = -Infinity;
      lastCoherence = null;
      band = null;
      locked = false;
      pending = null;
      unsub?.();
      let prev = bus.getState().signals;
      unsub = bus.subscribe((st) => { const cur = st.signals; if (cur !== prev) { const p = prev; prev = cur; onBus(cur, p); } });
    },
    stop() {
      unsub?.();
      unsub = null;
      clearInterval(checkin);
      checkin = 0;
      pending = null;
    },
    /** Spoken after the record exists; uses the record's numbers, not the (now dark) live bus. */
    sessionEnd(rec: SessionRecord) {
      return say(moment('session_end', { avgBpm: rec.avgBpm, peakCoherence: rec.peakCoherence, minutes: rec.duration / 60 }), true);
    },
    test: () => say(moment('test'), true),
    say,
    get player() { return player; },
  };
}
export type Coach = ReturnType<typeof createCoach>;
```

- [ ] **Step 4: Test** — `tests/voice/coach.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { bus } from '../../src/bus/store';
import { createCoach, MIN_GAP_MS } from '../../src/voice/coach';
import { DEFAULT_SETTINGS, type VoiceSettings } from '../../src/voice/settings';
import type { Player } from '../../src/voice/player';

function harness(over: Partial<VoiceSettings> = {}, brainImpl?: (m: unknown) => Promise<string>) {
  const cfg: VoiceSettings = { ...DEFAULT_SETTINGS, ...over };
  const spoken: string[] = [];
  const played: number[] = [];
  let t = 0;
  const player: Player = { playing: false, play: async (b) => { played.push(b.size); }, stop: () => {} };
  const coach = createCoach({
    settings: () => cfg,
    now: () => t,
    variant: () => 0,
    brain: brainImpl ? (m) => brainImpl(m) : undefined,
    tts: async (text) => { spoken.push(text); return new Blob([new Uint8Array(3)]); },
    player,
  });
  return { coach, spoken, played, cfg, tick: (ms: number) => { t += ms; vi.advanceTimersByTime(ms); } };
}
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

describe('coach', () => {
  beforeEach(() => { bus.getState().reset(); bus.getState().set('tts_status', 'ok'); vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it('speaks calibration, first lock, active start, band change, check-in, session end — in that order', async () => {
    const h = harness({ coach: { enabled: true, intervalS: 60 } });
    h.coach.start();
    bus.getState().set('session_state', 'calibrating'); await flush();
    bus.getState().set('bpm', 68); await flush();
    bus.getState().patch({ session_state: 'active', rsa_baseline: 6 }); await flush();
    bus.getState().set('coherence', 30); await flush();          // first band: no line
    h.tick(MIN_GAP_MS + 1);
    bus.getState().set('coherence', 80); await flush();          // low → high
    h.tick(60_000); await flush();                               // check-in
    h.coach.stop();
    await h.coach.sessionEnd({ goal: 'FOCUS', startedAt: 0, duration: 300, avgBpm: 70, avgHrv: 40, peakCoherence: 80, samples: 5, rsaBaseline: 6, series: [] });
    expect(h.spoken.map((l) => l.split(' ').slice(0, 2).join(' '))).toEqual(['Breathe with', 'Got you', 'Calibration done.', 'Coherence 80', '5 minutes', 'Session complete.']);
    expect(h.spoken[1]).toContain('68');
    expect(h.spoken.at(-1)).toContain('70');
    expect(h.played.length).toBe(6);
    expect(bus.getState().signals.coach_last_line).toBe(h.spoken.at(-1));
  });

  it('rate-limits non-forced lines and keeps only the newest pending one', async () => {
    const h = harness();
    h.coach.start();
    bus.getState().patch({ session_state: 'active', coherence: 50 }); await flush();
    const n = h.spoken.length;
    bus.getState().set('coherence', 80); await flush();          // within 40 s of active_start → dropped
    expect(h.spoken.length).toBe(n);
    h.tick(MIN_GAP_MS + 1);
    bus.getState().set('coherence', 30); await flush();          // allowed
    expect(h.spoken.length).toBe(n + 1);
    h.coach.stop();
  });

  it('falls back to the template when the LLM is slow or dishonest', async () => {
    const h = harness({ brain: { mode: 'llm', baseUrl: 'http://x', model: 'm' } }, async () => 'Your heart is at 99 and this will cure you.');
    h.coach.start();
    bus.getState().set('session_state', 'calibrating'); await flush();
    expect(h.spoken[0]).toMatch(/^Breathe with the ring/);
    h.coach.stop();
  });

  it('uses the LLM line when it is honest', async () => {
    const h = harness({ brain: { mode: 'llm', baseUrl: 'http://x', model: 'm' } }, async () => 'Breathe slowly with the ring, I am listening.');
    h.coach.start();
    bus.getState().set('session_state', 'calibrating'); await flush();
    expect(h.spoken[0]).toBe('Breathe slowly with the ring, I am listening.');
    h.coach.stop();
  });

  it('coach disabled → silent; TTS off → line shown but not played', async () => {
    const h1 = harness({ coach: { enabled: false, intervalS: 90 } });
    h1.coach.start();
    bus.getState().set('session_state', 'calibrating'); await flush();
    expect(h1.spoken).toEqual([]);
    expect(bus.getState().signals.coach_last_line).toBeNull();
    h1.coach.stop();
    bus.getState().reset(); bus.getState().set('tts_status', 'ok');
    const h2 = harness({ tts: { ...DEFAULT_SETTINGS.tts, enabled: false } });
    h2.coach.start();
    bus.getState().set('session_state', 'calibrating'); await flush();
    expect(h2.spoken).toEqual([]);
    expect(bus.getState().signals.coach_last_line).toMatch(/Breathe/);
    h2.coach.stop();
  });

  it('a TTS failure lights the error lamp and keeps the line on the strip', async () => {
    const h = harness();
    const coach = createCoach({ settings: () => h.cfg, now: () => 0, variant: () => 0, tts: async () => { throw new Error('HTTP 500'); }, player: { playing: false, play: async () => {}, stop: () => {} } });
    coach.start();
    bus.getState().set('session_state', 'calibrating'); await flush();
    expect(bus.getState().signals.tts_status).toBe('error');
    expect(bus.getState().signals.coach_last_line).toMatch(/Breathe/);
    expect(bus.getState().signals.coach_speaking).toBe(false);
    coach.stop();
  });
});
```

- [ ] **Step 5:** run → pass. Commit: `feat(voice): the coach — bus listener, rate limit, LLM→template fallback, TTS playback`.

---

### Task 5: Mock providers (dev-only Vite middleware)

**Files:** modify `vite.config.ts`

- [ ] **Step 1:**

```ts
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** 0.3 s 440 Hz mono 16-bit WAV, generated in code — the e2e fake voice. */
function beepWav(): Buffer {
  const sr = 8000, n = Math.round(sr * 0.3);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / sr) * 8000), 44 + i * 2);
  return buf;
}

/** Dev-only fake TTS + LLM under /mock/v1 so the smoke test never needs a real server. */
function mockProviders(): Plugin {
  return {
    name: 'cymatyx-mock-providers',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/mock/v1', (req, res) => {
        const send = (status: number, body: unknown, type = 'application/json') => { res.statusCode = status; res.setHeader('Content-Type', type); res.end(type === 'application/json' ? JSON.stringify(body) : (body as Buffer)); };
        const url = (req.url ?? '').split('?')[0];
        if (url === '/models') return send(200, { data: [{ id: 'mock-model' }, { id: 'kokoro' }] });
        if (url === '/audio/voices') return send(200, { voices: ['af_sky', 'am_adam'] });
        if (url === '/audio/speech') return send(200, beepWav(), 'audio/wav');
        if (url === '/chat/completions') return send(200, { choices: [{ message: { content: 'Mock brain says: breathe with the ring.' } }] });
        send(404, { error: 'unknown mock route' });
      });
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), react(), mockProviders()],
  server: { port: 3000, host: '0.0.0.0' },
  worker: { format: 'es' },
});
```

- [ ] **Step 2:** `curl localhost:3000/mock/v1/models` → JSON. Commit: `chore(dev): mock TTS/LLM providers under /mock/v1`.

---

### Task 6: Rack jacks + front strip

**Files:** create `src/ui/instruments/VoiceJack.tsx`, `BrainJack.tsx`, `CoachModule.tsx`, `CoachStrip.tsx`; modify `RackBack.tsx`, `Rack.tsx`; test `tests/ui/jacks.test.tsx`

- [ ] **Step 1:** shared bits in `src/ui/instruments/jack.tsx`:

```tsx
import type { ReactNode } from 'react';
export function Lamp({ status, label }: { status: 'off' | 'ok' | 'error'; label: string }) {
  const color = status === 'ok' ? 'bg-ok text-ok' : status === 'error' ? 'bg-red text-red' : 'led-off';
  return (
    <span className="flex items-center gap-1.5" role="status" aria-label={`${label} ${status}`} data-status={status}>
      <span className={`led ${color}`} />
      <span className="label">{status}</span>
    </span>
  );
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="label" style={{ color: 'var(--color-nixie-dim)' }}>{label}</span>
      {children}
    </label>
  );
}
export const inputClass = 'jack-select';
```

- [ ] **Step 2:** `VoiceJack.tsx`:

```tsx
import { useState } from 'react';
import { useSettings, settings } from '../../voice/settings';
import { useSignal } from '../../bus/useSignal';
import { probeTts } from '../../voice/probe';
import { synthesize } from '../../voice/tts';
import { createPlayer } from '../../voice/player';
import { templateLine } from '../../voice/lines';
import { bus } from '../../bus/store';
import { Lamp, Field, inputClass } from './jack';

const player = createPlayer();

export function VoiceJack() {
  const tts = useSettings((s) => s.tts);
  const status = useSignal('tts_status');
  const [lists, setLists] = useState<{ models: string[]; voices: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const fetchLists = async () => { setBusy(true); setLists(await probeTts()); setBusy(false); };
  const test = async () => {
    setBusy(true);
    try {
      const line = templateLine({ event: 'test', goal: 'RELAXATION', minutes: 0, bpm: null, hrv: null, coherence: null, breath_rate: null, rsa_baseline: null, band: null, trend: 'unknown' });
      bus.getState().set('coach_last_line', line);
      await player.play(await synthesize(tts, line, AbortSignal.timeout(15000)));
      bus.getState().set('tts_status', 'ok');
    } catch (e) {
      bus.getState().patch({ tts_status: 'error', last_error: `Voice jack: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };
  return (
    <section className="module space-y-3" aria-label="Voice jack">
      <div className="flex justify-between items-center"><span className="tape">Voice jack — TTS</span><Lamp status={status} label="voice" /></div>
      <label className="flex items-center gap-2"><input type="checkbox" checked={tts.enabled} onChange={(e) => { settings.getState().set({ tts: { enabled: e.target.checked } }); if (!e.target.checked) bus.getState().set('tts_status', 'off'); }} /><span className="label">Enabled</span></label>
      <Field label="Server (OpenAI-compatible /v1)"><input className={inputClass} value={tts.baseUrl} onChange={(e) => settings.getState().set({ tts: { baseUrl: e.target.value } })} onBlur={fetchLists} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Model"><select className={inputClass} value={tts.model} onChange={(e) => settings.getState().set({ tts: { model: e.target.value } })}>{[tts.model, ...(lists?.models ?? [])].filter((v, i, a) => v && a.indexOf(v) === i).map((m) => <option key={m} value={m}>{m}</option>)}</select></Field>
        <Field label="Voice"><select className={inputClass} value={tts.voice} onChange={(e) => settings.getState().set({ tts: { voice: e.target.value } })}>{[tts.voice, ...(lists?.voices ?? [])].filter((v, i, a) => v && a.indexOf(v) === i).map((v) => <option key={v} value={v}>{v}</option>)}</select></Field>
      </div>
      <div className="flex gap-3">
        <button type="button" className="btn-round" style={{ width: 64, height: 64 }} disabled={busy || !tts.enabled} onClick={fetchLists}>Fetch</button>
        <button type="button" className="btn-round" style={{ width: 64, height: 64 }} disabled={busy || !tts.enabled} onClick={test}>Test</button>
      </div>
    </section>
  );
}
```

- [ ] **Step 3:** `BrainJack.tsx`:

```tsx
import { useState } from 'react';
import { useSettings, settings, type BrainMode } from '../../voice/settings';
import { useSignal } from '../../bus/useSignal';
import { probeBrain } from '../../voice/probe';
import { generateLine } from '../../voice/brain';
import { validateLine, type Moment } from '../../voice/lines';
import { bus } from '../../bus/store';
import { Lamp, Field, inputClass } from './jack';

const MODES: { id: BrainMode; label: string }[] = [{ id: 'off', label: 'OFF' }, { id: 'fixed', label: 'FIXED LINES' }, { id: 'llm', label: 'LLM' }];
const TEST_MOMENT: Moment = { event: 'checkin', goal: 'FOCUS', minutes: 2, bpm: 70, hrv: 45, coherence: 62, breath_rate: 6, rsa_baseline: null, band: 'mid', trend: 'rising' };

export function BrainJack() {
  const brain = useSettings((s) => s.brain);
  const status = useSignal('brain_status');
  const [models, setModels] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fetchModels = async () => { setBusy(true); const m = await probeBrain(); if (m) { setModels(m); if (!brain.model && m[0]) settings.getState().set({ brain: { model: m[0] } }); } setBusy(false); };
  const test = async () => {
    setBusy(true); setResult(null);
    try {
      const line = await generateLine(brain, TEST_MOMENT, AbortSignal.timeout(8000));
      setResult(validateLine(line, TEST_MOMENT) ? line : `REJECTED (dishonest or too long): ${line}`);
      bus.getState().set('brain_status', 'ok');
    } catch (e) {
      setResult(null);
      bus.getState().patch({ brain_status: 'error', last_error: `Brain jack: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(false); }
  };
  return (
    <section className="module space-y-3" aria-label="Brain jack">
      <div className="flex justify-between items-center"><span className="tape">Brain jack — LLM</span><Lamp status={status} label="brain" /></div>
      <div role="group" aria-label="Brain mode" className="flex gap-2">
        {MODES.map((m) => <button key={m.id} type="button" className="btn-round" style={{ width: 64, height: 64, fontSize: 8 }} aria-pressed={brain.mode === m.id} onClick={() => { settings.getState().set({ brain: { mode: m.id } }); if (m.id !== 'llm') bus.getState().set('brain_status', 'off'); }}>{m.label}</button>)}
      </div>
      <Field label="Server (OpenAI-compatible /v1)"><input className={inputClass} value={brain.baseUrl} disabled={brain.mode !== 'llm'} onChange={(e) => settings.getState().set({ brain: { baseUrl: e.target.value } })} onBlur={fetchModels} /></Field>
      <Field label="Model (fetched from the server)"><select className={inputClass} value={brain.model} disabled={brain.mode !== 'llm'} onChange={(e) => settings.getState().set({ brain: { model: e.target.value } })}>{[brain.model, ...models].filter((v, i, a) => v && a.indexOf(v) === i).map((m) => <option key={m} value={m}>{m}</option>)}</select></Field>
      <div className="flex gap-3">
        <button type="button" className="btn-round" style={{ width: 64, height: 64 }} disabled={busy || brain.mode !== 'llm'} onClick={fetchModels}>Fetch</button>
        <button type="button" className="btn-round" style={{ width: 64, height: 64 }} disabled={busy || brain.mode !== 'llm' || !brain.model} onClick={test}>Test</button>
      </div>
      {result && <div className="glass px-3 py-2 text-sm" data-testid="brain-test-result">{result}</div>}
    </section>
  );
}
```

- [ ] **Step 4:** `CoachModule.tsx` (back) and `CoachStrip.tsx` (front):

```tsx
// CoachModule.tsx
import { useSettings, settings } from '../../voice/settings';
import { useSignal } from '../../bus/useSignal';
export function CoachModule() {
  const coach = useSettings((s) => s.coach);
  const last = useSignal('coach_last_line');
  const speaking = useSignal('coach_speaking');
  return (
    <section className="module space-y-3" aria-label="Coach">
      <div className="flex justify-between items-center"><span className="tape">Coach</span><span className="label">{speaking ? 'speaking' : 'quiet'}</span></div>
      <label className="flex items-center gap-2"><input type="checkbox" checked={coach.enabled} onChange={(e) => settings.getState().set({ coach: { enabled: e.target.checked } })} /><span className="label">Enabled</span></label>
      <label className="block space-y-1"><span className="label" style={{ color: 'var(--color-nixie-dim)' }}>Check-in every (s)</span>
        <input className="jack-select" type="number" min={15} max={600} value={coach.intervalS} onChange={(e) => settings.getState().set({ coach: { intervalS: Math.max(15, Number(e.target.value) || 90) } })} /></label>
      <div className="glass px-3 py-2 text-sm min-h-10" data-testid="coach-last-line">{last ?? '--'}</div>
    </section>
  );
}
```

```tsx
// CoachStrip.tsx
import { bus } from '../../bus/store';
import { useSignal } from '../../bus/useSignal';
export function CoachStrip() {
  const enabled = useSignal('coach_enabled');
  const last = useSignal('coach_last_line');
  const speaking = useSignal('coach_speaking');
  return (
    <div className="flex items-center gap-3" aria-label="Coach strip">
      <button type="button" className="btn-round" style={{ width: 56, height: 56, fontSize: 8 }} aria-pressed={enabled} onClick={() => bus.getState().set('coach_enabled', !enabled)}>COACH</button>
      <div className="glass flex-1 px-3 py-2 text-left text-sm min-h-10" role="status" aria-live="polite" aria-label={speaking ? 'Coach speaking' : 'Coach quiet'} data-speaking={String(speaking)} data-testid="coach-strip">{last ?? '--'}</div>
    </div>
  );
}
```

- [ ] **Step 5:** mount: in `RackBack.tsx` add a second grid row `<div className="grid md:grid-cols-3 gap-4 pt-2"><VoiceJack /><BrainJack /><CoachModule /></div>` (inside the section, after the existing grid); in `Rack.tsx` add `<CoachStrip />` under the session-state label.

- [ ] **Step 6: Test** — `tests/ui/jacks.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { bus } from '../../src/bus/store';
import { settings } from '../../src/voice/settings';
import { VoiceJack } from '../../src/ui/instruments/VoiceJack';
import { BrainJack } from '../../src/ui/instruments/BrainJack';
import { CoachStrip } from '../../src/ui/instruments/CoachStrip';

describe('jacks', () => {
  beforeEach(() => { bus.getState().reset(); settings.getState().reset(); });
  it('lamps are dark until a server answered', () => {
    render(<><VoiceJack /><BrainJack /></>);
    expect(screen.getByRole('status', { name: /voice off/i })).toHaveAttribute('data-status', 'off');
    expect(screen.getByRole('status', { name: /brain off/i })).toHaveAttribute('data-status', 'off');
    act(() => bus.getState().set('tts_status', 'ok'));
    expect(screen.getByRole('status', { name: /voice ok/i })).toBeInTheDocument();
  });
  it('brain mode latches persist to settings and reset the lamp', () => {
    render(<BrainJack />);
    fireEvent.click(screen.getByRole('button', { name: 'LLM' }));
    expect(settings.getState().brain.mode).toBe('llm');
    fireEvent.click(screen.getByRole('button', { name: 'OFF' }));
    expect(settings.getState().brain.mode).toBe('off');
    expect(bus.getState().signals.brain_status).toBe('off');
  });
  it('the strip shows exactly the last line and the mute latch writes the bus', () => {
    render(<CoachStrip />);
    expect(screen.getByTestId('coach-strip')).toHaveTextContent('--');
    act(() => bus.getState().set('coach_last_line', 'Got you — 68 beats a minute.'));
    expect(screen.getByTestId('coach-strip')).toHaveTextContent('68 beats');
    fireEvent.click(screen.getByRole('button', { name: 'COACH' }));
    expect(bus.getState().signals.coach_enabled).toBe(false);
  });
});
```

- [ ] **Step 7:** run → pass. Commit: `feat(ui): voice + brain + coach jacks on the rack back, coach strip on the front`.

---

### Task 7: Orchestrator integration + e2e + docs

**Files:** modify `src/session/orchestrate.ts`, `e2e/smoke.spec.ts`, `README.md`, plan Executed block

- [ ] **Step 1: Orchestrator** — import `createCoach`, `probeTts`, `probeBrain`; module-level `const coach = createCoach()` inside `createOrchestrator`; in `start()` after `cam_live` true: `void probeTts(); void probeBrain(); coach.start();`; in the tick, duck: `const out = { ...prev, master_gain: prev.master_gain * (s.coach_speaking ? 0.35 : 1) }; bus.patch(out); synth.setParams(out);`; in `teardown()`: `coach.stop();` (player keeps playing the current line); in `end()`: after `const rec = await session.end()` → `void coach.sessionEnd(rec)`.

- [ ] **Step 2: e2e** — in `smoke.spec.ts`, before START: point both jacks at `/mock/v1` through localStorage (`page.addInitScript` writing `cymatyx-voice-settings` with `tts.baseUrl = 'http://localhost:3000/mock/v1'`, `brain.mode='llm'`, `brain.baseUrl` same, `brain.model='mock-model'`). After START: `await expect(page.getByTestId('coach-strip')).not.toHaveText('--', { timeout: 15_000 })` once calibration starts — but calibration needs a BPM, which the fake camera cannot produce (no face). So the e2e asserts the jack path instead: after START, `tts_status` lamp reads ok (`getByRole('status', {name: /voice ok/})`) and `brain ok`; then STOP; then click the Voice jack **Test** button on the back and expect the strip to show the test line and `data-speaking` to have flipped true then false (poll). Add a second test for the Brain jack Test button → `brain-test-result` contains 'Mock brain'.

- [ ] **Step 3: Docs** — README: new "🗣 The coach" section (jacks, listener, honesty validator, fallback), numbers refresh, roadmap M2 → shipped; plan Executed block. Commit + push.

---

## Self-review

- **Spec coverage:** settings + bus (T1 §3/§4), lines + validation (T2 §5), TTS/brain clients (T3 §3), player/probe/coach incl. events, rate limit, hysteresis, fallback, ducking flag (T4 §5), mock providers (T5 §8), rack jacks + strip (T6 §6), orchestrator lifecycle + session-end line + e2e + docs (T7). Honesty (§7): validator, lamps by server answer, nulls omitted — T2/T4/T6.
- **Placeholders:** none.
- **Type consistency:** `Moment` (lines) used by brain/coach/jacks; `VoiceSettings` from settings used by coach deps; `Player` interface shared; bus signal names match `types.ts` additions; `SessionRecord` from `session/db` for `sessionEnd`.
