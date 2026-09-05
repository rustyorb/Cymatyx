import { describe, it, expect } from 'vitest';
import { roiRects, meanRgb } from '../../src/sensor/roi';

function fakeLandmarks() {
  const lm = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  lm[10] = { x: 0.5, y: 0.2 }; // forehead top
  lm[151] = { x: 0.5, y: 0.3 }; // glabella
  lm[234] = { x: 0.3, y: 0.55 }; // face left
  lm[454] = { x: 0.7, y: 0.55 }; // face right
  lm[50] = { x: 0.38, y: 0.55 }; // cheek L
  lm[280] = { x: 0.62, y: 0.55 }; // cheek R
  return lm;
}

describe('roi', () => {
  it('derives forehead + cheek rects in pixel space', () => {
    const r = roiRects(fakeLandmarks(), 160, 120);
    expect(r.forehead.y).toBeLessThan(r.cheekL.y);
    expect(r.cheekL.x).toBeLessThan(r.cheekR.x);
    for (const k of ['forehead', 'cheekL', 'cheekR'] as const) {
      expect(r[k].w).toBeGreaterThan(0);
      expect(r[k].h).toBeGreaterThan(0);
      expect(r[k].x + r[k].w).toBeLessThanOrEqual(160);
      expect(r[k].y + r[k].h).toBeLessThanOrEqual(120);
    }
  });

  it('clamps rects to the frame when the face is at the edge', () => {
    const lm = fakeLandmarks().map((p) => ({ x: p.x + 0.45, y: p.y - 0.25 }));
    const r = roiRects(lm, 160, 120);
    for (const k of ['forehead', 'cheekL', 'cheekR'] as const) {
      expect(r[k].x).toBeGreaterThanOrEqual(0);
      expect(r[k].y).toBeGreaterThanOrEqual(0);
      expect(r[k].x + r[k].w).toBeLessThanOrEqual(160);
      expect(r[k].y + r[k].h).toBeLessThanOrEqual(120);
      expect(r[k].w).toBeGreaterThanOrEqual(2);
    }
  });

  it('meanRgb averages an RGBA buffer', () => {
    const data = new Uint8ClampedArray([10, 20, 30, 255, 30, 40, 50, 255]);
    expect(meanRgb(data)).toEqual({ r: 20, g: 30, b: 40 });
  });
});
