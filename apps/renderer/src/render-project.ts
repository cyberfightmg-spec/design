import { randomUUID } from 'node:crypto';
import {
  logger,
  createRender,
  updateRenderStatus,
  updateProjectStatus,
  getStoryboardPath,
  getFinalVideoPath,
  type Storyboard,
} from '@interior/core';
import { buildStoryboard } from './storyboard.js';
import { renderVideo } from './ffmpeg.js';

import { copyFileSync } from 'fs';

export async function renderProject(projectId: string): Promise<{ ru: string; en: string }> {
  const log = logger;
  const renderId = randomUUID();

  createRender(renderId, projectId);
  updateProjectStatus(projectId, 'RENDERING');
  updateRenderStatus(renderId, 'RENDERING');

  try {
    // 1. Render Russian video
    log.info('Building Russian storyboard', { projectId });
    const ruStoryboard = await buildStoryboard(projectId, 'ru');
    const ruVideoPath = getFinalVideoPath(projectId, 'ru');
    await renderVideo(ruStoryboard, ruVideoPath, 'ru');

    // Also copy to default final.mp4 for backward compatibility
    copyFileSync(ruVideoPath, getFinalVideoPath(projectId));

    // 2. Render English video
    log.info('Building English storyboard', { projectId });
    const enStoryboard = await buildStoryboard(projectId, 'en');
    const enVideoPath = getFinalVideoPath(projectId, 'en');
    await renderVideo(enStoryboard, enVideoPath, 'en');

    updateRenderStatus(renderId, 'COMPLETED', {
      storyboardPath: getStoryboardPath(projectId, 'ru'),
      outputPath: ruVideoPath,
      durationSec: ruStoryboard.totalDurationSec,
    });
    updateProjectStatus(projectId, 'COMPLETED');

    log.info('Dual render complete (RU + EN)', { projectId, ruVideoPath, enVideoPath });
    return { ru: ruVideoPath, en: enVideoPath };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.error('Render failed', { projectId, error });
    updateRenderStatus(renderId, 'FAILED', { error });
    updateProjectStatus(projectId, 'FAILED');
    throw err;
  }
}
