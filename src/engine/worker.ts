import { HeartbeatEngine } from './engine';
import type { RoiSample, RppgMethod } from './types';

export type EngineIn = { type: 'sample'; sample: RoiSample; method: RppgMethod } | { type: 'reset' };

const engine = new HeartbeatEngine();

self.onmessage = (e: MessageEvent<EngineIn>) => {
  if (e.data.type === 'reset') {
    engine.reset();
    return;
  }
  const frame = engine.process(e.data.sample, e.data.method);
  (self as unknown as Worker).postMessage({ type: 'frame', frame });
};
