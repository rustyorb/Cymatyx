import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from "@google/genai";
import { base64ToUint8Array, arrayBufferToBase64, float32ToInt16, int16ToFloat32 } from '../utils/audioUtils.ts';

// ── Connection state machine ────────────────────────────────────────
export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed';      // max retries exceeded — degraded to offline

interface UseLiveGeminiProps {
  apiKey?: string;
  onAudioOutput: (frequencyData: Uint8Array) => void;
  onToolCall: (name: string, args: any) => Promise<any>;
  onLog: (source: 'SYSTEM' | 'AI' | 'BIO' | 'ERROR', message: string) => void;
  /** Called when connection permanently fails after max retries */
  onDegraded?: () => void;
}

// ── Reconnection config ─────────────────────────────────────────────
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;
const BACKOFF_MULTIPLIER = 2;
const BACKOFF_JITTER = 0.3; // ±30% jitter
const MAX_RETRIES = 5;

function computeBackoff(attempt: number): number {
  const base = Math.min(INITIAL_BACKOFF_MS * Math.pow(BACKOFF_MULTIPLIER, attempt), MAX_BACKOFF_MS);
  const jitter = base * BACKOFF_JITTER * (Math.random() * 2 - 1);
  return Math.round(base + jitter);
}

export function useLiveGemini({ apiKey: providedApiKey, onToolCall, onLog, onDegraded }: UseLiveGeminiProps) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [micVolume, setMicVolume] = useState(0);

  // Reconnection state
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSystemInstructionRef = useRef<string>('');
  const intentionalDisconnectRef = useRef(false);

  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const tools: FunctionDeclaration[] = [
    {
      name: 'updateEntrainment',
      description: 'Adjusts the bio-resonance physics based on biometric data.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          binauralBeatFreq: { type: Type.NUMBER, description: 'Target brainwave freq (Hz)' },
          carrierFreq: { type: Type.NUMBER, description: 'Base carrier freq (Hz)' },
          visualPulseRate: { type: Type.NUMBER, description: 'Strobe rate (Hz)' },
          primaryColor: { type: Type.STRING, description: 'Hex color' },
          breathingRate: { type: Type.NUMBER, description: 'Seconds per breath' },
          spatialPan: { type: Type.NUMBER, description: 'Rotation speed (Hz)' },
          explanation: { type: Type.STRING, description: 'Reason for update' }
        },
        required: ['binauralBeatFreq', 'carrierFreq']
      }
    }
  ];

  // ── Cleanup audio resources ─────────────────────────────────────────
  const cleanupAudio = useCallback(() => {
    // Signal the worklet processor to stop, then disconnect
    workletNodeRef.current?.port.postMessage({ command: 'stop' });
    workletNodeRef.current?.disconnect();
    sourceNodeRef.current?.disconnect();
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    workletNodeRef.current = null;
    sourceNodeRef.current = null;
    mediaStreamRef.current = null;

    if (inputContextRef.current?.state !== 'closed') {
      inputContextRef.current?.close().catch(() => {});
    }
    if (audioContextRef.current?.state !== 'closed') {
      audioContextRef.current?.close().catch(() => {});
    }
    inputContextRef.current = null;
    audioContextRef.current = null;
    analyserRef.current = null;
  }, []);

  // ── Cancel any pending retry ────────────────────────────────────────
  const cancelRetry = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  // ── Schedule a reconnect attempt ────────────────────────────────────
  const scheduleReconnect = useCallback(() => {
    if (intentionalDisconnectRef.current) return;
    if (retryCountRef.current >= MAX_RETRIES) {
      onLog('ERROR', `Max reconnect attempts (${MAX_RETRIES}) reached — switching to offline mode`);
      setConnectionStatus('failed');
      onDegraded?.();
      return;
    }

    const attempt = retryCountRef.current;
    const delay = computeBackoff(attempt);
    retryCountRef.current = attempt + 1;
    setConnectionStatus('reconnecting');
    onLog('SYSTEM', `Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${attempt + 1}/${MAX_RETRIES})...`);

    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      // Re-run connect with the last system instruction
      connectInternal(lastSystemInstructionRef.current, true);
    }, delay);
  }, [onLog, onDegraded]); // connectInternal added via ref pattern below

  // ── Core connection logic ───────────────────────────────────────────
  const connectInternal = useCallback(async (systemInstruction: string, isRetry = false) => {
    if (!isRetry) {
      // Fresh connect — reset retry state
      retryCountRef.current = 0;
      intentionalDisconnectRef.current = false;
    }
    lastSystemInstructionRef.current = systemInstruction;

    if (!isRetry) {
      onLog('SYSTEM', 'Initializing Neural Link...');
    }
    setConnectionStatus('connecting');

    try {
      // Resolve API key: prop > vault > env var > build-time env
      let apiKey = providedApiKey;
      if (!apiKey) {
        const { resolveGeminiLiveKey } = await import('../services/providers.ts');
        apiKey = await resolveGeminiLiveKey();
      }
      if (!apiKey) apiKey = process.env.API_KEY;
      if (!apiKey) throw new Error("API Key is missing (set in Setup panel or environment).");

      // Clean up previous audio resources before creating new ones
      cleanupAudio();

      const ai = new GoogleGenAI({ apiKey });
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;

      audioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
      const outputNode = audioContextRef.current.createGain();
      outputNode.connect(audioContextRef.current.destination);
      analyserRef.current = audioContextRef.current.createAnalyser();
      outputNode.connect(analyserRef.current);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      inputContextRef.current = new AudioContextClass({ sampleRate: 16000 });

      // Load AudioWorklet module (replaces deprecated ScriptProcessorNode)
      await inputContextRef.current.audioWorklet.addModule('/audio-capture-processor.js');

      const source = inputContextRef.current.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      const workletNode = new AudioWorkletNode(inputContextRef.current, 'audio-capture-processor', {
        processorOptions: { bufferSize: 4096 },
      });
      workletNodeRef.current = workletNode;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
          tools: [{ functionDeclarations: tools }],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          }
        },
        callbacks: {
          onopen: () => {
            onLog('SYSTEM', retryCountRef.current > 0
              ? `Neural Link Re-established (after ${retryCountRef.current} retries).`
              : 'Neural Link Established.');
            retryCountRef.current = 0; // Reset on successful connection
            setConnectionStatus('connected');
            nextStartTimeRef.current = audioContextRef.current?.currentTime || 0;
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
              const audioBuffer = await decodeAudio(msg.serverContent.modelTurn.parts[0].inlineData.data);
              const ctx = audioContextRef.current!;
              const start = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const sourceNode = ctx.createBufferSource();
              sourceNode.buffer = audioBuffer;
              sourceNode.connect(outputNode);
              sourceNode.start(start);
              nextStartTimeRef.current = start + audioBuffer.duration;
            }

            if (msg.toolCall) {
              for (const fc of msg.toolCall.functionCalls) {
                const result = await onToolCall(fc.name, fc.args);
                sessionPromise.then(s => s.sendToolResponse({
                  functionResponses: [{ id: fc.id, name: fc.name, response: { result: result || "OK" } }]
                }));
              }
            }
          },
          onclose: () => {
            setConnectionStatus('disconnected');
            onLog('SYSTEM', 'Link Closed.');
            // If not intentional, schedule reconnect
            if (!intentionalDisconnectRef.current) {
              scheduleReconnect();
            }
          },
          onerror: (e: any) => {
            console.error("Live API Error:", e);
            onLog('ERROR', `Live Error: ${e.message || e}`);
            // Schedule reconnect on error (onclose may or may not fire)
            if (!intentionalDisconnectRef.current) {
              scheduleReconnect();
            }
          }
        }
      });

      sessionPromiseRef.current = sessionPromise;

      // Handle audio data from the AudioWorklet thread
      workletNode.port.onmessage = (event) => {
        if (event.data?.type === 'audio') {
          const inputData: Float32Array = event.data.buffer;

          // Compute mic volume for the UI meter
          let sum = 0;
          for (let i = 0; i < inputData.length; i += 100) sum += Math.abs(inputData[i]);
          setMicVolume(sum / (inputData.length / 100) * 10);

          // Encode and send to Gemini
          const base64 = arrayBufferToBase64(float32ToInt16(inputData).buffer);
          sessionPromise.then(session => {
            session.sendRealtimeInput({ media: { mimeType: 'audio/pcm;rate=16000', data: base64 } });
          }).catch(() => {
            // Swallow send errors during reconnection
          });
        }
      };

      source.connect(workletNode);
      // AudioWorklet nodes don't need to connect to destination for capture,
      // but connecting keeps the graph alive in all browsers
      workletNode.connect(inputContextRef.current.destination);

    } catch (e: any) {
      onLog('ERROR', `Connection Failed: ${e.message}`);
      console.error("Connection error:", e);
      // Schedule reconnect unless intentionally disconnected
      if (!intentionalDisconnectRef.current) {
        scheduleReconnect();
      }
    }
  }, [providedApiKey, onToolCall, onLog, cleanupAudio, scheduleReconnect]);

  const decodeAudio = async (base64: string): Promise<AudioBuffer> => {
    if (!audioContextRef.current) throw new Error("AudioContext not initialized");
    const bytes = base64ToUint8Array(base64);
    const float32 = int16ToFloat32(new Int16Array(bytes.buffer));
    const buffer = audioContextRef.current.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(float32, 0);
    return buffer;
  };

  // ── Public connect (fresh connection) ───────────────────────────────
  const connect = useCallback(async (systemInstruction: string) => {
    if (connectionStatus === 'connected' || connectionStatus === 'connecting') return;
    cancelRetry();
    await connectInternal(systemInstruction);
  }, [connectionStatus, cancelRetry, connectInternal]);

  const sendText = useCallback((text: string) => {
    sessionPromiseRef.current?.then(s =>
      s.sendRealtimeInput({ content: [{ parts: [{ text }] }] })
    ).catch(() => {});
  }, []);

  const getOutputData = useCallback(() => {
    if (!analyserRef.current) return new Uint8Array(0);
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);
    return data;
  }, []);

  // ── Intentional disconnect (user-initiated) ─────────────────────────
  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true;
    cancelRetry();
    sessionPromiseRef.current?.then(s => s.close()).catch(() => {});
    sessionPromiseRef.current = null;
    cleanupAudio();
    setConnectionStatus('disconnected');
  }, [cancelRetry, cleanupAudio]);

  // ── Manual retry (reset failed state and try again) ─────────────────
  const retry = useCallback(() => {
    if (!lastSystemInstructionRef.current) return;
    retryCountRef.current = 0;
    intentionalDisconnectRef.current = false;
    setConnectionStatus('connecting');
    connectInternal(lastSystemInstructionRef.current);
  }, [connectInternal]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      intentionalDisconnectRef.current = true;
      cancelRetry();
      cleanupAudio();
    };
  }, [cancelRetry, cleanupAudio]);

  // Backwards compat: isConnected derived from status
  const isConnected = connectionStatus === 'connected';

  return {
    connect,
    disconnect,
    retry,
    sendText,
    isConnected,
    connectionStatus,
    micVolume,
    getOutputData,
  };
}
