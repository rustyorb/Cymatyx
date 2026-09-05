import { create } from 'zustand';
import { INITIAL_SIGNALS, PERSISTENT, type BusSignals } from './types';

type Stamps = Partial<Record<keyof BusSignals, number>>;

interface BusStore {
  signals: BusSignals;
  stamps: Stamps;
  set: <K extends keyof BusSignals>(name: K, value: BusSignals[K], t?: number) => void;
  patch: (values: Partial<BusSignals>, t?: number) => void;
  /** Back to nulls; user choices (goal, method, camera) are kept. */
  reset: () => void;
}

export const bus = create<BusStore>((set) => ({
  signals: { ...INITIAL_SIGNALS },
  stamps: {},
  set: (name, value, t = Date.now()) =>
    set((s) => ({ signals: { ...s.signals, [name]: value }, stamps: { ...s.stamps, [name]: t } })),
  patch: (values, t = Date.now()) =>
    set((s) => {
      const stamps = { ...s.stamps };
      for (const k of Object.keys(values) as (keyof BusSignals)[]) stamps[k] = t;
      return { signals: { ...s.signals, ...values }, stamps };
    }),
  reset: () =>
    set((s) => {
      const signals = { ...INITIAL_SIGNALS };
      for (const k of PERSISTENT) (signals as Record<string, unknown>)[k] = s.signals[k];
      return { signals, stamps: {} };
    }),
}));
