import React, { useEffect, useRef, useState, Suspense } from 'react';
import { EntrainmentConfig } from '../types.ts';
import Visualizer3D from './Visualizer3D.tsx';

interface Props {
  config: EntrainmentConfig;
  isPlaying: boolean;
  volume: number;
}

const EntrainmentPlayer: React.FC<Props> = ({ config, isPlaying, volume }) => {
  const audioCtxRef = useRef<AudioContext | null>(null);
  
  const oscillatorsRef = useRef<{
      left: OscillatorNode[],
      right: OscillatorNode[]
  }>({ left: [], right: [] });
  
  const gainNodeRef = useRef<GainNode | null>(null);
  const pannerRef = useRef<StereoPannerNode | null>(null);
  
  const [visualPhase, setVisualPhase] = useState(0);
  const [panPosition, setPanPosition] = useState(0); 
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!audioCtxRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioContextClass();
      
      const gain = audioCtxRef.current.createGain();
      const panner = audioCtxRef.current.createStereoPanner();
      
      gain.connect(panner).connect(audioCtxRef.current.destination);
      
      gainNodeRef.current = gain;
      pannerRef.current = panner;
    }
    
    return () => {
      audioCtxRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!audioCtxRef.current || !gainNodeRef.current) return;

    const ctx = audioCtxRef.current;
    const now = ctx.currentTime;

    const stopOscillators = () => {
        oscillatorsRef.current.left.forEach(o => o.stop());
        oscillatorsRef.current.right.forEach(o => o.stop());
        oscillatorsRef.current.left = [];
        oscillatorsRef.current.right = [];
    };

    if (isPlaying) {
      if (ctx.state === 'suspended') ctx.resume();
      
      stopOscillators();

      const merger = ctx.createChannelMerger(2);
      merger.connect(gainNodeRef.current);

      const layers = [1, 1.5, 2];
      
      layers.forEach(multiplier => {
          const oscL = ctx.createOscillator();
          const oscR = ctx.createOscillator();
          
          const baseFreq = config.carrierFreq * multiplier;
          const beatFreq = baseFreq + config.binauralBeatFreq;

          oscL.frequency.value = baseFreq;
          oscR.frequency.value = beatFreq;
          
          oscL.type = multiplier === 1 ? 'sine' : 'triangle';
          oscR.type = multiplier === 1 ? 'sine' : 'triangle';

          const layerGainL = ctx.createGain();
          layerGainL.gain.value = 1 / (multiplier * 2);
          oscL.connect(layerGainL);
          layerGainL.connect(merger, 0, 0);

          const layerGainR = ctx.createGain();
          layerGainR.gain.value = 1 / (multiplier * 2);
          oscR.connect(layerGainR);
          layerGainR.connect(merger, 0, 1);

          oscL.start(now);
          oscR.start(now);
          
          oscillatorsRef.current.left.push(oscL);
          oscillatorsRef.current.right.push(oscR);
      });

      gainNodeRef.current.gain.setTargetAtTime(volume, now, 0.5);

    } else {
      if (gainNodeRef.current) {
        gainNodeRef.current.gain.setTargetAtTime(0, now, 0.5);
        setTimeout(() => stopOscillators(), 600);
      }
    }
  }, [isPlaying, config.carrierFreq, config.binauralBeatFreq]);

  useEffect(() => {
      if(gainNodeRef.current && isPlaying) {
          gainNodeRef.current.gain.setTargetAtTime(volume, audioCtxRef.current!.currentTime, 0.1);
      }
  }, [volume]);

  useEffect(() => {
    if (!isPlaying) {
        setVisualPhase(0);
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        return;
    }

    const startTime = performance.now();
    const animate = () => {
      const now = performance.now();
      const elapsed = (now - startTime) / 1000;

      const intensity = (Math.sin(2 * Math.PI * config.visualPulseRate * elapsed) + 1) / 2;
      setVisualPhase(intensity);

      if (pannerRef.current && config.spatialPan > 0) {
          const pan = Math.sin(2 * Math.PI * config.spatialPan * elapsed);
          pannerRef.current.pan.value = pan;
          setPanPosition(pan);
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animationFrameRef.current = requestAnimationFrame(animate);

    return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
  }, [isPlaying, config.visualPulseRate, config.spatialPan]);

  return (
    <div className="flex flex-col items-center justify-center w-full h-full min-h-[400px] relative overflow-hidden rounded-3xl bg-slate-950 shadow-2xl border border-slate-800 group">
        <div className="absolute inset-0 z-0">
             <Suspense fallback={<div className="w-full h-full bg-slate-900" />}>
                <Visualizer3D speed={config.visualPulseRate} color={config.primaryColor} />
             </Suspense>
        </div>
        <div className="absolute inset-0 z-1 bg-[radial-gradient(transparent,rgba(15,23,42,0.8))]" />
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20">
             <div className="w-[80%] h-[1px] bg-white/10 relative">
                 <div 
                    className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-[0_0_15px_white] transition-transform duration-75"
                    style={{ 
                        left: '50%',
                        transform: `translate(${panPosition * 300}%, -50%)`,
                        opacity: config.spatialPan > 0 ? 0.8 : 0
                    }}
                 />
             </div>
        </div>
        <div className="absolute z-30 flex flex-col items-center text-center pointer-events-none mix-blend-screen">
            <div 
                className="w-16 h-16 rounded-full border-2 border-white/50 flex items-center justify-center backdrop-blur-sm"
                style={{
                     animation: `breathe ${config.breathingRate}s infinite ease-in-out`,
                     boxShadow: `0 0 ${visualPhase * 50}px ${config.primaryColor}`
                }}
            >
                <div className="w-2 h-2 bg-white rounded-full" />
            </div>
            <style>{`
                @keyframes breathe {
                    0%, 100% { transform: scale(1); opacity: 0.8; }
                    50% { transform: scale(1.5); opacity: 1; }
                }
            `}</style>
            <h2 className="mt-8 text-5xl font-thin tracking-tighter text-white tabular-nums drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
               {config.binauralBeatFreq.toFixed(1)}<span className="text-xl opacity-50 ml-1">Hz</span>
            </h2>
            <p className="text-white/70 text-[10px] uppercase tracking-[0.3em] mt-2 font-bold">Phantom Layering Active</p>
        </div>
        <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-12 text-[10px] font-mono text-cyan-200/50 tracking-widest uppercase z-30">
            <div className="flex flex-col items-center gap-1">
                <span className="text-white/30">Carrier</span>
                <span>{config.carrierFreq} Hz + Harmonics</span>
            </div>
            <div className="flex flex-col items-center gap-1">
                <span className="text-white/30">Strobe</span>
                <span>{config.visualPulseRate} Hz</span>
            </div>
        </div>
    </div>
  );
};

export default EntrainmentPlayer;