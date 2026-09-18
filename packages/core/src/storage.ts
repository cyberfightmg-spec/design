import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
import { env } from './config.js';

export function getProjectDir(projectId: string): string {
  return resolve(env.storagePath, 'projects', projectId);
}

export function getSourceImagePath(projectId: string): string {
  return join(getProjectDir(projectId), 'source', 'original.jpg');
}

export function getGeneratedImageDir(projectId: string, styleId: string): string {
  return join(getProjectDir(projectId), 'generated', styleId);
}

export function getAttemptImagePath(projectId: string, styleId: string, attempt: number): string {
  return join(getGeneratedImageDir(projectId, styleId), `attempt-${String(attempt).padStart(2, '0')}.png`);
}

export function getFinalImagePath(projectId: string, styleId: string): string {
  return join(getGeneratedImageDir(projectId, styleId), 'final.png');
}

export function getAudioDir(projectId: string): string {
  return join(getProjectDir(projectId), 'audio');
}

export function getAudioPath(projectId: string, styleId: string, locale?: string): string {
  const suffix = locale ? `_${locale}` : '';
  return join(getAudioDir(projectId), `${styleId}${suffix}.mp3`);
}

export function getIntroAudioPath(projectId: string, locale?: string): string {
  const suffix = locale ? `_${locale}` : '';
  return join(getAudioDir(projectId), `intro${suffix}.mp3`);
}

export function getQaDir(projectId: string): string {
  return join(getProjectDir(projectId), 'qa');
}

export function getQaReportPath(projectId: string, styleId: string): string {
  return join(getQaDir(projectId), `${styleId}.json`);
}

export function getQaOverlayPath(projectId: string, styleId: string): string {
  return join(getQaDir(projectId), `overlay-${styleId}.png`);
}

export function getRenderDir(projectId: string): string {
  return join(getProjectDir(projectId), 'render');
}

export function getStoryboardPath(projectId: string, locale?: string): string {
  const suffix = locale ? `_${locale}` : '';
  return join(getRenderDir(projectId), `storyboard${suffix}.json`);
}

export function getFinalVideoPath(projectId: string, locale?: string): string {
  const suffix = locale ? `_${locale}` : '';
  return join(getRenderDir(projectId), `final${suffix}.mp4`);
}

export function getLogsDir(projectId: string): string {
  return join(getProjectDir(projectId), 'logs');
}

export function getAudioCachePath(voiceId: string, styleId: string): string {
  return resolve(env.storagePath, 'audio-cache', voiceId, `${styleId}.mp3`);
}

export function ensureProjectDirs(projectId: string): void {
  const dirs = [
    join(getProjectDir(projectId), 'source'),
    join(getProjectDir(projectId), 'generated'),
    getAudioDir(projectId),
    getQaDir(projectId),
    getRenderDir(projectId),
    getLogsDir(projectId),
  ];
  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }
}

export function ensureStyleDirs(projectId: string, styleId: string): void {
  mkdirSync(getGeneratedImageDir(projectId, styleId), { recursive: true });
}

export function ensureAudioCacheDir(voiceId: string): void {
  mkdirSync(resolve(env.storagePath, 'audio-cache', voiceId), { recursive: true });
}

export function saveStoryboard(projectId: string, storyboard: object): void {
  const path = getStoryboardPath(projectId);
  mkdirSync(getRenderDir(projectId), { recursive: true });
  writeFileSync(path, JSON.stringify(storyboard, null, 2), 'utf-8');
}

export function loadStoryboard(projectId: string): object | null {
  const path = getStoryboardPath(projectId);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as object;
}
