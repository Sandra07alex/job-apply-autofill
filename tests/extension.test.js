// End to end with the real extension loaded in Chromium: "Email companies" -> "Open in Gmail"
// -> (mock) Gmail, which redirects like the real one -> resume attached -> Send recorded.
const { chromium } = require('playwright'); const path = require('path'); const os = require('os'); const fs = require('fs');
const assert = require('node:assert');
const ext = path.join(__dirname, '..', 'extension');

// Gmail-like compose: no upload input until the paperclip is clicked.
const compose = `<!doctype html><title>Compose Mail</title><body>
<input name=subjectbox><div role=textbox contenteditable=true aria-label="Message Body" style="height:300px"></div><div id=chips></div>
<div role=button data-tooltip="Attach files" id=clip>📎</div><div role=button data-tooltip="Send ‪(Ctrl-Enter)‬">Send</div>
<script>
const q=new URLSearchParams(location.search);document.querySelector('[name=subjectbox]').value=q.get('su')||'';
document.querySelector('[aria-label="Message Body"]').innerText=q.get('body')||'';
document.getElementById('clip').addEventListener('click',()=>{const i=document.createElement('input');i.type='file';i.style.display='none';
 document.body.append(i);i.addEventListener('change',()=>[...i.files].forEach(f=>{const c=document.createElement('div');c.textContent=f.name;document.getElementById('chips').append(c);}));i.click();});
</script></body>`;

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jaa-'));
  const ctx = await chromium.launchPersistentContext(dir, { channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
  try {
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent('serviceworker');
    const id = sw.url().split('/')[2];

    // Gmail turns ?view=cm into /mail/u/0/?fs=1...&tf=cm with a redirect.
    const mockGmail = (r) => {
      const u = new URL(r.request().url());
      if (u.pathname === '/mail/' && u.searchParams.get('view') === 'cm') {
        u.searchParams.delete('view'); u.searchParams.set('tf', 'cm');
        const next = 'https://mail.google.com/mail/u/0/?' + u.searchParams;
        return r.fulfill({ contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(next)})</script>` });
      }
      return r.fulfill({ contentType: 'text/html', body: compose });
    };
    await ctx.route('https://mail.google.com/**', mockGmail);

    await sw.evaluate(() => chrome.storage.local.set({
      profile: { personal: { firstName: 'Sandra', lastName: 'Alex', email: 'sandra@example.com' }, job: {}, education: [], experience: [] },
      resume: { name: 'Sandra_Resume (20).pdf', type: 'application/pdf', data: 'data:application/pdf;base64,JVBERi0xLjQ=' },
      outreach: { rows: [{ id: 't', company: 'test', email: 'hr@test.example', role: '', status: 'new', history: [] }] },
    }));
    // Playwright can't intercept pages in tabs the extension opens itself, so the test opens
    // the Gmail tab and "Open in Gmail" is pointed at it (only chrome.tabs.create is replaced).
    const gmail = await ctx.newPage();
    await gmail.goto('https://mail.google.com/mail/u/0/#marker');
    const tabId = await sw.evaluate(async () => (await chrome.tabs.query({})).find((t) => (t.url || '').endsWith('#marker')).id);
    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${id}/outreach.html`);
    let opened = '';
    await page.exposeFunction('__opened', (u) => { opened = u; });
    await page.evaluate((tid) => { chrome.tabs.create = async ({ url }) => { window.__opened(url); return { id: tid }; }; }, tabId);
    await page.click('#rows tr:first-child .acts button.primary');
    await page.waitForTimeout(300);
    assert.match(opened, /&jaa=t$/);
    // Drop the tab-id link so the draft must be found by the "jaa" marker in the address alone.
    await sw.evaluate(() => chrome.storage.session.clear());
    await gmail.goto(opened);
    await gmail.waitForFunction(() => document.body && /Attached|Couldn't attach/.test(document.body.innerText), null, { timeout: 60000 });
    const chips = await gmail.textContent('#chips');
    console.log('== extension: gmail url', new URL(gmail.url()).pathname, '| attachments:', JSON.stringify(chips));
    assert.match(chips, /Sandra_Resume \(20\)\.pdf/);
    const ack = await sw.evaluate(async () => (await chrome.storage.local.get('outreachPending')).outreachPending.t.ack);
    assert.strictEqual(ack, true, 'Gmail tab confirms it picked up the draft');

    await gmail.click('[data-tooltip^="Send"]');
    await gmail.waitForTimeout(500);
    const s = await sw.evaluate(() => chrome.storage.local.get(['outreach', 'applications']));
    const row = s.outreach.rows[0];
    console.log('== extension: after Send | status:', row.status, '| history:', row.history.length, '| tracker:', (s.applications || []).length);
    assert.deepStrictEqual([row.status, row.history.length, s.applications.length], ['sent', 1, 1]);
    const left = await sw.evaluate(async () => (await chrome.storage.local.get('outreachPending')).outreachPending);
    assert.deepStrictEqual(left, {}, 'sent drafts are cleared so reopening the link does nothing');

    // An ordinary Gmail tab (not opened from Email companies) is left alone.
    const plain = await ctx.newPage();
    await plain.goto('https://mail.google.com/mail/u/0/#inbox');
    await plain.waitForTimeout(1500);
    assert.ok(!(await plain.textContent('body')).includes('Attaching'), 'plain Gmail tab must not be touched');
    console.log('extension: all checks passed');
  } finally {
    await ctx.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
