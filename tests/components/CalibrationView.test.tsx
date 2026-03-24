import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import CalibrationView from '../../components/CalibrationView';
import { useSessionStore } from '../../stores/useSessionStore';

describe('CalibrationView', () => {
  beforeEach(() => {
    useSessionStore.setState({
      calibrationStep: '',
      biometrics: { bpm: 0, hrv: 0, signalQuality: 0, timestamp: 0 },
    });
  });

  it('shows "Calibrating" when step is empty', () => {
    render(<CalibrationView />);
    expect(screen.getByText('Calibrating')).toBeDefined();
  });

  it('shows "Breath In" when step is IN', () => {
    useSessionStore.setState({ calibrationStep: 'IN' });
    render(<CalibrationView />);
    expect(screen.getByText('Breath In')).toBeDefined();
  });

  it('shows "Retain" when step is HOLD', () => {
    useSessionStore.setState({ calibrationStep: 'HOLD' });
    render(<CalibrationView />);
    expect(screen.getByText('Retain')).toBeDefined();
  });

  it('shows "Release" when step is OUT', () => {
    useSessionStore.setState({ calibrationStep: 'OUT' });
    render(<CalibrationView />);
    expect(screen.getByText('Release')).toBeDefined();
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

  it('applies cyan border class when step is IN', () => {
    useSessionStore.setState({ calibrationStep: 'IN' });
    const { container } = render(<CalibrationView />);
    const circle = container.querySelector('.rounded-full');
    expect(circle?.className).toContain('border-cyan-400');
    expect(circle?.className).toContain('scale-110');
  });

  it('applies scale-90 class when step is OUT', () => {
    useSessionStore.setState({ calibrationStep: 'OUT' });
    const { container } = render(<CalibrationView />);
    const circle = container.querySelector('.rounded-full');
    expect(circle?.className).toContain('scale-90');
    expect(circle?.className).toContain('border-slate-700');
  });
});
