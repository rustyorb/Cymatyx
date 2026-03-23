import { create } from 'zustand';
import type { GammaConfig } from '../types.ts';

/**
 * Zustand store for 40Hz Gamma / ISF module state.
 * Separate from useAudioStore because gamma mode has its own
 * independent audio path (click train) and visual overlay (flicker).
 */
interface GammaState {
  gamma: GammaConfig;
  /** Whether the gamma module panel is expanded in the UI */
  panelExpanded: boolean;
  setGamma: (gamma: Partial<GammaConfig>) => void;
  setPanelExpanded: (expanded: boolean) => void;
  /** Reset to defaults (e.g., on session end) */
  resetGamma: () => void;
}

const DEFAULT_GAMMA: GammaConfig = {
  isfEnabled: false,
  clickTrainVolume: 0.3,
  flickerIntensity: 0.5,
  epilepsyWarningAcknowledged: false,
  flickerDutyCycle: 0.5,
};

export const useGammaStore = create<GammaState>((set) => ({
  gamma: { ...DEFAULT_GAMMA },
  panelExpanded: false,
  setGamma: (partial) =>
    set((state) => ({ gamma: { ...state.gamma, ...partial } })),
  setPanelExpanded: (expanded) => set({ panelExpanded: expanded }),
  resetGamma: () => set({ gamma: { ...DEFAULT_GAMMA }, panelExpanded: false }),
}));

export default useGammaStore;
