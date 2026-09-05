import { describe, it, expect } from 'vitest';
import { detectPeaks, rmssd } from '../../src/engine/peaks';
import { tone } from './synthetic';

describe('peaks + RMSSD', () => {
  const fps = 30;
  const n = 300; // 10 s at 60 BPM → 10 beats
  const sig = tone(60, n, fps);
  const ts = Array.from({ length: n }, (_, i) => (1000 * i) / fps);

  it('detects roughly one peak per second at 60 BPM', () => {
    const p = detectPeaks(sig, fps);
    expect(p.length).toBeGreaterThanOrEqual(8);
    expect(p.length).toBeLessThanOrEqual(11);
  });

  it('RMSSD of perfectly regular beats is ~0; alternating ±25 ms beats ≈ 100 ms', () => {
    const p = detectPeaks(sig, fps);
    expect(rmssd(p, ts)).toBeLessThan(5);
    const jittered = ts.map((t, i) => t + (Math.floor(i / 30) % 2 ? 25 : -25));
    expect(rmssd(p, jittered)).toBeCloseTo(100, 0);
  });

  it('RMSSD from fixed intervals [1000, 1100, 1000] ms is exactly 100', () => {
    const t = [0, 1000, 2100, 3100];
    expect(rmssd([0, 1, 2, 3], t)).toBeCloseTo(100, 9);
  });

  it('needs at least 3 peaks and ignores implausible intervals', () => {
    expect(rmssd([10, 40], ts)).toBe(0);
    expect(rmssd([0, 1, 2, 3], [0, 100, 200, 300])).toBe(0); // 100 ms intervals = 600 BPM, rejected
  });
});
