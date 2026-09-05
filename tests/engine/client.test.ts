import { describe, it, expect, vi, afterEach } from 'vitest';

describe('engine client protocol', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts sample/reset messages and forwards frames', async () => {
    const posted: unknown[] = [];
    let instance: FakeWorker | null = null;
    class FakeWorker {
      onmessage: ((e: MessageEvent) => void) | null = null;
      constructor() {
        instance = this;
      }
      postMessage(m: unknown) {
        posted.push(m);
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', FakeWorker);
    const { createEngineClient } = await import('../../src/engine/client');
    const frames: unknown[] = [];
    const c = createEngineClient((f) => frames.push(f));
    const sample = { t: 1, rois: { forehead: { r: 1, g: 2, b: 3 }, cheekL: { r: 1, g: 2, b: 3 }, cheekR: { r: 1, g: 2, b: 3 } } };
    c.push(sample, 'auto');
    c.reset();
    expect(posted[0]).toEqual({ type: 'sample', sample, method: 'auto' });
    expect(posted[1]).toEqual({ type: 'reset' });
    instance!.onmessage!({ data: { type: 'frame', frame: { bpm: 70 } } } as MessageEvent);
    expect(frames[0]).toEqual({ bpm: 70 });
  });
});
