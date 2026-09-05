import { useSignal } from '../../bus/useSignal';

const ANGLE = (v: number) => -48 + (v / 100) * 96;

/** Cream-faced coherence VU. Needle rests at zero when there is no reading; the number says "--". */
export function VuMeter() {
  const c = useSignal('coherence');
  const angle = ANGLE(c ?? 0);
  return (
    <div className="glass p-2" role="img" aria-label={`Coherence ${c === null ? 'no reading' : c}`}>
      <svg viewBox="0 0 200 120" className="w-full">
        <rect x="4" y="4" width="192" height="112" rx="5" fill="#ece5d2" stroke="#a49c86" />
        <path d="M 36 104 A 86 86 0 0 1 164 104" fill="none" stroke="#211f1a" strokeWidth="1.4" />
        <path d="M 141 46 A 86 86 0 0 1 164 104" fill="none" stroke="#4f7d43" strokeWidth="4" />
        {[0, 33, 66, 100].map((v) => {
          const a = ((ANGLE(v) - 90) * Math.PI) / 180;
          return (
            <text key={v} x={100 + 70 * Math.cos(a)} y={112 + 70 * Math.sin(a)} fontSize="7" textAnchor="middle" fill="#57523f">
              {v}
            </text>
          );
        })}
        <text x="100" y="96" textAnchor="middle" fontSize="8.5" fontWeight="600" letterSpacing="3" fill="#211f1a">
          COHERENCE
        </text>
        <text x="100" y="107" textAnchor="middle" fontSize="8" fontWeight="700" fill={c === null ? '#3f3b2d' : '#4f7d43'}>
          {c === null ? '--' : c}
        </text>
        {/* no reading: the needle sits at rest AND reads as unpowered, so rest is never mistaken for zero coherence */}
        <g
          data-powered={String(c !== null)}
          style={{ transform: `rotate(${angle}deg)`, transformOrigin: '100px 112px', transition: 'transform .6s cubic-bezier(.34,1.2,.64,1)', opacity: c === null ? 0.3 : 1 }}
        >
          <line x1="100" y1="92" x2="100" y2="24" stroke="#1b1915" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="100" y1="32" x2="100" y2="24" stroke="#b3382a" strokeWidth="2.4" strokeLinecap="round" />
        </g>
        <circle cx="100" cy="112" r="9" fill="#8c8471" stroke="#55503f" />
      </svg>
    </div>
  );
}
