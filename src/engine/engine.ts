import { greenTrace, chromTrace, posTrace, postProcess, type RgbRow } from './candidates';
import { powerSpectrum, analyzeSpectrum } from './spectrum';
import { detectPeaks, rmssd, peakTimes } from './peaks';
import { coherenceFromRR } from './coherence';
import { BeatTracker } from './beats';
import { EMPTY_FRAME, type BioFrame, type RoiName, type RoiSample, type RppgMethod, type SpectrumPoint } from './types';

const ROIS: RoiName[] = ['forehead', 'cheekL', 'cheekR'];
export const WINDOW = 240; // ~8 s @ 30 fps
export const MIN = 90; // ~3 s before the first reading
export const GAP_MS = 1000; // a hole this long in the sample stream is a discontinuity: start over

/**
 * Quality gates. A reading is reported only when ALL hold. Measured on synthetic signals
 * (scratch run 2026-09-04): clean pulse SQI 0.92 / prominence 12; weak noisy pulse SQI 0.45 /
 * prominence 5; pure noise SQI 0.24–0.60 / prominence 3–7 but ROI peaks disagree and the estimate
 * wanders 15–110 BPM. SQI alone cannot tell weak-real from lucky noise; agreement and stability can.
 * TUNABLE — to be re-set on real faces.
 */
export const SQI_FLOOR = 0.35; // share of band power within one native bin of the peak
export const PROMINENCE_FLOOR = 4; // peak power / mean band power
export const ROI_AGREE_BPM = 5; // a ROI "agrees" when its own peak is within this of the fused peak
export const ROI_AGREE_MIN = 2; // ROIs that must agree (of 3)
export const LOCK_FRAMES = 60; // ~2 s of gated estimates …
export const LOCK_MIN = 45; // … of which at least this many must exist …
export const LOCK_SPREAD_BPM = 8; // … and span no more than this
const SQI_FULL = 0.85; // confidence reaches 1 here
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
  prominence: number;
  agree: number;
}

/**
 * Sliding-window rPPG. Pure and synchronous: feed RoiSamples, get BioFrames. Lives in a Worker in the app.
 * Per method: per-ROI candidate trace → per-ROI spectral SQI + peak → SQI-weighted fusion of the good
 * ROIs → spectrum of the fused trace → peak (parabolic) + SQI. AUTO keeps the incumbent method unless
 * beaten clearly. A frame that fails any quality gate reports no BPM (SQI is still reported, so the
 * rack can say why the tube is dark).
 */
export class HeartbeatEngine {
  private win: Record<RoiName, RgbRow[]> = { forehead: [], cheekL: [], cheekR: [] };
  private ts: number[] = [];
  private beats = new BeatTracker();
  private incumbent: Method | null = null;
  private lock: (number | null)[] = []; // recent gated estimates (null = frame failed a gate)

  /** Frame rate measured from the timestamps actually in the window — webcams do not deliver a clean 30. */
  get fps(): number {
    const n = this.ts.length;
    const span = n > 1 ? (this.ts[n - 1] - this.ts[0]) / 1000 : 0;
    return span > 0 ? (n - 1) / span : 30;
  }

  process(sample: RoiSample, method: RppgMethod): BioFrame {
    const last = this.ts[this.ts.length - 1];
    if (last !== undefined && sample.t - last > GAP_MS) this.clearWindow();
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
    const sqi = Math.round(best.sqi * 100) / 100;
    const base: BioFrame = { ...EMPTY_FRAME(sample.t), fps: Math.round(fps * 10) / 10, sqi, method: best.method, waveform: best.waveform, spectrum: best.spectrum };

    const frameOk = best.bpm > 0 && best.sqi >= SQI_FLOOR && best.prominence >= PROMINENCE_FLOOR && best.agree >= ROI_AGREE_MIN;
    this.lock.push(frameOk ? best.bpm : null);
    if (this.lock.length > LOCK_FRAMES) this.lock.shift();
    if (!frameOk || !this.locked()) return base;

    const confidence = Math.max(0, Math.min(1, (best.sqi - SQI_FLOOR) / (SQI_FULL - SQI_FLOOR)));
    const peaks = detectPeaks(best.waveform, fps);
    const hrv = rmssd(peaks, this.ts);
    this.beats.add(peakTimes(peaks, this.ts)); // one identity per real beat, across overlapping windows

    return {
      ...base,
      bpm: Math.round(best.bpm * 10) / 10,
      hrv: hrv > 0 ? Math.round(hrv * 10) / 10 : null,
      coherence: coherenceFromRR(this.beats.rr()),
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  /** Temporal lock: enough recent gated estimates, and they agree with each other. */
  private locked(): boolean {
    const ok = this.lock.filter((b): b is number => b !== null);
    if (ok.length < LOCK_MIN) return false;
    return Math.max(...ok) - Math.min(...ok) <= LOCK_SPREAD_BPM;
  }

  private evaluate(m: Method, fps: number, binBpm: number): Candidate {
    const perRoi = ROIS.map((roi) => {
      const proc = postProcess(TRACE[m](this.win[roi]));
      const { sqi, bpm } = analyzeSpectrum(powerSpectrum(proc, fps), binBpm);
      return { proc, sqi, bpm };
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
    const mean = spectrum.reduce((a, p) => a + p.power, 0) / (spectrum.length || 1);
    const prominence = mean > 0 ? maxPower / mean : 0;
    const agree = perRoi.filter((r) => r.bpm > 0 && Math.abs(r.bpm - bpm) <= ROI_AGREE_BPM).length;
    return { method: m, waveform, spectrum, bpm, sqi, maxPower, prominence, agree };
  }

  private clearWindow() {
    this.win = { forehead: [], cheekL: [], cheekR: [] };
    this.ts = [];
    this.lock = [];
  }

  reset() {
    this.clearWindow();
    this.beats.reset();
    this.incumbent = null;
  }
}
