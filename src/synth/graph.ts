export interface SynthParams {
  beat_hz: number;
  carrier_hz: number;
  pulse_depth: number;
  master_gain: number;
}

export interface Synth {
  start(): Promise<void>;
  stop(): void;
  setParams(p: Partial<SynthParams>): void;
  readonly analyser: AnalyserNode | null;
  readonly running: boolean;
}

/**
 * AudioContext + worklet node + analyser. `workletUrl` comes from `?worker&url` at the call site.
 * stop() may be called while start() is still awaiting the worklet module: start() then abandons
 * the context it was building (stop() already scheduled its close) instead of wiring a dead one.
 */
export function createSynth(workletUrl: string, makeContext: () => AudioContext = () => new AudioContext(), onError?: (e: Error) => void): Synth {
  let ctx: AudioContext | null = null;
  let node: AudioWorkletNode | null = null;
  let analyser: AnalyserNode | null = null;
  const KEYS: (keyof SynthParams)[] = ['beat_hz', 'carrier_hz', 'pulse_depth', 'master_gain'];
  return {
    get analyser() {
      return analyser;
    },
    get running() {
      return ctx !== null;
    },
    async start() {
      if (ctx) return;
      const c = makeContext();
      ctx = c;
      await c.audioWorklet.addModule(workletUrl);
      if (ctx !== c) return; // stopped while the module loaded
      const n = new AudioWorkletNode(c, 'cymatyx-synth', { outputChannelCount: [2] });
      n.onprocessorerror = () => onError?.(new Error('Synth processor failed'));
      const a = c.createAnalyser();
      a.fftSize = 512;
      n.connect(a).connect(c.destination);
      node = n;
      analyser = a;
      if (c.state === 'suspended') await c.resume();
    },
    setParams(p) {
      if (!node) return;
      const msg: Partial<SynthParams> = {};
      for (const k of KEYS) if (typeof p[k] === 'number') msg[k] = p[k];
      node.port.postMessage(msg);
    },
    stop() {
      const c = ctx;
      const n = node;
      n?.port.postMessage({ master_gain: 0 });
      ctx = null;
      node = null;
      analyser = null;
      setTimeout(() => {
        n?.disconnect();
        c?.close().catch(() => {});
      }, 600);
    },
  };
}
