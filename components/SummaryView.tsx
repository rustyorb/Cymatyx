import React, { useEffect, useState } from 'react';
import { AppState } from '../types.ts';
import { useSessionStore } from '../stores/useSessionStore.ts';
import { getAllSessions, type SessionRecord } from '../services/sessionDb.ts';

/** Format seconds to MM:SS */
function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function SummaryView() {
  const {
    calibrationRsa,
    sessionStartedAt,
    biometricTimeseries,
    setAppState,
  } = useSessionStore();

  const [lastSession, setLastSession] = useState<SessionRecord | null>(null);

  // Load the latest saved session on mount
  useEffect(() => {
    getAllSessions().then((sessions) => {
      if (sessions.length > 0) setLastSession(sessions[0]);
    });
  }, []);

  // Compute live stats from the timeseries still in memory
  const samples = biometricTimeseries.filter((s) => s.bpm > 0);
  const duration = sessionStartedAt
    ? Math.round((Date.now() - sessionStartedAt) / 1000)
    : lastSession?.duration ?? 0;
  const avgBpm =
    samples.length > 0
      ? Math.round(samples.reduce((s, x) => s + x.bpm, 0) / samples.length)
      : lastSession?.avgBpm ?? 0;
  const avgHrv =
    samples.length > 0
      ? Math.round(samples.reduce((s, x) => s + x.hrv, 0) / samples.length)
      : lastSession?.avgHrv ?? 0;
  const minBpm =
    samples.length > 0
      ? Math.min(...samples.map((s) => s.bpm))
      : lastSession?.minBpm ?? 0;
  const maxBpm =
    samples.length > 0
      ? Math.max(...samples.map((s) => s.bpm))
      : lastSession?.maxBpm ?? 0;
  const sampleCount = samples.length || (lastSession?.biometrics.length ?? 0);

  return (
    <div className="h-full bg-slate-900/50 rounded-[2.5rem] p-12 border border-slate-800 flex flex-col items-center justify-center text-center">
      <h2 className="text-2xl text-white font-bold mb-2 tracking-tighter">
        Session Complete
      </h2>
      <p className="text-slate-500 text-sm mb-8 max-w-xs">
        Baseline Vagal Tone of {Math.round(calibrationRsa)}Hz maintained across
        resonance cycle.
      </p>

      {/* ── Stats Grid ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 mb-10 w-full max-w-sm">
        <StatCard label="Duration" value={fmtDuration(duration)} />
        <StatCard label="Avg BPM" value={avgBpm.toString()} />
        <StatCard label="Avg HRV" value={`${avgHrv}ms`} />
        <StatCard label="BPM Range" value={`${minBpm}–${maxBpm}`} />
        <StatCard label="Samples" value={sampleCount.toString()} />
        <StatCard label="Vagal Tone" value={`${Math.round(calibrationRsa)}`} />
      </div>

      <button
        onClick={() => setAppState(AppState.IDLE)}
        className="px-10 py-4 bg-cyan-600 text-white font-bold rounded-xl hover:bg-cyan-500 transition-colors tracking-widest text-xs"
      >
        NEW SESSION
      </button>
    </div>
  );
}

/** Small stat display card */
function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
      <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">
        {label}
      </div>
      <div className="text-lg text-white font-mono">{value}</div>
    </div>
  );
}
