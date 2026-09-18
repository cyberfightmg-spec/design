import { chromium } from 'playwright';
import { resolve, join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { env, logger } from '@interior/core';
const CHATGPT_URL = 'https://chatgpt.com';
let _browser = null;
let _context = null;
export async function getBrowserContext() {
    if (_context)
        return _context;
    const profilePath = resolve(env.chatgptBrowserProfile);
    mkdirSync(profilePath, { recursive: true });
    logger.info('Launching browser with persistent profile', { profilePath });
    _context = await chromium.launchPersistentContext(profilePath, {
        headless: env.browserHeadless,
        viewport: { width: 1440, height: 900 },
        userAgent: [
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
            'AppleWebKit/537.36 (KHTML, like Gecko)',
            'Chrome/126.0.0.0 Safari/537.36',
        ].join(' '),
        acceptDownloads: true,
        args: [
            '--no-sandbox',
            '--disable-blink-features=AutomationControlled',
        ],
    });
    return _context;
}
export async function closeBrowser() {
    if (_context) {
        await _context.close();
        _context = null;
    }
}
export async function openFreshPage() {
    const context = await getBrowserContext();
    const page = await context.newPage();
    // Suppress automation detection
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    return page;
}
export async function checkAuthStatus(page) {
    const { SELECTORS } = await import('./selectors.js');
    await page.goto(CHATGPT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    // Check if login button is visible
    for (const sel of SELECTORS.loginIndicator) {
        const el = await page.$(sel);
        if (el && await el.isVisible()) {
            logger.warn('ChatGPT session expired — login required');
            return 'requires_login';
        }
    }
    return 'authenticated';
}
export async function saveDebugSnapshot(page, label, projectId) {
    if (process.env.NODE_ENV === 'production')
        return;
    try {
        const dir = resolve('storage', 'projects', projectId, 'logs');
        mkdirSync(dir, { recursive: true });
        const ts = Date.now();
        const htmlPath = join(dir, `${label}-${ts}.html`);
        const screenshotPath = join(dir, `${label}-${ts}.png`);
        writeFileSync(htmlPath, await page.content());
        await page.screenshot({ path: screenshotPath, fullPage: true });
        logger.debug('Debug snapshot saved', { htmlPath, screenshotPath });
    }
    catch (err) {
        logger.warn('Failed to save debug snapshot', { error: String(err) });
    }
}
//# sourceMappingURL=browser.js.map