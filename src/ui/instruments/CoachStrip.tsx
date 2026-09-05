import { bus } from '../../bus/store';
import { useSignal } from '../../bus/useSignal';

/** Front-of-rack coach strip: the mute latch and exactly the last line spoken. */
export function CoachStrip() {
  const enabled = useSignal('coach_enabled');
  const last = useSignal('coach_last_line');
  const speaking = useSignal('coach_speaking');
  return (
    <div className="flex items-center gap-3" aria-label="Coach strip">
      <button type="button" className="btn-round" style={{ width: 56, height: 56, fontSize: 8 }} aria-pressed={enabled} onClick={() => bus.getState().set('coach_enabled', !enabled)}>
        COACH
      </button>
      <div
        className="glass flex-1 px-3 py-2 text-left text-sm min-h-10"
        role="status"
        aria-live="polite"
        aria-label={speaking ? 'Coach speaking' : 'Coach quiet'}
        data-speaking={String(speaking)}
        data-testid="coach-strip"
      >
        {last ?? '--'}
      </div>
    </div>
  );
}
