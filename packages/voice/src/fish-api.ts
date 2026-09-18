import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { pipeline } from 'stream/promises';
import { resolve, dirname } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { env, logger, type AudioResult } from '@interior/core';
import type { VoiceProvider } from './provider.js';

const execFileAsync = promisify(execFile);

export class FishApiProvider implements VoiceProvider {
  private readonly apiKey: string;
  private readonly voiceId: string;
  private readonly baseUrl: string;

  constructor() {
    this.apiKey = env.fishApiKey();
    this.voiceId = env.fishVoiceId();
    this.baseUrl = env.fishApiBaseUrl;
  }

  async generate(text: string, outputPath: string, voiceIdOverride?: string): Promise<AudioResult> {
    const log = logger;
    try {
      mkdirSync(dirname(outputPath), { recursive: true });
      const refId = voiceIdOverride || this.voiceId;

      const response = await fetch(`${this.baseUrl}/tts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'model': 's2.1-pro-free',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          reference_id: refId,
          format: 'mp3',
          mp3_bitrate: 128,
          latency: 'balanced',
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Fish API error ${response.status}: ${errText}`);
      }

      if (!response.body) throw new Error('Empty response body');

      const writer = createWriteStream(outputPath);
      // @ts-ignore
      await pipeline(response.body, writer);

      const durationSec = await this.getAudioDuration(outputPath);

      log.info('Fish Audio TTS generated', { text, outputPath, durationSec });
      return { success: true, filePath: outputPath, durationSec, cached: false };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.error('Fish Audio TTS failed', { text, error });
      return { success: false, error };
    }
  }

  async getAudioDuration(filePath: string): Promise<number> {
    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        filePath,
      ]);
      const info = JSON.parse(stdout) as { format: { duration: string } };
      return parseFloat(info.format.duration);
    } catch {
      return 2.0; // fallback duration
    }
  }
}
