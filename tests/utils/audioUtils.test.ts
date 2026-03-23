import { describe, it, expect } from 'vitest';
import {
  base64ToUint8Array,
  arrayBufferToBase64,
  float32ToInt16,
  int16ToFloat32,
  resample,
} from '../../utils/audioUtils.ts';

describe('audioUtils', () => {
  // ── base64ToUint8Array ──────────────────────────────────────────────
  describe('base64ToUint8Array', () => {
    it('decodes known base64 string "SGVsbG8=" to [72,101,108,108,111]', () => {
      const result = base64ToUint8Array('SGVsbG8=');
      expect(Array.from(result)).toEqual([72, 101, 108, 108, 111]);
    });

    it('returns a Uint8Array', () => {
      const result = base64ToUint8Array('SGVsbG8=');
      expect(result).toBeInstanceOf(Uint8Array);
    });

    it('handles empty base64 string', () => {
      const result = base64ToUint8Array('');
      expect(result.length).toBe(0);
    });
  });

  // ── arrayBufferToBase64 ─────────────────────────────────────────────
  describe('arrayBufferToBase64', () => {
    it('encodes Uint8Array [72,101,108,108,111] to "SGVsbG8="', () => {
      const input = new Uint8Array([72, 101, 108, 108, 111]);
      const result = arrayBufferToBase64(input.buffer);
      expect(result).toBe('SGVsbG8=');
    });

    it('handles empty buffer', () => {
      const result = arrayBufferToBase64(new ArrayBuffer(0));
      expect(result).toBe('');
    });
  });

  // ── Roundtrip base64 ↔ Uint8Array ──────────────────────────────────
  describe('base64 roundtrip', () => {
    it('arrayBufferToBase64(base64ToUint8Array(x)) === x', () => {
      const original = 'SGVsbG8=';
      const decoded = base64ToUint8Array(original);
      const reEncoded = arrayBufferToBase64(decoded.buffer);
      expect(reEncoded).toBe(original);
    });

    it('roundtrips longer base64 strings', () => {
      const original = btoa('Hello, World! This is a longer test string.');
      const decoded = base64ToUint8Array(original);
      const reEncoded = arrayBufferToBase64(decoded.buffer);
      expect(reEncoded).toBe(original);
    });
  });

  // ── float32ToInt16 ──────────────────────────────────────────────────
  describe('float32ToInt16', () => {
    it('converts 0 to 0', () => {
      const result = float32ToInt16(new Float32Array([0]));
      expect(result[0]).toBe(0);
    });

    it('converts 1.0 to 32767', () => {
      const result = float32ToInt16(new Float32Array([1.0]));
      expect(result[0]).toBe(32767);
    });

    it('converts -1.0 to -32768', () => {
      const result = float32ToInt16(new Float32Array([-1.0]));
      expect(result[0]).toBe(-32768);
    });

    it('clamps values > 1 to 32767', () => {
      const result = float32ToInt16(new Float32Array([1.5]));
      expect(result[0]).toBe(32767);
    });

    it('clamps values < -1 to -32768', () => {
      const result = float32ToInt16(new Float32Array([-1.5]));
      expect(result[0]).toBe(-32768);
    });

    it('returns Int16Array', () => {
      const result = float32ToInt16(new Float32Array([0.5]));
      expect(result).toBeInstanceOf(Int16Array);
    });

    it('preserves array length', () => {
      const input = new Float32Array([0, 0.5, -0.5, 1.0, -1.0]);
      const result = float32ToInt16(input);
      expect(result.length).toBe(5);
    });
  });

  // ── int16ToFloat32 ──────────────────────────────────────────────────
  describe('int16ToFloat32', () => {
    it('converts 0 to 0', () => {
      const result = int16ToFloat32(new Int16Array([0]));
      expect(result[0]).toBe(0);
    });

    it('converts 32767 to approximately 1.0 (within 0.001)', () => {
      const result = int16ToFloat32(new Int16Array([32767]));
      expect(result[0]).toBeCloseTo(1.0, 2);
      expect(Math.abs(result[0] - 1.0)).toBeLessThan(0.001);
    });

    it('converts -32768 to -1.0', () => {
      const result = int16ToFloat32(new Int16Array([-32768]));
      expect(result[0]).toBe(-1.0);
    });

    it('returns Float32Array', () => {
      const result = int16ToFloat32(new Int16Array([100]));
      expect(result).toBeInstanceOf(Float32Array);
    });
  });

  // ── Roundtrip float32 ↔ int16 ──────────────────────────────────────
  describe('float32 ↔ int16 roundtrip', () => {
    it('roundtrip is approximately preserved', () => {
      const original = new Float32Array([0, 0.5, -0.5, 0.25, -0.75]);
      const asInt16 = float32ToInt16(original);
      const backToFloat = int16ToFloat32(asInt16);

      for (let i = 0; i < original.length; i++) {
        expect(backToFloat[i]).toBeCloseTo(original[i], 2);
      }
    });

    it('preserves zero exactly through roundtrip', () => {
      const original = new Float32Array([0]);
      const result = int16ToFloat32(float32ToInt16(original));
      expect(result[0]).toBe(0);
    });
  });

  // ── resample ────────────────────────────────────────────────────────
  describe('resample', () => {
    it('returns same array when sample rates match', () => {
      const source = new Float32Array([1, 2, 3, 4, 5]);
      const result = resample(source, 48000, 48000);
      expect(result).toBe(source); // Same reference
    });

    it('48000→24000 approximately halves length', () => {
      const source = new Float32Array(4800);
      for (let i = 0; i < source.length; i++) {
        source[i] = Math.sin(2 * Math.PI * 440 * i / 48000);
      }
      const result = resample(source, 48000, 24000);
      expect(result.length).toBe(2400);
    });

    it('24000→48000 approximately doubles length', () => {
      const source = new Float32Array(2400);
      for (let i = 0; i < source.length; i++) {
        source[i] = Math.sin(2 * Math.PI * 440 * i / 24000);
      }
      const result = resample(source, 24000, 48000);
      expect(result.length).toBe(4800);
    });

    it('handles empty Float32Array', () => {
      const source = new Float32Array(0);
      const result = resample(source, 48000, 24000);
      expect(result.length).toBe(0);
    });

    it('preserves approximate values during downsampling', () => {
      // Create a DC signal (all 0.5)
      const source = new Float32Array(100).fill(0.5);
      const result = resample(source, 48000, 24000);
      for (let i = 0; i < result.length; i++) {
        expect(result[i]).toBeCloseTo(0.5, 5);
      }
    });
  });
});
