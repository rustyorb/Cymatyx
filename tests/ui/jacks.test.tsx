import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { bus } from '../../src/bus/store';
import { settings } from '../../src/voice/settings';
import { VoiceJack } from '../../src/ui/instruments/VoiceJack';
import { BrainJack } from '../../src/ui/instruments/BrainJack';
import { CoachStrip } from '../../src/ui/instruments/CoachStrip';

describe('jacks', () => {
  beforeEach(() => {
    bus.getState().reset();
    settings.getState().reset();
  });

  it('lamps are dark until a server answered', () => {
    render(
      <>
        <VoiceJack />
        <BrainJack />
      </>,
    );
    expect(screen.getByRole('status', { name: /voice off/i })).toHaveAttribute('data-status', 'off');
    expect(screen.getByRole('status', { name: /brain off/i })).toHaveAttribute('data-status', 'off');
    act(() => bus.getState().set('tts_status', 'ok'));
    expect(screen.getByRole('status', { name: /voice ok/i })).toBeInTheDocument();
  });

  it('brain mode latches persist to settings and reset the lamp', () => {
    render(<BrainJack />);
    fireEvent.click(screen.getByRole('button', { name: 'LLM' }));
    expect(settings.getState().brain.mode).toBe('llm');
    fireEvent.click(screen.getByRole('button', { name: 'OFF' }));
    expect(settings.getState().brain.mode).toBe('off');
    expect(bus.getState().signals.brain_status).toBe('off');
  });

  it('the strip shows exactly the last line and the mute latch writes the bus', () => {
    render(<CoachStrip />);
    expect(screen.getByTestId('coach-strip')).toHaveTextContent('--');
    act(() => bus.getState().set('coach_last_line', 'Got you — 68 beats a minute.'));
    expect(screen.getByTestId('coach-strip')).toHaveTextContent('68 beats');
    fireEvent.click(screen.getByRole('button', { name: 'COACH' }));
    expect(bus.getState().signals.coach_enabled).toBe(false);
  });
});
