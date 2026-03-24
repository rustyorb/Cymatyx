import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import TelemetryPanel from '../../components/TelemetryPanel';
import { useSessionStore } from '../../stores/useSessionStore';
import { useAudioStore } from '../../stores/useAudioStore';

describe('TelemetryPanel', () => {
  beforeEach(() => {
    useSessionStore.setState({
      biometrics: { bpm: 0, hrv: 0, signalQuality: 0, timestamp: 0 },
      calibrationRsa: 0,
    });
    useAudioStore.setState({ entrainmentSource: 'init' });
  });

  it('renders the telemetry heading', () => {
    render(<TelemetryPanel />);
    expect(screen.getByText(/Physiological Telemetry/i)).toBeDefined();
  });

  it('displays heart rate rounded', () => {
    useSessionStore.setState({
      biometrics: { bpm: 68.4, hrv: 42, signalQuality: 0.9, timestamp: Date.now() },
    });
    render(<TelemetryPanel />);
    expect(screen.getByText('68')).toBeDefined();
  });

  it('displays RSA value rounded', () => {
    useSessionStore.setState({ calibrationRsa: 4.7 });
    render(<TelemetryPanel />);
    expect(screen.getByText('5')).toBeDefined();
  });

  it('shows "Initializing" for init source', () => {
    render(<TelemetryPanel />);
    expect(screen.getByText('Initializing')).toBeDefined();
  });

  it('shows "AI Provider" for ai source', () => {
    useAudioStore.setState({ entrainmentSource: 'ai' });
    render(<TelemetryPanel />);
    expect(screen.getByText('AI Provider')).toBeDefined();
  });

  it('shows "Offline Rules" for offline source', () => {
    useAudioStore.setState({ entrainmentSource: 'offline' });
    render(<TelemetryPanel />);
    expect(screen.getByText('Offline Rules')).toBeDefined();
  });

  it('shows "Gemini Live" for live source', () => {
    useAudioStore.setState({ entrainmentSource: 'live' });
    render(<TelemetryPanel />);
    expect(screen.getByText('Gemini Live')).toBeDefined();
  });

  it('renders source indicator dot with pulse animation', () => {
    useAudioStore.setState({ entrainmentSource: 'ai' });
    const { container } = render(<TelemetryPanel />);
    const dot = container.querySelector('.animate-pulse');
    expect(dot).toBeDefined();
    expect(dot?.className).toContain('bg-emerald-400');
  });
});
