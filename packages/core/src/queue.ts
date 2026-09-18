import { getDb } from './db.js';
import { logger } from './logger.js';
import type { DbGeneration } from './types.js';

export type QueueJobHandler = (generation: DbGeneration) => Promise<void>;

interface QueueOptions {
  concurrency?: number;
  pollIntervalMs?: number;
}

export class GenerationQueue {
  private readonly concurrency: number;
  private readonly pollIntervalMs: number;
  private running = 0;
  private handler: QueueJobHandler | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: QueueOptions = {}) {
    this.concurrency = options.concurrency ?? 1;
    this.pollIntervalMs = options.pollIntervalMs ?? 3000;
  }

  setHandler(handler: QueueJobHandler): void {
    this.handler = handler;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.poll(), this.pollIntervalMs);
    logger.info('Generation queue started', { concurrency: this.concurrency });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll(): Promise<void> {
    if (this.running >= this.concurrency || !this.handler) return;

    const db = getDb();
    const job = db.prepare(`
      SELECT * FROM generations
      WHERE status IN ('PENDING', 'RETRYING')
      ORDER BY created_at ASC
      LIMIT 1
    `).get() as DbGeneration | undefined;

    if (!job) return;

    // Claim the job atomically
    const result = db.prepare(`
      UPDATE generations SET status = 'UPLOADING', started_at = datetime('now')
      WHERE id = ? AND status IN ('PENDING', 'RETRYING')
    `).run(job.id);

    if (result.changes === 0) return; // Another process claimed it

    this.running++;
    logger.info('Processing generation job', { jobId: job.id, styleId: job.style_id, attempt: job.attempt });

    try {
      await this.handler(job);
    } catch (err) {
      logger.error('Unhandled error in generation job', {
        jobId: job.id,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.running--;
    }
  }
}

export const generationQueue = new GenerationQueue({ concurrency: 1 });
