import { useSignal } from '../../bus/useSignal';

/** The red mushroom. START when idle, STOP while a session is running. */
export function PowerSwitch({ onStart, onEnd }: { onStart: () => void; onEnd: () => void }) {
  const state = useSignal('session_state');
  const idle = state === 'idle' || state === 'summary';
  return (
    <div className="flex flex-col items-center gap-2">
      <button type="button" className={`mushroom ${idle ? '' : 'stop'}`} onClick={idle ? onStart : onEnd}>
        {idle ? 'START' : 'STOP'}
      </button>
      <span className="label">{idle ? 'Start sequence' : `Session ${state}`}</span>
    </div>
  );
}
