export interface LiveConfig {
  model?: string;
  generation_config?: {
    response_modalities?: string[] | string;
    speech_config?: {
      voice_config?: {
        prebuilt_voice_config?: {
          voice_name?: string;
        };
      };
    };
  };
  audio_in_config?: {
    encoding: string;
    sample_rate_hz: number;
    language_code: string;
  };
} 