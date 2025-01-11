// import React, { useCallback, useEffect, useState } from 'react';
// import LiveAudioRecorder from '../../components/LiveAudioRecorder/LiveAudioRecorder';
// import { useLiveAPIContext } from '../../contexts/LiveAPIContext';
// import { ServerContent } from '../../multimodal-live-types';

// interface LiveStreamHandlerProps {
//   onModelResponse?: (text: string) => void;
//   onModelAudio?: (audioData: string) => void;
//   onVolumeChange?: (volume: number) => void;
//   isRecording: boolean;
//   onError?: (error: Error) => void;
// }

// export const LiveStreamHandler: React.FC<LiveStreamHandlerProps> = ({
//   onModelResponse,
//   onModelAudio,
//   onVolumeChange,
//   isRecording,
//   onError
// }) => {
//   const { client, connected } = useLiveAPIContext();
//   const [isProcessing, setIsProcessing] = useState(false);

//   // Handle incoming audio data from microphone
//   const handleAudioData = useCallback((audioChunk: { data: string; mimeType: string }) => {
//     if (!connected || !client || isProcessing) return;

//     try {
//       // Send audio chunk to model
//       client.sendRealtimeInput([audioChunk]);
//     } catch (err) {
//       console.error('Error sending audio to model:', err);
//       onError?.(err as Error);
//     }
//   }, [client, connected, isProcessing]);

//   // Set up model response handlers
//   useEffect(() => {
//     if (!client) return;

//     const handleModelContent = (content: ServerContent) => {
//       setIsProcessing(true);
//       try {
//         if ('modelTurn' in content && content.modelTurn?.parts) {
//           content.modelTurn.parts.forEach((part: { text?: string; inlineData?: { mimeType: string; data: string } }) => {
//             // Handle text responses
//             if (part.text) {
//               onModelResponse?.(part.text);
//             }
//             // Handle audio responses
//             if (part.inlineData?.mimeType.startsWith('audio/')) {
//               onModelAudio?.(part.inlineData.data);
//             }
//           });
//         }
//       } catch (err) {
//         console.error('Error processing model response:', err);
//         onError?.(err as Error);
//       } finally {
//         setIsProcessing(false);
//       }
//     };

//     client.on('content', handleModelContent);
    
//     return () => {
//       client.off('content', handleModelContent);
//     };
//   }, [client, onModelResponse, onModelAudio]);

//   return (
//     <LiveAudioRecorder
//       onAudioData={handleAudioData}
//       onVolumeChange={onVolumeChange}
//       isRecording={isRecording}
//     />
//   );
// };

// export default LiveStreamHandler;