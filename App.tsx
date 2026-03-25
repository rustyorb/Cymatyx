import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';

// Eager-load the main session page (critical path)
import SessionPage from './pages/SessionPage.tsx';

// Lazy-load secondary pages — recharts (~200KB) only loads when needed
const HistoryPage = lazy(() => import('./pages/HistoryPage.tsx'));
const SessionDetailPage = lazy(() => import('./pages/SessionDetailPage.tsx'));

/** Minimal loading fallback for lazy routes */
function RouteLoader() {
  return (
    <div role="status" aria-label="Loading page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: '#888' }}>
      <div style={{ textAlign: 'center' }}>
        <div aria-hidden="true" style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⟳</div>
        <div aria-live="polite">Loading…</div>
      </div>
    </div>
  );
}

/**
 * Application root — React Router with layout wrapper.
 *
 * Error boundaries:
 *   - App-level boundary (in index.tsx) catches fatal render errors
 *   - Route-level boundaries here isolate page crashes so nav still works
 *
 * Routes:
 *   /              → Main session page (goal select → calibrate → session → summary)
 *   /session       → Alias for the main session page
 *   /history       → Session history browser (IndexedDB) [lazy]
 *   /history/:id   → Session detail with biometric charts [lazy]
 *   *              → Redirect to /
 */
export default function App() {
  return (
    <Suspense fallback={<RouteLoader />}>
      <Routes>
        <Route element={<Layout />}>
          <Route
            index
            element={
              <ErrorBoundary level="route">
                <SessionPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="session"
            element={
              <ErrorBoundary level="route">
                <SessionPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="history"
            element={
              <ErrorBoundary level="route">
                <HistoryPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="history/:id"
            element={
              <ErrorBoundary level="route">
                <SessionDetailPage />
              </ErrorBoundary>
            }
          />
          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
