import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllSessions, deleteSession, exportAllSessions, type SessionRecord } from '../services/sessionDb.ts';

/** Format epoch ms to locale date string */
function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Format seconds to MM:SS */
function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/** Goal label formatting */
const goalLabels: Record<string, string> = {
  RELAXATION: 'Relaxation',
  FOCUS: 'Focus',
  ENERGY: 'Energy',
  NEURO_REGEN: '40Hz Gamma',
  SELF_LOVE: 'Self Love',
};

export default function HistoryPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSessions = async () => {
    setLoading(true);
    const data = await getAllSessions();
    setSessions(data);
    setLoading(false);
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleDelete = async (id: number) => {
    await deleteSession(id);
    loadSessions();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" role="status">
        <div className="text-slate-500 text-sm animate-pulse" aria-live="polite">Loading sessions...</div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="text-4xl mb-4" aria-hidden="true">🧠</div>
        <h2 className="text-xl text-white font-bold mb-2">No Sessions Yet</h2>
        <p className="text-slate-500 text-sm max-w-xs">
          Complete a bio-resonance session to see your history and trends here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl text-white font-bold tracking-tight">
          Session History
        </h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => exportAllSessions()}
            className="px-3 py-1 bg-slate-800 text-slate-400 rounded-lg hover:bg-slate-700 hover:text-slate-200 transition-colors text-[10px] uppercase tracking-widest"
          >
            Export All
          </button>
          <span className="text-slate-500 text-xs">
            {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* ── Summary Stats ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="Total Sessions"
          value={sessions.length.toString()}
        />
        <SummaryCard
          label="Total Time"
          value={fmtDuration(sessions.reduce((sum, s) => sum + s.duration, 0))}
        />
        <SummaryCard
          label="Avg BPM"
          value={Math.round(
            sessions.reduce((sum, s) => sum + s.avgBpm, 0) / sessions.length,
          ).toString()}
        />
        <SummaryCard
          label="Avg HRV"
          value={`${Math.round(
            sessions.reduce((sum, s) => sum + s.avgHrv, 0) / sessions.length,
          )}ms`}
        />
      </div>

      {/* ── Session List ───────────────────────────────────────────── */}
      <div className="space-y-3">
        {sessions.map((session) => (
          <div
            key={session.id}
            role="link"
            tabIndex={0}
            aria-label={`Session #${session.id}: ${goalLabels[session.goal] || session.goal}, ${fmtDate(session.startedAt)}`}
            className="bg-slate-900/50 rounded-2xl p-5 border border-slate-800 hover:border-cyan-800/50 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
            onClick={() => session.id && navigate(`/history/${session.id}`)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); session.id && navigate(`/history/${session.id}`); } }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-slate-500">
                  #{session.id}
                </span>
                <span className="px-2 py-0.5 bg-cyan-500/10 text-cyan-400 rounded-full text-[10px] uppercase tracking-widest">
                  {goalLabels[session.goal] || session.goal}
                </span>
              </div>
              <span className="text-slate-500 text-xs">
                {fmtDate(session.startedAt)}
              </span>
            </div>

            <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-center">
              <MiniStat label="Duration" value={fmtDuration(session.duration)} />
              <MiniStat label="Avg BPM" value={session.avgBpm.toString()} />
              <MiniStat label="Avg HRV" value={`${session.avgHrv}ms`} />
              <MiniStat label="Min BPM" value={session.minBpm.toString()} />
              <MiniStat label="Max BPM" value={session.maxBpm.toString()} />
              <MiniStat label="Samples" value={session.biometrics.length.toString()} />
            </div>

            <div className="flex justify-end mt-3">
              <button
                onClick={(e) => { e.stopPropagation(); session.id && handleDelete(session.id); }}
                className="text-[10px] text-red-400/50 hover:text-red-400 transition-colors uppercase tracking-widest"
                aria-label={`Delete session #${session.id}`}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 text-center">
      <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">
        {label}
      </div>
      <div className="text-xl text-white font-mono">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] text-slate-600 uppercase tracking-widest">
        {label}
      </div>
      <div className="text-sm text-slate-300 font-mono">{value}</div>
    </div>
  );
}
