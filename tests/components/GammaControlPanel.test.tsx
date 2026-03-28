import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import GammaControlPanel from '../../components/GammaControlPanel';
import { useGammaStore } from '../../stores/useGammaStore';

describe('GammaControlPanel', () => {
  beforeEach(() => {
    useGammaStore.setState({
      gamma: {
        isfEnabled: false,
        clickTrainVolume: 0.3,
        flickerIntensity: 0.5,
        epilepsyWarningAcknowledged: false,
        flickerDutyCycle: 0.5,
      },
      lastNonZeroFlickerIntensity: 0.5,
      panelExpanded: true,
    });
  });

  it('shows warning modal before enabling ISF when not acknowledged', () => {
    render(<GammaControlPanel />);
    fireEvent.click(screen.getByRole('switch', { name: /ISF Mode toggle/i }));
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('declining warning enables audio-only mode and disables flicker intensity', () => {
    render(<GammaControlPanel />);
    fireEvent.click(screen.getByRole('switch', { name: /ISF Mode toggle/i }));
    fireEvent.click(screen.getByText(/Audio Only/i));

    const state = useGammaStore.getState().gamma;
    expect(state.isfEnabled).toBe(true);
    expect(state.epilepsyWarningAcknowledged).toBe(false);
    expect(state.flickerIntensity).toBe(0);
  });

  it('accepting warning restores default flicker intensity when currently zero', () => {
    useGammaStore.setState({
      gamma: {
        isfEnabled: false,
        clickTrainVolume: 0.3,
        flickerIntensity: 0,
        epilepsyWarningAcknowledged: false,
        flickerDutyCycle: 0.5,
      },
      lastNonZeroFlickerIntensity: 0.5,
      panelExpanded: true,
    });

    render(<GammaControlPanel />);
    fireEvent.click(screen.getByRole('switch', { name: /ISF Mode toggle/i }));
    fireEvent.click(screen.getByText(/Enable Flicker/i));

    const state = useGammaStore.getState().gamma;
    expect(state.isfEnabled).toBe(true);
    expect(state.epilepsyWarningAcknowledged).toBe(true);
    expect(state.flickerIntensity).toBe(0.5);
  });

  it('restores the user\'s last non-zero flicker intensity after audio-only decline', () => {
    useGammaStore.setState({
      gamma: {
        isfEnabled: false,
        clickTrainVolume: 0.3,
        flickerIntensity: 0.8,
        epilepsyWarningAcknowledged: false,
        flickerDutyCycle: 0.5,
      },
      lastNonZeroFlickerIntensity: 0.8,
      panelExpanded: true,
    });

    render(<GammaControlPanel />);

    fireEvent.click(screen.getByRole('switch', { name: /ISF Mode toggle/i }));
    fireEvent.click(screen.getByText(/Audio Only/i));
    expect(useGammaStore.getState().gamma.flickerIntensity).toBe(0);

    fireEvent.click(screen.getByRole('switch', { name: /ISF Mode toggle/i }));
    fireEvent.click(screen.getByRole('switch', { name: /ISF Mode toggle/i }));
    fireEvent.click(screen.getByText(/Enable Flicker/i));

    const state = useGammaStore.getState().gamma;
    expect(state.epilepsyWarningAcknowledged).toBe(true);
    expect(state.isfEnabled).toBe(true);
    expect(state.flickerIntensity).toBe(0.8);
  });
});
