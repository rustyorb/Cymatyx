import { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from "@google/genai";
import { base64ToUint8Array, arrayBufferToBase64, float32ToInt16, int16ToFloat32 } from '../utils/audioUtils.ts';

interface UseLiveGeminiProps {
  apiKey?: string;
  onAudioOutput: (frequencyData: Uint8Array) => void;
  onToolCall: (name: string, args: any) => Promise<any>;
  onLog: (source: 'SYSTEM' | 'AI' | 'BIO' | 'ERROR', message: string) => void;
}

export function useLiveGemini({ apiKey: providedApiKey, onToolCall, onLog }: UseLiveGeminiProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [micVolume, setMicVolume] = useState(0);

  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);

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

  const connect = async (systemInstruction: string) => {
    if (isConnected) return;
    
    onLog('SYSTEM', 'Initializing Neural Link...');
    
    try {
      const apiKey = providedApiKey || process.env.API_KEY;
      if (!apiKey) throw new Error("API Key is missing (set in Setup panel or environment).");

      const ai = new GoogleGenAI({ apiKey });
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      
      audioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
      const outputNode = audioContextRef.current.createGain();
      outputNode.connect(audioContextRef.current.destination);
      analyserRef.current = audioContextRef.current.createAnalyser();
      outputNode.connect(analyserRef.current);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      inputContextRef.current = new AudioContextClass({ sampleRate: 16000 });
      const source = inputContextRef.current.createMediaStreamSource(stream);
      const processor = inputContextRef.current.createScriptProcessor(4096, 1, 1);

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
            onLog('SYSTEM', 'Neural Link Established.');
            setIsConnected(true);
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
            setIsConnected(false);
            onLog('SYSTEM', 'Link Closed.');
          },
          onerror: (e) => {
            console.error("Live API Error:", e);
            onLog('ERROR', `Live Error: ${e.message}`);
          }
        }
      });

      sessionPromiseRef.current = sessionPromise;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for(let i=0; i<inputData.length; i+=100) sum += Math.abs(inputData[i]);
        setMicVolume(sum / (inputData.length/100) * 10);

        const base64 = arrayBufferToBase64(float32ToInt16(inputData).buffer);
        sessionPromise.then(session => {
          session.sendRealtimeInput({ media: { mimeType: 'audio/pcm;rate=16000', data: base64 } });
        });
      };

      source.connect(processor);
      processor.connect(inputContextRef.current.destination);

    } catch (e: any) {
      onLog('ERROR', `Connection Failed: ${e.message}`);
      console.error("Connection error:", e);
    }
  };

  const decodeAudio = async (base64: string): Promise<AudioBuffer> => {
    if (!audioContextRef.current) throw new Error("AudioContext not initialized");
    const bytes = base64ToUint8Array(base64);
    const float32 = int16ToFloat32(new Int16Array(bytes.buffer));
    const buffer = audioContextRef.current.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(float32, 0);
    return buffer;
  };

  const sendText = (text: string) => {
    sessionPromiseRef.current?.then(s => s.sendRealtimeInput({ content: [{ parts: [{ text }] }] }));
  };

  const getOutputData = () => {
    if (!analyserRef.current) return new Uint8Array(0);
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);
    return data;
  };

  const disconnect = () => {
    sessionPromiseRef.current?.then(s => s.close());
    setIsConnected(false);
  };

  return { connect, disconnect, sendText, isConnected, micVolume, getOutputData };
}
