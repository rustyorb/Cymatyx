import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { useSessionStore } from '../stores/useSessionStore.ts';

/**
 * CoherenceMeter — Real-time HRV coherence biofeedback visualization.
 *
 * Computes cardiac coherence from the biometric timeseries using a simplified
 * HeartMath-style algorithm: ratio of peak power around the respiratory
 * frequency (~0.1 Hz / 6 breaths per minute) to total HRV power.
 *
 * Displays:
 *  - Animated radial arc gauge (0–100 coherence score)
 *  - Color zones: red (low) → amber (medium) → green (high)
 *  - Pulsing glow synced to heart rate
 *  - Rolling 60-second coherence history sparkline
 *  - Cumulative session coherence score
 */

type CoherenceZone = 'low' | 'medium' | 'high';

interface CoherenceState {
  score: number;          // 0-100
  zone: CoherenceZone;
  history: number[];      // last 60 readings
  cumulativeScore: number;
  readingCount: number;
}

const ZONE_CONFIG: Record<CoherenceZone, { color: string; glow: string; label: string; threshold: number }> = {
  low:    { color: '#ef4444', glow: 'rgba(239,68,68,0.3)',  label: 'LOW',    threshold: 0 },
  medium: { color: '#f59e0b', glow: 'rgba(245,158,11,0.3)', label: 'MEDIUM', threshold: 33 },
  high:   { color: '#22c55e', glow: 'rgba(34,197,94,0.4)',  label: 'HIGH',   threshold: 66 },
};

function getZone(score: number): CoherenceZone {
  if (score >= 66) return 'high';
  if (score >= 33) return 'medium';
  return 'low';
}

/**
 * Compute coherence from R-R interval variability.
 * Uses a simplified spectral approach: measure how rhythmic/periodic the
 * HRV signal is. High coherence = HRV varies in a smooth sinusoidal pattern
 * (cardiac resonance). Low coherence = erratic HRV.
 *
 * We look at the last N biometric samples' HRV values and compute:
 * 1. Autocorrelation at the expected respiratory lag (~5-7 seconds)
 * 2. Coefficient of variation (lower = more coherent for fixed breathing)
 * 3. Combined into a 0-100 score
 */
function computeCoherence(hrvValues: number[]): number {
  if (hrvValues.length < 10) return 0;

  // Use last 30 samples (roughly 30 seconds at 1Hz biometric update)
  const window = hrvValues.slice(-30);
  const n = window.length;

  // Mean and std dev
  const mean = window.reduce((a, b) => a + b, 0) / n;
  if (mean === 0) return 0;

  const variance = window.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);

  // 1. Coefficient of variation — lower CV suggests more coherent rhythm
  const cv = std / mean;
  // Map CV to 0-50 score (CV of 0.05 = very coherent, CV of 0.5 = chaotic)
  const cvScore = Math.max(0, Math.min(50, (1 - cv / 0.5) * 50));

  // 2. Autocorrelation at lag 5-7 (respiratory frequency ~0.1Hz at 1Hz sampling)
  // High positive autocorrelation = periodic signal = coherent
  let bestAutoCorr = -1;
  for (let lag = 4; lag <= 8 && lag < n; lag++) {
    let num = 0;
    let count = 0;
    for (let i = 0; i < n - lag; i++) {
      num += (window[i] - mean) * (window[i + lag] - mean);
      count++;
    }
    if (count > 0 && variance > 0) {
      const autoCorr = num / (count * variance);
      bestAutoCorr = Math.max(bestAutoCorr, autoCorr);
    }
  }

  // Map autocorrelation (-1 to 1) to 0-50 score
  const acScore = Math.max(0, Math.min(50, (bestAutoCorr + 0.2) * 50 / 1.2));

  // Combined score
  return Math.round(Math.max(0, Math.min(100, cvScore + acScore)));
}

/** Radial arc gauge SVG */
function ArcGauge({ score, zone, bpm }: { score: number; zone: CoherenceZone; bpm: number }) {
  const config = ZONE_CONFIG[zone];
  const radius = 70;
  const strokeWidth = 8;
  const cx = 90;
  const cy = 90;

  // Arc from 225° to -45° (270° sweep)
  const startAngle = 225;
  const endAngle = -45;
  const sweepAngle = startAngle - endAngle; // 270
  const progressAngle = startAngle - (score / 100) * sweepAngle;

  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const arcPath = (startDeg: number, endDeg: number) => {
    const startRad = toRad(startDeg);
    const endRad = toRad(endDeg);
    const x1 = cx + radius * Math.cos(startRad);
    const y1 = cy - radius * Math.sin(startRad);
    const x2 = cx + radius * Math.cos(endRad);
    const y2 = cy - radius * Math.sin(endRad);
    const largeArc = Math.abs(startDeg - endDeg) > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
  };

  // Pulsing animation synced to heart rate
  const pulseRate = bpm > 0 ? 60 / bpm : 1;

  return (
    <svg viewBox="0 0 180 150" className="w-full max-w-[200px]">
      <defs>
        <filter id="coherence-glow">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* Gradient for the progress arc */}
        <linearGradient id="arc-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="40%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#22c55e" />
        </linearGradient>
      </defs>

      {/* Background track */}
      <path
        d={arcPath(startAngle, endAngle)}
        fill="none"
        stroke="rgba(148,163,184,0.1)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />

      {/* Zone markers */}
      {[33, 66].map((threshold) => {
        const angle = startAngle - (threshold / 100) * sweepAngle;
        const r1 = radius - strokeWidth;
        const r2 = radius + strokeWidth;
        const rad = toRad(angle);
        return (
          <line
            key={threshold}
            x1={cx + r1 * Math.cos(rad)}
            y1={cy - r1 * Math.sin(rad)}
            x2={cx + r2 * Math.cos(rad)}
            y2={cy - r2 * Math.sin(rad)}
            stroke="rgba(148,163,184,0.2)"
            strokeWidth="1"
          />
        );
      })}

      {/* Progress arc */}
      {score > 0 && (
        <path
          d={arcPath(startAngle, progressAngle)}
          fill="none"
          stroke={config.color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          filter="url(#coherence-glow)"
          style={{
            transition: 'stroke 0.5s ease',
          }}
        />
      )}

      {/* Center score */}
      <text
        x={cx}
        y={cy - 10}
        textAnchor="middle"
        className="font-mono"
        style={{ fontSize: '28px', fontWeight: 200, fill: config.color, transition: 'fill 0.5s ease' }}
      >
        {score}
      </text>
      <text
        x={cx}
        y={cy + 8}
        textAnchor="middle"
        style={{ fontSize: '8px', fill: 'rgba(148,163,184,0.5)', letterSpacing: '0.2em', textTransform: 'uppercase' }}
      >
        COHERENCE
      </text>

      {/* Zone label */}
      <text
        x={cx}
        y={cy + 22}
        textAnchor="middle"
        style={{
          fontSize: '10px',
          fontWeight: 700,
          fill: config.color,
          letterSpacing: '0.3em',
          transition: 'fill 0.5s ease',
        }}
      >
        {config.label}
      </text>

      {/* Pulsing dot at the tip of the arc */}
      {score > 0 && (() => {
        const tipRad = toRad(progressAngle);
        const tipX = cx + radius * Math.cos(tipRad);
        const tipY = cy - radius * Math.sin(tipRad);
        return (
          <circle
            cx={tipX}
            cy={tipY}
            r="4"
            fill={config.color}
            style={{
              animation: bpm > 0 ? `coherence-pulse ${pulseRate}s ease-in-out infinite` : 'none',
            }}
          />
        );
      })()}
    </svg>
  );
}

/** Sparkline history chart */
function HistorySparkline({ history, zone }: { history: number[]; zone: CoherenceZone }) {
  const config = ZONE_CONFIG[zone];
  const width = 200;
  const height = 32;
  const padding = 2;

  if (history.length < 2) return null;

  const points = history.map((val, i) => {
    const x = padding + (i / (history.length - 1)) * (width - padding * 2);
    const y = height - padding - (val / 100) * (height - padding * 2);
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(' L ')}`;

  // Area fill
  const firstX = padding;
  const lastX = padding + ((history.length - 1) / (history.length - 1)) * (width - padding * 2);
  const areaD = `${pathD} L ${lastX},${height} L ${firstX},${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-8 mt-2">
      {/* Zone bands */}
      <rect x="0" y={height - (66 / 100) * height} width={width} height={(33 / 100) * height} fill="rgba(34,197,94,0.05)" />
      <rect x="0" y={height - (33 / 100) * height} width={width} height={(33 / 100) * height} fill="rgba(245,158,11,0.05)" />

      {/* 33/66 threshold lines */}
      <line x1="0" y1={height - (33 / 100) * height} x2={width} y2={height - (33 / 100) * height} stroke="rgba(148,163,184,0.1)" strokeDasharray="2,4" />
      <line x1="0" y1={height - (66 / 100) * height} x2={width} y2={height - (66 / 100) * height} stroke="rgba(148,163,184,0.1)" strokeDasharray="2,4" />

      {/* Area */}
      <path d={areaD} fill={config.glow} style={{ transition: 'fill 0.5s ease' }} />

      {/* Line */}
      <path d={pathD} fill="none" stroke={config.color} strokeWidth="1.5" strokeLinejoin="round" style={{ transition: 'stroke 0.5s ease' }} />
    </svg>
  );
}

/**
 * Main CoherenceMeter component.
 * Reads biometric data from the session store and computes real-time coherence.
 */
export default function CoherenceMeter() {
  const biometrics = useSessionStore((s) => s.biometrics);
  const biometricTimeseries = useSessionStore((s) => s.biometricTimeseries);
  const state = useSessionStore((s) => s.state);

  const [coherence, setCoherence] = useState<CoherenceState>({
    score: 0,
    zone: 'low',
    history: [],
    cumulativeScore: 0,
    readingCount: 0,
  });

  // Track HRV values over time for coherence calculation
  const hrvBufferRef = useRef<number[]>([]);

  // Update coherence whenever biometrics change
  useEffect(() => {
    if (biometrics.hrv > 0) {
      hrvBufferRef.current.push(biometrics.hrv);
      // Keep last 60 samples
      if (hrvBufferRef.current.length > 60) {
        hrvBufferRef.current = hrvBufferRef.current.slice(-60);
      }
    }

    const score = computeCoherence(hrvBufferRef.current);
    const zone = getZone(score);

    setCoherence((prev) => {
      const newHistory = [...prev.history, score].slice(-60);
      const newCumulative = prev.cumulativeScore + score;
      const newCount = prev.readingCount + 1;
      return {
        score,
        zone,
        history: newHistory,
        cumulativeScore: newCumulative,
        readingCount: newCount,
      };
    });
  }, [biometrics]);

  // Reset buffer on session reset
  useEffect(() => {
    if (state === 'IDLE') {
      hrvBufferRef.current = [];
      setCoherence({ score: 0, zone: 'low', history: [], cumulativeScore: 0, readingCount: 0 });
    }
  }, [state]);

  const avgCoherence = coherence.readingCount > 0
    ? Math.round(coherence.cumulativeScore / coherence.readingCount)
    : 0;

  const zoneConfig = ZONE_CONFIG[coherence.zone];

  // Time in each zone
  const timeInZone = useMemo(() => {
    const counts = { low: 0, medium: 0, high: 0 };
    coherence.history.forEach((s) => {
      counts[getZone(s)]++;
    });
    const total = coherence.history.length || 1;
    return {
      low: Math.round((counts.low / total) * 100),
      medium: Math.round((counts.medium / total) * 100),
      high: Math.round((counts.high / total) * 100),
    };
  }, [coherence.history]);

  return (
    <div className="bg-slate-900/40 rounded-2xl border border-slate-800 p-4 flex flex-col items-center">
      {/* CSS animation for pulsing */}
      <style>{`
        @keyframes coherence-pulse {
          0%, 100% { r: 4; opacity: 1; }
          50% { r: 6; opacity: 0.6; }
        }
      `}</style>

      <div className="flex items-center gap-2 w-full mb-2">
        <div
          className="w-2 h-2 rounded-full"
          style={{
            backgroundColor: zoneConfig.color,
            boxShadow: `0 0 6px ${zoneConfig.glow}`,
            transition: 'background-color 0.5s ease, box-shadow 0.5s ease',
          }}
        />
        <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">
          HRV Coherence
        </span>
      </div>

      {/* Radial gauge */}
      <ArcGauge score={coherence.score} zone={coherence.zone} bpm={biometrics.bpm} />

      {/* History sparkline */}
      <HistorySparkline history={coherence.history} zone={coherence.zone} />

      {/* Zone time distribution */}
      <div className="w-full flex gap-1 mt-2 h-1.5 rounded-full overflow-hidden">
        <div
          className="rounded-full transition-all duration-500"
          style={{ width: `${timeInZone.high}%`, backgroundColor: ZONE_CONFIG.high.color }}
        />
        <div
          className="rounded-full transition-all duration-500"
          style={{ width: `${timeInZone.medium}%`, backgroundColor: ZONE_CONFIG.medium.color }}
        />
        <div
          className="rounded-full transition-all duration-500"
          style={{ width: `${timeInZone.low}%`, backgroundColor: ZONE_CONFIG.low.color }}
        />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 w-full mt-3">
        <div className="text-center">
          <div className="text-[8px] text-slate-600 uppercase tracking-wider">AVG</div>
          <div className="text-xs font-mono text-slate-400">{avgCoherence}</div>
        </div>
        <div className="text-center">
          <div className="text-[8px] text-slate-600 uppercase tracking-wider">PEAK</div>
          <div className="text-xs font-mono text-slate-400">
            {coherence.history.length > 0 ? Math.max(...coherence.history) : 0}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[8px] text-green-900 uppercase tracking-wider">% HIGH</div>
          <div className="text-xs font-mono" style={{ color: ZONE_CONFIG.high.color }}>
            {timeInZone.high}%
          </div>
        </div>
      </div>
    </div>
  );
}
