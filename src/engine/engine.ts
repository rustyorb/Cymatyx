import { greenTrace, chromTrace, posTrace, postProcess, type RgbRow } from './candidates';
import { powerSpectrum, analyzeSpectrum } from './spectrum';
import { detectPeaks, rmssd } from './peaks';
import { coherenceScore } from './coherence';
import { EMPTY_FRAME, type BioFrame, type RoiName, type RoiSample, type RppgMethod, type SpectrumPoint } from './types';

const ROIS: RoiName[] = ['forehead', 'cheekL', 'cheekR'];
export const WINDOW = 240; // ~8 s @ 30 fps
export const MIN = 90; // ~3 s before the first reading
const SWITCH_MARGIN = 1.15; // AUTO only switches when a rival beats the incumbent's SQI by 15%
const ROI_KEEP = 0.5; // ROIs below half the best ROI's SQI are dropped from fusion

type Method = Exclude<RppgMethod, 'auto'>;
const TRACE: Record<Method, (rows: RgbRow[]) => number[]> = { green: greenTrace, chrom: chromTrace, pos: posTrace };

interface Candidate {
  method: Method;
  waveform: number[];
  spectrum: SpectrumPoint[];
  bpm: number;
  sqi: number;
  maxPower: number;
}

/**
 * Sliding-window rPPG. Pure and synchronous: feed RoiSamples, get BioFrames. Lives in a Worker in the app.
 * Per method: per-ROI candidate trace → per-ROI spectral SQI → SQI-weighted fusion of the good ROIs →
 * spectrum of the fused trace → peak (parabolic) + SQI. AUTO keeps the incumbent method unless beaten clearly.
 */
export class HeartbeatEngine {
  private win: Record<RoiName, RgbRow[]> = { forehead: [], cheekL: [], cheekR: [] };
  private ts: number[] = [];
  private hrvHistory: number[] = [];
  private incumbent: Method | null = null;

  /** Frame rate measured from the timestamps actually in the window — webcams do not deliver a clean 30. */
  get fps(): number {
    const n = this.ts.length;
    const span = n > 1 ? (this.ts[n - 1] - this.ts[0]) / 1000 : 0;
    return span > 0 ? (n - 1) / span : 30;
  }

  process(sample: RoiSample, method: RppgMethod): BioFrame {
    this.ts.push(sample.t);
    for (const roi of ROIS) {
      const c = sample.rois[roi];
      this.win[roi].push([c.r, c.g, c.b]);
      if (this.win[roi].length > WINDOW) this.win[roi].shift();
    }
    if (this.ts.length > WINDOW) this.ts.shift();
    if (this.ts.length < MIN) return EMPTY_FRAME(sample.t);

    const fps = this.fps;
    const binBpm = (60 * fps) / this.ts.length; // one native FFT bin, in BPM
    const methods: Method[] = method === 'auto' ? ['pos', 'chrom', 'green'] : [method];
    const candidates = methods.map((m) => this.evaluate(m, fps, binBpm));
    let best = candidates.reduce((a, c) => (c.sqi > a.sqi ? c : a));
    if (method === 'auto' && this.incumbent) {
      const inc = candidates.find((c) => c.method === this.incumbent);
      if (inc && inc.sqi * SWITCH_MARGIN >= best.sqi) best = inc;
    }
    this.incumbent = best.method;
    if (best.bpm === 0) return { ...EMPTY_FRAME(sample.t), fps };

    const avg = best.spectrum.reduce((a, p) => a + p.power, 0) / best.spectrum.length;
    const confidence = Math.min(1, best.maxPower / (avg * 4 || 1));
    const peaks = detectPeaks(best.waveform, fps);
    const hrv = rmssd(peaks, this.ts);
    if (hrv > 0) {
      this.hrvHistory.push(hrv);
      if (this.hrvHistory.length > 60) this.hrvHistory.shift();
    }

    return {
      t: sample.t,
      bpm: Math.round(best.bpm * 10) / 10,
      hrv: hrv > 0 ? Math.round(hrv * 10) / 10 : null,
      coherence: coherenceScore(this.hrvHistory),
      sqi: Math.round(best.sqi * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
      method: best.method,
      fps: Math.round(fps * 10) / 10,
      waveform: best.waveform,
      spectrum: best.spectrum,
    };
  }

  private evaluate(m: Method, fps: number, binBpm: number): Candidate {
    const perRoi = ROIS.map((roi) => {
      const proc = postProcess(TRACE[m](this.win[roi]));
      const { sqi } = analyzeSpectrum(powerSpectrum(proc, fps), binBpm);
      return { proc, sqi };
    });
    const maxSqi = Math.max(...perRoi.map((r) => r.sqi));
    const kept = perRoi.filter((r) => r.sqi >= ROI_KEEP * maxSqi);
    const wsum = kept.reduce((a, r) => a + r.sqi, 0) || 1;
    const len = this.ts.length;
    const fused = new Array<number>(len);
    for (let i = 0; i < len; i++) {
      let v = 0;
      for (const r of kept) v += (r.sqi / wsum) * r.proc[i];
      fused[i] = v;
    }
    const waveform = postProcess(fused);
    const spectrum = powerSpectrum(waveform, fps);
    const { bpm, sqi, maxPower } = analyzeSpectrum(spectrum, binBpm);
    return { method: m, waveform, spectrum, bpm, sqi, maxPower };
  }

  reset() {
    this.win = { forehead: [], cheekL: [], cheekR: [] };
    this.ts = [];
    this.hrvHistory = [];
    this.incumbent = null;
  }
}
