import type { ReactNode } from 'react';

export function Lamp({ status, label }: { status: 'off' | 'ok' | 'error'; label: string }) {
  const color = status === 'ok' ? 'bg-ok text-ok' : status === 'error' ? 'bg-red text-red' : 'led-off';
  return (
    <span className="flex items-center gap-1.5" role="status" aria-label={`${label} ${status}`} data-status={status}>
      <span className={`led ${color}`} />
      <span className="label">{status}</span>
    </span>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="label" style={{ color: 'var(--color-nixie-dim)' }}>
        {label}
      </span>
      {children}
    </label>
  );
}

export const inputClass = 'jack-select';
export const smallButton = { width: 64, height: 64, fontSize: 8 } as const;
