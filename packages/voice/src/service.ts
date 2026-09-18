import { copyFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { env, logger, type AudioResult } from '@interior/core';
import { FishApiProvider } from './fish-api.js';
import { AudioCache } from './cache.js';
import type { VoiceProvider } from './provider.js';
import { getStyleTextByLocale, type InteriorStyle } from '@interior/styles';
import { FreeTtsProvider } from './free-tts.js';

const INTRO_TEXT_RU = 'Какой стиль ты выберешь?';
const INTRO_TEXT_EN = 'Which style do you choose?';

export const EN_VOICE_ID = '0327fdb5da9e4fd782899a8058c8ae2b'; // Top English Narrator

let _cache: AudioCache | null = null;

function getCache(): AudioCache {
  if (!_cache) {
    const provider = createProvider();
    const cacheKey = env.voiceMode === 'free' ? `free-${env.voiceName}` : env.fishVoiceId();
    _cache = new AudioCache(cacheKey, provider);
  }
  return _cache;
}

function createProvider(): VoiceProvider {
  if (env.voiceMode === 'free') {
    return new FreeTtsProvider();
  }
  if (env.fishMode === 'api') {
    return new FishApiProvider();
  }
  return new FreeTtsProvider();
}

export async function generateIntroAudio(
  outputPath: string,
  locale: 'ru' | 'en' = 'ru',
  customText?: string
): Promise<AudioResult> {
  const isEn = locale === 'en';
  const text = customText || (isEn ? INTRO_TEXT_EN : INTRO_TEXT_RU);
  // Hash or sanitize text for unique cache key
  const safeSlug = text.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_').slice(0, 30);
  const key = isEn ? `intro_en_${safeSlug}` : `intro_ru_${safeSlug}`;
  const voiceOverride = isEn ? EN_VOICE_ID : undefined;

  const result = await getCache().getOrGenerate(key, text, voiceOverride);
  if (result.success && result.filePath && result.filePath !== outputPath) {
    mkdirSync(dirname(outputPath), { recursive: true });
    copyFileSync(result.filePath, outputPath);
    return { ...result, filePath: outputPath };
  }
  return result;
}

export async function generateStyleAudio(
  style: InteriorStyle,
  outputPath: string,
  locale: 'ru' | 'en' = 'ru'
): Promise<AudioResult> {
  const isEn = locale === 'en';
  const localized = getStyleTextByLocale(style, locale);
  const text = localized.voiceText;
  const key = `${style.id}_${locale}`;
  const voiceOverride = isEn ? EN_VOICE_ID : undefined;

  const result = await getCache().getOrGenerate(key, text, voiceOverride);
  if (result.success && result.filePath && result.filePath !== outputPath) {
    mkdirSync(dirname(outputPath), { recursive: true });
    copyFileSync(result.filePath, outputPath);
    return { ...result, filePath: outputPath };
  }
  return result;
}

export async function warmupStyleCache(styles: InteriorStyle[]): Promise<void> {
  const entries = [
    { key: 'intro_ru', text: INTRO_TEXT_RU },
    { key: 'intro_en', text: INTRO_TEXT_EN },
    ...styles.map(s => ({ key: `${s.id}_ru`, text: s.voiceText })),
  ];
  await getCache().warmup(entries);
}

export async function getAudioDuration(filePath: string): Promise<number> {
  return createProvider().getAudioDuration(filePath);
}
