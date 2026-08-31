const wsUrl = process.argv[2];
const suite = process.argv[3] || 'main';

if (!wsUrl) {
  console.error('usage: node scripts/qa-suite.mjs <webSocketDebuggerUrl> <main|restore>');
  process.exit(1);
}

const ws = new WebSocket(wsUrl);
let nextId = 1;
const pending = new Map();

function send(method, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  }
};

ws.onclose = () => { process.exit(0); };

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) return `EXCEPTION: ${result.exceptionDetails.text} ${result.exceptionDetails.exception?.description ?? ''}`;
  return result.result?.value;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function mouseMove(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
}

async function mainSuite() {
  await sleep(1500);
  console.log('BASICS', await evaluate(`JSON.stringify({
    title: document.querySelector('.reader-title-main')?.textContent || '',
    author: document.querySelector('.reader-author')?.textContent || '',
    sections: document.querySelectorAll('.book-section').length,
    chapterText: (document.querySelector('.book-content')?.innerText || '').slice(0, 140),
    size: [window.innerWidth, screen.width].join('x'),
    fullscreen: window.innerWidth >= screen.width,
    controls: document.querySelectorAll('.window-controls button').length
  })`));

  await sleep(500);
  const before = Number(await evaluate('document.querySelector(".reading-stage").scrollTop'));
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true })); 'ok'`);
  await sleep(900);
  const afterJ = Number(await evaluate('document.querySelector(".reading-stage").scrollTop'));
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', altKey: true, bubbles: true })); 'ok'`);
  await sleep(900);
  const afterAltJ = Number(await evaluate('document.querySelector(".reading-stage").scrollTop'));
  const viewport = Number(await evaluate('document.querySelector(".reading-stage").clientHeight'));
  console.log('SCROLL', JSON.stringify({ deltaJ: afterJ - before, deltaAltJ: afterAltJ - afterJ, viewport, ratioJ: (afterJ - before) / viewport, ratioAltJ: (afterAltJ - afterJ) / viewport }));

  const f1 = await evaluate('document.querySelector(".book-content").style.fontSize');
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '=', ctrlKey: true, bubbles: true })); 'ok'`);
  await sleep(400);
  const f2 = await evaluate('document.querySelector(".book-content").style.fontSize');
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', ctrlKey: true, bubbles: true })); 'ok'`);
  await sleep(400);
  const f3 = await evaluate('document.querySelector(".book-content").style.fontSize');
  console.log('FONT', JSON.stringify({ f1, f2, f3 }));

  await sleep(2500);
  const hiddenAfterIdle = await evaluate(`document.querySelector('.reader-chrome').classList.contains('reader-chrome-hidden')`);
  await mouseMove(5, 5);
  await sleep(800);
  const shownAfterHover = await evaluate(`!document.querySelector('.reader-chrome').classList.contains('reader-chrome-hidden')`);
  console.log('HEADER', JSON.stringify({ hiddenAfterIdle, shownAfterHover }));

  await evaluate(`(() => {
    for (const candidate of document.querySelectorAll('.book-section')) {
      const walker = document.createTreeWalker(candidate, NodeFilter.SHOW_TEXT);
      let node = null;
      while ((node = walker.nextNode())) { if ((node.textContent || '').trim().length > 24) break; }
      if (!node) continue;
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, 24);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      node.parentElement.scrollIntoView({ block: 'center' });
      return 'scrolled';
    }
    return 'no text node';
  })()`);
  await sleep(400);
  const target = await evaluate(`(() => {
    for (const candidate of document.querySelectorAll('.book-section')) {
      const walker = document.createTreeWalker(candidate, NodeFilter.SHOW_TEXT);
      let node = null;
      while ((node = walker.nextNode())) { if ((node.textContent || '').trim().length > 24) break; }
      if (!node) continue;
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, 24);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      const rect = range.getBoundingClientRect();
      if (rect.top < 60 || rect.bottom > window.innerHeight - 40) continue;
      return JSON.stringify({ x: Math.round(rect.left + 40), y: Math.round(rect.top + 12), chapter: candidate.dataset.chapter });
    }
    return JSON.stringify({ error: 'no visible text node' });
  })()`);
  const targetObj = JSON.parse(target);
  if (!targetObj.error) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: targetObj.x, y: targetObj.y, button: 'right', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: targetObj.x, y: targetObj.y, button: 'right', clickCount: 1 });
    await sleep(300);
    console.log('HIGHLIGHT', await evaluate(`JSON.stringify({
      menuShown: !!document.querySelector('.reader-menu'),
      selectionStill: (window.getSelection()?.toString() || '').length,
      chapter: '${targetObj.chapter}'
    })`));
    await evaluate(`document.querySelector('.reader-menu button')?.click(); 'ok'`);
    await sleep(400);
    console.log('HIGHLIGHT2', await evaluate(`JSON.stringify({ markCount: document.querySelectorAll('.book-section mark.reader-highlight').length })`));
  } else {
    console.log('HIGHLIGHT', target);
  }

  console.log('PAGED', await evaluate(`(async () => {
    document.querySelector('.icon-button[title="Settings"]')?.click();
    await new Promise((r) => setTimeout(r, 300));
    const row = [...document.querySelectorAll('.setting-row')].find((r) => r.querySelector('b')?.textContent === 'Display full book');
    if (!row) return JSON.stringify({ error: 'no display-full-book row' });
    if (row.querySelector('input').checked) row.querySelector('input').click();
    await new Promise((r) => setTimeout(r, 700));
    document.querySelector('.modal-close')?.click();
    await new Promise((r) => setTimeout(r, 500));
    const sections = document.querySelectorAll('.book-section').length;
    const before = document.querySelector('.reading-stage').scrollTop;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }));
    await new Promise((r) => setTimeout(r, 900));
    const after = document.querySelector('.reading-stage').scrollTop;
    const vh = document.querySelector('.reading-stage').clientHeight;
    return JSON.stringify({ sections, delta: after - before, viewport: vh, ratio: (after - before) / vh });
  })()`));

  console.log('FULLSCREEN_OFF', await evaluate(`(async () => {
    document.querySelector('.icon-button[title="Settings"]')?.click();
    await new Promise((r) => setTimeout(r, 300));
    const row = [...document.querySelectorAll('.setting-row')].find((r) => r.querySelector('b')?.textContent === 'Fullscreen');
    if (!row) return JSON.stringify({ error: 'no fullscreen row' });
    if (row.querySelector('input').checked) row.querySelector('input').click();
    await new Promise((r) => setTimeout(r, 1200));
    return JSON.stringify({ innerWidth: window.innerWidth, screenWidth: screen.width, windowed: window.innerWidth < screen.width });
  })()`));

  await sleep(600);
  await evaluate(`document.querySelector('.window-controls .close')?.click(); 'ok'`);
  await sleep(3000);
  process.exit(0);
}

async function restoreSuite() {
  await sleep(9000);
  console.log('RESTORE', await evaluate(`JSON.stringify({
    innerWidth: window.innerWidth,
    screenWidth: screen.width,
    fullscreen: window.innerWidth >= screen.width
  })`));
  await evaluate(`document.querySelector('.window-controls .close')?.click(); 'ok'`);
  await sleep(2500);
  process.exit(0);
}

async function probeSuite() {
  await sleep(1000);
  console.log('PROBE', await evaluate(`JSON.stringify({
    inner: [window.innerWidth, window.innerHeight].join('x'),
    screen: [screen.width, screen.height].join('x'),
    dpr: window.devicePixelRatio,
    sheets: document.styleSheets.length,
    stageOverflow: getComputedStyle(document.querySelector('.reading-stage')).overflow,
    stageClient: document.querySelector('.reading-stage').clientHeight,
    stageScroll: document.querySelector('.reading-stage').scrollHeight,
    scrollTop: document.querySelector('.reading-stage').scrollTop,
    stageTop: document.querySelector('.reading-stage').getBoundingClientRect().top,
    stageHeight: document.querySelector('.reading-stage').getBoundingClientRect().height,
    sections: [...document.querySelectorAll('.book-section')].map((s) => s.dataset.chapter),
    firstText: (document.querySelector('.book-section')?.innerText || '').slice(0, 80),
    appRows: getComputedStyle(document.querySelector('.reader-app')).gridTemplateRows
  })`));
  process.exit(0);
}

async function scrollProbeSuite() {
  await sleep(1200);
  const before = await evaluate(`JSON.stringify({
    scrollTop: document.querySelector('.reading-stage').scrollTop,
    scrollHeight: document.querySelector('.reading-stage').scrollHeight,
    clientHeight: document.querySelector('.reading-stage').clientHeight
  })`);
  await evaluate(`document.querySelector('.reading-stage').scrollBy({ top: 400, behavior: 'auto' }); 'ok'`);
  await sleep(400);
  const after = await evaluate(`JSON.stringify({
    scrollTop: document.querySelector('.reading-stage').scrollTop,
    scrollHeight: document.querySelector('.reading-stage').scrollHeight,
    clientHeight: document.querySelector('.reading-stage').clientHeight
  })`);
  console.log('SCROLLPROBE', JSON.stringify({ before: JSON.parse(before), after: JSON.parse(after) }));
  process.exit(0);
}

async function resetSuite() {
  await sleep(1200);
  await evaluate(`(async () => {
    document.querySelector('.icon-button[title="Settings"]')?.click();
    await new Promise((r) => setTimeout(r, 300));
    const setChecked = (label, checked) => {
      const row = [...document.querySelectorAll('.setting-row')].find((r) => r.querySelector('b')?.textContent === label);
      if (!row) return false;
      const input = row.querySelector('input');
      if (input.checked !== checked) input.click();
      return true;
    };
    setChecked('Fullscreen', true);
    setChecked('Display full book', true);
    await new Promise((r) => setTimeout(r, 800));
    document.querySelector('.modal-close')?.click();
    return 'reset-done';
  })()`);
  console.log('RESET done');
  await sleep(800);
  await evaluate(`document.querySelector('.window-controls .close')?.click(); 'ok'`);
  await sleep(2500);
  process.exit(0);
}

async function cleanupSuite() {
  await sleep(1500);
  await evaluate(`document.querySelector('.icon-button[title="Bookmarks"]')?.click(); 'ok'`);
  await sleep(400);
  console.log('PERSISTENCE_BEFORE', await evaluate(`JSON.stringify({
    items: document.querySelectorAll('.bookmark-item').length,
    marks: document.querySelectorAll('mark.reader-highlight').length
  })`));
  await evaluate(`document.querySelector('.bookmark-remove')?.click(); 'ok'`);
  await sleep(500);
  console.log('PERSISTENCE_AFTER', await evaluate(`JSON.stringify({
    items: document.querySelectorAll('.bookmark-item').length,
    marks: document.querySelectorAll('mark.reader-highlight').length
  })`));
  await evaluate(`document.querySelector('.window-controls .close')?.click(); 'ok'`);
  await sleep(2500);
  process.exit(0);
}

async function pagedProbeSuite() {
  await sleep(1500);
  const before = await evaluate(`JSON.stringify({
    sections: document.querySelectorAll('.book-section').length,
    chapters: [...document.querySelectorAll('.book-section')].map((s) => s.dataset.chapter),
    client: document.querySelector('.reading-stage').clientHeight,
    scroll: document.querySelector('.reading-stage').scrollHeight,
    top: document.querySelector('.reading-stage').scrollTop,
    overflow: getComputedStyle(document.querySelector('.reading-stage')).overflow
  })`);
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true })); 'ok'`);
  await sleep(900);
  const afterTop = await evaluate('document.querySelector(".reading-stage").scrollTop');
  console.log('PAGEDPROBE', JSON.stringify({ before: JSON.parse(before), afterTop }));
  process.exit(0);
}

async function selectionProbeSuite() {
  await sleep(1500);
  console.log('SEL', await evaluate(`(async () => {
    const out = {};
    const findTextSection = () => {
      for (const candidate of document.querySelectorAll('.book-section')) {
        const walker = document.createTreeWalker(candidate, NodeFilter.SHOW_TEXT);
        let current = null;
        while ((current = walker.nextNode())) {
          if ((current.textContent || '').trim().length > 24) return { section: candidate, node: current };
        }
      }
      return null;
    };
    const setSelection = () => {
      const found = findTextSection();
      if (!found) return null;
      const { section, node } = found;
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, 24);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return section;
    };
    const selectionLength = () => (window.getSelection()?.toString() || '').length;

    let section = setSelection();
    if (!section) return JSON.stringify({ error: 'no text node' });
    out.afterSet = selectionLength();
    const probeDiv = document.createElement('div');
    probeDiv.id = 'probe-div';
    probeDiv.textContent = 'probe';
    document.body.appendChild(probeDiv);
    out.afterDomInsert = selectionLength();
    probeDiv.remove();

    section = setSelection();
    document.querySelector('.reading-stage').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200, button: 2 }));
    await new Promise((r) => setTimeout(r, 100));
    out.afterMenuOnStage = selectionLength();

    section = setSelection();
    section.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200, button: 2 }));
    await new Promise((r) => setTimeout(r, 100));
    out.afterMenuOnSection = selectionLength();
    out.menuShown = !!document.querySelector('.reader-menu');
    out.sectionStillConnected = document.contains(section);
    out.sectionHasContent = !!section.firstChild;
    out.articleHtmlLength = document.querySelector('.book-content')?.innerHTML.length ?? -1;

    section = setSelection();
    const themeButton = [...document.querySelectorAll('.reader-actions button')].find((b) => b.title === 'Toggle reading theme');
    themeButton?.click();
    await new Promise((r) => setTimeout(r, 150));
    out.afterThemeRender = selectionLength();
    document.querySelector('.reader-menu')?.remove();

    return JSON.stringify(out);
  })()`));
  process.exit(0);
}

async function trustedRightSuite() {
  await sleep(1500);
  const plan = await evaluate(`(() => {
    for (const candidate of document.querySelectorAll('.book-section')) {
      const walker = document.createTreeWalker(candidate, NodeFilter.SHOW_TEXT);
      let node = null;
      while ((node = walker.nextNode())) { if ((node.textContent || '').trim().length > 24) break; }
      if (!node) continue;
      node.parentElement.scrollIntoView({ block: 'center' });
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, 24);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      const rect = range.getBoundingClientRect();
      if (rect.top < 60 || rect.bottom > window.innerHeight - 40) continue;
      return JSON.stringify({ x: Math.round(rect.left + 40), y: Math.round(rect.top + 12) });
    }
    return JSON.stringify({ error: 'no visible text' });
  })()`);
  await sleep(300);
  const point = JSON.parse(plan);
  if (point.error) { console.log('TRUSTED', plan); process.exit(0); }
  await evaluate(`window.__scrolls = 0; document.addEventListener('scroll', () => { window.__scrolls = (window.__scrolls || 0) + 1; }, true); 'ok'`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'right', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'right', clickCount: 1 });
  const samples = [];
  for (const delay of [0, 60, 150, 300, 500]) {
    await sleep(delay);
    samples.push({
      delay: samples.reduce((a, s) => a + s.delay, 0) + delay,
      pending: await evaluate(`document.querySelectorAll('mark.pending-selection').length`),
      menu: await evaluate(`!!document.querySelector('.reader-menu')`),
    });
  }
  const scrolls = await evaluate(`window.__scrolls || 0`);
  const menuShown = await evaluate(`!!document.querySelector('.reader-menu')`);
  const menuText = await evaluate(`document.querySelector('.reader-menu')?.innerText || ''`);
  console.log('TRUSTED_ON_TEXT', JSON.stringify({ samples, scrolls, menuShown, menuText }));

  await evaluate(`document.querySelector('.reader-menu button')?.click(); 'ok'`);
  await sleep(300);
  console.log('TRUSTED_HIGHLIGHT', await evaluate(`JSON.stringify({
    pending: document.querySelectorAll('mark.pending-selection').length,
    permanent: document.querySelectorAll('mark.reader-highlight').length,
    menuShown: !!document.querySelector('.reader-menu')
  })`));

  const offPoint = await evaluate(`(() => {
    const stage = document.querySelector('.reading-stage').getBoundingClientRect();
    for (const candidate of document.querySelectorAll('.book-section')) {
      const walker = document.createTreeWalker(candidate, NodeFilter.SHOW_TEXT);
      let node = null;
      while ((node = walker.nextNode())) { if ((node.textContent || '').trim().length > 24) break; }
      if (!node) continue;
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, 24);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return JSON.stringify({ x: Math.round(stage.right - 30), y: Math.round(Math.min(stage.bottom - 30, window.innerHeight - 60)) });
    }
    return JSON.stringify({ error: 'no text' });
  })()`);
  await sleep(200);
  const off = JSON.parse(offPoint);
  if (!off.error) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: off.x, y: off.y, button: 'right', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: off.x, y: off.y, button: 'right', clickCount: 1 });
    await sleep(300);
    console.log('TRUSTED_OFF_TEXT', await evaluate(`JSON.stringify({
      selection: (window.getSelection()?.toString() || '').length,
      menuShown: !!document.querySelector('.reader-menu')
    })`));
  }
  process.exit(0);
}

ws.onopen = () => {
  if (suite === 'restore') void restoreSuite();
  else if (suite === 'probe') void probeSuite();
  else if (suite === 'scrollprobe') void scrollProbeSuite();
  else if (suite === 'reset') void resetSuite();
  else if (suite === 'cleanup') void cleanupSuite();
  else if (suite === 'pagedprobe') void pagedProbeSuite();
  else if (suite === 'selprobe') void selectionProbeSuite();
  else if (suite === 'trustedright') void trustedRightSuite();
  else void mainSuite();
};

setTimeout(() => {
  console.error('timeout');
  process.exit(1);
}, 60000);
