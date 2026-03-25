import React, { useRef, useEffect } from 'react';
import { AppState } from '../types.ts';
import { useSessionStore } from '../stores/useSessionStore.ts';
import { useSessionOrchestrator } from '../hooks/useSessionOrchestrator.ts';
import { useHeaderActions } from '../components/Layout.tsx';

// Views (center column)
import GoalSelection from '../components/GoalSelection.tsx';
import CalibrationView from '../components/CalibrationView.tsx';
import SessionView from '../components/SessionView.tsx';
import SummaryView from '../components/SummaryView.tsx';

// Sidebar panels
import HeartRateMonitor from '../components/HeartRateMonitor.tsx';
import CoherenceMeter from '../components/CoherenceMeter.tsx';
import TelemetryPanel from '../components/TelemetryPanel.tsx';
import ProviderSetup from '../components/ProviderSetup.tsx';
import NeuralConnector from '../components/NeuralConnector.tsx';
import SelfLoveCoach from '../components/SelfLoveCoach.tsx';
import KernelLog from '../components/KernelLog.tsx';

/**
 * Main session page — 3-column layout with biometrics, active view, and controls.
 */
export default function SessionPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state } = useSessionStore();
  const { setHeaderActions } = useHeaderActions();

  const {
    handleStartCalibration,
    handleBiometricUpdate,
    disconnectLive,
    retryLive,
    isConnected,
    connectionStatus,
    micVolume,
    setupState,
    setSetupState,
    setAppState,
  } = useSessionOrchestrator(canvasRef);

  // Inject Terminate button into Layout header when session is active
  useEffect(() => {
    if (state === AppState.SESSION_ACTIVE) {
      setHeaderActions(
        <button
          onClick={() => { setAppState(AppState.SUMMARY); disconnectLive(); }}
          className="px-4 py-1.5 rounded-full border border-red-500/30 text-red-400 text-[10px] uppercase tracking-[0.2em] hover:bg-red-500/10 transition-colors"
        >
          Terminate
        </button>
      );
    } else {
      setHeaderActions(null);
    }
    return () => setHeaderActions(null);
  }, [state, setAppState, disconnectLive, setHeaderActions]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* ── Left Sidebar: Biometrics ──────────────────────────────── */}
      <div className="space-y-6 lg:col-span-3 order-2 lg:order-1 flex flex-col">
        <HeartRateMonitor
          onBiometricUpdate={handleBiometricUpdate}
          isActive={state !== AppState.IDLE && state !== AppState.SUMMARY}
          mode={state === AppState.CALIBRATING ? 'calibration' : 'monitoring'}
        />
        {(state === AppState.SESSION_ACTIVE || state === AppState.CALIBRATING) && (
          <CoherenceMeter />
        )}
        <TelemetryPanel />
      </div>

      {/* ── Center: Active View ───────────────────────────────────── */}
      <div className="lg:col-span-6 order-1 lg:order-2 flex flex-col gap-6">
        {state === AppState.IDLE && (
          <GoalSelection onStartCalibration={handleStartCalibration} />
        )}
        {state === AppState.CALIBRATING && <CalibrationView />}
        {state === AppState.SESSION_ACTIVE && <SessionView />}
        {state === AppState.SUMMARY && <SummaryView />}
      </div>

      {/* ── Right Sidebar: Controls & Logs ────────────────────────── */}
      <div className="space-y-6 lg:col-span-3 order-3 flex flex-col h-full">
        <ProviderSetup state={setupState} onChange={setSetupState} />
        <NeuralConnector
          canvasRef={canvasRef}
          isConnected={isConnected}
          connectionStatus={connectionStatus}
          micVolume={micVolume}
          onRetry={retryLive}
        />
        <SelfLoveCoach />
        <KernelLog />
      </div>
    </div>
  );
}
