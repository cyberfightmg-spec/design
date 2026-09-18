import { existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { env, logger } from '@interior/core';
import type { VoiceProvider } from './provider.js';
import type { AudioResult } from '@interior/core';

export class AudioCache {
  private readonly voiceId: string;
  private readonly provider: VoiceProvider;

  constructor(voiceId: string, provider: VoiceProvider) {
    this.voiceId = voiceId;
    this.provider = provider;
  }

  private getCachePath(key: string, voiceIdOverride?: string): string {
    const vid = voiceIdOverride || this.voiceId;
    return resolve(env.storagePath, 'audio-cache', vid, `${key}.mp3`);
  }

  async getOrGenerate(key: string, text: string, voiceIdOverride?: string): Promise<AudioResult> {
    const cachePath = this.getCachePath(key, voiceIdOverride);
    const vid = voiceIdOverride || this.voiceId;

    if (existsSync(cachePath)) {
      logger.debug('Audio cache hit', { key, cachePath });
      const durationSec = await this.provider.getAudioDuration(cachePath);
      return { success: true, filePath: cachePath, durationSec, cached: true };
    }

    logger.info('Audio cache miss, generating', { key, text, voiceId: vid });
    mkdirSync(resolve(env.storagePath, 'audio-cache', vid), { recursive: true });
    return this.provider.generate(text, cachePath, voiceIdOverride);
  }

  async warmup(entries: Array<{ key: string; text: string }>): Promise<void> {
    logger.info('Warming up audio cache', { count: entries.length });
    for (const entry of entries) {
      await this.getOrGenerate(entry.key, entry.text);
    }
  }
}
