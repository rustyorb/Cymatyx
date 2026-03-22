import React from 'react';
import { GoalType } from '../types.ts';
import { useSessionStore } from '../stores/useSessionStore.ts';
import { useAudioStore } from '../stores/useAudioStore.ts';
import { useSettingsStore } from '../stores/useSettingsStore.ts';

interface GoalSelectionProps {
  onStartCalibration: () => void;
}

export default function GoalSelection({ onStartCalibration }: GoalSelectionProps) {
  const { goal, setGoal } = useSessionStore();
  const { isLiveMode, setIsLiveMode } = useAudioStore();
  const { selfLoveEnabled, setSelfLoveEnabled, selfLoveTtsEnabled, setSelfLoveTtsEnabled } = useSettingsStore();

  return (
    <div className="h-full flex flex-col items-center justify-center bg-slate-900/20 rounded-[2.5rem] border border-slate-800/50 p-12 text-center shadow-inner relative overflow-hidden min-h-[500px]">
      <div className="relative z-10 w-full max-w-sm">
        <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Select Neural Goal</h2>
        <p className="text-slate-500 text-xs mb-8 uppercase tracking-widest">Adjust system tuning parameters</p>

        <div className="grid grid-cols-1 gap-3 mb-8">
          {[GoalType.RELAXATION, GoalType.FOCUS, GoalType.ENERGY, GoalType.NEURO_REGEN, GoalType.SELF_LOVE].map((g) => (
            <button
              key={g}
              onClick={() => setGoal(g)}
              className={`px-6 py-4 rounded-xl text-xs font-bold transition-all uppercase tracking-[0.2em] border ${
                goal === g
                  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.1)]'
                  : 'bg-slate-900/50 text-slate-600 border-slate-800'
              }`}
            >
              {g.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between bg-slate-900/70 border border-slate-800 rounded-xl p-4 mb-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-slate-500 font-bold">Self-Love Mode</div>
            <p className="text-slate-500 text-[11px] mt-1">Closed-loop encouragement, optional TTS. Toggle only if desired.</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={selfLoveEnabled}
                onChange={(e) => setSelfLoveEnabled(e.target.checked)}
                className="accent-pink-400"
              />
              Enable
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={selfLoveTtsEnabled}
                onChange={(e) => setSelfLoveTtsEnabled(e.target.checked)}
                className="accent-pink-400"
              />
              TTS
            </label>
          </div>
        </div>

        <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 mb-8">
          <button
            onClick={() => setIsLiveMode(false)}
            className={`flex-1 py-3 text-[10px] uppercase tracking-widest rounded-lg transition-all ${
              !isLiveMode ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-400'
            }`}
          >
            Standard
          </button>
          <button
            onClick={() => setIsLiveMode(true)}
            className={`flex-1 py-3 text-[10px] uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-2 ${
              isLiveMode ? 'bg-cyan-900/30 text-cyan-400' : 'text-slate-500 hover:text-slate-400'
            }`}
          >
            Live Link
          </button>
        </div>

        <button
          onClick={onStartCalibration}
          className="w-full py-6 bg-white text-slate-950 font-black rounded-2xl transition-all hover:scale-[1.01] active:scale-95 tracking-[0.4em] text-xs shadow-2xl"
        >
          START SEQUENCE
        </button>
      </div>
    </div>
  );
}
