const wsUrl = process.argv[2];
const clickClose = process.argv[3] === '--close';
const coverCheck = process.argv[3] === '--cover' || process.argv[4] === '--cover';

if (!wsUrl) {
  console.error('usage: node scripts/qa-reader.mjs <webSocketDebuggerUrl> [--close]');
  process.exit(1);
}

const ws = new WebSocket(wsUrl);
let nextId = 1;
const pending = new Map();

function send(method, params) {
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message.result);
    pending.delete(message.id);
  }
};

ws.onopen = async () => {
  const expression = `JSON.stringify({
    text: (document.body.innerText || '').slice(0, 260),
    imgIsDataUri: (() => { const img = document.querySelector('.book-content img'); return img ? img.src.startsWith('data:image/png') : false; })(),
    svgImageIsDataUri: (() => { const el = document.querySelector('.book-content image'); if (!el) return 'no-svg-image'; const src = el.getAttribute('href') || el.getAttribute('xlink:href') || ''; return src.startsWith('data:image/'); })(),
    chapterText: (document.querySelector('.book-content')?.innerText || '').slice(0, 220),
    size: [window.innerWidth, screen.width, window.innerHeight, screen.height].join('x'),
    fullscreen: window.innerWidth >= screen.width && window.innerHeight >= screen.height,
    windowControlButtons: document.querySelectorAll('.window-controls button').length
  })`;
  const result = await send('Runtime.evaluate', { expression, returnByValue: true });
  console.log(result.result.value);
  if (coverCheck) {
    const cover = `(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', ctrlKey: true, bubbles: true }));
      await new Promise((r) => setTimeout(r, 300));
      const buttons = document.querySelectorAll('.chapter-list button');
      if (buttons.length) buttons[0].click();
      await new Promise((r) => setTimeout(r, 700));
      const image = document.querySelector('.book-content image');
      const svg = document.querySelector('.book-content svg');
      const href = image ? (image.getAttribute('href') || image.getAttribute('xlink:href') || '') : '';
      return JSON.stringify({
        coverHrefIsDataUri: href.startsWith('data:image/'),
        preserveAspectRatio: svg ? svg.getAttribute('preserveAspectRatio') : 'no-svg',
        coverText: (document.querySelector('.book-content')?.innerText || '').slice(0, 80)
      });
    })()`;
    const coverResult = await send('Runtime.evaluate', { expression: cover, awaitPromise: true, returnByValue: true });
    console.log(coverResult.result.value);
  }
  if (clickClose) {
    await send('Runtime.evaluate', { expression: "document.querySelector('.window-controls .close').click()" });
  }
  ws.close();
  process.exit(0);
};

setTimeout(() => {
  console.error('timeout waiting for the reader page');
  process.exit(1);
}, 15000);
