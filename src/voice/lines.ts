import type { Goal } from '../bus/types';

export type CoachEvent = 'calibration_start' | 'first_lock' | 'active_start' | 'band_change' | 'checkin' | 'session_end' | 'test';
export type Band = 'low' | 'mid' | 'high';
export type Trend = 'rising' | 'falling' | 'flat' | 'unknown';

/** Everything the coach may speak about, captured at the instant of an event. Nulls are never verbalized. */
export interface Moment {
  event: CoachEvent;
  goal: Goal;
  minutes: number;
  bpm: number | null;
  hrv: number | null;
  coherence: number | null;
  breath_rate: number | null;
  rsa_baseline: number | null;
  band: Band | null;
  trend: Trend;
  avgBpm?: number | null;
  peakCoherence?: number | null;
}

export const BANNED = [/\bcure/i, /\bheal/i, /diagnos/i, /disease/i, /\btreat/i, /medical/i, /guarantee/i, /anxiety/i, /depress/i];
export const MAX_WORDS = 30;

const pick = <T,>(arr: T[], variant: number) => arr[Math.abs(variant) % arr.length];
const n = (v: number | null, d = 0) => (v === null ? null : v.toFixed(d));

/** Fixed lines, per event × band. Numbers present appear; nulls are simply left out. */
export function templateLine(m: Moment, variant = 0): string {
  const bpm = n(m.bpm);
  const coh = n(m.coherence);
  const tail = m.band === 'high' ? 'Stay right there.' : m.band === 'mid' ? 'Keep the breath long.' : 'No rush — follow the ring and let it come.';
  switch (m.event) {
    case 'calibration_start':
      return pick(
        ["Breathe with the ring. Slow in, slow out. I'm listening for your pulse.", 'Let the ring set your pace. In as it grows, out as it shrinks. I am listening for your pulse.'],
        variant,
      );
    case 'first_lock':
      return bpm
        ? pick([`Got you — ${bpm} beats a minute. Keep breathing with the ring.`, `There's your pulse, ${bpm} a minute. Stay with the ring.`], variant)
        : 'I have your pulse. Keep breathing with the ring.';
    case 'active_start': {
      const rsa = n(m.rsa_baseline, 1);
      return rsa && Number(rsa) > 0 ? `Calibration done. Your breath moves your heart by about ${rsa} beats. Let's settle in.` : "Calibration done. Let's settle in.";
    }
    case 'band_change':
      if (coh === null) return tail;
      if (m.band === 'high') return pick([`Coherence ${coh} — that's a clean rhythm. ${tail}`, `${coh} coherence. Beautiful. ${tail}`], variant);
      if (m.band === 'mid') return `Coherence ${coh}${m.trend === 'rising' ? ' and rising' : m.trend === 'falling' ? ', easing back' : ''}. ${tail}`;
      return `Coherence ${coh}. ${tail}`;
    case 'checkin': {
      const whole = Math.max(1, Math.round(m.minutes));
      const mins = `${whole} minute${whole === 1 ? '' : 's'} in.`;
      if (!bpm) return `${mins} I lost the pulse for a moment — face the camera and keep breathing.`;
      return `${mins} Heart ${bpm}${coh !== null ? `, coherence ${coh}` : ''}. ${tail}`;
    }
    case 'session_end': {
      const parts = ['Session complete.'];
      if (m.avgBpm) parts.push(`Average heart rate ${Math.round(m.avgBpm)}.`);
      if (m.peakCoherence) parts.push(`Peak coherence ${Math.round(m.peakCoherence)}.`);
      parts.push('Well done.');
      return parts.join(' ');
    }
    case 'test':
      return 'Voice jack test. If you can hear this, the coach can speak.';
  }
}

/** A line is honest if it is short, makes no banned claims, and every number in it is a number from the moment. */
export function validateLine(text: string, m: Moment): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length || words.length > MAX_WORDS) return false;
  if (BANNED.some((re) => re.test(text))) return false;
  const allowed = new Set<string>();
  for (const v of [m.bpm, m.hrv, m.coherence, m.breath_rate, m.rsa_baseline, m.avgBpm ?? null, m.peakCoherence ?? null])
    if (v !== null && v !== undefined) for (const d of [0, 1]) allowed.add(v.toFixed(d));
  allowed.add(String(Math.round(m.minutes)));
  allowed.add(String(Math.max(1, Math.round(m.minutes))));
  const numbers = text.match(/\d+(?:\.\d+)?/g) ?? [];
  return numbers.every((x) => allowed.has(x) || allowed.has(Number(x).toFixed(0)) || allowed.has(Number(x).toFixed(1)));
}
