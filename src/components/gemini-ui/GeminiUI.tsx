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
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      setMediaStream(stream);
      setIsStreaming(true);
      logEvent('Started audio streaming');
      
      // Handle the audio stream with the existing client
      // This will need to be implemented based on your audio processing needs
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