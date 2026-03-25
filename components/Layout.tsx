import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';

/**
 * HeaderAction context — allows child pages to inject actions into the header.
 */
interface HeaderActionsContextValue {
  headerActions: ReactNode;
  setHeaderActions: (actions: ReactNode) => void;
}

const HeaderActionsContext = createContext<HeaderActionsContextValue>({
  headerActions: null,
  setHeaderActions: () => {},
});

export function useHeaderActions() {
  return useContext(HeaderActionsContext);
}

/**
 * Root layout — persistent header + <Outlet /> for routed views.
 */
export default function Layout() {
  const [headerActions, setHeaderActions] = useState<ReactNode>(null);
  const location = useLocation();

  return (
    <HeaderActionsContext.Provider value={{ headerActions, setHeaderActions }}>
      <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col font-sans selection:bg-cyan-500/30">
        {/* Skip navigation link */}
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-cyan-600 focus:text-white focus:rounded-lg focus:text-sm">
          Skip to main content
        </a>
        {/* ── Header ──────────────────────────────────────────────── */}
        <header className="px-6 py-4 border-b border-slate-900 flex justify-between items-center bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity" aria-label="Cymatyx Home">
              <div className="w-10 h-10 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shadow-2xl overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent"></div>
                <svg aria-hidden="true" className="w-6 h-6 text-cyan-400 relative z-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 12s2.5-7 5-7 5 7 5 7 2.5-7 5-7" />
                  <path d="M4 12s2.5 7 5 7 5-7 5-7 2.5 7 5 7" opacity="0.3" />
                </svg>
              </div>
              <div className="flex flex-col">
                <h1 className="text-sm font-black tracking-[0.4em] text-white leading-none">CYMATYX</h1>
                <span className="text-[8px] text-cyan-500 uppercase tracking-widest mt-1">Closed-Loop Bio-Resonance</span>
              </div>
            </Link>

            {/* ── Nav Links ─────────────────────────────────────── */}
            <nav aria-label="Main navigation" className="hidden sm:flex items-center gap-1 ml-6">
              <NavLink to="/" active={location.pathname === '/' || location.pathname === '/session'}>
                Session
              </NavLink>
              <NavLink to="/history" active={location.pathname === '/history'}>
                History
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            {headerActions}
          </div>
        </header>

        {/* ── Page Content ────────────────────────────────────────── */}
        <main id="main-content" className="flex-grow p-4 md:p-6 max-w-[1600px] mx-auto w-full">
          <Outlet />
        </main>
      </div>
    </HeaderActionsContext.Provider>
  );
}

/** Minimal nav link with active state */
function NavLink({ to, active, children }: { to: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={`px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-[0.15em] transition-colors ${
        active
          ? 'bg-slate-800 text-cyan-400'
          : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'
      }`}
    >
      {children}
    </Link>
  );
}
