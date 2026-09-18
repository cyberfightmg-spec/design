import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';
import {
  getFinalVideoPath,
  getRenderDir,
  logger,
} from '@interior/core';

const execFileAsync = promisify(execFile);

/**
 * Injects advertisement video into the center of the Russian video.
 * Pauses the main interior video, blurs the frozen frame for the ad duration (~5.03s),
 * plays the ad with sound in the center of the frame (chroma keyed to remove blue background),
 * then smoothly resumes the interior video.
 */
export async function injectAdIntoVideo(projectId: string): Promise<string> {
  const log = logger;
  const renderDir = getRenderDir(projectId);
  const ruVideoPath = getFinalVideoPath(projectId, 'ru');
  const fallbackRuPath = getFinalVideoPath(projectId);
  const inputVideoPath = existsSync(ruVideoPath) ? ruVideoPath : fallbackRuPath;

  if (!existsSync(inputVideoPath)) {
    throw new Error(`Russian video not found for project ${projectId}`);
  }

  // Find ad video file
  const adCandidates = [
    resolve('video', 'реклама.mp4'),
    resolve('video', 'reklama.mp4'),
    resolve('video', 'ad.mp4'),
  ];
  const adPath = adCandidates.find(p => existsSync(p));
  if (!adPath) {
    throw new Error('Ad video file not found in video/ folder');
  }

  log.info('Starting ad injection into Russian video', { projectId, inputVideoPath, adPath });

  // Get duration of input video
  const { stdout: durOut } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    inputVideoPath,
  ]);
  const totalDur = parseFloat(durOut.trim());
  if (isNaN(totalDur) || totalDur <= 6) {
    throw new Error(`Invalid video duration: ${totalDur}`);
  }

  // Split point at ~midpoint (around 12s, right between scenes)
  const splitPoint = Math.min(12.0, Math.floor(totalDur / 2));

  // Get ad duration
  const { stdout: adDurOut } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    adPath,
  ]);
  const adDur = parseFloat(adDurOut.trim()) || 5.033;

  const part1Path = join(renderDir, 'ad_part1.mp4');
  const adPausePath = join(renderDir, 'ad_pause_segment.mp4');
  const part2Path = join(renderDir, 'ad_part2.mp4');
  const outputAdVideoPath = join(renderDir, 'final_ru_ad.mp4');

  log.info('Ad timing calculated', { splitPoint, adDur, totalDur });

  // 1. Part 1: from 0 to splitPoint
  await execFileAsync('ffmpeg', [
    '-y',
    '-i', inputVideoPath,
    '-t', String(splitPoint),
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-ar', '44100',
    '-ac', '2',
    '-preset', 'fast',
    '-crf', '18',
    part1Path,
  ]);

  // 2. Ad pause segment:
  // - Freeze the frame at splitPoint for adDur
  // - Apply soft background blur
  // - Key out the bright blue background (#0200F3) from the ad video
  // - Scale and center the keyed ad on the vertical 1080x1920 canvas
  // - Use ad's own audio
  await execFileAsync('ffmpeg', [
    '-y',
    '-ss', String(splitPoint),
    '-i', inputVideoPath,
    '-i', adPath,
    '-filter_complex',
    `[0:v]boxblur=luma_radius=15:luma_power=2[bg];[1:v]colorkey=0x0200F3:0.25:0.1,scale=1000:-1[ad];[bg][ad]overlay=(W-w)/2:(H-h)/2[v]`,
    '-map', '[v]',
    '-map', '1:a',
    '-t', String(adDur),
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-ar', '44100',
    '-ac', '2',
    '-preset', 'fast',
    '-crf', '18',
    adPausePath,
  ]);

  // 3. Part 2: from splitPoint to the end
  await execFileAsync('ffmpeg', [
    '-y',
    '-ss', String(splitPoint),
    '-i', inputVideoPath,
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-ar', '44100',
    '-ac', '2',
    '-preset', 'fast',
    '-crf', '18',
    part2Path,
  ]);

  // 4. Concatenate part1 + ad_pause + part2
  const concatListPath = join(renderDir, 'concat_ad.txt');
  writeFileSync(concatListPath, `file '${part1Path}'\nfile '${adPausePath}'\nfile '${part2Path}'\n`, 'utf-8');

  await execFileAsync('ffmpeg', [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatListPath,
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-preset', 'fast',
    '-crf', '18',
    '-movflags', '+faststart',
    outputAdVideoPath,
  ]);

  log.info('Ad injection complete', { projectId, outputAdVideoPath });
  return outputAdVideoPath;
}
