import { describe, it, expect } from 'vitest';
import { powerSpectrum, analyzeSpectrum } from '../../src/engine/spectrum';
import { prng, tone } from './synthetic';

const BIN = (60 * 30) / 120; // one native FFT bin for 120 samples @ 30 fps = 15 BPM

describe('spectrum', () => {
  it('finds the peak of a clean 72 BPM tone within 1 BPM', () => {
    expect(Math.abs(analyzeSpectrum(powerSpectrum(tone(72), 30), BIN).bpm - 72)).toBeLessThanOrEqual(1);
  });

  it('holds ≤1 BPM error across the band and across phases', () => {
    for (const bpm of [48, 72, 120, 174])
      for (const phase of [0, 1.1, 2.7]) {
        const { bpm: est } = analyzeSpectrum(powerSpectrum(tone(bpm, 300, 30, phase), 30), (60 * 30) / 300);
        expect(Math.abs(est - bpm)).toBeLessThanOrEqual(1);
      }
  });

  it('parabolic refinement lands an off-bin 71.4 BPM tone within 1 BPM and off the integer grid', () => {
    const { bpm } = analyzeSpectrum(powerSpectrum(tone(71.4), 30), BIN);
    expect(Math.abs(bpm - 71.4)).toBeLessThanOrEqual(1);
    expect(bpm % 1).not.toBe(0);
  });

  it('SQI is high for a pure tone and low for white noise', () => {
    const pure = analyzeSpectrum(powerSpectrum(tone(72), 30), BIN).sqi;
    const rnd = prng(3);
    const noise = analyzeSpectrum(powerSpectrum(Array.from({ length: 120 }, rnd), 30), BIN).sqi;
    expect(pure).toBeGreaterThan(0.5);
    expect(noise).toBeLessThan(pure * 0.6);
  });

  it('SQI formula: peak neighborhood power over total power, exactly', () => {
    const powers = [1, 1, 2, 10, 2, 1, 1, 1, 1, 1];
    const sp = powers.map((power, i) => ({ bpm: 60 + i, power }));
    const { sqi, bpm } = analyzeSpectrum(sp, 1);
    expect(sqi).toBeCloseTo(14 / 21, 9);
    expect(bpm).toBe(63); // symmetric neighbours → no parabolic offset
  });

  it('returns zeros for a flat signal and for an empty spectrum', () => {
    expect(analyzeSpectrum(powerSpectrum(new Array(120).fill(0), 30), BIN)).toEqual({ bpm: 0, sqi: 0, maxPower: 0 });
    expect(analyzeSpectrum([], BIN)).toEqual({ bpm: 0, sqi: 0, maxPower: 0 });
    expect(powerSpectrum([1, 2], 30)).toEqual([]);
  });

  it('is robust to timing jitter and dropped frames (peak within 1 BPM)', () => {
    // 72 BPM sampled with ±5 ms jitter and 5% drops, then resampled to a nominal grid by the caller's fps estimate
    const rnd = prng(11);
    const ts: number[] = [];
    const sig: number[] = [];
    for (let i = 0, t = 0; i < 300; i++, t += 1000 / 30) {
      if (rnd() < -0.45) continue; // drop ~5%
      const tt = t + 10 * rnd();
      ts.push(tt);
      sig.push(Math.sin(2 * Math.PI * 1.2 * (tt / 1000)));
    }
    const fps = ((ts.length - 1) * 1000) / (ts[ts.length - 1] - ts[0]);
    const { bpm } = analyzeSpectrum(powerSpectrum(sig, fps), (60 * fps) / sig.length);
    expect(Math.abs(bpm - 72)).toBeLessThanOrEqual(1);
  });
});
