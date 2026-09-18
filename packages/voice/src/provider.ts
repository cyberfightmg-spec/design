import type { AudioResult } from '@interior/core';

export interface VoiceProvider {
  generate(text: string, outputPath: string, voiceIdOverride?: string): Promise<AudioResult>;
  getAudioDuration(filePath: string): Promise<number>;
}
