import { describe, it, expect } from 'vitest';
import { HeartbeatEngine, MIN } from '../../src/engine/engine';
import type { BioFrame, RoiSample, RppgMethod } from '../../src/engine/types';
import { prng, synthRgb } from './synthetic';

interface FeedOpts {
  bpm: number;
  drift?: number;
  badCheek?: boolean;
  n?: number;
  jitterMs?: number;
}

/** Feed n samples; forehead strongest, cheeks 80% amplitude; optional noisy right cheek. Returns the last frame. */
function feed(method: RppgMethod, o: FeedOpts, engine = new HeartbeatEngine()): BioFrame {
  const n = o.n ?? 300;
  const fps = 30;
  const forehead = synthRgb({ bpm: o.bpm, n, drift: o.drift, seed: 1 });
  const cheekL = synthRgb({ bpm: o.bpm, n, drift: o.drift, amp: 0.8, seed: 2 });
  const cheekR = o.badCheek
    ? synthRgb({ bpm: o.bpm, n, drift: o.drift, amp: 0.05, noise: 30, seed: 3 })
    : synthRgb({ bpm: o.bpm, n, drift: o.drift, amp: 0.8, seed: 3 });
  const rnd = prng(99);
  let last: BioFrame | null = null;
  for (let i = 0; i < n; i++) {
    const rgb = (rows: number[][]) => ({ r: rows[i][0], g: rows[i][1], b: rows[i][2] });
    const s: RoiSample = {
      t: (1000 * i) / fps + (o.jitterMs ?? 0) * rnd(),
      rois: { forehead: rgb(forehead), cheekL: rgb(cheekL), cheekR: rgb(cheekR) },
    };
    last = engine.process(s, method);
  }
  return last!;
}

describe('HeartbeatEngine', () => {
  it('returns nulls before MIN samples and never a spurious BPM', () => {
    const e = new HeartbeatEngine();
    let f: BioFrame | null = null;
    for (let i = 0; i < MIN - 1; i++)
      f = e.process({ t: i * 33, rois: { forehead: { r: 1, g: 1, b: 1 }, cheekL: { r: 1, g: 1, b: 1 }, cheekR: { r: 1, g: 1, b: 1 } } }, 'auto');
    expect(f!.bpm).toBeNull();
    expect(f!.method).toBeNull();
  });

  it('flat input after warm-up still yields no BPM', () => {
    const e = new HeartbeatEngine();
    let f: BioFrame | null = null;
    for (let i = 0; i < 200; i++)
      f = e.process({ t: i * 33, rois: { forehead: { r: 100, g: 100, b: 100 }, cheekL: { r: 100, g: 100, b: 100 }, cheekR: { r: 100, g: 100, b: 100 } } }, 'auto');
    expect(f!.bpm).toBeNull();
  });

  it('measures fps from timestamps', () => {
    const f = feed('pos', { bpm: 72 });
    expect(f.fps).toBeCloseTo(30, 0);
  });

  it('POS recovers 72 BPM under heavy illumination drift', () => {
    const f = feed('pos', { bpm: 72, drift: 0.05 });
    expect(Math.abs(f.bpm! - 72)).toBeLessThanOrEqual(2);
    expect(f.sqi).toBeGreaterThan(0.3);
  });

  it('AUTO picks a drift-resistant method under drift and tracks BPM', () => {
    const f = feed('auto', { bpm: 66, drift: 0.05 });
    expect(['chrom', 'pos']).toContain(f.method);
    expect(Math.abs(f.bpm! - 66)).toBeLessThanOrEqual(2);
  });

  it('a noisy cheek ROI does not wreck the fused estimate', () => {
    const f = feed('pos', { bpm: 72, drift: 0.02, badCheek: true });
    expect(Math.abs(f.bpm! - 72)).toBeLessThanOrEqual(2);
  });

  it('survives ±5 ms timestamp jitter', () => {
    const f = feed('pos', { bpm: 90, jitterMs: 10 });
    expect(Math.abs(f.bpm! - 90)).toBeLessThanOrEqual(2);
  });

  it('reports HRV once beats are visible and coherence once history exists', () => {
    const e = new HeartbeatEngine();
    const f = feed('green', { bpm: 60, n: 600 }, e);
    expect(f.hrv).not.toBeNull();
    expect(f.hrv!).toBeLessThan(30); // synthetic beats are regular
    expect(f.coherence).not.toBeNull();
  });

  it('reset clears the window', () => {
    const e = new HeartbeatEngine();
    feed('pos', { bpm: 72 }, e);
    e.reset();
    const f = e.process({ t: 0, rois: { forehead: { r: 1, g: 1, b: 1 }, cheekL: { r: 1, g: 1, b: 1 }, cheekR: { r: 1, g: 1, b: 1 } } }, 'pos');
    expect(f.bpm).toBeNull();
  });
});
