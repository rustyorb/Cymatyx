import { describe, it, expect } from 'vitest';
import { modulate, SLEW, type ParamPatch } from '../../src/rules/modulate';
import { GOALS } from '../../src/rules/goals';

describe('modulate', () => {
  it('RELAXATION at high HR targets a slower beat and slower breath than the preset', () => {
    const p = modulate({ bpm: 95, coherence: null, goal: 'RELAXATION' }, null);
    expect(p.beat_hz).toBeLessThan(GOALS.RELAXATION.beat_hz);
    expect(p.beat_hz).toBeLessThanOrEqual(8);
    expect(p.breath_rate).toBeGreaterThan(GOALS.RELAXATION.breath_rate);
  });

  it('RELAXATION at normal HR is the preset', () => {
    const p = modulate({ bpm: 70, coherence: null, goal: 'RELAXATION' }, null);
    expect(p.beat_hz).toBe(GOALS.RELAXATION.beat_hz);
    expect(p.breath_rate).toBe(GOALS.RELAXATION.breath_rate);
  });

  it('FOCUS targets a beta-range beat', () => {
    expect(modulate({ bpm: 70, coherence: 50, goal: 'FOCUS' }, null).beat_hz).toBeGreaterThanOrEqual(12);
  });

  it('ENERGY at low HR pushes the beat above the preset', () => {
    expect(modulate({ bpm: 52, coherence: null, goal: 'ENERGY' }, null).beat_hz).toBeGreaterThan(GOALS.ENERGY.beat_hz);
  });

  it('coherence deepens the pulse, capped at 0.4', () => {
    const low = modulate({ bpm: 70, coherence: 0, goal: 'ENERGY' }, null).pulse_depth;
    const high = modulate({ bpm: 70, coherence: 100, goal: 'ENERGY' }, null).pulse_depth;
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(0.4);
  });

  it('slews toward targets by at most the per-tick limit', () => {
    const prev: ParamPatch = { beat_hz: 20, carrier_hz: 100, pulse_depth: 0.0, master_gain: 0.0, breath_rate: 3 };
    const p = modulate({ bpm: 95, coherence: 30, goal: 'RELAXATION' }, prev);
    for (const k of Object.keys(SLEW) as (keyof ParamPatch)[]) expect(Math.abs(p[k] - prev[k])).toBeLessThanOrEqual(SLEW[k] + 1e-12);
    expect(p.beat_hz).toBe(19.5);
  });

  it('converges to the target if ticked enough', () => {
    let p: ParamPatch | null = null;
    for (let i = 0; i < 100; i++) p = modulate({ bpm: 70, coherence: null, goal: 'FOCUS' }, p);
    expect(p!).toEqual({ ...GOALS.FOCUS, master_gain: 0.6 });
  });

  it('HR-zone thresholds have hysteresis: a BPM hovering on the line does not flap the target', () => {
    // engage the slow-breath mode above 88, then hover at 85: stays engaged (release is below 82)
    let p: ParamPatch | null = null;
    for (let i = 0; i < 20; i++) p = modulate({ bpm: 90, coherence: null, goal: 'RELAXATION' }, p);
    expect(p!.breath_rate).toBe(GOALS.RELAXATION.breath_rate + 2);
    for (let i = 0; i < 20; i++) p = modulate({ bpm: 85, coherence: null, goal: 'RELAXATION' }, p);
    expect(p!.breath_rate).toBe(GOALS.RELAXATION.breath_rate + 2);
    // and from the preset, 85 does not engage it
    let q: ParamPatch | null = null;
    for (let i = 0; i < 20; i++) q = modulate({ bpm: 85, coherence: null, goal: 'RELAXATION' }, q);
    expect(q!.breath_rate).toBe(GOALS.RELAXATION.breath_rate);
  });

  it('with no measurement returns the goal defaults — never null params', () => {
    const p = modulate({ bpm: null, coherence: null, goal: 'ENERGY' }, null);
    expect(p).toEqual({ ...GOALS.ENERGY, master_gain: 0.6 });
  });
});
