import { describe, it, expect, beforeEach } from 'vitest';
import { bus } from '../../src/bus/store';

describe('bus', () => {
  beforeEach(() => bus.getState().reset());

  it('starts every measurement null and the camera off', () => {
    const s = bus.getState().signals;
    expect(s.bpm).toBeNull();
    expect(s.beat_hz).toBeNull();
    expect(s.cam_live).toBe(false);
    expect(s.session_state).toBe('idle');
  });

  it('set stamps a timestamp and notifies subscribers', () => {
    const seen: (number | null)[] = [];
    const unsub = bus.subscribe((s) => seen.push(s.signals.bpm));
    bus.getState().set('bpm', 72.4, 1000);
    expect(bus.getState().signals.bpm).toBe(72.4);
    expect(bus.getState().stamps.bpm).toBe(1000);
    expect(seen.at(-1)).toBe(72.4);
    unsub();
  });

  it('patch stamps every key it writes', () => {
    bus.getState().patch({ beat_hz: 8, carrier_hz: 200 }, 5);
    expect(bus.getState().stamps.beat_hz).toBe(5);
    expect(bus.getState().stamps.carrier_hz).toBe(5);
  });

  it('reset returns measurements to null but keeps user choices', () => {
    bus.getState().patch({ hrv_rmssd: 45, goal: 'FOCUS', cam_device: 'abc' });
    bus.getState().reset();
    const s = bus.getState().signals;
    expect(s.hrv_rmssd).toBeNull();
    expect(s.goal).toBe('FOCUS');
    expect(s.cam_device).toBe('abc');
  });
});
