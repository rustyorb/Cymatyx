import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { initProviderSecurity } from './services/providers.ts';

console.group("System Boot: Cymatyx");
console.log("Environment: ESM Browser");
console.log("React Version:", React.version);
console.groupEnd();

// Initialize encrypted key vault before app renders
initProviderSecurity().catch(e => console.warn('[Cymatyx] Vault init failed:', e));

// ── Global unhandled error capture ─────────────────────────────────────

/** Catch unhandled promise rejections (e.g. failed chunk loads outside React) */
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Cymatyx:Global] Unhandled rejection:', event.reason);

  // Auto-reload on chunk load failures outside React tree
  const msg = String(event.reason?.message ?? event.reason ?? '').toLowerCase();
  if (
    msg.includes('loading chunk') ||
    msg.includes('dynamically imported module') ||
    msg.includes('failed to fetch')
  ) {
    console.warn('[Cymatyx:Global] Chunk load failure detected — reloading');
    // Small delay to let any pending ops finish
    setTimeout(() => window.location.reload(), 1500);
  }
});

/** Catch uncaught errors */
window.addEventListener('error', (event) => {
  console.error('[Cymatyx:Global] Uncaught error:', event.error ?? event.message);
});

// ── Mount ──────────────────────────────────────────────────────────────

const mount = () => {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    console.error("Target container #root not found in DOM.");
    return;
  }

  try {
    const root = createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <BrowserRouter>
          <ErrorBoundary level="app">
            <App />
          </ErrorBoundary>
        </BrowserRouter>
      </React.StrictMode>
    );
    console.log("React Application Mounted Successfully.");
  } catch (err) {
    console.error("Failed to initialize React root:", err);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
