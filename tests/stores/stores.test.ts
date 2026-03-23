// Must mock providers.ts BEFORE any store imports that depend on it
vi.mock('../../services/providers.ts', () => ({
  loadSetupState: () => ({
    selectedProvider: 'openai',
    providers: {},
    geminiLiveKey: '',
  }),
}));

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppState, GoalType } from '../../types.ts';
import { useSessionStore } from '../../stores/useSessionStore.ts';
import { useAudioStore } from '../../stores/useAudioStore.ts';
import { useGammaStore } from '../../stores/useGammaStore.ts';
import { useSettingsStore } from '../../stores/useSettingsStore.ts';

// ─── useSessionStore ────────────────────────────────────────────────
describe('useSessionStore', () => {
  beforeEach(() => {
    useSessionStore.setState({
      state: AppState.IDLE,
      goal: GoalType.RELAXATION,
      biometrics: { bpm: 0, hrv: 0, signalQuality: 0, timestamp: 0 },
      calibrationStep: '',
      calibrationRsa: 0,
      systemLog: [],
      sessionStartedAt: null,
      biometricTimeseries: [],
      configSnapshots: [],
    });
  });

  it('initial state has AppState.IDLE and GoalType.RELAXATION', () => {
    const { state, goal } = useSessionStore.getState();
    expect(state).toBe(AppState.IDLE);
    expect(goal).toBe(GoalType.RELAXATION);
  });

  it('setAppState changes state', () => {
    useSessionStore.getState().setAppState(AppState.SESSION_ACTIVE);
    expect(useSessionStore.getState().state).toBe(AppState.SESSION_ACTIVE);
  });

  it('setGoal changes goal', () => {
    useSessionStore.getState().setGoal(GoalType.FOCUS);
    expect(useSessionStore.getState().goal).toBe(GoalType.FOCUS);
  });

  it('addLog appends log entry with correct shape', () => {
    useSessionStore.getState().addLog('SYSTEM', 'hello');
    const logs = useSessionStore.getState().systemLog;
    expect(logs).toHaveLength(1);
    const entry = logs[0];
    expect(entry).toHaveProperty('id');
    expect(typeof entry.id).toBe('string');
    expect(entry).toHaveProperty('timestamp');
    expect(typeof entry.timestamp).toBe('string');
    expect(entry.source).toBe('SYSTEM');
    expect(entry.message).toBe('hello');
  });

  it('addLog caps at 50 entries', () => {
    const addLog = useSessionStore.getState().addLog;
    for (let i = 0; i < 60; i++) {
      addLog('SYSTEM', `msg-${i}`);
    }
    expect(useSessionStore.getState().systemLog).toHaveLength(50);
    // Should keep the last 50 (indices 10-59)
    expect(useSessionStore.getState().systemLog[0].message).toBe('msg-10');
    expect(useSessionStore.getState().systemLog[49].message).toBe('msg-59');
  });

  it('startRecording sets sessionStartedAt and clears arrays', () => {
    // Pre-populate some data
    useSessionStore.setState({
      biometricTimeseries: [{ ts: 1 } as any],
      configSnapshots: [{ ts: 1 } as any],
    });
    useSessionStore.getState().startRecording();
    const s = useSessionStore.getState();
    expect(s.sessionStartedAt).toBeTypeOf('number');
    expect(s.sessionStartedAt).toBeGreaterThan(0);
    expect(s.biometricTimeseries).toHaveLength(0);
    expect(s.configSnapshots).toHaveLength(0);
  });

  it('clearRecording resets recording state', () => {
    useSessionStore.getState().startRecording();
    useSessionStore.setState({
      biometricTimeseries: [{ ts: 1 } as any],
      configSnapshots: [{ ts: 1 } as any],
    });
    useSessionStore.getState().clearRecording();
    const s = useSessionStore.getState();
    expect(s.sessionStartedAt).toBeNull();
    expect(s.biometricTimeseries).toHaveLength(0);
    expect(s.configSnapshots).toHaveLength(0);
  });
});

// ─── useAudioStore ──────────────────────────────────────────────────
describe('useAudioStore', () => {
  beforeEach(() => {
    useAudioStore.setState({
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
    });
  });

  it('initial config has default values', () => {
    const { config, entrainmentSource } = useAudioStore.getState();
    expect(config.binauralBeatFreq).toBe(10);
    expect(config.carrierFreq).toBe(200);
    expect(config.visualPulseRate).toBe(10);
    expect(config.primaryColor).toBe('#6366f1');
    expect(config.breathingRate).toBe(5);
    expect(config.spatialPan).toBe(0);
    expect(entrainmentSource).toBe('init');
  });

  it('setConfig replaces entire config', () => {
    const newConfig = {
      binauralBeatFreq: 4,
      carrierFreq: 300,
      visualPulseRate: 4,
      primaryColor: '#ff0000',
      breathingRate: 3,
      spatialPan: 0.1,
      inductionText: 'new text',
      explanation: 'new explanation',
    };
    useAudioStore.getState().setConfig(newConfig);
    expect(useAudioStore.getState().config).toEqual(newConfig);
  });

  it('setConfig with source updates entrainmentSource', () => {
    const newConfig = {
      binauralBeatFreq: 4,
      carrierFreq: 300,
      visualPulseRate: 4,
      primaryColor: '#ff0000',
      breathingRate: 3,
      spatialPan: 0.1,
      inductionText: 'x',
      explanation: 'y',
    };
    useAudioStore.getState().setConfig(newConfig, 'ai');
    expect(useAudioStore.getState().entrainmentSource).toBe('ai');
  });

  it('setConfig without source does NOT change entrainmentSource', () => {
    useAudioStore.setState({ entrainmentSource: 'offline' });
    const newConfig = {
      binauralBeatFreq: 4,
      carrierFreq: 300,
      visualPulseRate: 4,
      primaryColor: '#ff0000',
      breathingRate: 3,
      spatialPan: 0.1,
      inductionText: 'x',
      explanation: 'y',
    };
    useAudioStore.getState().setConfig(newConfig);
    expect(useAudioStore.getState().entrainmentSource).toBe('offline');
  });

  it('mergeConfig only overwrites specified fields', () => {
    useAudioStore.getState().mergeConfig({ binauralBeatFreq: 40 });
    const config = useAudioStore.getState().config;
    expect(config.binauralBeatFreq).toBe(40);
    // Other fields unchanged
    expect(config.carrierFreq).toBe(200);
    expect(config.primaryColor).toBe('#6366f1');
    expect(config.breathingRate).toBe(5);
  });

  it('mergeConfig with source updates entrainmentSource', () => {
    useAudioStore.getState().mergeConfig({ binauralBeatFreq: 40 }, 'live');
    expect(useAudioStore.getState().entrainmentSource).toBe('live');
  });
});

// ─── useGammaStore ──────────────────────────────────────────────────
describe('useGammaStore', () => {
  beforeEach(() => {
    useGammaStore.setState({
      gamma: {
        isfEnabled: false,
        clickTrainVolume: 0.3,
        flickerIntensity: 0.5,
        epilepsyWarningAcknowledged: false,
        flickerDutyCycle: 0.5,
      },
      panelExpanded: false,
    });
  });

  it('initial gamma has defaults', () => {
    const { gamma } = useGammaStore.getState();
    expect(gamma.isfEnabled).toBe(false);
    expect(gamma.clickTrainVolume).toBe(0.3);
    expect(gamma.flickerIntensity).toBe(0.5);
    expect(gamma.epilepsyWarningAcknowledged).toBe(false);
    expect(gamma.flickerDutyCycle).toBe(0.5);
  });

  it('setGamma partial merge works', () => {
    useGammaStore.getState().setGamma({ isfEnabled: true, clickTrainVolume: 0.8 });
    const { gamma } = useGammaStore.getState();
    expect(gamma.isfEnabled).toBe(true);
    expect(gamma.clickTrainVolume).toBe(0.8);
    // Unchanged fields preserved
    expect(gamma.flickerIntensity).toBe(0.5);
    expect(gamma.flickerDutyCycle).toBe(0.5);
  });

  it('resetGamma restores all defaults and panelExpanded=false', () => {
    useGammaStore.getState().setGamma({ isfEnabled: true, clickTrainVolume: 1.0 });
    useGammaStore.getState().setPanelExpanded(true);
    useGammaStore.getState().resetGamma();
    const s = useGammaStore.getState();
    expect(s.gamma.isfEnabled).toBe(false);
    expect(s.gamma.clickTrainVolume).toBe(0.3);
    expect(s.gamma.flickerIntensity).toBe(0.5);
    expect(s.gamma.epilepsyWarningAcknowledged).toBe(false);
    expect(s.gamma.flickerDutyCycle).toBe(0.5);
    expect(s.panelExpanded).toBe(false);
  });
});

// ─── useSettingsStore ───────────────────────────────────────────────
describe('useSettingsStore', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      selfLoveEnabled: false,
      selfLoveTtsEnabled: false,
      selfLoveLines: [],
    });
  });

  it('addSelfLoveLine appends lines', () => {
    useSettingsStore.getState().addSelfLoveLine('I am worthy');
    useSettingsStore.getState().addSelfLoveLine('I am enough');
    const lines = useSettingsStore.getState().selfLoveLines;
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('I am worthy');
    expect(lines[1]).toBe('I am enough');
  });

  it('addSelfLoveLine caps at 10 entries', () => {
    const add = useSettingsStore.getState().addSelfLoveLine;
    for (let i = 0; i < 15; i++) {
      add(`line-${i}`);
    }
    const lines = useSettingsStore.getState().selfLoveLines;
    expect(lines).toHaveLength(10);
    // Should keep the last 10 (indices 5-14)
    expect(lines[0]).toBe('line-5');
    expect(lines[9]).toBe('line-14');
  });

  it('setSelfLoveEnabled toggles boolean', () => {
    expect(useSettingsStore.getState().selfLoveEnabled).toBe(false);
    useSettingsStore.getState().setSelfLoveEnabled(true);
    expect(useSettingsStore.getState().selfLoveEnabled).toBe(true);
    useSettingsStore.getState().setSelfLoveEnabled(false);
    expect(useSettingsStore.getState().selfLoveEnabled).toBe(false);
  });
});
