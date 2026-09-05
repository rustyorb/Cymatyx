import { describe, it, expect } from 'vitest';
import { greenTrace, chromTrace, posTrace, postProcess } from '../../src/engine/candidates';
import { powerSpectrum, analyzeSpectrum } from '../../src/engine/spectrum';
import { synthRgb } from './synthetic';

// Peak search widened down to 10 BPM so illumination drift (18 BPM) can win where it should.
const peakOf = (trace: number[]) => analyzeSpectrum(powerSpectrum(postProcess(trace), 30, 10, 180), 7.5).bpm;

describe('candidate traces', () => {
  const rgb = synthRgb({ bpm: 72, drift: 0.05 }); // 5% illumination swing vs 0.4% pulse

  it('green is the raw green channel', () => {
    expect(greenTrace(rgb)[5]).toBeCloseTo(rgb[5][1]);
  });
  it('GREEN is captured by illumination drift', () => {
    expect(peakOf(greenTrace(rgb))).toBeLessThan(40);
  });
  it('POS recovers the pulse under the same drift', () => {
    expect(Math.abs(peakOf(posTrace(rgb)) - 72)).toBeLessThanOrEqual(2);
  });
  it('CHROM recovers the pulse under the same drift', () => {
    expect(Math.abs(peakOf(chromTrace(rgb)) - 72)).toBeLessThanOrEqual(2);
  });
  it('all three agree on a clean signal', () => {
    const clean = synthRgb({ bpm: 66 });
    for (const t of [greenTrace, chromTrace, posTrace]) expect(Math.abs(peakOf(t(clean)) - 66)).toBeLessThanOrEqual(2);
  });
  it('empty input stays empty', () => {
    expect(posTrace([])).toEqual([]);
    expect(chromTrace([])).toEqual([]);
  });
});

describe('postProcess', () => {
  it('z-scores: mean 0, sd 1', () => {
    const out = postProcess(synthRgb({ bpm: 72 }).map((r) => r[1]));
    const m = out.reduce((a, v) => a + v, 0) / out.length;
    const sd = Math.sqrt(out.reduce((a, v) => a + (v - m) ** 2, 0) / out.length);
    expect(m).toBeCloseTo(0, 6);
    expect(sd).toBeCloseTo(1, 6);
  });
  it('flat input becomes zeros, not NaN', () => {
    expect(postProcess(new Array(50).fill(7))).toEqual(new Array(50).fill(0));
  });
  it('removes a linear trend', () => {
    const out = postProcess(Array.from({ length: 100 }, (_, i) => 3 * i + 5));
    expect(Math.max(...out.map(Math.abs))).toBeLessThan(1e-6);
  });
});
