import { Bot, InputFile, InlineKeyboard } from 'grammy';
import { env, getFinalVideoPath } from '@interior/core';

async function main() {
  const bot = new Bot(env.telegramBotToken());
  const chatId = 5872964535;
  const projectId = 'ce317ecc-42cc-4c49-8a9c-4a8ececc7409';

  const ruPath = getFinalVideoPath(projectId, 'ru');
  const enPath = getFinalVideoPath(projectId, 'en');

  const keyboard = new InlineKeyboard()
    .text('🖼 Скачать кадры', `action:download_frames:${projectId}`)
    .row()
    .text('🔄 Перегенерировать стиль', `action:choose_regen:${projectId}`)
    .row()
    .text('🏠 Новый интерьер', 'action:new');

  console.log('Sending RU video...', ruPath);
  await bot.api.sendVideo(chatId, new InputFile(ruPath), {
    caption: `🇷🇺 *Версия на русском языке*\n\n🎙 Озвучка: Юрий Дудь (ударение: КонтемпорАри)\n⏱ Длительность: 18 сек (по 3 сек на кадр)\n📐 Окна и архитектура сохранены.`,
    parse_mode: 'Markdown',
  });

  console.log('Sending EN video...', enPath);
  await bot.api.sendVideo(chatId, new InputFile(enPath), {
    caption: `🇬🇧 *English version with subtitles*\n\n🎙 English narrator with style subtitles\n⏱ Duration: 18 sec (3 sec per slide)\n📐 Windows and architecture preserved.`,
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });

  console.log('Both videos successfully sent!');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
