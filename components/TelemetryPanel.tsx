import { useSessionStore } from '../stores/useSessionStore.ts';

export default function TelemetryPanel() {
  const { biometrics, calibrationRsa } = useSessionStore();
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
      </div>
    </div>
  );
}
