import { useEffect, useRef } from 'react';
import { bus } from '../../bus/store';
import { useSignal } from '../../bus/useSignal';

/**
 * Paced-breath ring. Runs a clock while calibrating/active and writes `breath_phase` to the bus;
 * the ring renders only what the bus says. The clock reads `breath_rate` through a ref, so a slewed
 * rate change bends the current breath instead of restarting it from "inhale" every tick.
 */
export function BreathingGuide() {
  const rate = useSignal('breath_rate');
  const phase = useSignal('breath_phase');
  const state = useSignal('session_state');
  const running = state === 'calibrating' || state === 'active';
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const clock = useRef(0);

  useEffect(() => {
    if (!running) {
      clock.current = 0;
      if (bus.getState().signals.breath_phase !== null) bus.getState().set('breath_phase', null);
      return;
    }
    const id = setInterval(() => {
      const r = rateRef.current;
      if (!r) return;
      clock.current = (clock.current + 0.1) % r;
      const t = clock.current;
      const next = t < r * 0.4 ? 'inhale' : t < r * 0.5 ? 'hold' : 'exhale';
      if (bus.getState().signals.breath_phase !== next) bus.getState().set('breath_phase', next);
    }, 100);
    return () => clearInterval(id);
  }, [running]);

  const scale = phase === 'inhale' || phase === 'hold' ? 1.25 : phase === 'exhale' ? 0.85 : 1;
  const secs = rate ? (phase === 'exhale' ? rate * 0.5 : rate * 0.4) : 1;
  return (
    <div className="flex flex-col items-center gap-3 py-2" role="status" aria-live="polite" aria-label={phase ? `Breathe: ${phase}` : 'Breathing guide idle'}>
      <div
        className="w-24 h-24 rounded-full border-4"
        style={{ borderColor: 'var(--color-cable)', transform: `scale(${scale})`, transition: `transform ${secs}s ease-in-out`, opacity: phase ? 1 : 0.45 }}
      />
      <span className="label">{phase ?? '--'}</span>
    </div>
  );
}
