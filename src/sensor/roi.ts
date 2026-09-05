import type { Rgb, RoiName } from '../engine/types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
type Pt = { x: number; y: number };

/**
 * MediaPipe FaceLandmarker (478 pts, normalized): 10 = forehead top, 151 = glabella,
 * 234 / 454 = face sides, 50 / 280 = cheek centres. Returns pixel rects on a W×H frame.
 */
export function roiRects(lm: Pt[], W: number, H: number): Record<RoiName, Rect> {
  const px = (p: Pt) => ({ x: p.x * W, y: p.y * H });
  const top = px(lm[10]);
  const glab = px(lm[151]);
  const left = px(lm[234]);
  const right = px(lm[454]);
  const cl = px(lm[50]);
  const cr = px(lm[280]);
  const faceW = Math.max(8, right.x - left.x);
  const fh = Math.max(4, (glab.y - top.y) * 0.8);
  const clamp = (r: Rect): Rect => {
    const x = Math.max(0, Math.min(W - 2, Math.round(r.x)));
    const y = Math.max(0, Math.min(H - 2, Math.round(r.y)));
    return { x, y, w: Math.max(2, Math.min(W - x, Math.round(r.w))), h: Math.max(2, Math.min(H - y, Math.round(r.h))) };
  };
  const cw = faceW * 0.16;
  const ch = faceW * 0.14;
  return {
    forehead: clamp({ x: glab.x - faceW * 0.18, y: top.y + (glab.y - top.y) * 0.1, w: faceW * 0.36, h: fh }),
    cheekL: clamp({ x: cl.x - cw / 2, y: cl.y - ch / 2, w: cw, h: ch }),
    cheekR: clamp({ x: cr.x - cw / 2, y: cr.y - ch / 2, w: cw, h: ch }),
  };
}

export function meanRgb(data: Uint8ClampedArray): Rgb {
  let r = 0;
  let g = 0;
  let b = 0;
  const n = data.length / 4 || 1;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  return { r: r / n, g: g / n, b: b / n };
}
