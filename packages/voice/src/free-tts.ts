import { createWriteStream, existsSync, mkdirSync, unlinkSync } from 'fs';
import { resolve, dirname } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { env, logger, type AudioResult } from '@interior/core';
import type { VoiceProvider } from './provider.js';

const execFileAsync = promisify(execFile);

export class FreeTtsProvider implements VoiceProvider {
  private readonly voiceName: string;

  constructor(voiceName?: string) {
    this.voiceName = voiceName || env.voiceName || 'ru-RU-DmitryNeural';
  }

  async generate(text: string, outputPath: string, _voiceIdOverride?: string): Promise<AudioResult> {
    const log = logger;
    mkdirSync(dirname(outputPath), { recursive: true });

    // Method 1: Try edge-tts via python3 CLI
    try {
      log.debug('Trying edge-tts for free voiceover', { text, voice: this.voiceName });
      await execFileAsync('python3', [
        '-m', 'edge_tts',
        '--voice', this.voiceName,
        '--text', text,
        '--write-media', outputPath,
      ]);

      if (existsSync(outputPath)) {
        const durationSec = await this.getAudioDuration(outputPath);
        log.info('Free Edge-TTS generated successfully', { text, outputPath, durationSec });
        return { success: true, filePath: outputPath, durationSec, cached: false };
      }
    } catch (edgeErr) {
      log.debug('edge-tts CLI not found or failed, trying system TTS fallback', {
        error: edgeErr instanceof Error ? edgeErr.message : String(edgeErr),
      });
    }

    // Method 2: macOS built-in `say` command + ffmpeg conversion
    try {
      const aiffPath = outputPath.replace(/\.mp3$/, '.aiff');
      log.debug('Using macOS say fallback', { text, aiffPath });

      // Run say with Russian voice
      await execFileAsync('say', ['-v', 'Milena', text, '-o', aiffPath]);

      // Convert aiff to mp3 via ffmpeg
      await execFileAsync('ffmpeg', [
        '-y',
        '-i', aiffPath,
        '-codec:a', 'libmp3lame',
        '-qscale:a', '2',
        outputPath,
      ]);

      if (existsSync(aiffPath)) {
        try { unlinkSync(aiffPath); } catch {}
      }

      const durationSec = await this.getAudioDuration(outputPath);
      log.info('System TTS generated successfully', { text, outputPath, durationSec });
      return { success: true, filePath: outputPath, durationSec, cached: false };
    } catch (sysErr) {
      const error = sysErr instanceof Error ? sysErr.message : String(sysErr);
      log.error('Free TTS generation failed', { text, error });
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
      return 2.0;
    }
  }
}
