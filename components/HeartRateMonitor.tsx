import React, { useEffect, useRef, useState } from 'react';
import { BiometricData } from '../types.ts';
import { HeartbeatEngine, SpectrumPoint, getLightingStatus } from '../utils/signalProcessing.ts';
import { useFaceTracking, TrackingStatus } from '../hooks/useFaceTracking.ts';
import { LineChart, Line, YAxis, ResponsiveContainer, BarChart, Bar, XAxis } from 'recharts';

interface Props {
  onBiometricUpdate: (data: BiometricData) => void;
  isActive: boolean;
  mode?: 'calibration' | 'monitoring';
}

/** Canvas dimensions for rPPG sampling */
const CANVAS_W = 100;
const CANVAS_H = 100;

/** Tracking status indicator colors and labels */
const TRACK_STATUS: Record<TrackingStatus, { color: string; label: string }> = {
  loading: { color: 'text-amber-500', label: 'LOADING MODEL' },
  ready:   { color: 'text-slate-500', label: 'WAITING' },
  tracking:{ color: 'text-emerald-400', label: 'FACE LOCKED' },
  lost:    { color: 'text-red-400', label: 'FACE LOST' },
  error:   { color: 'text-red-500', label: 'FIXED ROI' },
};

const HeartRateMonitor: React.FC<Props> = ({ onBiometricUpdate, isActive, mode = 'monitoring' }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [bpm, setBpm] = useState(0);
  const [hrv, setHrv] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [spectrum, setSpectrum] = useState<SpectrumPoint[]>([]);
  const [signal, setSignal] = useState<number[]>([]);
  const [lighting, setLighting] = useState(0);
  const [showDebug, setShowDebug] = useState(mode === 'calibration');
  
  const engineRef = useRef(new HeartbeatEngine());
  const requestRef = useRef<number | null>(null);

  // Face tracking via MediaPipe FaceLandmarker
  const { roi, faceDetected, status: trackStatus, detectFace, isFallback } = useFaceTracking({
    canvasWidth: CANVAS_W,
    canvasHeight: CANVAS_H,
  });

  useEffect(() => { if (mode === 'calibration') setShowDebug(true); }, [mode]);

  useEffect(() => {
    let currentStream: MediaStream | null = null;

    if (isActive) {
      navigator.mediaDevices.getUserMedia({ 
        video: { width: 320, height: 240, frameRate: 30, facingMode: "user" } 
      }).then(s => {
        currentStream = s;
        setStream(s);
      }).catch(err => console.error("Camera access denied:", err));
    }

    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach(t => t.stop());
        setStream(null);
      }
    };
  }, [isActive]);

  useEffect(() => {
    if (videoRef.current && stream) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(e => console.log("Play error", e));
    }
  }, [stream]);

  useEffect(() => {
    if (!isActive) return;

    const process = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2) {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, CANVAS_W, CANVAS_H);

          // Use face-tracked ROI (or fallback if face not detected)
          const currentROI = detectFace(video);
          const frame = ctx.getImageData(currentROI.x, currentROI.y, currentROI.width, currentROI.height);

          let g = 0;
          let b = 0;
          for (let i = 0; i < frame.data.length; i += 4) {
            g += frame.data[i + 1];
            b += (frame.data[i] + frame.data[i+1] + frame.data[i+2]) / 3;
          }
          const pixelCount = frame.data.length / 4;
          const avgG = g / pixelCount;
          const avgB = b / pixelCount;
          setLighting(avgB);

          const res = engineRef.current.process(avgG, 30);
          setBpm(res.bpm);
          setHrv(res.hrv);
          setConfidence(res.confidence);
          setSpectrum(res.spectrum);
          setSignal(res.signal);

          if (res.bpm > 0 && res.confidence > 0.4) {
            onBiometricUpdate({
              bpm: res.bpm,
              hrv: res.hrv,
              signalQuality: res.confidence,
              timestamp: Date.now()
            });
          }
        }
      }
      requestRef.current = requestAnimationFrame(process);
    };

    requestRef.current = requestAnimationFrame(process);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [isActive, onBiometricUpdate, detectFace]);

  const trackInfo = TRACK_STATUS[trackStatus];

  return (
    <div className={`relative w-full bg-slate-900/50 rounded-xl border border-slate-800 backdrop-blur-md shadow-2xl overflow-hidden flex flex-col transition-all duration-500 ${showDebug ? 'p-6 gap-4' : 'p-4'}`}>
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-cyan-400 font-bold text-[10px] uppercase tracking-[0.3em] flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${bpm > 0 ? 'bg-cyan-500 animate-pulse shadow-[0_0_8px_cyan]' : 'bg-slate-700'}`}></span>
            rPPG Core v5.0
        </h3>
        <div className="flex items-center gap-3">
          <span className={`text-[8px] font-mono uppercase tracking-wider ${trackInfo.color}`}>
            {faceDetected ? '◉' : '○'} {trackInfo.label}
          </span>
          <button onClick={() => setShowDebug(!showDebug)} className="text-[10px] text-slate-500 uppercase tracking-widest hover:text-cyan-400 transition-colors">
              {showDebug ? 'COMPACT' : 'DEBUG'}
          </button>
        </div>
      </div>

      <div className="h-24 bg-black/40 rounded-lg border border-slate-800 relative overflow-hidden group">
        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{backgroundImage: 'linear-gradient(rgba(34,211,238,0.1) 1px, transparent 1px)', backgroundSize: '100% 10px'}}></div>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={signal.map(v => ({ v }))}>
            <YAxis domain={['auto', 'auto']} hide />
            <Line type="monotone" dataKey="v" stroke="#22d3ee" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
        <div className="absolute top-2 left-3 flex flex-col">
            <span className="text-2xl font-black text-white tabular-nums">{bpm ? Math.round(bpm) : '--'}</span>
            <span className="text-[8px] text-slate-500 uppercase tracking-widest -mt-1">BPM</span>
        </div>
        <div className="absolute bottom-2 left-3 flex flex-col">
            <span className="text-lg font-bold text-violet-400 tabular-nums">{hrv > 0 ? hrv.toFixed(1) : '--'}</span>
            <span className="text-[8px] text-slate-500 uppercase tracking-widest -mt-1">HRV (RMSSD)</span>
        </div>
        <div className="absolute top-2 right-3 flex flex-col items-end">
            <span className={`text-[10px] font-bold ${confidence > 0.5 ? 'text-emerald-400' : 'text-amber-500'}`}>
                {Math.round(confidence * 100)}%
            </span>
            <span className="text-[8px] text-slate-500 uppercase tracking-widest">SIGNAL LOCK</span>
        </div>
      </div>

      <div className={`grid grid-cols-2 gap-4 transition-all duration-500 overflow-hidden ${showDebug ? 'opacity-100 max-h-96' : 'opacity-0 max-h-0'}`}>
        <div className="aspect-video bg-black rounded-lg border border-slate-800 relative overflow-hidden">
            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover grayscale contrast-125 opacity-40" />
            <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className="hidden" />
            {/* Dynamic ROI overlay — maps canvas coords to video preview */}
            <div
              className={`absolute border ${faceDetected ? 'border-emerald-500/60 bg-emerald-500/5 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'border-cyan-500/50 bg-cyan-500/5 shadow-[0_0_15px_rgba(6,182,212,0.2)]'} transition-all duration-200`}
              style={{
                top: `${(roi.y / CANVAS_H) * 100}%`,
                left: `${(roi.x / CANVAS_W) * 100}%`,
                width: `${(roi.width / CANVAS_W) * 100}%`,
                height: `${(roi.height / CANVAS_H) * 100}%`,
              }}
            >
                <div className={`absolute -top-3 left-0 text-[6px] font-mono uppercase ${faceDetected ? 'text-emerald-500' : 'text-cyan-500'}`}>
                  {faceDetected ? 'FACE_ROI' : 'FALLBACK_ROI'}
                </div>
            </div>
            <div className="absolute bottom-2 left-2 text-[8px] font-mono text-slate-400">
                LIT: <span className={getLightingStatus(lighting) === 'OPTIMAL' ? 'text-emerald-400' : 'text-red-400'}>{getLightingStatus(lighting)}</span>
            </div>
            {/* ROI dimensions readout */}
            <div className="absolute bottom-2 right-2 text-[7px] font-mono text-slate-600">
              ROI {roi.width}×{roi.height} @{roi.x},{roi.y}
            </div>
        </div>
        <div className="aspect-video bg-slate-950/80 rounded-lg border border-slate-800 p-2 relative">
            <div className="absolute top-1 right-2 text-[6px] text-slate-600 font-mono uppercase">DFT_SPECTRUM</div>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={spectrum}>
                    <Bar dataKey="power" fill="#6366f1" isAnimationActive={false} radius={[1, 1, 0, 0]} />
                    <XAxis dataKey="bpm" hide />
                </BarChart>
            </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default HeartRateMonitor;
