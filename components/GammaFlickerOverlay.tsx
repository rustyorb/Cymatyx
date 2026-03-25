import React, { useEffect, useRef, useState } from 'react';

/**
 * GammaFlickerOverlay — 40Hz synchronized visual flicker for ISF mode.
 *
 * Renders a full-screen overlay that flashes at exactly 40Hz using
 * requestAnimationFrame with precise timing. This creates the visual
 * component of Intermittent Sensory Flickering (ISF).
 *
 * Based on Iaccarino et al. 2016 (Nature):
 * - 40Hz visual flicker drives gamma oscillations in visual cortex
 * - Combined with 40Hz auditory stimulus for multi-sensory entrainment
 * - Studies show reduced amyloid-beta and phosphorylated tau in mice
 *
 * Martorell et al. 2019 (Cell) confirmed combined audio-visual 40Hz
 * entrainment is more effective than either modality alone.
 *
 * SAFETY: This component should NEVER render without the epilepsy
 * warning being acknowledged first. The parent component enforces this.
 */
interface Props {
  isActive: boolean;
  intensity: number; // 0-1 (max opacity of the flash)
  dutyCycle: number; // 0-1 (proportion of each 25ms cycle that is "on")
  color: string; // Primary color from entrainment config
}

export default function GammaFlickerOverlay({ isActive, intensity, dutyCycle, color }: Props) {
  const [isOn, setIsOn] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  // Respect prefers-reduced-motion
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (!isActive || prefersReducedMotion) {
      setIsOn(false);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    startTimeRef.current = performance.now();
    const periodMs = 1000 / 40; // 25ms per cycle (40Hz)
    const onDurationMs = periodMs * dutyCycle;

    const tick = () => {
      const elapsed = performance.now() - startTimeRef.current;
      // Where are we within the current 25ms cycle?
      const cyclePosition = elapsed % periodMs;
      setIsOn(cyclePosition < onDurationMs);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isActive, dutyCycle, prefersReducedMotion]);

  if (!isActive || !isOn || prefersReducedMotion) return null;

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 z-40 pointer-events-none"
      style={{
        backgroundColor: color,
        opacity: intensity * 0.6, // Cap at 60% opacity even at max intensity for safety
        mixBlendMode: 'screen',
        transition: 'none', // No CSS transitions — must be instantaneous for 40Hz
      }}
    />
  );
}
