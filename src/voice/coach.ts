import { bus } from '../bus/store';
import type { BusSignals, SessionState } from '../bus/types';
import { settings, type VoiceSettings } from './settings';
import { templateLine, validateLine, type Band, type Moment, type Trend, type CoachEvent } from './lines';
import { generateLine as brainGenerate } from './brain';
import { synthesize as ttsSynthesize } from './tts';
import { createPlayer, type Player } from './player';
import type { SessionRecord } from '../session/db';

export const MIN_GAP_MS = 40_000;
export const BRAIN_TIMEOUT_MS = 8_000;
export const TTS_TIMEOUT_MS = 15_000;
const BAND_LOW = 40;
const BAND_HIGH = 70;
const HYST = 5;

export interface CoachDeps {
  settings?: () => VoiceSettings;
  brain?: (m: Moment, signal: AbortSignal) => Promise<string>;
  tts?: (text: string, signal: AbortSignal) => Promise<Blob>;
  player?: Player;
  now?: () => number;
  variant?: () => number;
}

/** The listener. Reads the bus, never modulates audio params; speaks only about bus values. */
export function createCoach(deps: CoachDeps = {}) {
  const getSettings = deps.settings ?? (() => settings.getState());
  const now = deps.now ?? Date.now;
  const player = deps.player ?? createPlayer();
  const brain = deps.brain ?? ((m, signal) => brainGenerate(getSettings().brain, m, signal));
  const tts = deps.tts ?? ((text, signal) => ttsSynthesize(getSettings().tts, text, signal));
  let variantCounter = 0;
  const variant = deps.variant ?? (() => variantCounter++);

  let unsub: (() => void) | null = null;
  let checkin = 0;
  let startedAt: number | null = null;
  let lastSpokeAt = -Infinity;
  let lastCoherence: number | null = null;
  let band: Band | null = null;
  let locked = false;
  let busy = false;
  let pending: Moment | null = null;

  const bandOf = (c: number | null, prev: Band | null): Band | null => {
    if (c === null) return prev;
    if (prev === 'high') return c < BAND_HIGH - HYST ? (c < BAND_LOW ? 'low' : 'mid') : 'high';
    if (prev === 'low') return c >= BAND_LOW + HYST ? (c >= BAND_HIGH ? 'high' : 'mid') : 'low';
    if (prev === 'mid') return c >= BAND_HIGH + HYST ? 'high' : c < BAND_LOW - HYST ? 'low' : 'mid';
    return c >= BAND_HIGH ? 'high' : c >= BAND_LOW ? 'mid' : 'low';
  };

  const moment = (event: CoachEvent, extra: Partial<Moment> = {}): Moment => {
    const s = bus.getState().signals;
    const trend: Trend =
      s.coherence === null || lastCoherence === null ? 'unknown' : s.coherence - lastCoherence > 5 ? 'rising' : lastCoherence - s.coherence > 5 ? 'falling' : 'flat';
    return {
      event,
      goal: s.goal,
      minutes: startedAt === null ? 0 : (now() - startedAt) / 60_000,
      bpm: s.bpm,
      hrv: s.hrv_rmssd,
      coherence: s.coherence,
      breath_rate: s.breath_rate,
      rsa_baseline: s.rsa_baseline,
      band,
      trend,
      ...extra,
    };
  };

  async function compose(m: Moment): Promise<string | null> {
    const mode = getSettings().brain.mode;
    if (mode === 'off') return null;
    if (mode === 'llm') {
      try {
        const line = await brain(m, AbortSignal.timeout(BRAIN_TIMEOUT_MS));
        if (validateLine(line, m)) return line;
      } catch {
        /* fall through to the template */
      }
    }
    return templateLine(m, variant());
  }

  async function speak(text: string): Promise<void> {
    bus.getState().set('coach_last_line', text);
    const s = getSettings().tts;
    if (!s.enabled || bus.getState().signals.tts_status !== 'ok') return;
    try {
      const blob = await tts(text, AbortSignal.timeout(TTS_TIMEOUT_MS));
      bus.getState().set('coach_speaking', true);
      await player.play(blob);
    } catch (e) {
      bus.getState().patch({ tts_status: 'error', last_error: `Voice jack: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      bus.getState().set('coach_speaking', false);
    }
  }

  /** Rate-limited entry point for events. A newer pending moment replaces an older one; nothing interrupts a line in progress. */
  async function say(m: Moment, force = false): Promise<void> {
    if (!bus.getState().signals.coach_enabled || !getSettings().coach.enabled) return;
    if (!force && now() - lastSpokeAt < MIN_GAP_MS) return;
    if (busy) {
      pending = m;
      return;
    }
    busy = true;
    try {
      const line = await compose(m);
      if (line) {
        lastSpokeAt = now();
        if (m.coherence !== null) lastCoherence = m.coherence;
        await speak(line);
      }
    } finally {
      busy = false;
      const next = pending;
      pending = null;
      if (next) void say(next);
    }
  }

  function onBus(s: BusSignals, prev: BusSignals) {
    const state: SessionState = s.session_state;
    if (state !== prev.session_state) {
      if (state === 'calibrating') void say(moment('calibration_start'), true);
      if (state === 'active') {
        void say(moment('active_start'), true);
        clearInterval(checkin);
        checkin = window.setInterval(() => void say(moment('checkin')), Math.max(15, getSettings().coach.intervalS) * 1000);
      }
      if (state !== 'active') {
        clearInterval(checkin);
        checkin = 0;
      }
    }
    if (!locked && s.bpm !== null && prev.bpm === null && (state === 'calibrating' || state === 'active')) {
      locked = true;
      void say(moment('first_lock'), true);
    }
    const nb = bandOf(s.coherence, band);
    if (nb !== band) {
      const had = band !== null;
      band = nb;
      if (had && state === 'active') void say(moment('band_change'));
    }
  }

  return {
    start() {
      startedAt = now();
      lastSpokeAt = -Infinity;
      lastCoherence = null;
      band = null;
      locked = false;
      pending = null;
      unsub?.();
      let prev = bus.getState().signals;
      unsub = bus.subscribe((st) => {
        const cur = st.signals;
        if (cur !== prev) {
          const p = prev;
          prev = cur;
          onBus(cur, p);
        }
      });
    },
    stop() {
      unsub?.();
      unsub = null;
      clearInterval(checkin);
      checkin = 0;
      pending = null;
    },
    /** Spoken after the record exists; uses the record's numbers, not the (now dark) live bus. */
    sessionEnd(rec: SessionRecord) {
      return say(moment('session_end', { avgBpm: rec.avgBpm, peakCoherence: rec.peakCoherence, minutes: rec.duration / 60 }), true);
    },
    test: () => say(moment('test'), true),
    say,
    get player() {
      return player;
    },
  };
}
export type Coach = ReturnType<typeof createCoach>;
