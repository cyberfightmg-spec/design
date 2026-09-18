import type { Bot } from 'grammy';
import { createWriteStream, mkdirSync } from 'fs';
import { pipeline } from 'stream/promises';
import { resolve } from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  logger,
  createProject,
  upsertUser,
  ensureProjectDirs,
  getSourceImagePath,
} from '@interior/core';
import { buildStyleKeyboard } from '../keyboards/styles.js';
import { STYLE_CATEGORIES } from '@interior/styles';
import type { BotContext } from '../types.js';

const SUPPORTED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MIN_DIMENSION = 512;

export function registerPhotoHandler(bot: Bot<BotContext>): void {
  bot.on(['message:photo', 'message:document'], async (ctx) => {
    // Auto-accept photo even if user skipped the "Создать интерьер" button
    if (ctx.session.state === 'idle') {
      ctx.session.state = 'waiting_photo';
    }
    if (ctx.session.state !== 'waiting_photo') return;

    const userId = ctx.from?.id;
    if (!userId) return;

    // Accept both compressed photos and documents (for high-quality)
    let fileId: string;
    let fileUniqueId: string;

    if (ctx.message.photo) {
      // Use highest resolution
      const photos = ctx.message.photo;
      const best = photos[photos.length - 1];
      fileId = best.file_id;
      fileUniqueId = best.file_unique_id;
    } else if (ctx.message.document) {
      const doc = ctx.message.document;
      if (!doc.mime_type || !SUPPORTED_MIME.includes(doc.mime_type)) {
        await ctx.reply('❌ Поддерживаются только JPG, PNG, WEBP. Попробуйте ещё раз.');
        return;
      }
      fileId = doc.file_id;
      fileUniqueId = doc.file_unique_id;
    } else {
      return;
    }

    const statusMsg = await ctx.reply('⏳ Сохраняю фотографию...');

    try {
      upsertUser(userId, ctx.from?.username);

      const projectId = uuidv4();
      ensureProjectDirs(projectId);

      const destPath = getSourceImagePath(projectId);
      mkdirSync(resolve(destPath, '..'), { recursive: true });

      // Download file from Telegram
      const file = await ctx.api.getFile(fileId);
      const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

      const response = await fetch(fileUrl);
      if (!response.ok || !response.body) throw new Error('Failed to download photo');

      const writer = createWriteStream(destPath);
      // @ts-ignore
      await pipeline(response.body, writer);

      // Create project in DB
      createProject({
        id: projectId,
        telegramUserId: userId,
        telegramChatId: ctx.chat.id,
        sourceImage: destPath,
      });

      ctx.session.projectId = projectId;
      ctx.session.state = 'selecting_styles';
      ctx.session.selectedStyleIds = [];

      logger.info('Photo saved', { projectId, userId });

      // Show style selection
      const keyboard = buildStyleKeyboard([]);

      await ctx.api.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        '✅ Фото получено!\n\nВыберите стили интерьера:\n\nМожно выбрать несколько или нажать «Выбрать все»',
        { reply_markup: keyboard }
      );
    } catch (err) {
      logger.error('Photo save failed', { error: String(err), userId });
      await ctx.api.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        '❌ Не удалось сохранить фото. Попробуйте ещё раз.'
      );
      ctx.session.state = 'waiting_photo';
    }
  });
}
