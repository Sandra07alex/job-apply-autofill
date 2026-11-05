// Runs gmail.js against mock Gmail compose windows: each way of attaching the resume,
// then marking the company as emailed on Send (and follow-ups).
const { chromium } = require('playwright'); const fs = require('fs'); const assert = require('node:assert');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'extension', 'gmail.js'), 'utf8');

// mode: "input"   - Gmail's hidden upload input exists
//       "overlay" - drops on the message are ignored; dragging shows a "Drop files here" layer that takes the drop
//       "clip"    - only the paperclip button, which creates the upload input when clicked
//       "paste"   - only pasting a file into the message works
//       "none"    - nothing works
const compose = (mode) => `<body style="margin:0">
<input name=subjectbox value="Application for Backend Intern – Anu Mathew">
<div role=textbox contenteditable=true aria-label="Message Body" style="height:300px">Dear Hiring Team,<br>I'm writing to apply.</div>
<div id=chips></div>
<div role=button data-tooltip="Attach files" id=clip>📎</div>
<div role=button data-tooltip="Send ‪(Ctrl-Enter)‬">Send</div><div role=button aria-label="More send options">▾</div>
<script>
const mode=${JSON.stringify(mode)};
const show=f=>{const c=document.createElement('div');c.setAttribute('aria-label','Attachment: '+f.name);c.textContent=f.name.slice(0,14)+'… (12K)';document.getElementById('chips').append(c);};
const msg=document.querySelector('[aria-label="Message Body"]');
const watch=i=>i.addEventListener('change',()=>[...i.files].forEach(show));
if(mode==='input'){const i=document.createElement('input');i.type='file';i.name='Filedata';i.style.display='none';document.body.append(i);watch(i);}
if(mode==='overlay')msg.addEventListener('dragenter',()=>{if(document.getElementById('zone'))return;const r=msg.getBoundingClientRect();
 const z=document.createElement('div');z.id='zone';z.textContent='Drop files here';
 Object.assign(z.style,{position:'fixed',left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',background:'rgba(0,0,255,.1)'});
 z.addEventListener('dragover',e=>e.preventDefault());z.addEventListener('drop',e=>{e.preventDefault();[...e.dataTransfer.files].forEach(show);z.remove();});document.body.append(z);});
if(mode==='clip')document.getElementById('clip').addEventListener('click',()=>{const i=document.createElement('input');i.type='file';i.style.display='none';document.body.append(i);watch(i);i.click();});
if(mode==='paste')msg.addEventListener('paste',e=>{const f=e.clipboardData&&e.clipboardData.files;if(f&&f.length){e.preventDefault();[...f].forEach(show);}});
</script></body>`;

const resume = { name: 'Sandra_Resume (20).pdf', type: 'application/pdf', data: 'data:application/pdf;base64,JVBERi0xLjQ=' };

(async () => {
  const browser = await chromium.launch();
  for (const mode of ['input', 'overlay', 'clip', 'paste', 'none']) {
    const page = await browser.newPage();
    const logs = [];
    page.on('console', (m) => m.text().startsWith('Job Apply Autofill') && logs.push(m.text().replace('Job Apply Autofill: attach by ', '')));
    await page.setContent(compose(mode));
    await page.evaluate((resume) => {
      window.__AUTOFILL_TEST__ = {
        resume,
        outreach: { rows: [{ id: 'r1', company: 'Acme Systems', email: 'hr@acme.com', role: 'Backend Intern', status: 'opened' }] },
        applications: [],
      };
      window.__outreachJob = { id: 'r1', company: 'Acme Systems', role: 'Backend Intern', email: 'hr@acme.com' };
    }, resume);
    page.evaluate(src);
    await page.waitForFunction(() => /click Send|download it here/.test(document.body.innerText), null, { timeout: 60000 })
      .catch(async (e) => {
        console.log(`  (${mode}) timed out. Page text:`, JSON.stringify((await page.textContent('body')).slice(-300)), '| log:', logs.join('; '));
        throw e;
      });
    const chips = await page.$$eval('#chips > div', (d) => d.length);
    const fallback = await page.$eval('a[download]', (a) => a.download).catch(() => '');
    console.log(`== gmail attach (${mode}) | attachments: ${chips} | ${logs.join('; ')}${fallback ? ' | offered download: ' + fallback : ''}`);
    if (mode === 'none') assert.deepStrictEqual([chips, fallback], [0, resume.name]);
    else assert.strictEqual(chips, 1, `exactly one attachment for ${mode}`);

    if (mode === 'input') {
      await page.click('[aria-label="More send options"]');
      const beforeSend = await page.evaluate(() => window.__AUTOFILL_TEST__.outreach.rows[0].status);
      await page.click('[data-tooltip^="Send"]');
      await page.waitForTimeout(200);
      const s = await page.evaluate(() => window.__AUTOFILL_TEST__);
      const h = s.outreach.rows[0].history;
      console.log('== gmail send | status:', s.outreach.rows[0].status, '| tracker:', JSON.stringify(s.applications.map((a) => [a.company, a.role, a.status, a.notes])));
      assert.strictEqual(beforeSend, 'opened', '"More send options" must not count as sending');
      assert.strictEqual(s.outreach.rows[0].status, 'sent');
      assert.deepStrictEqual(s.applications.map((a) => [a.company, a.role, a.status]), [['Acme Systems', 'Backend Intern', 'Applied']]);
      assert.deepStrictEqual([h.length, h[0].kind, h[0].subject, h[0].body], [1, 'first', 'Application for Backend Intern – Anu Mathew', "Dear Hiring Team,\nI'm writing to apply."]);
    }
    await page.close();
  }
  // A follow-up: saved in history, status "followed", and no second tracker entry.
  {
    const page = await browser.newPage();
    await page.setContent(compose('input'));
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
    console.log('== gmail follow-up | status:', r.status, '| follow-ups:', r.followUps, '| history:', r.history.map((x) => x.kind).join(', '), '| tracker entries:', s.applications.length);
    assert.deepStrictEqual([r.status, r.followUps, r.history.length, r.history[1].kind, s.applications.length], ['followed', 1, 2, 'followup', 1]);
    await page.close();
  }
  await browser.close();
  console.log('gmail: all checks passed');
})();
