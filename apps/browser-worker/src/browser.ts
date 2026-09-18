import { chromium, type BrowserContext, type Page } from 'playwright';
import { resolve, join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { env, logger } from '@interior/core';

const CHATGPT_URL = 'https://chatgpt.com';
const SYSTEM_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let _context: BrowserContext | null = null;

export async function getBrowserContext(): Promise<BrowserContext> {
  if (_context) return _context;

  const profilePath = resolve(env.chatgptBrowserProfile);
  mkdirSync(profilePath, { recursive: true });

  // Kill any running Chrome instances so we get exclusive lock on the profile
  logger.info('Closing any running Chrome instances...');
  try {
    execSync('pkill -9 -f "Google Chrome" 2>/dev/null || true');
    await new Promise(r => setTimeout(r, 2000));
  } catch { /* ignore */ }

  logger.info('Launching Chrome with persistent profile', { profilePath });

  _context = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    executablePath: SYSTEM_CHROME,
    viewport: { width: 1440, height: 900 },
    userAgent: [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      'AppleWebKit/537.36 (KHTML, like Gecko)',
      'Chrome/126.0.0.0 Safari/537.36',
    ].join(' '),
    acceptDownloads: true,
    timeout: 60000,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  logger.info('Chrome launched successfully');
  return _context;
}

export async function closeBrowser(): Promise<void> {
  if (_context) {
    await _context.close().catch(() => {});
    _context = null;
  }
}

export async function openFreshPage(): Promise<Page> {
  const context = await getBrowserContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    // @ts-ignore
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  return page;
}

export async function checkAuthStatus(page: Page): Promise<'authenticated' | 'requires_login'> {
  const { SELECTORS } = await import('./selectors.js');
  await page.goto(CHATGPT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  for (const sel of SELECTORS.loginIndicator) {
    const el = await page.$(sel);
    if (el && await el.isVisible()) {
      logger.warn('ChatGPT session expired — login required');
      return 'requires_login';
    }
  }

  return 'authenticated';
}

export async function saveDebugSnapshot(
  page: Page,
  label: string,
  projectId: string
): Promise<void> {
  try {
    const dir = resolve('storage', 'projects', projectId, 'logs');
    mkdirSync(dir, { recursive: true });
    const ts = Date.now();
    const htmlPath = join(dir, `${label}-${ts}.html`);
    const screenshotPath = join(dir, `${label}-${ts}.png`);
    writeFileSync(htmlPath, await page.content());
    await page.screenshot({ path: screenshotPath, fullPage: true });
    logger.debug('Debug snapshot saved', { screenshotPath });
  } catch (err) {
    logger.warn('Failed to save debug snapshot', { error: String(err) });
  }
}
