import React, { useEffect, useRef, useState } from 'react';
import { useLiveAPIContext } from '../../contexts/LiveAPIContext';
import './GeminiUI.scss';
import type { Part } from "@google/generative-ai";

declare global {
  interface Window {
    $3Dmol: typeof $3Dmol;
  }
}

export const GeminiUI: React.FC = () => {
  const { client, connected, connect, disconnect } = useLiveAPIContext();
  const [isStreaming, setIsStreaming] = useState(false);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const eventLogRef = useRef<HTMLDivElement>(null);
  const responseAreaRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<$3Dmol.Viewer | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const initViewer = () => {
      if (!viewerRef.current && window.$3Dmol) {
        const viewerConfig = {
          backgroundColor: 'transparent',
          antialias: true,
          cartoonQuality: 10,
          disableFog: true
        };
        
        viewerRef.current = window.$3Dmol.createViewer('viewport', viewerConfig);
        viewerRef.current.setBackgroundColor('transparent');
        viewerRef.current.setStyle({}, { cartoon: { color: 'spectrum' } });
        viewerRef.current.render();
      }
    };

    initViewer();
  }, []);

  // Auto-connect when component mounts
  useEffect(() => {
    if (!connected && !isConnecting) {
      handleConnect();
    }
  }, [connected, isConnecting]);

  const logEvent = (message: string, isError = false) => {
    if (!eventLogRef.current) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.innerHTML = `<span class="timestamp">[${timestamp}]</span> ${
      isError ? '<span class="error">' + message + '</span>' : message
    }`;
    eventLogRef.current.appendChild(logEntry);
    eventLogRef.current.scrollTop = eventLogRef.current.scrollHeight;
  };

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      await connect();
      logEvent('Connected to Gemini API');
    } catch (error) {
      logEvent('Connection error: ' + (error as Error).message, true);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
      logEvent('Disconnected from Gemini API');
    } catch (error) {
      logEvent('Disconnect error: ' + (error as Error).message, true);
    }
  };

  const startAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      // Create AudioContext if it doesn't exist
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      
      const audioCtx = audioContextRef.current;
      const source = audioCtx.createMediaStreamSource(stream);
      
      // Use a fixed buffer size of 2048 samples
      const processor = audioCtx.createScriptProcessor(2048, 1, 1);
      
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Resample to 16kHz if needed
        let audioData;
        if (audioCtx.sampleRate === 16000) {
          audioData = new Float32Array(inputData);
        } else {
          // Simple downsample by picking every Nth sample
          const ratio = Math.floor(audioCtx.sampleRate / 16000);
          audioData = new Float32Array(Math.floor(inputData.length / ratio));
          for (let i = 0; i < audioData.length; i++) {
            audioData[i] = inputData[i * ratio];
          }
        }
        
        // Convert to PCM16
        const pcm16 = new Int16Array(audioData.length);
        for (let i = 0; i < audioData.length; i++) {
          const s = Math.max(-1, Math.min(1, audioData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // Convert to base64
        const uint8Array = new Uint8Array(pcm16.buffer);
        let binary = '';
        uint8Array.forEach(byte => {
          binary += String.fromCharCode(byte);
        });
        const base64 = btoa(binary);
        
        client.sendRealtimeInput([{
          mimeType: "audio/pcm;rate=16000",
          data: base64
        }]);
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);
      
      setMediaStream(stream);
      setIsStreaming(true);
      logEvent('Started audio streaming');
      
    } catch (error) {
      console.error('Error starting audio:', error);
      logEvent('Error starting audio: ' + (error as Error).message, true);
      stopAudioRecording();
    }
  };

  const stopAudioRecording = () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setMediaStream(null);
    setIsStreaming(false);
    logEvent('Stopped audio streaming');
  };

  const handleSendMessage = () => {
    const text = textInputRef.current?.value.trim();
    if (!text) return;

    try {
      if (!connected) {
        throw new Error('Not connected to Gemini API');
      }

      const part: Part = { text };
      client.send(part);
      if (textInputRef.current) {
        textInputRef.current.value = '';
      }
      logEvent('Sent message: ' + text);
    } catch (error) {
      logEvent('Error sending message: ' + (error as Error).message, true);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="gemini-ui">
      <div className="grid-bg"></div>
      
      {/* Left Panel */}
      <div className="main-display">
        <div className="visualization">
          <div id="viewport"></div>
          <div className="molecule-controls">
            <button className="molecule-btn" id="resetViewBtn" title="Reset View">
              <i className="fas fa-sync-alt"></i>
            </button>
            <button className="molecule-btn" id="fullscreenBtn" title="Fullscreen">
              <i className="fas fa-expand"></i>
            </button>
            <button className="molecule-btn" id="snapshotBtn" title="Take Snapshot">
              <i className="fas fa-camera"></i>
            </button>
          </div>
        </div>
        <div className="response-area" ref={responseAreaRef}></div>
      </div>

      {/* Right Panel */}
      <div className="controls-panel">
        <div className="status">
          <div className={`status-indicator ${connected ? 'status-connected' : isConnecting ? 'status-connecting' : 'status-disconnected'}`}></div>
          <span>
            {isConnecting ? 'Connecting...' : connected ? 'Connected' : 'Disconnected'}
          </span>
          {!connected && !isConnecting && (
            <button 
              className="btn btn-small" 
              onClick={handleConnect}
              style={{ marginLeft: '8px', padding: '4px 8px', fontSize: '12px' }}
            >
              Connect
            </button>
          )}
          {connected && (
            <button 
              className="btn btn-small btn-error" 
              onClick={handleDisconnect}
              style={{ marginLeft: '8px', padding: '4px 8px', fontSize: '12px' }}
            >
              Disconnect
            </button>
          )}
        </div>
        
        <div className="input-group">
          <textarea 
            ref={textInputRef}
            rows={3} 
            placeholder="Type your message here..."
            aria-label="Message input"
            onKeyPress={handleKeyPress}
          />
          <button 
            className="btn btn-icon" 
            onClick={handleSendMessage}
            disabled={!connected}
          >
            <i className="fas fa-paper-plane"></i>
          </button>
        </div>

        <div className="audio-controls">
          <div className="audio-buttons">
            <button 
              className="btn flex-1" 
              onClick={startAudioRecording}
              disabled={!connected || isStreaming}
            >
              <i className="fas fa-microphone"></i>
              Start Audio
            </button>
            <button 
              className="btn btn-error flex-1" 
              onClick={stopAudioRecording}
              disabled={!isStreaming}
            >
              <i className="fas fa-stop"></i>
              Stop Audio
            </button>
          </div>
          
          <div className="audio-visualizer">
            <canvas id="audioVisualizer"></canvas>
            <div id="vadIndicator" className="vad-indicator"></div>
          </div>
          
          <div className="audio-status">
            <span>{isStreaming ? 'Microphone active' : 'Microphone inactive'}</span>
            <div className="audio-level-container">
              <div id="audioLevelBar" className="audio-level-bar"></div>
            </div>
          </div>
        </div>

        <div className="event-log" ref={eventLogRef}></div>
      </div>
    </div>
  );
};
