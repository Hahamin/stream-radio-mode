const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const source = fs.readFileSync(process.env.SRM_PASTE_SCRIPT || path.join(__dirname, 'content/paste-unlock.js'), 'utf8');
const selectionSource = fs.readFileSync(path.join(__dirname, 'content/selection-unlock.js'), 'utf8');
const manifest = require('./manifest.json');
const multiline = '첫째 줄\n둘째 줄\n셋째 줄';
const fixture = `<!doctype html><meta charset="utf-8">
  <input id="title" placeholder="제목">
  <p id="post-text">Read-only post content</p>
  <div class="write_area"><div id="editor" contenteditable="true"></div></div>
  <input id="search" type="search">
  <div class="input_chat"><textarea id="chat"></textarea></div>
  <div id="write_area"><div id="rich-chat" contenteditable="true"><span>기존</span></div></div>
  <div class="input_chat"><textarea id="readonly" readonly>읽기 전용</textarea></div>
  <div class="input_chat"><input id="disabled" disabled value="비활성"></div>
  <div class="input_chat"><input id="password" type="password"></div>
  <div class="input_chat"><div id="noneditable" contenteditable="false">수정 불가</div></div>
  <script>
    window.pastes = [];
    window.inputs = [];
    document.addEventListener('paste', e => {
      pastes.push({ id: e.target.id, text: e.clipboardData.getData('text/plain'), html: e.clipboardData.getData('text/html') });
    });
    document.addEventListener('input', e => inputs.push(e.target.id));
  </script>`;

async function syntheticPaste(page, selector, text, html = '') {
  return page.locator(selector).evaluate((target, data) => {
    const clipboardData = new DataTransfer();
    if (data.text !== null) clipboardData.setData('text/plain', data.text);
    if (data.html) clipboardData.setData('text/html', data.html);
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  }, { text, html });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  await context.addInitScript({ content: source + '\n' + selectionSource });
  await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: fixture }));
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  let checks = 0;
  try {
    // Inject even on excluded pages to exercise the runtime guard as well as the manifest.
    for (const host of ['www.sooplive.com', 'sooplive.com', 'www.sooplive.co.kr', 'stbbs.sooplive.com', 'vod.sooplive.com']) {
      await page.goto('https://' + host + '/station/test/post/write/1');
      await page.locator('#title').fill('미리보기 테스트');
      assert.equal(await syntheticPaste(page, '#editor', multiline, '<p>첫째 줄</p><p>둘째 줄</p>'), false);
      const [paste] = await page.evaluate(() => pastes);
      assert.equal(paste.text, multiline);
      assert.equal(paste.html, '<p>첫째 줄</p><p>둘째 줄</p>');

      // Real browser paste and Backspace, not only synthetic event assertions.
      await page.evaluate(text => navigator.clipboard.writeText(text), multiline);
      await page.locator('#editor').click();
      await page.keyboard.press('Control+V');
      assert.equal(await page.locator('#editor').innerText(), multiline);
      assert.equal(await page.evaluate(() => pastes.length), 2);
      await page.keyboard.press('Backspace');
      assert.equal((await page.locator('#editor').innerText()).replace(/\u00a0/g, ' '), multiline.slice(0, -1));
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      assert.equal((await page.locator('#editor').innerText()).trim(), '');
      assert.equal(await page.locator('#title').inputValue(), '미리보기 테스트');
      // Editor clipboard/selection handlers must run; read-only content remains unlocked.
      const events = await page.evaluate(() => {
        const seen = [];
        for (const type of ['copy', 'cut', 'selectstart', 'contextmenu']) {
          document.addEventListener(type, event => {
            seen.push(event.type + ':' + event.target.id);
            event.preventDefault();
          }, { once: true });
          document.querySelector('#post-text').dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
          document.querySelector('#editor').dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
        }
        return seen;
      });
      assert.deepEqual(events, ['copy:editor', 'cut:editor', 'selectstart:editor', 'contextmenu:editor']);
      checks++;
    }
    console.log('[paste] Board/VOD/preview: native paste, HTML data, multiline text and deletion preserved (5 hosts)');

    for (const host of ['play.sooplive.com', 'play.sooplive.co.kr']) {
      await page.goto('https://' + host + '/test/123');
      // Reproduce a site blocking paste after the extension's document_start hook.
      await page.evaluate(() => document.querySelector('#chat').addEventListener('paste', e => e.preventDefault()));
      await page.locator('#chat').fill('앞뒤');
      await page.locator('#chat').evaluate(el => el.setSelectionRange(1, 1));
      assert.equal(await syntheticPaste(page, '#chat', multiline), true);
      assert.equal(await page.locator('#chat').inputValue(), '앞' + multiline + '뒤');
      assert.ok(await page.evaluate(() => inputs.includes('chat')));

      await page.locator('#rich-chat').click();
      await page.keyboard.press('End');
      assert.equal(await syntheticPaste(page, '#rich-chat span', ' 추가'), true);
      assert.equal(await page.locator('#rich-chat').innerText(), '기존 추가');
      assert.equal(await page.evaluate(() => pastes.length), 0);

      for (const selector of ['#title', '#search', '#readonly', '#disabled', '#password', '#noneditable']) {
        assert.equal(await syntheticPaste(page, selector, multiline), false, selector);
      }
      assert.equal(await page.locator('#readonly').inputValue(), '읽기 전용');
      assert.equal(await page.locator('#disabled').inputValue(), '비활성');
      assert.equal(await page.locator('#password').inputValue(), '');
      const chatBeforeImage = await page.locator('#chat').inputValue();
      await syntheticPaste(page, '#chat', null, '<img src="example.png">');
      assert.equal(await page.locator('#chat').inputValue(), chatBeforeImage);
      assert.equal(await page.evaluate(() => pastes.at(-1).html), '<img src="example.png">');
      checks++;
    }
    console.log('[paste] Live chat: paste unlock and input notifications preserved; unrelated/read-only inputs untouched (2 hosts)');

    const pasteEntry = manifest.content_scripts.find(entry => entry.js.includes('content/paste-unlock.js'));
    assert.deepEqual(pasteEntry.matches, ['*://play.sooplive.co.kr/*', '*://play.sooplive.com/*']);
    assert.equal(pasteEntry.run_at, 'document_start');
    assert.ok(manifest.content_scripts.some(entry => entry.js.includes('content/selection-unlock.js') && entry.matches.includes('*://*.sooplive.com/*')));
    assert.ok(manifest.content_scripts.some(entry => entry.js.includes('content/soop.js') && entry.matches.includes('*://*.sooplive.com/*')));
    assert.deepEqual(pageErrors, []);
    console.log('[paste] PASS: ' + checks + ' browser scenarios, editor clipboard isolation, read-only copy unlock and manifest scope checks');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
