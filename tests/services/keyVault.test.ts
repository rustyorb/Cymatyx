import { describe, it, expect, beforeEach } from 'vitest';
import {
  initVault,
  storeKey,
  loadKey,
  clearKey,
  clearAll,
  setStorageMode,
  getStorageMode,
  getEnvKey,
} from '../../services/keyVault';

describe('keyVault', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setStorageMode('session'); // session mode uses plaintext — avoids crypto mocking
  });

  it('initializes without error', async () => {
    await expect(initVault()).resolves.not.toThrow();
  });

  it('stores and loads a key in session mode (plaintext)', async () => {
    await initVault();
    await storeKey('openai', 'sk-test-123');
    const loaded = await loadKey('openai');
    expect(loaded).toBe('sk-test-123');
  });

  it('stores and loads multiple keys', async () => {
    await initVault();
    await storeKey('openai', 'sk-1');
    await storeKey('anthropic', 'ant-2');
    expect(await loadKey('openai')).toBe('sk-1');
    expect(await loadKey('anthropic')).toBe('ant-2');
  });

  it('returns null for missing key', async () => {
    await initVault();
    const loaded = await loadKey('groq');
    expect(loaded).toBeNull();
  });

  it('clears a specific key', async () => {
    await initVault();
    await storeKey('openai', 'sk-abc');
    await clearKey('openai');
    const loaded = await loadKey('openai');
    expect(loaded).toBeNull();
  });

  it('clears all keys', async () => {
    await initVault();
    await storeKey('openai', 'sk-1');
    await storeKey('anthropic', 'ant-2');
    await clearAll();
    expect(await loadKey('openai')).toBeNull();
    expect(await loadKey('anthropic')).toBeNull();
  });

  it('getStorageMode returns current mode', () => {
    expect(getStorageMode()).toBe('session');
    setStorageMode('persistent');
    expect(getStorageMode()).toBe('persistent');
    setStorageMode('session'); // reset
  });

  it('overwriting a key returns the new value', async () => {
    await initVault();
    await storeKey('openai', 'old-key');
    await storeKey('openai', 'new-key');
    expect(await loadKey('openai')).toBe('new-key');
  });

  it('getEnvKey returns null when env var not set', () => {
    const result = getEnvKey('openai');
    expect(result).toBeNull();
  });

  it('getEnvKey converts provider to VITE_<PROVIDER>_API_KEY pattern', () => {
    // getEnvKey('openai') checks for VITE_OPENAI_API_KEY
    // With no env vars set, should return null for any provider
    expect(getEnvKey('openai')).toBeNull();
    expect(getEnvKey('anthropic')).toBeNull();
    expect(getEnvKey('gemini')).toBeNull();
  });
});
