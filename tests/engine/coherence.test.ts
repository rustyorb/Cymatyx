import { describe, it, expect } from 'vitest';
import { coherenceFromRR } from '../../src/engine/coherence';
import type { RrPoint } from '../../src/engine/beats';
import { prng } from './synthetic';

/** Build an RR series of `seconds` from a generator of RR(ms) given beat time (s). */
function series(seconds: number, rrAt: (t: number) => number): RrPoint[] {
  const out: RrPoint[] = [];
  let t = 0;
  while (t < seconds * 1000) {
    const rr = rrAt(t / 1000);
    t += rr;
    out.push({ t, rr });
  }
  return out;
}

describe('coherence (spectral tachogram)', () => {
  it('needs 15 beats spanning 20 s', () => {
    expect(coherenceFromRR(series(10, () => 1000))).toBeNull();
    expect(coherenceFromRR(series(25, () => 1000).slice(0, 10))).toBeNull();
  });

  it('coherent 0.1 Hz respiratory sinus arrhythmia scores far above white-noise jitter of equal size', () => {
    const rnd = prng(5);
    const coherent = coherenceFromRR(series(60, (t) => 1000 + 100 * Math.sin(2 * Math.PI * 0.1 * t)));
    const noise = coherenceFromRR(series(60, () => 1000 + 200 * rnd()));
    // measured 2026-09-04: resonant RSA 98–100, white-noise RR 26–43 across seeds
    expect(coherent!).toBeGreaterThan(80);
    expect(noise!).toBeLessThan(55);
    expect(coherent!).toBeGreaterThan(noise! * 1.8);
  });

  it('coherent RSA with small noise still scores high; more chaos scores lower, not higher', () => {
    const rnd = prng(9);
    const clean = coherenceFromRR(series(60, (t) => 1000 + 150 * Math.sin(2 * Math.PI * 0.1 * t) + 10 * rnd()))!;
    const chaos = coherenceFromRR(series(60, () => 1000 + 500 * rnd()))!;
    expect(clean).toBeGreaterThan(chaos);
  });

  it('metronomic RR (no variability) scores 0, not NaN', () => {
    expect(coherenceFromRR(series(60, () => 1000))).toBe(0);
  });

  it('is bounded 0..100 and integer', () => {
    const c = coherenceFromRR(series(40, (t) => 900 + 80 * Math.sin(2 * Math.PI * 0.12 * t)))!;
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThanOrEqual(100);
    expect(Number.isInteger(c)).toBe(true);
  });
});
