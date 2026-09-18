import type { Bot } from 'grammy';
import type { BotContext } from '../types.js';

export function registerStyleHandler(_bot: Bot<BotContext>): void {
  // Style selection is handled via callback queries in callback.ts
  // This file is reserved for future style-related text commands
}
