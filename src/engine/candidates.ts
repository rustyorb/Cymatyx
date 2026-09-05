export type RgbRow = [number, number, number];

export function std(x: number[]): number {
  if (!x.length) return 0;
  const m = x.reduce((a, v) => a + v, 0) / x.length;
  return Math.sqrt(x.reduce((a, v) => a + (v - m) ** 2, 0) / x.length);
}

/** Divide each channel by its temporal mean (CHROM/POS precondition: illumination is multiplicative). */
function normalize(rgb: RgbRow[]): { r: number[]; g: number[]; b: number[] } {
  const n = rgb.length || 1;
  let mr = 0;
  let mg = 0;
  let mb = 0;
  for (const [r, g, b] of rgb) {
    mr += r;
    mg += g;
    mb += b;
  }
  mr = mr / n || 1e-8;
  mg = mg / n || 1e-8;
  mb = mb / n || 1e-8;
  return { r: rgb.map((c) => c[0] / mr), g: rgb.map((c) => c[1] / mg), b: rgb.map((c) => c[2] / mb) };
}

export function greenTrace(rgb: RgbRow[]): number[] {
  return rgb.map((c) => c[1]);
}

/** POS — Wang et al. 2016: S1 = G−B, S2 = G+B−2R, pos = S1 + (σ1/σ2)·S2 */
export function posTrace(rgb: RgbRow[]): number[] {
  if (!rgb.length) return [];
  const { r, g, b } = normalize(rgb);
  const s1 = g.map((v, i) => v - b[i]);
  const s2 = g.map((v, i) => v + b[i] - 2 * r[i]);
  const s2std = std(s2);
  if (s2std < 1e-12) return s1;
  const alpha = std(s1) / s2std;
  return s1.map((v, i) => v + alpha * s2[i]);
}

/** CHROM — de Haan & Jeanne 2013: X = 3R−2G, Y = 1.5R+G−1.5B, chrom = X − (σx/σy)·Y */
export function chromTrace(rgb: RgbRow[]): number[] {
  if (!rgb.length) return [];
  const { r, g, b } = normalize(rgb);
  const x = r.map((v, i) => 3 * v - 2 * g[i]);
  const y = r.map((v, i) => 1.5 * v + g[i] - 1.5 * b[i]);
  const ystd = std(y);
  if (ystd < 1e-12) return x;
  const alpha = std(x) / ystd;
  return x.map((v, i) => v - alpha * y[i]);
}

/** Shared post-pipeline: linear detrend → 3-tap moving average → z-score. Flat input stays flat (zeros). */
export function postProcess(trace: number[]): number[] {
  const n = trace.length;
  if (n < 3) return trace.slice();
  const xm = (n - 1) / 2;
  const ym = trace.reduce((a, v) => a + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xm) * (trace[i] - ym);
    den += (i - xm) ** 2;
  }
  const slope = den ? num / den : 0;
  const detr = trace.map((v, i) => v - (ym + slope * (i - xm)));
  const ma = detr.map((_, i) => {
    const lo = Math.max(0, i - 1);
    const hi = Math.min(n - 1, i + 1);
    let s = 0;
    for (let k = lo; k <= hi; k++) s += detr[k];
    return s / (hi - lo + 1);
  });
  const sd = std(ma);
  if (sd < 1e-9) return ma.map(() => 0);
  const mean = ma.reduce((a, v) => a + v, 0) / n;
  return ma.map((v) => (v - mean) / sd);
}
