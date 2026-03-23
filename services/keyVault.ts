/**
 * @module keyVault
 * Secure API key storage service using SubtleCrypto AES-GCM encryption.
 * Keys are encrypted before being persisted to localStorage, or stored
 * transiently in sessionStorage depending on the configured mode.
 */

const STORAGE_PREFIX = 'cymatyx-kv-';
const SALT_KEY = 'cymatyx-kv-salt';
const MODE_KEY = 'cymatyx-kv-mode';
const APP_IDENTIFIER = 'cymatyx-ai-assistant-v1';

/** All supported provider identifiers. */
const PROVIDERS = [
  'openai',
  'anthropic',
  'openrouter',
  'venice',
  'groq',
  'mistral',
  'cohere',
  'together',
  'perplexity',
  'xai',
  'deepseek',
  'nebius',
  'ollama',
  'lmstudio',
  'gemini',
] as const;

export type Provider = (typeof PROVIDERS)[number];
export type StorageMode = 'persistent' | 'session';

/** Cached CryptoKey for the current session. */
let _cryptoKey: CryptoKey | null = null;

/** Current storage mode. */
let _mode: StorageMode = 'persistent';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the active storage backend based on the current mode.
 */
function getStorage(): Storage {
  return _mode === 'session' ? sessionStorage : localStorage;
}

/**
 * Encode a string to a Uint8Array (UTF-8).
 */
function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * Decode a Uint8Array (UTF-8) back to a string.
 */
function decode(buf: ArrayBuffer): string {
  return new TextDecoder().decode(buf);
}

/**
 * Convert an ArrayBuffer to a base-64 string for safe localStorage storage.
 */
function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert a base-64 string back to a Uint8Array.
 */
function base64ToBuf(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

/**
 * Retrieve or generate the random salt used for key derivation.
 * The salt is always stored in localStorage so it survives across sessions.
 */
function getOrCreateSalt(): Uint8Array {
  const existing = localStorage.getItem(SALT_KEY);
  if (existing) {
    return base64ToBuf(existing);
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem(SALT_KEY, bufToBase64(salt));
  return salt;
}

/**
 * Derive an AES-GCM CryptoKey from the stored salt and a fixed app identifier
 * using PBKDF2.
 */
async function deriveKey(salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encode(APP_IDENTIFIER),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ---------------------------------------------------------------------------
// Encrypt / Decrypt
// ---------------------------------------------------------------------------

/**
 * Encrypt a plaintext string with AES-GCM.
 * Returns a base-64 string containing `iv:ciphertext`.
 */
async function encrypt(plaintext: string): Promise<string> {
  if (!_cryptoKey) throw new Error('Vault not initialised — call initVault() first');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    _cryptoKey,
    encode(plaintext),
  );
  return `${bufToBase64(iv)}:${bufToBase64(ciphertext)}`;
}

/**
 * Decrypt a previously encrypted value (format `iv:ciphertext`, both base-64).
 */
async function decrypt(stored: string): Promise<string> {
  if (!_cryptoKey) throw new Error('Vault not initialised — call initVault() first');
  const [ivB64, ctB64] = stored.split(':');
  if (!ivB64 || !ctB64) throw new Error('Malformed encrypted value');
  const iv = base64ToBuf(ivB64);
  const ciphertext = base64ToBuf(ctB64);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    _cryptoKey,
    ciphertext,
  );
  return decode(plaintext);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialise the vault by generating or loading the encryption key.
 * Must be called once before `storeKey` / `loadKey`.
 */
export async function initVault(): Promise<void> {
  // Restore persisted storage mode preference
  const savedMode = localStorage.getItem(MODE_KEY) as StorageMode | null;
  if (savedMode === 'session' || savedMode === 'persistent') {
    _mode = savedMode;
  }

  const salt = getOrCreateSalt();
  _cryptoKey = await deriveKey(salt);
}

/**
 * Encrypt and store an API key for the given provider.
 *
 * @param provider - Provider identifier (e.g. `'openai'`).
 * @param key      - The raw API key string.
 */
export async function storeKey(provider: string, key: string): Promise<void> {
  const storageKey = `${STORAGE_PREFIX}${provider}`;

  if (_mode === 'session') {
    // Session mode: no encryption needed — data vanishes on tab close
    sessionStorage.setItem(storageKey, key);
    return;
  }

  const encrypted = await encrypt(key);
  localStorage.setItem(storageKey, encrypted);
}

/**
 * Load and decrypt an API key for the given provider.
 * Returns `null` if no key is stored.
 *
 * @param provider - Provider identifier (e.g. `'openai'`).
 */
export async function loadKey(provider: string): Promise<string | null> {
  const storageKey = `${STORAGE_PREFIX}${provider}`;

  if (_mode === 'session') {
    return sessionStorage.getItem(storageKey);
  }

  const stored = localStorage.getItem(storageKey);
  if (!stored) return null;

  try {
    return await decrypt(stored);
  } catch {
    // If decryption fails (e.g. salt changed), remove the corrupt entry
    localStorage.removeItem(storageKey);
    return null;
  }
}

/**
 * Remove the stored API key for a single provider.
 *
 * @param provider - Provider identifier.
 */
export async function clearKey(provider: string): Promise<void> {
  const storageKey = `${STORAGE_PREFIX}${provider}`;
  localStorage.removeItem(storageKey);
  sessionStorage.removeItem(storageKey);
}

/**
 * Remove all stored API keys from both localStorage and sessionStorage.
 */
export async function clearAll(): Promise<void> {
  for (const provider of PROVIDERS) {
    const storageKey = `${STORAGE_PREFIX}${provider}`;
    localStorage.removeItem(storageKey);
    sessionStorage.removeItem(storageKey);
  }
  // Also sweep any non-standard provider keys that may have been stored
  const sweep = (storage: Storage) => {
    const toRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k?.startsWith(STORAGE_PREFIX)) {
        toRemove.push(k);
      }
    }
    toRemove.forEach((k) => storage.removeItem(k));
  };
  sweep(localStorage);
  sweep(sessionStorage);
}

/**
 * Switch between persistent (localStorage + encrypted) and session
 * (sessionStorage + plaintext) storage modes.
 *
 * Changing mode does **not** migrate existing keys — call `clearAll()` first
 * if you need a clean slate.
 *
 * @param mode - `'persistent'` or `'session'`.
 */
export function setStorageMode(mode: StorageMode): void {
  _mode = mode;
  localStorage.setItem(MODE_KEY, mode);
}

/**
 * Get the current storage mode.
 */
export function getStorageMode(): StorageMode {
  return _mode;
}

/**
 * Check for a provider API key supplied via Vite environment variables.
 *
 * Looks for `VITE_<PROVIDER>_API_KEY` in `import.meta.env`.
 * Special case: also checks `VITE_GEMINI_LIVE_API_KEY` for the `gemini` provider.
 *
 * @param provider - Provider identifier (e.g. `'openai'`).
 * @returns The env-var value or `null` if not set.
 */
export function getEnvKey(provider: string): string | null {
  const env = (import.meta as any).env ?? {};

  // Standard pattern: VITE_OPENAI_API_KEY, VITE_ANTHROPIC_API_KEY, …
  const standardKey = `VITE_${provider.toUpperCase()}_API_KEY`;
  if (env[standardKey]) {
    return env[standardKey] as string;
  }

  // Special case for Gemini live key
  if (provider === 'gemini' && env['VITE_GEMINI_LIVE_API_KEY']) {
    return env['VITE_GEMINI_LIVE_API_KEY'] as string;
  }

  return null;
}
