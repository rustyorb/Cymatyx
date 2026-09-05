import { bus } from '../bus/store';
import type { Goal } from '../bus/types';
import { db, type SessionPoint, type SessionRecord } from './db';

export interface SessionSample {
  bpm: number | null;
  hrv: number | null;
  coherence: number | null;
}

const SERIES_EVERY_MS = 1000; // the record keeps one point per second, not one per frame

/**
 * idle → warming → calibrating → active → summary → idle. Every transition is a bus write, so the
 * rack can only ever show the state the machine is in. Only real readings enter the record.
 */
export function createSession(deps: { now: () => number } = { now: Date.now }) {
  let startedAt = 0;
  let goal: Goal = 'RELAXATION';
  let series: SessionPoint[] = [];
  let lastPointAt = -Infinity;
  const state = () => bus.getState().signals.session_state;

  return {
    start(g: Goal) {
      goal = g;
      startedAt = deps.now();
      series = [];
      lastPointAt = -Infinity;
      bus.getState().reset();
      bus.getState().patch({ goal: g, session_state: 'warming' });
    },
    warmed() {
      if (state() === 'warming') bus.getState().set('session_state', 'calibrating');
    },
    /** rsa = null when calibration produced too few readings to claim a baseline. */
    calibrated(rsa: number | null) {
      if (state() === 'calibrating') bus.getState().patch({ rsa_baseline: rsa, session_state: 'active' });
    },
    sample(s: SessionSample) {
      if (state() !== 'active' || s.bpm === null) return;
      const t = deps.now();
      if (t - lastPointAt < SERIES_EVERY_MS) return;
      lastPointAt = t;
      series.push({ t, bpm: s.bpm, hrv: s.hrv, coherence: s.coherence });
    },
    abort() {
      bus.getState().reset();
    },
    /** Moves to summary first, then persists; a failed write is reported on the rack, never re-run by a second STOP. */
    async end(): Promise<SessionRecord> {
      const avg = (xs: (number | null)[]) => {
        const v = xs.filter((x): x is number => x !== null);
        return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
      };
      const coh = series.map((r) => r.coherence).filter((c): c is number => c !== null);
      const rec: SessionRecord = {
        goal,
        startedAt,
        duration: Math.round((deps.now() - startedAt) / 1000),
        avgBpm: avg(series.map((r) => r.bpm)),
        avgHrv: avg(series.map((r) => r.hrv)),
        peakCoherence: coh.length ? Math.max(...coh) : null,
        samples: series.length,
        rsaBaseline: bus.getState().signals.rsa_baseline,
        series,
      };
      bus.getState().set('session_state', 'summary');
      try {
        rec.id = await db.sessions.add(rec);
      } catch (e) {
        bus.getState().set('last_error', `Session not saved: ${e instanceof Error ? e.message : String(e)}`);
      }
      return rec;
    },
    dismiss() {
      bus.getState().reset();
    },
  };
}
