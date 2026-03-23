/**
 * therapeuticFallback.ts — Rule-based therapeutic parameter generation.
 *
 * Maps heart rate zones + goal presets to binaural beat frequencies, carrier
 * tones, visual pulse rates, and breathing guidance WITHOUT requiring an AI
 * provider. Based on established neuroscience research:
 *
 * Brainwave bands:
 *   Delta  (0.5–4 Hz)  — Deep sleep, regeneration
 *   Theta  (4–8 Hz)    — Meditation, creativity, memory
 *   Alpha  (8–13 Hz)   — Relaxation, calm focus
 *   Beta   (13–30 Hz)  — Active thinking, concentration
 *   Gamma  (30–45 Hz)  — Higher cognition, 40Hz Alzheimer's protocol
 *
 * References:
 * - Oster, G. (1973) "Auditory Beats in the Brain" — binaural beat foundation
 * - Iaccarino et al. (2016) "Gamma frequency entrainment attenuates amyloid load" — 40Hz protocol
 * - Thaut, M.H. (2005) "Rhythm, Music, and the Brain" — rhythmic entrainment
 */

import { EntrainmentConfig, GoalType } from '../types.ts';

/** Heart rate zone classification */
type HRZone = 'resting' | 'low' | 'moderate' | 'elevated' | 'high';

/** Classify HR into physiological zones */
function classifyHRZone(bpm: number): HRZone {
  if (bpm <= 55) return 'resting';
  if (bpm <= 68) return 'low';
  if (bpm <= 82) return 'moderate';
  if (bpm <= 95) return 'elevated';
  return 'high';
}

/** Goal-specific parameter presets with HR zone adjustments */
interface GoalPreset {
  /** Target binaural beat frequency range [min, max] Hz */
  beatRange: [number, number];
  /** Carrier frequency Hz */
  carrierFreq: number;
  /** Breathing rate (seconds per full breath cycle) */
  breathingRate: number;
  /** Primary visual color (hex) */
  primaryColor: string;
  /** Spatial pan speed Hz */
  spatialPan: number;
  /** Induction text template */
  inductionText: string;
  /** Explanation text */
  explanation: string;
}

const GOAL_PRESETS: Record<GoalType, GoalPreset> = {
  [GoalType.RELAXATION]: {
    beatRange: [6, 10],       // Theta-Alpha crossover
    carrierFreq: 200,
    breathingRate: 6,         // ~10 breaths/min — parasympathetic activation
    primaryColor: '#6366f1',  // Indigo — calming
    spatialPan: 0.1,
    inductionText: 'Release tension with each exhale. Your body knows how to rest.',
    explanation: 'Theta-alpha entrainment to promote parasympathetic relaxation.',
  },
  [GoalType.FOCUS]: {
    beatRange: [14, 20],      // Low Beta — concentrated attention
    carrierFreq: 300,
    breathingRate: 4,         // Slightly faster — alert but controlled
    primaryColor: '#f59e0b',  // Amber — warm alertness
    spatialPan: 0.2,
    inductionText: 'Sharpen your awareness. One point of focus, expanding clarity.',
    explanation: 'Low-beta entrainment for sustained concentration without anxiety.',
  },
  [GoalType.ENERGY]: {
    beatRange: [18, 28],      // High Beta — energizing
    carrierFreq: 400,
    breathingRate: 3.5,       // Energizing breath pace
    primaryColor: '#ef4444',  // Red — activation
    spatialPan: 0.3,
    inductionText: 'Feel the charge building. Vitality flows through every cell.',
    explanation: 'High-beta entrainment to boost alertness and physical energy.',
  },
  [GoalType.NEURO_REGEN]: {
    beatRange: [40, 40],      // Gamma — fixed 40Hz (Iaccarino protocol)
    carrierFreq: 220,
    breathingRate: 5,         // Moderate pace
    primaryColor: '#a855f7',  // Purple — neural healing
    spatialPan: 0.15,
    inductionText: 'Neural pathways activate. Gamma waves sweep and renew.',
    explanation: '40Hz gamma protocol — research-backed frequency for neural regeneration.',
  },
  [GoalType.SELF_LOVE]: {
    beatRange: [7, 9],        // Mid-theta — emotional processing
    carrierFreq: 222,
    breathingRate: 6,
    primaryColor: '#ff66cc',  // Pink — self-compassion
    spatialPan: 0.3,
    inductionText: 'Warmth rising, safe and centered. Breathe into your own gravity.',
    explanation: 'Self-love protocol: mid-theta with gentle carrier and slow breathing.',
  },
};

/**
 * HR zone modifiers — adjust beat frequency based on current physiology.
 *
 * If HR is elevated, we shift beat frequency down (calming) for relaxation goals
 * or maintain/push higher for energy goals. This creates the closed-loop
 * feedback that adapts to the user's real-time state.
 */
const HR_ZONE_BEAT_OFFSETS: Record<GoalType, Record<HRZone, number>> = {
  [GoalType.RELAXATION]: {
    resting: 0,       // Already calm — hold steady
    low: -0.5,        // Nudge deeper toward theta
    moderate: 0,      // Normal starting point
    elevated: -2,     // HR elevated — push more toward relaxation
    high: -3,         // Stressed — strong theta push
  },
  [GoalType.FOCUS]: {
    resting: 2,       // Very calm — push beta higher for alertness
    low: 1,
    moderate: 0,
    elevated: -1,     // Already alert — don't overstimulate
    high: -3,         // Too activated — bring down toward alpha-beta boundary
  },
  [GoalType.ENERGY]: {
    resting: 4,       // Need activation — push higher
    low: 2,
    moderate: 0,
    elevated: 0,
    high: -2,         // Already energized — don't push too far
  },
  [GoalType.NEURO_REGEN]: {
    resting: 0,       // 40Hz is fixed regardless of HR
    low: 0,
    moderate: 0,
    elevated: 0,
    high: 0,
  },
  [GoalType.SELF_LOVE]: {
    resting: 0,
    low: -0.5,
    moderate: 0,
    elevated: -1,
    high: -2,         // Stressed — deepen theta for emotional settling
  },
};

/** Breathing rate adjustments per HR zone (seconds added to base) */
const HR_ZONE_BREATH_OFFSETS: Record<HRZone, number> = {
  resting: -0.5,     // Already calm — slightly faster is fine
  low: 0,
  moderate: 0,
  elevated: 1,       // Slow breathing to trigger parasympathetic
  high: 1.5,         // Much slower breathing for calming
};

/**
 * Carrier frequency adjustments — lower carriers feel warmer/deeper,
 * higher carriers feel brighter/sharper.
 */
const HR_ZONE_CARRIER_OFFSETS: Record<HRZone, number> = {
  resting: -20,
  low: -10,
  moderate: 0,
  elevated: 10,
  high: 20,
};

/**
 * Generate entrainment configuration using rule-based therapeutic logic.
 *
 * This is the offline fallback that runs when no AI provider is configured
 * or when the AI connection fails. It maps:
 *   (goal + current HR + HRV) → entrainment parameters
 *
 * @param goal - User's selected therapeutic goal
 * @param currentBpm - Current heart rate in BPM (0 if not yet detected)
 * @param currentHrv - Current HRV in ms (RMSSD)
 * @returns EntrainmentConfig with all fields populated
 */
export function generateOfflineConfig(
  goal: GoalType,
  currentBpm: number,
  currentHrv: number
): EntrainmentConfig {
  const preset = GOAL_PRESETS[goal];
  const hrZone = classifyHRZone(currentBpm || 72); // Default to moderate if no signal

  // Calculate beat frequency from preset range + HR zone offset
  const [minBeat, maxBeat] = preset.beatRange;
  const midBeat = (minBeat + maxBeat) / 2;
  const offset = HR_ZONE_BEAT_OFFSETS[goal][hrZone];
  const rawBeat = midBeat + offset;
  const binauralBeatFreq = Math.round(clamp(rawBeat, 1, 45) * 10) / 10;

  // Visual pulse tracks beat frequency
  const visualPulseRate = binauralBeatFreq;

  // Carrier adjusts with HR zone
  const carrierFreq = clamp(
    preset.carrierFreq + HR_ZONE_CARRIER_OFFSETS[hrZone],
    100,
    600
  );

  // Breathing rate adjusts with HR zone
  const breathingRate = clamp(
    preset.breathingRate + HR_ZONE_BREATH_OFFSETS[hrZone],
    3,
    8
  );

  // HRV-based refinement: low HRV suggests stress → deepen relaxation effect
  let hrvAdjustment = 0;
  if (currentHrv > 0 && currentHrv < 25) {
    // Low HRV — autonomic stress indicator
    hrvAdjustment = -1; // Shift beat freq down for calming
  } else if (currentHrv > 60) {
    // High HRV — good vagal tone, can push toward target more aggressively
    hrvAdjustment = 0.5;
  }

  const finalBeat = clamp(binauralBeatFreq + hrvAdjustment, 1, 45);

  // Build context-aware induction text
  const zoneDescriptor = hrZone === 'high' ? 'Your heart rate is elevated. ' :
                         hrZone === 'resting' ? 'Your body is deeply at rest. ' : '';
  const inductionText = zoneDescriptor + preset.inductionText;

  // Build explanation with current state info
  const explanation = `${preset.explanation} [Offline mode · HR zone: ${hrZone} · Beat: ${finalBeat}Hz · Breath: ${breathingRate}s]`;

  return {
    binauralBeatFreq: Math.round(finalBeat * 10) / 10,
    carrierFreq: Math.round(carrierFreq),
    visualPulseRate: Math.round(finalBeat * 10) / 10,
    primaryColor: preset.primaryColor,
    breathingRate: Math.round(breathingRate * 10) / 10,
    spatialPan: preset.spatialPan,
    inductionText,
    explanation,
  };
}

/** Clamp a number between min and max */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Check if offline fallback should be used.
 * Returns true if no AI provider is configured or connection appears down.
 * Checks the encrypted vault for keys when providerConfig.apiKey is empty.
 */
export async function shouldUseOfflineFallback(
  providerConfig: { apiKey?: string; baseUrl?: string; model?: string; provider?: string } | null | undefined
): Promise<boolean> {
  if (!providerConfig) return true;
  if (!providerConfig.baseUrl || !providerConfig.model) return true;
  // If apiKey is present in config, we're good
  if (providerConfig.apiKey) return false;
  // Otherwise check the vault
  if (providerConfig.provider) {
    const { resolveApiKey } = await import('./providers.ts');
    const vaultKey = await resolveApiKey(providerConfig.provider);
    if (vaultKey) return false;
  }
  return true;
}
