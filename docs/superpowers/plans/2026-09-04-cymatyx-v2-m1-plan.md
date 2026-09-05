# Cymatyx v2 — M1 "The Pure Loop" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A webcam reads heart rate / HRV / coherence and the audio adapts to it — one rack screen, one START, session saved locally. Nothing else.

**Architecture:** Everything is one signal path modeled literally: `sensor → engine (Worker) → bus ← rules → synth (AudioWorklet)`. The **bus** is a typed Zustand store of named control signals; UI components may only render bus signals (a typed hook enforces it); `null` renders as `--`. Modules are pure where possible (engine math, rules) and thin at the browser edges (camera, audio).

**Tech Stack:** React 19, Vite 6, TypeScript strict, Tailwind v4, Zustand 5, Dexie 4, @mediapipe/tasks-vision, Vitest 4 + Testing Library, Playwright. Node 26.

**Spec:** `docs/superpowers/specs/2026-09-04-cymatyx-v2-design.md`

> **Executed 2026-09-04 (inline, all tasks; actual versions: Vite 7.3, Vitest 3.2).** The shipped code differs from the
> task listings below in these deliberate ways, driven by the adversarial engine review (Codex/Astra lane, relayed by a
> Sonnet subagent) and by the first test run:
> - **SQI neighborhood = one native FFT bin (60·fps/N BPM)**, not ±1 scanned BPM — `analyzeSpectrum(sp, neighborhoodBpm)`.
> - **fps measured from window timestamps** (`HeartbeatEngine.fps`); `process(sample, method)` takes no fps arg; the worker protocol drops it.
> - **Window 240 / MIN 90** (~8 s / ~3 s) instead of 150 / 60; trig tables cached per (n, fps).
> - **AUTO hysteresis** (incumbent keeps the method unless a rival's SQI is 15 % better) and **ROI rejection** (below half the best ROI's SQI).
> - **Sub-sample peak timing** (parabolic) in `detectPeaks` → fractional indices; `rmssd` interpolates timestamps. The first run showed 29 ms of pure quantization RMSSD on regular synthetic beats.
> - Synthetic RGB model is **multiplicative** (`mean·(1+a·pulse)·(1+D·drift)`), the physics CHROM/POS assume; candidate tests compare spectral peaks, not std ratios.
> - `RoiSample.rois` is required for all three ROIs (camera always supplies them, fallback rects when the face is lost).
> - Bus gained `cam_status`, `cam_device` (two webcams on the bench), `last_error`; `reset()` keeps goal/method/camera choices.
> - Synth takes `workletUrl` from a `?worker&url` import at the App; `SubjectMonitor` owns a child-free box for the hand-mounted video (React `removeChild` crash otherwise — caught by the smoke).
> - Smoke also asserts the synth analyser reports non-zero samples (spec §9).

---

## File structure

```
src/
  bus/
    types.ts            BusSignals type — every named signal, all nullable
    store.ts            Zustand store: set/get/subscribe/snapshot
    useSignal.ts        typed React hook: useSignal('bpm') — the only way UI reads values
  engine/
    candidates.ts       GREEN / CHROM / POS candidate traces from an RGB window
    spectrum.ts         DFT power spectrum, analyzeSpectrum (SQI + parabolic peak)
    peaks.ts            R-peak detection + RMSSD
    coherence.ts        coherence score from HRV history
    engine.ts           HeartbeatEngine: window mgmt, multi-ROI fusion, process() → BioFrame
    worker.ts           Web Worker entry: RoiSample in → BioFrame out
    types.ts            RoiSample, BioFrame, RppgMethod
  sensor/
    roi.ts              landmark indices → ROI rects (forehead, cheekL, cheekR); mean RGB
    camera.ts           getUserMedia + MediaPipe FaceLandmarker + frame loop → RoiSample
  rules/
    goals.ts            goal presets (RELAXATION/FOCUS/ENERGY) → target tables
    modulate.ts         modulate(bus, goal, prev) → ParamPatch with slew limiting
  synth/
    worklet.ts          AudioWorkletProcessor: 3-layer binaural + isochronic pulse
    graph.ts            AudioContext, worklet node, analyser, setParams/start/stop
  session/
    machine.ts          idle → calibrating → active → summary; RSA calibration
    db.ts               Dexie: sessions table
  ui/
    rack/Rack.tsx       front-of-rack layout (grid of modules)
    rack/RackBack.tsx   back-of-rack: waveform, spectrum, camera, params
    instruments/*.tsx   Nixie, VuMeter, TallyLamp, GoalSelector, PowerSwitch, BreathingGuide, Scope
    world.css           the Silver Rack tokens + component classes
  App.tsx, main.tsx
tests/                  mirrors src (vitest, jsdom)
e2e/smoke.spec.ts       Playwright
```

---

### Task 0: Scaffold

**Files:**
- Create: `package.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `tests/setup.ts`, `.gitignore`

- [ ] **Step 1: Create the project**

```bash
cd P:/_projects/Cymatyx
npm create vite@latest . -- --template react-ts   # accept overwrite in the existing folder
npm i zustand dexie @mediapipe/tasks-vision
npm i -D tailwindcss @tailwindcss/vite vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom fake-indexeddb @playwright/test @types/node
```

- [ ] **Step 2: Vite + Tailwind + worker config** — `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: { port: 3000, host: '0.0.0.0' },
  worker: { format: 'es' },
});
```

- [ ] **Step 3: Vitest config + setup** — `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'jsdom', setupFiles: ['./tests/setup.ts'], globals: true, include: ['tests/**/*.test.{ts,tsx}'] },
});
```

`tests/setup.ts` (Node 26 ships an experimental `localStorage` that shadows jsdom's — provide a real one):

```ts
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k); },
    setItem: (k, v) => { m.set(String(k), String(v)); },
  };
}
if (!globalThis.localStorage) Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage(), configurable: true });
if (!globalThis.sessionStorage) Object.defineProperty(globalThis, 'sessionStorage', { value: memoryStorage(), configurable: true });
```

- [ ] **Step 4: Verify** — `npx vitest run` → "No test files found" (exit 0 with `--passWithNoTests`), `npm run build` → dist produced.

- [ ] **Step 5: Commit** — `git add package.json package-lock.json vite.config.ts vitest.config.ts tsconfig*.json index.html src/ tests/setup.ts .gitignore && git commit -m "chore: scaffold Cymatyx v2 (Vite + React 19 + TS + Tailwind v4 + Vitest)"`

---

### Task 1: The bus

**Files:**
- Create: `src/bus/types.ts`, `src/bus/store.ts`, `src/bus/useSignal.ts`
- Test: `tests/bus/store.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { bus } from '../../src/bus/store';

describe('bus', () => {
  it('starts every signal null', () => {
    expect(bus.getState().signals.bpm).toBeNull();
    expect(bus.getState().signals.cam_live).toBe(false);
  });
  it('set stamps a timestamp and notifies subscribers', () => {
    const seen: number[] = [];
    const unsub = bus.subscribe((s) => seen.push(s.signals.bpm ?? -1));
    bus.getState().set('bpm', 72.4, 1000);
    expect(bus.getState().signals.bpm).toBe(72.4);
    expect(bus.getState().stamps.bpm).toBe(1000);
    expect(seen.at(-1)).toBe(72.4);
    unsub();
  });
  it('reset returns to nulls', () => {
    bus.getState().set('hrv_rmssd', 45, 2000);
    bus.getState().reset();
    expect(bus.getState().signals.hrv_rmssd).toBeNull();
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run tests/bus` → FAIL (module not found).

- [ ] **Step 3: Implement** — `src/bus/types.ts`:

```ts
export type SessionState = 'idle' | 'warming' | 'calibrating' | 'active' | 'summary';
export type RppgMethod = 'green' | 'chrom' | 'pos' | 'auto';
export type Goal = 'RELAXATION' | 'FOCUS' | 'ENERGY';

/** Every named control signal on the bus. Measurements are null until measured. */
export interface BusSignals {
  // measured (engine)
  bpm: number | null;
  hrv_rmssd: number | null;
  coherence: number | null;      // 0..100
  sqi: number | null;            // 0..1
  confidence: number | null;     // 0..1
  engine_method: Exclude<RppgMethod, 'auto'> | null;
  // calibration
  rsa_baseline: number | null;
  // audio params (rules → synth)
  beat_hz: number | null;
  carrier_hz: number | null;
  pulse_depth: number | null;    // 0..1 isochronic depth
  master_gain: number | null;    // 0..1
  breath_rate: number | null;    // seconds per full breath
  breath_phase: 'inhale' | 'hold' | 'exhale' | null;
  // state
  cam_live: boolean;
  session_state: SessionState;
  goal: Goal;
  method_select: RppgMethod;
}

export const INITIAL_SIGNALS: BusSignals = {
  bpm: null, hrv_rmssd: null, coherence: null, sqi: null, confidence: null, engine_method: null,
  rsa_baseline: null,
  beat_hz: null, carrier_hz: null, pulse_depth: null, master_gain: null, breath_rate: null, breath_phase: null,
  cam_live: false, session_state: 'idle', goal: 'RELAXATION', method_select: 'auto',
};
```

`src/bus/store.ts`:

```ts
import { create } from 'zustand';
import { INITIAL_SIGNALS, type BusSignals } from './types';

type Stamps = Partial<Record<keyof BusSignals, number>>;

interface BusStore {
  signals: BusSignals;
  stamps: Stamps;
  set: <K extends keyof BusSignals>(name: K, value: BusSignals[K], t?: number) => void;
  patch: (values: Partial<BusSignals>, t?: number) => void;
  reset: () => void;
}

export const bus = create<BusStore>((set) => ({
  signals: { ...INITIAL_SIGNALS },
  stamps: {},
  set: (name, value, t = Date.now()) =>
    set((s) => ({ signals: { ...s.signals, [name]: value }, stamps: { ...s.stamps, [name]: t } })),
  patch: (values, t = Date.now()) =>
    set((s) => {
      const stamps = { ...s.stamps };
      for (const k of Object.keys(values) as (keyof BusSignals)[]) stamps[k] = t;
      return { signals: { ...s.signals, ...values }, stamps };
    }),
  reset: () => set({ signals: { ...INITIAL_SIGNALS }, stamps: {} }),
}));
```

`src/bus/useSignal.ts`:

```ts
import { bus } from './store';
import type { BusSignals } from './types';

/** The ONLY way UI reads a value. Components cannot render numbers that aren't on the bus. */
export function useSignal<K extends keyof BusSignals>(name: K): BusSignals[K] {
  return bus((s) => s.signals[name]);
}

/** Render helper: honest dashes for nulls. */
export function fmt(value: number | null, digits = 0): string {
  return value === null ? '--' : value.toFixed(digits);
}
```

- [ ] **Step 4: Run** — `npx vitest run tests/bus` → 3 passed.
- [ ] **Step 5: Commit** — `git add src/bus tests/bus && git commit -m "feat(bus): typed control-voltage bus with stamped signals"`

---

### Task 2: Engine math — candidate signals

**Files:**
- Create: `src/engine/types.ts`, `src/engine/candidates.ts`
- Test: `tests/engine/candidates.test.ts`

- [ ] **Step 1: Types** — `src/engine/types.ts`:

```ts
export type RppgMethod = 'green' | 'chrom' | 'pos' | 'auto';
export type RoiName = 'forehead' | 'cheekL' | 'cheekR';
export interface Rgb { r: number; g: number; b: number }
export interface RoiSample { t: number; rois: Partial<Record<RoiName, Rgb>> }
export interface BioFrame {
  t: number;
  bpm: number | null;
  hrv: number | null;          // RMSSD ms
  coherence: number | null;    // 0..100
  sqi: number | null;
  confidence: number | null;
  method: Exclude<RppgMethod, 'auto'> | null;
  waveform: number[];          // processed chosen signal, for the scope
  spectrum: { bpm: number; power: number }[];
}
```

- [ ] **Step 2: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { greenTrace, chromTrace, posTrace, std } from '../../src/engine/candidates';

function synth(n: number, opts: { pulseHz: number; fps: number; pulseAmp: number; driftAmp: number }) {
  const rgb: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const p = Math.sin((2 * Math.PI * opts.pulseHz * i) / opts.fps);
    const d = Math.sin((2 * Math.PI * 0.25 * i) / opts.fps) * opts.driftAmp; // common-mode drift
    rgb.push([120 + 0.2 * opts.pulseAmp * p + d, 128 + 1.0 * opts.pulseAmp * p + d, 110 + 0.6 * opts.pulseAmp * p + d]);
  }
  return rgb;
}

describe('candidate traces', () => {
  const rgb = synth(120, { pulseHz: 1.2, fps: 30, pulseAmp: 1, driftAmp: 12 });
  it('green is the raw green channel', () => {
    expect(greenTrace(rgb)[5]).toBeCloseTo(rgb[5][1]);
  });
  it('POS suppresses common-mode drift relative to green', () => {
    // drift dominates green's variance; POS cancels the common mode
    expect(std(posTrace(rgb)) / std(greenTrace(rgb))).toBeLessThan(0.5);
  });
  it('CHROM suppresses common-mode drift relative to green', () => {
    expect(std(chromTrace(rgb)) / std(greenTrace(rgb))).toBeLessThan(0.5);
  });
  it('POS/CHROM return zero-length on empty input', () => {
    expect(posTrace([])).toEqual([]);
    expect(chromTrace([])).toEqual([]);
  });
});
```

- [ ] **Step 3: Run** → FAIL. **Step 4: Implement** — `src/engine/candidates.ts`:

```ts
export type RgbRow = [number, number, number];

export function std(x: number[]): number {
  if (!x.length) return 0;
  const m = x.reduce((a, v) => a + v, 0) / x.length;
  return Math.sqrt(x.reduce((a, v) => a + (v - m) ** 2, 0) / x.length);
}

/** Divide each channel by its temporal mean (CHROM/POS precondition). */
function normalize(rgb: RgbRow[]): { r: number[]; g: number[]; b: number[] } {
  const n = rgb.length || 1;
  let mr = 0, mg = 0, mb = 0;
  for (const [r, g, b] of rgb) { mr += r; mg += g; mb += b; }
  mr = mr / n || 1e-8; mg = mg / n || 1e-8; mb = mb / n || 1e-8;
  return { r: rgb.map((c) => c[0] / mr), g: rgb.map((c) => c[1] / mg), b: rgb.map((c) => c[2] / mb) };
}

export function greenTrace(rgb: RgbRow[]): number[] {
  return rgb.map((c) => c[1]);
}

/** POS — Wang et al. 2016: S1 = G−B, S2 = G+B−2R, pos = S1 + (σ1/σ2)·S2 */
export function posTrace(rgb: RgbRow[]): number[] {
  if (!rgb.length) return [];
  const { r, g, b } = normalize(rgb);
  const s1 = g.map((v, i) => v - b[i]);
  const s2 = g.map((v, i) => v + b[i] - 2 * r[i]);
  const s2std = std(s2);
  if (s2std < 1e-8) return s1;
  const alpha = std(s1) / s2std;
  return s1.map((v, i) => v + alpha * s2[i]);
}

/** CHROM — de Haan & Jeanne 2013: X = 3R−2G, Y = 1.5R+G−1.5B, chrom = X − (σx/σy)·Y */
export function chromTrace(rgb: RgbRow[]): number[] {
  if (!rgb.length) return [];
  const { r, g, b } = normalize(rgb);
  const x = r.map((v, i) => 3 * v - 2 * g[i]);
  const y = r.map((v, i) => 1.5 * v + g[i] - 1.5 * b[i]);
  const ystd = std(y);
  if (ystd < 1e-8) return x;
  const alpha = std(x) / ystd;
  return x.map((v, i) => v - alpha * y[i]);
}

/** Shared post-pipeline: linear detrend → 3-tap moving average → z-score. */
export function postProcess(trace: number[]): number[] {
  const n = trace.length;
  if (n < 3) return trace.slice();
  // detrend (least-squares line)
  const xm = (n - 1) / 2;
  const ym = trace.reduce((a, v) => a + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (i - xm) * (trace[i] - ym); den += (i - xm) ** 2; }
  const slope = den ? num / den : 0;
  const detr = trace.map((v, i) => v - (ym + slope * (i - xm)));
  // moving average (3)
  const ma = detr.map((_, i) => {
    const lo = Math.max(0, i - 1), hi = Math.min(n - 1, i + 1);
    let s = 0; for (let k = lo; k <= hi; k++) s += detr[k];
    return s / (hi - lo + 1);
  });
  const sd = std(ma) || 1;
  const mean = ma.reduce((a, v) => a + v, 0) / n;
  return ma.map((v) => (v - mean) / sd);
}
```

- [ ] **Step 5: Run** → 4 passed. **Step 6: Commit** — `git add src/engine tests/engine && git commit -m "feat(engine): GREEN/CHROM/POS candidate traces with shared post-pipeline"`

---

### Task 3: Engine math — spectrum, SQI, peaks, RMSSD, coherence

**Files:**
- Create: `src/engine/spectrum.ts`, `src/engine/peaks.ts`, `src/engine/coherence.ts`
- Test: `tests/engine/spectrum.test.ts`, `tests/engine/peaks.test.ts`, `tests/engine/coherence.test.ts`

- [ ] **Step 1: Failing tests**

```ts
// tests/engine/spectrum.test.ts
import { describe, it, expect } from 'vitest';
import { powerSpectrum, analyzeSpectrum } from '../../src/engine/spectrum';
const tone = (bpm: number, n = 120, fps = 30) => Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * (bpm / 60) * i) / fps));

describe('spectrum', () => {
  it('finds the peak of a clean 72 BPM tone within 1 BPM', () => {
    const sp = powerSpectrum(tone(72), 30);
    const { bpm } = analyzeSpectrum(sp);
    expect(Math.abs(bpm - 72)).toBeLessThanOrEqual(1);
  });
  it('parabolic refinement lands an off-bin 71.4 BPM tone within 1 BPM and not on an integer', () => {
    const { bpm } = analyzeSpectrum(powerSpectrum(tone(71.4), 30));
    expect(Math.abs(bpm - 71.4)).toBeLessThanOrEqual(1);
    expect(bpm % 1).not.toBe(0);
  });
  it('SQI is high for a pure tone and low for white noise', () => {
    const pure = analyzeSpectrum(powerSpectrum(tone(72), 30)).sqi;
    let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
    const noise = analyzeSpectrum(powerSpectrum(Array.from({ length: 120 }, rnd), 30)).sqi;
    expect(pure).toBeGreaterThan(0.5);
    expect(noise).toBeLessThan(pure);
  });
  it('returns zeros for a flat signal', () => {
    expect(analyzeSpectrum(powerSpectrum(new Array(120).fill(0), 30))).toEqual({ bpm: 0, sqi: 0, maxPower: 0 });
  });
});
```

```ts
// tests/engine/peaks.test.ts
import { describe, it, expect } from 'vitest';
import { detectPeaks, rmssd } from '../../src/engine/peaks';

describe('peaks + RMSSD', () => {
  const fps = 30;
  const n = 300; // 10 s
  const sig = Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 1.0 * i) / fps)); // 60 BPM
  const ts = Array.from({ length: n }, (_, i) => 1000 * (i / fps));
  it('detects roughly one peak per second at 60 BPM', () => {
    const p = detectPeaks(sig, fps);
    expect(p.length).toBeGreaterThanOrEqual(8);
    expect(p.length).toBeLessThanOrEqual(11);
  });
  it('RMSSD of perfectly regular beats is ~0; jittered beats > 0', () => {
    const p = detectPeaks(sig, fps);
    expect(rmssd(p, ts)).toBeLessThan(5);
    const jitteredTs = ts.map((t, i) => t + (i % 2 ? 25 : -25));
    expect(rmssd(p, jitteredTs)).toBeGreaterThan(20);
  });
  it('RMSSD needs at least 3 peaks', () => {
    expect(rmssd([10, 40], ts)).toBe(0);
  });
});
```

```ts
// tests/engine/coherence.test.ts
import { describe, it, expect } from 'vitest';
import { coherenceScore } from '../../src/engine/coherence';

describe('coherence', () => {
  it('needs 10 samples', () => expect(coherenceScore([1, 2, 3])).toBeNull());
  it('smooth periodic HRV scores higher than erratic HRV', () => {
    const smooth = Array.from({ length: 30 }, (_, i) => 50 + 10 * Math.sin(i / 1.5));
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const erratic = Array.from({ length: 30 }, () => 20 + 60 * rnd());
    expect(coherenceScore(smooth)!).toBeGreaterThan(coherenceScore(erratic)!);
  });
  it('is bounded 0..100', () => {
    const s = coherenceScore(Array.from({ length: 30 }, (_, i) => 50 + 10 * Math.sin(i / 1.5)))!;
    expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThanOrEqual(100);
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**

`src/engine/spectrum.ts`:

```ts
export interface SpectrumPoint { bpm: number; power: number }

/** DFT power at 1-BPM steps over the physiological band, Hann-windowed. */
export function powerSpectrum(signal: number[], fps: number, minBpm = 45, maxBpm = 180): SpectrumPoint[] {
  const n = signal.length;
  if (n < 4) return [];
  const mean = signal.reduce((a, v) => a + v, 0) / n;
  const w = signal.map((v, i) => (v - mean) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))));
  const out: SpectrumPoint[] = [];
  for (let bpm = minBpm; bpm <= maxBpm; bpm++) {
    const f = bpm / 60;
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) {
      const ang = (2 * Math.PI * f * i) / fps;
      re += w[i] * Math.cos(ang); im -= w[i] * Math.sin(ang);
    }
    out.push({ bpm, power: (re * re + im * im) / n });
  }
  return out;
}

/** Peak + SQI (peak ±1 bin power / total band power) + parabolic sub-bin refinement on log-power. */
export function analyzeSpectrum(sp: SpectrumPoint[]): { bpm: number; sqi: number; maxPower: number } {
  let peak = 0, maxPower = 0, total = 0;
  sp.forEach((p, i) => { total += p.power; if (p.power > maxPower) { maxPower = p.power; peak = i; } });
  if (total <= 1e-12 || maxPower <= 0) return { bpm: 0, sqi: 0, maxPower: 0 };
  const lo = Math.max(0, peak - 1), hi = Math.min(sp.length - 1, peak + 1);
  let neigh = 0; for (let i = lo; i <= hi; i++) neigh += sp[i].power;
  let bpm = sp[peak].bpm;
  if (peak > 0 && peak < sp.length - 1) {
    const eps = 1e-20;
    const l = Math.log(sp[peak - 1].power + eps), c = Math.log(sp[peak].power + eps), r = Math.log(sp[peak + 1].power + eps);
    const denom = l - 2 * c + r;
    if (Math.abs(denom) > 1e-12) {
      const off = (0.5 * (l - r)) / denom;
      if (Number.isFinite(off) && Math.abs(off) <= 0.5) bpm += off;
    }
  }
  return { bpm, sqi: neigh / total, maxPower };
}
```

`src/engine/peaks.ts`:

```ts
/** Local maxima above 0.3σ with a refractory gap of 0.33 s (180 BPM max). */
export function detectPeaks(signal: number[], fps: number): number[] {
  const minGap = Math.round(fps / 3);
  const m = signal.reduce((a, v) => a + v, 0) / (signal.length || 1);
  const sd = Math.sqrt(signal.reduce((a, v) => a + (v - m) ** 2, 0) / (signal.length || 1)) || 1;
  const thr = m + 0.3 * sd;
  const peaks: number[] = [];
  for (let i = 1; i < signal.length - 1; i++) {
    if (signal[i] > thr && signal[i] >= signal[i - 1] && signal[i] > signal[i + 1]) {
      if (!peaks.length || i - peaks[peaks.length - 1] >= minGap) peaks.push(i);
    }
  }
  return peaks;
}

/** RMSSD over physiologically plausible R-R intervals (333–1500 ms). */
export function rmssd(peaks: number[], timestamps: number[]): number {
  if (peaks.length < 3) return 0;
  const rr: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    const d = timestamps[peaks[i]] - timestamps[peaks[i - 1]];
    if (d >= 333 && d <= 1500) rr.push(d);
  }
  if (rr.length < 2) return 0;
  let s = 0; for (let i = 1; i < rr.length; i++) s += (rr[i] - rr[i - 1]) ** 2;
  return Math.sqrt(s / (rr.length - 1));
}
```

`src/engine/coherence.ts`:

```ts
/** 0..100 from an HRV (RMSSD) history: low coefficient of variation + high autocorrelation at respiratory lag. */
export function coherenceScore(hrv: number[]): number | null {
  if (hrv.length < 10) return null;
  const w = hrv.slice(-30);
  const n = w.length;
  const mean = w.reduce((a, v) => a + v, 0) / n;
  if (mean === 0) return 0;
  const variance = w.reduce((a, v) => a + (v - mean) ** 2, 0) / n;
  const cv = Math.sqrt(variance) / mean;
  const cvScore = Math.max(0, Math.min(50, (1 - cv / 0.5) * 50));
  let best = -1;
  for (let lag = 4; lag <= 8 && lag < n; lag++) {
    let num = 0, cnt = 0;
    for (let i = 0; i < n - lag; i++) { num += (w[i] - mean) * (w[i + lag] - mean); cnt++; }
    if (cnt && variance > 0) best = Math.max(best, num / (cnt * variance));
  }
  const acScore = Math.max(0, Math.min(50, ((best + 0.2) * 50) / 1.2));
  return Math.round(Math.max(0, Math.min(100, cvScore + acScore)));
}
```

- [ ] **Step 4: Run** — `npx vitest run tests/engine` → all pass. **Step 5: Commit** — `git commit -m "feat(engine): spectrum+SQI+parabolic peak, R-peaks+RMSSD, coherence"`

---

### Task 4: HeartbeatEngine — windows, multi-ROI fusion, AUTO

**Files:**
- Create: `src/engine/engine.ts`
- Test: `tests/engine/engine.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { HeartbeatEngine } from '../../src/engine/engine';
import type { RoiSample } from '../../src/engine/types';

function feed(method: 'green' | 'chrom' | 'pos' | 'auto', opts: { pulseBpm: number; driftAmp: number; badCheek?: boolean }) {
  const e = new HeartbeatEngine();
  let last: ReturnType<HeartbeatEngine['process']> | null = null;
  const fps = 30;
  for (let i = 0; i < 150; i++) {
    const p = Math.sin((2 * Math.PI * (opts.pulseBpm / 60) * i) / fps);
    const d = Math.sin((2 * Math.PI * 0.25 * i) / fps) * opts.driftAmp;
    const px = (amp: number) => ({ r: 120 + 0.2 * amp * p + d, g: 128 + amp * p + d, b: 110 + 0.6 * amp * p + d });
    let seed = i * 7 + 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
    const s: RoiSample = { t: 1000 * (i / fps), rois: {
      forehead: px(1.0),
      cheekL: px(0.8),
      cheekR: opts.badCheek ? { r: 120 + 30 * rnd(), g: 128 + 30 * rnd(), b: 110 + 30 * rnd() } : px(0.8),
    } };
    last = e.process(s, fps, method);
  }
  return last!;
}

describe('HeartbeatEngine', () => {
  it('returns nulls before 60 samples', () => {
    const e = new HeartbeatEngine();
    const f = e.process({ t: 0, rois: { forehead: { r: 1, g: 1, b: 1 } } }, 30, 'auto');
    expect(f.bpm).toBeNull(); expect(f.method).toBeNull();
  });
  it('POS recovers 72 BPM under heavy drift', () => {
    const f = feed('pos', { pulseBpm: 72, driftAmp: 12 });
    expect(Math.abs(f.bpm! - 72)).toBeLessThanOrEqual(3);
  });
  it('AUTO picks a method and tracks BPM under drift', () => {
    const f = feed('auto', { pulseBpm: 66, driftAmp: 12 });
    expect(['green', 'chrom', 'pos']).toContain(f.method);
    expect(Math.abs(f.bpm! - 66)).toBeLessThanOrEqual(3);
  });
  it('a noisy cheek ROI does not wreck the fused estimate', () => {
    const f = feed('pos', { pulseBpm: 72, driftAmp: 6, badCheek: true });
    expect(Math.abs(f.bpm! - 72)).toBeLessThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** — `src/engine/engine.ts`:

```ts
import { greenTrace, chromTrace, posTrace, postProcess, type RgbRow } from './candidates';
import { powerSpectrum, analyzeSpectrum, type SpectrumPoint } from './spectrum';
import { detectPeaks, rmssd } from './peaks';
import { coherenceScore } from './coherence';
import type { BioFrame, RoiName, RoiSample, RppgMethod } from './types';

const ROIS: RoiName[] = ['forehead', 'cheekL', 'cheekR'];
const WINDOW = 150;   // 5 s @ 30 fps
const MIN = 60;

type Method = Exclude<RppgMethod, 'auto'>;

export class HeartbeatEngine {
  private win: Record<RoiName, RgbRow[]> = { forehead: [], cheekL: [], cheekR: [] };
  private ts: number[] = [];
  private hrvHistory: number[] = [];

  process(sample: RoiSample, fps: number, method: RppgMethod): BioFrame {
    this.ts.push(sample.t);
    for (const roi of ROIS) {
      const c = sample.rois[roi];
      this.win[roi].push(c ? [c.r, c.g, c.b] : [NaN, NaN, NaN]);
      if (this.win[roi].length > WINDOW) this.win[roi].shift();
    }
    if (this.ts.length > WINDOW) this.ts.shift();
    const empty: BioFrame = { t: sample.t, bpm: null, hrv: null, coherence: null, sqi: null, confidence: null, method: null, waveform: [], spectrum: [] };
    if (this.ts.length < MIN) return empty;

    const methods: Method[] = method === 'auto' ? ['pos', 'chrom', 'green'] : [method];
    let best: { method: Method; waveform: number[]; spectrum: SpectrumPoint[]; bpm: number; sqi: number; maxPower: number } | null = null;

    for (const m of methods) {
      // per-ROI candidate → per-ROI SQI → SNR-weighted fusion of the processed traces
      const perRoi = ROIS
        .map((roi) => this.win[roi].filter((row) => !Number.isNaN(row[0])))
        .filter((rows) => rows.length >= MIN)
        .map((rows) => {
          const trace = m === 'green' ? greenTrace(rows) : m === 'pos' ? posTrace(rows) : chromTrace(rows);
          const proc = postProcess(trace);
          const { sqi } = analyzeSpectrum(powerSpectrum(proc, fps));
          return { proc, sqi };
        });
      if (!perRoi.length) continue;
      const wsum = perRoi.reduce((a, r) => a + r.sqi, 0) || 1;
      const len = Math.min(...perRoi.map((r) => r.proc.length));
      const fused = Array.from({ length: len }, (_, i) => perRoi.reduce((a, r) => a + (r.sqi / wsum) * r.proc[r.proc.length - len + i], 0));
      const waveform = postProcess(fused);
      const spectrum = powerSpectrum(waveform, fps);
      const { bpm, sqi, maxPower } = analyzeSpectrum(spectrum);
      if (!best || sqi > best.sqi) best = { method: m, waveform, spectrum, bpm, sqi, maxPower };
    }
    if (!best || best.bpm === 0) return empty;

    const avg = best.spectrum.reduce((a, p) => a + p.power, 0) / best.spectrum.length;
    const confidence = Math.min(1, best.maxPower / (avg * 4 || 1));
    const peaks = detectPeaks(best.waveform, fps);
    const tsTail = this.ts.slice(this.ts.length - best.waveform.length);
    const hrv = rmssd(peaks, tsTail);
    if (hrv > 0) { this.hrvHistory.push(hrv); if (this.hrvHistory.length > 60) this.hrvHistory.shift(); }

    return {
      t: sample.t,
      bpm: Math.round(best.bpm * 10) / 10,
      hrv: hrv > 0 ? Math.round(hrv * 10) / 10 : null,
      coherence: coherenceScore(this.hrvHistory),
      sqi: Math.round(best.sqi * 100) / 100,
      confidence,
      method: best.method,
      waveform: best.waveform,
      spectrum: best.spectrum,
    };
  }

  reset() { this.win = { forehead: [], cheekL: [], cheekR: [] }; this.ts = []; this.hrvHistory = []; }
}
```

- [ ] **Step 4: Run** → 4 passed. **Step 5: Commit** — `git commit -m "feat(engine): HeartbeatEngine with multi-ROI SQI fusion and AUTO arbitration"`

---

### Task 5: Engine worker

**Files:**
- Create: `src/engine/worker.ts`, `src/engine/client.ts`
- Test: `tests/engine/client.test.ts` (protocol shape only)

- [ ] **Step 1: Worker** — `src/engine/worker.ts`:

```ts
import { HeartbeatEngine } from './engine';
import type { RoiSample, RppgMethod } from './types';

const engine = new HeartbeatEngine();
type In = { type: 'sample'; sample: RoiSample; fps: number; method: RppgMethod } | { type: 'reset' };

self.onmessage = (e: MessageEvent<In>) => {
  if (e.data.type === 'reset') { engine.reset(); return; }
  const frame = engine.process(e.data.sample, e.data.fps, e.data.method);
  (self as unknown as Worker).postMessage({ type: 'frame', frame });
};
```

- [ ] **Step 2: Client** — `src/engine/client.ts`:

```ts
import type { BioFrame, RoiSample, RppgMethod } from './types';

export function createEngineClient(onFrame: (f: BioFrame) => void) {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<{ type: 'frame'; frame: BioFrame }>) => { if (e.data.type === 'frame') onFrame(e.data.frame); };
  return {
    push: (sample: RoiSample, fps: number, method: RppgMethod) => worker.postMessage({ type: 'sample', sample, fps, method }),
    reset: () => worker.postMessage({ type: 'reset' }),
    terminate: () => worker.terminate(),
  };
}
```

- [ ] **Step 3: Test the message protocol with a stubbed Worker**

```ts
import { describe, it, expect, vi } from 'vitest';

describe('engine client protocol', () => {
  it('posts sample messages and forwards frames', async () => {
    const posted: unknown[] = [];
    class FakeWorker { onmessage: ((e: MessageEvent) => void) | null = null; postMessage(m: unknown) { posted.push(m); } terminate() {} }
    vi.stubGlobal('Worker', FakeWorker);
    const { createEngineClient } = await import('../../src/engine/client');
    const frames: unknown[] = [];
    const c = createEngineClient((f) => frames.push(f));
    c.push({ t: 1, rois: { forehead: { r: 1, g: 2, b: 3 } } }, 30, 'auto');
    expect(posted[0]).toMatchObject({ type: 'sample', fps: 30, method: 'auto' });
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 4: Run** → pass. **Step 5: Commit** — `git commit -m "feat(engine): worker + client"`

---

### Task 6: Sensor — ROI geometry + camera

**Files:**
- Create: `src/sensor/roi.ts`, `src/sensor/camera.ts`
- Test: `tests/sensor/roi.test.ts`

- [ ] **Step 1: Failing test (pure geometry)**

```ts
import { describe, it, expect } from 'vitest';
import { roiRects, meanRgb } from '../../src/sensor/roi';

describe('roi', () => {
  it('derives forehead + cheek rects from landmark points (normalized 0..1)', () => {
    // minimal fake landmark set: only the indices roiRects reads
    const lm = new Array(478).fill({ x: 0.5, y: 0.5 });
    lm[10] = { x: 0.5, y: 0.20 }; lm[151] = { x: 0.5, y: 0.30 };          // forehead top/bottom
    lm[234] = { x: 0.30, y: 0.55 }; lm[454] = { x: 0.70, y: 0.55 };        // face sides
    lm[50] = { x: 0.38, y: 0.55 }; lm[280] = { x: 0.62, y: 0.55 };         // cheeks
    const r = roiRects(lm as { x: number; y: number }[], 100, 100);
    expect(r.forehead.y).toBeLessThan(r.cheekL.y);
    expect(r.cheekL.x).toBeLessThan(r.cheekR.x);
    for (const k of ['forehead', 'cheekL', 'cheekR'] as const) { expect(r[k].w).toBeGreaterThan(0); expect(r[k].h).toBeGreaterThan(0); }
  });
  it('meanRgb averages an RGBA buffer', () => {
    const data = new Uint8ClampedArray([10, 20, 30, 255, 30, 40, 50, 255]);
    expect(meanRgb(data)).toEqual({ r: 20, g: 30, b: 40 });
  });
});
```

- [ ] **Step 2: Implement** — `src/sensor/roi.ts`:

```ts
import type { Rgb, RoiName } from '../engine/types';
export interface Rect { x: number; y: number; w: number; h: number }
type Pt = { x: number; y: number };

/** MediaPipe FaceLandmarker (478 pts): 10=forehead top, 151=glabella, 234/454=face sides, 50/280=cheek centers. */
export function roiRects(lm: Pt[], W: number, H: number): Record<RoiName, Rect> {
  const px = (p: Pt) => ({ x: p.x * W, y: p.y * H });
  const top = px(lm[10]), glab = px(lm[151]), left = px(lm[234]), right = px(lm[454]), cl = px(lm[50]), cr = px(lm[280]);
  const faceW = Math.max(8, right.x - left.x);
  const fh = Math.max(4, (glab.y - top.y) * 0.8);
  const forehead = { x: Math.round(glab.x - faceW * 0.18), y: Math.round(top.y + (glab.y - top.y) * 0.1), w: Math.round(faceW * 0.36), h: Math.round(fh) };
  const cw = Math.round(faceW * 0.16), ch = Math.round(faceW * 0.14);
  const cheekL = { x: Math.round(cl.x - cw / 2), y: Math.round(cl.y - ch / 2), w: cw, h: ch };
  const cheekR = { x: Math.round(cr.x - cw / 2), y: Math.round(cr.y - ch / 2), w: cw, h: ch };
  return { forehead, cheekL, cheekR };
}

export function meanRgb(data: Uint8ClampedArray): Rgb {
  let r = 0, g = 0, b = 0; const n = data.length / 4 || 1;
  for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
  return { r: r / n, g: g / n, b: b / n };
}
```

`src/sensor/camera.ts` (browser edge; verified by Playwright in Task 11):

```ts
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { roiRects, meanRgb, type Rect } from './roi';
import type { RoiName, RoiSample } from '../engine/types';

const W = 160, H = 120;
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.33/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export interface CameraHandle { stop(): void; video: HTMLVideoElement; lastRects: Record<RoiName, Rect> | null; faceDetected: boolean }

export async function startCamera(onSample: (s: RoiSample) => void, onStatus: (s: 'loading' | 'ready' | 'tracking' | 'lost') => void): Promise<CameraHandle> {
  onStatus('loading');
  const fileset = await FilesetResolver.forVisionTasks(WASM);
  const landmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' }, runningMode: 'VIDEO', numFaces: 1,
  });
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, frameRate: 30, facingMode: 'user' } });
  const video = document.createElement('video');
  video.srcObject = stream; video.muted = true; video.playsInline = true; await video.play();
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  onStatus('ready');
  const handle: CameraHandle = { stop, video, lastRects: null, faceDetected: false };
  let raf = 0;
  const tick = () => {
    if (video.readyState >= 2) {
      ctx.drawImage(video, 0, 0, W, H);
      const res = landmarker.detectForVideo(video, performance.now());
      const lm = res.faceLandmarks[0];
      handle.faceDetected = !!lm;
      const rects = lm ? roiRects(lm, W, H) : handle.lastRects ?? { forehead: { x: 60, y: 20, w: 40, h: 25 }, cheekL: { x: 40, y: 60, w: 24, h: 18 }, cheekR: { x: 96, y: 60, w: 24, h: 18 } };
      handle.lastRects = rects;
      onStatus(lm ? 'tracking' : 'lost');
      const rois: RoiSample['rois'] = {};
      for (const k of Object.keys(rects) as RoiName[]) { const r = rects[k]; rois[k] = meanRgb(ctx.getImageData(r.x, r.y, r.w, r.h).data); }
      onSample({ t: performance.now(), rois });
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  function stop() { cancelAnimationFrame(raf); stream.getTracks().forEach((t) => t.stop()); landmarker.close(); }
  return handle;
}
```

- [ ] **Step 3: Run** `npx vitest run tests/sensor` → pass. **Step 4: Commit** — `git commit -m "feat(sensor): ROI geometry from face landmarks + camera loop"`

---

### Task 7: Rules — goals + modulate with slew

**Files:**
- Create: `src/rules/goals.ts`, `src/rules/modulate.ts`
- Test: `tests/rules/modulate.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { modulate, type ParamPatch } from '../../src/rules/modulate';

describe('modulate', () => {
  it('RELAXATION at high HR targets a slow beat and slow breath', () => {
    const p = modulate({ bpm: 95, coherence: 30, goal: 'RELAXATION' }, null);
    expect(p.beat_hz).toBeLessThanOrEqual(8);
    expect(p.breath_rate).toBeGreaterThanOrEqual(8);
  });
  it('FOCUS targets beta-range beat', () => {
    const p = modulate({ bpm: 70, coherence: 50, goal: 'FOCUS' }, null);
    expect(p.beat_hz).toBeGreaterThanOrEqual(12);
  });
  it('slews toward targets by at most 0.5 Hz per tick', () => {
    const prev: ParamPatch = { beat_hz: 20, carrier_hz: 200, pulse_depth: 0.2, master_gain: 0.5, breath_rate: 6 };
    const p = modulate({ bpm: 95, coherence: 30, goal: 'RELAXATION' }, prev);
    expect(Math.abs(p.beat_hz - 20)).toBeLessThanOrEqual(0.5);
  });
  it('with no measurement, returns the goal defaults (no null params)', () => {
    const p = modulate({ bpm: null, coherence: null, goal: 'ENERGY' }, null);
    expect(p.beat_hz).toBeGreaterThan(0); expect(p.carrier_hz).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Implement** — `src/rules/goals.ts`:

```ts
import type { Goal } from '../bus/types';
export interface GoalPreset { beat_hz: number; carrier_hz: number; pulse_depth: number; breath_rate: number }
/** Beat bands: delta<4, theta 4–8, alpha 8–12, beta 12–30. Breath in seconds per cycle. */
export const GOALS: Record<Goal, GoalPreset> = {
  RELAXATION: { beat_hz: 7.83, carrier_hz: 200, pulse_depth: 0.25, breath_rate: 10 },
  FOCUS:      { beat_hz: 14,   carrier_hz: 240, pulse_depth: 0.2,  breath_rate: 6 },
  ENERGY:     { beat_hz: 18,   carrier_hz: 260, pulse_depth: 0.3,  breath_rate: 5 },
};
```

`src/rules/modulate.ts`:

```ts
import { GOALS } from './goals';
import type { Goal } from '../bus/types';

export interface ParamPatch { beat_hz: number; carrier_hz: number; pulse_depth: number; master_gain: number; breath_rate: number }
export interface Reading { bpm: number | null; coherence: number | null; goal: Goal }

const SLEW = { beat_hz: 0.5, carrier_hz: 5, pulse_depth: 0.05, master_gain: 0.05, breath_rate: 0.5 };
const slew = (prev: number, target: number, max: number) => prev + Math.max(-max, Math.min(max, target - prev));

/** Offline rule engine: goal preset → HR-zone + coherence adjustments → slewed patch. Pure. */
export function modulate(r: Reading, prev: ParamPatch | null): ParamPatch {
  const g = GOALS[r.goal];
  let target: ParamPatch = { ...g, master_gain: 0.6 };
  if (r.bpm !== null) {
    // HR zone: high HR under RELAXATION → slower beat, slower breath; low HR under ENERGY → push beat up
    if (r.goal === 'RELAXATION' && r.bpm > 85) target = { ...target, beat_hz: Math.max(4, g.beat_hz - 2), breath_rate: g.breath_rate + 2 };
    if (r.goal === 'ENERGY' && r.bpm < 60) target = { ...target, beat_hz: g.beat_hz + 2 };
  }
  if (r.coherence !== null) {
    // rising coherence: deepen the pulse a little (reward), never past 0.4
    target = { ...target, pulse_depth: Math.min(0.4, g.pulse_depth + (r.coherence / 100) * 0.15) };
  }
  if (!prev) return target;
  return {
    beat_hz: slew(prev.beat_hz, target.beat_hz, SLEW.beat_hz),
    carrier_hz: slew(prev.carrier_hz, target.carrier_hz, SLEW.carrier_hz),
    pulse_depth: slew(prev.pulse_depth, target.pulse_depth, SLEW.pulse_depth),
    master_gain: slew(prev.master_gain, target.master_gain, SLEW.master_gain),
    breath_rate: slew(prev.breath_rate, target.breath_rate, SLEW.breath_rate),
  };
}
```

- [ ] **Step 3: Run** → pass. **Step 4: Commit** — `git commit -m "feat(rules): offline modulator with goal presets and slew limiting"`

---

### Task 8: Synth — worklet + graph

**Files:**
- Create: `src/synth/worklet.ts`, `src/synth/graph.ts`
- Test: `tests/synth/graph.test.ts` (fake AudioContext plumbing)

- [ ] **Step 1: Worklet processor** — `src/synth/worklet.ts`:

```ts
/// <reference types="@types/audioworklet" />
// 3 harmonic binaural layers (L: carrier·k, R: (carrier+beat)·k) under an isochronic amplitude pulse at beat_hz.
const LAYERS = [1, 1.5, 2];
class CymatyxProcessor extends AudioWorkletProcessor {
  private phaseL = [0, 0, 0]; private phaseR = [0, 0, 0]; private pulsePhase = 0;
  private p = { beat_hz: 7.83, carrier_hz: 200, pulse_depth: 0.25, master_gain: 0 };
  private target = { ...this.p };
  constructor() { super(); this.port.onmessage = (e) => { this.target = { ...this.target, ...e.data }; }; }
  process(_: Float32Array[][], outputs: Float32Array[][]) {
    const out = outputs[0]; if (!out || out.length < 2) return true;
    const L = out[0], R = out[1]; const sr = sampleRate; const n = L.length;
    // glide params per block
    for (const k of Object.keys(this.p) as (keyof typeof this.p)[]) this.p[k] += (this.target[k] - this.p[k]) * 0.05;
    for (let i = 0; i < n; i++) {
      const pulse = 1 - this.p.pulse_depth + this.p.pulse_depth * (0.5 + 0.5 * Math.sin(this.pulsePhase));
      this.pulsePhase += (2 * Math.PI * this.p.beat_hz) / sr;
      let l = 0, r = 0;
      LAYERS.forEach((k, j) => {
        const g = 1 / (k * 2);
        l += g * Math.sin(this.phaseL[j]); r += g * Math.sin(this.phaseR[j]);
        this.phaseL[j] += (2 * Math.PI * this.p.carrier_hz * k) / sr;
        this.phaseR[j] += (2 * Math.PI * (this.p.carrier_hz * k + this.p.beat_hz)) / sr;
      });
      L[i] = l * pulse * this.p.master_gain * 0.5; R[i] = r * pulse * this.p.master_gain * 0.5;
    }
    return true;
  }
}
registerProcessor('cymatyx-synth', CymatyxProcessor);
```

- [ ] **Step 2: Graph** — `src/synth/graph.ts`:

```ts
import type { ParamPatch } from '../rules/modulate';
export interface Synth { setParams(p: Partial<ParamPatch>): void; start(): Promise<void>; stop(): void; analyser: AnalyserNode | null; ctx: AudioContext | null }

export function createSynth(makeContext: () => AudioContext = () => new AudioContext()): Synth {
  let ctx: AudioContext | null = null; let node: AudioWorkletNode | null = null; let analyser: AnalyserNode | null = null;
  return {
    get analyser() { return analyser; }, get ctx() { return ctx; },
    async start() {
      ctx = makeContext();
      await ctx.audioWorklet.addModule(new URL('./worklet.ts', import.meta.url));
      node = new AudioWorkletNode(ctx, 'cymatyx-synth', { outputChannelCount: [2] });
      analyser = ctx.createAnalyser(); analyser.fftSize = 512;
      node.connect(analyser).connect(ctx.destination);
      if (ctx.state === 'suspended') await ctx.resume();
    },
    setParams(p) { node?.port.postMessage(p); },
    stop() { node?.port.postMessage({ master_gain: 0 }); setTimeout(() => { node?.disconnect(); ctx?.close(); node = null; ctx = null; analyser = null; }, 600); },
  };
}
```

- [ ] **Step 3: Test the plumbing with a fake context**

```ts
import { describe, it, expect, vi } from 'vitest';
import { createSynth } from '../../src/synth/graph';

describe('synth graph', () => {
  it('adds the worklet, wires node→analyser→destination, forwards params', async () => {
    const posted: unknown[] = [];
    const connect = vi.fn().mockReturnThis();
    const fakeCtx = {
      state: 'running', destination: {}, audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
      createAnalyser: () => ({ fftSize: 0, connect }), resume: vi.fn(), close: vi.fn(),
    } as unknown as AudioContext;
    vi.stubGlobal('AudioWorkletNode', class { port = { postMessage: (m: unknown) => posted.push(m) }; connect = connect; disconnect = vi.fn(); });
    const s = createSynth(() => fakeCtx);
    await s.start();
    expect((fakeCtx.audioWorklet.addModule as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    s.setParams({ beat_hz: 10 });
    expect(posted[0]).toEqual({ beat_hz: 10 });
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 4: Run** → pass. **Step 5: Commit** — `git commit -m "feat(synth): binaural+isochronic AudioWorklet and node graph"`

---

### Task 9: Session machine + persistence

**Files:**
- Create: `src/session/machine.ts`, `src/session/db.ts`
- Test: `tests/session/machine.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { bus } from '../../src/bus/store';
import { createSession } from '../../src/session/machine';

describe('session machine', () => {
  beforeEach(() => bus.getState().reset());
  it('idle → warming → calibrating → active → summary → idle', async () => {
    const s = createSession({ now: () => 0 });
    expect(bus.getState().signals.session_state).toBe('idle');
    s.start('FOCUS'); expect(bus.getState().signals.session_state).toBe('warming');
    s.warmed(); expect(bus.getState().signals.session_state).toBe('calibrating');
    s.calibrated(6.5); expect(bus.getState().signals.session_state).toBe('active');
    expect(bus.getState().signals.rsa_baseline).toBe(6.5);
    const rec = await s.end(); expect(bus.getState().signals.session_state).toBe('summary');
    expect(rec.goal).toBe('FOCUS');
    s.dismiss(); expect(bus.getState().signals.session_state).toBe('idle');
  });
  it('end() records averages only from real readings', async () => {
    const s = createSession({ now: () => 0 });
    s.start('RELAXATION'); s.warmed(); s.calibrated(5);
    s.sample({ bpm: 70, hrv: 40, coherence: 60 }); s.sample({ bpm: 74, hrv: 44, coherence: 70 }); s.sample({ bpm: null, hrv: null, coherence: null });
    const rec = await s.end();
    expect(rec.avgBpm).toBe(72); expect(rec.samples).toBe(2);
  });
  it('abort during calibration returns to idle and clears bus', () => {
    const s = createSession({ now: () => 0 });
    s.start('ENERGY'); s.warmed(); s.abort();
    expect(bus.getState().signals.session_state).toBe('idle');
    expect(bus.getState().signals.bpm).toBeNull();
  });
});
```

- [ ] **Step 2: Implement** — `src/session/db.ts`:

```ts
import Dexie, { type Table } from 'dexie';
export interface SessionRecord { id?: number; goal: string; startedAt: number; duration: number; avgBpm: number | null; avgHrv: number | null; peakCoherence: number | null; samples: number; rsaBaseline: number | null; series: { t: number; bpm: number; hrv: number | null; coherence: number | null }[] }
class CymatyxDb extends Dexie { sessions!: Table<SessionRecord, number>; constructor() { super('cymatyx-v2'); this.version(1).stores({ sessions: '++id, startedAt, goal' }); } }
export const db = new CymatyxDb();
```

`src/session/machine.ts`:

```ts
import { bus } from '../bus/store';
import type { Goal } from '../bus/types';
import { db, type SessionRecord } from './db';

export interface SessionSample { bpm: number | null; hrv: number | null; coherence: number | null }

export function createSession(deps: { now: () => number } = { now: Date.now }) {
  let startedAt = 0; let goal: Goal = 'RELAXATION'; let series: SessionRecord['series'] = [];
  const set = bus.getState().set;
  return {
    start(g: Goal) { goal = g; startedAt = deps.now(); series = []; bus.getState().reset(); bus.getState().patch({ goal: g, session_state: 'warming' }); },
    warmed() { set('session_state', 'calibrating'); },
    calibrated(rsa: number) { bus.getState().patch({ rsa_baseline: rsa, session_state: 'active' }); },
    sample(s: SessionSample) { if (s.bpm !== null) series.push({ t: deps.now(), bpm: s.bpm, hrv: s.hrv, coherence: s.coherence }); },
    abort() { bus.getState().reset(); },
    async end(): Promise<SessionRecord> {
      const real = series;
      const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x !== null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
      const rec: SessionRecord = {
        goal, startedAt, duration: Math.round((deps.now() - startedAt) / 1000),
        avgBpm: avg(real.map((r) => r.bpm)), avgHrv: avg(real.map((r) => r.hrv)),
        peakCoherence: real.some((r) => r.coherence !== null) ? Math.max(...real.map((r) => r.coherence ?? 0)) : null,
        samples: real.length, rsaBaseline: bus.getState().signals.rsa_baseline, series: real,
      };
      rec.id = await db.sessions.add(rec);
      set('session_state', 'summary');
      return rec;
    },
    dismiss() { bus.getState().reset(); },
  };
}
```

- [ ] **Step 3: Run** → pass. **Step 4: Commit** — `git commit -m "feat(session): state machine + Dexie persistence"`

---

### Task 10: The rack (UI) — world tokens, instruments, front, back

**Files:**
- Create: `src/ui/world.css`, `src/ui/instruments/{Nixie,VuMeter,TallyLamp,GoalSelector,PowerSwitch,BreathingGuide,Scope}.tsx`, `src/ui/rack/Rack.tsx`, `src/ui/rack/RackBack.tsx`
- Test: `tests/ui/instruments.test.tsx`

- [ ] **Step 1: World tokens** — `src/ui/world.css` (Silver Rack: cream panels, nixie amber, cable yellow/red, red mushroom; NEVER cyan):

```css
@import url('https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700&family=Share+Tech+Mono&display=swap');
@import "tailwindcss";
@theme {
  --font-silk: 'Jost', sans-serif; --font-mono: 'Share Tech Mono', monospace;
  --color-case: #1b1916; --color-rail: #2c2822;
  --color-panel: #d9d2c0; --color-panel-deep: #c4bca8; --color-panel-edge: #9a927d;
  --color-ink: #211f1a; --color-ink-soft: #3f3b2d;
  --color-glass: #221e15; --color-nixie: #ffb648; --color-nixie-dim: #bd9350;
  --color-red: #b3382a; --color-cable: #d4a700; --color-ok: #4f7d43; --color-tape: #14120f;
}
body { background: var(--color-case); color: var(--color-ink); margin: 0; font-family: 'Jost', sans-serif; }
.module { position: relative; border-radius: 5px; border: 1px solid var(--color-panel-edge);
  background: radial-gradient(rgba(70,64,48,.05) 1px, transparent 1.2px) 0 0/5px 5px, linear-gradient(180deg,#e0d9c7,#d3ccb9 55%,#c6bfab); padding: 1rem;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.5), 0 8px 18px rgba(0,0,0,.5); }
.module::before, .module::after { content: ''; position: absolute; top: 8px; width: 8px; height: 8px; border-radius: 50%; background: radial-gradient(circle,#d6d1c1 0 1.5px,#8c8571 2.5px,#55503f 3.5px); }
.module::before { left: 8px } .module::after { right: 8px }
.tape { display: inline-block; font: 600 10px/1 'Jost'; letter-spacing: .24em; text-transform: uppercase; color: #fff; background: var(--color-tape); padding: .3rem .65rem .25rem; border-radius: 2px; }
.label { font: 500 9px/1 'Jost'; letter-spacing: .18em; text-transform: uppercase; color: var(--color-ink-soft); }
.glass { background: var(--color-glass); border: 1px solid #16120d; border-radius: 4px; box-shadow: inset 0 3px 8px rgba(0,0,0,.75); color: var(--color-nixie); font-family: 'Share Tech Mono'; font-variant-numeric: tabular-nums; }
.nixie { font: 400 56px/1 'Share Tech Mono'; color: var(--color-nixie); text-shadow: 0 0 6px rgba(255,182,72,.8), 0 0 18px rgba(255,120,30,.5); }
.nixie-off { color: #4a3b22; text-shadow: none; }
.led { width: 8px; height: 8px; border-radius: 50%; box-shadow: inset 0 1px 1px rgba(255,255,255,.5), 0 0 6px currentColor; }
.led-off { background: rgba(0,0,0,.25); box-shadow: none; }
.btn-round { width: 84px; height: 84px; border-radius: 50%; font: 600 10px/1.2 'Jost'; letter-spacing: .12em; text-transform: uppercase; color: var(--color-ink);
  background: radial-gradient(circle at 40% 35%, #f3ecd8, #cfc5ad 70%, #a89f88); border: 3px solid #8c8471; box-shadow: 0 4px 0 #6f6858, 0 8px 14px rgba(0,0,0,.4); transition: transform .1s, box-shadow .1s; }
.btn-round[aria-pressed="true"] { transform: translateY(3px); box-shadow: 0 1px 0 #6f6858, inset 0 2px 6px rgba(0,0,0,.35); background: radial-gradient(circle at 40% 35%, #fff2c9, #ffd27a 70%, #d9a441); }
.mushroom { width: 120px; height: 120px; border-radius: 50%; font: 700 12px/1 'Jost'; letter-spacing: .3em; color: #fff;
  background: radial-gradient(circle at 40% 30%, #e0584a, #b3382a 60%, #7c2015); border: 6px solid #55503f; box-shadow: 0 8px 0 #4a1a12, 0 14px 22px rgba(0,0,0,.55); transition: transform .1s, box-shadow .1s; }
.mushroom:active { transform: translateY(6px); box-shadow: 0 2px 0 #4a1a12, 0 6px 12px rgba(0,0,0,.55); }
:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
::selection { background: var(--color-cable); color: var(--color-ink); }
```

- [ ] **Step 2: Failing instrument tests**

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { bus } from '../../src/bus/store';
import { Nixie } from '../../src/ui/instruments/Nixie';
import { TallyLamp } from '../../src/ui/instruments/TallyLamp';

describe('instruments read the bus honestly', () => {
  beforeEach(() => bus.getState().reset());
  it('Nixie shows -- when bpm is null and digits when measured', () => {
    const { rerender } = render(<Nixie signal="bpm" label="Heart Rate" />);
    expect(screen.getByLabelText(/heart rate/i)).toHaveTextContent('--');
    bus.getState().set('bpm', 72.4);
    rerender(<Nixie signal="bpm" label="Heart Rate" />);
    expect(screen.getByLabelText(/heart rate/i)).toHaveTextContent('72');
  });
  it('TallyLamp is lit only while cam_live', () => {
    const { rerender } = render(<TallyLamp />);
    expect(screen.getByLabelText(/camera/i)).toHaveAttribute('data-lit', 'false');
    bus.getState().set('cam_live', true);
    rerender(<TallyLamp />);
    expect(screen.getByLabelText(/camera/i)).toHaveAttribute('data-lit', 'true');
  });
});
```

- [ ] **Step 3: Instruments**

`src/ui/instruments/Nixie.tsx`:

```tsx
import { useSignal, fmt } from '../../bus/useSignal';
import type { BusSignals } from '../../bus/types';
type NumericKey = { [K in keyof BusSignals]: BusSignals[K] extends number | null ? K : never }[keyof BusSignals];
export function Nixie({ signal, label, digits = 0, unit }: { signal: NumericKey; label: string; digits?: number; unit?: string }) {
  const v = useSignal(signal);
  return (
    <div className="glass px-4 py-2 text-center" aria-label={`${label}: ${v === null ? 'no reading' : fmt(v, digits)}`}>
      <div className={`nixie ${v === null ? 'nixie-off' : ''}`}>{fmt(v, digits)}</div>
      <div className="label" style={{ color: 'var(--color-nixie-dim)' }}>{label}{unit ? ` · ${unit}` : ''}</div>
    </div>
  );
}
```

`src/ui/instruments/TallyLamp.tsx`:

```tsx
import { useSignal } from '../../bus/useSignal';
export function TallyLamp() {
  const live = useSignal('cam_live');
  return (
    <span className="flex items-center gap-1.5" aria-label={live ? 'Camera live' : 'Camera off'} data-lit={String(live)}>
      <span className={`led ${live ? 'bg-red text-red animate-pulse' : 'led-off'}`} />
      <span className="label">CAM</span>
    </span>
  );
}
```

`src/ui/instruments/VuMeter.tsx` (coherence needle, honest at rest):

```tsx
import { useSignal } from '../../bus/useSignal';
export function VuMeter() {
  const c = useSignal('coherence');
  const angle = -48 + ((c ?? 0) / 100) * 96;
  return (
    <div className="glass p-2" role="img" aria-label={`Coherence ${c === null ? 'no reading' : c}`}>
      <svg viewBox="0 0 200 120" className="w-full">
        <rect x="4" y="4" width="192" height="112" rx="5" fill="#ece5d2" stroke="#a49c86" />
        <path d="M 36 104 A 86 86 0 0 1 164 104" fill="none" stroke="#211f1a" strokeWidth="1.4" />
        <path d="M 141 46 A 86 86 0 0 1 164 104" fill="none" stroke="#4f7d43" strokeWidth="4" />
        {[0, 33, 66, 100].map((v) => { const a = ((-48 + (v / 100) * 96 - 90) * Math.PI) / 180; return <text key={v} x={100 + 70 * Math.cos(a)} y={112 + 70 * Math.sin(a)} fontSize="7" textAnchor="middle" fill="#57523f">{v}</text>; })}
        <text x="100" y="96" textAnchor="middle" fontSize="8.5" fontWeight="600" letterSpacing="3" fill="#211f1a">COHERENCE</text>
        <text x="100" y="107" textAnchor="middle" fontSize="8" fontWeight="700" fill={c === null ? '#3f3b2d' : '#4f7d43'}>{c === null ? '--' : c}</text>
        <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: '100px 112px', transition: 'transform .6s cubic-bezier(.34,1.2,.64,1)' }}>
          <line x1="100" y1="92" x2="100" y2="24" stroke="#1b1915" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="100" y1="32" x2="100" y2="24" stroke="#b3382a" strokeWidth="2.4" strokeLinecap="round" />
        </g>
        <circle cx="100" cy="112" r="9" fill="#8c8471" stroke="#55503f" />
      </svg>
    </div>
  );
}
```

`src/ui/instruments/GoalSelector.tsx`:

```tsx
import { bus } from '../../bus/store';
import { useSignal } from '../../bus/useSignal';
import type { Goal } from '../../bus/types';
const GOALS: Goal[] = ['RELAXATION', 'FOCUS', 'ENERGY'];
export function GoalSelector({ disabled }: { disabled: boolean }) {
  const goal = useSignal('goal');
  return (
    <div role="group" aria-label="Goal" className="flex gap-4 justify-center">
      {GOALS.map((g) => (
        <button key={g} className="btn-round" aria-pressed={goal === g} disabled={disabled} onClick={() => bus.getState().set('goal', g)}>{g}</button>
      ))}
    </div>
  );
}
```

`src/ui/instruments/PowerSwitch.tsx`:

```tsx
export function PowerSwitch({ onPress, label }: { onPress: () => void; label: string }) {
  return <div className="flex flex-col items-center gap-2"><button className="mushroom" onClick={onPress}>{label}</button><span className="label">Start sequence</span></div>;
}
```

`src/ui/instruments/BreathingGuide.tsx` (drives `breath_phase` on the bus from `breath_rate`; ring animates):

```tsx
import { useEffect } from 'react';
import { bus } from '../../bus/store';
import { useSignal } from '../../bus/useSignal';
export function BreathingGuide() {
  const rate = useSignal('breath_rate'); const phase = useSignal('breath_phase'); const state = useSignal('session_state');
  useEffect(() => {
    if (!rate || (state !== 'calibrating' && state !== 'active')) return;
    const inhale = rate * 0.4, hold = rate * 0.1, exhale = rate * 0.5; let t = 0;
    const id = setInterval(() => { t = (t + 0.1) % rate; bus.getState().set('breath_phase', t < inhale ? 'inhale' : t < inhale + hold ? 'hold' : 'exhale'); }, 100);
    return () => clearInterval(id);
  }, [rate, state]);
  const scale = phase === 'inhale' ? 1.25 : phase === 'hold' ? 1.25 : 0.85;
  return (
    <div className="flex flex-col items-center gap-2" aria-live="polite" aria-label={phase ? `Breathe: ${phase}` : 'Breathing guide idle'}>
      <div className="w-28 h-28 rounded-full border-4" style={{ borderColor: 'var(--color-cable)', transform: `scale(${scale})`, transition: `transform ${rate ? rate * 0.4 : 1}s ease-in-out` }} />
      <span className="label">{phase ?? '--'}</span>
    </div>
  );
}
```

`src/ui/instruments/Scope.tsx` (waveform from the last BioFrame — passed as prop, since the waveform is an engine artifact, not a bus scalar):

```tsx
export function Scope({ waveform }: { waveform: number[] }) {
  const w = 300, h = 80;
  const d = waveform.length > 1 ? waveform.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i / (waveform.length - 1)) * w} ${h / 2 - v * (h / 3)}`).join(' ') : '';
  return <svg viewBox={`0 0 ${w} ${h}`} className="glass w-full h-20" aria-hidden="true"><path d={d} fill="none" stroke="#ffb648" strokeWidth="1.5" /></svg>;
}
```

- [ ] **Step 4: Rack front** — `src/ui/rack/Rack.tsx`:

```tsx
import { Nixie } from '../instruments/Nixie';
import { VuMeter } from '../instruments/VuMeter';
import { TallyLamp } from '../instruments/TallyLamp';
import { GoalSelector } from '../instruments/GoalSelector';
import { PowerSwitch } from '../instruments/PowerSwitch';
import { BreathingGuide } from '../instruments/BreathingGuide';
import { Scope } from '../instruments/Scope';
import { useSignal, fmt } from '../../bus/useSignal';

export function Rack({ waveform, onStart, onEnd, video }: { waveform: number[]; onStart: () => void; onEnd: () => void; video: HTMLVideoElement | null }) {
  const state = useSignal('session_state'); const method = useSignal('engine_method'); const sqi = useSignal('sqi');
  const idle = state === 'idle' || state === 'summary';
  return (
    <main className="max-w-6xl mx-auto p-4 grid gap-4 md:grid-cols-[1fr_1.4fr_1fr]">
      <section className="module space-y-3"><span className="tape">Bio-Telemetry</span>
        <Nixie signal="bpm" label="Heart rate" unit="BPM" />
        <Nixie signal="hrv_rmssd" label="HRV" unit="ms" digits={0} />
        <div className="flex justify-between"><span className="label">Engine {method ?? '--'}</span><span className="label">SQI {sqi === null ? '--' : Math.round(sqi * 100) + '%'}</span></div>
        <Scope waveform={waveform} />
      </section>
      <section className="module space-y-5 text-center"><span className="tape">Session Controller</span>
        <GoalSelector disabled={!idle} />
        <BreathingGuide />
        {idle ? <PowerSwitch onPress={onStart} label="START" /> : <button className="btn-round" onClick={onEnd}>END</button>}
        <div className="label">{state}</div>
      </section>
      <section className="module space-y-3"><span className="tape">HRV Coherence</span>
        <VuMeter />
        <div className="flex justify-between items-center"><span className="tape">Subject</span><TallyLamp /></div>
        <div className="glass aspect-video overflow-hidden" ref={(el) => { if (el && video && !el.contains(video)) { video.className = 'w-full h-full object-cover grayscale opacity-50'; el.replaceChildren(video); } }} />
        <div className="label">RSA baseline {fmt(useSignal('rsa_baseline'), 1)}</div>
      </section>
    </main>
  );
}
```

`src/ui/rack/RackBack.tsx` (M1 minimal back: the live params as a patch list):

```tsx
import { useSignal, fmt } from '../../bus/useSignal';
export function RackBack() {
  const rows = [['beat_hz', 'Beat Hz', 2], ['carrier_hz', 'Carrier Hz', 0], ['pulse_depth', 'Pulse depth', 2], ['master_gain', 'Master', 2], ['breath_rate', 'Breath s', 1]] as const;
  return (
    <section className="module mt-4 max-w-6xl mx-auto"><span className="tape">Patch bay — rules → synth</span>
      <ul className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3 font-mono text-sm">
        {rows.map(([k, l, d]) => <li key={k} className="glass px-3 py-2"><div className="label" style={{ color: 'var(--color-nixie-dim)' }}>{l}</div><div>{fmt(useSignal(k), d)}</div></li>)}
      </ul>
    </section>
  );
}
```

- [ ] **Step 5: Run** `npx vitest run tests/ui` → pass. **Step 6: Commit** — `git commit -m "feat(ui): Silver Rack world + instruments + rack front/back"`

---

### Task 11: Wire the loop — App + orchestration + Playwright smoke

**Files:**
- Modify: `src/App.tsx`, `src/main.tsx`
- Create: `src/session/orchestrate.ts`, `e2e/smoke.spec.ts`, `playwright.config.ts`

- [ ] **Step 1: Orchestrator** — `src/session/orchestrate.ts`:

```ts
import { bus } from '../bus/store';
import { createEngineClient } from '../engine/client';
import { startCamera, type CameraHandle } from '../sensor/camera';
import { createSynth } from '../synth/graph';
import { modulate, type ParamPatch } from '../rules/modulate';
import { createSession } from './machine';
import type { BioFrame } from '../engine/types';

const CAL_MS = 30_000;

export function createOrchestrator(onFrame: (f: BioFrame) => void) {
  const session = createSession(); const synth = createSynth();
  let cam: CameraHandle | null = null; let prev: ParamPatch | null = null; let tick = 0; let calTimer = 0; let calBpm: number[] = [];
  const engine = createEngineClient((f) => {
    onFrame(f);
    bus.getState().patch({ bpm: f.bpm, hrv_rmssd: f.hrv, coherence: f.coherence, sqi: f.sqi, confidence: f.confidence, engine_method: f.method }, f.t);
    const s = bus.getState().signals;
    if (s.session_state === 'warming' && f.bpm !== null) session.warmed();
    if (s.session_state === 'calibrating' && f.bpm !== null) calBpm.push(f.bpm);
    if (s.session_state === 'active') session.sample({ bpm: f.bpm, hrv: f.hrv, coherence: f.coherence });
  });
  async function start() {
    const g = bus.getState().signals.goal;
    session.start(g);
    await synth.start();                                   // user gesture unlocks audio
    cam = await startCamera((s) => engine.push(s, 30, bus.getState().signals.method_select), () => {});
    bus.getState().set('cam_live', true);
    bus.getState().patch({ ...modulate({ bpm: null, coherence: null, goal: g }, null), breath_phase: null });
    tick = window.setInterval(() => {
      const s = bus.getState().signals;
      if (s.session_state !== 'active' && s.session_state !== 'calibrating') return;
      prev = modulate({ bpm: s.bpm, coherence: s.coherence, goal: s.goal }, prev);
      bus.getState().patch(prev); synth.setParams(prev);
    }, 500);
    // calibration: 30 s of guided breathing → RSA = max−min BPM over the window
    calTimer = window.setTimeout(() => {
      if (bus.getState().signals.session_state === 'calibrating') {
        const rsa = calBpm.length >= 5 ? Math.max(...calBpm) - Math.min(...calBpm) : 0;
        session.calibrated(Math.round(rsa * 10) / 10);
      }
    }, CAL_MS);
  }
  async function end() {
    clearInterval(tick); clearTimeout(calTimer); cam?.stop(); cam = null; synth.stop(); engine.reset(); calBpm = []; prev = null;
    bus.getState().set('cam_live', false);
    if (bus.getState().signals.session_state === 'active') await session.end(); else session.abort();
  }
  return { start, end, get video() { return cam?.video ?? null; } };
}
```

- [ ] **Step 2: App** — `src/App.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { Rack } from './ui/rack/Rack';
import { RackBack } from './ui/rack/RackBack';
import { createOrchestrator } from './session/orchestrate';
import type { BioFrame } from './engine/types';
import './ui/world.css';

export default function App() {
  const [wave, setWave] = useState<number[]>([]);
  const orch = useMemo(() => createOrchestrator((f: BioFrame) => setWave(f.waveform)), []);
  return (
    <>
      <header className="px-6 py-3 flex items-center gap-3" style={{ background: 'var(--color-rail)', color: 'var(--color-panel)' }}>
        <span className="font-silk font-bold tracking-[.4em]">CYMATYX</span><span className="label" style={{ color: 'inherit', opacity: .7 }}>closed-loop bio-resonance</span>
      </header>
      <Rack waveform={wave} onStart={() => orch.start()} onEnd={() => orch.end()} video={orch.video} />
      <RackBack />
    </>
  );
}
```

- [ ] **Step 3: Playwright smoke** — `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'e2e', webServer: { command: 'npm run dev', port: 3000, reuseExistingServer: true },
  use: { baseURL: 'http://localhost:3000', launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] } },
});
```

`e2e/smoke.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
test('rack boots honest and a session starts', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel(/heart rate/i)).toContainText('--');
  await expect(page.getByLabel(/camera off/i)).toBeVisible();
  await page.getByRole('button', { name: 'START' }).click();
  await expect(page.getByLabel(/camera live/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/warming|calibrating/i)).toBeVisible();
});
```

- [ ] **Step 4: Run** — `npx playwright install chromium` (if missing), `npx playwright test` → pass; `npm run build` clean; `npx vitest run` all green.
- [ ] **Step 5: Commit** — `git commit -m "feat: wire the pure loop — camera → engine → bus → rules → synth"`

---

### Task 12: README + push

- [ ] **Step 1:** Write README.md in the rustyorb house style (banner SVG at `assets/banner.svg`, data badges with REAL counts from `npx vitest run`, honest-thesis NOTE, the loop mermaid, layout tree, footer). Use the `rustyorb-readme` skill.
- [ ] **Step 2:** `git push -u origin main`; `gh repo edit rustyorb/Cymatyx --add-topic rppg --add-topic biofeedback --add-topic hrv --add-topic binaural-beats --add-topic local-first --add-topic react --add-topic typescript --add-topic web-audio-api`.

---

## Self-review

- **Spec coverage:** bus (T1), engine w/ multi-ROI + AUTO (T2–T5), sensor 3 ROIs (T6), offline rules w/ slew (T7), synth binaural+isochronic (T8), session machine + Dexie + RSA calibration (T9, T11), rack front/back + instruments reading only the bus, null→`--`, tally lamp (T10), honesty rules (T1 types, T10 tests), Silver Rack world at CSS fidelity (T10), Playwright smoke with fake camera + audio unlock via START (T11). Not in M1 by design: voice, gamma, history UI, PWA.
- **Placeholders:** none; every step has code and a command.
- **Type consistency:** `ParamPatch` (rules) ↔ `bus.patch(prev)` (keys match bus signal names); `BioFrame.method` ↔ `engine_method`; `RoiSample` shared by sensor/engine/worker; `Goal` from bus/types used by rules and UI.
