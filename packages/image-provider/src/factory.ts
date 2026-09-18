import { env, logger } from '@interior/core';
import type { ImageGenerator } from './interface.js';

let _generator: ImageGenerator | null = null;

export function registerImageGenerator(generator: ImageGenerator): void {
  _generator = generator;
}

export async function getImageGenerator(): Promise<ImageGenerator> {
  if (_generator) return _generator;

  switch (env.imageProvider) {
    case 'openai-api': {
      const { OpenAIApiGenerator } = await import('./openai-api.js');
      _generator = new OpenAIApiGenerator();
      break;
    }
    default:
      throw new Error(`Image generator for ${env.imageProvider} not registered. Call registerImageGenerator first.`);
  }

  logger.info('Image generator initialized', { provider: env.imageProvider });
  return _generator;
}

