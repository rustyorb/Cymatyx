/** Raw processed pulse trace from the last BioFrame (an engine artifact, passed as a prop, not a bus scalar). */
export function Scope({ waveform, label }: { waveform: number[]; label: string }) {
  const w = 300;
  const h = 80;
  const d =
    waveform.length > 1
      ? waveform.map((v, i) => `${i === 0 ? 'M' : 'L'} ${((i / (waveform.length - 1)) * w).toFixed(1)} ${(h / 2 - v * (h / 3.2)).toFixed(1)}`).join(' ')
      : '';
  return (
    <div className="glass p-1" aria-hidden="true">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-20 block">
        <line x1="0" y1={h / 2} x2={w} y2={h / 2} stroke="#3d3220" strokeWidth="0.5" />
        {d ? <path d={d} fill="none" stroke="#ffb648" strokeWidth="1.5" /> : null}
      </svg>
      <div className="label px-1" style={{ color: 'var(--color-nixie-dim)' }}>
        {label}
      </div>
    </div>
  );
}
