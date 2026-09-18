import type { GenerationInput, GenerationResult } from '@interior/core';
import { logger } from '@interior/core';
import type { ImageGenerator } from './interface.js';

export class OpenAIApiGenerator implements ImageGenerator {
  async generate(input: GenerationInput): Promise<GenerationResult> {
    logger.warn('OpenAI API generator not yet implemented', { styleId: input.styleId });
    return { success: false, error: 'OpenAI API provider not implemented yet' };
  }

  async isAvailable(): Promise<boolean> {
    return false;
  }
}
