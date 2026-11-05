// Runs gmail.js against mock Gmail compose windows: resume attach (file input and
// drag-and-drop fallback), then marking the company as emailed on Send.
const { chromium } = require('playwright'); const fs = require('fs'); const assert = require('node:assert');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'extension', 'gmail.js'), 'utf8');

const compose = (withInput) => `<body>
<div role=textbox contenteditable=true aria-label="Message Body"></div><div id=chips></div>
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
    await page.close();
  }
  await browser.close();
  console.log('gmail: all checks passed');
})();
