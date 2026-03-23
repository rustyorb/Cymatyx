/**
 * Vitest global setup — runs before every test file.
 * Provides browser API mocks (localStorage, sessionStorage, crypto, etc.)
 */
import 'fake-indexeddb/auto';
import { vi } from 'vitest';

// Mock localStorage & sessionStorage (jsdom provides them, but ensure clean state)
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

// Mock import.meta.env for keyVault / providers
Object.defineProperty(import.meta, 'env', {
  value: {},
  writable: true,
  configurable: true,
});

// Mock window.crypto.subtle for keyVault tests
if (!globalThis.crypto?.subtle) {
  // jsdom should provide this, but just in case
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      subtle: {
        importKey: vi.fn(),
        deriveKey: vi.fn(),
        encrypt: vi.fn(),
        decrypt: vi.fn(),
      },
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
        return arr;
      },
    },
    configurable: true,
  });
}
