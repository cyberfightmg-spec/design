import { Bot, session } from 'grammy';
import { env, logger, getDb } from '@interior/core';
import { registerStartHandler } from './handlers/start.js';
import { registerPhotoHandler } from './handlers/photo.js';
import { registerStyleHandler } from './handlers/styles.js';
import { registerCallbackHandler } from './handlers/callback.js';
import type { BotContext, SessionData } from './types.js';

async function main() {
  // Initialize DB
  getDb();

  const bot = new Bot<BotContext>(env.telegramBotToken());

  // Session middleware
  bot.use(session({
    initial: (): SessionData => ({
      state: 'idle',
      projectId: null,
      selectedStyleIds: [],
    }),
  }));

  // Register handlers
  registerStartHandler(bot);
  registerPhotoHandler(bot);
  registerStyleHandler(bot);
  registerCallbackHandler(bot);

  // Start background watcher for active projects
  const { startProjectWatcher } = await import('./pipeline/watcher.js');
  startProjectWatcher(bot);

  // Error handler
  bot.catch((err) => {
    logger.error('Bot error', {
      error: err.message,
      ctx: err.ctx?.update?.update_id,
    });
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down bot...');
    await bot.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  logger.info('Starting Interior Style Bot...');
  await bot.start({
    onStart: (info) => {
      logger.info('Bot started', { username: info.username });
    },
  });
}

main().catch((err) => {
  logger.error('Fatal error', { error: String(err) });
  process.exit(1);
});
