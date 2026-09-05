import type { BioFrame, RoiSample, RppgMethod } from './types';
import type { EngineIn } from './worker';

export interface EngineClient {
  push(sample: RoiSample, method: RppgMethod): void;
  reset(): void;
  terminate(): void;
}

/** Main-thread handle to the engine Worker. */
export function createEngineClient(onFrame: (f: BioFrame) => void, onError?: (e: Error) => void): EngineClient {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<{ type: 'frame'; frame: BioFrame }>) => {
    if (e.data.type === 'frame') onFrame(e.data.frame);
  };
  worker.onerror = (e) => onError?.(new Error(`Engine worker: ${e.message || 'failed'}`));
  const post = (m: EngineIn) => worker.postMessage(m);
  return {
    push: (sample, method) => post({ type: 'sample', sample, method }),
    reset: () => post({ type: 'reset' }),
    terminate: () => worker.terminate(),
  };
}
