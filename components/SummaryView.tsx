import React from 'react';
import { AppState } from '../types.ts';
import { useSessionStore } from '../stores/useSessionStore.ts';

export default function SummaryView() {
  const { calibrationRsa, setAppState } = useSessionStore();

  return (
    <div className="h-full bg-slate-900/50 rounded-[2.5rem] p-12 border border-slate-800 flex flex-col items-center justify-center text-center">
      <h2 className="text-2xl text-white font-bold mb-4 tracking-tighter">Session Optimization Complete</h2>
      <p className="text-slate-500 text-sm mb-10 max-w-xs">
        Baseline Vagal Tone of {Math.round(calibrationRsa)}Hz maintained across resonance cycle.
      </p>
      <button
        onClick={() => setAppState(AppState.IDLE)}
        className="px-10 py-4 bg-cyan-600 text-white font-bold rounded-xl hover:bg-cyan-500 transition-colors tracking-widest text-xs"
      >
        DISMISS
      </button>
    </div>
  );
}
