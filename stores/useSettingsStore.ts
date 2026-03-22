import { create } from 'zustand';
import type { ProviderSetupState } from '../types.ts';
import { loadSetupState } from '../services/providers.ts';

interface SettingsState {
  setupState: ProviderSetupState;
  selfLoveEnabled: boolean;
  selfLoveTtsEnabled: boolean;
  selfLoveLines: string[];
  setSetupState: (state: ProviderSetupState) => void;
  setSelfLoveEnabled: (enabled: boolean) => void;
  setSelfLoveTtsEnabled: (enabled: boolean) => void;
  addSelfLoveLine: (line: string) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  setupState: loadSetupState(),
  selfLoveEnabled: false,
  selfLoveTtsEnabled: false,
  selfLoveLines: [],
  setSetupState: (setupState) => set({ setupState }),
  setSelfLoveEnabled: (selfLoveEnabled) => set({ selfLoveEnabled }),
  setSelfLoveTtsEnabled: (selfLoveTtsEnabled) => set({ selfLoveTtsEnabled }),
  addSelfLoveLine: (line) =>
    set((state) => ({
      selfLoveLines: [...state.selfLoveLines, line].slice(-10),
    })),
}));

export default useSettingsStore;
