import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EpilepsyWarning from '../../components/EpilepsyWarning';

describe('EpilepsyWarning', () => {
  it('renders the warning title', () => {
    render(<EpilepsyWarning onAccept={vi.fn()} onDecline={vi.fn()} />);
    expect(screen.getByText(/PHOTOSENSITIVE EPILEPSY WARNING/i)).toBeDefined();
  });

  it('renders as a fullscreen modal overlay', () => {
    const { container } = render(<EpilepsyWarning onAccept={vi.fn()} onDecline={vi.fn()} />);
    const overlay = container.firstElementChild as HTMLElement;
    expect(overlay.className).toContain('fixed');
    expect(overlay.className).toContain('inset-0');
  });

  it('contains warning text about stroboscopic light', () => {
    render(<EpilepsyWarning onAccept={vi.fn()} onDecline={vi.fn()} />);
    expect(screen.getByText(/stroboscopic/i)).toBeDefined();
  });

  it('calls onDecline when "Audio Only" button is clicked', () => {
    const onDecline = vi.fn();
    render(<EpilepsyWarning onAccept={vi.fn()} onDecline={onDecline} />);
    const declineBtn = screen.getByText(/Audio Only/i);
    fireEvent.click(declineBtn);
    expect(onDecline).toHaveBeenCalledOnce();
  });

  it('calls onAccept when "Enable Flicker" button is clicked', () => {
    const onAccept = vi.fn();
    render(<EpilepsyWarning onAccept={onAccept} onDecline={vi.fn()} />);
    const acceptBtn = screen.getByText(/Enable Flicker/i);
    fireEvent.click(acceptBtn);
    expect(onAccept).toHaveBeenCalledOnce();
  });
});
