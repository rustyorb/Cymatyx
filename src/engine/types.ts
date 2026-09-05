export type RppgMethod = 'green' | 'chrom' | 'pos' | 'auto';
export type RoiName = 'forehead' | 'cheekL' | 'cheekR';
export interface Rgb {
  r: number;
  g: number;
  b: number;
}
/** One camera frame reduced to mean colour per region of interest. `t` in ms (performance.now()). */
export interface RoiSample {
  t: number;
  rois: Record<RoiName, Rgb>;
}
export interface SpectrumPoint {
  bpm: number;
  power: number;
}
export interface BioFrame {
  t: number;
  bpm: number | null;
  hrv: number | null; // RMSSD ms
  coherence: number | null; // 0..100
  sqi: number | null; // 0..1
  confidence: number | null; // 0..1
  method: Exclude<RppgMethod, 'auto'> | null;
  fps: number | null;
  waveform: number[]; // processed chosen signal, for the scope
  spectrum: SpectrumPoint[];
}

export const EMPTY_FRAME = (t: number): BioFrame => ({
  t,
  bpm: null,
  hrv: null,
  coherence: null,
  sqi: null,
  confidence: null,
  method: null,
  fps: null,
  waveform: [],
  spectrum: [],
});
