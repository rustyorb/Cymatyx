import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.tsx';
import SessionPage from './pages/SessionPage.tsx';
import HistoryPage from './pages/HistoryPage.tsx';

/**
 * Application root — React Router with layout wrapper.
 *
 * Routes:
 *   /          → Main session page (goal select → calibrate → session → summary)
 *   /session   → Alias for the main session page
 *   /history   → Session history browser (IndexedDB)
 *   *          → Redirect to /
 */
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<SessionPage />} />
        <Route path="session" element={<SessionPage />} />
        <Route path="history" element={<HistoryPage />} />
        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
