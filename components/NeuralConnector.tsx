import React from 'react';
import { useSettingsStore } from '../stores/useSettingsStore.ts';

interface NeuralConnectorProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  isConnected: boolean;
  micVolume: number;
}

export default function NeuralConnector({ canvasRef, isConnected, micVolume }: NeuralConnectorProps) {
  const { selfLoveEnabled } = useSettingsStore();

  const borderColor = selfLoveEnabled
    ? 'border-pink-500/60'
    : isConnected
      ? 'border-cyan-500/60'
      : 'border-slate-800';

  return (
    <div className={`bg-slate-900/40 rounded-2xl p-6 border ${borderColor} backdrop-blur-xl transition-colors duration-500`}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Neural Connector</h3>
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">
            {isConnected ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Waveform Canvas */}
      <div className="bg-black/40 rounded-xl border border-slate-800 p-3 mb-4">
        <canvas
          ref={canvasRef}
          width={300}
          height={80}
          className="w-full h-[80px] rounded-lg"
        />
      </div>

      {/* Mic Volume Bar */}
      <div className="bg-black/40 rounded-xl border border-slate-800 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-slate-500 text-[10px] uppercase tracking-wider">Mic Volume</span>
          <span className="text-[10px] font-mono text-slate-600">{Math.round(micVolume * 100)}%</span>
        </div>
        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-150 ${
              selfLoveEnabled ? 'bg-pink-500' : 'bg-cyan-500'
            }`}
            style={{ width: `${Math.min(micVolume * 20, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
