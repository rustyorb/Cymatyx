import { bus } from '../bus/store';
import { createEngineClient, type EngineClient } from '../engine/client';
import { startCamera, type CameraHandle } from '../sensor/camera';
import { createSynth } from '../synth/graph';
import { modulate, type ParamPatch } from '../rules/modulate';
import { createCoach } from '../voice/coach';
import { probeTts, probeBrain } from '../voice/probe';
import { createSession } from './machine';
import type { BioFrame } from '../engine/types';

export const CALIBRATION_MS = 30_000;
export const CALIBRATION_MIN_READINGS = 5;
export const STALE_MS = 1500; // no engine frame for this long while live → the readouts go dark
const TICK_MS = 500;

const NO_READING = { bpm: null, hrv_rmssd: null, coherence: null, sqi: null, confidence: null, engine_method: null } as const;

/**
 * The loop, wired: camera → engine worker → bus ← rules (2 Hz) → synth. START is the user gesture
 * that unlocks audio, so the synth starts first; everything is torn down on END in reverse.
 * Every START is a generation; an END during startup bumps the generation, so the resumed start()
 * releases whatever it just acquired instead of reviving a session that already ended.
 */
export function createOrchestrator(workletUrl: string) {
  const session = createSession();
  const synth = createSynth(workletUrl, undefined, (e) => fail(e));
  const coach = createCoach();
  const DUCK = 0.35; // synth gain multiplier while the coach speaks
  let engine: EngineClient | null = null;
  let cam: CameraHandle | null = null;
  let prev: ParamPatch | null = null;
  let tick = 0;
  let calTimer = 0;
  let calBpm: number[] = [];
  let gen = 0;
  let ending: Promise<void> | null = null;
  let lastFrameAt = 0;
  let frameListener: (f: BioFrame) => void = () => {};

  const startCalibration = () => {
    calBpm = [];
    clearTimeout(calTimer);
    calTimer = window.setTimeout(() => {
      if (bus.getState().signals.session_state !== 'calibrating') return;
      // RSA baseline = HR swing over the guided-breath window; null when there is not enough evidence.
      const rsa = calBpm.length >= CALIBRATION_MIN_READINGS ? Math.round((Math.max(...calBpm) - Math.min(...calBpm)) * 10) / 10 : null;
      session.calibrated(rsa);
    }, CALIBRATION_MS);
  };

  const onFrame = (f: BioFrame) => {
    lastFrameAt = Date.now();
    frameListener(f);
    bus.getState().patch({ bpm: f.bpm, hrv_rmssd: f.hrv, coherence: f.coherence, sqi: f.sqi, confidence: f.confidence, engine_method: f.method }, f.t);
    const s = bus.getState().signals;
    if (s.session_state === 'warming' && f.bpm !== null) {
      session.warmed();
      startCalibration(); // the 30 s starts when calibration starts, not when START was pressed
    } else if (s.session_state === 'calibrating' && f.bpm !== null) calBpm.push(f.bpm);
    else if (s.session_state === 'active') session.sample({ bpm: f.bpm, hrv: f.hrv, coherence: f.coherence });
  };

  const onStatus = (status: 'loading' | 'ready' | 'tracking' | 'lost') => {
    const s = bus.getState().signals;
    if (s.cam_status !== status) bus.getState().set('cam_status', status);
    // No face → the tracker cannot vouch for a reading: the tubes go dark until it is back.
    if (status === 'lost' && s.bpm !== null) bus.getState().patch({ ...NO_READING });
  };

  function fail(e: Error) {
    bus.getState().set('last_error', e.message);
    void end();
  }

  async function start() {
    const { goal, cam_device, session_state } = bus.getState().signals;
    if (session_state !== 'idle' && session_state !== 'summary') return;
    const my = ++gen;
    session.start(goal);
    bus.getState().set('last_error', null);
    try {
      await synth.start();
      if (my !== gen) return; // ended while audio was starting (synth.stop already handled it)
      engine = createEngineClient(onFrame, fail);
      const handle = await startCamera(cam_device, (sample) => engine?.push(sample, bus.getState().signals.method_select), onStatus, fail);
      if (my !== gen) {
        handle.stop(); // ended while the camera was opening: release it, do not revive the session
        return;
      }
      cam = handle;
      lastFrameAt = Date.now();
      bus.getState().set('cam_live', true);
      void probeTts(); // lamps light only if the servers answer
      void probeBrain();
      coach.start();
    } catch (e) {
      if (my !== gen) return;
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
      // watchdog: a live camera that stops producing frames must not leave the last reading lit
      if (s.cam_live && s.bpm !== null && Date.now() - lastFrameAt > STALE_MS) bus.getState().patch({ ...NO_READING });
      if (s.session_state !== 'active' && s.session_state !== 'calibrating') return;
      prev = modulate({ bpm: s.bpm, coherence: s.coherence, goal: s.goal }, prev);
      // ducking: the bus carries what the synth is actually told, so the patch bay shows the ducked gain
      const out = { ...prev, master_gain: s.coach_speaking ? prev.master_gain * DUCK : prev.master_gain };
      bus.getState().patch(out);
      synth.setParams(out);
    }, TICK_MS);
  }

  async function teardown() {
    clearInterval(tick);
    clearTimeout(calTimer);
    coach.stop(); // stops listening; a line already playing finishes
    cam?.stop();
    cam = null;
    engine?.terminate();
    engine = null;
    synth.stop();
    calBpm = [];
    prev = null;
    bus.getState().patch({ ...NO_READING, cam_live: false, cam_status: 'off' });
  }

  function end(): Promise<void> {
    if (ending) return ending; // a second STOP while the first is still persisting is the same STOP
    gen++;
    ending = (async () => {
      const wasActive = bus.getState().signals.session_state === 'active';
      await teardown();
      if (wasActive) {
        const rec = await session.end();
        void coach.sessionEnd(rec); // spoken from the record's numbers, after the live bus went dark
      } else session.abort();
    })().finally(() => {
      ending = null;
    });
    return ending;
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
