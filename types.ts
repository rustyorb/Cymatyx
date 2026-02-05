export enum AppState {
  IDLE = 'IDLE',
  CALIBRATING = 'CALIBRATING', // Measuring initial baseline
  SESSION_ACTIVE = 'SESSION_ACTIVE',
  SUMMARY = 'SUMMARY'
}

export enum GoalType {
  RELAXATION = 'RELAXATION',
  FOCUS = 'FOCUS',
  ENERGY = 'ENERGY',
  NEURO_REGEN = 'NEURO_REGEN', // 40Hz Gamma Alzheimer's Protocol
  SELF_LOVE = 'SELF_LOVE'
}

export interface BiometricData {
  bpm: number;
  hrv: number; // SDNN in ms
  signalQuality: number; // 0-1
  timestamp: number;
  rsa?: number; // Respiratory Sinus Arrhythmia (Max BPM - Min BPM during breath cycle)
}

export interface EntrainmentConfig {
  binauralBeatFreq: number; // e.g., 4Hz (Theta)
  carrierFreq: number; // e.g., 200Hz
  visualPulseRate: number; // Match beat freq
  primaryColor: string; // Hex
  breathingRate: number; // Guide breathing
  spatialPan: number; // Hz (Speed of 3D rotation, e.g., 0.1)
  inductionText: string; // Hypnotic script to be spoken
  explanation: string; // Gemini's reasoning
}

export interface SessionLog {
  timestamp: number;
  bpm: number;
  config: EntrainmentConfig;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  source: 'SYSTEM' | 'BIO' | 'AI' | 'ERROR';
  message: string;
}

// Provider setup state for multi-backend support
export type ProviderKey =
  | 'openai'
  | 'anthropic'
  | 'openrouter'
  | 'venice'
  | 'groq'
  | 'mistral'
  | 'cohere'
  | 'together'
  | 'perplexity'
  | 'xai'
  | 'deepseek'
  | 'nebius'
  | 'ollama'
  | 'lmstudio'
  | 'gemini';

export interface ProviderConfig {
  provider: ProviderKey;
  baseUrl: string;
  apiKey: string;
  model?: string;
  authHeader?: string;
  prefix?: string;
  extraHeaders?: Record<string, string>;
}

export interface ProviderSetupState {
  selectedProvider: ProviderKey;
  providers: Record<ProviderKey, { apiKey: string; baseUrl: string; model?: string; models?: string[] }>;
  geminiLiveKey?: string;
}
