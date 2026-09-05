import { bus } from '../../bus/store';
import { useSignal, fmt } from '../../bus/useSignal';
import { CameraSelect } from '../instruments/CameraSelect';
import { VoiceJack } from '../instruments/VoiceJack';
import { BrainJack } from '../instruments/BrainJack';
import { CoachModule } from '../instruments/CoachModule';
import type { BusSignals, RppgMethod } from '../../bus/types';

type NumericKey = { [K in keyof BusSignals]: BusSignals[K] extends number | null ? K : never }[keyof BusSignals];

function Jack({ signal, label, digits }: { signal: NumericKey; label: string; digits: number }) {
  const v = useSignal(signal);
  return (
    <li className="glass px-3 py-2">
      <div className="label" style={{ color: 'var(--color-nixie-dim)' }}>
        {label}
      </div>
      <div className="text-lg">{fmt(v, digits)}</div>
    </li>
  );
}

const METHODS: RppgMethod[] = ['auto', 'pos', 'chrom', 'green'];

/** Back of the rack (M1 minimal): the live rules→synth patch, engine method, camera input. */
export function RackBack() {
  const method = useSignal('method_select');
  const state = useSignal('session_state');
  const conf = useSignal('confidence');
  return (
    <section className="module max-w-6xl mx-auto mt-2 mb-8 space-y-3" aria-label="Patch bay">
      <span className="tape">Patch bay — rules → synth</span>
      <ul className="grid grid-cols-2 md:grid-cols-5 gap-3 font-mono">
        <Jack signal="beat_hz" label="Beat Hz" digits={2} />
        <Jack signal="carrier_hz" label="Carrier Hz" digits={0} />
        <Jack signal="pulse_depth" label="Pulse depth" digits={2} />
        <Jack signal="master_gain" label="Master" digits={2} />
        <Jack signal="breath_rate" label="Breath s" digits={1} />
      </ul>
      <div className="grid md:grid-cols-3 gap-4 pt-1">
        <label className="block space-y-1">
          <span className="label" style={{ color: 'var(--color-nixie-dim)' }}>
            rPPG method
          </span>
          <select className="jack-select" value={method} disabled={state !== 'idle' && state !== 'summary'} onChange={(e) => bus.getState().set('method_select', e.target.value as RppgMethod)}>
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <CameraSelect />
        <div className="space-y-1">
          <span className="label" style={{ color: 'var(--color-nixie-dim)' }}>
            Engine confidence
          </span>
          <div className="glass px-3 py-2 text-lg">{conf === null ? '--' : `${Math.round(conf * 100)}%`}</div>
        </div>
      </div>
      <div className="grid md:grid-cols-3 gap-4 pt-2">
        <VoiceJack />
        <BrainJack />
        <CoachModule />
      </div>
    </section>
  );
}
