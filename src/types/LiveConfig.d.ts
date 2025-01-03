export interface LiveGenerationConfig {
  responseModalities?: string[];
  speechConfig?: {
    voiceConfig?: {
      prebuiltVoiceConfig?: {
        voiceName?: string;
      };
    };
  };
}

export interface LiveConfig {
  model?: string;
  generationConfig?: LiveGenerationConfig;
  audio_in_config?: {
    sampleRateHz?: number;
    encoding?: string;
    bits?: number;
    endian?: "little" | "big";
    layout?: "interleaved";
    channels?: number;
    languageCode?: string;
  };
}