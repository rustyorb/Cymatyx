import React from 'react';
import { useSessionStore } from '../stores/useSessionStore.ts';
import BreathingGuide from './BreathingGuide.tsx';

export default function CalibrationView() {
  const { calibrationStep, biometrics } = useSessionStore();

  // During calibration: 15s cycle (5s IN + 5s HOLD + 5s OUT)
  // Map our 4-7-8 ratio to ~15s: breathingRate=15 gives ~3.2s inhale, ~5.5s hold, ~6.3s exhale
  const calibrationBreathingRate = 15;
  const isCalibrating = calibrationStep === 'IN' || calibrationStep === 'HOLD' || calibrationStep === 'OUT';

  return (
    <div className="h-full flex flex-col items-center justify-center bg-black/40 rounded-[2.5rem] border border-slate-900 relative overflow-hidden min-h-[500px]">
      {/* Ambient background pulse */}
      {isCalibrating && (
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background: 'radial-gradient(circle at center, rgba(34,211,238,0.15), transparent 70%)',
            animation: 'calibPulse 3s ease-in-out infinite',
          }}
        />
      )}

      <div className="relative z-10 flex flex-col items-center text-center">
        {isCalibrating ? (
          <BreathingGuide
            breathingRate={calibrationBreathingRate}
            isActive={true}
            hrv={biometrics.hrv}
            rsa={biometrics.rsa}
            primaryColor="#22d3ee"
          />
        ) : (
          <>
            <div className="w-40 h-40 border-2 border-slate-800 rounded-full flex items-center justify-center mb-8">
              <span className="text-lg font-black text-white/50 tracking-[0.3em]">READY</span>
            </div>
            <h2 className="text-xl text-white font-bold mb-2 tracking-widest uppercase">
              Calibrating
            </h2>
          </>
        )}
        <div className="text-lg font-mono text-cyan-500/50 mt-4">{Math.round(biometrics.bpm)} BPM</div>
      </div>

      <style>{`
        @keyframes calibPulse {
          0%, 100% { opacity: 0.1; transform: scale(0.95); }
          50% { opacity: 0.25; transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}
