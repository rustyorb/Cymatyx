import { useState } from 'react';
import { useSettings, settings } from '../../voice/settings';
import { useSignal } from '../../bus/useSignal';
import { probeTts } from '../../voice/probe';
import { synthesize } from '../../voice/tts';
import { createPlayer } from '../../voice/player';
import { templateLine } from '../../voice/lines';
import { bus } from '../../bus/store';
import { Lamp, Field, inputClass, smallButton } from './jack';

const player = createPlayer();
const uniq = (arr: string[]) => arr.filter((v, i, a) => v && a.indexOf(v) === i);

/** Back-of-rack TTS jack: one OpenAI-compatible server; models and voices fetched from it, never typed. */
export function VoiceJack() {
  const tts = useSettings((s) => s.tts);
  const status = useSignal('tts_status');
  const [lists, setLists] = useState<{ models: string[]; voices: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchLists = async () => {
    setBusy(true);
    setLists(await probeTts());
    setBusy(false);
  };
  const test = async () => {
    setBusy(true);
    try {
      const line = templateLine({ event: 'test', goal: 'RELAXATION', minutes: 0, bpm: null, hrv: null, coherence: null, breath_rate: null, rsa_baseline: null, band: null, trend: 'unknown' });
      bus.getState().set('coach_last_line', line);
      const blob = await synthesize(tts, line, AbortSignal.timeout(15000));
      bus.getState().patch({ tts_status: 'ok', coach_speaking: true });
      await player.play(blob);
    } catch (e) {
      bus.getState().patch({ tts_status: 'error', last_error: `Voice jack: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      bus.getState().set('coach_speaking', false);
      setBusy(false);
    }
  };

  return (
    <section className="module space-y-3" aria-label="Voice jack">
      <div className="flex justify-between items-center">
        <span className="tape">Voice jack — TTS</span>
        <Lamp status={status} label="voice" />
      </div>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={tts.enabled}
          onChange={(e) => {
            settings.getState().set({ tts: { enabled: e.target.checked } });
            if (!e.target.checked) bus.getState().set('tts_status', 'off');
          }}
        />
        <span className="label">Enabled</span>
      </label>
      <Field label="Server (OpenAI-compatible /v1)">
        <input className={inputClass} value={tts.baseUrl} onChange={(e) => settings.getState().set({ tts: { baseUrl: e.target.value } })} onBlur={fetchLists} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Model">
          <select className={inputClass} value={tts.model} onChange={(e) => settings.getState().set({ tts: { model: e.target.value } })}>
            {uniq([tts.model, ...(lists?.models ?? [])]).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Voice">
          <select className={inputClass} value={tts.voice} onChange={(e) => settings.getState().set({ tts: { voice: e.target.value } })}>
            {uniq([tts.voice, ...(lists?.voices ?? [])]).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="flex gap-3">
        <button type="button" className="btn-round" style={smallButton} disabled={busy || !tts.enabled} onClick={fetchLists}>
          Fetch
        </button>
        <button type="button" className="btn-round" style={smallButton} disabled={busy || !tts.enabled} onClick={test}>
          Test
        </button>
      </div>
    </section>
  );
}
