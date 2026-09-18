import { type Page, type Download } from 'playwright';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { pipeline } from 'stream/promises';
import { resolve, dirname } from 'path';
import { env, logger, type GenerationInput, type GenerationResult } from '@interior/core';
import type { ImageGenerator } from '@interior/image-provider';
import { openFreshPage, checkAuthStatus, saveDebugSnapshot } from './browser.js';
import { findElement, findElementRequired, SELECTORS } from './selectors.js';

const CHATGPT_URL = 'https://chatgpt.com';
const GENERATION_TIMEOUT_MS = 180_000; // 3 minutes
const POLL_INTERVAL_MS = 2_000;

export class ChatGPTBrowserGenerator implements ImageGenerator {
  async isAvailable(): Promise<boolean> {
    const page = await openFreshPage();
    try {
      const status = await checkAuthStatus(page);
      return status === 'authenticated';
    } finally {
      await page.close();
    }
  }

  async generate(input: GenerationInput): Promise<GenerationResult> {
    const log = logger;
    const { projectId, styleId, attempt, originalImagePath, prompt } = input;

    log.info('Starting ChatGPT generation', { projectId, styleId, attempt });

    const page = await openFreshPage();

    try {
      // Navigate to ChatGPT — retry on ERR_ABORTED (Chrome startup race)
      let navOk = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await page.goto(CHATGPT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
          navOk = true;
          break;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes('ERR_ABORTED') || msg.includes('ERR_CONNECTION')) {
            log.warn('Navigation aborted, retrying...', { attempt });
            await page.waitForTimeout(3000);
          } else {
            throw e;
          }
        }
      }
      if (!navOk) throw new Error('Failed to navigate to ChatGPT after retries');
      await page.waitForTimeout(2000);

      // Check auth
      const authStatus = await checkAuthStatus(page);
      if (authStatus === 'requires_login') {
        return { success: false, error: 'AUTH_REQUIRED', requiresAuth: true };
      }

      // Start new chat to avoid context bleed
      await this.startNewChat(page, projectId);

      // Upload image
      await this.uploadImage(page, originalImagePath, projectId);

      // Type prompt
      await this.typePrompt(page, prompt, projectId);

      // Submit
      await this.submitPrompt(page, projectId);

      // Wait for generation
      const imageUrl = await this.waitForGeneratedImage(page, projectId);
      if (!imageUrl) {
        await saveDebugSnapshot(page, 'generation-timeout', projectId);
        return { success: false, error: 'Generation timed out — no image appeared' };
      }

      // Download the generated image
      const savedPath = await this.downloadGeneratedImage(page, imageUrl, input);
      if (!savedPath) {
        return { success: false, error: 'Failed to download generated image' };
      }

      log.info('Generation complete', { projectId, styleId, attempt, savedPath });
      return { success: true, imagePath: savedPath };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.error('Generation failed', { projectId, styleId, attempt, error });
      await saveDebugSnapshot(page, 'generation-error', projectId);

      if (error.includes('AUTH_REQUIRED') || error.includes('Log in')) {
        return { success: false, error: 'AUTH_REQUIRED', requiresAuth: true };
      }
      return { success: false, error };
    } finally {
      await page.close();
    }
  }

  private async startNewChat(page: Page, projectId: string): Promise<void> {
    // Always navigate to root — this creates a fresh chat and avoids sidebar click issues
    await page.goto(CHATGPT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Wait for the prompt textarea to be ready
    await page.waitForSelector('[data-testid="prompt-textarea"], #prompt-textarea, div[contenteditable="true"][role="textbox"]', {
      state: 'visible',
      timeout: 20000,
    });
    await page.waitForTimeout(1000);
  }

  private async uploadImage(page: Page, imagePath: string, projectId: string): Promise<void> {
    if (!existsSync(imagePath)) {
      throw new Error(`Source image not found: ${imagePath}`);
    }

    // Try to find file input directly or via attach button
    let fileInput = await page.$('input[type="file"]');

    if (!fileInput) {
      const attachBtn = await findElement(page, 'attachButton', { timeout: 10000 });
      if (!attachBtn) {
        await saveDebugSnapshot(page, 'no-attach-button', projectId);
        throw new Error('Cannot find file attachment button');
      }
      await attachBtn.click();
      await page.waitForTimeout(500);
      fileInput = await page.$('input[type="file"]');
    }

    if (!fileInput) throw new Error('Cannot find file input');

    await fileInput.setInputFiles(imagePath);
    await page.waitForTimeout(2000);
    logger.debug('Image uploaded', { imagePath, projectId });
  }

  private async typePrompt(page: Page, prompt: string, projectId: string): Promise<void> {
    const input = await findElement(page, 'promptInput', { timeout: 10000 });
    if (!input) {
      await saveDebugSnapshot(page, 'no-prompt-input', projectId);
      throw new Error('Cannot find prompt input');
    }
    await input.click();
    await page.waitForTimeout(300);
    // Type in chunks to avoid issues
    await page.keyboard.type(prompt, { delay: 5 });
    await page.waitForTimeout(500);
  }

  private async submitPrompt(page: Page, projectId: string): Promise<void> {
    const sendBtn = await findElement(page, 'sendButton', { timeout: 5000 });
    if (!sendBtn) {
      // Fallback: press Enter
      await page.keyboard.press('Enter');
    } else {
      await sendBtn.click();
    }
    await page.waitForTimeout(1000);
  }

  private async waitForGeneratedImage(
    page: Page,
    projectId: string
  ): Promise<string | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < GENERATION_TIMEOUT_MS) {
      // Check for errors first
      for (const sel of SELECTORS.errorMessages) {
        const errEl = await page.$(sel);
        if (errEl && await errEl.isVisible()) {
          const errText = await errEl.textContent();
          throw new Error(`ChatGPT error: ${errText}`);
        }
      }

      // Check if generation complete
      for (const sel of SELECTORS.generatedImage) {
        const img = await page.$(sel);
        if (img && await img.isVisible()) {
          const src = await img.getAttribute('src');
          if (src && src.startsWith('http')) return src;
        }
      }

      await page.waitForTimeout(POLL_INTERVAL_MS);
    }

    return null;
  }

  private async downloadGeneratedImage(
    page: Page,
    imageUrl: string,
    input: GenerationInput
  ): Promise<string | null> {
    const { projectId, styleId, attempt } = input;

    // Try native download button first
    try {
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
      const dlBtn = await findElement(page, 'downloadButton', { timeout: 5000 });
      if (dlBtn) {
        await dlBtn.click();
        const download: Download = await downloadPromise;
        const outputPath = resolve(
          'storage', 'projects', projectId,
          'generated', styleId,
          `attempt-${String(attempt).padStart(2, '0')}.png`
        );
        mkdirSync(dirname(outputPath), { recursive: true });
        await download.saveAs(outputPath);
        logger.info('Image downloaded via button', { outputPath });
        return outputPath;
      }
    } catch (err) {
      logger.warn('Download button failed, falling back to fetch', { error: String(err) });
    }

    // Fallback: fetch the image URL directly
    try {
      const cookies = await page.context().cookies();
      const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

      const response = await fetch(imageUrl, {
        headers: { Cookie: cookieHeader },
      });
      if (!response.ok || !response.body) throw new Error('Fetch failed');

      const outputPath = resolve(
        'storage', 'projects', projectId,
        'generated', styleId,
        `attempt-${String(attempt).padStart(2, '0')}.png`
      );
      mkdirSync(dirname(outputPath), { recursive: true });
      const writer = createWriteStream(outputPath);
      // @ts-ignore
      await pipeline(response.body, writer);
      logger.info('Image downloaded via fetch', { outputPath });
      return outputPath;
    } catch (err) {
      logger.error('Image download failed', { error: String(err) });
      return null;
    }
  }
}
