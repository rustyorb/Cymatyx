import { useEffect, useRef } from 'react';

/**
 * GammaClickTrain — 40Hz amplitude-modulated click train audio engine.
 *
 * Creates a precise 40Hz audio stimulus using Web Audio API:
 * - White noise source → bandpass filter (centered at 1kHz) → AM at 40Hz
 * - The amplitude modulation creates distinct "clicks" at exactly 40Hz
 * - This matches the auditory stimulus used in Iaccarino et al. 2016
 *
 * The click train runs independently from the binaural beat engine,
 * allowing both to play simultaneously for combined entrainment.
 */
interface Props {
  isPlaying: boolean;
  volume: number; // 0-1
}

export default function GammaClickTrain({ isPlaying, volume }: Props) {
  const ctxRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<{
    noise: AudioBufferSourceNode | null;
    amOsc: OscillatorNode | null;
    amGain: GainNode | null;
    masterGain: GainNode | null;
    bandpass: BiquadFilterNode | null;
  }>({ noise: null, amOsc: null, amGain: null, masterGain: null, bandpass: null });

  // Create and start the 40Hz click train
  useEffect(() => {
    if (!isPlaying) {
      // Fade out and stop
      if (nodesRef.current.masterGain && ctxRef.current) {
        nodesRef.current.masterGain.gain.setTargetAtTime(0, ctxRef.current.currentTime, 0.1);
        const cleanup = setTimeout(() => {
          try { nodesRef.current.noise?.stop(); } catch {}
          try { nodesRef.current.amOsc?.stop(); } catch {}
          nodesRef.current = { noise: null, amOsc: null, amGain: null, masterGain: null, bandpass: null };
        }, 200);
        return () => clearTimeout(cleanup);
      }
      return;
    }

    // Initialize AudioContext
    if (!ctxRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      ctxRef.current = new AudioContextClass();
    }

    const ctx = ctxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    // --- White noise source ---
    // Create a 2-second noise buffer (looped)
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noiseNode = ctx.createBufferSource();
    noiseNode.buffer = noiseBuffer;
    noiseNode.loop = true;

    // --- Bandpass filter (1kHz center, narrow Q) ---
    // Shapes the noise into a tonal "click" character
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 1000;
    bandpass.Q.value = 2;

    // --- 40Hz amplitude modulation ---
    // OscillatorNode at 40Hz modulates a GainNode to create the click envelope
    const amOsc = ctx.createOscillator();
    amOsc.type = 'square'; // Square wave = sharp on/off clicks (true ISF)
    amOsc.frequency.value = 40;

    const amGain = ctx.createGain();
    amGain.gain.value = 0; // Will be modulated by amOsc

    // The AM oscillator connects to the gain's gain parameter
    // We need to scale it: square wave goes -1 to 1, we want 0 to 1
    const amScaleGain = ctx.createGain();
    amScaleGain.gain.value = 0.5;
    amOsc.connect(amScaleGain);
    amScaleGain.connect(amGain.gain);

    // DC offset to shift the square wave from [-0.5, 0.5] to [0, 1]
    const dcOffset = ctx.createConstantSource();
    dcOffset.offset.value = 0.5;
    dcOffset.connect(amGain.gain);

    // --- Master gain ---
    const masterGain = ctx.createGain();
    masterGain.gain.value = volume;

    // --- Signal chain ---
    // noise → bandpass → amGain (modulated at 40Hz) → masterGain → output
    noiseNode.connect(bandpass);
    bandpass.connect(amGain);
    amGain.connect(masterGain);
    masterGain.connect(ctx.destination);

    // Start everything
    noiseNode.start();
    amOsc.start();
    dcOffset.start();

    nodesRef.current = {
      noise: noiseNode,
      amOsc: amOsc,
      amGain: amGain,
      masterGain: masterGain,
      bandpass: bandpass,
    };

    return () => {
      try { noiseNode.stop(); } catch {}
      try { amOsc.stop(); } catch {}
      try { dcOffset.stop(); } catch {}
    };
  }, [isPlaying]);

  // Update volume smoothly
  useEffect(() => {
    if (nodesRef.current.masterGain && ctxRef.current) {
      nodesRef.current.masterGain.gain.setTargetAtTime(
        volume,
        ctxRef.current.currentTime,
        0.05,
      );
    }
  }, [volume]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      ctxRef.current?.close();
      ctxRef.current = null;
    };
  }, []);

  return null; // Pure audio — no visual output
}
