import type { Goal } from '../bus/types';

export interface GoalPreset {
  beat_hz: number;
  carrier_hz: number;
  pulse_depth: number;
  breath_rate: number; // seconds per full breath
}

/** Beat bands: delta <4, theta 4–8, alpha 8–12, beta 12–30. */
export const GOALS: Record<Goal, GoalPreset> = {
  RELAXATION: { beat_hz: 7.83, carrier_hz: 200, pulse_depth: 0.25, breath_rate: 10 },
  FOCUS: { beat_hz: 14, carrier_hz: 240, pulse_depth: 0.2, breath_rate: 6 },
  ENERGY: { beat_hz: 18, carrier_hz: 260, pulse_depth: 0.3, breath_rate: 5 },
};
