// AudioWorklet global scope — these exist at runtime inside the worklet; declared here so the file stays import-free.
declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

/**
 * Cymatyx synth: three harmonic binaural layers (L = carrier·k, R = (carrier + beat)·k) under an
 * isochronic amplitude pulse at beat_hz. Params glide per block so bus patches never click.
 */
const LAYERS = [1, 1.5, 2];
const GAINS = LAYERS.map((k) => 1 / (k * 2));

interface Params {
  beat_hz: number;
  carrier_hz: number;
  pulse_depth: number;
  master_gain: number;
}

class CymatyxProcessor extends AudioWorkletProcessor {
  private phaseL = [0, 0, 0];
  private phaseR = [0, 0, 0];
  private pulsePhase = 0;
  private p: Params = { beat_hz: 7.83, carrier_hz: 200, pulse_depth: 0.25, master_gain: 0 };
  private target: Params = { ...this.p };

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<Partial<Params>>) => {
      for (const k of Object.keys(this.target) as (keyof Params)[]) {
        const v = e.data[k];
        if (typeof v === 'number' && Number.isFinite(v)) this.target[k] = v;
      }
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    if (!out || out.length < 2) return true;
    const L = out[0];
    const R = out[1];
    const n = L.length;
    const sr = sampleRate;
    for (const k of Object.keys(this.p) as (keyof Params)[]) this.p[k] += (this.target[k] - this.p[k]) * 0.05;
    const { beat_hz, carrier_hz, pulse_depth, master_gain } = this.p;
    const twoPi = 2 * Math.PI;
    for (let i = 0; i < n; i++) {
      const pulse = 1 - pulse_depth + pulse_depth * (0.5 + 0.5 * Math.sin(this.pulsePhase));
      this.pulsePhase += (twoPi * beat_hz) / sr;
      if (this.pulsePhase > twoPi) this.pulsePhase -= twoPi;
      let l = 0;
      let r = 0;
      for (let j = 0; j < LAYERS.length; j++) {
        l += GAINS[j] * Math.sin(this.phaseL[j]);
        r += GAINS[j] * Math.sin(this.phaseR[j]);
        this.phaseL[j] += (twoPi * carrier_hz * LAYERS[j]) / sr;
        this.phaseR[j] += (twoPi * (carrier_hz * LAYERS[j] + beat_hz)) / sr;
        if (this.phaseL[j] > twoPi) this.phaseL[j] -= twoPi;
        if (this.phaseR[j] > twoPi) this.phaseR[j] -= twoPi;
      }
      const g = pulse * master_gain * 0.5;
      L[i] = l * g;
      R[i] = r * g;
    }
    return true;
  }
}

registerProcessor('cymatyx-synth', CymatyxProcessor);
