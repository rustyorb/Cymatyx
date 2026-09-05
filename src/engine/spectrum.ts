import type { SpectrumPoint } from './types';

const tables = new Map<string, { cos: Float64Array; sin: Float64Array; bins: number; n: number }>();

/** cos/sin lookup for (bin, sample) — the DFT dominates per-frame cost, trig does not need to be recomputed. */
function trig(n: number, fps: number, minBpm: number, bins: number) {
  const key = `${n}|${fps.toFixed(1)}|${minBpm}|${bins}`;
  let t = tables.get(key);
  if (t) return t;
  const cos = new Float64Array(bins * n);
  const sin = new Float64Array(bins * n);
  for (let k = 0; k < bins; k++) {
    const f = (minBpm + k) / 60;
    for (let i = 0; i < n; i++) {
      const ang = (2 * Math.PI * f * i) / fps;
      cos[k * n + i] = Math.cos(ang);
      sin[k * n + i] = Math.sin(ang);
    }
  }
  t = { cos, sin, bins, n };
  if (tables.size > 32) tables.clear();
  tables.set(key, t);
  return t;
}

/** DFT power at 1-BPM steps over the physiological band, Hann-windowed. */
export function powerSpectrum(signal: number[], fps: number, minBpm = 45, maxBpm = 180): SpectrumPoint[] {
  const n = signal.length;
  if (n < 4 || !(fps > 0)) return [];
  const mean = signal.reduce((a, v) => a + v, 0) / n;
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = (signal[i] - mean) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  const bins = maxBpm - minBpm + 1;
  const t = trig(n, Math.round(fps * 10) / 10, minBpm, bins);
  const out: SpectrumPoint[] = new Array(bins);
  for (let k = 0; k < bins; k++) {
    let re = 0;
    let im = 0;
    const off = k * n;
    for (let i = 0; i < n; i++) {
      re += w[i] * t.cos[off + i];
      im -= w[i] * t.sin[off + i];
    }
    out[k] = { bpm: minBpm + k, power: (re * re + im * im) / n };
  }
  return out;
}

export interface SpectrumAnalysis {
  bpm: number;
  sqi: number;
  maxPower: number;
}

/**
 * Peak + SQI + parabolic sub-BPM refinement.
 * SQI = power within ±neighborhoodBpm of the peak / total in-band power (QualityPhys definition: the
 * neighborhood is ONE NATIVE FFT BIN = 60·fps/N BPM, not one scanned BPM step).
 */
export function analyzeSpectrum(sp: SpectrumPoint[], neighborhoodBpm = 1): SpectrumAnalysis {
  let peak = 0;
  let maxPower = 0;
  let total = 0;
  for (let i = 0; i < sp.length; i++) {
    total += sp[i].power;
    if (sp[i].power > maxPower) {
      maxPower = sp[i].power;
      peak = i;
    }
  }
  if (total <= 1e-12 || maxPower <= 0) return { bpm: 0, sqi: 0, maxPower: 0 };
  const half = Math.max(1, Math.round(neighborhoodBpm));
  const lo = Math.max(0, peak - half);
  const hi = Math.min(sp.length - 1, peak + half);
  let neigh = 0;
  for (let i = lo; i <= hi; i++) neigh += sp[i].power;
  let bpm = sp[peak].bpm;
  if (peak > 0 && peak < sp.length - 1) {
    const eps = 1e-20;
    const l = Math.log(sp[peak - 1].power + eps);
    const c = Math.log(sp[peak].power + eps);
    const r = Math.log(sp[peak + 1].power + eps);
    const denom = l - 2 * c + r;
    if (Math.abs(denom) > 1e-12) {
      const off = (0.5 * (l - r)) / denom;
      if (Number.isFinite(off) && Math.abs(off) <= 0.5) bpm += off;
    }
  }
  return { bpm, sqi: neigh / total, maxPower };
}
