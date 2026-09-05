import { GOALS } from './goals';
import type { Goal } from '../bus/types';

/** Keys are bus signal names — the patch goes straight onto the bus and to the synth. */
export interface ParamPatch {
  beat_hz: number;
  carrier_hz: number;
  pulse_depth: number;
  master_gain: number;
  breath_rate: number;
}
export interface Reading {
  bpm: number | null;
  coherence: number | null;
  goal: Goal;
}

/** Max change per tick (ticks are 500 ms): adaptive, never seasick. */
export const SLEW: ParamPatch = { beat_hz: 0.5, carrier_hz: 5, pulse_depth: 0.05, master_gain: 0.05, breath_rate: 0.5 };
const slew = (prev: number, target: number, max: number) => prev + Math.max(-max, Math.min(max, target - prev));

/** Offline rule engine: goal preset → HR-zone + coherence adjustments → slewed patch. Pure. */
export function modulate(r: Reading, prev: ParamPatch | null): ParamPatch {
  const g = GOALS[r.goal];
  let target: ParamPatch = { ...g, master_gain: 0.6 };
  if (r.bpm !== null) {
    // high HR under RELAXATION → slower beat, slower breath; low HR under ENERGY → push the beat up
    if (r.goal === 'RELAXATION' && r.bpm > 85) target = { ...target, beat_hz: Math.max(4, g.beat_hz - 2), breath_rate: g.breath_rate + 2 };
    if (r.goal === 'ENERGY' && r.bpm < 60) target = { ...target, beat_hz: g.beat_hz + 2 };
  }
  if (r.coherence !== null) {
    // rising coherence deepens the pulse a little (reward), never past 0.4
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
