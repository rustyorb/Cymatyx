import { useSettings, settings } from '../../voice/settings';
import { useSignal } from '../../bus/useSignal';

/** Back-of-rack coach module: enabled, check-in interval, the last line spoken. */
export function CoachModule() {
  const coach = useSettings((s) => s.coach);
  const last = useSignal('coach_last_line');
  const speaking = useSignal('coach_speaking');
  return (
    <section className="module space-y-3" aria-label="Coach">
      <div className="flex justify-between items-center">
        <span className="tape">Coach</span>
        <span className="label">{speaking ? 'speaking' : 'quiet'}</span>
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={coach.enabled} onChange={(e) => settings.getState().set({ coach: { enabled: e.target.checked } })} />
        <span className="label">Enabled</span>
      </label>
      <label className="block space-y-1">
        <span className="label" style={{ color: 'var(--color-nixie-dim)' }}>
          Check-in every (s)
        </span>
        <input
          className="jack-select"
          type="number"
          min={15}
          max={600}
          value={coach.intervalS}
          onChange={(e) => settings.getState().set({ coach: { intervalS: Math.max(15, Number(e.target.value) || 90) } })}
        />
      </label>
      <div className="glass px-3 py-2 text-sm min-h-10" data-testid="coach-last-line">
        {last ?? '--'}
      </div>
    </section>
  );
}
