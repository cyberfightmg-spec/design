import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const dbPath = path.resolve('storage/interior-bot.db');
const db = new DatabaseSync(dbPath);

async function getCDPTab() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json/list');
  const tabs = await tabsRes.json();
  const chatTab = tabs.find(t => t.type === 'page' && t.url.includes('chatgpt.com'));
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
    ws.onerror = reject;
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

    ws.onerror = reject;
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

async function countGeneratedImgs(wsUrl) {
  const res = await cdpSend(wsUrl, 'Runtime.evaluate', {
    expression: `Array.from(document.querySelectorAll('img')).filter(i => i.alt && i.alt.includes('Сформированное')).length`,
    returnByValue: true
  });
  return res?.result?.value || 0;
}

async function waitForNewImage(wsUrl, initialCount) {
  const startTime = Date.now();
  while (Date.now() - startTime < 200000) {
    await new Promise(r => setTimeout(r, 4000));
    const res = await cdpSend(wsUrl, 'Runtime.evaluate', {
      expression: `(() => {
        const imgs = Array.from(document.querySelectorAll('img')).filter(i => i.alt && i.alt.includes('Сформированное'));
        const stopBtn = !!document.querySelector('button[data-testid=\"stop-button\"], button[aria-label*=\"Stop\"]');
        return { count: imgs.length, last: imgs[imgs.length - 1]?.src, stopBtn };
      })()`,
      returnByValue: true
    });
    const d = res?.result?.value;
    if (d && d.count > initialCount) {
      if (!d.stopBtn || (Date.now() - startTime > 45000)) {
        return d.last;
      }
    }
    console.log(`Waiting... (${Math.round((Date.now() - startTime)/1000)}s)`);
  }
  return null;
}

async function downloadImg(wsUrl, src, dest) {
  const res = await cdpSend(wsUrl, 'Runtime.evaluate', {
    expression: `(async () => {
      const res = await fetch(${JSON.stringify(src)});
      const blob = await res.blob();
      return new Promise((r) => {
        const reader = new FileReader();
        reader.onloadend = () => r(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
      });
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  const buf = Buffer.from(res?.result?.value, 'base64');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  console.log('Saved to', dest, buf.length);
}

async function runOne(styleId) {
  const wsUrl = await getCDPTab();
  const gen = db.prepare(`SELECT g.*, p.source_image FROM generations g JOIN projects p ON g.project_id = p.id WHERE g.style_id = ? LIMIT 1`).get(styleId);
  if (!gen) return;

  console.log(`\n========================================`);
  console.log(`Generating Style: ${styleId}`);
  console.log(`========================================`);

  const initialCount = await countGeneratedImgs(wsUrl);
  console.log('Current generated count in chat:', initialCount);

  console.log('Attaching photo...');
  await attachPhoto(wsUrl, gen.source_image);

  console.log('Sending prompt...');
  await typePromptAndSend(wsUrl, gen.prompt);

  console.log('Waiting for generation...');
  const newSrc = await waitForNewImage(wsUrl, initialCount);
  if (!newSrc) throw new Error('Generation timeout');

  const dest = path.resolve(`storage/projects/${gen.project_id}/generated/${styleId}/final.png`);
  await downloadImg(wsUrl, newSrc, dest);

  db.prepare(`UPDATE generations SET status='PASSED', image_path=?, finished_at=datetime('now') WHERE id=?`).run(dest, gen.id);
  console.log(`Style ${styleId} SUCCESS!`);
}

const style = process.argv[2];
runOne(style).catch(console.error);
