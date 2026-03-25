import { useRef, useEffect } from 'react';
import { useSessionStore } from '../stores/useSessionStore.ts';

const sourceColors: Record<string, string> = {
  SYSTEM: 'text-cyan-500',
  BIO: 'text-emerald-500',
  AI: 'text-purple-500',
  ERROR: 'text-red-500',
};

export default function KernelLog() {
  const { systemLog } = useSessionStore();
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [systemLog]);

  return (
    <div className="bg-slate-900/40 rounded-2xl p-6 border border-slate-800 backdrop-blur-xl">
      <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">Kernel Log</h3>
      <div role="log" aria-live="polite" aria-label="System kernel log" className="bg-black/40 rounded-xl border border-slate-800 p-4 max-h-64 overflow-y-auto font-mono text-[10px] space-y-1 scrollbar-thin scrollbar-thumb-slate-700">
        {systemLog.length === 0 ? (
          <p className="text-slate-600 italic text-center py-4">No log entries</p>
        ) : (
          systemLog.map((entry) => (
            <div key={entry.id} className="flex gap-2 leading-relaxed">
              <span className="text-slate-600 shrink-0">{entry.timestamp}</span>
              <span className={`shrink-0 ${sourceColors[entry.source] || 'text-slate-500'}`}>
                [{entry.source}]
              </span>
              <span className="text-slate-400 break-all">{entry.message}</span>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
