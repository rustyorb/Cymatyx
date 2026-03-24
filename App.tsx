import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.tsx';

// Eager-load the main session page (critical path)
import SessionPage from './pages/SessionPage.tsx';

// Lazy-load secondary pages — recharts (~200KB) only loads when needed
const HistoryPage = lazy(() => import('./pages/HistoryPage.tsx'));
const SessionDetailPage = lazy(() => import('./pages/SessionDetailPage.tsx'));

/** Minimal loading fallback for lazy routes */
function RouteLoader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: '#888' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⟳</div>
        <div>Loading…</div>
      </div>
    </div>
  );
}

/**
 * Application root — React Router with layout wrapper.
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
          <Route index element={<SessionPage />} />
          <Route path="session" element={<SessionPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="history/:id" element={<SessionDetailPage />} />
          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
