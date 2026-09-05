import { useEffect, useState } from 'react';
import { Rack } from './ui/rack/Rack';
import { RackBack } from './ui/rack/RackBack';
import { createOrchestrator } from './session/orchestrate';
import { useSignal } from './bus/useSignal';
import workletUrl from './synth/worklet.ts?worker&url';

// One orchestrator per page. Module scope keeps StrictMode's double-render from spawning two loops.
const orch = createOrchestrator(workletUrl);

/** Peak absolute sample on the synth analyser right now (0 when silent). Exposed for the e2e smoke. */
function audioLevel(): number {
  const a = orch.analyser;
  if (!a) return 0;
  const buf = new Float32Array(a.fftSize);
  a.getFloatTimeDomainData(buf);
  let peak = 0;
  for (const v of buf) peak = Math.max(peak, Math.abs(v));
  return peak;
}
declare global {
  interface Window {
    __cymatyx?: { audioLevel: () => number };
  }
}
window.__cymatyx = { audioLevel };

export default function App() {
  const [wave, setWave] = useState<number[]>([]);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const live = useSignal('cam_live');
  useEffect(() => {
    orch.onFrame((f) => setWave(f.waveform));
    return () => orch.onFrame(() => {});
  }, []);
  useEffect(() => setVideo(orch.video), [live]);
  return (
    <>
      <header className="rack-rail px-6 py-3 flex items-baseline gap-4">
        <span className="font-silk font-bold tracking-[.4em] text-lg">CYMATYX</span>
        <span className="label" style={{ color: 'inherit', opacity: 0.7 }}>
          closed-loop bio-resonance · v2 m1
        </span>
      </header>
      <Rack waveform={wave} video={video} onStart={() => void orch.start()} onEnd={() => void orch.end()} />
      <RackBack />
    </>
  );
}
