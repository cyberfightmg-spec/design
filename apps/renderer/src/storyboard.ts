import { resolve } from 'path';
import {
  getVideoConfig,
  getProject,
  getProjectStyles,
  getLatestGenerationForStyle,
  getSourceImagePath,
  getFinalImagePath,
  getAudioPath,
  getIntroAudioPath,
  saveStoryboard,
  logger,
  type Storyboard,
  type StoryboardScene,
} from '@interior/core';
import { getStyleById, getStyleTextByLocale } from '@interior/styles';
import { generateIntroAudio, generateStyleAudio, getAudioDuration } from '@interior/voice';

export async function buildStoryboard(
  projectId: string,
  locale: 'ru' | 'en' = 'ru'
): Promise<Storyboard> {
  const config = getVideoConfig();
  const project = getProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);

  const projectStyles = getProjectStyles(projectId);
  const scenes: StoryboardScene[] = [];

  // Dynamic variations for intro question (all focused on choosing a style)
  const RU_INTRO_VARIATIONS = [
    { voice: 'Какой стиль ты выберешь?', display: 'КАКОЙ СТИЛЬ\nТЫ ВЫБЕРЕШЬ?' },
    { voice: 'Какой стиль выберешь ты?', display: 'КАКОЙ СТИЛЬ\nВЫБЕРЕШЬ ТЫ?' },
    { voice: 'Какой стиль интерьера выберешь?', display: 'КАКОЙ СТИЛЬ\nИНТЕРЬЕРА\nВЫБЕРЕШЬ?' },
    { voice: 'Какой стиль подходит лучше?', display: 'КАКОЙ СТИЛЬ\nПОДХОДИТ ЛУЧШЕ?' },
    { voice: 'Какой стиль интерьера ты выберешь?', display: 'КАКОЙ СТИЛЬ\nИНТЕРЬЕРА\nТЫ ВЫБЕРЕШЬ?' },
    { voice: 'Выбери свой идеальный стиль.', display: 'ВЫБЕРИ СВОЙ\nИДЕАЛЬНЫЙ СТИЛЬ' },
  ];

  const EN_INTRO_VARIATIONS = [
    { voice: 'Which style do you choose?', display: 'WHICH STYLE\nDO YOU CHOOSE?' },
    { voice: 'Which interior style do you choose?', display: 'WHICH INTERIOR\nSTYLE DO YOU\nCHOOSE?' },
    { voice: 'What style would you pick?', display: 'WHAT STYLE\nWOULD YOU PICK?' },
    { voice: 'Which style fits best?', display: 'WHICH STYLE\nFITS BEST?' },
    { voice: 'Choose your favorite style.', display: 'CHOOSE YOUR\nFAVORITE STYLE' },
  ];

  // Pick variation deterministically based on projectId (or random)
  const variations = locale === 'en' ? EN_INTRO_VARIATIONS : RU_INTRO_VARIATIONS;
  const hash = projectId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const selectedIntro = variations[hash % variations.length];

  // Generate intro audio
  logger.info('Generating intro audio', { projectId, locale, voiceText: selectedIntro.voice });
  const introAudioPath = getIntroAudioPath(projectId, locale);
  const introAudio = await generateIntroAudio(introAudioPath, locale, selectedIntro.voice);
  const introDurationSec = introAudio.durationSec ?? config.introDurationSec;

  // Intro scene
  scenes.push({
    type: 'intro',
    image: getSourceImagePath(projectId),
    text: selectedIntro.display,
    voice: introAudioPath,
    durationSec: Math.max(config.introDurationSec, introDurationSec + config.voicePaddingSec),
  });

  // Style scenes
  for (const ps of projectStyles) {
    const gen = getLatestGenerationForStyle(projectId, ps.style_id);
    if (!gen || gen.status !== 'PASSED' || !gen.image_path) {
      logger.warn('Skipping style — no passed generation', { projectId, styleId: ps.style_id });
      continue;
    }

    const style = getStyleById(ps.style_id);
    if (!style) continue;

    const localized = getStyleTextByLocale(style, locale);

    // Generate style audio
    const audioPath = getAudioPath(projectId, ps.style_id, locale);
    const styleAudio = await generateStyleAudio(style, audioPath, locale);
    const audioDuration = styleAudio.durationSec ?? config.minStyleDurationSec;

    scenes.push({
      type: 'style',
      styleId: ps.style_id,
      image: gen.image_path,
      text: localized.displayName,
      voice: audioPath,
      durationSec: Math.max(config.minStyleDurationSec, audioDuration + config.voicePaddingSec),
    });
  }

  const totalDurationSec = scenes.reduce((sum, s) => sum + s.durationSec, 0);

  const storyboard: Storyboard = {
    projectId,
    width: config.width,
    height: config.height,
    fps: config.fps,
    cameraMovement: false,
    totalDurationSec,
    scenes,
  };

  saveStoryboard(projectId, storyboard);
  logger.info('Storyboard built', { projectId, locale, sceneCount: scenes.length, totalDurationSec });
  return storyboard;
}
