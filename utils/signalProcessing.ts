/**
 * Pure JS rPPG Engine 
 * Inspired by the provided OpenCV implementation but optimized for Web Performance.
 */

export interface SpectrumPoint {
  bpm: number;
  power: number;
}

export class HeartbeatEngine {
  private signal: number[] = [];
  private timestamps: number[] = [];
  private windowSize = 120; // ~4 seconds at 30fps

  // 1. Moving Average Smoothing
  private movingAverage(data: number[], window: number): number[] {
    const result = [];
    for (let i = 0; i < data.length; i++) {
      const start = Math.max(0, i - window);
      const end = i + 1;
      const subset = data.slice(start, end);
      result.push(subset.reduce((a, b) => a + b, 0) / subset.length);
    }
    return result;
  }

  // 2. Detrending (High-pass style subtraction)
  private detrend(data: number[]): number[] {
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    return data.map(v => v - mean);
  }

  // 3. Simple Denoising (Z-Score Standardization)
  private standardize(data: number[]): number[] {
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const std = Math.sqrt(data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / data.length);
    return data.map(v => (v - mean) / (std || 1));
  }

  // 4. Power Spectrum Analysis (DFT)
  private calculateSpectrum(data: number[], fps: number): SpectrumPoint[] {
    const spectrum: SpectrumPoint[] = [];
    const minBpm = 45;
    const maxBpm = 180;
    
    // Scan BPM range in steps of 1
    for (let bpm = minBpm; bpm <= maxBpm; bpm++) {
      const freq = bpm / 60;
      let re = 0;
      let im = 0;
      for (let t = 0; t < data.length; t++) {
        const angle = (2 * Math.PI * freq * t) / fps;
        re += data[t] * Math.cos(angle);
        im += data[t] * Math.sin(angle);
      }
      spectrum.push({ bpm, power: Math.sqrt(re * re + im * im) });
    }
    return spectrum;
  }

  public process(greenValue: number, fps: number): { bpm: number; confidence: number; spectrum: SpectrumPoint[]; signal: number[] } {
    this.signal.push(greenValue);
    this.timestamps.push(Date.now());

    if (this.signal.length > this.windowSize) {
      this.signal.shift();
      this.timestamps.shift();
    }

    if (this.signal.length < 60) {
      return { bpm: 0, confidence: 0, spectrum: [], signal: [...this.signal] };
    }

    // Pipeline
    let processed = this.detrend(this.signal);
    processed = this.movingAverage(processed, 3);
    processed = this.standardize(processed);

    const spectrum = this.calculateSpectrum(processed, fps);
    
    // Find peak in physiological range
    let maxPower = 0;
    let peakBpm = 0;
    spectrum.forEach(p => {
      if (p.power > maxPower) {
        maxPower = p.power;
        peakBpm = p.bpm;
      }
    });

    // Confidence heuristic based on SNR
    const avgPower = spectrum.reduce((a, b) => a + b.power, 0) / spectrum.length;
    const confidence = Math.min(1, maxPower / (avgPower * 4 || 1));

    return {
      bpm: peakBpm,
      confidence,
      spectrum,
      signal: processed
    };
  }
}

export const getLightingStatus = (val: number): string => {
  if (val < 40) return "TOO DARK";
  if (val > 230) return "OVEREXPOSED";
  return "OPTIMAL";
};
