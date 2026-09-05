import type { RgbRow } from '../../src/engine/candidates';

export interface SynthOpts {
  bpm: number;
  fps?: number;
  n?: number;
  /** multiplicative illumination drift amplitude (0.05 = 5% swing) */
  drift?: number;
  driftHz?: number;
  /** pulse strength multiplier (1 = realistic ~0.4% green modulation) */
  amp?: number;
  /** additive white noise amplitude (counts) */
  noise?: number;
  seed?: number;
}

/** Deterministic PRNG in [-0.5, 0.5). */
export function prng(seed = 1) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647) - 0.5;
}

/**
 * Skin-like RGB model: each channel = mean · (1 + a_c · pulse) · (1 + D · drift) + noise.
 * Pulse is channel-specific (green strongest); illumination drift is common-mode and multiplicative,
 * which is exactly what CHROM/POS exist to cancel and what GREEN cannot.
 */
export function synthRgb(o: SynthOpts): RgbRow[] {
  const fps = o.fps ?? 30;
  const n = o.n ?? 240;
  const D = o.drift ?? 0;
  const dHz = o.driftHz ?? 0.3;
  const A = o.amp ?? 1;
  const N = o.noise ?? 0;
  const rnd = prng(o.seed ?? 1);
  const rows: RgbRow[] = [];
  for (let i = 0; i < n; i++) {
    const p = Math.sin((2 * Math.PI * (o.bpm / 60) * i) / fps);
    const ill = 1 + D * Math.sin((2 * Math.PI * dHz * i) / fps);
    rows.push([
      120 * (1 + 0.002 * A * p) * ill + N * rnd(),
      128 * (1 + 0.004 * A * p) * ill + N * rnd(),
      110 * (1 + 0.0025 * A * p) * ill + N * rnd(),
    ]);
  }
  return rows;
}

export const tone = (bpm: number, n = 120, fps = 30, phase = 0) =>
  Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * (bpm / 60) * i) / fps + phase));
