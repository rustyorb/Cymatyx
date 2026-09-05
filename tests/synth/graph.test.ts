import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSynth } from '../../src/synth/graph';

function fakeContext(posted: unknown[]) {
  const connect = vi.fn().mockReturnThis();
  const ctx = {
    state: 'suspended',
    destination: {},
    audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
    createAnalyser: () => ({ fftSize: 0, connect }),
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  vi.stubGlobal(
    'AudioWorkletNode',
    class {
      port = { postMessage: (m: unknown) => posted.push(m) };
      connect = connect;
      disconnect = vi.fn();
    },
  );
  return ctx;
}

describe('synth graph', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('adds the worklet, resumes a suspended context, wires node→analyser→destination', async () => {
    const posted: unknown[] = [];
    const ctx = fakeContext(posted);
    const s = createSynth('blob:worklet', () => ctx as unknown as AudioContext);
    expect(s.running).toBe(false);
    await s.start();
    expect(ctx.audioWorklet.addModule).toHaveBeenCalledWith('blob:worklet');
    expect(ctx.resume).toHaveBeenCalled();
    expect(s.analyser).not.toBeNull();
    expect(s.running).toBe(true);
  });

  it('forwards only synth params to the worklet port, ignores breath_rate', async () => {
    const posted: unknown[] = [];
    const ctx = fakeContext(posted);
    const s = createSynth('blob:worklet', () => ctx as unknown as AudioContext);
    s.setParams({ beat_hz: 10 }); // before start: dropped, no throw
    await s.start();
    s.setParams({ beat_hz: 10, carrier_hz: 200, breath_rate: 6 } as Record<string, number>);
    expect(posted[0]).toEqual({ beat_hz: 10, carrier_hz: 200 });
  });

  it('stop during start abandons the loading context instead of wiring a dead one', async () => {
    vi.useFakeTimers();
    const posted: unknown[] = [];
    let release: () => void = () => {};
    const ctx = fakeContext(posted);
    ctx.audioWorklet.addModule = vi.fn(() => new Promise<void>((r) => (release = r)));
    const constructed = vi.fn();
    vi.stubGlobal(
      'AudioWorkletNode',
      class {
        constructor(c: unknown) {
          constructed(c);
        }
      },
    );
    const s = createSynth('blob:worklet', () => ctx as unknown as AudioContext);
    const pending = s.start();
    s.stop(); // user hit STOP while the module was loading
    release();
    await pending;
    expect(constructed).not.toHaveBeenCalled();
    expect(s.running).toBe(false);
    expect(s.analyser).toBeNull();
    vi.advanceTimersByTime(700);
    expect(ctx.close).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('stop fades the gain to 0 and closes the context later', async () => {
    vi.useFakeTimers();
    const posted: unknown[] = [];
    const ctx = fakeContext(posted);
    const s = createSynth('blob:worklet', () => ctx as unknown as AudioContext);
    await s.start();
    s.stop();
    expect(posted.at(-1)).toEqual({ master_gain: 0 });
    expect(s.running).toBe(false);
    expect(ctx.close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(700);
    expect(ctx.close).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
