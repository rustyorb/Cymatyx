import React, { useEffect, useMemo, useState } from 'react';
import { ProviderKey, ProviderSetupState } from '../types.ts';
import { PROVIDER_DEFAULTS, fetchModels, loadSetupState, saveSetupState } from '../services/providers.ts';

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

  useEffect(() => {
    setLocalState(state);
  }, [state]);

  const currentConfig = useMemo(() => localState.providers[localState.selectedProvider] || {}, [localState]);
  const defaults = PROVIDER_DEFAULTS[localState.selectedProvider];

  useEffect(() => {
    saveSetupState(localState);
    onChange(localState);
  }, [localState, onChange]);

  const updateCurrent = (patch: Partial<{ apiKey: string; baseUrl: string; model?: string; models?: string[] }>) => {
    setLocalState(prev => ({
      ...prev,
      providers: {
        ...prev.providers,
        [prev.selectedProvider]: {
          apiKey: patch.apiKey ?? currentConfig.apiKey ?? '',
          baseUrl: patch.baseUrl ?? currentConfig.baseUrl ?? defaults?.baseUrl ?? '',
          model: patch.model ?? currentConfig.model,
          models: patch.models ?? currentConfig.models ?? []
        }
      }
    }));
  };

  const handleFetchModels = async () => {
    setLoading(true);
    setError(null);
    try {
      const cfg = localState.providers[localState.selectedProvider] || { apiKey: '', baseUrl: defaults?.baseUrl ?? '', model: '' };
      const models = await fetchModels({
        provider: localState.selectedProvider,
        baseUrl: cfg.baseUrl || defaults?.baseUrl || '',
        apiKey: cfg.apiKey,
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

  const handleGeminiKey = (value: string) => {
    setLocalState(prev => ({ ...prev, geminiLiveKey: value }));
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-slate-500 font-bold">Model Providers</div>
          <p className="text-slate-500 text-xs">Enter key → fetch models → pick default. Stored locally (browser).</p>
        </div>
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
        <label className="text-[10px] uppercase text-slate-500 tracking-widest">API Key
          <input
            type="password"
            value={currentConfig.apiKey || ''}
            onChange={(e) => updateCurrent({ apiKey: e.target.value })}
            placeholder="Enter API key"
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
        <label className="text-[10px] uppercase text-slate-500 tracking-widest">Gemini Live API Key (for audio link)
          <input
            type="password"
            value={state.geminiLiveKey || ''}
            onChange={(e) => handleGeminiKey(e.target.value)}
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
