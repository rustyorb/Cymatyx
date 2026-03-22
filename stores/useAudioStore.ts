import { create } from 'zustand';
import type { EntrainmentConfig } from '../types.ts';

interface AudioState {
  config: EntrainmentConfig;
  volume: number;
  isLiveMode: boolean;
  setConfig: (config: EntrainmentConfig) => void;
  mergeConfig: (partial: Partial<EntrainmentConfig>) => void;
  setVolume: (volume: number) => void;
  setIsLiveMode: (isLiveMode: boolean) => void;
}

export const useAudioStore = create<AudioState>((set) => ({
  config: {
    binauralBeatFreq: 10,
    carrierFreq: 200,
    visualPulseRate: 10,
    primaryColor: '#6366f1',
    breathingRate: 5,
    spatialPan: 0,
    inductionText: 'Welcome to Cymatyx.',
    explanation: 'Initializing bio-resonance sequence...',
  },
  volume: 0.5,
  isLiveMode: true,
  setConfig: (config) => set({ config }),
  mergeConfig: (partial) =>
    set((state) => ({ config: { ...state.config, ...partial } })),
  setVolume: (volume) => set({ volume }),
  setIsLiveMode: (isLiveMode) => set({ isLiveMode }),
}));

export default useAudioStore;
