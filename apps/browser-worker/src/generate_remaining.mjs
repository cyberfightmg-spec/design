import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const dbPath = path.resolve('storage/interior-bot.db');
const db = new DatabaseSync(dbPath);

async function getCDPTab() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json/list');
  const tabs = await tabsRes.json();
  const chatTab = tabs.find(t => t.type === 'page' && t.url.includes('chatgpt.com'));
  if (!chatTab) throw new Error('No ChatGPT tab found on port 9222');
  return chatTab.webSocketDebuggerUrl;
}

function cdpSend(wsUrl, method, params = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      ws.send(JSON.stringify({ id: 1, method, params }));
    };
    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      ws.close();
      resolve(d.result);
    };
    ws.onerror = (err) => {
      reject(err);
    };
    setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error(`Timeout executing ${method}`));
    }, 25000);
  });
}

function attachPhoto(wsUrl, photoPath) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let idCounter = 1;
    const send = (method, params = {}) => {
      const id = idCounter++;
      ws.send(JSON.stringify({ id, method, params }));
      return id;
    };

    ws.onopen = () => {
      send('DOM.getDocument', { depth: -1 });
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id === 1) {
        send('DOM.querySelector', {
          nodeId: msg.result.root.nodeId,
          selector: 'input[type=file]'
        });
      } else if (msg.id === 2) {
        if (!msg.result?.nodeId) {
          ws.close();
          return reject(new Error('File input node not found'));
        }
        send('DOM.setFileInputFiles', {
          files: [photoPath],
          nodeId: msg.result.nodeId
        });
      } else if (msg.id === 3) {
        ws.close();
        setTimeout(resolve, 4000);
      }
    };

    ws.onerror = (err) => {
      reject(err);
    };

    setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error('attachPhoto timeout'));
    }, 20000);
  });
}

async function typePromptAndSend(wsUrl, promptText) {
  await cdpSend(wsUrl, 'Runtime.evaluate', {
    expression: `(() => {
      const el = document.querySelector('#prompt-textarea');
      if (!el) return false;
      el.focus();
      if (el.tagName === 'DIV') {
        const lines = ${JSON.stringify(promptText)}.split('\\n');
        el.innerHTML = '<p>' + lines.join('<br>') + '</p>';
      } else {
        el.value = ${JSON.stringify(promptText)};
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`
  });

  await new Promise(r => setTimeout(r, 1500));

  await cdpSend(wsUrl, 'Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('button[data-testid=\"send-button\"]');
      if (btn) {
        btn.click();
        return 'clicked send';
      }
      const enterEvt = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13 });
      document.querySelector('#prompt-textarea')?.dispatchEvent(enterEvt);
      return 'pressed Enter';
    })()`
  });
}

async function getAllGeneratedImageUrls(wsUrl) {
  const res = await cdpSend(wsUrl, 'Runtime.evaluate', {
    expression: `(() => {
      return Array.from(document.querySelectorAll('img'))
        .filter(i => 
          (i.src.includes('backend-api/estuary') || i.src.includes('oaiusercontent.com')) &&
          !i.alt.includes('original.jpg') &&
          !i.alt.includes('original(') &&
          (i.naturalWidth > 400 || i.naturalHeight > 400)
        )
        .map(i => i.src);
    })()`,
    returnByValue: true
  });
  return res?.result?.value || [];
}

async function waitForNewGeneratedImage(wsUrl, initialUrls) {
  const startTime = Date.now();
  const maxWaitMs = 180000; // 3 mins

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise(r => setTimeout(r, 4000));

    const currentUrls = await getAllGeneratedImageUrls(wsUrl);
    const newUrls = currentUrls.filter(u => !initialUrls.includes(u));

    const res = await cdpSend(wsUrl, 'Runtime.evaluate', {
      expression: `!!document.querySelector('button[data-testid=\"stop-button\"], button[aria-label*=\"Stop\"]')`,
      returnByValue: true
    });
    const stopBtnVisible = !!res?.result?.value;

    if (newUrls.length > 0) {
      if (!stopBtnVisible || (Date.now() - startTime > 45000)) {
        return newUrls[newUrls.length - 1];
      }
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`Generating... (${elapsed}s, stopBtn=${stopBtnVisible})`);
  }
  return null;
}

async function downloadImageBase64(wsUrl, imgSrc) {
  const res = await cdpSend(wsUrl, 'Runtime.evaluate', {
    expression: `(async () => {
      const res = await fetch(${JSON.stringify(imgSrc)});
      const blob = await res.blob();
      return new Promise((res) => {
        const reader = new FileReader();
        reader.onloadend = () => res(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
      });
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  return res?.result?.value;
}

async function runRemaining() {
  const wsUrl = await getCDPTab();
  console.log('Connected to ChatGPT via CDP.');

  // Target only uncompleted styles
  const stylesToRun = ['contemporary', 'moroccan', 'shabby_chic'];

  for (const styleId of stylesToRun) {
    const gen = db.prepare(`
      SELECT g.*, p.source_image 
      FROM generations g 
      JOIN projects p ON g.project_id = p.id 
      WHERE g.style_id = ?
      LIMIT 1
    `).get(styleId);

    if (!gen) continue;

    console.log(`\n========================================`);
    console.log(`Processing Style: ${styleId} (Job: ${gen.id})`);
    console.log(`========================================`);

    db.prepare(`UPDATE generations SET status='GENERATING', started_at=datetime('now') WHERE id=?`).run(gen.id);

    const initialUrls = await getAllGeneratedImageUrls(wsUrl);
    console.log(`Current generated images in chat: ${initialUrls.length}`);

    console.log('Attaching original reference photo...');
    await attachPhoto(wsUrl, gen.source_image);

    console.log('Typing prompt and sending...');
    await typePromptAndSend(wsUrl, gen.prompt);

    console.log('Waiting for AI generation...');
    const imgSrc = await waitForNewGeneratedImage(wsUrl, initialUrls);

    if (!imgSrc) {
      console.error(`Generation failed or timed out for ${styleId}`);
      db.prepare(`UPDATE generations SET status='FAILED', error='Timeout' WHERE id=?`).run(gen.id);
      continue;
    }

    console.log('Image generated! Downloading...');
    const base64Data = await downloadImageBase64(wsUrl, imgSrc);
    if (!base64Data) {
      console.error(`Failed to download image for ${styleId}`);
      db.prepare(`UPDATE generations SET status='FAILED', error='Download failed' WHERE id=?`).run(gen.id);
      continue;
    }

    const outDir = path.resolve(`storage/projects/${gen.project_id}/generated/${styleId}`);
    fs.mkdirSync(outDir, { recursive: true });
    const finalPath = path.join(outDir, 'final.png');
    const buf = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(finalPath, buf);

    db.prepare(`
      UPDATE generations 
      SET status = 'PASSED', image_path = ?, finished_at = datetime('now')
      WHERE id = ?
    `).run(finalPath, gen.id);

    console.log(`Saved: ${finalPath} (${buf.length} bytes)`);
    await new Promise(r => setTimeout(r, 4000));
  }

  console.log('\nAll targeted styles processed!');
}

runRemaining().catch(err => {
  console.error('Runner error:', err);
  process.exit(1);
});
