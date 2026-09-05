import { describe, it, expect } from 'vitest';
import { coherenceScore } from '../../src/engine/coherence';
import { prng } from './synthetic';

describe('coherence', () => {
  it('needs 10 samples', () => expect(coherenceScore([1, 2, 3])).toBeNull());

  it('smooth periodic HRV scores higher than erratic HRV', () => {
    const smooth = Array.from({ length: 30 }, (_, i) => 50 + 10 * Math.sin(i / 1.5));
    const rnd = prng(7);
    const erratic = Array.from({ length: 30 }, () => 50 + 60 * rnd());
    expect(coherenceScore(smooth)!).toBeGreaterThan(coherenceScore(erratic)!);
  });

  it('is bounded 0..100 and integer', () => {
    const s = coherenceScore(Array.from({ length: 30 }, (_, i) => 50 + 10 * Math.sin(i / 1.5)))!;
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
    expect(Number.isInteger(s)).toBe(true);
  });

  it('all-zero history scores 0, not NaN', () => {
    expect(coherenceScore(new Array(12).fill(0))).toBe(0);
  });
});
