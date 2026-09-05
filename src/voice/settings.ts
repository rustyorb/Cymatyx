import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type BrainMode = 'off' | 'fixed' | 'llm';
export interface VoiceSettings {
  tts: { enabled: boolean; baseUrl: string; model: string; voice: string };
  brain: { mode: BrainMode; baseUrl: string; model: string };
  coach: { enabled: boolean; intervalS: number };
}
export const DEFAULT_SETTINGS: VoiceSettings = {
  tts: { enabled: true, baseUrl: 'http://localhost:8880/v1', model: 'kokoro', voice: 'af_sky' },
  brain: { mode: 'fixed', baseUrl: 'http://localhost:11434/v1', model: '' },
  coach: { enabled: true, intervalS: 90 },
};
type Patch = { [K in keyof VoiceSettings]?: Partial<VoiceSettings[K]> };
interface SettingsStore extends VoiceSettings {
  set: (patch: Patch) => void;
  reset: () => void;
}

/** Jack configuration. Persisted locally; never on the bus (the bus carries live state, not config). */
export const settings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (patch) =>
        set((s) => ({
          tts: { ...s.tts, ...patch.tts },
          brain: { ...s.brain, ...patch.brain },
          coach: { ...s.coach, ...patch.coach },
        })),
      reset: () => set({ ...DEFAULT_SETTINGS }),
    }),
    {
      name: 'cymatyx-voice-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ tts: s.tts, brain: s.brain, coach: s.coach }),
    },
  ),
);
export const useSettings = settings;
