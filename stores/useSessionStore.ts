import { create } from 'zustand';
import { AppState, GoalType, BiometricData, LogEntry } from '../types.ts';

interface SessionState {
  state: AppState;
  goal: GoalType;
  biometrics: BiometricData;
  calibrationStep: string;
  calibrationRsa: number;
  systemLog: LogEntry[];
  setAppState: (state: AppState) => void;
  setGoal: (goal: GoalType) => void;
  setBiometrics: (biometrics: BiometricData) => void;
  setCalibrationStep: (step: string) => void;
  setCalibrationRsa: (rsa: number) => void;
  addLog: (source: 'SYSTEM' | 'BIO' | 'AI' | 'ERROR', message: string) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  state: AppState.IDLE,
  goal: GoalType.RELAXATION,
  biometrics: { bpm: 0, hrv: 0, signalQuality: 0, timestamp: 0 },
  calibrationStep: '',
  calibrationRsa: 0,
  systemLog: [],

  setAppState: (state) => set({ state }),
  setGoal: (goal) => set({ goal }),
  setBiometrics: (biometrics) => set({ biometrics }),
  setCalibrationStep: (calibrationStep) => set({ calibrationStep }),
  setCalibrationRsa: (calibrationRsa) => set({ calibrationRsa }),
  addLog: (source, message) =>
    set((prev) => ({
      systemLog: [
        ...prev.systemLog,
        {
          id: Math.random().toString(36),
          timestamp: new Date().toLocaleTimeString([], {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          source,
          message,
        },
      ].slice(-50),
    })),
}));

export default useSessionStore;
