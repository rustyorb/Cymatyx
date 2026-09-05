import { bus } from './store';
import type { BusSignals } from './types';

/** The ONLY way UI reads a value. Components cannot render numbers that aren't on the bus. */
export function useSignal<K extends keyof BusSignals>(name: K): BusSignals[K] {
  return bus((s) => s.signals[name]);
}

/** Render helper: honest dashes for nulls. */
export function fmt(value: number | null, digits = 0): string {
  return value === null ? '--' : value.toFixed(digits);
}
