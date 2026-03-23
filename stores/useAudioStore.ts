import { create } from 'zustand';
import type { EntrainmentConfig } from '../types.ts';

/** Source of current entrainment parameters */
export type EntrainmentSource = 'ai' | 'offline' | 'live' | 'init';

interface AudioState {
  config: EntrainmentConfig;
  volume: number;
  isLiveMode: boolean;
  /** Tracks where the current entrainment config came from */
  entrainmentSource: EntrainmentSource;
  setConfig: (config: EntrainmentConfig, source?: EntrainmentSource) => void;
  mergeConfig: (partial: Partial<EntrainmentConfig>, source?: EntrainmentSource) => void;
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
  entrainmentSource: 'init',
  setConfig: (config, source) => set({ config, ...(source ? { entrainmentSource: source } : {}) }),
  mergeConfig: (partial, source) =>
    set((state) => ({
      config: { ...state.config, ...partial },
      ...(source ? { entrainmentSource: source } : {}),
    })),
  setVolume: (volume) => set({ volume }),
  setIsLiveMode: (isLiveMode) => set({ isLiveMode }),
}));

export default useAudioStore;
