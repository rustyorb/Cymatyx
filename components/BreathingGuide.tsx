import React, { useEffect, useState, useRef, useCallback } from 'react';

interface Props {
  /** Full breathing cycle duration in seconds (from EntrainmentConfig.breathingRate) */
  breathingRate: number;
  /** Whether the guide is actively animating */
  isActive: boolean;
  /** Current HRV (SDNN) — used for coherence indicator */
  hrv: number;
  /** Current RSA — used for coherence indicator */
  rsa?: number;
  /** Primary theme color (hex) from entrainment config */
  primaryColor?: string;
  /** Compact mode for inline display */
  compact?: boolean;
}

type BreathPhase = 'INHALE' | 'HOLD' | 'EXHALE' | 'REST';

// 4-7-8 ratio mapped onto breathingRate
// Inhale: 4/19, Hold: 7/19, Exhale: 8/19
const PHASE_RATIOS = {
  INHALE: 4 / 19,
  HOLD: 7 / 19,
  EXHALE: 8 / 19,
};

function getCoherenceLevel(hrv: number, rsa?: number): { level: number; label: string; color: string } {
  // Coherence = combination of HRV stability and RSA amplitude
  // Higher HRV + higher RSA = better vagal tone = better coherence
  const hrvScore = Math.min(hrv / 80, 1); // 80ms SDNN = excellent
  const rsaScore = rsa ? Math.min(rsa / 20, 1) : hrvScore * 0.5; // 20 bpm RSA = excellent
  const combined = hrvScore * 0.6 + rsaScore * 0.4;

  if (combined >= 0.7) return { level: combined, label: 'High Coherence', color: '#22c55e' };
  if (combined >= 0.4) return { level: combined, label: 'Building', color: '#eab308' };
  return { level: combined, label: 'Syncing', color: '#64748b' };
}

function triggerHaptic(pattern: 'inhale' | 'exhale' | 'hold') {
  if (!navigator.vibrate) return;
  switch (pattern) {
    case 'inhale':
      navigator.vibrate(30); // Short pulse at start of inhale
      break;
    case 'hold':
      navigator.vibrate([15, 50, 15]); // Double tap for hold
      break;
    case 'exhale':
      navigator.vibrate(15); // Gentle tap for exhale
      break;
  }
}

const BreathingGuide: React.FC<Props> = ({
  breathingRate,
  isActive,
  hrv,
  rsa,
  primaryColor = '#6366f1',
  compact = false,
}) => {
  const [phase, setPhase] = useState<BreathPhase>('REST');
  const [progress, setProgress] = useState(0); // 0-1 within current phase
  const [cycleProgress, setCycleProgress] = useState(0); // 0-1 across full cycle
  const [scale, setScale] = useState(1);
  const animRef = useRef<number>(0);
  const startTimeRef = useRef(0);
  const lastPhaseRef = useRef<BreathPhase>('REST');

  const cycleDuration = breathingRate * 1000; // ms

  const animate = useCallback(() => {
    if (!isActive) return;

    const now = performance.now();
    const elapsed = (now - startTimeRef.current) % cycleDuration;
    const normalizedTime = elapsed / cycleDuration;
    setCycleProgress(normalizedTime);

    // Determine phase from elapsed time
    let currentPhase: BreathPhase;
    let phaseProgress: number;
    let targetScale: number;

    const inhaleEnd = PHASE_RATIOS.INHALE;
    const holdEnd = inhaleEnd + PHASE_RATIOS.HOLD;

    if (normalizedTime < inhaleEnd) {
      currentPhase = 'INHALE';
      phaseProgress = normalizedTime / inhaleEnd;
      // Smooth ease-out expansion
      targetScale = 1 + 0.5 * easeOutCubic(phaseProgress);
    } else if (normalizedTime < holdEnd) {
      currentPhase = 'HOLD';
      phaseProgress = (normalizedTime - inhaleEnd) / PHASE_RATIOS.HOLD;
      // Gentle pulse at full size
      targetScale = 1.5 + 0.02 * Math.sin(phaseProgress * Math.PI * 2);
    } else {
      currentPhase = 'EXHALE';
      phaseProgress = (normalizedTime - holdEnd) / PHASE_RATIOS.EXHALE;
      // Smooth ease-in contraction
      targetScale = 1.5 - 0.5 * easeInCubic(phaseProgress);
    }

    setPhase(currentPhase);
    setProgress(phaseProgress);
    setScale(targetScale);

    // Haptic on phase transition
    if (currentPhase !== lastPhaseRef.current) {
      lastPhaseRef.current = currentPhase;
      triggerHaptic(currentPhase === 'INHALE' ? 'inhale' : currentPhase === 'HOLD' ? 'hold' : 'exhale');
    }

    animRef.current = requestAnimationFrame(animate);
  }, [isActive, cycleDuration]);

  useEffect(() => {
    if (isActive) {
      startTimeRef.current = performance.now();
      lastPhaseRef.current = 'REST';
      animRef.current = requestAnimationFrame(animate);
    } else {
      cancelAnimationFrame(animRef.current);
      setPhase('REST');
      setScale(1);
      setProgress(0);
      setCycleProgress(0);
    }
    return () => cancelAnimationFrame(animRef.current);
  }, [isActive, animate]);

  const coherence = getCoherenceLevel(hrv, rsa);

  const phaseLabel =
    phase === 'INHALE' ? 'Breathe In' :
    phase === 'HOLD' ? 'Hold' :
    phase === 'EXHALE' ? 'Release' : '';

  const phaseSeconds = phase === 'INHALE'
    ? Math.ceil(PHASE_RATIOS.INHALE * breathingRate * (1 - progress))
    : phase === 'HOLD'
    ? Math.ceil(PHASE_RATIOS.HOLD * breathingRate * (1 - progress))
    : phase === 'EXHALE'
    ? Math.ceil(PHASE_RATIOS.EXHALE * breathingRate * (1 - progress))
    : 0;

  const size = compact ? 120 : 200;
  const strokeWidth = compact ? 3 : 4;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;

  // Ring progress: how far through the full cycle
  const ringOffset = circumference * (1 - cycleProgress);

  // Opacity pulse tied to phase
  const glowOpacity =
    phase === 'INHALE' ? 0.3 + 0.4 * easeOutCubic(progress) :
    phase === 'HOLD' ? 0.7 + 0.1 * Math.sin(progress * Math.PI * 2) :
    phase === 'EXHALE' ? 0.7 - 0.5 * easeInCubic(progress) : 0.2;

  if (!isActive) return null;

  return (
    <div
      className={`flex flex-col items-center select-none ${compact ? 'gap-2' : 'gap-4'}`}
      role="timer"
      aria-label={`Breathing guide: ${phaseLabel}`}
      aria-live="polite"
    >
      {/* Main breathing circle */}
      <div className="relative" style={{ width: size, height: size }}>
        {/* SVG progress ring */}
        <svg
          className="absolute inset-0 -rotate-90"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
        >
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={strokeWidth}
          />
          {/* Progress */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={primaryColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={ringOffset}
            style={{ transition: 'stroke-dashoffset 0.1s linear' }}
            opacity={0.8}
          />
        </svg>

        {/* Animated breathing orb */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ transform: `scale(${scale})`, transition: 'transform 0.15s ease-out' }}
        >
          {/* Outer glow */}
          <div
            className="absolute rounded-full"
            style={{
              width: compact ? 60 : 100,
              height: compact ? 60 : 100,
              background: `radial-gradient(circle, ${primaryColor}${Math.round(glowOpacity * 60).toString(16).padStart(2, '0')}, transparent 70%)`,
              filter: `blur(${compact ? 10 : 20}px)`,
            }}
          />
          {/* Core circle */}
          <div
            className="rounded-full border-2 flex items-center justify-center backdrop-blur-sm"
            style={{
              width: compact ? 40 : 64,
              height: compact ? 40 : 64,
              borderColor: `${primaryColor}aa`,
              background: `radial-gradient(circle at 40% 40%, ${primaryColor}30, transparent)`,
              boxShadow: `0 0 ${Math.round(glowOpacity * 40)}px ${primaryColor}60`,
            }}
          >
            <div
              className="rounded-full bg-white"
              style={{
                width: compact ? 6 : 10,
                height: compact ? 6 : 10,
                opacity: 0.8 + 0.2 * glowOpacity,
              }}
            />
          </div>
        </div>
      </div>

      {/* Phase label + countdown */}
      <div className="flex flex-col items-center text-center">
        <span
          className={`font-black tracking-[0.3em] uppercase ${compact ? 'text-xs' : 'text-lg'}`}
          style={{
            color: phase === 'INHALE' ? '#67e8f9' : phase === 'HOLD' ? '#ffffff' : '#94a3b8',
          }}
        >
          {phaseLabel}
        </span>
        {!compact && phaseSeconds > 0 && (
          <span className="text-white/40 text-sm font-mono mt-1">{phaseSeconds}s</span>
        )}
      </div>

      {/* Coherence indicator */}
      {!compact && (
        <div className="flex items-center gap-2 mt-1">
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="rounded-full"
                style={{
                  width: 6,
                  height: 6,
                  backgroundColor: i / 5 < coherence.level ? coherence.color : 'rgba(255,255,255,0.1)',
                  transition: 'background-color 0.5s ease',
                }}
              />
            ))}
          </div>
          <span
            className="text-[10px] font-mono uppercase tracking-widest"
            style={{ color: coherence.color + 'aa' }}
          >
            {coherence.label}
          </span>
        </div>
      )}
    </div>
  );
};

// Easing functions
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
function easeInCubic(t: number): number {
  return t * t * t;
}

export default BreathingGuide;
