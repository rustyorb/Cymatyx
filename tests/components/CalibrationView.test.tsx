import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import CalibrationView from '../../components/CalibrationView';
import { useSessionStore } from '../../stores/useSessionStore';

describe('CalibrationView', () => {
  beforeEach(() => {
    useSessionStore.setState({
      calibrationStep: '',
      biometrics: { bpm: 0, hrv: 0, signalQuality: 0, timestamp: 0 },
    });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    vi.spyOn(performance, 'now').mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows "Calibrating" and READY state when step is empty', () => {
    render(<CalibrationView />);
    expect(screen.getByText('Calibrating')).toBeDefined();
    expect(screen.getByText('READY')).toBeDefined();
  });

  it('renders BreathingGuide when step is IN', () => {
    useSessionStore.setState({ calibrationStep: 'IN' });
    const { container } = render(<CalibrationView />);
    // BreathingGuide renders a timer role element
    expect(screen.getByRole('timer')).toBeDefined();
    // Should have SVG progress ring
    expect(container.querySelectorAll('circle').length).toBe(2);
  });

  it('renders BreathingGuide when step is HOLD', () => {
    useSessionStore.setState({ calibrationStep: 'HOLD' });
    render(<CalibrationView />);
    expect(screen.getByRole('timer')).toBeDefined();
  });

  it('renders BreathingGuide when step is OUT', () => {
    useSessionStore.setState({ calibrationStep: 'OUT' });
    render(<CalibrationView />);
    expect(screen.getByRole('timer')).toBeDefined();
  });

  it('does not render BreathingGuide when step is empty', () => {
    render(<CalibrationView />);
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('displays current BPM rounded', () => {
    useSessionStore.setState({
      biometrics: { bpm: 72.6, hrv: 45, signalQuality: 0.8, timestamp: Date.now() },
    });
    render(<CalibrationView />);
    expect(screen.getByText(/73/)).toBeDefined();
    expect(screen.getByText(/BPM/)).toBeDefined();
  });

  it('displays 0 BPM when no biometric data', () => {
    render(<CalibrationView />);
    expect(screen.getByText(/0/)).toBeDefined();
  });

  it('shows ambient background pulse during calibration', () => {
    useSessionStore.setState({ calibrationStep: 'IN' });
    const { container } = render(<CalibrationView />);
    // Check for the pulse animation element
    const pulseEl = container.querySelector('[style*="calibPulse"]');
    expect(pulseEl).toBeTruthy();
  });
});
