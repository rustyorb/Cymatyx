import React from 'react';

/**
 * EpilepsyWarning — Mandatory photosensitive epilepsy safety modal.
 *
 * MUST be shown and acknowledged before any 40Hz visual flicker is enabled.
 * This is a medical/legal safety requirement — 40Hz flashing light can
 * trigger seizures in photosensitive individuals (~1 in 4000 people).
 *
 * The warning follows accessibility best practices:
 * - Clear, plain language
 * - Large text with high contrast
 * - Explicit consent required (not auto-dismiss)
 * - Option to decline (continues without flicker)
 */
interface Props {
  onAccept: () => void;
  onDecline: () => void;
}

export default function EpilepsyWarning({ onAccept, onDecline }: Props) {
  const dialogRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    // Focus trap: focus first button on mount
    const firstBtn = dialogRef.current?.querySelector('button');
    firstBtn?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDecline();
        return;
      }
      if (e.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button, [tabindex]');
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onDecline]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="epilepsy-title">
      <div ref={dialogRef} className="max-w-lg mx-4 bg-slate-900 border-2 border-amber-500/50 rounded-2xl p-8 shadow-2xl">
        {/* Warning icon */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
            <svg aria-hidden="true" className="w-7 h-7 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <h2 id="epilepsy-title" className="text-xl font-bold text-amber-400 tracking-wide">
            PHOTOSENSITIVE EPILEPSY WARNING
          </h2>
        </div>

        {/* Warning content */}
        <div className="space-y-4 text-slate-300 text-sm leading-relaxed">
          <p>
            The <strong className="text-white">40Hz Gamma ISF Mode</strong> uses rapid visual flashing
            (40 flashes per second) combined with auditory click trains for neural entrainment.
          </p>

          <p className="text-amber-200/90 font-medium">
            <span aria-hidden="true">⚠️</span> This feature involves <strong>stroboscopic light</strong> that may trigger seizures
            in people with photosensitive epilepsy or other photosensitive conditions.
          </p>

          <ul className="list-disc list-inside space-y-1 text-slate-400 text-xs">
            <li>Do NOT use if you have epilepsy, a history of seizures, or are photosensitive</li>
            <li>Stop immediately if you experience dizziness, nausea, or visual disturbances</li>
            <li>Use in a well-lit room — do not use in complete darkness</li>
            <li>This is an experimental research tool, not a medical device</li>
            <li>Consult a physician before use if you have any neurological conditions</li>
          </ul>

          <p className="text-xs text-slate-500 italic">
            Based on research by Iaccarino et al. (Nature 2016) and Martorell et al. (Cell 2019).
            The 40Hz gamma entrainment protocol is under active clinical investigation.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-4 mt-8">
          <button
            type="button"
            onClick={onDecline}
            className="flex-1 px-4 py-3 rounded-xl bg-slate-800 text-slate-400 text-sm font-medium
                       hover:bg-slate-700 transition-colors border border-slate-700"
          >
            No Thanks — Audio Only
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="flex-1 px-4 py-3 rounded-xl bg-amber-600/20 text-amber-400 text-sm font-bold
                       hover:bg-amber-600/30 transition-colors border border-amber-500/50"
          >
            I Understand — Enable Flicker
          </button>
        </div>
      </div>
    </div>
  );
}
