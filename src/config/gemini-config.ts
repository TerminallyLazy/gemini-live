export const GEMINI_CONFIG = {
  url: 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent',
  apiKey: process.env.REACT_APP_GEMINI_API_KEY || '',
  model: 'models/gemini-2.0-flash-exp',
  generation_config: {
    temperature: 0.2,
    topP: 1,
    topK: 1,
    maxOutputTokens: 8192,
    responseModalities: ['AUDIO'],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: 'Kore'
        }
      }
    }
  },
  safety_settings: {
    HARASSMENT: 'BLOCK_NONE',
    HATE_SPEECH: 'BLOCK_NONE',
    SEXUALLY_EXPLICIT: 'BLOCK_NONE',
    DANGEROUS_CONTENT: 'BLOCK_NONE'
  }
}; 