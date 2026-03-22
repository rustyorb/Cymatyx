import React from 'react';
import { useSessionStore } from '../stores/useSessionStore.ts';

export default function CalibrationView() {
  const { calibrationStep, biometrics } = useSessionStore();

  return (
    <div className="h-full flex flex-col items-center justify-center bg-black/40 rounded-[2.5rem] border border-slate-900 relative overflow-hidden min-h-[500px]">
      <div className="relative z-10 flex flex-col items-center text-center">
        <div
          className={`w-40 h-40 border-2 rounded-full flex items-center justify-center mb-8 transition-all duration-[5000ms]
            ${
              calibrationStep === 'IN'
                ? 'scale-110 border-cyan-400 bg-cyan-500/5'
                : calibrationStep === 'HOLD'
                ? 'scale-110 border-white'
                : calibrationStep === 'OUT'
                ? 'scale-90 border-slate-700'
                : 'border-slate-800'
            }
          `}
        >
          <span className="text-lg font-black text-white tracking-[0.3em]">{calibrationStep}</span>
        </div>
        <h2 className="text-xl text-white font-bold mb-2 tracking-widest uppercase">
          {calibrationStep === 'IN'
            ? 'Breath In'
            : calibrationStep === 'HOLD'
            ? 'Retain'
            : calibrationStep === 'OUT'
            ? 'Release'
            : 'Calibrating'}
        </h2>
        <div className="text-lg font-mono text-cyan-500/50">{Math.round(biometrics.bpm)} BPM</div>
      </div>
    </div>
  );
}
