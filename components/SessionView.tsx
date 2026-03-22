import React from 'react';
import EntrainmentPlayer from './EntrainmentPlayer.tsx';
import { useAudioStore } from '../stores/useAudioStore.ts';

export default function SessionView() {
  const { config, volume, setVolume } = useAudioStore();

  return (
    <div className="h-full flex flex-col gap-6">
      <EntrainmentPlayer config={config} isPlaying={true} volume={volume} />
      <div className="bg-slate-900/40 p-6 rounded-2xl border border-slate-800 flex items-center gap-8">
        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest shrink-0">Main Amplitude</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="flex-grow accent-cyan-500"
        />
      </div>
    </div>
  );
}
