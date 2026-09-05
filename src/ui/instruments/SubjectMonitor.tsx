import { useEffect, useRef } from 'react';
import { TallyLamp } from './TallyLamp';
import { useSignal } from '../../bus/useSignal';

/** The camera is never invisible: whenever it samples, it is on the rack, with its tally lit. */
export function SubjectMonitor({ video }: { video: HTMLVideoElement | null }) {
  const box = useRef<HTMLDivElement>(null);
  const live = useSignal('cam_live');
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (video && live) {
      video.className = 'w-full h-full object-cover';
      video.style.filter = 'grayscale(1) sepia(.35) contrast(1.1) brightness(.85)';
      el.replaceChildren(video);
    } else el.replaceChildren();
  }, [video, live]);
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="tape">Subject</span>
        <TallyLamp />
      </div>
      <div ref={box} className="glass aspect-4/3 overflow-hidden flex items-center justify-center">
        {!live && <span className="label" style={{ color: 'var(--color-nixie-dim)' }}>no signal</span>}
      </div>
    </div>
  );
}
