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

  // ── Accessibility tests ──────────────────────────────────────────
  it('has role="dialog" and aria-modal', () => {
    render(<EpilepsyWarning onAccept={vi.fn()} onDecline={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('epilepsy-title');
  });

  it('calls onDecline when Escape key is pressed', () => {
    const onDecline = vi.fn();
    render(<EpilepsyWarning onAccept={vi.fn()} onDecline={onDecline} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDecline).toHaveBeenCalledOnce();
  });

  it('has warning SVG marked aria-hidden', () => {
    const { container } = render(<EpilepsyWarning onAccept={vi.fn()} onDecline={vi.fn()} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });
});
