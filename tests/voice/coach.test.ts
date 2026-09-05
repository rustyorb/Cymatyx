import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { bus } from '../../src/bus/store';
import { createCoach, MIN_GAP_MS } from '../../src/voice/coach';
import { DEFAULT_SETTINGS, type VoiceSettings } from '../../src/voice/settings';
import type { Player } from '../../src/voice/player';
import type { Moment } from '../../src/voice/lines';

function harness(over: Partial<VoiceSettings> = {}, brainImpl?: (m: Moment) => Promise<string>) {
  const cfg: VoiceSettings = { ...DEFAULT_SETTINGS, ...over };
  const spoken: string[] = [];
  const played: number[] = [];
  let t = 0;
  const player: Player = {
    playing: false,
    play: async (b) => {
      played.push(b.size);
    },
    stop: () => {},
  };
  const coach = createCoach({
    settings: () => cfg,
    now: () => t,
    variant: () => 0,
    brain: brainImpl ? (m) => brainImpl(m) : undefined,
    tts: async (text) => {
      spoken.push(text);
      return new Blob([new Uint8Array(3)]);
    },
    player,
  });
  return {
    coach,
    spoken,
    played,
    cfg,
    tick: (ms: number) => {
      t += ms;
      vi.advanceTimersByTime(ms);
    },
  };
}
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('coach', () => {
  beforeEach(() => {
    bus.getState().reset();
    bus.getState().set('tts_status', 'ok');
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('speaks calibration, first lock, active start, band change, check-in, session end — in that order', async () => {
    const h = harness({ coach: { enabled: true, intervalS: 60 } });
    h.coach.start();
    bus.getState().set('session_state', 'calibrating');
    await flush();
    bus.getState().set('bpm', 68);
    await flush();
    bus.getState().patch({ session_state: 'active', rsa_baseline: 6 });
    await flush();
    bus.getState().set('coherence', 30); // first band: no line
    await flush();
    h.tick(MIN_GAP_MS + 1);
    bus.getState().set('coherence', 80); // low → high
    await flush();
    h.tick(60_000); // check-in
    await flush();
    h.coach.stop();
    await h.coach.sessionEnd({ goal: 'FOCUS', startedAt: 0, duration: 300, avgBpm: 70, avgHrv: 40, peakCoherence: 80, samples: 5, rsaBaseline: 6, series: [] });
    // check-in fires at t = 40 001 + 60 000 ms ≈ 1.67 min → "2 minutes in."
    expect(h.spoken.map((l) => l.split(' ').slice(0, 2).join(' '))).toEqual(['Breathe with', 'Got you', 'Calibration done.', 'Coherence 80', '2 minutes', 'Session complete.']);
    expect(h.spoken[1]).toContain('68');
    expect(h.spoken.at(-1)).toContain('70');
    expect(h.played.length).toBe(6);
    expect(bus.getState().signals.coach_last_line).toBe(h.spoken.at(-1));
  });

  it('rate-limits non-forced lines and keeps only the newest pending one', async () => {
    const h = harness();
    h.coach.start();
    bus.getState().patch({ session_state: 'active', coherence: 50 });
    await flush();
    const n = h.spoken.length;
    bus.getState().set('coherence', 80); // within 40 s of active_start → dropped
    await flush();
    expect(h.spoken.length).toBe(n);
    h.tick(MIN_GAP_MS + 1);
    bus.getState().set('coherence', 30); // allowed
    await flush();
    expect(h.spoken.length).toBe(n + 1);
    h.coach.stop();
  });

  it('falls back to the template when the LLM is dishonest', async () => {
    const h = harness({ brain: { mode: 'llm', baseUrl: 'http://x', model: 'm' } }, async () => 'Your heart is at 99 and this will cure you.');
    h.coach.start();
    bus.getState().set('session_state', 'calibrating');
    await flush();
    expect(h.spoken[0]).toMatch(/^Breathe with the ring/);
    h.coach.stop();
  });

  it('uses the LLM line when it is honest', async () => {
    const h = harness({ brain: { mode: 'llm', baseUrl: 'http://x', model: 'm' } }, async () => 'Breathe slowly with the ring, I am listening.');
    h.coach.start();
    bus.getState().set('session_state', 'calibrating');
    await flush();
    expect(h.spoken[0]).toBe('Breathe slowly with the ring, I am listening.');
    h.coach.stop();
  });

  it('coach disabled → silent; TTS off → line shown but not played', async () => {
    const h1 = harness({ coach: { enabled: false, intervalS: 90 } });
    h1.coach.start();
    bus.getState().set('session_state', 'calibrating');
    await flush();
    expect(h1.spoken).toEqual([]);
    expect(bus.getState().signals.coach_last_line).toBeNull();
    h1.coach.stop();
    bus.getState().reset();
    bus.getState().set('tts_status', 'ok');
    const h2 = harness({ tts: { ...DEFAULT_SETTINGS.tts, enabled: false } });
    h2.coach.start();
    bus.getState().set('session_state', 'calibrating');
    await flush();
    expect(h2.spoken).toEqual([]);
    expect(bus.getState().signals.coach_last_line).toMatch(/Breathe/);
    h2.coach.stop();
  });

  it('a TTS failure lights the error lamp and keeps the line on the strip', async () => {
    const h = harness();
    const coach = createCoach({
      settings: () => h.cfg,
      now: () => 0,
      variant: () => 0,
      tts: async () => {
        throw new Error('HTTP 500');
      },
      player: { playing: false, play: async () => {}, stop: () => {} },
    });
    coach.start();
    bus.getState().set('session_state', 'calibrating');
    await flush();
    expect(bus.getState().signals.tts_status).toBe('error');
    expect(bus.getState().signals.coach_last_line).toMatch(/Breathe/);
    expect(bus.getState().signals.coach_speaking).toBe(false);
    coach.stop();
  });
});
