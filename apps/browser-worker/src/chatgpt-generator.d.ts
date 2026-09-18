import { type GenerationInput, type GenerationResult } from '@interior/core';
import type { ImageGenerator } from '@interior/image-provider';
export declare class ChatGPTBrowserGenerator implements ImageGenerator {
    isAvailable(): Promise<boolean>;
    generate(input: GenerationInput): Promise<GenerationResult>;
    private startNewChat;
    private uploadImage;
    private typePrompt;
    private submitPrompt;
    private waitForGeneratedImage;
    private downloadGeneratedImage;
}
//# sourceMappingURL=chatgpt-generator.d.ts.map