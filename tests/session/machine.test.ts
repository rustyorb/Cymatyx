import { describe, it, expect, beforeEach } from 'vitest';
import { bus } from '../../src/bus/store';
import { createSession } from '../../src/session/machine';
import { db } from '../../src/session/db';

const state = () => bus.getState().signals.session_state;

describe('session machine', () => {
  beforeEach(async () => {
    bus.getState().reset();
    await db.sessions.clear();
  });

  it('idle → warming → calibrating → active → summary → idle', async () => {
    let t = 0;
    const s = createSession({ now: () => t });
    expect(state()).toBe('idle');
    s.start('FOCUS');
    expect(state()).toBe('warming');
    expect(bus.getState().signals.goal).toBe('FOCUS');
    s.warmed();
    expect(state()).toBe('calibrating');
    s.calibrated(6.5);
    expect(state()).toBe('active');
    expect(bus.getState().signals.rsa_baseline).toBe(6.5);
    t = 90_000;
    const rec = await s.end();
    expect(state()).toBe('summary');
    expect(rec.goal).toBe('FOCUS');
    expect(rec.duration).toBe(90);
    expect(rec.rsaBaseline).toBe(6.5);
    expect(rec.id).toBeTypeOf('number');
    expect(await db.sessions.count()).toBe(1);
    s.dismiss();
    expect(state()).toBe('idle');
  });

  it('records averages only from real readings taken while active, one point per second', async () => {
    let t = 0;
    const s = createSession({ now: () => t });
    s.start('RELAXATION');
    s.sample({ bpm: 99, hrv: 99, coherence: 99 }); // warming: ignored
    s.warmed();
    s.calibrated(5);
    t = 1000;
    s.sample({ bpm: 70, hrv: 40, coherence: 60 });
    t = 1500;
    s.sample({ bpm: 90, hrv: 90, coherence: 90 }); // same second: decimated away
    t = 2000;
    s.sample({ bpm: 74, hrv: 44, coherence: 70 });
    t = 3000;
    s.sample({ bpm: null, hrv: null, coherence: null });
    const rec = await s.end();
    expect(rec.avgBpm).toBe(72);
    expect(rec.avgHrv).toBe(42);
    expect(rec.peakCoherence).toBe(70);
    expect(rec.samples).toBe(2);
  });

  it('a failed save still reaches summary and reports on the rack', async () => {
    const s = createSession({ now: () => 0 });
    s.start('FOCUS');
    s.warmed();
    s.calibrated(3);
    const add = db.sessions.add;
    db.sessions.add = (() => Promise.reject(new Error('QuotaExceeded'))) as unknown as typeof db.sessions.add;
    try {
      const rec = await s.end();
      expect(rec.id).toBeUndefined();
      expect(state()).toBe('summary');
      expect(bus.getState().signals.last_error).toMatch(/QuotaExceeded/);
    } finally {
      db.sessions.add = add;
    }
  });

  it('a session with no readings records nulls, not zeros', async () => {
    const s = createSession({ now: () => 0 });
    s.start('ENERGY');
    s.warmed();
    s.calibrated(0);
    const rec = await s.end();
    expect(rec.avgBpm).toBeNull();
    expect(rec.peakCoherence).toBeNull();
  });

  it('abort during calibration returns to idle and clears measurements', () => {
    const s = createSession({ now: () => 0 });
    s.start('ENERGY');
    s.warmed();
    bus.getState().set('bpm', 80);
    s.abort();
    expect(state()).toBe('idle');
    expect(bus.getState().signals.bpm).toBeNull();
  });

  it('out-of-order transitions are ignored', () => {
    const s = createSession({ now: () => 0 });
    s.calibrated(3); // idle → cannot calibrate
    expect(state()).toBe('idle');
    s.start('FOCUS');
    s.calibrated(3); // warming → cannot skip calibration
    expect(state()).toBe('warming');
  });
});
