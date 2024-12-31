import React, { useEffect, useRef, useState } from 'react';
import { useLiveAPIContext } from '../../contexts/LiveAPIContext';
import './GeminiUI.scss';
import type { Part } from "@google/generative-ai";
import { useDraggable } from '../../hooks/use-draggable';
import cn from 'classnames';

export const GeminiUI: React.FC = () => {
  const { client, connected, connect, disconnect } = useLiveAPIContext();
  const [isStreaming, setIsStreaming] = useState(false);
  const [modelAudioEnabled, setModelAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isWebcamOn, setIsWebcamOn] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isConnecting, setIsConnecting] = useState(false);
  const [inputText, setInputText] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const screenShareRef = useRef<HTMLVideoElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaControlsRef = useRef<HTMLDivElement>(null);
  const { position: mediaPosition, isDragging: mediaIsDragging } = useDraggable(
    mediaControlsRef,
    { x: window.innerWidth / 2 - 200, y: window.innerHeight - 100 } // Initial position
  );

  useEffect(() => {
    const attemptConnection = async () => {
      if (!connected && !isConnecting) {
        try {
          setIsConnecting(true);
          await connect();
          logEvent('Connected to Gemini API');
        } catch (error) {
          logEvent('Connection error: ' + (error as Error).message, true);
        } finally {
          setIsConnecting(false);
        }
      }
    };
    
    attemptConnection();
    
    return () => {
      if (connected) {
        handleDisconnect();
      }
    };
  }, []); // Component mount only

  const handleConnect = async () => {
    if (isConnecting) return;
    
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
      if (mediaRecorderRef.current) {
        await stopAudioRecording();
      }
      if (isScreenSharing) {
        await toggleScreenShare();
      }
      await disconnect();
      logEvent('Disconnected from Gemini API');
    } catch (error) {
      logEvent('Disconnect error: ' + (error as Error).message, true);
    }
  };

  const startAudioRecording = async () => {
    try {
      if (!connected) {
        logEvent('Cannot start recording: WebSocket not connected', true);
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });

      mediaRecorderRef.current = mediaRecorder;
      setIsStreaming(true);

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && connected && isStreaming) {
          try {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64Audio = (reader.result as string).split(',')[1];
              client?.send([{
                inlineData: {
                  mimeType: 'audio/webm',
                  data: base64Audio
                }
              }]);
            };
            reader.readAsDataURL(event.data);
          } catch (error) {
            logEvent('Error sending audio data: ' + (error as Error).message, true);
          }
        }
      };

      mediaRecorder.start(1000);
      logEvent('Started audio recording');
    } catch (error) {
      logEvent('Error starting audio recording: ' + (error as Error).message, true);
      setIsStreaming(false);
    }
  };

  const stopAudioRecording = () => {
    try {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        mediaRecorderRef.current = null;
      }
      setIsStreaming(false);
      logEvent('Stopped audio recording');
    } catch (error) {
      logEvent('Error stopping audio recording: ' + (error as Error).message, true);
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (isScreenSharing) {
        if (screenShareRef.current?.srcObject) {
          const tracks = (screenShareRef.current.srcObject as MediaStream).getTracks();
          tracks.forEach(track => track.stop());
          screenShareRef.current.srcObject = null;
        }
        setIsScreenSharing(false);
        logEvent('Screen sharing stopped');
      } else {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false
        });

        if (screenShareRef.current) {
          screenShareRef.current.srcObject = stream;
        }

        stream.getVideoTracks()[0].onended = () => {
          setIsScreenSharing(false);
          logEvent('Screen sharing stopped');
        };

        setIsScreenSharing(true);
        logEvent('Screen sharing started');
      }
    } catch (error) {
      logEvent('Error toggling screen share: ' + (error as Error).message, true);
      setIsScreenSharing(false);
    }
  };

  const toggleWebcam = async () => {
    try {
      if (isWebcamOn) {
        if (videoRef.current?.srcObject) {
          const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
          tracks.forEach(track => track.stop());
          videoRef.current.srcObject = null;
        }
        setIsWebcamOn(false);
        logEvent('Camera turned off');
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        setIsWebcamOn(true);
        logEvent('Camera turned on');
      }
    } catch (error) {
      logEvent('Error toggling webcam: ' + (error as Error).message, true);
      setIsWebcamOn(false);
    }
  };

  const logEvent = (message: string, isError = false) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.innerHTML = `<span class="timestamp">[${timestamp}]</span> ${message}`;
    if (isError) logEntry.className = 'error';
    const eventLog = document.querySelector('.event-log');
    if (eventLog) {
      eventLog.appendChild(logEntry);
      eventLog.scrollTop = eventLog.scrollHeight;
    }
  };

  return (
    <div className="gemini-ui">
      <div className="grid-bg"></div>
      <div className="main-display">
        <div className="visualization">
          <div id="viewport"></div>
          <div className="molecule-controls">
            <button className="molecule-btn">
              <i className="fas fa-arrows-rotate"></i>
            </button>
            <button className="molecule-btn">
              <i className="fas fa-expand"></i>
            </button>
          </div>
        </div>
        <div className="response-area"></div>
      </div>

      <div className="controls-panel">
        <div className="status">
          <div className={`status-indicator ${connected ? 'status-connected' : ''}`}></div>
          {connected ? 'Connected' : 'Disconnected'}
        </div>

        <div className="input-group">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type your message..."
            rows={4}
          />
          <button
            className="btn btn-icon"
            onClick={() => client?.send([{ text: inputText }])}
            disabled={!connected || !inputText.trim()}
          >
            <i className="fas fa-paper-plane"></i>
          </button>
        </div>

        <div className="event-log"></div>
      </div>

      <div 
        ref={mediaControlsRef}
        className={cn("media-controls", { dragging: mediaIsDragging })}
        style={{
          position: 'fixed',
          transform: `translate(${mediaPosition.x}px, ${mediaPosition.y}px)`,
          cursor: mediaIsDragging ? 'grabbing' : 'grab',
          left: 'auto',
          bottom: 'auto'
        }}
      >
        <button
          className={`control-btn ${isStreaming ? 'active' : ''}`}
          onClick={isStreaming ? stopAudioRecording : startAudioRecording}
          disabled={!connected}
          title={isStreaming ? 'Turn off microphone' : 'Turn on microphone'}
        >
          <i className={`fas fa-${isStreaming ? 'microphone' : 'microphone-slash'}`}></i>
        </button>
        <button
          className={`control-btn ${modelAudioEnabled ? 'active' : ''}`}
          onClick={() => setModelAudioEnabled(!modelAudioEnabled)}
          disabled={!connected}
          title={modelAudioEnabled ? 'Mute model voice' : 'Unmute model voice'}
        >
          <i className={`fas fa-${modelAudioEnabled ? 'volume-up' : 'volume-mute'}`}></i>
        </button>
        <button
          className={`control-btn ${isScreenSharing ? 'active' : ''}`}
          onClick={toggleScreenShare}
          disabled={!connected}
          title={isScreenSharing ? 'Stop screen sharing' : 'Share screen'}
        >
          <i className="fas fa-desktop"></i>
        </button>
        <button
          className={`control-btn ${isWebcamOn ? 'active' : ''}`}
          onClick={toggleWebcam}
          disabled={!connected}
          title={isWebcamOn ? 'Turn off camera' : 'Turn on camera'}
        >
          <i className={`fas fa-${isWebcamOn ? 'video' : 'video-slash'}`}></i>
        </button>
        <button
          className="control-btn"
          onClick={() => client?.send([{ text: '' }], false)}
          disabled={!connected}
          title="Generate"
        >
          <i className="fas fa-play"></i>
        </button>
      </div>

      <video 
        ref={screenShareRef} 
        style={{ display: 'none' }} 
        autoPlay 
        muted 
      />
      <video 
        ref={videoRef} 
        style={{ display: 'none' }} 
        autoPlay 
        muted
      />
    </div>
  );
};
