import type { GenerationInput, GenerationResult } from '@interior/core';

export interface ImageGenerator {
  generate(input: GenerationInput): Promise<GenerationResult>;
  isAvailable(): Promise<boolean>;
}
