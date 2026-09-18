import {
  logger,
  getDb,
  updateProjectStatus,
  type DbProject,
} from '@interior/core';
import { renderProject } from './render-project.js';

export { renderProject } from './render-project.js';
export { buildStoryboard } from './storyboard.js';
export { injectAdIntoVideo } from './render-ad.js';

const POLL_INTERVAL_MS = 3000;
let isRendering = false;

async function checkAndRenderProjects(): Promise<void> {
  if (isRendering) return;

  try {
    const db = getDb();
    const project = db.prepare(`
      SELECT * FROM projects
      WHERE status = 'VOICE'
      ORDER BY updated_at ASC
      LIMIT 1
    `).get() as DbProject | undefined;

    if (!project) return;

    isRendering = true;
    logger.info('Found project ready for rendering', { projectId: project.id });

    await renderProject(project.id);
  } catch (err) {
    logger.error('Error in render worker loop', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    isRendering = false;
  }
}

async function startWorker() {
  logger.info('Renderer worker starting...');
  getDb(); // Ensure DB is initialized

  setInterval(() => {
    void checkAndRenderProjects();
  }, POLL_INTERVAL_MS);

  logger.info('Renderer worker running. Listening for projects in VOICE status...');
}

// Start worker if executed directly
if (process.argv[1]?.includes('renderer')) {
  startWorker().catch((err) => {
    logger.error('Renderer worker fatal error', { error: String(err) });
    process.exit(1);
  });
}

