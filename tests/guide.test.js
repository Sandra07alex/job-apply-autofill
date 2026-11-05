// The step-by-step bar (guide.js + fill.js) on a mock Workday-style application that swaps
// its steps in place: warns about empty fields, notices a step the site refuses, fills each
// new step by itself, and stops at Review without ever clicking Submit.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const assert = require('node:assert');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'extension', f), 'utf8');
const guideSrc = read('guide.js'), fillSrc = read('fill.js');

const profile = { personal: { firstName: 'Anu', lastName: 'Mathew', email: 'anu@x.com' }, job: {},
  education: [], experience: [{ title: 'Intern', company: 'Acme', startMonth: '01', startYear: '2024', current: true }] };

const site = `<body>
<div data-automation-id="progressBarActiveStep">current step 1 of 3 My Information</div>
<main id=step></main><p id=err style="color:red"></p>
<button data-automation-id="bottom-navigation-next-button" id=next>Save and Continue</button>
<script>
window.__submitted=false;
const steps=[
 ['My Information',\`<label for=fn>First Name</label><input id=fn><label for=ln>Last Name</label><input id=ln>
   <label for=hear>How did you hear about us?</label><select id=hear required><option value="">Select</option><option>LinkedIn</option></select>\`],
 ['My Experience',\`<h3>Work Experience 1</h3><label for=jt>Job Title</label><input id=jt><label for=co>Company</label><input id=co>\`],
 ['Review',\`<p>Please review your application.</p>\`]];
let i=0;
function show(){document.getElementById('step').innerHTML=steps[i][1];
 document.querySelector('[data-automation-id=progressBarActiveStep]').textContent='current step '+(i+1)+' of 3 '+steps[i][0];
 const n=document.getElementById('next');n.textContent=i===2?'Submit':'Save and Continue';document.getElementById('err').textContent='';}
document.getElementById('next').onclick=()=>{
 if(i===2){window.__submitted=true;return;}
 const h=document.getElementById('hear');if(i===0&&h&&!h.value){document.getElementById('err').textContent='Error: How did you hear about us? is required';return;}
 setTimeout(()=>{i++;show();},300);};
show();
</script></body>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(site);
  await page.evaluate(([p, guide, fill]) => {
    window.__AUTOFILL_TEST__ = { profile: p };
    window.__AUTOFILL_REFILL__ = () => (0, eval)(fill);
    (0, eval)(guide);
  }, [profile, guideSrc, fillSrc]);
  await page.evaluate(fillSrc); // the first "Fill this page"

  const bar = () => page.evaluate(() => {
    const host = [...document.documentElement.children].find((e) => e.shadowRoot);
    const r = host.shadowRoot;
    return { step: r.querySelector('.step').textContent, counts: r.querySelector('.counts').textContent,
      msg: r.querySelector('.msg').textContent, nextDisabled: r.querySelector('.next').disabled };
  });
  const clickNext = () => page.locator('.next').click(); // Playwright reaches into the open shadow root

  let b = await bar();
  console.log('== step 1 |', b.step, b.counts, '|', b.msg);
  assert.strictEqual(b.step, 'Step: My Information');
  assert.match(b.counts, /Filled 2 · 1 need you/);
  assert.strictEqual(await page.inputValue('#fn'), 'Anu');

  await clickNext();
  b = await bar();
  console.log('   Next with an empty field |', b.msg);
  assert.match(b.msg, /1 field still needs you/);

  await clickNext(); // continue anyway: the site refuses
  await page.waitForTimeout(6500);
  b = await bar();
  console.log('   site refused the step |', b.msg);
  assert.match(b.msg, /Still on this step/);

  await page.selectOption('#hear', 'LinkedIn'); // you answer it
  await clickNext();
  await page.waitForFunction(() => document.getElementById('co') && document.getElementById('co').value === 'Acme' && !window.__autofillRunning, null, { timeout: 15000 });
  b = await bar();
  console.log('== step 2 (filled by itself) |', b.step, b.counts, '| job title:', await page.inputValue('#jt'), '| company:', await page.inputValue('#co'));
  assert.strictEqual(b.step, 'Step: My Experience');
  assert.strictEqual(await page.inputValue('#co'), 'Acme');

  await clickNext();
  await page.waitForFunction(() => /Review/.test(document.body.innerText), null, { timeout: 10000 });
  await page.waitForTimeout(1500);
  b = await bar();
  console.log('== step 3 |', b.step, '| next disabled:', b.nextDisabled, '|', b.msg);
  assert.strictEqual(b.nextDisabled, true);
  assert.match(b.msg, /click Submit yourself/);
  await page.keyboard.press('Alt+Shift+N'); // (no-op here; the real shortcut goes through Chrome)
  assert.strictEqual(await page.evaluate(() => window.__submitted), false, 'never clicks Submit');

  // The × closes the bar and stops guiding.
  await page.locator('.x').click();
  assert.strictEqual(await page.evaluate(() => [...document.documentElement.children].some((e) => e.shadowRoot)), false);
  await browser.close();
  console.log('guide: all checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
