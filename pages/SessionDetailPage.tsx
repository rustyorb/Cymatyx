import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import {
  getSession,
  deleteSession,
  exportSession,
  type SessionRecord,
} from '../services/sessionDb.ts';

// ── Helpers ──────────────────────────────────────────────────────────

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

/** Convert epoch timestamp to session-relative seconds */
function toRelativeSeconds(ts: number, startedAt: number): number {
  return Math.round((ts - startedAt) / 1000);
}

/** Goal label formatting */
const goalLabels: Record<string, string> = {
  RELAXATION: 'Relaxation',
  FOCUS: 'Focus',
  ENERGY: 'Energy',
  NEURO_REGEN: '40Hz Gamma',
  SELF_LOVE: 'Self Love',
};

const goalColors: Record<string, string> = {
  RELAXATION: '#22d3ee',
  FOCUS: '#a78bfa',
  ENERGY: '#f59e0b',
  NEURO_REGEN: '#34d399',
  SELF_LOVE: '#f472b6',
};

// ── Component ────────────────────────────────────────────────────────

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getSession(parseInt(id, 10))
      .then((s) => {
        setSession(s ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500 text-sm animate-pulse">Loading session...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="text-4xl mb-4">❌</div>
        <h2 className="text-xl text-white font-bold mb-2">Session Not Found</h2>
        <button
          onClick={() => navigate('/history')}
          className="mt-4 px-6 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors text-xs uppercase tracking-widest"
        >
          ← Back to History
        </button>
      </div>
    );
  }

  const accentColor = goalColors[session.goal] || '#22d3ee';

  // Build chart data from biometric timeseries
  const chartData = session.biometrics.map((sample) => ({
    time: toRelativeSeconds(sample.timestamp, session.startedAt),
    bpm: sample.bpm,
    hrv: sample.hrv,
    quality: Math.round(sample.signalQuality * 100),
    rsa: sample.rsa ?? null,
  }));

  // Build config change timeline
  const configTimeline = session.configs.map((snap) => ({
    time: toRelativeSeconds(snap.timestamp, session.startedAt),
    beatFreq: snap.config.binauralBeatFreq,
    carrierFreq: snap.config.carrierFreq,
    breathingRate: snap.config.breathingRate,
    visualPulse: snap.config.visualPulseRate,
  }));

  const handleDelete = async () => {
    if (!session.id) return;
    await deleteSession(session.id);
    navigate('/history');
  };

  const handleExport = async () => {
    if (!session.id) return;
    await exportSession(session.id);
  };

  return (
    <div className="space-y-6 pb-8">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/history')}
          className="text-slate-500 hover:text-slate-300 transition-colors text-xs uppercase tracking-widest"
        >
          ← History
        </button>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="px-4 py-1.5 bg-slate-800 text-slate-400 rounded-lg hover:bg-slate-700 hover:text-slate-200 transition-colors text-[10px] uppercase tracking-widest"
          >
            Export JSON
          </button>
          <button
            onClick={handleDelete}
            className="px-4 py-1.5 bg-red-500/10 text-red-400/60 rounded-lg hover:bg-red-500/20 hover:text-red-400 transition-colors text-[10px] uppercase tracking-widest"
          >
            Delete
          </button>
        </div>
      </div>

      {/* ── Title Card ──────────────────────────────────────────────── */}
      <div className="bg-slate-900/50 rounded-2xl p-6 border border-slate-800">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-xs font-mono text-slate-500">#{session.id}</span>
          <span
            className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-widest"
            style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
          >
            {goalLabels[session.goal] || session.goal}
          </span>
        </div>
        <div className="text-slate-500 text-xs mb-4">{fmtDate(session.startedAt)}</div>

        <div className="grid grid-cols-3 md:grid-cols-6 gap-4 text-center">
          <StatCard label="Duration" value={fmtDuration(session.duration)} />
          <StatCard label="Avg BPM" value={session.avgBpm.toString()} />
          <StatCard label="Avg HRV" value={`${session.avgHrv}ms`} />
          <StatCard label="Min BPM" value={session.minBpm.toString()} />
          <StatCard label="Max BPM" value={session.maxBpm.toString()} />
          <StatCard label="Samples" value={session.biometrics.length.toString()} />
        </div>
      </div>

      {/* ── Heart Rate Chart ────────────────────────────────────────── */}
      {chartData.length > 1 && (
        <ChartCard title="Heart Rate (BPM)" subtitle="Over session duration">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="bpmGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accentColor} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={accentColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="time"
                stroke="#475569"
                tick={{ fill: '#64748b', fontSize: 10 }}
                tickFormatter={(v) => `${Math.floor(v / 60)}:${(v % 60).toString().padStart(2, '0')}`}
              />
              <YAxis
                stroke="#475569"
                tick={{ fill: '#64748b', fontSize: 10 }}
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '8px',
                  fontSize: '11px',
                }}
                labelFormatter={(v) =>
                  `${Math.floor(Number(v) / 60)}:${(Number(v) % 60).toString().padStart(2, '0')}`
                }
              />
              <Area
                type="monotone"
                dataKey="bpm"
                stroke={accentColor}
                fill="url(#bpmGradient)"
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* ── HRV Chart ───────────────────────────────────────────────── */}
      {chartData.length > 1 && (
        <ChartCard title="HRV (RMSSD)" subtitle="Heart rate variability over time">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="time"
                stroke="#475569"
                tick={{ fill: '#64748b', fontSize: 10 }}
                tickFormatter={(v) => `${Math.floor(v / 60)}:${(v % 60).toString().padStart(2, '0')}`}
              />
              <YAxis stroke="#475569" tick={{ fill: '#64748b', fontSize: 10 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '8px',
                  fontSize: '11px',
                }}
                labelFormatter={(v) =>
                  `${Math.floor(Number(v) / 60)}:${(Number(v) % 60).toString().padStart(2, '0')}`
                }
              />
              <Line
                type="monotone"
                dataKey="hrv"
                stroke="#a78bfa"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* ── Signal Quality Chart ─────────────────────────────────────── */}
      {chartData.length > 1 && (
        <ChartCard title="Signal Quality" subtitle="rPPG signal confidence (%)">
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="qualityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="time"
                stroke="#475569"
                tick={{ fill: '#64748b', fontSize: 10 }}
                tickFormatter={(v) => `${Math.floor(v / 60)}:${(v % 60).toString().padStart(2, '0')}`}
              />
              <YAxis
                stroke="#475569"
                tick={{ fill: '#64748b', fontSize: 10 }}
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '8px',
                  fontSize: '11px',
                }}
                formatter={(v: number) => [`${v}%`, 'Quality']}
                labelFormatter={(v) =>
                  `${Math.floor(Number(v) / 60)}:${(Number(v) % 60).toString().padStart(2, '0')}`
                }
              />
              <Area
                type="monotone"
                dataKey="quality"
                stroke="#34d399"
                fill="url(#qualityGradient)"
                strokeWidth={1.5}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* ── Entrainment Config Timeline ──────────────────────────────── */}
      {configTimeline.length > 1 && (
        <ChartCard title="Entrainment Parameters" subtitle="How the AI adapted over time">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={configTimeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="time"
                stroke="#475569"
                tick={{ fill: '#64748b', fontSize: 10 }}
                tickFormatter={(v) => `${Math.floor(v / 60)}:${(v % 60).toString().padStart(2, '0')}`}
              />
              <YAxis stroke="#475569" tick={{ fill: '#64748b', fontSize: 10 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '8px',
                  fontSize: '11px',
                }}
                labelFormatter={(v) =>
                  `${Math.floor(Number(v) / 60)}:${(Number(v) % 60).toString().padStart(2, '0')}`
                }
              />
              <Line
                type="stepAfter"
                dataKey="beatFreq"
                stroke="#22d3ee"
                strokeWidth={2}
                dot={false}
                name="Beat Freq (Hz)"
              />
              <Line
                type="stepAfter"
                dataKey="breathingRate"
                stroke="#f59e0b"
                strokeWidth={1.5}
                dot={false}
                name="Breathing Rate"
              />
              <Line
                type="stepAfter"
                dataKey="visualPulse"
                stroke="#f472b6"
                strokeWidth={1.5}
                dot={false}
                name="Visual Pulse"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* ── No Data Fallback ─────────────────────────────────────────── */}
      {chartData.length <= 1 && (
        <div className="bg-slate-900/50 rounded-2xl p-8 border border-slate-800 text-center">
          <div className="text-slate-500 text-sm">
            Not enough data points to render charts (need ≥ 2 samples).
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
      <div className="text-[9px] text-slate-600 uppercase tracking-widest">{label}</div>
      <div className="text-sm text-white font-mono">{value}</div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900/50 rounded-2xl p-5 border border-slate-800">
      <div className="mb-4">
        <h3 className="text-sm text-white font-semibold tracking-tight">{title}</h3>
        <p className="text-[10px] text-slate-500 uppercase tracking-widest">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
