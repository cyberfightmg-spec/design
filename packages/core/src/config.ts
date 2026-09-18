import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';
import type { VideoConfig, GeometryConfig } from './types.js';

// Load .env from project root (2 levels up from packages/core)
dotenvConfig({ path: resolve(process.cwd(), '.env') });

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const env = {
  telegramBotToken: () => requireEnv('TELEGRAM_BOT_TOKEN'),
  imageProvider: optionalEnv('IMAGE_PROVIDER', 'chatgpt-browser') as 'chatgpt-browser' | 'openai-api',
  chatgptBrowserProfile: optionalEnv('CHATGPT_BROWSER_PROFILE', './data/chatgpt-profile'),
  browserHeadless: optionalEnv('BROWSER_HEADLESS', 'true') === 'true',
  voiceMode: optionalEnv('VOICE_MODE', 'free') as 'free' | 'fish-api',
  voiceName: optionalEnv('VOICE_NAME', 'ru-RU-DmitryNeural'),
  fishMode: optionalEnv('FISH_MODE', 'api') as 'api' | 'browser',
  fishApiKey: () => optionalEnv('FISH_API_KEY', ''),
  fishVoiceId: () => optionalEnv('FISH_VOICE_ID', 'yuri-dud'),
  fishApiBaseUrl: optionalEnv('FISH_API_BASE_URL', 'https://api.fish.audio/v1'),
  geometryGuardianMode: optionalEnv('GEOMETRY_GUARDIAN_MODE', 'basic') as 'basic' | 'advanced',
  geometryGuardianUrl: optionalEnv('GEOMETRY_GUARDIAN_URL', 'http://localhost:8001'),
  maxGeometryRetries: parseInt(optionalEnv('MAX_GEOMETRY_RETRIES', '3'), 10),
  videoWidth: parseInt(optionalEnv('VIDEO_WIDTH', '1080'), 10),
  videoHeight: parseInt(optionalEnv('VIDEO_HEIGHT', '1920'), 10),
  videoFps: parseInt(optionalEnv('VIDEO_FPS', '30'), 10),
  bgmEnabled: optionalEnv('BGM_ENABLED', 'false') === 'true',
  compareMode: optionalEnv('COMPARE_MODE', 'false') === 'true',
  logLevel: optionalEnv('LOG_LEVEL', 'info'),
  storagePath: optionalEnv('STORAGE_PATH', './storage'),
} as const;

// Load JSON config files
import { readFileSync } from 'fs';

function loadJsonConfig<T>(relativePath: string): T {
  const fullPath = resolve(process.cwd(), relativePath);
  return JSON.parse(readFileSync(fullPath, 'utf-8')) as T;
}

export function getVideoConfig(): VideoConfig {
  return loadJsonConfig<VideoConfig>('config/video.json');
}

export function getGeometryConfig(): GeometryConfig {
  return loadJsonConfig<GeometryConfig>('config/geometry.json');
}
