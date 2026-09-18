// ============================================================
// CHATGPT SELECTORS — centralized
// DOM structure may change. Update here only, not elsewhere.
// ============================================================

export const SELECTORS = {
  // Main chat input
  promptInput: [
    '[data-testid="prompt-textarea"]',
    '#prompt-textarea',
    'div[contenteditable="true"][role="textbox"]',
  ],

  // File/image upload button
  attachButton: [
    '[data-testid="attach-file-button"]',
    'button[aria-label="Attach files"]',
    'label[data-testid="file-upload"]',
    'input[type="file"]',
  ],

  // File input (hidden)
  fileInput: [
    'input[type="file"]',
    'input[accept*="image"]',
  ],

  // Send button
  sendButton: [
    '[data-testid="send-button"]',
    'button[aria-label="Send prompt"]',
    'button[data-testid="fruitjuice-send-button"]',
  ],

  // Image generation area (in response)
  generatedImage: [
    '[data-testid="generated-image"] img',
    '.image-generation-result img',
    'article img[src*="oaiusercontent"]',
    'img[src*="oaiusercontent"]',
  ],

  // Download button for generated image
  downloadButton: [
    'button[aria-label="Download image"]',
    'button[aria-label="Download"]',
    '[data-testid="download-image-button"]',
    'button:has-text("Download")',
  ],

  // Stop generation button
  stopButton: [
    '[data-testid="stop-button"]',
    'button[aria-label="Stop generating"]',
  ],

  // "New chat" button
  newChatButton: [
    '[data-testid="new-chat-button"]',
    'a[href="/"]',
    'button[aria-label="New chat"]',
  ],

  // Error state indicators
  errorMessages: [
    '[data-testid="error-message"]',
    '.error-message',
    'div:has-text("Something went wrong")',
  ],

  // Login page indicator
  loginIndicator: [
    'button:has-text("Log in")',
    'button:has-text("Sign in")',
    '[data-testid="login-button"]',
  ],

  // Generation in progress indicators
  generatingIndicator: [
    '[data-testid="streaming-indicator"]',
    '.result-streaming',
    '[aria-label="ChatGPT is thinking"]',
  ],

  // Response finished indicator
  responseComplete: [
    '[data-testid="copy-turn-action-button"]',
    '.copy-button',
  ],
} as const;

export type SelectorKey = keyof typeof SELECTORS;

// Helper to try selectors in order
export async function findElement(
  page: import('playwright').Page,
  selectorKey: SelectorKey,
  options?: { timeout?: number }
): Promise<import('playwright').ElementHandle | null> {
  const candidates = SELECTORS[selectorKey];
  const timeout = options?.timeout ?? 5000;

  for (const selector of candidates) {
    try {
      const el = await page.waitForSelector(selector, { timeout, state: 'visible' });
      if (el) return el;
    } catch {
      // try next
    }
  }
  return null;
}

export async function findElementRequired(
  page: import('playwright').Page,
  selectorKey: SelectorKey,
  options?: { timeout?: number }
): Promise<import('playwright').ElementHandle> {
  const el = await findElement(page, selectorKey, options);
  if (!el) throw new Error(`Could not find element: ${selectorKey}`);
  return el;
}
