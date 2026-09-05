import { describe, it, expect, beforeEach } from 'vitest';
import { settings, DEFAULT_SETTINGS } from '../../src/voice/settings';

describe('voice settings', () => {
  beforeEach(() => settings.getState().reset());

  it('defaults point at local jacks only', () => {
    const s = settings.getState();
    expect(s.tts.baseUrl).toMatch(/^http:\/\/localhost/);
    expect(s.brain.baseUrl).toMatch(/^http:\/\/localhost/);
    expect(s.brain.mode).toBe('fixed');
  });

  it('set merges per section and persists to localStorage', () => {
    settings.getState().set({ tts: { voice: 'am_adam' }, brain: { mode: 'llm' } });
    const s = settings.getState();
    expect(s.tts.voice).toBe('am_adam');
    expect(s.tts.baseUrl).toBe(DEFAULT_SETTINGS.tts.baseUrl);
    expect(s.brain.mode).toBe('llm');
    expect(JSON.parse(localStorage.getItem('cymatyx-voice-settings')!).state.tts.voice).toBe('am_adam');
  });
});
