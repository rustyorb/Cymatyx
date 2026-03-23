import { ProviderKey, ProviderConfig, ProviderSetupState } from '../types.ts';
import { initVault, storeKey, loadKey, clearAll, getEnvKey, getStorageMode, setStorageMode, type StorageMode } from './keyVault.ts';

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

// ── Legacy storage key (for migration) ─────────────────────────────────
const LEGACY_STORAGE_KEY = 'cymatyx-provider-setup';

// ── Non-sensitive state storage key ────────────────────────────────────
const STATE_STORAGE_KEY = 'cymatyx-provider-state';

/** Vault initialization state */
let _vaultReady = false;

/**
 * Initialize the secure key vault. Must be called once at app startup.
 */
export async function initProviderSecurity(): Promise<void> {
  if (_vaultReady) return;
  await initVault();
  _vaultReady = true;
  // Migrate legacy plaintext keys if they exist
  await migrateLegacyKeys();
}

/**
 * Migrate plaintext API keys from legacy localStorage format to encrypted vault.
 * Only runs once — removes legacy data after successful migration.
 */
async function migrateLegacyKeys(): Promise<void> {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return;

    const legacy = JSON.parse(raw) as ProviderSetupState;
    let migrated = false;

    // Migrate provider keys
    for (const [provider, config] of Object.entries(legacy.providers || {})) {
      if (config?.apiKey) {
        await storeKey(provider, config.apiKey);
        migrated = true;
      }
    }

    // Migrate Gemini live key
    if (legacy.geminiLiveKey) {
      await storeKey('gemini-live', legacy.geminiLiveKey);
      migrated = true;
    }

    // Save non-sensitive state (selected provider, baseUrls, models) to new format
    const cleanState: ProviderSetupState = {
      selectedProvider: legacy.selectedProvider || 'openai',
      providers: {},
    };
    for (const [provider, config] of Object.entries(legacy.providers || {})) {
      cleanState.providers[provider as ProviderKey] = {
        apiKey: '', // Never store plaintext keys in the new state
        baseUrl: config?.baseUrl || '',
        model: config?.model,
        models: config?.models,
      };
    }
    localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(cleanState));

    // Remove legacy plaintext storage
    localStorage.removeItem(LEGACY_STORAGE_KEY);

    if (migrated) {
      console.info('[Cymatyx] Migrated API keys from plaintext to encrypted vault.');
    }
  } catch (e) {
    console.warn('[Cymatyx] Legacy key migration failed:', e);
  }
}

/**
 * Load setup state (non-sensitive parts: selected provider, baseUrls, models).
 * API keys are NOT included — use resolveApiKey() to get them securely.
 */
export const loadSetupState = (): ProviderSetupState => {
  try {
    const raw = localStorage.getItem(STATE_STORAGE_KEY);
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

/**
 * Save non-sensitive setup state. API keys are stored separately via the vault.
 */
export const saveSetupState = (state: ProviderSetupState) => {
  try {
    // Strip API keys from the saved state — they go to the vault
    const cleanState: ProviderSetupState = {
      selectedProvider: state.selectedProvider,
      providers: {},
    };
    for (const [provider, config] of Object.entries(state.providers || {})) {
      cleanState.providers[provider as ProviderKey] = {
        apiKey: '', // Never persist plaintext
        baseUrl: config?.baseUrl || '',
        model: config?.model,
        models: config?.models,
      };
    }
    if (state.geminiLiveKey) {
      cleanState.geminiLiveKey = ''; // Don't persist plaintext
    }
    localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(cleanState));
  } catch (e) {
    console.warn('Failed to save provider setup state', e);
  }
};

/**
 * Save an API key to the encrypted vault.
 * Priority: env vars > vault keys (env vars are checked at resolve time).
 */
export async function saveApiKey(provider: string, key: string): Promise<void> {
  if (!key) {
    // Empty key = user wants to clear it
    const { clearKey: ck } = await import('./keyVault.ts');
    await ck(provider);
    return;
  }
  await storeKey(provider, key);
}

/**
 * Resolve the API key for a provider.
 * Priority: env var > vault (encrypted localStorage / sessionStorage)
 */
export async function resolveApiKey(provider: string): Promise<string> {
  // 1. Check environment variables first (highest priority, set at build time)
  const envKey = getEnvKey(provider);
  if (envKey) return envKey;

  // 2. Check encrypted vault
  const vaultKey = await loadKey(provider);
  if (vaultKey) return vaultKey;

  return '';
}

/**
 * Resolve the Gemini Live API key specifically.
 * Checks: env var > vault 'gemini-live' > vault 'gemini' > process.env fallback
 */
export async function resolveGeminiLiveKey(): Promise<string> {
  // Check env var
  const envKey = getEnvKey('gemini');
  if (envKey) return envKey;

  // Check vault (dedicated gemini-live key)
  const liveKey = await loadKey('gemini-live');
  if (liveKey) return liveKey;

  // Fallback to build-time env
  return (typeof process !== 'undefined' && process.env?.API_KEY) || '';
}

/**
 * Save the Gemini Live API key to the vault.
 */
export async function saveGeminiLiveKey(key: string): Promise<void> {
  if (!key) {
    await import('./keyVault.ts').then(v => v.clearKey('gemini-live'));
    return;
  }
  await storeKey('gemini-live', key);
}

// Re-export storage mode controls
export { getStorageMode, setStorageMode, type StorageMode };

export const resolveProviderConfig = (state: ProviderSetupState): ProviderConfig | null => {
  const current = state.providers[state.selectedProvider];
  if (!current) return null;
  const defaults = PROVIDER_DEFAULTS[state.selectedProvider];
  return {
    provider: state.selectedProvider,
    baseUrl: current.baseUrl || defaults?.baseUrl,
    apiKey: current.apiKey || '', // May be empty — use resolveApiKey() for the real key
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

  // Resolve key from vault for the actual API call
  const apiKey = cfg.apiKey || await resolveApiKey(cfg.provider);
  if (apiKey) {
    if (cfg.prefix) headers[cfg.authHeader] = `${cfg.prefix}${apiKey}`;
    else headers[cfg.authHeader] = apiKey;
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
