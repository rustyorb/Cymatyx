import React, { useState } from 'react';
import { useGammaStore } from '../stores/useGammaStore.ts';
import EpilepsyWarning from './EpilepsyWarning.tsx';

/**
 * GammaControlPanel — UI controls for the 40Hz Gamma ISF module.
 *
 * Only rendered when NEURO_REGEN goal is active. Provides:
 * - ISF mode toggle (with epilepsy warning gate)
 * - Click train volume slider
 * - Visual flicker intensity slider
 * - Duty cycle control
 * - Real-time status indicators
 */
export default function GammaControlPanel() {
  const { gamma, setGamma, panelExpanded, setPanelExpanded } = useGammaStore();
  const [showWarning, setShowWarning] = useState(false);

  const handleISFToggle = () => {
    if (!gamma.isfEnabled && !gamma.epilepsyWarningAcknowledged) {
      // Must show warning first
      setShowWarning(true);
      return;
    }
    setGamma({ isfEnabled: !gamma.isfEnabled });
  };

  const handleWarningAccept = () => {
    setGamma({ epilepsyWarningAcknowledged: true, isfEnabled: true });
    setShowWarning(false);
  };

  const handleWarningDecline = () => {
    // Enable ISF in audio-only mode (no flicker)
    setGamma({
      epilepsyWarningAcknowledged: false,
      isfEnabled: true,
      flickerIntensity: 0,
    });
    setShowWarning(false);
  };

  return (
    <>
      {showWarning && (
        <EpilepsyWarning onAccept={handleWarningAccept} onDecline={handleWarningDecline} />
      )}

      <div className="bg-slate-900/60 rounded-2xl border border-purple-900/50 overflow-hidden">
        {/* Header — always visible */}
        <button
          onClick={() => setPanelExpanded(!panelExpanded)}
          aria-expanded={panelExpanded}
          aria-controls="gamma-panel-content"
          className="w-full px-5 py-3 flex items-center justify-between hover:bg-purple-900/10 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div aria-hidden="true" className={`w-2 h-2 rounded-full ${gamma.isfEnabled ? 'bg-purple-400 animate-pulse' : 'bg-slate-600'}`} />
            <span className="text-[11px] font-bold uppercase tracking-widest text-purple-300">
              40Hz Gamma ISF
            </span>
            {gamma.isfEnabled && (
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono">
                ACTIVE
              </span>
            )}
          </div>
          <svg
            aria-hidden="true"
            className={`w-4 h-4 text-slate-500 transition-transform ${panelExpanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Controls — collapsible */}
        {panelExpanded && (
          <div id="gamma-panel-content" className="px-5 pb-5 space-y-4 border-t border-purple-900/30">
            {/* ISF Master Toggle */}
            <div className="flex items-center justify-between pt-4">
              <div>
                <p className="text-xs font-semibold text-white">ISF Mode</p>
                <p className="text-[10px] text-slate-500">Combined audio + visual 40Hz</p>
              </div>
              <button
                onClick={handleISFToggle}
                role="switch"
                aria-checked={gamma.isfEnabled}
                aria-label="ISF Mode toggle"
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  gamma.isfEnabled ? 'bg-purple-600' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    gamma.isfEnabled ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Click Train Volume */}
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">Click Train</span>
                <span className="text-[10px] font-mono text-purple-300">
                  {Math.round(gamma.clickTrainVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={gamma.clickTrainVolume}
                onChange={(e) => setGamma({ clickTrainVolume: parseFloat(e.target.value) })}
                className="w-full accent-purple-500 h-1"
                aria-label="Click train volume"
                disabled={!gamma.isfEnabled}
              />
            </div>

            {/* Flicker Intensity */}
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">Flicker Intensity</span>
                <span className="text-[10px] font-mono text-purple-300">
                  {gamma.flickerIntensity === 0
                    ? 'OFF'
                    : `${Math.round(gamma.flickerIntensity * 100)}%`}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={gamma.flickerIntensity}
                onChange={(e) => setGamma({ flickerIntensity: parseFloat(e.target.value) })}
                className="w-full accent-purple-500 h-1"
                aria-label="Flicker intensity"
                disabled={!gamma.isfEnabled || !gamma.epilepsyWarningAcknowledged}
              />
              {!gamma.epilepsyWarningAcknowledged && gamma.isfEnabled && (
                <p className="text-[9px] text-amber-500/70">
                  Visual flicker disabled — epilepsy warning was declined
                </p>
              )}
            </div>

            {/* Duty Cycle */}
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">Duty Cycle</span>
                <span className="text-[10px] font-mono text-purple-300">
                  {Math.round(gamma.flickerDutyCycle * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.2"
                max="0.8"
                step="0.05"
                value={gamma.flickerDutyCycle}
                onChange={(e) => setGamma({ flickerDutyCycle: parseFloat(e.target.value) })}
                className="w-full accent-purple-500 h-1"
                aria-label="Duty cycle"
                disabled={!gamma.isfEnabled}
              />
              <p className="text-[9px] text-slate-600">
                50% = square wave (standard protocol)
              </p>
            </div>

            {/* Protocol info */}
            <div className="mt-3 p-3 rounded-xl bg-purple-950/30 border border-purple-900/30">
              <p className="text-[10px] text-purple-300/70 leading-relaxed">
                <strong className="text-purple-300">Iaccarino Protocol:</strong> 40Hz gamma oscillation
                entrainment via synchronized audio-visual stimulation. Research shows reduction in
                amyloid-β plaques and phosphorylated tau in Alzheimer's models.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
