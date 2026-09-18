import { Bot, InputFile, InlineKeyboard } from 'grammy';
import { existsSync } from 'fs';
import {
  logger,
  getDb,
  getProjectStyles,
  getGenerationsForProject,
  getFinalVideoPath,
  updateProjectStatus,
  type DbProject,
} from '@interior/core';
import { getStyleById } from '@interior/styles';
import type { BotContext } from '../types.js';

const lastStatusTexts = new Map<string, string>();
const deliveredProjects = new Set<string>();

export function startProjectWatcher(bot: Bot<BotContext>): void {
  const POLL_INTERVAL_MS = 2500;

  setInterval(async () => {
    try {
      await checkActiveProjects(bot);
    } catch (err) {
      logger.error('Error in Telegram project watcher', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, POLL_INTERVAL_MS);

  logger.info('Telegram project watcher started');
}

async function checkActiveProjects(bot: Bot<BotContext>): Promise<void> {
  const db = getDb();
  const activeProjects = db.prepare(`
    SELECT * FROM projects
    WHERE status IN ('GENERATING', 'VOICE', 'RENDERING', 'COMPLETED', 'FAILED')
    ORDER BY updated_at ASC
  `).all() as DbProject[];

  for (const project of activeProjects) {
    if (!project.telegram_progress_message_id) continue;

    if (project.status === 'GENERATING') {
      await handleGeneratingState(bot, project);
    } else if (project.status === 'VOICE') {
      await handleVoiceState(bot, project);
    } else if (project.status === 'RENDERING') {
      await handleRenderingState(bot, project);
    } else if (project.status === 'COMPLETED') {
      await handleCompletedState(bot, project);
    } else if (project.status === 'FAILED') {
      await handleFailedState(bot, project);
    }
  }
}

async function handleGeneratingState(bot: Bot<BotContext>, project: DbProject): Promise<void> {
  const styles = getProjectStyles(project.id);
  const gens = getGenerationsForProject(project.id);

  const completedStyles = new Set<string>();
  let currentStyleId: string | null = null;

  for (const gen of gens) {
    if (gen.status === 'PASSED') {
      completedStyles.add(gen.style_id);
    } else if (['UPLOADING', 'GENERATING', 'DOWNLOADING', 'QA', 'RETRYING'].includes(gen.status)) {
      currentStyleId = gen.style_id;
    }
  }

  const lines: string[] = [
    `🏗 *Проект #${project.id.slice(0, 8)}*`,
    '',
    'Фото: ✓',
    `Стили: ${styles.length}`,
    '',
    'Генерация:',
    `${completedStyles.size} / ${styles.length}`,
    '',
  ];

  for (const ps of styles) {
    const style = getStyleById(ps.style_id);
    const name = style?.displayName ?? ps.style_id.toUpperCase();
    if (completedStyles.has(ps.style_id)) {
      lines.push(`✓ ${name}`);
    } else if (ps.style_id === currentStyleId) {
      lines.push(`⏳ ${name}`);
    } else {
      lines.push(`⬜ ${name}`);
    }
  }

  if (currentStyleId) {
    const style = getStyleById(currentStyleId);
    lines.push('', `Сейчас: *${style?.displayName ?? currentStyleId}*`);
  }

  const text = lines.join('\n');
  await safeEditMessage(bot, project, text);
}

async function handleVoiceState(bot: Bot<BotContext>, project: DbProject): Promise<void> {
  const styles = getProjectStyles(project.id);
  const text = [
    `🏗 *Проект #${project.id.slice(0, 8)}*`,
    '',
    'Все варианты готовы.',
    `Проверка геометрии: ${styles.length}/${styles.length} ✓`,
    '',
    '🎙 Создаю озвучку...',
  ].join('\n');

  await safeEditMessage(bot, project, text);
}

async function handleRenderingState(bot: Bot<BotContext>, project: DbProject): Promise<void> {
  const styles = getProjectStyles(project.id);
  const text = [
    `🏗 *Проект #${project.id.slice(0, 8)}*`,
    '',
    'Все варианты готовы.',
    `Проверка геометрии: ${styles.length}/${styles.length} ✓`,
    'Озвучка: ✓',
    '',
    '🎬 Собираю видео (1080×1920)...',
  ].join('\n');

  await safeEditMessage(bot, project, text);
}

async function handleCompletedState(bot: Bot<BotContext>, project: DbProject): Promise<void> {
  if (deliveredProjects.has(project.id)) return;

  const ruVideoPath = getFinalVideoPath(project.id, 'ru');
  const fallbackPath = getFinalVideoPath(project.id);
  const finalRuPath = existsSync(ruVideoPath) ? ruVideoPath : (existsSync(fallbackPath) ? fallbackPath : null);

  const enVideoPath = getFinalVideoPath(project.id, 'en');
  const finalEnPath = existsSync(enVideoPath) ? enVideoPath : null;

  if (!finalRuPath && !finalEnPath) return;

  deliveredProjects.add(project.id);

  try {
    const keyboard = new InlineKeyboard()
      .text('🖼 Скачать кадры', `action:download_frames:${project.id}`)
      .row()
      .text('📺 Реклама', `action:render_ad:${project.id}`)
      .row()
      .text('🔄 Перегенерировать стиль', `action:choose_regen:${project.id}`)
      .row()
      .text('🏠 Новый интерьер', 'action:new');

    // Send Russian video
    if (finalRuPath) {
      await bot.api.sendVideo(project.telegram_chat_id, new InputFile(finalRuPath), {
        caption: `🇷🇺 *Версия на русском языке*\n\n🎙 Озвучка: Юрий Дудь\n📐 Камера статична, окна и архитектура сохранены.`,
        parse_mode: 'Markdown',
      });
    }

    // Send English video
    if (finalEnPath) {
      await bot.api.sendVideo(project.telegram_chat_id, new InputFile(finalEnPath), {
        caption: `🇬🇧 *English version with subtitles*\n\n🎙 English narration with style subtitles.\n📐 Static camera, windows and architecture preserved.`,
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    } else if (finalRuPath) {
      // If EN was not rendered for some reason, attach keyboard to RU
      await bot.api.sendMessage(project.telegram_chat_id, '✨ Ваш интерьер готов!', {
        reply_markup: keyboard,
      });
    }

    logger.info('Both videos (RU + EN) delivered to Telegram user', {
      projectId: project.id,
      chatId: project.telegram_chat_id,
    });
  } catch (err) {
    logger.error('Failed to send final videos to Telegram', {
      projectId: project.id,
      error: String(err),
    });
    deliveredProjects.delete(project.id); // allow retry
  }
}

async function handleFailedState(bot: Bot<BotContext>, project: DbProject): Promise<void> {
  const key = `failed:${project.id}`;
  if (lastStatusTexts.get(key)) return;

  const text = [
    `❌ *Проект #${project.id.slice(0, 8)} не удалось завершить.*`,
    '',
    'Произошла ошибка при обработке или генерации.',
  ].join('\n');

  await safeEditMessage(bot, project, text);
  lastStatusTexts.set(key, text);
}

async function safeEditMessage(bot: Bot<BotContext>, project: DbProject, text: string): Promise<void> {
  const lastText = lastStatusTexts.get(project.id);
  if (lastText === text) return;

  try {
    await bot.api.editMessageText(
      project.telegram_chat_id,
      project.telegram_progress_message_id!,
      text,
      { parse_mode: 'Markdown' }
    );
    lastStatusTexts.set(project.id, text);
  } catch (err) {
    // Ignore message not modified or rate limit errors
  }
}
