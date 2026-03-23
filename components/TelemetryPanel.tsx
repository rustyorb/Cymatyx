import { useSessionStore } from '../stores/useSessionStore.ts';
import { useAudioStore, type EntrainmentSource } from '../stores/useAudioStore.ts';

/** Human-readable labels and colors for entrainment sources */
const SOURCE_DISPLAY: Record<EntrainmentSource, { label: string; color: string; dot: string }> = {
  ai: { label: 'AI Provider', color: 'text-emerald-400', dot: 'bg-emerald-400' },
  offline: { label: 'Offline Rules', color: 'text-amber-400', dot: 'bg-amber-400' },
  live: { label: 'Gemini Live', color: 'text-cyan-400', dot: 'bg-cyan-400' },
  init: { label: 'Initializing', color: 'text-slate-500', dot: 'bg-slate-500' },
};

export default function TelemetryPanel() {
  const { biometrics, calibrationRsa } = useSessionStore();
  const entrainmentSource = useAudioStore((s) => s.entrainmentSource);
  const sourceInfo = SOURCE_DISPLAY[entrainmentSource];

  return (
    <div className="bg-slate-900/40 rounded-2xl p-6 border border-slate-800 backdrop-blur-xl">
      <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">Physiological Telemetry</h3>
      <div className="grid grid-cols-1 gap-4">
        <div className="bg-black/40 p-5 rounded-xl border border-slate-800 flex justify-between items-center">
          <span className="text-slate-500 text-[10px] uppercase tracking-wider">Heart Rate</span>
          <div className="text-xl font-mono text-cyan-400">{Math.round(biometrics.bpm)} <span className="text-[10px] text-slate-600">BPM</span></div>
        </div>
        <div className="bg-black/40 p-5 rounded-xl border border-slate-800 flex justify-between items-center">
          <span className="text-slate-500 text-[10px] uppercase tracking-wider">RSA Value</span>
          <div className="text-xl font-mono text-purple-400">{Math.round(calibrationRsa)} <span className="text-[10px] text-slate-600">Hz</span></div>
        </div>
        {/* Entrainment source indicator */}
        <div className="bg-black/40 p-5 rounded-xl border border-slate-800 flex justify-between items-center">
          <span className="text-slate-500 text-[10px] uppercase tracking-wider">Engine</span>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${sourceInfo.dot} animate-pulse`} />
            <span className={`text-sm font-mono ${sourceInfo.color}`}>{sourceInfo.label}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
