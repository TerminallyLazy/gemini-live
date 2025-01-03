const convertToPCM = (inputData: Float32Array): Int16Array => {
  const pcmData = new Int16Array(inputData.length);
  for (let i = 0; i < inputData.length; i++) {
    // Convert Float32 to Int16
    const s = Math.max(-1, Math.min(1, inputData[i]));
    pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return pcmData;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

self.onmessage = (e) => {
  if (e.data.command === 'convert') {
    const inputData = new Float32Array(e.data.inputData);
    const pcmData = convertToPCM(inputData);
    const base64Audio = arrayBufferToBase64(pcmData.buffer as ArrayBuffer);
    
    self.postMessage({
      command: 'pcm',
      base64Audio
    });
  }
}; 