export type SessionState = 'idle' | 'warming' | 'calibrating' | 'active' | 'summary';
export type RppgMethod = 'green' | 'chrom' | 'pos' | 'auto';
export type Goal = 'RELAXATION' | 'FOCUS' | 'ENERGY';
export type BreathPhase = 'inhale' | 'hold' | 'exhale';

/** Every named control signal on the bus. Measurements are null until measured. */
export interface BusSignals {
  // measured (engine)
  bpm: number | null;
  hrv_rmssd: number | null;
  coherence: number | null; // 0..100
  sqi: number | null; // 0..1
  confidence: number | null; // 0..1
  engine_method: Exclude<RppgMethod, 'auto'> | null;
  // calibration
  rsa_baseline: number | null;
  // audio params (rules -> synth)
  beat_hz: number | null;
  carrier_hz: number | null;
  pulse_depth: number | null; // 0..1 isochronic depth
  master_gain: number | null; // 0..1
  breath_rate: number | null; // seconds per full breath
  breath_phase: BreathPhase | null;
  // state
  cam_live: boolean;
  cam_status: 'off' | 'loading' | 'ready' | 'tracking' | 'lost';
  cam_device: string | null; // deviceId; null = browser default
  session_state: SessionState;
  goal: Goal;
  method_select: RppgMethod;
  last_error: string | null; // e.g. camera denied — shown on the rack, cleared on the next start
  // coach (M2)
  coach_enabled: boolean; // front latch; persists across resets
  coach_speaking: boolean;
  coach_last_line: string | null; // exactly what was spoken (or would have been, TTS off)
  tts_status: 'off' | 'ok' | 'error';
  brain_status: 'off' | 'ok' | 'error';
}

export const INITIAL_SIGNALS: BusSignals = {
  bpm: null,
  hrv_rmssd: null,
  coherence: null,
  sqi: null,
  confidence: null,
  engine_method: null,
  rsa_baseline: null,
  beat_hz: null,
  carrier_hz: null,
  pulse_depth: null,
  master_gain: null,
  breath_rate: null,
  breath_phase: null,
  cam_live: false,
  cam_status: 'off',
  cam_device: null,
  session_state: 'idle',
  goal: 'RELAXATION',
  method_select: 'auto',
  last_error: null,
  coach_enabled: true,
  coach_speaking: false,
  coach_last_line: null,
  tts_status: 'off',
  brain_status: 'off',
};

/** Signals that survive a session reset (user choices, not measurements). */
export const PERSISTENT: (keyof BusSignals)[] = ['goal', 'method_select', 'cam_device', 'coach_enabled'];
