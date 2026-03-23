import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLiveGemini } from './useLiveGemini.ts';
import { generateSessionConfig } from '../services/geminiService.ts';
import { generateEncouragement } from '../services/encouragementService.ts';
import { generateOfflineConfig } from '../services/therapeuticFallback.ts';
import { resolveProviderConfig } from '../services/providers.ts';
import { AppState, BiometricData } from '../types.ts';
import { useSessionStore } from '../stores/useSessionStore.ts';
import { useAudioStore } from '../stores/useAudioStore.ts';
import { useSettingsStore } from '../stores/useSettingsStore.ts';
import { saveSession } from '../services/sessionDb.ts';

export function useSessionOrchestrator(canvasRef: React.RefObject<HTMLCanvasElement>) {
  // ── Zustand stores ──────────────────────────────────────────────────
  const {
    state,
    goal,
    biometrics,
    calibrationRsa,
    sessionStartedAt,
    biometricTimeseries,
    configSnapshots,
    setAppState,
    setBiometrics,
    setCalibrationStep,
    setCalibrationRsa,
    addLog,
    startRecording,
    recordBiometric,
    recordConfigChange,
    clearRecording,
  } = useSessionStore();

  const { config, isLiveMode, setConfig, mergeConfig } = useAudioStore();

  const {
    setupState,
    selfLoveEnabled,
    selfLoveTtsEnabled,
    addSelfLoveLine,
  } = useSettingsStore();

  // ── Derived ─────────────────────────────────────────────────────────
  const providerConfig = useMemo(
    () => resolveProviderConfig(setupState),
    [setupState],
  );

  // ── Refs (stable references for intervals/timers) ───────────────────
  const biometricsRef = useRef(biometrics);
  const goalRef = useRef(goal);

  useEffect(() => {
    biometricsRef.current = biometrics;
  }, [biometrics]);

  useEffect(() => {
    goalRef.current = goal;
  }, [goal]);

  // ── Callbacks ───────────────────────────────────────────────────────
  const handleBiometricUpdate = useCallback(
    (d: BiometricData) => {
      setBiometrics(d);
      // Record to timeseries during active session (sample every call — ~1Hz from HeartRateMonitor)
      if (d.bpm > 0) {
        recordBiometric({
          timestamp: Date.now(),
          bpm: d.bpm,
          hrv: d.hrv,
          signalQuality: d.signalQuality,
          rsa: d.rsa,
        });
      }
    },
    [setBiometrics, recordBiometric],
  );

  const speak = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1;
    utter.pitch = 1;
    utter.volume = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }, []);

  // ── Live Gemini (with auto-reconnect + offline degradation) ─────────
  const handleDegraded = useCallback(() => {
    addLog('SYSTEM', 'Neural link failed — switching to offline therapeutic mode');
    // Automatically generate offline config for current biometrics
    const bio = biometricsRef.current;
    if (bio.bpm > 0) {
      const offlineConfig = generateOfflineConfig(goalRef.current, bio.bpm, bio.hrv);
      setConfig(offlineConfig, 'offline');
      recordConfigChange({ timestamp: Date.now(), config: offlineConfig });
    }
  }, [addLog, setConfig, recordConfigChange]);

  const {
    connect: connectLive,
    disconnect: disconnectLive,
    retry: retryLive,
    sendText,
    isConnected,
    connectionStatus,
    micVolume,
    getOutputData,
  } = useLiveGemini({
    apiKey: setupState.geminiLiveKey,
    onAudioOutput: () => {},
    onLog: addLog,
    onDegraded: handleDegraded,
    onToolCall: async (name: string, args: any) => {
      if (name === 'updateEntrainment') {
        mergeConfig(args, 'live');
        recordConfigChange({ timestamp: Date.now(), config: { ...useAudioStore.getState().config, ...args } });
        addLog(
          'AI',
          `System Update: Beat ${args.binauralBeatFreq}Hz / Carrier ${args.carrierFreq}Hz`,
        );
        return 'Entrainment parameters updated.';
      }
      return 'Tool acknowledged.';
    },
  });

  // ── Audio waveform canvas drawing ───────────────────────────────────
  useEffect(() => {
    let animId: number;
    const draw = () => {
      if (canvasRef.current && isConnected) {
        const ctx = canvasRef.current.getContext('2d');
        const data = getOutputData();
        if (ctx) {
          const w = canvasRef.current.width;
          const h = canvasRef.current.height;
          ctx.clearRect(0, 0, w, h);
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#22d3ee';
          ctx.beginPath();
          const sliceWidth = w / data.length;
          let x = 0;
          for (let i = 0; i < data.length; i++) {
            const v = data[i] / 128.0;
            const y = (v * h) / 2;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            x += sliceWidth;
          }
          ctx.lineTo(w, h / 2);
          ctx.stroke();
        }
      }
      animId = requestAnimationFrame(draw);
    };
    if (isConnected) draw();
    return () => cancelAnimationFrame(animId);
  }, [isConnected, getOutputData, canvasRef]);

  // ── Biometric telemetry loop ────────────────────────────────────────
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (state === AppState.SESSION_ACTIVE) {
      interval = setInterval(async () => {
        const bio = biometricsRef.current;
        if (bio.bpm > 0 && bio.signalQuality > 0.4) {
          if (isLiveMode && isConnected) {
            sendText(
              `Telemetry: ${Math.round(bio.bpm)} BPM. RSA: ${calibrationRsa}. Goal: ${goalRef.current}. Update physics.`,
            );
          } else if (isLiveMode && !isConnected) {
            // Live mode selected but not connected — use offline fallback
            // Only log if actually failed/disconnected, not during reconnection
            if (connectionStatus !== 'reconnecting' && connectionStatus !== 'connecting') {
              addLog('SYSTEM', 'Live mode disconnected — using offline therapeutic fallback');
            }
            const offlineConfig = generateOfflineConfig(
              goalRef.current,
              bio.bpm,
              bio.hrv,
            );
            setConfig(offlineConfig, 'offline');
            recordConfigChange({ timestamp: Date.now(), config: offlineConfig });
          } else {
            // Non-live mode — use AI with offline fallback
            addLog('SYSTEM', 'Analyzing bio-trend...');
            const result = await generateSessionConfig(
              goalRef.current,
              bio.bpm,
              bio.hrv,
              [],
              providerConfig,
            );
            setConfig(result.config, result.source);
            recordConfigChange({ timestamp: Date.now(), config: result.config });
            if (result.source === 'offline') {
              addLog('SYSTEM', 'Using offline therapeutic fallback');
            }
          }
        }
      }, 15000);
    }
    return () => clearInterval(interval);
  }, [state, isLiveMode, isConnected, connectionStatus, calibrationRsa, providerConfig, addLog, sendText, setConfig]);

  // ── Self-love encouragement loop ────────────────────────────────────
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (selfLoveEnabled && state === AppState.SESSION_ACTIVE) {
      interval = setInterval(async () => {
        const bio = biometricsRef.current;
        const line = await generateEncouragement(
          bio.bpm || 70,
          goalRef.current,
          providerConfig,
        );
        addSelfLoveLine(line);
        if (selfLoveTtsEnabled) {
          speak(line);
        }
      }, 20000);
    }
    return () => clearInterval(interval);
  }, [selfLoveEnabled, selfLoveTtsEnabled, state, providerConfig, speak, addSelfLoveLine]);

  // ── Calibration handler ─────────────────────────────────────────────
  const handleStartCalibration = useCallback(async () => {
    setAppState(AppState.CALIBRATING);
    addLog('SYSTEM', 'Initiating Vagal Tone Calibration...');
    setCalibrationStep('IN');

    let minBpm = 200;
    let maxBpm = 0;

    const tracker = setInterval(() => {
      const b = biometricsRef.current.bpm;
      if (b > 0) {
        if (b < minBpm) minBpm = b;
        if (b > maxBpm) maxBpm = b;
      }
    }, 200);

    setTimeout(() => {
      setCalibrationStep('HOLD');
      setTimeout(() => {
        setCalibrationStep('OUT');
        setTimeout(async () => {
          clearInterval(tracker);
          setCalibrationStep('');

          let rsa = maxBpm > minBpm ? maxBpm - minBpm : 12;
          setCalibrationRsa(rsa);
          addLog('BIO', `Calibration Finished. Vagal Tone: ${Math.round(rsa)}`);

          if (isLiveMode) {
            await connectLive(
              `Act as Cymatyx. User Goal: ${goal}. Vagal Tone: ${rsa}. Use 'updateEntrainment' to adjust physics.`,
            );
          }

          const initialResult = await generateSessionConfig(
            goal,
            biometricsRef.current.bpm || 75,
            50,
            [],
            providerConfig,
          );
          setConfig(initialResult.config, initialResult.source);
          startRecording(); // Begin recording biometric timeseries
          recordConfigChange({ timestamp: Date.now(), config: initialResult.config });
          if (initialResult.source === 'offline') {
            addLog('SYSTEM', 'Offline therapeutic fallback active — no AI provider needed');
          }
          setAppState(AppState.SESSION_ACTIVE);
        }, 5000);
      }, 5000);
    }, 5000);
  }, [
    goal,
    isLiveMode,
    providerConfig,
    setAppState,
    setCalibrationStep,
    setCalibrationRsa,
    addLog,
    connectLive,
    setConfig,
    startRecording,
    recordConfigChange,
  ]);

  // ── Session save on end ────────────────────────────────────────────
  const prevStateRef = useRef(state);
  useEffect(() => {
    const prevState = prevStateRef.current;
    prevStateRef.current = state;

    // Save session when transitioning from SESSION_ACTIVE to SUMMARY
    if (prevState === AppState.SESSION_ACTIVE && state === AppState.SUMMARY) {
      const startedAt = useSessionStore.getState().sessionStartedAt;
      const timeseries = useSessionStore.getState().biometricTimeseries;
      const snapshots = useSessionStore.getState().configSnapshots;

      if (startedAt && timeseries.length > 0) {
        saveSession(
          startedAt,
          Date.now(),
          goal,
          calibrationRsa,
          timeseries,
          snapshots,
        )
          .then((id) => {
            addLog('SYSTEM', `Session #${id} saved (${timeseries.length} samples)`);
          })
          .catch((err) => {
            addLog('ERROR', `Failed to save session: ${err.message}`);
          });
      }
    }

    // Clear recording when returning to IDLE
    if (state === AppState.IDLE && prevState === AppState.SUMMARY) {
      clearRecording();
    }
  }, [state, goal, calibrationRsa, addLog, clearRecording]);

  // ── Public API ──────────────────────────────────────────────────────
  return {
    // Actions
    handleStartCalibration,
    handleBiometricUpdate,
    connectLive,
    disconnectLive,
    retryLive,
    sendText,
    speak,

    // State
    isConnected,
    connectionStatus,
    micVolume,
    canvasRef,

    // Stores (pass-through for views)
    state,
    goal,
    biometrics,
    calibrationStep: useSessionStore((s) => s.calibrationStep),
    calibrationRsa,
    systemLog: useSessionStore((s) => s.systemLog),
    config,
    isLiveMode,
    entrainmentSource: useAudioStore((s) => s.entrainmentSource),
    volume: useAudioStore((s) => s.volume),
    setupState,
    selfLoveEnabled,
    selfLoveTtsEnabled,
    selfLoveLines: useSettingsStore((s) => s.selfLoveLines),
    providerConfig,

    // Store setters
    setAppState,
    setGoal: useSessionStore((s) => s.setGoal),
    setBiometrics,
    setConfig,
    mergeConfig,
    setVolume: useAudioStore((s) => s.setVolume),
    setIsLiveMode: useAudioStore((s) => s.setIsLiveMode),
    setSetupState: useSettingsStore((s) => s.setSetupState),
    setSelfLoveEnabled: useSettingsStore((s) => s.setSelfLoveEnabled),
    setSelfLoveTtsEnabled: useSettingsStore((s) => s.setSelfLoveTtsEnabled),
    addLog,
    addSelfLoveLine,
  };
}

export default useSessionOrchestrator;
