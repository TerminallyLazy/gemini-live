export const GEMINI_CONFIG = {
  url: 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent',
  apiKey: process.env.REACT_APP_GEMINI_API_KEY || 'YOUR_API_KEY',
  model: 'gemini-2.0-pro',
  generation_config: {
    temperature: 0.9,
    topP: 1,
    topK: 1,
    maxOutputTokens: 2048,
  },
  safety_settings: {
    HARASSMENT: 'BLOCK_NONE',
    HATE_SPEECH: 'BLOCK_NONE',
    SEXUALLY_EXPLICIT: 'BLOCK_NONE',
    DANGEROUS_CONTENT: 'BLOCK_NONE'
  }
}; 