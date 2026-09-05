import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

// Node 26 ships an experimental `localStorage` that shadows jsdom's; give tests a real one.
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => {
      m.delete(k);
    },
    setItem: (k, v) => {
      m.set(String(k), String(v));
    },
  };
}
for (const name of ['localStorage', 'sessionStorage'] as const) {
  let ok = false;
  try {
    ok = typeof globalThis[name]?.getItem === 'function';
  } catch {
    ok = false;
  }
  if (!ok) Object.defineProperty(globalThis, name, { value: memoryStorage(), configurable: true });
}
