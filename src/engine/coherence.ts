/**
 * 0..100 from an HRV (RMSSD) history: half from a low coefficient of variation, half from
 * autocorrelation at a respiratory lag (4–8 samples). Needs 10 samples; null before that.
 */
export function coherenceScore(hrv: number[]): number | null {
  if (hrv.length < 10) return null;
  const w = hrv.slice(-30);
  const n = w.length;
  const mean = w.reduce((a, v) => a + v, 0) / n;
  if (mean === 0) return 0;
  const variance = w.reduce((a, v) => a + (v - mean) ** 2, 0) / n;
  const cv = Math.sqrt(variance) / mean;
  const cvScore = Math.max(0, Math.min(50, (1 - cv / 0.5) * 50));
  let best = -1;
  for (let lag = 4; lag <= 8 && lag < n; lag++) {
    let num = 0;
    let cnt = 0;
    for (let i = 0; i < n - lag; i++) {
      num += (w[i] - mean) * (w[i + lag] - mean);
      cnt++;
    }
    if (cnt && variance > 0) best = Math.max(best, num / (cnt * variance));
  }
  const acScore = Math.max(0, Math.min(50, ((best + 0.2) * 50) / 1.2));
  return Math.round(Math.max(0, Math.min(100, cvScore + acScore)));
}
