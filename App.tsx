import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.tsx';
import SessionPage from './pages/SessionPage.tsx';

/**
 * Application root — React Router with layout wrapper.
 *
 * Routes:
 *   /          → Main session page (goal select → calibrate → session → summary)
 *   /session   → Alias for the main session page
 *   *          → Redirect to /
 *
 * Future routes (planned):
 *   /history   → Session history browser (IndexedDB)
 *   /settings  → Provider & app configuration
 */
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<SessionPage />} />
        <Route path="session" element={<SessionPage />} />
        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
