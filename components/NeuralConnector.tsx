import React from 'react';
import { useSettingsStore } from '../stores/useSettingsStore.ts';
import type { ConnectionStatus } from '../hooks/useLiveGemini.ts';

interface NeuralConnectorProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  isConnected: boolean;
  connectionStatus: ConnectionStatus;
  micVolume: number;
  onRetry?: () => void;
}

/** Status indicator config by connection state */
const STATUS_CONFIG: Record<ConnectionStatus, { color: string; dotClass: string; label: string }> = {
  disconnected: { color: 'border-slate-800', dotClass: 'bg-slate-600', label: 'Offline' },
  connecting:   { color: 'border-amber-500/60', dotClass: 'bg-amber-400 animate-pulse', label: 'Connecting' },
  connected:    { color: 'border-cyan-500/60', dotClass: 'bg-emerald-400 animate-pulse', label: 'Online' },
  reconnecting: { color: 'border-amber-500/60', dotClass: 'bg-amber-400 animate-pulse', label: 'Reconnecting' },
  failed:       { color: 'border-red-500/60', dotClass: 'bg-red-400', label: 'Failed' },
};

export default function NeuralConnector({
  canvasRef,
  isConnected,
  connectionStatus,
  micVolume,
  onRetry,
}: NeuralConnectorProps) {
  const { selfLoveEnabled } = useSettingsStore();

  const status = STATUS_CONFIG[connectionStatus] || STATUS_CONFIG.disconnected;
  const borderColor = selfLoveEnabled ? 'border-pink-500/60' : status.color;

  return (
    <div className={`bg-slate-900/40 rounded-2xl p-6 border ${borderColor} backdrop-blur-xl transition-colors duration-500`}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Neural Connector</h3>
        <div className="flex items-center gap-2">
          <div aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${status.dotClass}`} />
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">
            {status.label}
          </span>
          {connectionStatus === 'failed' && onRetry && (
            <button
              onClick={onRetry}
              aria-label="Retry neural connection"
              className="text-[9px] text-red-400 hover:text-red-300 uppercase tracking-wider ml-1 underline"
            >
              Retry
            </button>
          )}
        </div>
      </div>

      {/* Reconnection banner */}
      {connectionStatus === 'reconnecting' && (
        <div role="status" aria-live="polite" className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 mb-4 text-[10px] text-amber-400 text-center">
          ⟳ Reconnecting to Neural Link...
        </div>
      )}

      {connectionStatus === 'failed' && (
        <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-4 text-[10px] text-red-400 text-center">
          Neural Link unavailable — running in offline therapeutic mode
        </div>
      )}

      {/* Waveform Canvas */}
      <div className="bg-black/40 rounded-xl border border-slate-800 p-3 mb-4">
        <canvas
          ref={canvasRef}
          width={300}
          height={80}
          aria-label="Audio waveform visualization"
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
            role="progressbar"
            aria-valuenow={Math.round(micVolume * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Microphone volume"
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
