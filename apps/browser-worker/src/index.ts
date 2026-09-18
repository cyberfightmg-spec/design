import { logger, generationQueue, getPendingGenerations, updateGenerationStatus } from '@interior/core';
import { processGenerationJob } from './worker.js';

async function main() {
  logger.info('Browser Worker starting...');

  // Resume any interrupted jobs on startup
  const stuck = getPendingGenerations();
  if (stuck.length > 0) {
    logger.info('Resuming stuck generations from previous run', { count: stuck.length });
    for (const gen of stuck) {
      if (gen.status === 'UPLOADING' || gen.status === 'GENERATING' || gen.status === 'DOWNLOADING') {
        // Reset to PENDING so they re-run
        updateGenerationStatus(gen.id, 'PENDING');
      }
    }
  }

  generationQueue.setHandler(processGenerationJob);
  generationQueue.start();

  const shutdown = async () => {
    logger.info('Stopping browser worker...');
    generationQueue.stop();
    const { closeBrowser } = await import('./browser.js');
    await closeBrowser();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  logger.info('Browser Worker ready. Processing generation queue...');
}

main().catch((err) => {
  logger.error('Browser Worker fatal error', { error: String(err) });
  process.exit(1);
});
