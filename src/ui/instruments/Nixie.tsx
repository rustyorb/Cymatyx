import { useSignal, fmt } from '../../bus/useSignal';
import type { BusSignals } from '../../bus/types';

type NumericKey = { [K in keyof BusSignals]: BusSignals[K] extends number | null ? K : never }[keyof BusSignals];

/** A nixie tube can only show a bus signal. null → dark tube reading "--". */
export function Nixie({ signal, label, digits = 0, unit }: { signal: NumericKey; label: string; digits?: number; unit?: string }) {
  const v = useSignal(signal);
  return (
    <div className="glass px-4 py-2 text-center" role="status" aria-label={`${label}: ${v === null ? 'no reading' : fmt(v, digits)}`}>
      <div className={`nixie ${v === null ? 'nixie-off' : ''}`}>{fmt(v, digits)}</div>
      <div className="label" style={{ color: 'var(--color-nixie-dim)' }}>
        {label}
        {unit ? ` · ${unit}` : ''}
      </div>
    </div>
  );
}
