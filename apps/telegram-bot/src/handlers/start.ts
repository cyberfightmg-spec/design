import type { Bot } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { upsertUser } from '@interior/core';
import type { BotContext } from '../types.js';

export function registerStartHandler(bot: Bot<BotContext>): void {
  bot.command('start', async (ctx) => {
    const user = ctx.from;
    if (!user) return;

    upsertUser(user.id, user.username);

    ctx.session.state = 'idle';
    ctx.session.projectId = null;
    ctx.session.selectedStyleIds = [];

    const keyboard = new InlineKeyboard()
      .text('🏠 Создать интерьер', 'action:create');

    await ctx.reply(
      '👋 Добро пожаловать в Interior Style Bot!\n\n' +
      'Загрузите фотографию помещения, и я покажу, как оно будет выглядеть в разных стилях интерьера.',
      {
        reply_markup: keyboard,
      }
    );
  });
}
