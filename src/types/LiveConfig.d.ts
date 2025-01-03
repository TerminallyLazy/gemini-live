export interface LiveConfig {
  model?: string;
  generationConfig?: {
    responseModalities?: string[] | string;
    speechConfig?: {
      voiceConfig?: {
        prebuiltVoiceConfig?: {
          voiceName?: string;
        };
      };
    };
  };
  audioInConfig?: {
    encoding: string;
    sampleRateHz: number;
    languageCode: string;
  };
}