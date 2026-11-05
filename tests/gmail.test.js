// Runs gmail.js against mock Gmail compose windows: resume attach (file input and
// drag-and-drop fallback), then marking the company as emailed on Send.
const { chromium } = require('playwright'); const fs = require('fs'); const assert = require('node:assert');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'extension', 'gmail.js'), 'utf8');

const compose = (withInput) => `<body>
<input name=subjectbox value="Application for Backend Intern – Anu Mathew">
<div role=textbox contenteditable=true aria-label="Message Body">Dear Hiring Team,<br>I'm writing to apply.</div><div id=chips></div>
${withInput ? '<input type=file name=Filedata multiple style="display:none">' : ''}
<div role=button data-tooltip="Send ‪(Ctrl-Enter)‬">Send</div><div role=button aria-label="More send options">▾</div>
<script>
const show=f=>{const c=document.createElement('div');c.textContent=f.name+' (12K)';document.getElementById('chips').append(c);};
const i=document.querySelector('input[name=Filedata]');if(i)i.addEventListener('change',()=>[...i.files].forEach(show));
document.querySelector('[aria-label="Message Body"]').addEventListener('drop',e=>{e.preventDefault();[...e.dataTransfer.files].forEach(show);});
</script></body>`;

(async () => {
  const browser = await chromium.launch();
  for (const [name, withInput] of [['file input', true], ['drop fallback', false]]) {
    const page = await browser.newPage();
    await page.setContent(compose(withInput));
    await page.evaluate(() => {
      window.__AUTOFILL_TEST__ = {
        resume: { name: 'Anu_Resume.pdf', type: 'application/pdf', data: 'data:application/pdf;base64,JVBERi0xLjQ=' },
        outreach: { rows: [{ id: 'r1', company: 'Acme Systems', email: 'hr@acme.com', role: 'Backend Intern', status: 'opened' }] },
        applications: [],
      };
      window.__outreachJob = { id: 'r1', company: 'Acme Systems', role: 'Backend Intern', email: 'hr@acme.com' };
    });
    page.evaluate(src);
    await page.waitForFunction(() => document.body.innerText.includes('Read the email, then click Send'), null, { timeout: 15000 });
    const chips = await page.textContent('#chips');
    await page.click('[aria-label="More send options"]');
    const beforeSend = await page.evaluate(() => window.__AUTOFILL_TEST__.outreach.rows[0].status);
    await page.click('[data-tooltip^="Send"]');
    await page.waitForTimeout(200);
    const s = await page.evaluate(() => window.__AUTOFILL_TEST__);
    console.log(`== gmail (${name})`, '| chips:', chips.trim(), '| status:', s.outreach.rows[0].status, '| tracker:', JSON.stringify(s.applications.map((a) => [a.company, a.role, a.status, a.notes])));
    assert.match(chips, /Anu_Resume\.pdf/);
    assert.strictEqual(beforeSend, 'opened', '"More send options" must not count as sending');
    assert.strictEqual(s.outreach.rows[0].status, 'sent');
    assert.deepStrictEqual(s.applications.map((a) => [a.company, a.role, a.status]), [['Acme Systems', 'Backend Intern', 'Applied']]);
    const h = s.outreach.rows[0].history;
    assert.deepStrictEqual([h.length, h[0].kind, h[0].subject, h[0].body], [1, 'first', 'Application for Backend Intern – Anu Mathew', "Dear Hiring Team,\nI'm writing to apply."]);
    await page.close();
  }
  // A follow-up: saved in history, status "followed", and no second tracker entry.
  {
    const page = await browser.newPage();
    await page.setContent(compose(true));
    await page.evaluate(() => {
      window.__AUTOFILL_TEST__ = {
        outreach: { rows: [{ id: 'r1', company: 'Acme Systems', email: 'hr@acme.com', role: 'Backend Intern', status: 'sent', sentOn: '2026-10-20',
          history: [{ kind: 'first', on: '2026-10-20', subject: 'Application', body: 'Hi' }] }] },
        applications: [{ key: 'email:hr@acme.com:Backend Intern', company: 'Acme Systems', status: 'Applied' }],
      };
      window.__outreachJob = { id: 'r1', company: 'Acme Systems', role: 'Backend Intern', email: 'hr@acme.com', kind: 'followup' };
    });
    page.evaluate(src);
    await page.waitForFunction(() => document.body.innerText.includes('click Send'), null, { timeout: 15000 });
    await page.keyboard.press('Control+Enter'); // not in the message yet, so ignored
    await page.click('[aria-label="Message Body"]');
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(200);
    const s = await page.evaluate(() => window.__AUTOFILL_TEST__);
    const r = s.outreach.rows[0];
    console.log('== gmail (follow-up) | status:', r.status, '| follow-ups:', r.followUps, '| history:', r.history.map((x) => x.kind).join(', '), '| tracker entries:', s.applications.length);
    assert.deepStrictEqual([r.status, r.followUps, r.history.length, r.history[1].kind, s.applications.length], ['followed', 1, 2, 'followup', 1]);
    await page.close();
  }
  await browser.close();
  console.log('gmail: all checks passed');
})();
