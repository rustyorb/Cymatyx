import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import HeartRateMonitor from './components/HeartRateMonitor.tsx';
import EntrainmentPlayer from './components/EntrainmentPlayer.tsx';
import ProviderSetup from './components/ProviderSetup.tsx';
import { generateSessionConfig } from './services/geminiService.ts';
import { useLiveGemini } from './hooks/useLiveGemini.ts';
import { loadSetupState, resolveProviderConfig } from './services/providers.ts';
import { AppState, BiometricData, EntrainmentConfig, GoalType, LogEntry, ProviderSetupState } from './types.ts';

const DEFAULT_CONFIG: EntrainmentConfig = {
  binauralBeatFreq: 10,
  carrierFreq: 200,
  visualPulseRate: 10,
  primaryColor: '#6366f1',
  breathingRate: 5,
  spatialPan: 0,
  inductionText: "Welcome to Cymatyx.",
  explanation: 'Initializing bio-resonance sequence...'
};

export default function App() {
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [goal, setGoal] = useState<GoalType>(GoalType.RELAXATION);
  const [biometrics, setBiometrics] = useState<BiometricData>({ bpm: 0, hrv: 0, signalQuality: 0, timestamp: 0 });
  const [config, setConfig] = useState<EntrainmentConfig>(DEFAULT_CONFIG);
  const [sessionHistory, setSessionHistory] = useState<string[]>([]);
  const [volume, setVolume] = useState(0.5);
  const [isLiveMode, setIsLiveMode] = useState(true);
  
  const [setupState, setSetupState] = useState<ProviderSetupState>(() => loadSetupState());
  const providerConfig = useMemo(() => resolveProviderConfig(setupState), [setupState]);
  
  const [calibrationStep, setCalibrationStep] = useState<string>(''); 
  const [calibrationRsa, setCalibrationRsa] = useState<number>(0);
  
  const [systemLog, setSystemLog] = useState<LogEntry[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((source: 'SYSTEM' | 'BIO' | 'AI' | 'ERROR', message: string) => {
      setSystemLog(prev => [...prev.slice(-49), {
          id: Math.random().toString(36),
          timestamp: new Date().toLocaleTimeString([], {hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit'}),
          source,
          message
      }]);
  }, []);

  const handleSetupChange = useCallback((next: ProviderSetupState) => {
    setSetupState(next);
  }, []);

  useEffect(() => {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [systemLog]);

  const handleBiometricUpdate = useCallback((d: BiometricData) => {
    setBiometrics(d);
  }, []);

  const biometricsRef = useRef(biometrics);
  const goalRef = useRef(goal);

  useEffect(() => { biometricsRef.current = biometrics; }, [biometrics]);
  useEffect(() => { goalRef.current = goal; }, [goal]);

  const { 
    connect: connectLive, 
    disconnect: disconnectLive, 
    sendText, 
    isConnected, 
    micVolume,
    getOutputData
  } = useLiveGemini({
      apiKey: setupState.geminiLiveKey,
      onAudioOutput: () => {},
      onLog: addLog,
      onToolCall: async (name, args) => {
          if (name === 'updateEntrainment') {
              const newConfig = { ...config, ...args };
              setConfig(newConfig);
              addLog('AI', `System Update: Beat ${args.binauralBeatFreq}Hz / Carrier ${args.carrierFreq}Hz`);
              return "Entrainment parameters updated.";
          }
          return "Tool acknowledged.";
      }
  });
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
      let animId: number;
      const draw = () => {
          if (canvasRef.current && isConnected) {
              const ctx = canvasRef.current.getContext('2d');
              const data = getOutputData();
              if (ctx) {
                  const w = canvasRef.current.width;
                  const h = canvasRef.current.height;
                  ctx.clearRect(0, 0, w, h);
                  ctx.lineWidth = 2;
                  ctx.strokeStyle = '#22d3ee';
                  ctx.beginPath();
                  const sliceWidth = w / data.length;
                  let x = 0;
                  for (let i = 0; i < data.length; i++) {
                      const v = data[i] / 128.0;
                      const y = (v * h) / 2;
                      if (i === 0) ctx.moveTo(x, y);
                      else ctx.lineTo(x, y);
                      x += sliceWidth;
                  }
                  ctx.lineTo(w, h/2);
                  ctx.stroke();
              }
          }
          animId = requestAnimationFrame(draw);
      };
      if (isConnected) draw();
      return () => cancelAnimationFrame(animId);
  }, [isConnected, getOutputData]);

  useEffect(() => {
    let interval: any;
    if (state === AppState.SESSION_ACTIVE) {
      interval = setInterval(async () => {
         const bio = biometricsRef.current;
         if (bio.bpm > 0 && bio.signalQuality > 0.4) {
             if (isLiveMode && isConnected) {
                 sendText(`Telemetry: ${Math.round(bio.bpm)} BPM. RSA: ${calibrationRsa}. Goal: ${goalRef.current}. Update physics.`);
             } else if (!isLiveMode) {
                 addLog('SYSTEM', "Analyzing bio-trend...");
                 const newConfig = await generateSessionConfig(goalRef.current, bio.bpm, bio.hrv, [], providerConfig);
                 setConfig(newConfig);
             }
         }
      }, 15000);
    }
    return () => clearInterval(interval);
  }, [state, isLiveMode, isConnected, calibrationRsa]);

  const handleStartCalibration = async () => {
    setState(AppState.CALIBRATING);
    addLog('SYSTEM', 'Initiating Vagal Tone Calibration...');
    
    setCalibrationStep('IN');
    let minBpm = 200;
    let maxBpm = 0;
    
    const tracker = setInterval(() => {
        const b = biometricsRef.current.bpm;
        if (b > 0) {
            if (b < minBpm) minBpm = b;
            if (b > maxBpm) maxBpm = b;
        }
    }, 200);

    setTimeout(() => {
        setCalibrationStep('HOLD');
        setTimeout(() => {
            setCalibrationStep('OUT');
            setTimeout(async () => {
                clearInterval(tracker);
                setCalibrationStep('');
                
                let rsa = (maxBpm > minBpm) ? (maxBpm - minBpm) : 12;
                setCalibrationRsa(rsa);
                addLog('BIO', `Calibration Finished. Vagal Tone: ${Math.round(rsa)}`);

                if (isLiveMode) {
                    await connectLive(`Act as Cymatyx. User Goal: ${goal}. Vagal Tone: ${rsa}. Use 'updateEntrainment' to adjust physics.`);
                }
                
                const initialConfig = await generateSessionConfig(goal, biometricsRef.current.bpm || 75, 50, [], providerConfig);
                setConfig(initialConfig);
                setState(AppState.SESSION_ACTIVE);
            }, 5000);
        }, 5000);
    }, 5000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col font-sans selection:bg-cyan-500/30">
      <header className="px-6 py-4 border-b border-slate-900 flex justify-between items-center bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shadow-2xl overflow-hidden relative">
             <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent"></div>
             <svg className="w-6 h-6 text-cyan-400 relative z-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 12s2.5-7 5-7 5 7 5 7 2.5-7 5-7" />
                <path d="M4 12s2.5 7 5 7 5-7 5-7 2.5 7 5 7" opacity="0.3"/>
             </svg>
          </div>
          <div className="flex flex-col">
             <h1 className="text-sm font-black tracking-[0.4em] text-white leading-none">CYMATYX</h1>
             <span className="text-[8px] text-cyan-500 uppercase tracking-widest mt-1">Closed-Loop Bio-Resonance</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
           {state === AppState.SESSION_ACTIVE && (
             <button onClick={() => { setState(AppState.SUMMARY); disconnectLive(); }} className="px-4 py-1.5 rounded-full border border-red-500/30 text-red-400 text-[10px] uppercase tracking-[0.2em] hover:bg-red-500/10 transition-colors">
                Terminate
             </button>
           )}
        </div>
      </header>

      <main className="flex-grow p-4 md:p-6 max-w-[1600px] mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="space-y-6 lg:col-span-3 order-2 lg:order-1 flex flex-col">
          <HeartRateMonitor 
            onBiometricUpdate={handleBiometricUpdate} 
            isActive={state !== AppState.IDLE && state !== AppState.SUMMARY} 
            mode={state === AppState.CALIBRATING ? 'calibration' : 'monitoring'}
          />
          <div className="bg-slate-900/40 rounded-2xl p-6 border border-slate-800 backdrop-blur-xl">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">Physiological Telemetry</h3>
            <div className="grid grid-cols-1 gap-4">
                <div className="bg-black/40 p-5 rounded-xl border border-slate-800 flex justify-between items-center">
                    <span className="text-slate-500 text-[10px] uppercase tracking-wider">Heart Rate</span>
                    <div className="text-xl font-mono text-cyan-400">{Math.round(biometrics.bpm)} <span className="text-[10px] text-slate-600">BPM</span></div>
                </div>
                <div className="bg-black/40 p-5 rounded-xl border border-slate-800 flex justify-between items-center">
                    <span className="text-slate-500 text-[10px] uppercase tracking-wider">RSA Value</span>
                    <div className="text-xl font-mono text-purple-400">{Math.round(calibrationRsa)} <span className="text-[10px] text-slate-600">Hz</span></div>
                </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-6 order-1 lg:order-2 flex flex-col gap-6">
          {state === AppState.IDLE && (
            <div className="h-full flex flex-col items-center justify-center bg-slate-900/20 rounded-[2.5rem] border border-slate-800/50 p-12 text-center shadow-inner relative overflow-hidden min-h-[500px]">
                <div className="relative z-10 w-full max-w-sm">
                    <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Select Neural Goal</h2>
                    <p className="text-slate-500 text-xs mb-8 uppercase tracking-widest">Adjust system tuning parameters</p>
                    
                    <div className="grid grid-cols-1 gap-3 mb-8">
                        {[GoalType.RELAXATION, GoalType.FOCUS, GoalType.ENERGY, GoalType.NEURO_REGEN, GoalType.SELF_LOVE].map((g) => (
                            <button key={g} onClick={() => setGoal(g)} className={`px-6 py-4 rounded-xl text-xs font-bold transition-all uppercase tracking-[0.2em] border ${goal === g ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.1)]' : 'bg-slate-900/50 text-slate-600 border-slate-800'}`}>
                                {g.replace('_', ' ')}
                            </button>
                        ))}
                    </div>

                    <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 mb-8">
                         <button onClick={() => setIsLiveMode(false)} className={`flex-1 py-3 text-[10px] uppercase tracking-widest rounded-lg transition-all ${!isLiveMode ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-400'}`}>Standard</button>
                         <button onClick={() => setIsLiveMode(true)} className={`flex-1 py-3 text-[10px] uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-2 ${isLiveMode ? 'bg-cyan-900/30 text-cyan-400' : 'text-slate-500 hover:text-slate-400'}`}>
                            Live Link
                         </button>
                    </div>

                    <button onClick={handleStartCalibration} className="w-full py-6 bg-white text-slate-950 font-black rounded-2xl transition-all hover:scale-[1.01] active:scale-95 tracking-[0.4em] text-xs shadow-2xl">
                        START SEQUENCE
                    </button>
                </div>
            </div>
          )}

          {state === AppState.CALIBRATING && (
              <div className="h-full flex flex-col items-center justify-center bg-black/40 rounded-[2.5rem] border border-slate-900 relative overflow-hidden min-h-[500px]">
                  <div className="relative z-10 flex flex-col items-center text-center">
                      <div className={`w-40 h-40 border-2 rounded-full flex items-center justify-center mb-8 transition-all duration-[5000ms]
                          ${calibrationStep === 'IN' ? 'scale-110 border-cyan-400 bg-cyan-500/5' : 
                            calibrationStep === 'HOLD' ? 'scale-110 border-white' :
                            calibrationStep === 'OUT' ? 'scale-90 border-slate-700' : 'border-slate-800'}
                      `}>
                          <span className="text-lg font-black text-white tracking-[0.3em]">{calibrationStep}</span>
                      </div>
                      <h2 className="text-xl text-white font-bold mb-2 tracking-widest uppercase">
                          {calibrationStep === 'IN' ? 'Breath In' : 
                           calibrationStep === 'HOLD' ? 'Retain' :
                           calibrationStep === 'OUT' ? 'Release' : 'Calibrating'}
                      </h2>
                      <div className="text-lg font-mono text-cyan-500/50">{Math.round(biometrics.bpm)} BPM</div>
                  </div>
              </div>
          )}

          {state === AppState.SESSION_ACTIVE && (
            <div className="h-full flex flex-col gap-6">
                <EntrainmentPlayer config={config} isPlaying={true} volume={volume} />
                <div className="bg-slate-900/40 p-6 rounded-2xl border border-slate-800 flex items-center gap-8">
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest shrink-0">Main Amplitude</span>
                    <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} className="flex-grow accent-cyan-500" />
                </div>
            </div>
          )}
          
          {state === AppState.SUMMARY && (
             <div className="h-full bg-slate-900/50 rounded-[2.5rem] p-12 border border-slate-800 flex flex-col items-center justify-center text-center">
                 <h2 className="text-2xl text-white font-bold mb-4 tracking-tighter">Session Optimization Complete</h2>
                 <p className="text-slate-500 text-sm mb-10 max-w-xs">Baseline Vagal Tone of {Math.round(calibrationRsa)}Hz maintained across resonance cycle.</p>
                 <button onClick={() => setState(AppState.IDLE)} className="px-10 py-4 bg-cyan-600 text-white font-bold rounded-xl hover:bg-cyan-500 transition-colors tracking-widest text-xs">DISMISS</button>
             </div>
          )}
        </div>

        <div className="space-y-6 lg:col-span-3 order-3 flex flex-col h-full">
           <ProviderSetup state={setupState} onChange={handleSetupChange} />

           <div className={`bg-slate-900/40 border ${isConnected ? 'border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.05)]' : 'border-slate-800'} rounded-2xl p-5 transition-all`}>
              <div className="flex justify-between items-center mb-6">
                  <h3 className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Neural Connector</h3>
                  <div className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase ${isConnected ? 'bg-cyan-500/10 text-cyan-400' : 'bg-slate-800 text-slate-600'}`}>
                      {isConnected ? 'Sync Active' : 'Offline'}
                  </div>
              </div>
              <div className="h-20 bg-black/60 rounded-xl border border-slate-800/50 mb-4 overflow-hidden">
                   <canvas ref={canvasRef} width={300} height={80} className="w-full h-full opacity-60" />
              </div>
              <div className="flex items-center gap-3">
                   <div className="flex-grow h-0.5 bg-slate-800 rounded-full overflow-hidden">
                       <div className="h-full bg-cyan-500 transition-all duration-75" style={{width: `${Math.min(100, micVolume * 20)}%`}}></div>
                   </div>
              </div>
           </div>

           <div className="flex-grow bg-black/40 rounded-2xl border border-slate-900 p-5 font-mono text-[9px] flex flex-col overflow-hidden min-h-[300px]">
               <div className="text-slate-600 uppercase tracking-widest border-b border-slate-900 pb-3 mb-3">Kernel Log</div>
               <div className="flex-grow overflow-y-auto space-y-2 pr-2 scrollbar-hide">
                   {systemLog.map(log => (
                       <div key={log.id} className="flex gap-2">
                           <span className="text-slate-700 shrink-0">[{log.timestamp}]</span>
                           <span className={`font-bold shrink-0 ${log.source === 'AI' ? 'text-purple-400' : log.source === 'BIO' ? 'text-cyan-400' : 'text-slate-600'}`}>{log.source}:</span>
                           <span className="text-slate-400 leading-relaxed">{log.message}</span>
                       </div>
                   ))}
                   <div ref={logsEndRef} />
               </div>
           </div>
        </div>
      </main>
    </div>
  );
}