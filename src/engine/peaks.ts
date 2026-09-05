/**
 * Local maxima above mean+0.3σ with a refractory gap of ~0.33 s (180 BPM ceiling), refined to
 * sub-sample position by a parabola through the three samples around the peak. Returns fractional
 * indices — at 30 fps an integer index would quantize R-R intervals by ±33 ms, which is larger than
 * the RMSSD being measured. Pulse-wave maxima, not ECG R-peaks.
 */
export function detectPeaks(signal: number[], fps: number): number[] {
  const minGap = Math.max(1, Math.round(fps / 3));
  const n = signal.length || 1;
  const m = signal.reduce((a, v) => a + v, 0) / n;
  const sd = Math.sqrt(signal.reduce((a, v) => a + (v - m) ** 2, 0) / n) || 1;
  const thr = m + 0.3 * sd;
  const peaks: number[] = [];
  let lastInt = -Infinity;
  for (let i = 1; i < signal.length - 1; i++) {
    if (signal[i] > thr && signal[i] >= signal[i - 1] && signal[i] > signal[i + 1] && i - lastInt >= minGap) {
      const l = signal[i - 1];
      const c = signal[i];
      const r = signal[i + 1];
      const denom = l - 2 * c + r;
      let off = denom !== 0 ? (0.5 * (l - r)) / denom : 0;
      if (!Number.isFinite(off) || Math.abs(off) > 0.5) off = 0;
      peaks.push(i + off);
      lastInt = i;
    }
  }
  return peaks;
}

/** Absolute timestamps (ms) of fractional peak indices. */
export function peakTimes(peaks: number[], timestamps: number[]): number[] {
  return peaks.map((p) => timeAt(p, timestamps));
}

/** Timestamp at a fractional sample index (linear between neighbours). */
function timeAt(p: number, ts: number[]): number {
  const i0 = Math.min(ts.length - 1, Math.max(0, Math.floor(p)));
  const i1 = Math.min(ts.length - 1, i0 + 1);
  return ts[i0] + (p - i0) * (ts[i1] - ts[i0]);
}

/**
 * RMSSD over physiologically plausible successive intervals (333–1500 ms). Only ADJACENT valid
 * intervals are differenced — an implausible interval breaks the chain rather than bridging it.
 * Needs at least one adjacent valid pair (≥3 peaks).
 */
export function rmssd(peaks: number[], timestamps: number[]): number {
  if (peaks.length < 3) return 0;
  const rr: (number | null)[] = [];
  for (let i = 1; i < peaks.length; i++) {
    const d = timeAt(peaks[i], timestamps) - timeAt(peaks[i - 1], timestamps);
    rr.push(d >= 333 && d <= 1500 ? d : null);
  }
  let s = 0;
  let pairs = 0;
  for (let i = 1; i < rr.length; i++) {
    const a = rr[i - 1];
    const b = rr[i];
    if (a === null || b === null) continue;
    s += (b - a) ** 2;
    pairs++;
  }
  return pairs ? Math.sqrt(s / pairs) : 0;
}
