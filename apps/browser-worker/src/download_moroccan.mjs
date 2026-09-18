import fs from 'node:fs';

async function main() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json/list');
  const tabs = await tabsRes.json();
  const chatTab = tabs.find(t => t.type === 'page' && t.url.includes('chatgpt.com'));
  const wsUrl = chatTab.webSocketDebuggerUrl;

  const moroccanSrc = 'https://chatgpt.com/backend-api/estuary/content?id=file_00000000634881f580d8f1580ef52c1e&ts=497121&p=fs&cid=1&sig=81869cb3a0974fc7c58099733a18b02159fbeee93623b9b2196c4e2fe1b7291e&v=0';

  const ws = new WebSocket(wsUrl);

  const base64 = await new Promise((resolve, reject) => {
    ws.onopen = () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: `(async () => {
            const res = await fetch(${JSON.stringify(moroccanSrc)});
            const blob = await res.blob();
            return new Promise((r) => {
              const reader = new FileReader();
              reader.onloadend = () => r(reader.result.split(',')[1]);
              reader.readAsDataURL(blob);
            });
          })()`,
          awaitPromise: true,
          returnByValue: true
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

  const dest = 'storage/projects/ce317ecc-42cc-4c49-8a9c-4a8ececc7409/generated/moroccan/final.png';
  fs.mkdirSync('storage/projects/ce317ecc-42cc-4c49-8a9c-4a8ececc7409/generated/moroccan', { recursive: true });
  const buf = Buffer.from(base64, 'base64');
  fs.writeFileSync(dest, buf);
  console.log('Saved moroccan image:', dest, buf.length);
}

main().catch(console.error);
