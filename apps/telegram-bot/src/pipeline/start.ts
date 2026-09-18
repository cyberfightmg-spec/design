import { v4 as uuidv4 } from 'uuid';
import type { BotContext } from '../types.js';
import {
  logger,
  addProjectStyles,
  createGeneration,
  updateProjectStatus,
  updateProjectProgressMessage,
  ensureStyleDirs,
  getSourceImagePath,
} from '@interior/core';
import { getStyleById, buildStylePromptProfile } from '@interior/styles';
import { buildMasterPrompt } from '../prompts/master.js';

export async function startGeneration(
  ctx: BotContext,
  projectId: string,
  styleIds: string[]
): Promise<void> {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  if (!userId || !chatId) return;

  const log = logger;
    // Send immediate confirmation that work started
    await ctx.reply(
      '🚀 *Принял задачу в работу!*\n\n📸 Фото получено, стили выбраны (' + styleIds.length + ').\n⏳ Начинаю генерацию видео...',
      { parse_mode: 'Markdown' }
    );


  try {
    // Save style selection
    addProjectStyles(projectId, styleIds);
    updateProjectStatus(projectId, 'GENERATING');

    ctx.session.state = 'processing';

    // Send progress message
    const progressMsg = await ctx.reply(
      buildProgressText(projectId, styleIds, [], null)
    );
    updateProjectProgressMessage(projectId, progressMsg.message_id);

    // Create generation jobs
    for (const styleId of styleIds) {
      const style = getStyleById(styleId);
      if (!style) continue;

      ensureStyleDirs(projectId, styleId);

      const genId = uuidv4();
      const prompt = buildMasterPrompt(style);

      createGeneration({
        id: genId,
        projectId,
        styleId,
        attempt: 1,
        prompt,
      });

      log.info('Generation job created', { projectId, styleId, genId });
    }

    log.info('All generation jobs queued', { projectId, styleCount: styleIds.length });
  } catch (err) {
    log.error('Failed to start generation', { projectId, error: String(err) });
    await ctx.reply('❌ Ошибка при запуске генерации. Попробуйте ещё раз.');
  }
}

export function buildProgressText(
  projectId: string,
  allStyleIds: string[],
  completedStyleIds: string[],
  currentStyleId: string | null
): string {
  const lines: string[] = [
    `🏗 Проект #${projectId.slice(0, 8)}`,
    '',
    `Стилей выбрано: ${allStyleIds.length}`,
    '',
    'Генерация:',
    `${completedStyleIds.length} / ${allStyleIds.length}`,
    '',
  ];

  for (const styleId of allStyleIds) {
    const style = getStyleById(styleId);
    const name = style?.displayName ?? styleId.toUpperCase();
    const isDone = completedStyleIds.includes(styleId);
    const isCurrent = styleId === currentStyleId;
    if (isDone) {
      lines.push(`✅ ${name}`);
    } else if (isCurrent) {
      lines.push(`⏳ ${name}`);
    } else {
      lines.push(`⬜ ${name}`);
    }
  }

  if (currentStyleId) {
    const style = getStyleById(currentStyleId);
    lines.push('', `Сейчас: ${style?.displayName ?? currentStyleId}`);
  }

  return lines.join('\n');
}
