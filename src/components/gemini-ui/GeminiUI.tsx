import React, { useEffect, useRef, useState } from 'react';
import { useLiveAPIContext } from '../../contexts/LiveAPIContext';
import { LiveConfig } from '../../multimodal-live-types';
import cn from 'classnames';
import { useDraggable } from '../../hooks/use-draggable';
import './GeminiUI.scss';
import { MultimodalLiveClient } from '../../lib/multimodal-live-client';
import { Stage, Selection, Vector3 } from 'ngl';
import { SNPViewer } from '../snp-viewer/SNPViewer';

// Declare the global 3Dmol object
declare global {
  interface Window {
    $3Dmol: any;
  }
}

interface SystemMessage {
  timestamp: string;
  message: string;
  isError?: boolean;
}

interface ModelMessage {
  timestamp: string;
  message: string;
  sender: 'user' | 'model';
}

interface LiveAPIContext {
  client: MultimodalLiveClient | null;
  connected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  setConfig: (config: LiveConfig) => void;
}

interface MoleculeViewer {
  ngl: Stage | null;
  threeDMol: any;
}

interface SNP {
  id: string;
  position: {
    chainId: string;
    resNum: number;
    x: number;
    y: number;
    z: number;
  };
  wildtype: string;
  mutation: string;
  effect: string;
  description?: string;
}

// Add these interfaces near the top with other interfaces
interface ThreeDMolViewer {
  clear: () => void;
  addModel: (data: string, format: string) => void;
  setStyle: (selector: any, style: any) => void;
  addStyle: (selector: any, style: any) => void;
  selectedAtoms: (selector: any) => any[];
  addLabel: (text: string, options: any) => void;
  removeAllLabels: () => void;
  zoomTo: (selector?: any) => void;
  render: () => void;
}

interface ThreeDMolRef extends HTMLDivElement {
  viewer?: ThreeDMolViewer;
}

interface StructureMetadata {
  name: string;
  genus: string;
  family: string;
  organism: string;
  resolution: string;
  method: string;
  authors: string;
  doi: string;
  keywords: string;
  year: string;
  journal: string;
}

interface Position {
  x: number;
  y: number;
}

// Add these interfaces
interface SequenceData {
  dnaSequence: string;
  rnaSequence: string;
  proteinSequence: string;
}

interface ImageCapture {
  grabFrame(): Promise<ImageBitmap>;
}

declare var ImageCapture: {
  prototype: ImageCapture;
  new(track: MediaStreamTrack): ImageCapture;
};

export const GeminiUI: React.FC = () => {
  // Context
  const { client, connected, connect, disconnect, setConfig } = useLiveAPIContext() as LiveAPIContext;

  // States
  const [isStreaming, setIsStreaming] = useState(false);
  const [modelAudioEnabled, setModelAudioEnabled] = useState(true);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [inputText, setInputText] = useState('');
  const [systemMessages, setSystemMessages] = useState<SystemMessage[]>([]);
  const [modelMessages, setModelMessages] = useState<ModelMessage[]>([]);
  const [pdbId, setPdbId] = useState('');
  const [stage, setStage] = useState<any>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const threeDMolRef = useRef<ThreeDMolRef | null>(null);
  const [currentViewer, setCurrentViewer] = useState<'ngl' | '3dmol'>('ngl');
  const [selectedSNP, setSelectedSNP] = useState<string | undefined>();
  const [snps, setSnps] = useState<SNP[]>([]);
  const [structureMetadata, setStructureMetadata] = useState<StructureMetadata | null>(null);
  const [selectedSequenceRegion, setSelectedSequenceRegion] = useState<string | null>(null);

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const screenShareRef = useRef<HTMLVideoElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaControlsRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Helper functions
  const logEvent = (message: string, isError = false, type: 'system' | 'model' = 'system', sender?: 'user' | 'model') => {
    const timestamp = new Date().toLocaleTimeString();
    if (type === 'system') {
      setSystemMessages(prev => [...prev, { timestamp, message, isError }]);
    } else {
      setModelMessages(prev => [...prev, { timestamp, message, sender: sender || 'model' }]);
    }
  };

  // Fix the useEffect syntax
  useEffect(() => {
    // Your existing code
  }, [setConfig, client]); // Remove semicolon

  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isWebcamOn, setIsWebcamOn] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isConnecting, setIsConnecting] = useState(false);

  const { position: mediaPosition, isDragging: mediaIsDragging, snappedEdge, setPosition: setMediaPosition } = useDraggable(
    mediaControlsRef,
    { x: window.innerWidth / 2 - 200, y: window.innerHeight - 100 },
    20
  );

  const [screenSharePosition, setScreenSharePosition] = useState({ x: window.innerWidth - 400, y: 100 });
  const screenShareControlsRef = useRef<HTMLDivElement | null>(null);

  const { position: screenSharePos, isDragging: screenShareIsDragging } = useDraggable(
    screenShareControlsRef,
    screenSharePosition,
    20
  );

  const [selectedCodonIndex, setSelectedCodonIndex] = useState<number | null>(null);
  const viewer3DRef = useRef<any>(null);

  const handleConnect = async () => {
    if (isConnecting) return;
    
    try {
      setIsConnecting(true);
      console.log('Attempting to connect to Gemini API...');
      await connect();
      console.log('Successfully connected to Gemini API');
      logEvent('Connected to Gemini API');
    } catch (error) {
      console.error('Connection error:', error);
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
        logEvent('Cannot start recording: Not connected', true);
        return;
      }

      // Create AudioContext first to get its sample rate
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }

      const audioContext = audioContextRef.current;
      const contextSampleRate = audioContext.sampleRate;

      // Get audio stream matching the AudioContext's sample rate
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
          sampleRate: contextSampleRate,  // Use AudioContext's sample rate
          autoGainControl: true
        }
      });

      const source = audioContext.createMediaStreamSource(stream);
      
      // Create ScriptProcessor for raw audio data
      const processor = audioContext.createScriptProcessor(2048, 1, 1);
      
      processor.onaudioprocess = (e) => {
        if (!isStreaming) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Convert Float32Array to Int16Array for PCM
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = inputData[i] * 32767;
        }
        
        // Convert to Base64
        const base64Audio = arrayBufferToBase64(pcmData.buffer);
        
        // Send to Gemini API
        if (client) {
          client.sendRealtimeInput([{
            mimeType: 'audio/pcm;rate=16000',  // Specify PCM format
            data: base64Audio
          }]);
        }
      };

      // Connect the audio processing pipeline
      source.connect(processor);
      processor.connect(audioContext.destination);
      
      // Store references for cleanup
      mediaStreamRef.current = stream;
      processorRef.current = processor;
      
      setIsStreaming(true);
      logEvent('Started voice input');

    } catch (error) {
      console.error('Error in startAudioRecording:', error);
      logEvent('Error starting voice input: ' + (error as Error).message, true);
      setIsStreaming(false);
    }
  };

  const stopAudioRecording = () => {
    try {
      if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current = null;
      }
      
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
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
          video: {
            frameRate: 30,
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: false
        });

        if (screenShareRef.current) {
          screenShareRef.current.srcObject = stream;
          screenShareRef.current.style.display = 'block';
          
          // Create canvas for frame capture
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          // Set initial canvas size
          canvas.width = 1920;
          canvas.height = 1080;
          
          // For screen share
          let screenFrameId: number | null = null;

          const stopScreenFrame = () => {
            if (screenFrameId !== null) {
              cancelAnimationFrame(screenFrameId);
              screenFrameId = null;
            }
          };

          const sendScreenFrame = () => {
            if (!isScreenSharing || !client || !ctx) {
              stopScreenFrame();
              return;
            }
            
            try {
              const video = screenShareRef.current;
              if (!video) {
                stopScreenFrame();
                return;
              }
              
              if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
              }
              
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const base64Image = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
              client.sendRealtimeInput([{
                mimeType: 'image/jpeg',
                data: base64Image
              }]);
              
              screenFrameId = requestAnimationFrame(sendScreenFrame);
            } catch (error) {
              console.error('Error capturing screen frame:', error);
              stopScreenFrame();
            }
          };

          if (screenShareRef.current) {
            screenShareRef.current.onplay = (ev: Event) => {
              stopScreenFrame();
              sendScreenFrame();
            };
          }

          stream.getVideoTracks()[0].onended = () => {
            setIsScreenSharing(false);
            logEvent('Screen sharing stopped');
          };
        }

        setIsScreenSharing(true);
        logEvent('Screen sharing started');
      }
    } catch (error) {
      logEvent('Error toggling screen share: ' + (error as Error).message, true);
      setIsScreenSharing(false);
    }
  };

  // Add webcam position state and ref
  const [webcamPosition, setWebcamPosition] = useState({ x: 100, y: 100 });
  const webcamControlsRef = useRef<HTMLDivElement | null>(null);

  const { position: webcamPos, isDragging: webcamIsDragging } = useDraggable(
    webcamControlsRef,
    webcamPosition,
    20
  );

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
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: 30
          },
          audio: false
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.style.display = 'block';
          
          // Create canvas for frame capture
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          // Set initial canvas size
          canvas.width = 1280;
          canvas.height = 720;
          
          // For webcam
          let webcamFrameId: number | null = null;

          const stopWebcamFrame = () => {
            if (webcamFrameId !== null) {
              cancelAnimationFrame(webcamFrameId);
              webcamFrameId = null;
            }
          };

          const sendWebcamFrame = () => {
            if (!isWebcamOn || !client || !ctx) {
              stopWebcamFrame();
              return;
            }
            
            try {
              const video = videoRef.current;
              if (!video) {
                stopWebcamFrame();
                return;
              }
              
              if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
              }
              
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const base64Image = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
              client.sendRealtimeInput([{
                mimeType: 'image/jpeg',
                data: base64Image
              }]);
              
              webcamFrameId = requestAnimationFrame(sendWebcamFrame);
            } catch (error) {
              console.error('Error capturing webcam frame:', error);
              stopWebcamFrame();
            }
          };

          if (videoRef.current) {
            videoRef.current.onplay = (ev: Event) => {
              stopWebcamFrame();
              sendWebcamFrame();
            };
          }

          stream.getVideoTracks()[0].onended = () => {
            setIsWebcamOn(false);
            logEvent('Camera turned off');
          };
        }

        setIsWebcamOn(true);
        logEvent('Camera turned on');
      }
    } catch (error) {
      logEvent('Error toggling webcam: ' + (error as Error).message, true);
      setIsWebcamOn(false);
    }
  };

  useEffect(() => {
    console.log('Setting up Gemini config...');
    setConfig({
      model: "models/gemini-2.0-flash-exp",
      generationConfig: {
        responseModalities: "audio" as "audio" | "text",
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: "Puck"
            }
          }
        }
      }
    });
    console.log('Config set, client state:', client ? 'present' : 'null');

    // Attempt to connect automatically
    handleConnect();
  }, [setConfig, client]);

  useEffect(() => {
    if (!client) return;

    const handleAudio = async (audioData: ArrayBuffer) => {
      console.log('Received audio from model:', audioData.byteLength, 'bytes');
      if (!modelAudioEnabled || isProcessingAudio) return;

      try {
        // Stop any currently playing audio
        if (activeSourceRef.current) {
          try {
            activeSourceRef.current.stop();
            activeSourceRef.current.disconnect();
          } catch (e) {
            console.log('Error stopping previous audio:', e);
          }
        }

        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }

        setIsProcessingAudio(true);

        const audioContext = audioContextRef.current;
        const source = audioContext.createBufferSource();
        activeSourceRef.current = source;  // Store reference to current source

        // Rest of your audio setup...
        // ...

        source.onended = () => {
          setIsProcessingAudio(false);
          activeSourceRef.current = null;
          console.log('Finished playing audio response');
        };
      } catch (error) {
        console.error('Audio processing error:', error);
        setIsProcessingAudio(false);
        activeSourceRef.current = null;
      }
    };

    const handleContent = (content: any) => {
      console.log('Received content from model:', content);
      if (content.modelTurn?.parts) {
        content.modelTurn.parts.forEach((part: any) => {
          if (part.text) {
            console.log(`Received: ${part.text}`);
            const responseArea = document.querySelector('.response-area');
            if (responseArea) {
              responseArea.textContent = part.text;
            }

            // Check for protein structure requests
            const pdbMatch = part.text.match(/show (?:protein|structure|pdb) (\w{4})/i);
            if (pdbMatch) {
              const pdbId = pdbMatch[1].toUpperCase();
              handleShowProtein(pdbId);
            }
          }
        });
      }
    };

    client.on('content', handleContent);
    client.on('audio', handleAudio);

    return () => {
      client.off('content', handleContent);
      client.off('audio', handleAudio);
    };
  }, [client, isProcessingAudio]);
  const sendMessage = () => {
    if (connected && inputText?.trim()) {
      client?.send([{ text: inputText }]);
      logEvent(`Sent: ${inputText}`, false, 'model', 'user');
      setInputText('');
    }
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  // Initialize both viewers
  useEffect(() => {
    const initViewers = async () => {
      if (!viewerRef.current) return;

      try {
        // Initialize NGL viewer
        const newStage = new Stage(viewerRef.current, {
          backgroundColor: '#000000',
          quality: 'high',
          impostor: true,
          rotateSpeed: 2.0,
          zoomSpeed: 1.2,
          panSpeed: 1.0,
          lightIntensity: 1.5,
          ambientIntensity: 0.8,
          workerDefault: true,
          sampleLevel: 1
        });
        setStage(newStage);

        // Initialize 3DMol viewer after a short delay to ensure container is ready
        setTimeout(async () => {
          const viewer = await init3DMolViewer();
          if (viewer) {
            viewer3DRef.current = viewer;
            logEvent('3DMol viewer initialized successfully');
          }
        }, 100);
      } catch (error) {
        console.error('Error initializing viewers:', error);
        logEvent('Failed to initialize viewers', true);
      }
    };

    initViewers();

    return () => {
      stage?.dispose();
      if (viewer3DRef.current) {
        viewer3DRef.current.clear();
      }
    };
  }, []);

  // Add this function to check if 3Dmol is loaded
  const ensure3DmolLoaded = (): Promise<void> => {
    return new Promise((resolve) => {
      if (window.$3Dmol) {
        resolve();
      } else {
        // Check every 100ms for up to 5 seconds
        let attempts = 0;
        const interval = setInterval(() => {
          if (window.$3Dmol || attempts > 50) {
            clearInterval(interval);
            resolve();
          }
          attempts++;
        }, 100);
      }
    });
  };

  const init3DMolViewer = async () => {
    console.log('Initializing 3DMol viewer...');
    try {
      // Wait for 3Dmol to be loaded
      await ensure3DmolLoaded();
      
      // Wait for the container to be ready
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const container = document.getElementById('viewer-container');
      if (!container) {
        throw new Error('Viewer container not found');
      }

      // Clear any existing content
      container.innerHTML = '';

      // Create viewer with explicit dimensions
      const config = {
        backgroundColor: 'black',
        antialias: true,
        disableFog: true,
        width: container.clientWidth || 800,
        height: container.clientHeight || 600
      };

      console.log('Creating viewer with config:', config);
      
      // Create viewer and wait for it to be ready
      const viewer = (window as any).$3Dmol.createViewer(container, config);
      if (!viewer) {
        throw new Error('Failed to create 3DMol viewer');
      }

      // Wait for viewer to be fully initialized
      await new Promise(resolve => setTimeout(resolve, 100));

      // Set initial view parameters
      viewer.setBackgroundColor('black');
      viewer.setStyle({}, { cartoon: { color: 'spectrum' } });
      
      // Ensure the viewer is ready before rendering
      try {
        viewer.render();
      } catch (renderError) {
        console.warn('Initial render failed, retrying...', renderError);
        await new Promise(resolve => setTimeout(resolve, 100));
        viewer.render();
      }
      
      viewer3DRef.current = viewer;
      console.log('3DMol viewer initialized successfully');
      return viewer;
    } catch (error) {
      console.error('Error initializing 3DMol viewer:', error);
      logEvent(`Failed to initialize 3DMol viewer: ${(error as Error).message}`, true);
      return null;
    }
  };

  const load3DMolStructure = async (pdbId: string) => {
    try {
      let viewer = threeDMolRef.current?.viewer;
      
      // Initialize viewer if not already initialized
      if (!viewer) {
        viewer = await init3DMolViewer();
        if (!viewer) {
          throw new Error('Failed to initialize 3DMol viewer');
        }
      }

      logEvent(`Loading structure in 3DMol: ${pdbId}`);
      
      // Clear existing structures
      viewer.clear();

      // Fetch PDB data
      const response = await fetch(`https://files.rcsb.org/view/${pdbId}.pdb`);
      if (!response.ok) {
        throw new Error(`Failed to fetch PDB data: ${response.statusText}`);
      }
      const pdbData = await response.text();

      // Load the structure
      viewer.addModel(pdbData, "pdb");
      
      // Add visualizations
      viewer.setStyle({}, {
        cartoon: { color: 'spectrum' }
      });

      // Add hetero atoms
      viewer.addStyle({hetflag: true}, {
        stick: {
          radius: 0.2,
          colorscheme: 'element'
        },
        sphere: {
          radius: 0.5
        }
      });

      // Center and zoom
      viewer.zoomTo();
      
      // Ensure proper render
      viewer.render();

      logEvent(`Successfully loaded structure in 3DMol: ${pdbId}`);
    } catch (error) {
      console.error('Error loading structure in 3DMol:', error);
      logEvent(`Error loading structure in 3DMol ${pdbId}: ${(error as Error).message}`, true);
    }
  };

  const toggleViewer = () => {
    const newViewer = currentViewer === 'ngl' ? '3dmol' : 'ngl';
    setCurrentViewer(newViewer);
    
    if (newViewer === '3dmol') {
      init3DMolViewer();
    } else {
      // Reinitialize NGL viewer
      if (viewerRef.current) {
        viewerRef.current.innerHTML = '';
        const newStage = new Stage(viewerRef.current, {
          backgroundColor: '#1E1B4B',
          quality: 'high',
          impostor: true,
          rotateSpeed: 2.0,
          zoomSpeed: 1.2,
          panSpeed: 1.0,
          lightIntensity: 1.2,
          ambientIntensity: 0.3
        });
        setStage(newStage);
      }
    }
  };

  // Add function to fetch SNP data
  const fetchSNPData = async (pdbId: string) => {
    try {
      // For demo purposes, we'll create some sample SNP data
      // In a real application, this would fetch from a database or API
      const sampleSNPs: SNP[] = [
        {
          id: 'rs1234567',
          position: {
            chainId: 'A',
            resNum: 42,
            x: 0,
            y: 0,
            z: 0
          },
          wildtype: 'GLY',
          mutation: 'ASP',
          effect: 'pathogenic',
          description: 'Associated with increased disease risk'
        },
        {
          id: 'rs7654321',
          position: {
            chainId: 'A',
            resNum: 78,
            x: 0,
            y: 0,
            z: 0
          },
          wildtype: 'ALA',
          mutation: 'VAL',
          effect: 'benign',
          description: 'Common variant with no known clinical significance'
        },
        {
          id: 'rs9876543',
          position: {
            chainId: 'B',
            resNum: 156,
            x: 0,
            y: 0,
            z: 0
          },
          wildtype: 'LYS',
          mutation: 'ARG',
          effect: 'uncertain',
          description: 'Variant of uncertain significance'
        }
      ];

      // Update the positions with actual 3D coordinates
      const updatedSNPs = await updateSNPCoordinates(sampleSNPs);
      setSnps(updatedSNPs);
    } catch (error) {
      console.error('Error fetching SNP data:', error);
      logEvent(`Error fetching SNP data: ${(error as Error).message}`, true);
    }
  };

  // Update SNP coordinates from the structure
  const updateSNPCoordinates = async (snpData: SNP[]): Promise<SNP[]> => {
    if (currentViewer === 'ngl' && stage) {
      const components = stage.getComponentsByName(pdbId);
      if (components.length > 0) {
        const structure = components[0].structure;
        
        return snpData.map(snp => {
          const selection = new Selection(
            `${snp.position.chainId} and ${snp.position.resNum} and .CA`
          );
          const atom = structure.getAtomProxy(selection);
          
          return {
            ...snp,
            position: {
              ...snp.position,
              x: atom.x,
              y: atom.y,
              z: atom.z
            }
          };
        });
      }
    } else if (currentViewer === '3dmol' && threeDMolRef.current?.viewer) {
      // For 3DMol.js, we need to get coordinates from the loaded model
      const atoms = threeDMolRef.current.viewer.selectedAtoms({});
      
      return snpData.map(snp => {
        const atom = atoms.find((a: any) => 
          a.chain === snp.position.chainId && 
          a.resi === snp.position.resNum &&
          a.atom === 'CA'
        );
        
        return {
          ...snp,
          position: {
            ...snp.position,
            x: atom?.x || 0,
            y: atom?.y || 0,
            z: atom?.z || 0
          }
        };
      });
    }
    
    return snpData;
  };

  // Add visualization style options
  const [visualStyle, setVisualStyle] = useState<'cartoon' | 'surface' | 'ball-and-stick' | 'ribbon' | 'wireframe'>('cartoon');
  const [colorScheme, setColorScheme] = useState<'spectrum' | 'chainid' | 'residue' | 'secondary-structure' | 'element'>('spectrum');

  // Function to update visualization style
  const updateVisualizationStyle = (newStyle: typeof visualStyle) => {
    setVisualStyle(newStyle);
    
    // Update NGL viewer
    if (stage) {
      const components = stage.getComponentsByName(pdbId);
      if (components.length > 0) {
        const structure = components[0];
        
        // Remove existing representations
        structure.removeAllRepresentations();
        
        // Add new representation based on style
        switch (newStyle) {
          case 'cartoon':
            structure.addRepresentation('cartoon', {
              quality: 'high',
              colorScheme: colorScheme,
              smoothSheet: true,
              radiusType: 'size',
              aspectRatio: 2.0,
              radiusScale: 0.7
            });
            break;
          case 'surface':
            structure.addRepresentation('surface', {
              colorScheme: colorScheme,
              surfaceType: 'av',
              probeRadius: 1.4,
              opacity: 0.7,
              quality: 'high'
            });
            break;
          case 'ball-and-stick':
            structure.addRepresentation('ball+stick', {
              colorScheme: colorScheme,
              multipleBond: true,
              radiusScale: 0.2,
              aspectRatio: 1.5,
              bondScale: 0.3,
              bondSpacing: 1.0
            });
            break;
          case 'ribbon':
            structure.addRepresentation('ribbon', {
              colorScheme: colorScheme === 'spectrum' ? 'chainindex' : colorScheme,
              opacity: 0.9,
              quality: 'high',
              smoothSheet: true,
              radiusScale: 1.0
            });
            break;
          case 'wireframe':
            structure.addRepresentation('line', {
              colorScheme: colorScheme,
              linewidth: 2,
              opacity: 1.0
            });
            break;
        }

        // Always add hetero atoms representation
        structure.addRepresentation('ball+stick', {
          sele: 'hetero and not water',
          quality: 'high',
          aspectRatio: 1.5,
          multipleBond: true,
          bondScale: 0.3,
          bondSpacing: 1.0,
          colorScheme: 'element'
        });
      }
    }

    // Update 3DMol viewer
    const viewer = threeDMolRef.current?.viewer;
    if (viewer) {
      viewer.clear();
      
      const style: any = {};
      switch (newStyle) {
        case 'cartoon':
          style.cartoon = { color: get3DMolColorScheme(colorScheme) };
          break;
        case 'surface':
          style.surface = { opacity: 0.7, color: get3DMolColorScheme(colorScheme) };
          break;
        case 'ball-and-stick':
          style.stick = { radius: 0.2, color: get3DMolColorScheme(colorScheme) };
          style.sphere = { radius: 0.5 };
          break;
        case 'ribbon':
          style.cartoon = { style: 'ribbon', color: get3DMolColorScheme(colorScheme) };
          break;
        case 'wireframe':
          style.line = { lineWidth: 2, color: get3DMolColorScheme(colorScheme) };
          break;
      }

      viewer.setStyle({}, style);
      viewer.render();
    }
  };

  // Function to update color scheme
  const updateColorScheme = (newScheme: typeof colorScheme) => {
    setColorScheme(newScheme);
    
    // Update NGL viewer
    if (stage) {
      const components = stage.getComponentsByName(pdbId);
      if (components.length > 0) {
        const structure = components[0];
        structure.eachRepresentation((repr: any) => {
          repr.setParameters({ colorScheme: newScheme });
        });
      }
    }

    // Update 3DMol viewer
    const viewer = threeDMolRef.current?.viewer;
    if (viewer) {
      const style = {
        [visualStyle === 'ball-and-stick' ? 'stick' : visualStyle]: {
          color: get3DMolColorScheme(newScheme)
        }
      };
      viewer.setStyle({}, style);
      viewer.render();
    }
  };

  // Helper function to convert color scheme for 3DMol
  const get3DMolColorScheme = (scheme: typeof colorScheme) => {
    switch (scheme) {
      case 'spectrum':
        return 'spectrum';
      case 'chainid':
        return 'chain';
      case 'residue':
        return 'residue';
      case 'secondary-structure':
        return 'ss';
      case 'element':
        return 'element';
      default:
        return 'spectrum';
    }
  };

  // Add state for sequence data
  const [sequenceData, setSequenceData] = useState<SequenceData>({
    dnaSequence: '',
    rnaSequence: '',
    proteinSequence: ''
  });

  // Add sequence conversion functions
  const proteinToDNA = (proteinSequence: string): string => {
    // This is a simplified conversion - in reality, multiple DNA sequences could code for the same protein
    const codonTable: { [key: string]: string } = {
      'F': 'TTT', 'L': 'CTT', 'I': 'ATT', 'M': 'ATG', 'V': 'GTT',
      'S': 'TCT', 'P': 'CCT', 'T': 'ACT', 'A': 'GCT', 'Y': 'TAT',
      'H': 'CAT', 'Q': 'CAA', 'N': 'AAT', 'K': 'AAA', 'D': 'GAT',
      'E': 'GAA', 'C': 'TGT', 'W': 'TGG', 'R': 'CGT', 'G': 'GGT',
      '*': 'TAA'
    };
    
    return proteinSequence.split('').map(aa => codonTable[aa] || 'NNN').join('');
  };

  const dnaToRNA = (dnaSequence: string): string => {
    return dnaSequence.replace(/T/g, 'U');
  };

  // Update fetchSequenceData function
  const fetchSequenceData = async (pdbId: string) => {
    try {
      const response = await fetch('https://data.rcsb.org/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            query GetSequenceData($pdbId: String!) {
              entry(entry_id: $pdbId) {
                polymer_entities {
                  entity_poly {
                    pdbx_seq_one_letter_code
                    rcsb_sample_sequence_length
                  }
                  rcsb_entity_source_organism {
                    rcsb_gene_name {
                      value
                    }
                  }
                }
              }
            }
          `,
          variables: { pdbId: pdbId.toUpperCase() }
        }),
      });

      const data = await response.json();
      
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      const polymerEntity = data.data.entry.polymer_entities[0];
      if (!polymerEntity) {
        throw new Error('No polymer entity found');
      }

      // Get the protein sequence
      const proteinSequence = polymerEntity.entity_poly.pdbx_seq_one_letter_code.replace(/\s/g, '');

      // Generate corresponding DNA and RNA sequences
      const dnaSequence = proteinToDNA(proteinSequence);
      const rnaSequence = dnaToRNA(dnaSequence);

      setSequenceData({
        dnaSequence: dnaSequence,
        rnaSequence: rnaSequence,
        proteinSequence: proteinSequence
      });

      logEvent(`Successfully fetched sequence data for ${pdbId}`);
    } catch (error) {
      console.error('Error fetching sequence data:', error);
      logEvent(`Error fetching sequence data: ${(error as Error).message}`, true);
    }
  };

  // Add this function to fetch metadata from RCSB PDB
  const fetchStructureMetadata = async (pdbId: string) => {
    try {
      const response = await fetch('https://data.rcsb.org/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            query GetStructureMetadata($pdbId: String!) {
              entry(entry_id: $pdbId) {
                struct {
                  title
                }
                exptl {
                  method
                }
                refine {
                  ls_d_res_high
                }
                struct_keywords {
                  pdbx_keywords
                  text
                }
                citation {
                  rcsb_authors
                  title
                  journal_abbrev
                  year
                  pdbx_database_id_DOI
                }
                polymer_entities {
                  rcsb_entity_source_organism {
                    ncbi_scientific_name
                    ncbi_taxonomy_id
                  }
                }
              }
            }
          `,
          variables: { pdbId: pdbId.toUpperCase() }
        }),
      });

      const data = await response.json();
      
      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      const entry = data.data.entry;
      const organism = entry.polymer_entities[0]?.rcsb_entity_source_organism[0];
      const citation = entry.citation[0];
      
      setStructureMetadata({
        name: entry.struct.title,
        method: entry.exptl[0]?.method || 'N/A',
        resolution: entry.refine[0]?.ls_d_res_high ? `${entry.refine[0].ls_d_res_high.toFixed(2)} Å` : 'N/A',
        organism: organism?.ncbi_scientific_name || 'N/A',
        genus: organism?.ncbi_scientific_name?.split(' ')[0] || 'N/A',
        family: entry.struct_keywords?.text || 'N/A',
        authors: citation?.rcsb_authors?.join(', ') || 'N/A',
        doi: citation?.pdbx_database_id_DOI || 'N/A',
        keywords: entry.struct_keywords?.pdbx_keywords || 'N/A',
        year: citation?.year || 'N/A',
        journal: citation?.journal_abbrev || 'N/A'
      });

      logEvent(`Successfully fetched metadata for ${pdbId}`);
    } catch (error) {
      console.error('Error fetching structure metadata:', error);
      logEvent(`Error fetching metadata for ${pdbId}: ${(error as Error).message}`, true);
    }
  };

  // Update the loadPdbStructure function to fetch metadata
  const loadPdbStructure = async (pdbId: string) => {
    setSelectedSNP(undefined);
    setSnps([]);
    setPdbId(pdbId.toUpperCase());

    try {
      // Fetch metadata first
      await fetchStructureMetadata(pdbId);

      // Load in NGL viewer
      if (stage) {
        logEvent(`Loading PDB structure in NGL: ${pdbId}`);
        stage.removeAllComponents();
        
        const structure = await stage.loadFile(`rcsb://${pdbId}`, {
          defaultRepresentation: true,
          ext: 'pdb'
        });

        // Center and zoom the view
        stage.autoView();
        stage.setParameters({
          backgroundColor: 'black'
        });
      }

      // Load in 3DMol viewer
      if (viewer3DRef.current) {
        logEvent(`Loading structure in 3DMol: ${pdbId}`);
        
        // Clear existing content
        viewer3DRef.current.clear();

        // Fetch and load PDB data
        const response = await fetch(`https://files.rcsb.org/view/${pdbId}.pdb`);
        if (!response.ok) {
          throw new Error(`Failed to fetch PDB data: ${response.statusText}`);
        }
        const pdbData = await response.text();

        // Add the model and set style
        viewer3DRef.current.addModel(pdbData, "pdb");
        viewer3DRef.current.setStyle({}, {
          cartoon: { color: 'spectrum' }
        });

        // Add hetero atoms
        viewer3DRef.current.addStyle({hetflag: true}, {
          stick: {
            radius: 0.2,
            colorscheme: 'element'
          }
        });

        // Center and zoom
        viewer3DRef.current.zoomTo();
        
        // Render the changes
        viewer3DRef.current.render();
      }

      logEvent(`Successfully loaded PDB: ${pdbId}`);
      
      // Fetch additional data
      await fetchSNPData(pdbId);
      await fetchSequenceData(pdbId);
        
    } catch (error) {
      console.error('Error loading PDB:', error);
      logEvent(`Error loading PDB ${pdbId}: ${(error as Error).message}`, true);
    }
  };

  // Add this function to handle the model's request to show a protein structure
  const handleShowProtein = async (pdbId: string) => {
    try {
      if (!stage) {
        logEvent('Viewer not initialized', true);
        return;
      }

      // Clear any existing structures
      stage.removeAllComponents();
      
      // Load the structure from RCSB
      const structure = await stage.loadFile(`rcsb://${pdbId}`, {
        defaultRepresentation: false
      });

      // Add standard representations
      structure.addRepresentation('cartoon', {
        colorScheme: 'chainid',
        quality: 'high'
      });

      structure.addRepresentation('ball+stick', {
        sele: 'hetero and not water',
        quality: 'high'
      });

      // Center the view
      stage.autoView();
      logEvent(`Successfully loaded protein structure: ${pdbId}`);
    } catch (error) {
      logEvent(`Failed to load protein structure: ${error}`, true);
    }
  };

  const sendSystemMessage = () => {
    if (connected) {
      client?.send([{ 
        text: "You can display molecular structures by saying 'show pdb XXXX' where XXXX is a valid PDB ID. For example, 'show pdb 1crn' will display the crambin protein structure." 
      }]);
    }
  };

  const tellModelAboutProteinViewer = () => {
    if (connected) {
      client?.send([{ 
        text: `I can show you 3D protein structures from the PDB database. 
        Just ask me to "show protein XXXX" where XXXX is a valid PDB ID. 
        For example:
        - "show protein 1crn" for crambin
        - "show structure 4hhb" for hemoglobin
        - "show pdb 1ubq" for ubiquitin
        I can also explain the structure and help you understand its features.`
      }]);
    }
  };

  // Add function to highlight SNP in NGL viewer
  const highlightSNPInNGL = (snp: SNP) => {
    if (!stage) return;

    // Clear existing highlight
    stage.getRepresentationsByName('highlight').forEach((r: any) => r.dispose());

    // Add highlight representation
    const components = stage.getComponentsByName(pdbId);
    if (components.length > 0) {
      const structure = components[0].structure;
      const selection = new Selection(
        `${snp.position.chainId} and ${snp.position.resNum}`
      );

      structure.addRepresentation('ball+stick', {
        name: 'highlight',
        sele: selection.string,
        quality: 'high',
        aspectRatio: 1.5,
        multipleBond: true,
        bondScale: 0.3,
        bondSpacing: 1.0,
        scale: 2.0,
        color: '#FF00FF'
      });

      // Add label
      structure.addRepresentation('label', {
        name: 'highlight',
        sele: selection.string,
        labelType: 'text',
        labelText: `${snp.wildtype}${snp.position.resNum}${snp.mutation}`,
        color: '#FFFFFF',
        scale: 2.0,
        showBackground: true,
        backgroundColor: '#000000'
      });

      // Center view on the SNP
      const atom = structure.getAtomProxy(selection);
      stage.animationControls.zoomMove(
        new Vector3(atom.x, atom.y, atom.z),
        1000
      );
    }
  };

  // Add function to highlight SNP in 3DMol viewer
  const highlightSNPIn3DMol = (snp: SNP) => {
    const viewer = threeDMolRef.current?.viewer;
    if (!viewer) return;

    // Clear existing styles
    viewer.setStyle({}, {
      cartoon: { color: 'spectrum' },
      stick: { selectedAtoms: "hetero", color: 'element' },
      surface: { opacity: 0.3 }
    });

    // Add highlight style
    viewer.addStyle({
      chain: snp.position.chainId,
      resi: snp.position.resNum
    }, {
      stick: {
        color: 'yellow',
        radius: 0.3
      },
      sphere: {
        color: 'yellow',
        radius: 1.5
      }
    });

    // Add label
    viewer.addLabel(`${snp.wildtype}${snp.position.resNum}${snp.mutation}`, {
      position: { x: snp.position.x, y: snp.position.y, z: snp.position.z },
      backgroundColor: '#000000',
      fontColor: '#ffffff',
      fontSize: 14
    });

    // Center view on the SNP
    viewer.zoomTo({
      chain: snp.position.chainId,
      resi: snp.position.resNum
    });
    viewer.render();
  };

  const handleSNPClick = (snp: SNP) => {
    setSelectedSNP(snp.id);
    if (currentViewer === 'ngl') {
      highlightSNPInNGL(snp);
    } else {
      highlightSNPIn3DMol(snp);
    }
  };

  // Add state for metadata collapse
  const [isMetadataExpanded, setIsMetadataExpanded] = useState(false);

  const renderStructureMetadata = () => {
    if (!structureMetadata) return null;

    return (
      <div className={cn("structure-metadata", { expanded: isMetadataExpanded })}>
        <div 
          className="metadata-header"
          onClick={() => setIsMetadataExpanded(!isMetadataExpanded)}
        >
          <div className="header-content">
            <span className="title">Structure Information</span>
            <div className="summary">
              <span className="key-info">
                <i className="fas fa-cube"></i>
                {pdbId}
              </span>
              <span className="key-info method">
                <i className="fas fa-microscope"></i>
                {structureMetadata.method.split(' ')[0]}
              </span>
              {structureMetadata.resolution !== 'N/A' && (
                <span className="key-info resolution">
                  <i className="fas fa-ruler"></i>
                  {structureMetadata.resolution}
                </span>
              )}
            </div>
          </div>
          <i className={`fas fa-chevron-${isMetadataExpanded ? 'up' : 'down'}`} />
        </div>
        
        {isMetadataExpanded && (
          <div className="metadata-content">
            <div className="metadata-list">
              <div className="metadata-item">
                <span className="label">Name</span>
                <span className="value">{structureMetadata.name}</span>
              </div>
              <div className="metadata-item">
                <span className="label">Organism</span>
                <span className="value">{structureMetadata.organism}</span>
              </div>
              <div className="metadata-item">
                <span className="label">Method</span>
                <span className="value">{structureMetadata.method}</span>
              </div>
              <div className="metadata-item">
                <span className="label">Resolution</span>
                <span className="value">{structureMetadata.resolution}</span>
              </div>
              <div className="metadata-item">
                <span className="label">Keywords</span>
                <span className="value">{structureMetadata.keywords}</span>
              </div>
              <div className="metadata-item">
                <span className="label">Publication</span>
                <span className="value">
                  {structureMetadata.journal} ({structureMetadata.year})
                </span>
              </div>
              <div className="metadata-item">
                <span className="label">Authors</span>
                <span className="value" style={{ fontSize: '11px' }}>
                  {structureMetadata.authors}
                </span>
              </div>
              {structureMetadata.doi && (
                <div className="metadata-item">
                  <span className="label">DOI</span>
                  <a 
                    href={`https://doi.org/${structureMetadata.doi}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="value doi-link"
                  >
                    {structureMetadata.doi}
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Add helper function to chunk sequence into codons
  const chunkIntoCodons = (sequence: string): string[] => {
    const codons: string[] = [];
    for (let i = 0; i < sequence.length; i += 3) {
      codons.push(sequence.slice(i, i + 3));
    }
    return codons;
  };

  const renderSequenceViewer = () => {
    if (!sequenceData) return null;

    const { dnaSequence, rnaSequence, proteinSequence } = sequenceData as SequenceData;
    const dnaCodons = chunkIntoCodons(dnaSequence);
    const rnaCodons = chunkIntoCodons(rnaSequence);

    return (
      <div className="rna-viewer">
        <div className="sequence-title">Structure Information</div>
        <div className="sequence-display">
          <div className="strand">
            <div className="strand-label">DNA Sequence</div>
            <div className="sequence">
              {dnaCodons.map((codon, index) => (
                <div
                  key={`dna-${index}`}
                  className={`codon dna ${selectedCodonIndex === index ? 'highlighted' : ''}`}
                  onClick={() => handleSequenceClick('dna', index, codon)}
                >
                  {codon.split('').map((base, baseIndex) => (
                    <span key={`dna-${index}-${baseIndex}`} className={`base ${base}`}>
                      {base}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="strand">
            <div className="strand-label">RNA Sequence</div>
            <div className="sequence">
              {rnaCodons.map((codon, index) => (
                <div
                  key={`rna-${index}`}
                  className={`codon rna ${selectedCodonIndex === index ? 'highlighted' : ''}`}
                  onClick={() => handleSequenceClick('rna', index, codon)}
                >
                  {codon.split('').map((base, baseIndex) => (
                    <span key={`rna-${index}-${baseIndex}`} className={`base ${base}`}>
                      {base}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="strand">
            <div className="strand-label">Protein Sequence</div>
            <div className="sequence">
              {proteinSequence.split('').map((residue: string, index: number) => (
                <div
                  key={`protein-${index}`}
                  className={`codon ${selectedCodonIndex === index ? 'highlighted' : ''}`}
                  onClick={() => handleSequenceClick('protein', index, residue)}
                >
                  <span className="base">{residue}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Add state for labels toggle and selected residue
  const [showLabels, setShowLabels] = useState(true);
  const [selectedResidue, setSelectedResidue] = useState<number | null>(null);

  const handleSequenceClick = (type: 'dna' | 'rna' | 'protein', index: number, sequence: string) => {
    const viewer3D = viewer3DRef.current;
    if (!viewer3D) return;
    
    try {
      // Calculate the corresponding residue position
      const residuePosition = type === 'protein' ? index + 1 : Math.floor(index / 3) + 1;
      setSelectedCodonIndex(index);
      setSelectedResidue(residuePosition);
      
      // Reset the view to show the whole structure with default style
      viewer3D.setStyle({}, { cartoon: { color: 'spectrum' } });
      viewer3D.removeAllLabels();
      
      // Get atoms for the selected residue
      const atoms = viewer3D.selectedAtoms({ resi: residuePosition });
      if (!atoms || atoms.length === 0) {
        console.error('No atoms found for residue:', residuePosition);
        return;
      }

      // Get the first alpha carbon atom for the residue
      const atom = atoms.find((a: any) => a.atom === 'CA') || atoms[0];
      
      // Highlight the selected residue
      viewer3D.addStyle({ resi: residuePosition }, {
        cartoon: { color: 'magenta' },
        stick: { 
          radius: 0.3,
          color: 'magenta'
        },
        sphere: {
          radius: 0.8,
          color: 'magenta'
        }
      });
      
      // Add label for the selected residue if labels are enabled
      if (showLabels && atom) {
        viewer3D.addLabel(`${atom.resn}${residuePosition}`, {
          position: { x: atom.x, y: atom.y, z: atom.z },
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          fontColor: 'white',
          fontSize: 14,
          borderColor: 'magenta',
          borderThickness: 1.0,
          inFront: true,
          showBackground: true
        });
      }
      
      // First zoom out slightly to provide context
      try {
        viewer3D.zoomTo();
      } catch (error) {
        console.warn('Initial zoom failed, retrying...', error);
      }
      
      // Then zoom to the selected residue with animation
      setTimeout(async () => {
        try {
          viewer3D.zoomTo({ resi: residuePosition }, 1000);
          await new Promise(resolve => setTimeout(resolve, 50));
          viewer3D.render();
        } catch (error) {
          console.error('Error during zoom animation:', error);
        }
      }, 100);
      
    } catch (error) {
      console.error('Error updating structure view:', error);
      logEvent(`Error highlighting residue: ${error}`, true);
    }
  };

  // Update the label toggle button click handler
  const toggleLabels = () => {
    const newShowLabels = !showLabels;
    setShowLabels(newShowLabels);
    
    const viewer3D = viewer3DRef.current;
    if (!viewer3D) return;

    // Clear existing labels
    viewer3D.removeAllLabels();
    
    // If turning labels on and there's a selected residue, show its label
    if (newShowLabels && selectedResidue !== null) {
      const atoms = viewer3D.selectedAtoms({ resi: selectedResidue });
      if (atoms && atoms.length > 0) {
        const atom = atoms.find((a: any) => a.atom === 'CA') || atoms[0];
        viewer3D.addLabel(`${atom.resn}${selectedResidue}`, {
          position: { x: atom.x, y: atom.y, z: atom.z },
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          fontColor: 'white',
          fontSize: 14,
          borderColor: 'magenta',
          borderThickness: 1.0,
          inFront: true,
          showBackground: true
        });
      }
    }
    
    viewer3D.render();
  };

  // Add state for controls expansion
  const [areControlsExpanded, setAreControlsExpanded] = useState(false);

  const [controlsPanelSize, setControlsPanelSize] = useState({ width: 0, height: 0 });
  const controlsPanelRef = useRef<HTMLDivElement>(null);

  // Add this function to handle panel expansion/collapse
  const handlePanelToggle = () => {
    if (controlsPanelRef.current) {
      const rect = controlsPanelRef.current.getBoundingClientRect();
      const currentHeight = rect.height;
      
      // If we're collapsing, adjust the position to keep the panel centered on the cursor
      if (areControlsExpanded) {
        const newHeight = 64; // Approximate height of collapsed panel
        const heightDiff = currentHeight - newHeight;
        setMediaPosition({
          x: mediaPosition.x,
          y: mediaPosition.y + (heightDiff / 2)
        });
      }
    }
    setAreControlsExpanded(!areControlsExpanded);
  };

  return (
    <div className="gemini-ui">
      <div className="main-display">
        <div className="viewers-container">
          <div className="visualization ngl-viewer">
            <div className="snp-variants">
              <div className="header">SNP Variants</div>
              <div className="variants-list">
                {snps.map((snp) => (
                  <div
                    key={snp.id}
                    className={cn('variant-item', { selected: selectedSNP === snp.id })}
                    onClick={() => handleSNPClick(snp)}
                  >
                    <div className="variant-id">{snp.id}</div>
                    <div className="variant-details">
                      <span className="mutation">
                        {snp.wildtype} → {snp.mutation}
                      </span>
                      <div className={cn('effect', snp.effect)}>
                        {snp.effect.charAt(0).toUpperCase() + snp.effect.slice(1)}
                      </div>
                      {snp.description && (
                        <div className="description">{snp.description}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div 
              id="viewport" 
              ref={viewerRef}
              style={{ width: '100%', height: '100%' }}
            />
          </div>
          <div className="visualization threemol-viewer">
            {renderStructureMetadata()}
            <div 
              id="viewer-container"
              style={{ 
                width: '100%', 
                height: '100%', 
                position: 'relative',
                minHeight: '400px',
                backgroundColor: 'black',
                overflow: 'hidden',
                borderRadius: '12px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
              }}
            >
              <div 
                style={{
                  width: '100%',
                  height: '100%',
                  position: 'absolute',
                  top: 0,
                  left: 0
                }}
              />
            </div>
          </div>
        </div>
        {renderSequenceViewer()}
      </div>

      <div className="controls-panel">
        <div className="status">
          <div className={`status-indicator ${connected ? 'status-connected' : ''}`}></div>
          {connected ? 'Connected' : 'Disconnected'}
          <button 
            className="connect-btn"
            onClick={connected ? handleDisconnect : handleConnect}
            disabled={isConnecting}
          >
            {isConnecting ? 'Connecting...' : connected ? 'Disconnect' : 'Connect'}
          </button>
        </div>

        <div className="input-group">
          <textarea
            value={inputText || ''}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputText(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Type your message..."
            rows={4}
          />
          <button
            className="btn btn-icon"
            onClick={sendMessage}
            disabled={!connected || !inputText?.trim()}
          >
            <i className="fas fa-paper-plane"></i>
          </button>
        </div>

        <div className="event-logs">
          <div className="event-log system-log">
            <div className="log-header">System Events</div>
            <div className="log-content">
              {(systemMessages || []).map((msg: SystemMessage, idx: number) => (
                <div key={`sys-${idx}`} className={cn('log-entry', { error: msg.isError })}>
                  <span className="timestamp">[{msg.timestamp}]</span> {msg.message}
                </div>
              ))}
            </div>
          </div>
          
          <div className="event-log model-log">
            <div className="log-header">Model Interactions</div>
            <div className="log-content">
              {(modelMessages || []).map((msg: ModelMessage, idx: number) => (
                <div key={`model-${idx}`} className={cn('log-entry', { 'user-message': msg.sender === 'user' })}>
                  <span className="timestamp">[{msg.timestamp}]</span>
                  <span className="sender">{msg.sender === 'user' ? '👤' : '🤖'}</span>
                  {msg.message}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Floating controls */}
      <div 
        ref={mediaControlsRef}
        className={cn("floating-controls", {
          dragging: mediaIsDragging,
          expanded: areControlsExpanded,
          [`snap-${snappedEdge?.position}`]: snappedEdge !== null
        })}
        style={{
          position: 'fixed',
          transform: `translate(${mediaPosition.x}px, ${mediaPosition.y}px)`,
          cursor: mediaIsDragging ? 'grabbing' : 'grab',
          transition: mediaIsDragging ? 'none' : 'transform 0.3s ease'
        }}
      >
        <button
          className="expand-toggle"
          onClick={handlePanelToggle}
          title={areControlsExpanded ? "Show less" : "Show more"}
          style={{ 
            position: 'absolute',
            top: '-24px',
            right: '12px',
            width: '38px',
            height: '24px',
            borderBottomLeftRadius: '0px',
            borderBottomRightRadius: '0px',
            borderTopLeftRadius: '8px',
            borderTopRightRadius: '8px',
            backgroundColor: '#1e1b4b',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <i className={`fas fa-chevron-${areControlsExpanded ? 'down' : 'up'}`}></i>
        </button>

        <div 
          className="panel-drag-handle"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '24px',
            cursor: 'grab',
            backgroundColor: 'transparent',
            borderTopLeftRadius: '8px',
            borderTopRightRadius: '8px'
          }}
        />

        {/* Media Controls - Always visible */}
        <div className="controls-section media-controls" style={{ marginTop: '5px' }}>
          <button
            className={cn('control-btn', { active: isStreaming })}
            onClick={isStreaming ? stopAudioRecording : startAudioRecording}
            disabled={!connected}
            title={isStreaming ? 'Turn off microphone' : 'Turn on microphone'}
          >
            <i className={`fas fa-${isStreaming ? 'microphone' : 'microphone-slash'}`}></i>
          </button>
          <button
            className={cn('control-btn', { active: modelAudioEnabled })}
            onClick={() => setModelAudioEnabled(!modelAudioEnabled)}
            disabled={!connected}
            title={modelAudioEnabled ? 'Mute model voice' : 'Unmute model voice'}
          >
            <i className={`fas fa-${modelAudioEnabled ? 'volume-up' : 'volume-mute'}`}></i>
          </button>
          <button
            className={cn('control-btn', { active: isScreenSharing })}
            onClick={toggleScreenShare}
            disabled={!connected}
            title={isScreenSharing ? 'Stop screen sharing' : 'Share screen'}
          >
            <i className="fas fa-desktop"></i>
          </button>
          <button
            className={cn('control-btn', { active: isWebcamOn })}
            onClick={toggleWebcam}
            disabled={!connected}
            title={isWebcamOn ? 'Turn off camera' : 'Turn on camera'}
          >
            <i className={`fas fa-${isWebcamOn ? 'video' : 'video-slash'}`}></i>
          </button>
        </div>

        {areControlsExpanded && (
          <>
            <div className="controls-divider" />
            
            <div className="controls-section pdb-controls">
              <div className="pdb-input">
                <input
                  type="text"
                  value={pdbId}
                  onChange={(e) => setPdbId(e.target.value.toUpperCase())}
                  placeholder="PDB ID"
                  maxLength={4}
                />
                <button 
                  className="control-btn"
                  onClick={() => pdbId && loadPdbStructure(pdbId)}
                  title="Load PDB structure"
                >
                  <i className="fas fa-download"></i>
                </button>
              </div>
              <select
                className="style-select"
                value={visualStyle}
                onChange={(e) => updateVisualizationStyle(e.target.value as any)}
                title="Visualization style"
              >
                <option value="cartoon">Cartoon</option>
                <option value="surface">Surface</option>
                <option value="ball-and-stick">Ball & Stick</option>
                <option value="ribbon">Ribbon</option>
                <option value="wireframe">Wireframe</option>
              </select>
              <select
                className="style-select"
                value={colorScheme}
                onChange={(e) => updateColorScheme(e.target.value as any)}
                title="Color scheme"
              >
                <option value="spectrum">Spectrum</option>
                <option value="chainid">Chain</option>
                <option value="residue">Residue</option>
                <option value="secondary-structure">Secondary Structure</option>
                <option value="element">Element</option>
              </select>
              <button 
                className={cn('control-btn', { active: showLabels })}
                onClick={toggleLabels}
                title={showLabels ? 'Hide labels' : 'Show labels'}
              >
                <i className="fas fa-tag"></i>
              </button>
              {/* <button 
                className="control-btn"
                onClick={() => stage?.autoView()}
                title="Reset NGL view"
              >
                <i className="fas fa-arrows-rotate"></i>
              </button>
              <button 
                className="control-btn"
                onClick={() => {
                  const viewer = threeDMolRef.current?.viewer;
                  if (viewer) viewer.zoomTo();
                }}
                title="Reset 3DMol view"
              >
                <i className="fas fa-arrows-rotate"></i>
              </button> */}
              <button 
                className="control-btn"
                onClick={() => stage?.toggleFullscreen()}
                title="Toggle fullscreen"
              >
                <i className="fas fa-expand"></i>
              </button>
            </div>
          </>
        )}
      </div>

      <div 
        ref={screenShareControlsRef}
        className={cn("screen-share-container", { dragging: screenShareIsDragging })}
        style={{
          position: 'fixed',
          transform: `translate(${screenSharePos.x}px, ${screenSharePos.y}px)`,
          display: isScreenSharing ? 'block' : 'none',
          zIndex: 1000,
        }}
      >
        <div className="screen-share-header">
          <span>Screen Share</span>
          <div className="drag-handle" />
        </div>
        <video 
          ref={screenShareRef}
          className="screen-share-video"
          autoPlay
          muted
        />
      </div>

      <video
        ref={videoRef}
        style={{ display: 'none' }}
        autoPlay
        muted
      />

      {/* Add webcam container before the last closing div */}
      <div 
        ref={webcamControlsRef}
        className={cn("webcam-container", { dragging: webcamIsDragging })}
        style={{
          position: 'fixed',
          transform: `translate(${webcamPos.x}px, ${webcamPos.y}px)`,
          display: isWebcamOn ? 'block' : 'none',
          zIndex: 1000,
        }}
      >
        <div className="webcam-header">
          <span>Camera</span>
          <div className="drag-handle" />
        </div>
        <video 
          ref={videoRef}
          className="webcam-video"
          autoPlay
          muted
          playsInline
        />
      </div>
    </div>
  );
};

export default GeminiUI;

