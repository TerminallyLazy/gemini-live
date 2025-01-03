// Type declarations for TypeScript (these are not included in the worklet code)
declare var AudioWorkletProcessor: {
  prototype: AudioWorkletProcessor;
  new(): AudioWorkletProcessor;
};

declare var registerProcessor: (name: string, processorCtor: new () => AudioWorkletProcessor) => void;

declare var sampleRate: number;

interface AudioWorkletProcessor {
  readonly port: MessagePort;
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean;
}

// Pure JavaScript worklet code as a string
const workletCode = `
class ResamplerProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.buffer = new Float32Array(2048);
    this.bufferIndex = 0;
    this.inputSampleRate = options.processorOptions.inputSampleRate || sampleRate;
    this.outputSampleRate = options.processorOptions.outputSampleRate || 16000;
    this.ratio = this.outputSampleRate / this.inputSampleRate;
    console.log('ResamplerProcessor initialized with input rate:', this.inputSampleRate, 'output rate:', this.outputSampleRate);
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0][0];
    if (!input) return true;

    // Process each sample with the correct resampling ratio
    for (let i = 0; i < input.length; i++) {
      const targetIndex = Math.floor(i * this.ratio);
      if (targetIndex < this.buffer.length) {
        this.buffer[targetIndex] = input[i];
        this.bufferIndex = Math.max(this.bufferIndex, targetIndex + 1);
      }
    }

    // If we have enough samples, send them to the main thread
    if (this.bufferIndex >= 512) {
      const samples = this.buffer.slice(0, this.bufferIndex);
      
      // Convert to Int16 before sending
      const pcmData = new Int16Array(samples.length);
      let maxAmplitude = 0;
      for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        maxAmplitude = Math.max(maxAmplitude, Math.abs(s));
      }

      // Only send if we have actual audio
      if (maxAmplitude > 0.01) {
        this.port.postMessage({ 
          pcmData: pcmData.buffer,
          maxAmplitude,
          sampleRate: this.outputSampleRate
        }, [pcmData.buffer]);
      }
      
      // Reset buffer
      this.buffer.fill(0);
      this.bufferIndex = 0;
    }

    return true;
  }
}

registerProcessor('resampler-processor', ResamplerProcessor);
`;

// Create a Blob URL that can be loaded as a module
const blob = new Blob([workletCode], { type: 'application/javascript' });
const workletUrl = URL.createObjectURL(blob);

export default workletUrl; 