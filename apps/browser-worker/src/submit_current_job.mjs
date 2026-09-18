import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

// Connect to database
const dbPath = path.resolve('storage/interior-bot.db');
const db = new DatabaseSync(dbPath);

async function sendPromptViaCDP(wsUrl, promptText) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let idCounter = 1;

    const send = (method, params = {}) => {
      const id = idCounter++;
      ws.send(JSON.stringify({ id, method, params }));
      return id;
    };

    ws.onopen = () => {
      // Step 1: Insert prompt text into #prompt-textarea
      send('Runtime.evaluate', {
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
        })()`,
        returnByValue: true,
      });
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === 1) {
        console.log('Prompt inserted into textarea:', msg.result?.result?.value);
        // Step 2: Wait 1s and click send button
        setTimeout(() => {
          send('Runtime.evaluate', {
            expression: `(() => {
              const btn = document.querySelector('button[data-testid=\"send-button\"]');
              if (btn) {
                btn.click();
                return 'clicked send button';
              }
              const enterEvt = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13 });
              document.querySelector('#prompt-textarea')?.dispatchEvent(enterEvt);
              return 'pressed Enter fallback';
            })()`,
            returnByValue: true,
          });
        }, 1000);
      } else if (msg.id === 2) {
        console.log('Send action result:', msg.result?.result?.value);
        ws.close();
        resolve(true);
      }
    };

    ws.onerror = (err) => {
      reject(err);
    };

    setTimeout(() => {
      ws.close();
      reject(new Error('Send prompt timeout'));
    }, 15000);
  });
}

async function main() {
  // Get active tab info
  const tabsRes = await fetch('http://127.0.0.1:9222/json/list');
  const tabs = await tabsRes.json();
  const chatTab = tabs.find(t => t.type === 'page' && t.url.includes('chatgpt.com'));
  if (!chatTab) {
    throw new Error('No active ChatGPT tab found on Chrome port 9222');
  }

  console.log('Using ChatGPT tab:', chatTab.id, chatTab.title);
  const wsUrl = chatTab.webSocketDebuggerUrl;

  // Get current pending generation
  const gen = db.prepare(`
    SELECT g.*, p.source_image 
    FROM generations g 
    JOIN projects p ON g.project_id = p.id 
    WHERE g.status = 'PENDING' 
    ORDER BY g.attempt ASC, g.created_at ASC 
    LIMIT 1
  `).get();

  if (!gen) {
    console.log('No pending generations found!');
    return;
  }

  console.log(`\n========================================`);
  console.log(`Starting generation: Style=${gen.style_id}, JobId=${gen.id}`);
  console.log(`========================================`);

  // Update status in DB
  db.prepare(`UPDATE generations SET status = 'GENERATING', started_at = datetime('now') WHERE id = ?`).run(gen.id);

  // Send prompt under the attached photo
  await sendPromptViaCDP(wsUrl, gen.prompt);
  console.log('Prompt successfully submitted under photo! Now monitoring generation...');

  process.exit(0);
}

main().catch(err => {
  console.error('Execution error:', err);
  process.exit(1);
});
