import type { Bot } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { BotContext } from '../types.js';
import { buildStyleKeyboard } from '../keyboards/styles.js';

export function registerCallbackHandler(bot: Bot<BotContext>): void {
  // "Create interior" button
  bot.callbackQuery('action:create', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.state = 'waiting_photo';
    ctx.session.selectedStyleIds = [];
    await ctx.reply('📸 Загрузите фотографию помещения (JPG, PNG, WEBP).');
  });

  // "New interior" button (reset)
  bot.callbackQuery('action:new', async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.state = 'waiting_photo';
    ctx.session.projectId = null;
    ctx.session.selectedStyleIds = [];
    await ctx.reply('📸 Загрузите новую фотографию помещения.');
  });

  // Toggle style selection
  bot.callbackQuery(/^style:toggle:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const styleId = ctx.match[1];
    const selected = ctx.session.selectedStyleIds;
    const idx = selected.indexOf(styleId);
    if (idx === -1) {
      selected.push(styleId);
    } else {
      selected.splice(idx, 1);
    }
    // Rebuild keyboard
    const keyboard = buildStyleKeyboard(selected);
    await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
  });

  // Select all
  bot.callbackQuery('style:select_all', async (ctx) => {
    await ctx.answerCallbackQuery('Выбраны все стили');
    const { getAllStyleIds } = await import('@interior/styles');
    ctx.session.selectedStyleIds = getAllStyleIds();
    const keyboard = buildStyleKeyboard(ctx.session.selectedStyleIds);
    await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
  });

  // Clear selection
  bot.callbackQuery('style:clear', async (ctx) => {
    await ctx.answerCallbackQuery('Выбор сброшен');
    ctx.session.selectedStyleIds = [];
    const keyboard = buildStyleKeyboard([]);
    await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
  });

  // Start generation
  bot.callbackQuery('style:generate', async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!ctx.session.projectId) {
      await ctx.reply('❌ Ошибка: проект не найден. Начните заново с /start');
      return;
    }
    if (ctx.session.selectedStyleIds.length === 0) {
      await ctx.answerCallbackQuery({ text: '⚠️ Выберите хотя бы один стиль', show_alert: true });
      return;
    }
    // Trigger generation pipeline
    const { startGeneration } = await import('../pipeline/start.js');
    await startGeneration(ctx, ctx.session.projectId, ctx.session.selectedStyleIds);
  });

  // Download all final frames
  bot.callbackQuery(/^action:download_frames:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery('Отправляю кадры...');
    const projectId = ctx.match[1];
    const { getProjectStyles, getFinalImagePath } = await import('@interior/core');
    const { getStyleById } = await import('@interior/styles');
    const { existsSync } = await import('fs');
    const { InputFile } = await import('grammy');

    const styles = getProjectStyles(projectId);
    let sentCount = 0;

    for (const ps of styles) {
      const imgPath = getFinalImagePath(projectId, ps.style_id);
      if (existsSync(imgPath)) {
        const style = getStyleById(ps.style_id);
        const name = style?.displayName ?? ps.style_id.toUpperCase();
        await ctx.replyWithPhoto(new InputFile(imgPath), {
          caption: `🏛 Стиль: *${name}*`,
          parse_mode: 'Markdown',
        });
        sentCount++;
      }
    }

    if (sentCount === 0) {
      await ctx.reply('Кадры ещё не готовы или отсутствуют.');
    }
  });

  // Render video with advertisement
  bot.callbackQuery(/^action:render_ad:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery('Запуск добавления рекламы...');
    const projectId = ctx.match[1];
    const { InputFile } = await import('grammy');
    const { injectAdIntoVideo } = await import('../../../renderer/dist/render-ad.js');

    const statusMsg = await ctx.reply('⏳ Создаю версию видео с рекламой в центре кадра...');

    try {
      const adVideoPath = await injectAdIntoVideo(projectId);
      await ctx.replyWithVideo(new InputFile(adVideoPath), {
        caption: '📺 *Версия с рекламой Буба VPN в центре кадра*\n\n⏱ Пауза основного видео на 5 сек, блюр фона, оригинальный звук рекламы.',
        parse_mode: 'Markdown',
      });
      await ctx.api.deleteMessage(ctx.chat!.id, statusMsg.message_id).catch(() => {});
    } catch (err) {
      await ctx.reply('❌ Не удалось добавить рекламу: ' + String(err));
    }
  });

  // Choose style to regenerate
  bot.callbackQuery(/^action:choose_regen:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const projectId = ctx.match[1];
    const { getProjectStyles } = await import('@interior/core');
    const { getStyleById } = await import('@interior/styles');

    const styles = getProjectStyles(projectId);
    const keyboard = new InlineKeyboard();

    for (const ps of styles) {
      const style = getStyleById(ps.style_id);
      const name = style?.displayName ?? ps.style_id;
      keyboard.text(`🔄 ${name}`, `action:do_regen:${projectId}:${ps.style_id}`).row();
    }

    await ctx.reply('Выберите стиль для перегенерации:', {
      reply_markup: keyboard,
    });
  });

  // Execute style regeneration
  bot.callbackQuery(/^action:do_regen:(.+):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const projectId = ctx.match[1];
    const styleId = ctx.match[2];

    const {
      getLatestGenerationForStyle,
      createGeneration,
      updateProjectStatus,
      ensureStyleDirs,
    } = await import('@interior/core');
    const { getStyleById, buildMasterPrompt } = await import('@interior/styles');
    const { v4: uuidv4 } = await import('uuid');

    const style = getStyleById(styleId);
    const styleName = style?.displayName ?? styleId;

    const latest = getLatestGenerationForStyle(projectId, styleId);
    const nextAttempt = (latest?.attempt ?? 0) + 1;

    ensureStyleDirs(projectId, styleId);
    const prompt = style ? buildMasterPrompt(style) : '';

    createGeneration({
      id: uuidv4(),
      projectId,
      styleId,
      attempt: nextAttempt,
      prompt,
    });

    updateProjectStatus(projectId, 'GENERATING');

    await ctx.reply(`🔄 Запущена перегенерация стиля *${styleName}* (попытка ${nextAttempt})...`, {
      parse_mode: 'Markdown',
    });
  });
}

