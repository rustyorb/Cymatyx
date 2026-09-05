import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { bus } from '../../src/bus/store';
import type { BioFrame, RoiSample } from '../../src/engine/types';

// ---- module fakes: the orchestrator's three browser edges ----
type StatusCb = (s: 'loading' | 'ready' | 'tracking' | 'lost') => void;
const cam = vi.hoisted(() => ({
  resolve: null as null | ((h: { stop: () => void; video: null; rects: null; label: string }) => void),
  reject: null as null | ((e: Error) => void),
  status: null as null | StatusCb,
  sample: null as null | ((s: RoiSample) => void),
  stop: vi.fn(),
}));
vi.mock('../../src/sensor/camera', () => ({
  startCamera: (_id: string | null, onSample: (s: RoiSample) => void, onStatus: StatusCb) =>
    new Promise((res, rej) => {
      cam.sample = onSample;
      cam.status = onStatus;
      cam.resolve = (h) => res(h);
      cam.reject = rej;
    }),
  listCameras: async () => [],
}));
const eng = vi.hoisted(() => ({ onFrame: null as null | ((f: BioFrame) => void), terminate: vi.fn(), push: vi.fn(), reset: vi.fn() }));
vi.mock('../../src/engine/client', () => ({
  createEngineClient: (onFrame: (f: BioFrame) => void) => {
    eng.onFrame = onFrame;
    return { push: eng.push, reset: eng.reset, terminate: eng.terminate };
  },
}));
const syn = vi.hoisted(() => ({ start: vi.fn(async () => {}), stop: vi.fn(), setParams: vi.fn() }));
vi.mock('../../src/synth/graph', () => ({
  createSynth: () => ({ start: syn.start, stop: syn.stop, setParams: syn.setParams, analyser: null, running: false }),
}));

import { createOrchestrator, CALIBRATION_MS } from '../../src/session/orchestrate';

const frame = (bpm: number | null): BioFrame => ({ t: 0, bpm, hrv: null, coherence: null, sqi: 0.5, confidence: 0.5, method: 'pos', fps: 30, waveform: [], spectrum: [] });
const handle = () => ({ stop: cam.stop, video: null, rects: null, label: 'fake' });
// drain microtasks only — timers are faked, so never wait on setTimeout here
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

describe('orchestrator lifecycle', () => {
  beforeEach(() => {
    bus.getState().reset();
    vi.clearAllMocks();
    // leave setImmediate/nextTick real so fake-indexeddb (Dexie) can complete session.end()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  });
  afterEach(() => vi.useRealTimers());

  it('START → camera live, warming; STOP → everything released, idle', async () => {
    const o = createOrchestrator('blob:w');
    const p = o.start();
    await flush();
    cam.resolve!(handle());
    await p;
    expect(bus.getState().signals.cam_live).toBe(true);
    expect(bus.getState().signals.session_state).toBe('warming');
    expect(bus.getState().signals.beat_hz).not.toBeNull();
    await o.end();
    expect(cam.stop).toHaveBeenCalledTimes(1);
    expect(eng.terminate).toHaveBeenCalledTimes(1);
    expect(syn.stop).toHaveBeenCalled();
    expect(bus.getState().signals.cam_live).toBe(false);
    expect(bus.getState().signals.session_state).toBe('idle');
  });

  it('END while the camera is still opening releases the camera and does not revive the session', async () => {
    const o = createOrchestrator('blob:w');
    const p = o.start();
    await flush(); // synth started, camera pending
    await o.end(); // user hits STOP during startup
    cam.resolve!(handle()); // camera finally opens
    await p;
    expect(cam.stop).toHaveBeenCalledTimes(1);
    expect(bus.getState().signals.cam_live).toBe(false);
    expect(bus.getState().signals.session_state).toBe('idle');
    expect(o.video).toBeNull();
  });

  it('camera failure aborts to idle with the error on the rack', async () => {
    const o = createOrchestrator('blob:w');
    const p = o.start();
    await flush();
    cam.reject!(new Error('Permission denied'));
    await p;
    expect(bus.getState().signals.session_state).toBe('idle');
    expect(bus.getState().signals.last_error).toBe('Permission denied');
    expect(bus.getState().signals.cam_live).toBe(false);
  });

  it('calibration clock starts at the first BPM, not at START; too few readings → RSA null', async () => {
    const o = createOrchestrator('blob:w');
    const p = o.start();
    await flush();
    cam.resolve!(handle());
    await p;
    vi.advanceTimersByTime(CALIBRATION_MS + 5_000); // long warm-up: no BPM yet
    expect(bus.getState().signals.session_state).toBe('warming');
    eng.onFrame!(frame(70)); // first reading → calibrating, clock starts now
    expect(bus.getState().signals.session_state).toBe('calibrating');
    vi.advanceTimersByTime(CALIBRATION_MS - 1);
    expect(bus.getState().signals.session_state).toBe('calibrating');
    eng.onFrame!(frame(72));
    vi.advanceTimersByTime(2);
    expect(bus.getState().signals.session_state).toBe('active');
    expect(bus.getState().signals.rsa_baseline).toBeNull(); // 2 readings < 5
    await o.end();
  });

  it('enough calibration readings → RSA = HR swing', async () => {
    const o = createOrchestrator('blob:w');
    const p = o.start();
    await flush();
    cam.resolve!(handle());
    await p;
    eng.onFrame!(frame(70));
    for (const b of [70, 74, 66, 72, 69, 71]) eng.onFrame!(frame(b));
    vi.advanceTimersByTime(CALIBRATION_MS + 1);
    expect(bus.getState().signals.session_state).toBe('active');
    expect(bus.getState().signals.rsa_baseline).toBe(8);
    await o.end();
  });

  it('losing the face darkens the readings', async () => {
    const o = createOrchestrator('blob:w');
    const p = o.start();
    await flush();
    cam.resolve!(handle());
    await p;
    eng.onFrame!(frame(70));
    expect(bus.getState().signals.bpm).toBe(70);
    cam.status!('lost');
    expect(bus.getState().signals.bpm).toBeNull();
    expect(bus.getState().signals.engine_method).toBeNull();
    expect(bus.getState().signals.cam_status).toBe('lost');
    await o.end();
  });

  it('a second START while running is ignored', async () => {
    const o = createOrchestrator('blob:w');
    const p = o.start();
    await flush();
    cam.resolve!(handle());
    await p;
    await o.start();
    expect(syn.start).toHaveBeenCalledTimes(1);
    await o.end();
  });
});
