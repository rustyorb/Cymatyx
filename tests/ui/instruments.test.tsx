import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { bus } from '../../src/bus/store';
import { Nixie } from '../../src/ui/instruments/Nixie';
import { TallyLamp } from '../../src/ui/instruments/TallyLamp';
import { VuMeter } from '../../src/ui/instruments/VuMeter';
import { GoalSelector } from '../../src/ui/instruments/GoalSelector';
import { PowerSwitch } from '../../src/ui/instruments/PowerSwitch';

describe('instruments read the bus honestly', () => {
  beforeEach(() => {
    bus.getState().reset();
    bus.getState().set('goal', 'RELAXATION');
  });

  it('Nixie shows -- when bpm is null and digits when measured', () => {
    render(<Nixie signal="bpm" label="Heart rate" />);
    expect(screen.getByRole('status', { name: /heart rate: no reading/i })).toHaveTextContent('--');
    act(() => bus.getState().set('bpm', 72.4));
    expect(screen.getByRole('status', { name: /heart rate: 72/i })).toHaveTextContent('72');
  });

  it('TallyLamp is lit only while cam_live', () => {
    render(<TallyLamp />);
    expect(screen.getByRole('status', { name: /camera off/i })).toHaveAttribute('data-lit', 'false');
    act(() => bus.getState().patch({ cam_live: true, cam_status: 'tracking' }));
    expect(screen.getByRole('status', { name: /camera live/i })).toHaveAttribute('data-lit', 'true');
  });

  it('VuMeter says -- with no coherence and the number when measured', () => {
    render(<VuMeter />);
    expect(screen.getByRole('img', { name: /coherence no reading/i })).toBeInTheDocument();
    act(() => bus.getState().set('coherence', 64));
    expect(screen.getByRole('img', { name: /coherence 64/i })).toBeInTheDocument();
  });

  it('GoalSelector latches the bus goal and locks during a session', () => {
    render(<GoalSelector />);
    fireEvent.click(screen.getByRole('button', { name: 'FOCUS' }));
    expect(bus.getState().signals.goal).toBe('FOCUS');
    expect(screen.getByRole('button', { name: 'FOCUS' })).toHaveAttribute('aria-pressed', 'true');
    act(() => bus.getState().set('session_state', 'active'));
    expect(screen.getByRole('button', { name: 'ENERGY' })).toBeDisabled();
  });

  it('PowerSwitch reads START when idle and STOP while running', () => {
    let started = 0;
    let ended = 0;
    render(<PowerSwitch onStart={() => started++} onEnd={() => ended++} />);
    fireEvent.click(screen.getByRole('button', { name: 'START' }));
    expect(started).toBe(1);
    act(() => bus.getState().set('session_state', 'calibrating'));
    fireEvent.click(screen.getByRole('button', { name: 'STOP' }));
    expect(ended).toBe(1);
  });
});
