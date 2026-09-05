import { describe, it, expect } from 'vitest';
import { templateLine, validateLine, type Moment, type CoachEvent, type Band } from '../../src/voice/lines';

const base: Moment = { event: 'checkin', goal: 'RELAXATION', minutes: 3, bpm: 68, hrv: 42, coherence: 55, breath_rate: 10, rsa_baseline: 6.5, band: 'mid', trend: 'rising' };
const EVENTS: CoachEvent[] = ['calibration_start', 'first_lock', 'active_start', 'band_change', 'checkin', 'session_end', 'test'];
const BANDS: (Band | null)[] = ['low', 'mid', 'high', null];

describe('template lines', () => {
  it('every event × band yields a valid, honest line', () => {
    for (const event of EVENTS)
      for (const band of BANDS)
        for (const variant of [0, 1]) {
          const m: Moment = { ...base, event, band, avgBpm: 70, peakCoherence: 80 };
          const line = templateLine(m, variant);
          expect(line.length).toBeGreaterThan(5);
          expect(validateLine(line, m), `${event}/${band}: ${line}`).toBe(true);
        }
  });

  it('speaks the numbers it has and never the ones it lacks', () => {
    expect(templateLine({ ...base, event: 'first_lock' })).toContain('68');
    const noBpm = templateLine({ ...base, event: 'checkin', bpm: null, coherence: null });
    expect(noBpm).not.toMatch(/\d+ (beats|coherence)/);
    expect(noBpm).not.toContain('--');
    expect(templateLine({ ...base, event: 'session_end', avgBpm: null, peakCoherence: null })).toBe('Session complete. Well done.');
  });

  it('validateLine rejects invented numbers, banned claims and rambling', () => {
    expect(validateLine('Your heart is at 68 and coherence 55.', base)).toBe(true);
    expect(validateLine('Your heart is at 72.', base)).toBe(false);
    expect(validateLine('This will cure your stress.', base)).toBe(false);
    expect(validateLine(Array(31).fill('word').join(' '), base)).toBe(false);
    expect(validateLine('', base)).toBe(false);
  });
});
