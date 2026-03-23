import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HeartbeatEngine, getLightingStatus } from '../../utils/signalProcessing';

describe('getLightingStatus', () => {
  it('returns TOO DARK for value 39 (below threshold)', () => {
    expect(getLightingStatus(39)).toBe('TOO DARK');
  });

  it('returns OPTIMAL for value 40 (lower boundary)', () => {
    expect(getLightingStatus(40)).toBe('OPTIMAL');
  });

  it('returns OPTIMAL for value 230 (upper boundary)', () => {
    expect(getLightingStatus(230)).toBe('OPTIMAL');
  });

  it('returns OVEREXPOSED for value 231 (above threshold)', () => {
    expect(getLightingStatus(231)).toBe('OVEREXPOSED');
  });
});

describe('HeartbeatEngine', () => {
  let engine: HeartbeatEngine;

  beforeEach(() => {
    engine = new HeartbeatEngine();
    vi.restoreAllMocks();
  });

  describe('process', () => {
    it('returns zeros when fewer than 60 samples have been provided', () => {
      let callCount = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => callCount++ * 33.33);

      let result = { bpm: -1, hrv: -1, confidence: -1, spectrum: [{ bpm: 0, power: 0 }], signal: [] as number[] };
      for (let i = 0; i < 59; i++) {
        result = engine.process(128, 30);
      }

      expect(result.bpm).toBe(0);
      expect(result.hrv).toBe(0);
      expect(result.confidence).toBe(0);
      expect(result.spectrum).toEqual([]);
    });

    it('caps the internal window at 120 samples (signal length never exceeds 120)', () => {
      let callCount = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => callCount++ * 33.33);

      let result = { bpm: 0, hrv: 0, confidence: 0, spectrum: [] as any[], signal: [] as number[] };
      for (let i = 0; i < 150; i++) {
        const value = Math.sin(2 * Math.PI * (72 / 60) * (i / 30)) * 10 + 128;
        result = engine.process(value, 30);
      }

      expect(result.signal.length).toBeLessThanOrEqual(120);
    });

    it('produces BPM in 45-180 range with 60+ sinusoidal samples at 72 BPM', () => {
      let callCount = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => callCount++ * 33.33);

      let result = { bpm: 0, hrv: 0, confidence: 0, spectrum: [] as any[], signal: [] as number[] };
      for (let i = 0; i < 90; i++) {
        const value = Math.sin(2 * Math.PI * (72 / 60) * (i / 30)) * 10 + 128;
        result = engine.process(value, 30);
      }

      expect(result.bpm).toBeGreaterThanOrEqual(45);
      expect(result.bpm).toBeLessThanOrEqual(180);
    });

    it('returns confidence between 0 and 1', () => {
      let callCount = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => callCount++ * 33.33);

      let result = { bpm: 0, hrv: 0, confidence: 0, spectrum: [] as any[], signal: [] as number[] };
      for (let i = 0; i < 90; i++) {
        const value = Math.sin(2 * Math.PI * (72 / 60) * (i / 30)) * 10 + 128;
        result = engine.process(value, 30);
      }

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('returns a non-empty spectrum array with 60+ samples', () => {
      let callCount = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => callCount++ * 33.33);

      let result = { bpm: 0, hrv: 0, confidence: 0, spectrum: [] as any[], signal: [] as number[] };
      for (let i = 0; i < 90; i++) {
        const value = Math.sin(2 * Math.PI * (72 / 60) * (i / 30)) * 10 + 128;
        result = engine.process(value, 30);
      }

      expect(result.spectrum.length).toBeGreaterThan(0);
      expect(result.spectrum[0]).toHaveProperty('bpm');
      expect(result.spectrum[0]).toHaveProperty('power');
    });
  });

  describe('HRV', () => {
    it('returns HRV >= 0', () => {
      let callCount = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => callCount++ * 33.33);

      let result = { bpm: 0, hrv: 0, confidence: 0, spectrum: [] as any[], signal: [] as number[] };
      for (let i = 0; i < 120; i++) {
        const value = Math.sin(2 * Math.PI * (72 / 60) * (i / 30)) * 10 + 128;
        result = engine.process(value, 30);
      }

      expect(result.hrv).toBeGreaterThanOrEqual(0);
    });
  });
});
