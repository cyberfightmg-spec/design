import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, mkdirSync, existsSync, copyFileSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { tmpdir } from 'os';
import {
  getVideoConfig,
  getFinalVideoPath,
  getRenderDir,
  env,
  logger,
  type Storyboard,
  type StoryboardScene,
} from '@interior/core';

const execFileAsync = promisify(execFile);

export async function renderVideo(
  storyboard: Storyboard,
  outputPathOverride?: string,
  locale: string = 'ru'
): Promise<string> {
  const config = getVideoConfig();
  const { projectId, scenes, width, height, fps } = storyboard;
  const log = logger;

  log.info('Starting FFmpeg render', { projectId, locale, sceneCount: scenes.length });

  const renderDir = getRenderDir(projectId);
  mkdirSync(renderDir, { recursive: true });

  const fontPath = resolve('assets', 'fonts', 'Oks-Free-0013.otf');
  const hasFontFile = existsSync(fontPath);
  if (!hasFontFile) {
    log.warn('Oks Free font not found — text overlay will use fallback font', { fontPath });
  }

  // Step 1: Create individual scene clips
  const clipPaths: string[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const clipPath = join(renderDir, `clip-${locale}-${String(i).padStart(2, '0')}.mp4`);
    await renderScene(scene, clipPath, { width, height, fps, fontPath: hasFontFile ? fontPath : null, config });
    clipPaths.push(clipPath);
    log.info(`Scene ${i + 1}/${scenes.length} rendered`, { locale, type: scene.type });
  }

  // Step 2: Check for outro video from video/ folder (rus.mp4 for ru, eng.mp4 for en)
  const outroFileName = locale === 'ru' ? 'rus.mp4' : 'eng.mp4';
  const outroSourcePath = resolve('video', outroFileName);
  let finalClipPaths = [...clipPaths];

  if (existsSync(outroSourcePath)) {
    log.info('Found outro video, normalizing and appending', { locale, outroSourcePath });
    const normalizedOutroPath = join(renderDir, `outro_${locale}.mp4`);
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', outroSourcePath,
      '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
      '-c:v', config.outputCodec,
      '-preset', 'fast',
      '-crf', String(config.outputCrf),
      '-pix_fmt', 'yuv420p',
      '-r', String(fps),
      '-c:a', config.outputAudioCodec,
      '-ar', '44100',
      '-ac', '2',
      normalizedOutroPath,
    ]);
    finalClipPaths.push(normalizedOutroPath);
  }

  // Concatenate all clips with smooth xfade transitions between scenes
  const outputPath = outputPathOverride || getFinalVideoPath(projectId, locale);
  const rawConcatPath = join(renderDir, `raw_${locale}.mp4`);
  const transitionDur = 0.35; // 350ms smooth dissolve transition

  try {
    log.info('Applying smooth xfade transitions between scenes', { locale, count: finalClipPaths.length, transitionDur });

    // Build FFmpeg xfade filter complex
    const inputArgs: string[] = [];
    for (const p of finalClipPaths) {
      inputArgs.push('-i', p);
    }

    // Get durations of each clip
    const durations = scenes.map(s => s.durationSec);
    if (finalClipPaths.length > scenes.length) {
      // Outro duration
      durations.push(6.04);
    }

    const filterParts: string[] = [];
    let currentV = '[0:v]';
    let currentA = '[0:a]';
    let offset = durations[0] - transitionDur;

    for (let i = 1; i < finalClipPaths.length; i++) {
      const nextV = `[${i}:v]`;
      const nextA = `[${i}:a]`;
      const outV = i < finalClipPaths.length - 1 ? `[v${i}]` : '[v_out]';
      const outA = i < finalClipPaths.length - 1 ? `[a${i}]` : '[a_out]';

      filterParts.push(`${currentV}${nextV}xfade=transition=fade:duration=${transitionDur}:offset=${offset.toFixed(2)}${outV}`);
      filterParts.push(`${currentA}${nextA}acrossfade=d=${transitionDur}${outA}`);

      currentV = outV;
      currentA = outA;
      offset += durations[i] - transitionDur;
    }

    const filterComplex = filterParts.join(';');

    await execFileAsync('ffmpeg', [
      '-y',
      ...inputArgs,
      '-filter_complex', filterComplex,
      '-map', '[v_out]',
      '-map', '[a_out]',
      '-c:v', config.outputCodec,
      '-c:a', config.outputAudioCodec,
      '-preset', config.outputPreset,
      '-crf', String(config.outputCrf),
      '-pix_fmt', 'yuv420p',
      '-movflags', config.outputMovflags,
      '-r', String(fps),
      rawConcatPath,
    ]);
  } catch (err) {
    log.warn('xfade transitions failed, falling back to clean cut concat', { error: String(err) });
    const concatListPath = join(renderDir, `concat_${locale}.txt`);
    const concatContent = finalClipPaths.map(p => `file '${p}'`).join('\n');
    writeFileSync(concatListPath, concatContent, 'utf-8');

    await execFileAsync('ffmpeg', [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-c:v', config.outputCodec,
      '-c:a', config.outputAudioCodec,
      '-preset', config.outputPreset,
      '-crf', String(config.outputCrf),
      '-pix_fmt', 'yuv420p',
      '-movflags', config.outputMovflags,
      '-r', String(fps),
      rawConcatPath,
    ]);
  }

  // Step 3: Mix background music if enabled
  const bgmFile = config.bgmFile ? resolve(config.bgmFile) : resolve('assets', 'audio', 'relax-bgm.mp3');
  const hasBgm = (config.bgmEnabled || env.bgmEnabled) && existsSync(bgmFile);

  if (hasBgm) {
    const bgmVolume = config.bgmVolume || 0.25;
    const voiceVolume = config.voiceVolume || 1.0;
    log.info('Mixing background music into final video', { locale, bgmFile, bgmVolume, voiceVolume });

    await execFileAsync('ffmpeg', [
      '-y',
      '-i', rawConcatPath,
      '-stream_loop', '-1',
      '-i', bgmFile,
      '-filter_complex',
      `[0:a]volume=${voiceVolume}[v_a];[1:a]volume=${bgmVolume}[bgm_a];[v_a][bgm_a]amix=inputs=2:duration=first:normalize=0[a]`,
      '-map', '0:v',
      '-map', '[a]',
      '-c:v', 'copy',
      '-c:a', config.outputAudioCodec,
      '-b:a', '192k',
      '-movflags', config.outputMovflags,
      outputPath,
    ]);
  } else {
    copyFileSync(rawConcatPath, outputPath);
  }

  log.info('FFmpeg render complete', { projectId, locale, outputPath, withBgm: hasBgm });
  return outputPath;
}

interface SceneRenderOptions {
  width: number;
  height: number;
  fps: number;
  fontPath: string | null;
  config: ReturnType<typeof getVideoConfig>;
}

async function renderScene(
  scene: StoryboardScene,
  outputPath: string,
  opts: SceneRenderOptions
): Promise<void> {
  const { width, height, fps, config } = opts;
  const durationSec = scene.durationSec;
  const bgColor = config.backgroundFill.replace('#', '');

  // Generate subtitle badge image: large bold text for intro, #4AC890 oval badge for styles
  const badgeScriptPath = resolve('apps', 'renderer', 'src', 'render-badge.py');
  const badgeImgPath = outputPath.replace('.mp4', '_badge.png');
  await execFileAsync('python3', [
    badgeScriptPath,
    scene.text,
    String(width),
    String(height),
    badgeImgPath,
    scene.type,
  ]);

  // Scale image to contain in canvas (no crop, no transform)
  const scaleFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=${bgColor}`;

  // Netflix-style animated title appearance:
  // Starts with gentle fade-in (0.35s) at st=0.2s, stays crisp, and smoothly fades out before the transition
  const fadeInDur = 0.35;
  const fadeOutDur = 0.35;
  const fadeStart = 0.2;
  const fadeOutStart = Math.max(fadeStart + fadeInDur, durationSec - fadeOutDur - 0.1);
  const badgeAnimFilter = `fade=t=in:st=${fadeStart}:d=${fadeInDur}:alpha=1,fade=t=out:st=${fadeOutStart.toFixed(2)}:d=${fadeOutDur}:alpha=1`;

  const args = [
    '-y',
    // Image input (looped for duration)
    '-loop', '1',
    '-t', String(durationSec),
    '-i', scene.image,
    // Subtitle badge
    '-loop', '1',
    '-t', String(durationSec),
    '-i', badgeImgPath,
    // Audio input
    '-i', scene.voice,
    // Filter chain: video scale & overlay animated badge, audio silence padding up to exact durationSec
    '-filter_complex',
    `[0:v]${scaleFilter}[base];[1:v]${badgeAnimFilter}[animated_badge];[base][animated_badge]overlay=0:0[v];[2:a]apad=whole_dur=${durationSec}[a]`,
    '-map', '[v]',
    '-map', '[a]',
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-preset', 'fast',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-t', String(durationSec),
    '-r', String(fps),
    outputPath,
  ];

  await execFileAsync('ffmpeg', args);
}

function escapeFfmpegText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "'\\''")
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}
