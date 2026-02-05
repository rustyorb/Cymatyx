import { ProviderKey, ProviderConfig, ProviderSetupState } from '../types.ts';

// Predefined providers with sensible defaults
export const PROVIDER_DEFAULTS: Record<ProviderKey, { name: string; baseUrl: string; authHeader: string; prefix?: string; extraHeaders?: Record<string, string>; note?: string; } > = {
  openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', authHeader: 'Authorization', prefix: 'Bearer ' },
  anthropic: { name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', authHeader: 'x-api-key', extraHeaders: { 'anthropic-version': '2023-06-01' } },
  openrouter: { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', authHeader: 'Authorization', prefix: 'Bearer ' },
  venice: { name: 'VeniceAI', baseUrl: 'https://api.venice.ai/api/v1', authHeader: 'Authorization', prefix: 'Bearer ' },
  groq: { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', authHeader: 'Authorization', prefix: 'Bearer ' },
  mistral: { name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', authHeader: 'Authorization', prefix: 'Bearer ' },
  cohere: { name: 'Cohere', baseUrl: 'https://api.cohere.com/v1', authHeader: 'Authorization', prefix: 'Bearer ' },
  together: { name: 'Together', baseUrl: 'https://api.together.xyz/v1', authHeader: 'Authorization', prefix: 'Bearer ' },
  perplexity: { name: 'Perplexity', baseUrl: 'https://api.perplexity.ai', authHeader: 'Authorization', prefix: 'Bearer ' },
  xai: { name: 'XAI', baseUrl: 'https://api.x.ai/v1', authHeader: 'Authorization', prefix: 'Bearer ' },
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', authHeader: 'Authorization', prefix: 'Bearer ' },
  nebius: { name: 'Nebius', baseUrl: 'https://api.studio.nebius.ai/v1', authHeader: 'Authorization', prefix: 'Bearer ' },
  ollama: { name: 'Ollama (local)', baseUrl: 'http://127.0.0.1:11434/v1', authHeader: 'Authorization', prefix: 'Bearer ', note: 'No key required if local auth disabled' },
  lmstudio: { name: 'LM Studio (LAN)', baseUrl: 'http://192.168.0.177:6969/v1', authHeader: 'Authorization', prefix: 'Bearer ', note: 'Defaults to baseUrl provided by user' },
  gemini: { name: 'Gemini (live)', baseUrl: 'https://generativelanguage.googleapis.com', authHeader: 'x-goog-api-key' }
};

const STORAGE_KEY = 'cymatyx-provider-setup';

export const loadSetupState = (): ProviderSetupState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ProviderSetupState;
  } catch (e) {
    console.warn('Failed to load provider setup state', e);
  }
  return {
    selectedProvider: 'openai',
    providers: {},
    geminiLiveKey: ''
  };
};

export const saveSetupState = (state: ProviderSetupState) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save provider setup state', e);
  }
};

export const resolveProviderConfig = (state: ProviderSetupState): ProviderConfig | null => {
  const current = state.providers[state.selectedProvider];
  if (!current) return null;
  const defaults = PROVIDER_DEFAULTS[state.selectedProvider];
  return {
    provider: state.selectedProvider,
    baseUrl: current.baseUrl || defaults?.baseUrl,
    apiKey: current.apiKey || '',
    model: current.model,
    authHeader: defaults?.authHeader || 'Authorization',
    prefix: defaults?.prefix,
    extraHeaders: defaults?.extraHeaders
  };
};

export const fetchModels = async (cfg: ProviderConfig): Promise<string[]> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (cfg.apiKey) {
    if (cfg.prefix) headers[cfg.authHeader] = `${cfg.prefix}${cfg.apiKey}`;
    else headers[cfg.authHeader] = cfg.apiKey;
  }
  if (cfg.extraHeaders) Object.assign(headers, cfg.extraHeaders);

  const url = `${cfg.baseUrl?.replace(/\/$/, '')}/models`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Model fetch failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  const items = data.data || data.models || [];
  const ids = items.map((m: any) => m.id || m.name).filter(Boolean);
  return ids.sort((a: string, b: string) => a.localeCompare(b));
};
