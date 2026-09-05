import { describe, it, expect } from 'vitest';
import { BeatTracker } from '../../src/engine/beats';

describe('BeatTracker', () => {
  it('keeps one identity per beat across overlapping re-detections', () => {
    const b = new BeatTracker();
    b.add([1000, 2000, 3000]);
    b.add([2010, 2995, 4000]); // same beats re-seen a few ms off, plus one new
    expect(b.count).toBe(4);
    expect(b.rr().map((p) => p.rr)).toEqual([1000, 1000, 1000]);
  });

  it('drops implausible intervals from the tachogram without bridging them', () => {
    const b = new BeatTracker();
    b.add([0, 1000, 3000, 4200]);
    expect(b.rr().map((p) => p.rr)).toEqual([1000, 1200]);
  });

  it('forgets beats older than 60 s', () => {
    const b = new BeatTracker();
    b.add([0, 1000, 70_000]);
    expect(b.count).toBe(1);
  });

  it('accepts unsorted input and ignores non-finite times', () => {
    const b = new BeatTracker();
    b.add([3000, NaN, 1000, 2000]);
    expect(b.rr().map((p) => p.t)).toEqual([2000, 3000]);
  });
});
