import { Nixie } from '../instruments/Nixie';
import { VuMeter } from '../instruments/VuMeter';
import { GoalSelector } from '../instruments/GoalSelector';
import { PowerSwitch } from '../instruments/PowerSwitch';
import { BreathingGuide } from '../instruments/BreathingGuide';
import { Scope } from '../instruments/Scope';
import { SubjectMonitor } from '../instruments/SubjectMonitor';
import { CoachStrip } from '../instruments/CoachStrip';
import { useSignal, fmt } from '../../bus/useSignal';

export interface RackProps {
  waveform: number[];
  video: HTMLVideoElement | null;
  onStart: () => void;
  onEnd: () => void;
}

/** Front of the rack: three modules, every readout a bus signal. */
export function Rack({ waveform, video, onStart, onEnd }: RackProps) {
  const method = useSignal('engine_method');
  const sqi = useSignal('sqi');
  const rsa = useSignal('rsa_baseline');
  const state = useSignal('session_state');
  const err = useSignal('last_error');
  return (
    <main className="max-w-6xl mx-auto p-4 grid gap-4 md:grid-cols-[1fr_1.35fr_1fr]">
      <section className="module space-y-3" aria-label="Bio-telemetry">
        <span className="tape">Bio-Telemetry</span>
        <Nixie signal="bpm" label="Heart rate" unit="BPM" />
        <Nixie signal="hrv_rmssd" label="HRV" unit="ms" />
        <div className="flex justify-between">
          <span className="label">Engine {method ?? '--'}</span>
          <span className="label">SQI {sqi === null ? '--' : `${Math.round(sqi * 100)}%`}</span>
        </div>
        <Scope waveform={waveform} label="pulse trace" />
      </section>

      <section className="module space-y-5 text-center" aria-label="Session controller">
        <span className="tape">Session Controller</span>
        <GoalSelector />
        <BreathingGuide />
        <PowerSwitch onStart={onStart} onEnd={onEnd} />
        <div className="label" data-testid="session-state">
          {state}
        </div>
        <CoachStrip />
        {err && (
          <div className="label" style={{ color: 'var(--color-red)' }} role="alert">
            {err}
          </div>
        )}
      </section>

      <section className="module space-y-3" aria-label="HRV coherence">
        <span className="tape">HRV Coherence</span>
        <VuMeter />
        <SubjectMonitor video={video} />
        <div className="label">RSA baseline {fmt(rsa, 1)}</div>
      </section>
    </main>
  );
}
