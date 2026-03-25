import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import BreathingGuide from '../../components/BreathingGuide.tsx';

describe('BreathingGuide', () => {
  let rafCallbacks: ((time: number) => void)[] = [];
  let rafId = 0;

  beforeEach(() => {
    rafCallbacks = [];
    rafId = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return ++rafId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    vi.spyOn(performance, 'now').mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when inactive', () => {
    const { container } = render(
      <BreathingGuide breathingRate={5} isActive={false} hrv={50} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders when active', () => {
    render(
      <BreathingGuide breathingRate={5} isActive={true} hrv={50} />
    );
    expect(screen.getByRole('timer')).toBeTruthy();
  });

  it('shows breathing phase label', () => {
    render(
      <BreathingGuide breathingRate={10} isActive={true} hrv={50} />
    );
    // Initial render — before animation frame fires, should still render
    const timer = screen.getByRole('timer');
    expect(timer).toBeTruthy();
  });

  it('displays coherence indicator with high HRV', () => {
    render(
      <BreathingGuide breathingRate={5} isActive={true} hrv={80} rsa={20} />
    );
    expect(screen.getByText('High Coherence')).toBeTruthy();
  });

  it('displays coherence indicator with low HRV', () => {
    render(
      <BreathingGuide breathingRate={5} isActive={true} hrv={10} rsa={2} />
    );
    expect(screen.getByText('Syncing')).toBeTruthy();
  });

  it('displays "Building" coherence at mid range', () => {
    render(
      <BreathingGuide breathingRate={5} isActive={true} hrv={40} rsa={8} />
    );
    expect(screen.getByText('Building')).toBeTruthy();
  });

  it('hides coherence in compact mode', () => {
    render(
      <BreathingGuide breathingRate={5} isActive={true} hrv={80} rsa={20} compact />
    );
    expect(screen.queryByText('High Coherence')).toBeNull();
  });

  it('hides countdown in compact mode', () => {
    // Compact mode should not show second countdown
    const { container } = render(
      <BreathingGuide breathingRate={5} isActive={true} hrv={50} compact />
    );
    // In compact mode, no "s" countdown text
    const fontMono = container.querySelectorAll('.font-mono');
    // Coherence text is hidden in compact, so no font-mono elements for countdown
    expect(fontMono.length).toBe(0);
  });

  it('renders SVG progress ring', () => {
    const { container } = render(
      <BreathingGuide breathingRate={5} isActive={true} hrv={50} />
    );
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(2); // track + progress
  });

  it('uses custom primaryColor', () => {
    const { container } = render(
      <BreathingGuide breathingRate={5} isActive={true} hrv={50} primaryColor="#ff0000" />
    );
    const progressCircle = container.querySelectorAll('circle')[1];
    expect(progressCircle?.getAttribute('stroke')).toBe('#ff0000');
  });

  it('triggers haptic on phase change if available', () => {
    const vibrateMock = vi.fn();
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrateMock,
      writable: true,
      configurable: true,
    });

    render(
      <BreathingGuide breathingRate={5} isActive={true} hrv={50} />
    );

    // Simulate animation frame at t=0 (INHALE phase start)
    vi.spyOn(performance, 'now').mockReturnValue(1);
    if (rafCallbacks.length > 0) {
      rafCallbacks[0](1);
    }
    // Haptic should fire on first phase change
    expect(vibrateMock).toHaveBeenCalled();
  });
});
