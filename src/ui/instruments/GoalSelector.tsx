import { bus } from '../../bus/store';
import { useSignal } from '../../bus/useSignal';
import type { Goal } from '../../bus/types';

const GOALS: Goal[] = ['RELAXATION', 'FOCUS', 'ENERGY'];

/** Backlit round latches. The lit one is the bus `goal`; latched while a session runs. */
export function GoalSelector() {
  const goal = useSignal('goal');
  const state = useSignal('session_state');
  const disabled = state !== 'idle' && state !== 'summary';
  return (
    <div role="group" aria-label="Goal" className="flex gap-4 justify-center">
      {GOALS.map((g) => (
        <button key={g} type="button" className="btn-round" aria-pressed={goal === g} disabled={disabled} onClick={() => bus.getState().set('goal', g)}>
          {g}
        </button>
      ))}
    </div>
  );
}
