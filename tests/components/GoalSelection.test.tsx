import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GoalSelection from '../../components/GoalSelection';
import { useSessionStore } from '../../stores/useSessionStore';
import { useAudioStore } from '../../stores/useAudioStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { GoalType } from '../../types';

describe('GoalSelection', () => {
  beforeEach(() => {
    useSessionStore.setState({ goal: GoalType.RELAXATION });
    useAudioStore.setState({ isLiveMode: true });
    useSettingsStore.setState({
      selfLoveEnabled: false,
      selfLoveTtsEnabled: false,
    });
  });

  it('renders all 5 goal buttons', () => {
    render(<GoalSelection onStartCalibration={vi.fn()} />);
    expect(screen.getByText('RELAXATION')).toBeDefined();
    expect(screen.getByText('FOCUS')).toBeDefined();
    expect(screen.getByText('ENERGY')).toBeDefined();
    expect(screen.getByText(/40Hz Gamma/)).toBeDefined();
    expect(screen.getByText('SELF LOVE')).toBeDefined();
  });

  it('clicking a goal updates the store', () => {
    render(<GoalSelection onStartCalibration={vi.fn()} />);
    fireEvent.click(screen.getByText('FOCUS'));
    expect(useSessionStore.getState().goal).toBe(GoalType.FOCUS);
  });

  it('clicking NEURO_REGEN goal works', () => {
    render(<GoalSelection onStartCalibration={vi.fn()} />);
    fireEvent.click(screen.getByText(/40Hz Gamma/));
    expect(useSessionStore.getState().goal).toBe(GoalType.NEURO_REGEN);
  });

  it('shows Alzheimer\'s Protocol subtitle on NEURO_REGEN', () => {
    render(<GoalSelection onStartCalibration={vi.fn()} />);
    expect(screen.getByText(/Alzheimer.*Protocol/i)).toBeDefined();
  });

  it('calls onStartCalibration when START SEQUENCE clicked', () => {
    const onStart = vi.fn();
    render(<GoalSelection onStartCalibration={onStart} />);
    fireEvent.click(screen.getByText('START SEQUENCE'));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('toggles self-love enabled checkbox', () => {
    render(<GoalSelection onStartCalibration={vi.fn()} />);
    const checkboxes = screen.getAllByRole('checkbox');
    // First checkbox is self-love enable
    fireEvent.click(checkboxes[0]);
    expect(useSettingsStore.getState().selfLoveEnabled).toBe(true);
  });

  it('toggles TTS checkbox', () => {
    render(<GoalSelection onStartCalibration={vi.fn()} />);
    const checkboxes = screen.getAllByRole('checkbox');
    // Second checkbox is TTS
    fireEvent.click(checkboxes[1]);
    expect(useSettingsStore.getState().selfLoveTtsEnabled).toBe(true);
  });

  it('switches to Standard mode', () => {
    render(<GoalSelection onStartCalibration={vi.fn()} />);
    fireEvent.click(screen.getByText('Standard'));
    expect(useAudioStore.getState().isLiveMode).toBe(false);
  });

  it('switches to Live Link mode', () => {
    useAudioStore.setState({ isLiveMode: false });
    render(<GoalSelection onStartCalibration={vi.fn()} />);
    fireEvent.click(screen.getByText('Live Link'));
    expect(useAudioStore.getState().isLiveMode).toBe(true);
  });

  it('highlights selected goal with cyan styling', () => {
    useSessionStore.setState({ goal: GoalType.FOCUS });
    render(<GoalSelection onStartCalibration={vi.fn()} />);
    const focusBtn = screen.getByText('FOCUS');
    expect(focusBtn.className).toContain('text-cyan-400');
  });

  it('highlights NEURO_REGEN with purple styling when selected', () => {
    useSessionStore.setState({ goal: GoalType.NEURO_REGEN });
    render(<GoalSelection onStartCalibration={vi.fn()} />);
    const gammaBtn = screen.getByText(/40Hz Gamma/);
    expect(gammaBtn.className).toContain('text-purple-400');
  });
});
