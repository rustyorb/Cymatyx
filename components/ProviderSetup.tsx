import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { ProviderKey, ProviderSetupState } from '../types.ts';
import {
  PROVIDER_DEFAULTS,
  fetchModels,
  loadSetupState,
  saveSetupState,
  saveApiKey,
  resolveApiKey,
  saveGeminiLiveKey,
  getStorageMode,
  setStorageMode,
  type StorageMode,
} from '../services/providers.ts';

interface Props {
  onChange: (state: ProviderSetupState) => void;
  state: ProviderSetupState;
}

const providerOptions: ProviderKey[] = [
  'openai','anthropic','openrouter','venice','groq','mistral','cohere','together','perplexity','xai','deepseek','nebius','ollama','lmstudio'
];

const ProviderSetup: React.FC<Props> = ({ onChange, state }) => {
  const [localState, setLocalState] = useState<ProviderSetupState>(() => state || loadSetupState());
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageMode, setStorageModeLocal] = useState<StorageMode>(getStorageMode());

  // Track which provider keys the user has entered (display masking)
  const [keyMasks, setKeyMasks] = useState<Record<string, boolean>>({});
  // Actual key values in memory (never persisted in state)
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [geminiLiveInput, setGeminiLiveInput] = useState('');

  useEffect(() => {
    setLocalState(state);
  }, [state]);

  // Load existing vault keys on mount and provider change
  useEffect(() => {
    const loadVaultKeys = async () => {
      const provider = localState.selectedProvider;
      const key = await resolveApiKey(provider);
      if (key) {
        setKeyMasks(prev => ({ ...prev, [provider]: true }));
        setKeyInputs(prev => ({ ...prev, [provider]: key }));
      }
      // Load gemini live key
      const { resolveGeminiLiveKey } = await import('../services/providers.ts');
      const geminiKey = await resolveGeminiLiveKey();
      if (geminiKey) {
        setGeminiLiveInput(geminiKey);
      }
    };
    loadVaultKeys();
  }, [localState.selectedProvider]);

  const currentConfig = useMemo(() => localState.providers[localState.selectedProvider] || {}, [localState]);
  const defaults = PROVIDER_DEFAULTS[localState.selectedProvider];

  useEffect(() => {
    saveSetupState(localState);
    onChange(localState);
  }, [localState, onChange]);

  const updateCurrent = useCallback((patch: Partial<{ baseUrl: string; model?: string; models?: string[] }>) => {
    setLocalState(prev => ({
      ...prev,
      providers: {
        ...prev.providers,
        [prev.selectedProvider]: {
          apiKey: '', // Keys are in the vault, not the state
          baseUrl: patch.baseUrl ?? currentConfig.baseUrl ?? defaults?.baseUrl ?? '',
          model: patch.model ?? currentConfig.model,
          models: patch.models ?? currentConfig.models ?? []
        }
      }
    }));
  }, [currentConfig, defaults]);

  const handleKeyChange = useCallback(async (value: string) => {
    const provider = localState.selectedProvider;
    setKeyInputs(prev => ({ ...prev, [provider]: value }));
    setKeyMasks(prev => ({ ...prev, [provider]: !!value }));
    // Store in vault (debounced save on blur is better, but immediate is fine for security)
    await saveApiKey(provider, value);
  }, [localState.selectedProvider]);

  const handleGeminiKeyChange = useCallback(async (value: string) => {
    setGeminiLiveInput(value);
    await saveGeminiLiveKey(value);
    // Also update state so orchestrator picks it up (but without the actual key)
    setLocalState(prev => ({ ...prev, geminiLiveKey: value ? '••••••' : '' }));
  }, []);

  const handleStorageModeChange = useCallback((mode: StorageMode) => {
    setStorageMode(mode);
    setStorageModeLocal(mode);
  }, []);

  const handleFetchModels = async () => {
    setLoading(true);
    setError(null);
    try {
      const cfg = localState.providers[localState.selectedProvider] || { apiKey: '', baseUrl: defaults?.baseUrl ?? '', model: '' };
      const resolvedKey = await resolveApiKey(localState.selectedProvider);
      const models = await fetchModels({
        provider: localState.selectedProvider,
        baseUrl: cfg.baseUrl || defaults?.baseUrl || '',
        apiKey: resolvedKey,
        model: cfg.model,
        authHeader: defaults?.authHeader,
        prefix: defaults?.prefix,
        extraHeaders: defaults?.extraHeaders
      });
      setModels(models);
      updateCurrent({ models });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectModel = (model: string) => {
    updateCurrent({ model });
  };

  /** Mask a key for display: show first 4 + last 4 chars */
  const maskKey = (key: string): string => {
    if (!key || key.length < 12) return key ? '••••••••' : '';
    return `${key.slice(0, 4)}${'•'.repeat(Math.min(key.length - 8, 20))}${key.slice(-4)}`;
  };

  const currentKeyInput = keyInputs[localState.selectedProvider] || '';
  const hasKey = keyMasks[localState.selectedProvider] || false;

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-slate-500 font-bold">Model Providers</div>
          <p className="text-slate-500 text-xs">
            Keys are {storageMode === 'session' ? 'session-only (cleared on tab close)' : 'encrypted at rest (AES-256-GCM)'}.
            Env vars override stored keys.
          </p>
        </div>
        {/* Storage mode toggle */}
        <button
          onClick={() => handleStorageModeChange(storageMode === 'persistent' ? 'session' : 'persistent')}
          className="text-[10px] uppercase tracking-widest text-slate-500 hover:text-cyan-400 border border-slate-800 rounded-lg px-3 py-1.5 transition-colors"
          title={storageMode === 'persistent' ? 'Switch to session-only (keys cleared on tab close)' : 'Switch to persistent (encrypted)'}
        >
          🔒 {storageMode === 'persistent' ? 'Persistent' : 'Session Only'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-[10px] uppercase text-slate-500 tracking-widest">Provider
          <select
            value={localState.selectedProvider}
            onChange={(e) => setLocalState(prev => ({ ...prev, selectedProvider: e.target.value as ProviderKey }))}
            className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white"
          >
            {providerOptions.map(p => (
              <option key={p} value={p}>{PROVIDER_DEFAULTS[p]?.name || p}</option>
            ))}
          </select>
        </label>
        <label className="text-[10px] uppercase text-slate-500 tracking-widest">
          API Key {hasKey && <span className="text-green-500 ml-1">✓ stored</span>}
          <input
            type="password"
            value={currentKeyInput}
            onChange={(e) => handleKeyChange(e.target.value)}
            placeholder={hasKey ? maskKey(currentKeyInput) : 'Enter API key'}
            className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white"
          />
        </label>
      </div>

      <label className="text-[10px] uppercase text-slate-500 tracking-widest block">Base URL
        <input
          value={currentConfig.baseUrl || defaults?.baseUrl || ''}
          onChange={(e) => updateCurrent({ baseUrl: e.target.value })}
          className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white"
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          onClick={handleFetchModels}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-cyan-600 text-xs font-bold tracking-widest uppercase disabled:opacity-60"
        >
          {loading ? 'Fetching…' : 'Fetch Models'}
        </button>
        {error && <span className="text-red-400 text-xs">{error}</span>}
      </div>

      <label className="text-[10px] uppercase text-slate-500 tracking-widest block">Default Model
        <select
          value={currentConfig.model || ''}
          onChange={(e) => handleSelectModel(e.target.value)}
          className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white"
        >
          <option value="">Select…</option>
          {(currentConfig.models?.length ? currentConfig.models : models).map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-slate-800 pt-4 mt-2">
        <label className="text-[10px] uppercase text-slate-500 tracking-widest">
          Gemini Live API Key (for audio link) {geminiLiveInput && <span className="text-green-500 ml-1">✓ stored</span>}
          <input
            type="password"
            value={geminiLiveInput}
            onChange={(e) => handleGeminiKeyChange(e.target.value)}
            placeholder="Optional: enables live link"
            className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white"
          />
        </label>
        {defaults?.note && <div className="text-xs text-slate-500">{defaults.note}</div>}
      </div>
    </div>
  );
};

export default ProviderSetup;
