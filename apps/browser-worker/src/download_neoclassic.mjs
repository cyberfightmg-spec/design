import fs from 'node:fs';

async function main() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json/list');
  const tabs = await tabsRes.json();
  const chatTab = tabs.find(t => t.type === 'page' && t.url.includes('chatgpt.com'));
  const wsUrl = chatTab.webSocketDebuggerUrl;

  const ws = new WebSocket(wsUrl);

  const neoclassicImgSrc = await new Promise((resolve) => {
    ws.onopen = () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: `(() => {
            const img = Array.from(document.querySelectorAll('img')).find(i => i.alt && i.alt.includes('неоклассический'));
            return img ? img.src : null;
          })()`,
          returnByValue: true
        }
      }));
    };
    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      resolve(d.result?.result?.value);
    };
  });

  console.log('Neoclassic image URL:', neoclassicImgSrc);

  const base64 = await new Promise((resolve) => {
    ws.send(JSON.stringify({
      id: 2,
      method: 'Runtime.evaluate',
      params: {
        expression: `(async () => {
          const res = await fetch(${JSON.stringify(neoclassicImgSrc)});
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
    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      ws.close();
      resolve(d.result?.result?.value);
    };
  });

  const dest = 'storage/projects/ce317ecc-42cc-4c49-8a9c-4a8ececc7409/generated/neoclassic/final.png';
  const buf = Buffer.from(base64, 'base64');
  fs.writeFileSync(dest, buf);
  console.log('Saved correct neoclassic image to:', dest, 'bytes:', buf.length);
}

main().catch(console.error);
