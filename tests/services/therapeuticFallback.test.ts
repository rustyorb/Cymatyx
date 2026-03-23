import { describe, it, expect, vi } from 'vitest';
import { GoalType } from '../../types.ts';
import { generateOfflineConfig, shouldUseOfflineFallback } from '../../services/therapeuticFallback.ts';

const ALL_GOALS = [
  GoalType.RELAXATION,
  GoalType.FOCUS,
  GoalType.ENERGY,
  GoalType.NEURO_REGEN,
  GoalType.SELF_LOVE,
];

const REQUIRED_FIELDS = [
  'binauralBeatFreq',
  'carrierFreq',
  'visualPulseRate',
  'primaryColor',
  'breathingRate',
  'spatialPan',
  'inductionText',
  'explanation',
] as const;

describe('therapeuticFallback', () => {
  // ── generateOfflineConfig: valid config for each GoalType ───────────
  describe('generates valid EntrainmentConfig for each GoalType', () => {
    for (const goal of ALL_GOALS) {
      it(`${goal} produces config with all required fields`, () => {
        const config = generateOfflineConfig(goal, 72, 40);
        for (const field of REQUIRED_FIELDS) {
          expect(config).toHaveProperty(field);
          expect(config[field]).toBeDefined();
        }
      });

      it(`${goal} has numeric frequency fields`, () => {
        const config = generateOfflineConfig(goal, 72, 40);
        expect(typeof config.binauralBeatFreq).toBe('number');
        expect(typeof config.carrierFreq).toBe('number');
        expect(typeof config.visualPulseRate).toBe('number');
        expect(typeof config.breathingRate).toBe('number');
        expect(typeof config.spatialPan).toBe('number');
      });
    }
  });

  // ── NEURO_REGEN always ~40Hz ────────────────────────────────────────
  describe('NEURO_REGEN produces ~40Hz binauralBeatFreq', () => {
    it('at moderate HR (72 bpm)', () => {
      const config = generateOfflineConfig(GoalType.NEURO_REGEN, 72, 40);
      expect(config.binauralBeatFreq).toBeGreaterThanOrEqual(39);
      expect(config.binauralBeatFreq).toBeLessThanOrEqual(41);
    });

    it('at resting HR (50 bpm)', () => {
      const config = generateOfflineConfig(GoalType.NEURO_REGEN, 50, 40);
      expect(config.binauralBeatFreq).toBeGreaterThanOrEqual(39);
      expect(config.binauralBeatFreq).toBeLessThanOrEqual(41);
    });

    it('at high HR (100 bpm)', () => {
      const config = generateOfflineConfig(GoalType.NEURO_REGEN, 100, 40);
      expect(config.binauralBeatFreq).toBeGreaterThanOrEqual(39);
      expect(config.binauralBeatFreq).toBeLessThanOrEqual(41);
    });

    it('with low HRV', () => {
      const config = generateOfflineConfig(GoalType.NEURO_REGEN, 72, 20);
      expect(config.binauralBeatFreq).toBeGreaterThanOrEqual(38);
      expect(config.binauralBeatFreq).toBeLessThanOrEqual(41);
    });

    it('with high HRV', () => {
      const config = generateOfflineConfig(GoalType.NEURO_REGEN, 72, 70);
      expect(config.binauralBeatFreq).toBeGreaterThanOrEqual(39);
      expect(config.binauralBeatFreq).toBeLessThanOrEqual(41);
    });
  });

  // ── HR zone boundaries ──────────────────────────────────────────────
  describe('HR zone classification boundaries', () => {
    it('bpm=0 defaults to moderate zone', () => {
      // bpm=0 → classifyHRZone(72) → moderate
      const config = generateOfflineConfig(GoalType.RELAXATION, 0, 40);
      expect(config.explanation).toContain('moderate');
    });

    it('bpm=55 → resting zone', () => {
      const config = generateOfflineConfig(GoalType.RELAXATION, 55, 40);
      expect(config.explanation).toContain('resting');
    });

    it('bpm=56 → low zone', () => {
      const config = generateOfflineConfig(GoalType.RELAXATION, 56, 40);
      expect(config.explanation).toContain('low');
    });

    it('bpm=82 → moderate zone', () => {
      const config = generateOfflineConfig(GoalType.RELAXATION, 82, 40);
      expect(config.explanation).toContain('moderate');
    });

    it('bpm=83 → elevated zone', () => {
      const config = generateOfflineConfig(GoalType.RELAXATION, 83, 40);
      expect(config.explanation).toContain('elevated');
    });

    it('bpm=96 → high zone', () => {
      const config = generateOfflineConfig(GoalType.RELAXATION, 96, 40);
      expect(config.explanation).toContain('high');
    });
  });

  // ── HRV adjustments ─────────────────────────────────────────────────
  describe('HRV adjustments', () => {
    it('low HRV (20) shifts beat frequency down', () => {
      const baseline = generateOfflineConfig(GoalType.RELAXATION, 72, 40);
      const lowHrv = generateOfflineConfig(GoalType.RELAXATION, 72, 20);
      expect(lowHrv.binauralBeatFreq).toBeLessThan(baseline.binauralBeatFreq);
    });

    it('high HRV (70) shifts beat frequency up', () => {
      const baseline = generateOfflineConfig(GoalType.RELAXATION, 72, 40);
      const highHrv = generateOfflineConfig(GoalType.RELAXATION, 72, 70);
      expect(highHrv.binauralBeatFreq).toBeGreaterThan(baseline.binauralBeatFreq);
    });
  });

  // ── Value clamping ──────────────────────────────────────────────────
  describe('value clamping', () => {
    for (const goal of ALL_GOALS) {
      it(`${goal} clamps beat frequency to 1-45`, () => {
        // Test with extreme HR values
        for (const bpm of [0, 30, 50, 72, 100, 200]) {
          for (const hrv of [0, 10, 20, 40, 70, 100]) {
            const config = generateOfflineConfig(goal, bpm, hrv);
            expect(config.binauralBeatFreq).toBeGreaterThanOrEqual(1);
            expect(config.binauralBeatFreq).toBeLessThanOrEqual(45);
          }
        }
      });

      it(`${goal} clamps carrier frequency to 100-600`, () => {
        for (const bpm of [0, 50, 72, 100, 200]) {
          const config = generateOfflineConfig(goal, bpm, 40);
          expect(config.carrierFreq).toBeGreaterThanOrEqual(100);
          expect(config.carrierFreq).toBeLessThanOrEqual(600);
        }
      });

      it(`${goal} clamps breathing rate to 3-8`, () => {
        for (const bpm of [0, 50, 72, 100, 200]) {
          const config = generateOfflineConfig(goal, bpm, 40);
          expect(config.breathingRate).toBeGreaterThanOrEqual(3);
          expect(config.breathingRate).toBeLessThanOrEqual(8);
        }
      });
    }
  });

  // ── Elevated/high HR zones add descriptor to inductionText ──────────
  describe('elevated/high HR zones add zone descriptor to inductionText', () => {
    it('high HR zone adds descriptor to inductionText', () => {
      const config = generateOfflineConfig(GoalType.RELAXATION, 96, 40);
      expect(config.inductionText).toContain('heart rate is elevated');
    });

    it('resting HR zone adds descriptor to inductionText', () => {
      const config = generateOfflineConfig(GoalType.RELAXATION, 50, 40);
      expect(config.inductionText).toContain('deeply at rest');
    });

    it('moderate HR zone does NOT add extra descriptor', () => {
      const config = generateOfflineConfig(GoalType.RELAXATION, 72, 40);
      // Should just start with the preset text
      expect(config.inductionText).not.toContain('heart rate');
      expect(config.inductionText).not.toContain('deeply at rest');
    });
  });

  // ── shouldUseOfflineFallback ────────────────────────────────────────
  describe('shouldUseOfflineFallback', () => {
    it('returns true for null config', async () => {
      expect(await shouldUseOfflineFallback(null)).toBe(true);
    });

    it('returns true for undefined config', async () => {
      expect(await shouldUseOfflineFallback(undefined)).toBe(true);
    });

    it('returns true when baseUrl is missing', async () => {
      expect(await shouldUseOfflineFallback({ apiKey: 'key', model: 'model' })).toBe(true);
    });

    it('returns true when model is missing', async () => {
      expect(await shouldUseOfflineFallback({ apiKey: 'key', baseUrl: 'http://localhost' })).toBe(true);
    });

    it('returns false when apiKey is present with baseUrl and model', async () => {
      expect(
        await shouldUseOfflineFallback({
          apiKey: 'test-key',
          baseUrl: 'http://localhost:8080',
          model: 'gpt-4',
        })
      ).toBe(false);
    });

    it('returns true for empty object', async () => {
      expect(await shouldUseOfflineFallback({})).toBe(true);
    });
  });
});
