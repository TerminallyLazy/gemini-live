import React, { useEffect, useRef, useState, useCallback } from 'react';

interface Window {
  webkitAudioContext: typeof AudioContext;
}

// AudioProcessingWorklet code
const AUDIO_PROCESSING_WORKLET = `
class AudioProcessingWorklet extends AudioWorkletProcessor {
  buffer = new Int16Array(2048);
  bufferWriteIndex = 0;
  
  constructor() {
    super();
    this.hasAudio = false;
  }

  process(inputs) {
    if (inputs[0].length) {
      const channel0 = inputs[0][0];
      this.processChunk(channel0);
    }
    return true;
  }

  sendAndClearBuffer(){
    this.port.postMessage({
      event: "chunk",
      data: {
        int16arrayBuffer: this.buffer.slice(0, this.bufferWriteIndex).buffer,
      },
    });
    this.bufferWriteIndex = 0;
  }

  processChunk(float32Array) {
    const l = float32Array.length;
    
    for (let i = 0; i < l; i++) {
      const int16Value = float32Array[i] * 32768;
      this.buffer[this.bufferWriteIndex++] = int16Value;
      if(this.bufferWriteIndex >= this.buffer.length) {
        this.sendAndClearBuffer();
      }
    }

    if(this.bufferWriteIndex >= this.buffer.length) {
      this.sendAndClearBuffer();
    }
  }
}

registerProcessor('audio-recorder-worklet', AudioProcessingWorklet);
`;

// Volume meter worklet code
const VOL_METER_WORKLET = `
class VolMeter extends AudioWorkletProcessor {
  volume
  updateIntervalInMS
  nextUpdateFrame

  constructor() {
    super();
    this.volume = 0
    this.updateIntervalInMS = 25
    this.nextUpdateFrame = this.updateIntervalInMS
    this.port.onmessage = event => {
      if (event.data.updateIntervalInMS) {
        this.updateIntervalInMS = event.data.updateIntervalInMS
      }
    }
  }

  get intervalInFrames() {
    return (this.updateIntervalInMS / 1000) * sampleRate
  }

  process(inputs) {
    const input = inputs[0]

    if (input.length > 0) {
      const samples = input[0]
      let sum = 0
      let rms = 0

      for (let i = 0; i < samples.length; ++i) {
        sum += samples[i] * samples[i]
      }

      rms = Math.sqrt(sum / samples.length)
      this.volume = Math.max(rms, this.volume * 0.7)

      this.nextUpdateFrame -= samples.length
      if (this.nextUpdateFrame < 0) {
        this.nextUpdateFrame += this.intervalInFrames
        this.port.postMessage({volume: this.volume})
      }
    }

    return true
  }
}

registerProcessor('vu-meter', VolMeter);
`;

interface AudioData {
  data: string;
  mimeType: string;
}

interface LiveAudioRecorderProps {
  onAudioData?: (data: AudioData) => void;
  onVolumeChange?: (volume: number) => void;
  isRecording: boolean;
  sampleRate?: number;
}

const LiveAudioRecorder: React.FC<LiveAudioRecorderProps> = ({
  onAudioData,
  onVolumeChange,
  isRecording,
  sampleRate = 24000
}) => {
  const [error, setError] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingWorkletRef = useRef<AudioWorkletNode | null>(null);
  const vuWorkletRef = useRef<AudioWorkletNode | null>(null);
  const startingRef = useRef<Promise<boolean> | null>(null);

  // Create and register a worklet from blob URL
  const createWorkletModule = useCallback((workletCode: string) => {
    const blob = new Blob([workletCode], { type: 'application/javascript' });
    return URL.createObjectURL(blob);
  }, []);

  // Initialize audio context and worklets
  const initializeAudio = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Could not request user media");
      }

      // Get media stream
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
          autoGainControl: true,
          sampleRate
        } 
      });

      // Create audio context
      audioContextRef.current = new ((window as any).AudioContext || (window as any).webkitAudioContext)({
        sampleRate,
        latencyHint: 'interactive'
      });

      if (!audioContextRef.current) {
        throw new Error("AudioContext not initialized");
      }
      const source = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);

      // Set up recording worklet
      const recorderWorkletUrl = createWorkletModule(AUDIO_PROCESSING_WORKLET);
      await audioContextRef.current.audioWorklet.addModule(recorderWorkletUrl);
      URL.revokeObjectURL(recorderWorkletUrl);
      
      recordingWorkletRef.current = new AudioWorkletNode(
        audioContextRef.current,
        'audio-recorder-worklet'
      );

      recordingWorkletRef.current.port.onmessage = async (ev) => {
        const arrayBuffer = ev.data.data?.int16arrayBuffer;
        if (arrayBuffer) {
          const arrayBufferString = arrayBufferToBase64(arrayBuffer);
          onAudioData?.({
            data: arrayBufferString,
            mimeType: 'audio/webm;codecs=opus'
          });
        }
      };
      
      source.connect(recordingWorkletRef.current);

      // Set up volume meter worklet
      const volMeterWorkletUrl = createWorkletModule(VOL_METER_WORKLET);
      await audioContextRef.current.audioWorklet.addModule(volMeterWorkletUrl);
      URL.revokeObjectURL(volMeterWorkletUrl);

      vuWorkletRef.current = new AudioWorkletNode(audioContextRef.current, 'vu-meter');
      vuWorkletRef.current.port.onmessage = (ev) => {
        onVolumeChange?.(ev.data.volume);
      };

      source.connect(vuWorkletRef.current);

      return true;
    } catch (err) {
      console.error('Error initializing audio:', err);
      setError((err as Error).message);
      return false;
    }
  }, [sampleRate, onAudioData, onVolumeChange, createWorkletModule]);

  // Handle recording state changes
  useEffect(() => {
    const handleRecording = async () => {
      try {
        if (isRecording && !startingRef.current) {
          startingRef.current = initializeAudio();
          await startingRef.current;
          startingRef.current = null;
        } else if (!isRecording) {
          // Clean up recording resources
          if (recordingWorkletRef.current) {
            recordingWorkletRef.current.disconnect();
            recordingWorkletRef.current = null;
          }
          
          if (vuWorkletRef.current) {
            vuWorkletRef.current.disconnect();
            vuWorkletRef.current = null;
          }

          if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
          }

          if (audioContextRef.current) {
            await audioContextRef.current.close();
            audioContextRef.current = null;
          }
        }
      } catch (err) {
        console.error('Error managing recording state:', err);
        setError((err as Error).message);
      }
    };

    handleRecording();
  }, [isRecording, initializeAudio]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  if (error) {
    return <div className="text-red-500">Error: {error}</div>;
  }

  return null; // This is a non-visual component
};

// Helper function to convert ArrayBuffer to base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export default LiveAudioRecorder;