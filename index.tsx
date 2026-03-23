import React, { Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import { initProviderSecurity } from './services/providers.ts';

console.group("System Boot: Cymatyx");
console.log("Environment: ESM Browser");
console.log("React Version:", React.version);
console.groupEnd();

// Initialize encrypted key vault before app renders
initProviderSecurity().catch(e => console.warn('[Cymatyx] Vault init failed:', e));

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("CRITICAL UI ERROR:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: '2rem', 
          color: '#ef4444', 
          backgroundColor: '#020617', 
          height: '100vh', 
          fontFamily: 'monospace',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center'
        }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>SYSTEM CRITICAL ERROR</h1>
          <div style={{ maxWidth: '800px', width: '100%' }}>
            <pre style={{ 
              backgroundColor: '#1e293b', 
              padding: '1.5rem', 
              borderRadius: '0.5rem', 
              overflow: 'auto',
              textAlign: 'left',
              fontSize: '12px',
              border: '1px solid #ef444433'
            }}>
              {this.state.error?.stack || this.state.error?.toString()}
            </pre>
          </div>
          <button 
            onClick={() => window.location.reload()}
            style={{ 
              marginTop: '2rem', 
              padding: '0.75rem 1.5rem', 
              backgroundColor: '#22d3ee', 
              color: '#0f172a', 
              border: 'none', 
              borderRadius: '0.5rem', 
              cursor: 'pointer', 
              fontWeight: 'bold',
              letterSpacing: '0.1em'
            }}
          >
            FORCE REBOOT SYSTEM
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

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
          <ErrorBoundary>
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
