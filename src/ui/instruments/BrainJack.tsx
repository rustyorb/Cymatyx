import { useState } from 'react';
import { useSettings, settings, type BrainMode } from '../../voice/settings';
import { useSignal } from '../../bus/useSignal';
import { probeBrain } from '../../voice/probe';
import { generateLine } from '../../voice/brain';
import { validateLine, type Moment } from '../../voice/lines';
import { bus } from '../../bus/store';
import { Lamp, Field, inputClass, smallButton } from './jack';

const MODES: { id: BrainMode; label: string }[] = [
  { id: 'off', label: 'OFF' },
  { id: 'fixed', label: 'FIXED LINES' },
  { id: 'llm', label: 'LLM' },
];
const TEST_MOMENT: Moment = { event: 'checkin', goal: 'FOCUS', minutes: 2, bpm: 70, hrv: 45, coherence: 62, breath_rate: 6, rsa_baseline: null, band: 'mid', trend: 'rising' };
const uniq = (arr: string[]) => arr.filter((v, i, a) => v && a.indexOf(v) === i);

/** Back-of-rack LLM jack: off / fixed lines / one OpenAI-compatible chat server with models fetched from it. */
export function BrainJack() {
  const brain = useSettings((s) => s.brain);
  const status = useSignal('brain_status');
  const [models, setModels] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchModels = async () => {
    setBusy(true);
    const m = await probeBrain();
    if (m) {
      setModels(m);
      if (!settings.getState().brain.model && m[0]) settings.getState().set({ brain: { model: m[0] } });
    }
    setBusy(false);
  };
  const test = async () => {
    setBusy(true);
    setResult(null);
    try {
      const line = await generateLine(brain, TEST_MOMENT, AbortSignal.timeout(8000));
      setResult(validateLine(line, TEST_MOMENT) ? line : `REJECTED (dishonest or too long): ${line}`);
      bus.getState().set('brain_status', 'ok');
    } catch (e) {
      setResult(null);
      bus.getState().patch({ brain_status: 'error', last_error: `Brain jack: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="module space-y-3" aria-label="Brain jack">
      <div className="flex justify-between items-center">
        <span className="tape">Brain jack — LLM</span>
        <Lamp status={status} label="brain" />
      </div>
      <div role="group" aria-label="Brain mode" className="flex gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className="btn-round"
            style={smallButton}
            aria-pressed={brain.mode === m.id}
            onClick={() => {
              settings.getState().set({ brain: { mode: m.id } });
              if (m.id !== 'llm') bus.getState().set('brain_status', 'off');
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <Field label="Server (OpenAI-compatible /v1)">
        <input className={inputClass} value={brain.baseUrl} disabled={brain.mode !== 'llm'} onChange={(e) => settings.getState().set({ brain: { baseUrl: e.target.value } })} onBlur={fetchModels} />
      </Field>
      <Field label="Model (fetched from the server)">
        <select className={inputClass} value={brain.model} disabled={brain.mode !== 'llm'} onChange={(e) => settings.getState().set({ brain: { model: e.target.value } })}>
          {uniq([brain.model, ...models]).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex gap-3">
        <button type="button" className="btn-round" style={smallButton} disabled={busy || brain.mode !== 'llm'} onClick={fetchModels}>
          Fetch
        </button>
        <button type="button" className="btn-round" style={smallButton} disabled={busy || brain.mode !== 'llm' || !brain.model} onClick={test}>
          Test
        </button>
      </div>
      {result && (
        <div className="glass px-3 py-2 text-sm" data-testid="brain-test-result">
          {result}
        </div>
      )}
    </section>
  );
}
