import { powerSpectrum, analyzeSpectrum } from './spectrum';
import type { RrPoint } from './beats';

export const COHERENCE_MIN_BEATS = 15;
export const COHERENCE_MIN_SPAN_MS = 20_000;
const RESAMPLE_HZ = 4;
// Tachogram band 0.033–0.4 Hz expressed in cycles/min for powerSpectrum's BPM-unit scan.
const BAND_LO_CPM = 2;
const BAND_HI_CPM = 24;

/**
 * Coherence 0..100 = share of tachogram (RR-interval) power inside one native bin of the dominant
 * 0.03–0.4 Hz peak. Resonant, sinusoidal RR (paced breathing ~0.1 Hz) concentrates power in one bin;
 * erratic RR spreads it. Needs ≥15 beats spanning ≥20 s; null before that. Same instrument as the
 * pulse-band SQI, pointed at the heartbeat's own rhythm.
 */
export function coherenceFromRR(rr: RrPoint[]): number | null {
  if (rr.length < COHERENCE_MIN_BEATS) return null;
  const t0 = rr[0].t;
  const spanMs = rr[rr.length - 1].t - t0;
  if (spanMs < COHERENCE_MIN_SPAN_MS) return null;
  // resample the irregular series to a uniform grid by linear interpolation
  const n = Math.floor((spanMs / 1000) * RESAMPLE_HZ) + 1;
  const x = new Array<number>(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + (i * 1000) / RESAMPLE_HZ;
    while (j < rr.length - 2 && rr[j + 1].t < t) j++;
    const a = rr[j];
    const b = rr[Math.min(j + 1, rr.length - 1)];
    const f = b.t === a.t ? 0 : Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)));
    x[i] = a.rr + f * (b.rr - a.rr);
  }
  const sp = powerSpectrum(x, RESAMPLE_HZ, BAND_LO_CPM, BAND_HI_CPM);
  const nativeBinCpm = 60 / (spanMs / 1000);
  const { sqi, maxPower } = analyzeSpectrum(sp, nativeBinCpm);
  if (maxPower <= 0) return 0; // metronomic RR: no rhythm to be coherent with
  return Math.round(100 * Math.max(0, Math.min(1, sqi)));
}
