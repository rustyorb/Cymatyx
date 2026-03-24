import React, { Component, ErrorInfo, ReactNode } from 'react';

// ── Types ──────────────────────────────────────────────────────────────

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional fallback UI — defaults to built-in crash screen */
  fallback?: ReactNode;
  /** Error level: 'app' shows full crash screen, 'route' shows inline recovery */
  level?: 'app' | 'route';
  /** Called when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorType: 'chunk' | 'runtime' | 'unknown';
  retryCount: number;
  isResetting: boolean;
}

// ── Chunk Load Detection ───────────────────────────────────────────────

/** Detect if an error is a dynamic import / chunk load failure */
function isChunkLoadError(error: Error): boolean {
  const msg = error.message?.toLowerCase() ?? '';
  return (
    msg.includes('loading chunk') ||
    msg.includes('loading css chunk') ||
    msg.includes('dynamically imported module') ||
    msg.includes('failed to fetch') ||
    error.name === 'ChunkLoadError'
  );
}

/** Classify error type for display and recovery strategy */
function classifyError(error: Error): 'chunk' | 'runtime' | 'unknown' {
  if (isChunkLoadError(error)) return 'chunk';
  if (error instanceof TypeError || error instanceof ReferenceError) return 'runtime';
  return 'unknown';
}

// ── Styles ─────────────────────────────────────────────────────────────

const styles = {
  container: {
    padding: '2rem',
    color: '#e2e8f0',
    backgroundColor: '#020617',
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center' as const,
    minHeight: '60vh',
  },
  fullScreen: {
    height: '100vh',
  },
  title: {
    fontSize: '1.25rem',
    fontWeight: 'bold' as const,
    marginBottom: '0.5rem',
    letterSpacing: '0.15em',
    textTransform: 'uppercase' as const,
  },
  subtitle: {
    fontSize: '0.85rem',
    color: '#94a3b8',
    marginBottom: '1.5rem',
  },
  errorBox: {
    backgroundColor: '#1e293b',
    padding: '1.25rem',
    borderRadius: '0.5rem',
    overflow: 'auto' as const,
    textAlign: 'left' as const,
    fontSize: '11px',
    border: '1px solid #334155',
    maxWidth: '700px',
    width: '100%',
    maxHeight: '200px',
    color: '#f87171',
  },
  buttonRow: {
    display: 'flex',
    gap: '0.75rem',
    marginTop: '1.5rem',
    flexWrap: 'wrap' as const,
    justifyContent: 'center',
  },
  btnPrimary: {
    padding: '0.6rem 1.25rem',
    backgroundColor: '#22d3ee',
    color: '#0f172a',
    border: 'none',
    borderRadius: '0.4rem',
    cursor: 'pointer',
    fontWeight: 'bold' as const,
    fontSize: '0.8rem',
    letterSpacing: '0.08em',
  },
  btnSecondary: {
    padding: '0.6rem 1.25rem',
    backgroundColor: 'transparent',
    color: '#94a3b8',
    border: '1px solid #334155',
    borderRadius: '0.4rem',
    cursor: 'pointer',
    fontSize: '0.8rem',
    letterSpacing: '0.08em',
  },
  btnDanger: {
    padding: '0.6rem 1.25rem',
    backgroundColor: 'transparent',
    color: '#f87171',
    border: '1px solid #7f1d1d',
    borderRadius: '0.4rem',
    cursor: 'pointer',
    fontSize: '0.8rem',
    letterSpacing: '0.08em',
  },
  statusBadge: {
    display: 'inline-block',
    padding: '0.2rem 0.6rem',
    borderRadius: '9999px',
    fontSize: '0.7rem',
    fontWeight: 'bold' as const,
    letterSpacing: '0.1em',
    marginBottom: '1rem',
  },
  spinner: {
    display: 'inline-block',
    width: '1rem',
    height: '1rem',
    border: '2px solid #334155',
    borderTopColor: '#22d3ee',
    borderRadius: '50%',
    animation: 'spin 0.6s linear infinite',
  },
};

// ── Component ──────────────────────────────────────────────────────────

const MAX_AUTO_RETRIES = 2;

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorType: 'unknown',
      retryCount: 0,
      isResetting: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorType: classifyError(error),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const errorType = classifyError(error);

    // Structured error log
    console.error(`[Cymatyx:ErrorBoundary] ${errorType.toUpperCase()} error caught`, {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      level: this.props.level ?? 'app',
      retryCount: this.state.retryCount,
      timestamp: new Date().toISOString(),
    });

    // Notify parent
    this.props.onError?.(error, errorInfo);

    // Auto-retry chunk load errors (stale deployment cache)
    if (errorType === 'chunk' && this.state.retryCount < MAX_AUTO_RETRIES) {
      console.log(`[Cymatyx:ErrorBoundary] Auto-retrying chunk load (attempt ${this.state.retryCount + 1}/${MAX_AUTO_RETRIES})`);
      setTimeout(() => {
        this.setState((prev) => ({
          hasError: false,
          error: null,
          retryCount: prev.retryCount + 1,
        }));
      }, 1000 * (this.state.retryCount + 1)); // backoff: 1s, 2s
    }
  }

  /** Retry rendering the children */
  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  /** Hard reload — clears module cache for chunk errors */
  handleReload = () => {
    window.location.reload();
  };

  /** Nuclear option: clear all app state + reload */
  handleFactoryReset = async () => {
    this.setState({ isResetting: true });
    try {
      // Clear IndexedDB
      const dbs = await window.indexedDB.databases?.() ?? [];
      for (const db of dbs) {
        if (db.name) window.indexedDB.deleteDatabase(db.name);
      }
      // Clear localStorage
      localStorage.clear();
      // Clear sessionStorage
      sessionStorage.clear();
      console.log('[Cymatyx:ErrorBoundary] Factory reset complete — reloading');
    } catch (e) {
      console.warn('[Cymatyx:ErrorBoundary] Partial reset:', e);
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    // Use custom fallback if provided
    if (this.props.fallback) {
      return this.props.fallback;
    }

    const { error, errorType, isResetting } = this.state;
    const level = this.props.level ?? 'app';
    const isApp = level === 'app';

    // Error type badges
    const badges: Record<string, { color: string; bg: string; label: string }> = {
      chunk: { color: '#fbbf24', bg: '#78350f', label: 'NETWORK / CACHE' },
      runtime: { color: '#f87171', bg: '#7f1d1d', label: 'RUNTIME ERROR' },
      unknown: { color: '#a78bfa', bg: '#4c1d95', label: 'UNEXPECTED' },
    };

    const badge = badges[errorType];

    // Recovery hints
    const hints: Record<string, string> = {
      chunk: 'A code chunk failed to load — this usually means the app was updated. Reloading should fix it.',
      runtime: 'A component crashed. You can retry, or reset app state if the issue persists.',
      unknown: 'Something unexpected went wrong. Try reloading the page.',
    };

    return (
      <div style={{ ...styles.container, ...(isApp ? styles.fullScreen : {}) }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

        <div style={{ ...styles.statusBadge, color: badge.color, backgroundColor: badge.bg }}>
          {badge.label}
        </div>

        <div style={{ ...styles.title, color: isApp ? '#ef4444' : '#f59e0b' }}>
          {isApp ? 'SYSTEM ERROR' : 'Component Error'}
        </div>

        <div style={styles.subtitle}>{hints[errorType]}</div>

        <pre style={styles.errorBox}>
          {error?.message || 'Unknown error'}
          {error?.stack && (
            <>
              {'\n\n'}
              {error.stack
                .split('\n')
                .slice(1, 6)
                .join('\n')}
            </>
          )}
        </pre>

        <div style={styles.buttonRow}>
          {errorType === 'chunk' ? (
            <button style={styles.btnPrimary} onClick={this.handleReload}>
              ↻ RELOAD APP
            </button>
          ) : (
            <button style={styles.btnPrimary} onClick={this.handleRetry}>
              ↻ RETRY
            </button>
          )}

          {errorType !== 'chunk' && (
            <button style={styles.btnSecondary} onClick={this.handleReload}>
              RELOAD PAGE
            </button>
          )}

          <button
            style={styles.btnDanger}
            onClick={this.handleFactoryReset}
            disabled={isResetting}
          >
            {isResetting ? '⟳ RESETTING…' : '⚠ FACTORY RESET'}
          </button>
        </div>

        {isResetting && (
          <div style={{ marginTop: '1rem', color: '#94a3b8', fontSize: '0.8rem' }}>
            Clearing all app data…
          </div>
        )}
      </div>
    );
  }
}

export default ErrorBoundary;
