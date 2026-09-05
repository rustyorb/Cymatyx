import { bus } from '../bus/store';
import { createEngineClient, type EngineClient } from '../engine/client';
import { startCamera, type CameraHandle } from '../sensor/camera';
import { createSynth } from '../synth/graph';
import { modulate, type ParamPatch } from '../rules/modulate';
import { createSession } from './machine';
import type { BioFrame } from '../engine/types';

export const CALIBRATION_MS = 30_000;
const TICK_MS = 500;

/**
 * The loop, wired: camera → engine worker → bus ← rules (2 Hz) → synth. START is the user gesture
 * that unlocks audio, so the synth starts first; everything torn down on END in reverse.
 */
export function createOrchestrator(workletUrl: string) {
  const session = createSession();
  const synth = createSynth(workletUrl);
  let engine: EngineClient | null = null;
  let cam: CameraHandle | null = null;
  let prev: ParamPatch | null = null;
  let tick = 0;
  let calTimer = 0;
  let calBpm: number[] = [];
  let frameListener: (f: BioFrame) => void = () => {};

  const onFrame = (f: BioFrame) => {
    frameListener(f);
    bus.getState().patch({ bpm: f.bpm, hrv_rmssd: f.hrv, coherence: f.coherence, sqi: f.sqi, confidence: f.confidence, engine_method: f.method }, f.t);
    const s = bus.getState().signals;
    if (s.session_state === 'warming' && f.bpm !== null) session.warmed();
    if (s.session_state === 'calibrating' && f.bpm !== null) calBpm.push(f.bpm);
    if (s.session_state === 'active') session.sample({ bpm: f.bpm, hrv: f.hrv, coherence: f.coherence });
  };

  async function start() {
    const { goal, cam_device, session_state } = bus.getState().signals;
    if (session_state !== 'idle' && session_state !== 'summary') return;
    session.start(goal);
    bus.getState().set('last_error', null);
    try {
      await synth.start();
      engine = createEngineClient(onFrame);
      cam = await startCamera(
        cam_device,
        (sample) => engine?.push(sample, bus.getState().signals.method_select),
        (status) => bus.getState().set('cam_status', status),
      );
      bus.getState().set('cam_live', true);
    } catch (e) {
      await teardown();
      session.abort();
      bus.getState().set('last_error', e instanceof Error ? e.message : String(e));
      return;
    }
    prev = modulate({ bpm: null, coherence: null, goal }, null);
    bus.getState().patch(prev);
    synth.setParams(prev);
    tick = window.setInterval(() => {
      const s = bus.getState().signals;
      if (s.session_state !== 'active' && s.session_state !== 'calibrating') return;
      prev = modulate({ bpm: s.bpm, coherence: s.coherence, goal: s.goal }, prev);
      bus.getState().patch(prev);
      synth.setParams(prev);
    }, TICK_MS);
    // Calibration: guided breathing; RSA baseline = HR swing (max − min) over the calibration window.
    calTimer = window.setTimeout(() => {
      if (bus.getState().signals.session_state === 'calibrating') {
        const rsa = calBpm.length >= 5 ? Math.max(...calBpm) - Math.min(...calBpm) : 0;
        session.calibrated(Math.round(rsa * 10) / 10);
      }
    }, CALIBRATION_MS);
  }

  async function teardown() {
    clearInterval(tick);
    clearTimeout(calTimer);
    cam?.stop();
    cam = null;
    engine?.terminate();
    engine = null;
    synth.stop();
    calBpm = [];
    prev = null;
    bus.getState().patch({ cam_live: false, cam_status: 'off' });
  }

  async function end() {
    const wasActive = bus.getState().signals.session_state === 'active';
    await teardown();
    if (wasActive) await session.end();
    else session.abort();
  }

  return {
    start,
    end,
    dismiss: () => session.dismiss(),
    onFrame(fn: (f: BioFrame) => void) {
      frameListener = fn;
    },
    get video() {
      return cam?.video ?? null;
    },
    get analyser() {
      return synth.analyser;
    },
  };
}
