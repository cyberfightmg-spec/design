import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const dbPath = path.resolve('storage/interior-bot.db');
const db = new DatabaseSync(dbPath);

async function main() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json/list');
  const tabs = await tabsRes.json();
  const chatTab = tabs.find(t => t.type === 'page' && t.url.includes('chatgpt.com'));
  if (!chatTab) throw new Error('No ChatGPT tab found');

  const wsUrl = chatTab.webSocketDebuggerUrl;

  const gen = db.prepare(`
    SELECT g.*, p.source_image 
    FROM generations g 
    JOIN projects p ON g.project_id = p.id 
    WHERE g.style_id = 'provence' 
    ORDER BY g.created_at DESC LIMIT 1
  `).get();

  const outDir = path.resolve(`storage/projects/${gen.project_id}/generated/provence`);
  fs.mkdirSync(outDir, { recursive: true });
  const finalPath = path.join(outDir, 'final.png');
  const attemptPath = path.join(outDir, `attempt-01.png`);

  console.log(`Waiting for generated image for style: ${gen.style_id}...`);

  const startTime = Date.now();
  const maxWait = 240000; // 4 minutes

  while (Date.now() - startTime < maxWait) {
    await new Promise(r => setTimeout(r, 4000));

    const checkRes = await new Promise((resolve) => {
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: {
            expression: `(() => {
              const imgs = Array.from(document.querySelectorAll('img')).map(i => ({
                src: i.src,
                w: i.naturalWidth,
                h: i.naturalHeight,
                alt: i.alt || ''
              }));
              const generated = imgs.filter(i => 
                (i.src.includes('backend-api/estuary') || i.src.includes('oaiusercontent.com')) &&
                !i.alt.includes('original.jpg') &&
                (i.w > 400 || i.h > 400)
              );
              const stopBtn = !!document.querySelector('button[data-testid=\"stop-button\"], button[aria-label*=\"Stop\"]');
              return { generated, stopBtn };
            })()`,
            returnByValue: true,
          }
        }));
      };
      ws.onmessage = (e) => {
        const d = JSON.parse(e.data);
        ws.close();
        resolve(d.result?.result?.value);
      };
      ws.onerror = () => resolve(null);
    });

    if (checkRes && checkRes.generated && checkRes.generated.length > 0) {
      const targetImg = checkRes.generated[checkRes.generated.length - 1];
      console.log('Detected generated image:', targetImg.src.slice(0, 80));
      
      // If stop button is gone, generation is complete!
      if (!checkRes.stopBtn || (Date.now() - startTime > 45000)) {
        console.log('Downloading image data...');
        // Download via CDP evaluate with fetch
        const base64Data = await new Promise((resolve, reject) => {
          const ws = new WebSocket(wsUrl);
          ws.onopen = () => {
            ws.send(JSON.stringify({
              id: 2,
              method: 'Runtime.evaluate',
              params: {
                expression: `(async () => {
                  const res = await fetch(${JSON.stringify(targetImg.src)});
                  const blob = await res.blob();
                  return new Promise((res) => {
                    const reader = new FileReader();
                    reader.onloadend = () => res(reader.result.split(',')[1]);
                    reader.readAsDataURL(blob);
                  });
                })()`,
                awaitPromise: true,
                returnByValue: true,
              }
            }));
          };
          ws.onmessage = (e) => {
            const d = JSON.parse(e.data);
            ws.close();
            resolve(d.result?.result?.value);
          };
          ws.onerror = reject;
        });

        if (base64Data) {
          const buf = Buffer.from(base64Data, 'base64');
          fs.writeFileSync(finalPath, buf);
          fs.writeFileSync(attemptPath, buf);
          console.log(`Saved generated image to ${finalPath} (${buf.length} bytes)`);

          // Update database
          db.prepare(`
            UPDATE generations 
            SET status = 'PASSED', image_path = ?, finished_at = datetime('now')
            WHERE id = ?
          `).run(finalPath, gen.id);

          console.log('Generation marked as PASSED in database!');
          process.exit(0);
        }
      }
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`Generating... (${elapsed}s)`);
  }

  throw new Error('Timeout waiting for generated image');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
