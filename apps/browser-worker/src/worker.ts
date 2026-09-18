import {
  logger,
  createContextLogger,
  getDb,
  updateGenerationStatus,
  getProject,
  getProjectStyles,
  saveQaResult,
  getLatestGenerationForStyle,
  createGeneration,
  updateProjectStatus,
  generationQueue,
  getSourceImagePath,
  getAttemptImagePath,
  getFinalImagePath,
  ensureStyleDirs,
  env,
  type DbGeneration,
} from '@interior/core';
import { ChatGPTBrowserGenerator } from './chatgpt-generator.js';
import { checkGeometry } from './qa.js';
import { randomUUID } from 'node:crypto';
import { copyFileSync } from 'fs';
import { getStyleById, buildStylePromptProfile, buildRetryPrompt } from '@interior/styles';

const generator = new ChatGPTBrowserGenerator();

export async function processGenerationJob(generation: DbGeneration): Promise<void> {
  const log = createContextLogger({
    projectId: generation.project_id,
    styleId: generation.style_id,
    jobId: generation.id,
    attempt: generation.attempt,
  });

  const project = getProject(generation.project_id);
  if (!project) {
    log.error('Project not found');
    updateGenerationStatus(generation.id, 'FAILED', { error: 'Project not found' });
    return;
  }

  const style = getStyleById(generation.style_id);
  if (!style) {
    log.error('Style not found');
    updateGenerationStatus(generation.id, 'FAILED', { error: 'Style not found' });
    return;
  }

  const originalImagePath = getSourceImagePath(generation.project_id);

  // State: UPLOADING
  updateGenerationStatus(generation.id, 'UPLOADING');

  // Generate
  updateGenerationStatus(generation.id, 'GENERATING');
  const result = await generator.generate({
    projectId: generation.project_id,
    styleId: generation.style_id,
    attempt: generation.attempt,
    originalImagePath,
    prompt: generation.prompt ?? '',
    isRetry: generation.attempt > 1,
  });

  if (!result.success) {
    if (result.requiresAuth) {
      log.warn('AUTH_REQUIRED — stopping worker');
      updateGenerationStatus(generation.id, 'FAILED', { error: 'AUTH_REQUIRED' });
      // Stop the queue
      generationQueue.stop();
      return;
    }

    log.error('Generation failed', { error: result.error });
    await handleGenerationFailure(generation, result.error ?? 'Unknown error', log);
    return;
  }

  // State: DOWNLOADING (image already downloaded by generator)
  updateGenerationStatus(generation.id, 'DOWNLOADING', { imagePath: result.imagePath });

  // State: QA
  updateGenerationStatus(generation.id, 'QA');
  const geoScore = await checkGeometry(
    originalImagePath,
    result.imagePath!,
    generation.project_id,
    generation.style_id
  );

  saveQaResult({
    generationId: generation.id,
    passed: geoScore.passed,
    score: geoScore.score,
    cameraScore: geoScore.camera.score,
    linesScore: geoScore.structuralLines.score,
    windowsScore: geoScore.windows.score,
    doorsScore: geoScore.doors.score,
    warnings: geoScore.warnings,
  });

  if (geoScore.passed) {
    // Copy to final
    const finalPath = getFinalImagePath(generation.project_id, generation.style_id);
    copyFileSync(result.imagePath!, finalPath);

    updateGenerationStatus(generation.id, 'PASSED', {
      imagePath: finalPath,
      geometryScore: geoScore.score,
      geometryReport: JSON.stringify(geoScore),
    });
    log.info('Generation PASSED QA', { score: geoScore.score });

    // Check if all styles are done
    await checkProjectCompletion(generation.project_id);
  } else {
    log.warn('Generation FAILED QA', { score: geoScore.score, warnings: geoScore.warnings });
    await handleGeometryFailure(generation, geoScore.score, style, log);
  }
}

async function handleGenerationFailure(
  generation: DbGeneration,
  error: string,
  log: ReturnType<typeof createContextLogger>
): Promise<void> {
  const maxRetries = env.maxGeometryRetries;
  if (generation.attempt < maxRetries) {
    scheduleRetry(generation, log);
  } else {
    updateGenerationStatus(generation.id, 'FAILED', { error });
    log.error('Max retries reached — FAILED');
  }
}

async function handleGeometryFailure(
  generation: DbGeneration,
  score: number,
  style: ReturnType<typeof getStyleById>,
  log: ReturnType<typeof createContextLogger>
): Promise<void> {
  updateGenerationStatus(generation.id, 'FAILED', {
    geometryScore: score,
    error: `Geometry QA failed: score=${score}`,
  });

  const maxRetries = env.maxGeometryRetries;
  if (generation.attempt < maxRetries) {
    scheduleRetry(generation, log);
  } else {
    log.warn('Max geometry retries reached', { styleId: generation.style_id });
    // Mark as NEEDS_REVIEW
    updateGenerationStatus(generation.id, 'NEEDS_REVIEW');
  }
}

function scheduleRetry(
  generation: DbGeneration,
  log: ReturnType<typeof createContextLogger>
): void {
  const nextAttempt = generation.attempt + 1;
  log.info('Scheduling retry', { nextAttempt });

  const style = getStyleById(generation.style_id);
  if (!style) return;

  // Build corrective prompt
  const retryPrompt = buildRetryPrompt(style, nextAttempt);

  ensureStyleDirs(generation.project_id, generation.style_id);

  createGeneration({
    id: randomUUID(),
    projectId: generation.project_id,
    styleId: generation.style_id,
    attempt: nextAttempt,
    prompt: retryPrompt,
  });
}

async function checkProjectCompletion(projectId: string): Promise<void> {
  const db = getDb();
  const projectStyles = getProjectStyles(projectId);
  const allPassed = projectStyles.every(ps => {
    const gen = getLatestGenerationForStyle(projectId, ps.style_id);
    return gen?.status === 'PASSED';
  });

  if (allPassed) {
    logger.info('All styles completed — moving to VOICE phase', { projectId });
    updateProjectStatus(projectId, 'VOICE');
    // Voice + render will be triggered by a separate watcher
  }
}

