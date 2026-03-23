/**
 * AudioWorklet processor for capturing microphone input.
 * Replaces deprecated ScriptProcessorNode with modern AudioWorklet API.
 *
 * Runs on the audio rendering thread — zero main-thread jank.
 * Collects samples into buffers of the configured size, then posts
 * Float32Array chunks to the main thread via MessagePort.
 */
class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    // Default buffer size matches the old ScriptProcessorNode's 4096
    this.bufferSize = options?.processorOptions?.bufferSize ?? 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.stopped = false;

    // Listen for stop command from main thread
    this.port.onmessage = (event) => {
      if (event.data?.command === 'stop') {
        this.stopped = true;
      }
    };
  }

  process(inputs) {
    if (this.stopped) return false; // Returning false removes the node

    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0]; // mono channel

    // Accumulate samples into our buffer
    for (let i = 0; i < channelData.length; i++) {
      this.buffer[this.writeIndex++] = channelData[i];

      if (this.writeIndex >= this.bufferSize) {
        // Buffer full — send to main thread
        this.port.postMessage({
          type: 'audio',
          buffer: this.buffer.slice(), // Copy so we can reuse the buffer
        });
        this.writeIndex = 0;
      }
    }

    return true; // Keep processor alive
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
