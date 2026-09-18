import { chromium } from 'playwright';

async function test() {
  console.log('Connecting to Chrome CDP on 9222...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 15000 });
  console.log('Connected!');
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('chatgpt.com')) || pages[0];
  console.log('Using tab:', await page.title(), page.url());
  
  const textarea = await page.$('#prompt-textarea');
  console.log('Textarea present:', !!textarea);
  
  let fileInput = await page.$('input[type="file"]');
  console.log('Direct file input present:', !!fileInput);

  if (!fileInput) {
    const attachBtn = await page.$('button[aria-label*="Прикрепить"], button[aria-label*="Attach"], button[data-testid*="attach"]');
    console.log('Attach button present:', !!attachBtn);
  }

  process.exit(0);
}

test().catch(err => {
  console.error('CDP test error:', err);
  process.exit(1);
});
