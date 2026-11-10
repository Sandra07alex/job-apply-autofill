// The real Find jobs page with chrome.storage faked: "Save all" after a search.
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const job = (n, title, company) => ({ title, company, location: 'Kochi', days: 1, url: 'https://jobs.example.com/view/' + n, source: 'Adzuna', fresher: true, where: 3 });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const feed = { version: 2, at: Date.now(), failed: [], checked: 1, jobs: [job(1, 'Web Developer', 'One Co'), job(2, 'React Developer', 'Two Co'), { ...job(3, 'Python Developer', 'Three Co'), deadline: '2030-11-30' }, job(4, 'Java Developer', 'Hidden Co')] };
  const existing = { id: 'old', key: 'jobs.example.com/view/2', url: feed.jobs[1].url, status: 'Applied', role: 'React Developer' };
  await page.addInitScript(({ feed, existing }) => {
    const store = { jobSearch: { roles: 'Developer', locations: 'Kochi', level: 'fresher', age: '30' }, jobFeed: feed, jobFeedState: { hidden: ['https://jobs.example.com/view/4'] }, applications: [existing] };
    window.__store = store;
    const pick = (keys) => Object.fromEntries([].concat(keys).map((k) => [k, store[k]]));
    const events = () => ({ addListener() {} });
    window.chrome = { tabs: { create: async () => ({ id: 1 }), onCreated: events(), onUpdated: events(), onRemoved: events() }, storage: { onChanged: { addListener() {} }, local: {
      get: (keys, cb) => (cb ? cb(pick(keys)) : Promise.resolve(pick(keys))),
      set: (o) => { Object.assign(store, JSON.parse(JSON.stringify(o))); return Promise.resolve(); } } } };
  }, { feed, existing });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(path.join(__dirname, '../extension/findjobs.html')).href);

  const apps = () => page.evaluate(() => window.__store.applications);
  assert.strictEqual(await page.textContent('#saveAll'), 'Save all 2', 'skips the job already tracked and the hidden job');

  // A filter narrows what gets saved.
  await page.fill('#filterText', 'python');
  assert.strictEqual(await page.textContent('#saveAll'), 'Save all 1');
  await page.fill('#filterText', '');

  await page.click('#saveAll');
  let a = await apps();
  console.log('== findjobs save all |', a.map((x) => `${x.role}: ${x.status}`).join(' | '), '|', await page.textContent('#bulkMsg'));
  assert.strictEqual(a.length, 3);
  assert.strictEqual(a.find((x) => x.id === 'old').status, 'Applied', 'an existing entry is left alone');
  assert.strictEqual(new Set(a.map((x) => x.id)).size, 3, 'every entry has its own id');
  assert.ok(!a.some((x) => x.company === 'Hidden Co'));
  assert.ok(await page.isHidden('#saveAll'), 'nothing left to save');
  assert.strictEqual(await page.textContent('#savedCount'), '2');

  await page.click('#undoAll');
  a = await apps();
  assert.deepStrictEqual(a.map((x) => x.id), ['old'], 'Undo removes only that batch');
  assert.strictEqual(await page.textContent('#saveAll'), 'Save all 2');

  // Last date: carried into Saved, soonest first, and you can type one in.
  assert.ok((await page.textContent('#list')).includes('Apply by 30 Nov'), 'shown on the job');
  await page.click('#saveAll');
  await page.click('[data-tab=saved]');
  assert.ok((await page.textContent('#list .card:first-child')).includes('Python Developer'), 'a job with a date comes first');
  const dates = page.locator('#list input[type=date]');
  assert.strictEqual(await dates.nth(0).inputValue(), '2030-11-30');
  await dates.nth(1).fill('2030-06-01');
  await dates.nth(1).dispatchEvent('change');
  assert.ok((await page.textContent('#list .card:first-child')).includes('Web Developer'), 'typing a sooner date moves it to the top');
  assert.strictEqual((await apps()).find((x) => x.role === 'Web Developer').deadline, '2030-06-01');

  // Search links: one row per city, entry level, and the cities can be changed.
  const rows = () => page.$$eval('.linkrow', (rs) => rs.map((r) => [r.querySelector('b').textContent, ...[...r.querySelectorAll('a')].map((a) => a.href)]));
  let links = await rows();
  assert.deepStrictEqual(links.map((r) => r[0]), ['Kochi', 'India']);
  await page.click('#more summary');
  await page.fill('#linkCities', 'Chennai, Pune, Remote');
  await page.dispatchEvent('#linkCities', 'change');
  links = await rows();
  assert.deepStrictEqual(links.map((r) => r[0]), ['Chennai', 'Pune', 'Remote']);
  assert.strictEqual((await page.evaluate(() => window.__store.jobSearch.linkCities)), 'Chennai, Pune, Remote', 'your cities are remembered');
  const [, li, naukri, indeed, foundit, google] = links[1];
  const liq = new URL(li).searchParams;
  assert.strictEqual(liq.get('location'), 'Pune');
  assert.strictEqual(liq.get('f_E'), '1,2', 'LinkedIn: internship and entry level');
  assert.ok(naukri.includes('-jobs-in-pune?') && new URL(naukri).searchParams.get('experience') === '1', 'Naukri: 1 year');
  assert.ok(/fresher/.test(new URL(indeed).searchParams.get('q')) && /-senior/.test(new URL(indeed).searchParams.get('q')), 'Indeed: fresher, no senior');
  assert.strictEqual(new URL(indeed).searchParams.get('l'), 'Pune');
  assert.ok(foundit.includes('locations=Pune') && foundit.includes('experienceRanges=0~1'), 'Foundit: 0-1 years');
  assert.ok(/Pune/.test(new URL(google).searchParams.get('q')) && /fresher/.test(new URL(google).searchParams.get('q')));
  assert.strictEqual(new URL(links[2][1]).searchParams.get('f_WT'), '2', 'LinkedIn: remote filter on the Remote row');

  assert.deepStrictEqual(errors, []);

  // Adzuna: Apply follows the tab to the employer, even through a tab opened by Adzuna's own Apply button.
  const adz = await browser.newPage();
  const adzFeed = { version: 2, at: Date.now(), failed: [], checked: 1, jobs: [{ ...job(9, 'Web Developer', 'Az Co'), url: 'https://www.adzuna.in/land/ad/9?se=x' }] };
  await adz.addInitScript((feed) => {
    const store = { jobSearch: { roles: 'Developer', locations: 'Kochi', level: 'fresher', age: '30' }, jobFeed: feed, jobFeedState: {}, applications: [] };
    window.__store = store; window.__opened = []; window.__on = {};
    const pick = (keys) => Object.fromEntries([].concat(keys).map((k) => [k, store[k]]));
    const ev = (n) => ({ addListener(f) { window.__on[n] = f; } });
    window.chrome = { tabs: { create: async ({ url }) => { window.__opened.push(url); return { id: 50 + window.__opened.length }; }, onCreated: ev('created'), onUpdated: ev('updated'), onRemoved: ev('removed') },
      storage: { onChanged: { addListener() {} }, local: { get: (keys, cb) => (cb ? cb(pick(keys)) : Promise.resolve(pick(keys))), set: (o) => { Object.assign(store, JSON.parse(JSON.stringify(o))); return Promise.resolve(); } } } };
  }, adzFeed);
  await adz.goto(pathToFileURL(path.join(__dirname, '../extension/findjobs.html')).href);
  assert.ok((await adz.textContent('#list .meta')).includes('via Adzuna'));
  await adz.click('.apply');
  await adz.waitForFunction(() => window.__opened.length === 1);
  const entry = () => adz.evaluate(() => window.__store.applications);
  await adz.evaluate(() => {
    window.__on.updated(51, { status: 'complete' }, { url: 'https://www.adzuna.in/details/9' }); // still on Adzuna: not moved
    window.__on.created({ id: 60, openerTabId: 51 });
    window.__on.updated(60, { status: 'complete' }, { url: 'https://acme.keka.com/careers/job/9?src=adzuna' });
  });
  await adz.waitForFunction(() => window.__store.applications[0].url.includes('keka'));
  let e = await entry();
  console.log('== findjobs adzuna |', e[0].key, '|', e[0].adzunaKey);
  assert.strictEqual(e.length, 1);
  assert.strictEqual(e[0].key, 'acme.keka.com/careers/job/9', 'the same key the form fill will use');
  assert.strictEqual(await adz.textContent('#list .small button'), 'Saved ✓', 'still shown as saved');
  assert.ok(await adz.isHidden('#saveAll'), 'Save all will not add it again');
  await adz.click('.apply');
  await adz.waitForFunction(() => window.__opened.length === 2);
  assert.ok((await adz.evaluate(() => window.__opened[1])).includes('keka'), 'second Apply goes straight to the employer');

  // Filters: apply at once to the list already found, no new search, and are remembered.
  const fil = await browser.newPage();
  const filJobs = [{ ...job(20, 'Graduate Developer', 'A'), days: 0, years: 0 }, { ...job(21, 'Developer', 'B'), days: 5, years: null, fresher: false },
    { ...job(22, 'Developer II', 'C'), days: 2, years: 3, fresher: false, midLevel: true }, { ...job(23, 'Senior Developer', 'D'), days: 2, years: 8, fresher: false, senior: true },
    { ...job(24, 'Web Developer', 'E'), days: null, years: 1, fresher: false }, { ...job(25, 'Old Developer', 'F'), days: 25, years: 0, fresher: false }];
  await fil.addInitScript((feed) => {
    const store = { jobSearch: { roles: 'Developer', locations: 'Kochi', level: 'fresher', age: '30' }, jobFeed: feed, jobFeedState: {}, applications: [] };
    window.__store = store; window.__fetches = 0;
    const realFetch = window.fetch; window.fetch = (...a) => { window.__fetches++; return realFetch(...a); };
    const pick = (keys) => Object.fromEntries([].concat(keys).map((k) => [k, store[k]]));
    const ev = () => ({ addListener() {} });
    window.chrome = { tabs: { create: async () => ({ id: 1 }), onCreated: ev(), onUpdated: ev(), onRemoved: ev() },
      storage: { onChanged: { addListener() {} }, local: { get: (keys, cb) => (cb ? cb(pick(keys)) : Promise.resolve(pick(keys))), set: (o) => { Object.assign(store, JSON.parse(JSON.stringify(o))); return Promise.resolve(); } } } };
  }, { version: 2, at: Date.now(), failed: [], checked: 1, jobs: filJobs });
  await fil.goto(pathToFileURL(path.join(__dirname, '../extension/findjobs.html')).href);
  const titles = () => fil.$$eval('#list a.title', (a) => a.map((x) => x.textContent).sort());
  assert.deepStrictEqual(await titles(), ['Developer', 'Graduate Developer', 'Old Developer', 'Web Developer'], 'fresher: no level 2, no senior');
  assert.strictEqual(await fil.textContent('#filterInfo'), 'Showing 4 of 6 found');
  await fil.selectOption('#level', 'junior');
  assert.ok((await titles()).includes('Developer II'), 'up to 3 years');
  assert.ok(!(await titles()).includes('Senior Developer'));
  await fil.selectOption('#level', 'any');
  assert.strictEqual((await titles()).length, 6);
  assert.strictEqual(await fil.textContent('#saveAll'), 'Save all 6');
  await fil.selectOption('#age', '3');
  assert.deepStrictEqual(await titles(), ['Developer II', 'Graduate Developer', 'Senior Developer', 'Web Developer'], 'an undated job stays, older ones go');
  assert.ok((await fil.textContent('#list')).includes('posting date not listed'));
  await fil.check('#confirmed');
  assert.ok(!(await titles()).includes('Web Developer'), 'undated job hidden when dates are required');
  assert.strictEqual(await fil.textContent('#saveAll'), 'Save all 3', 'Save all follows the filters');
  assert.strictEqual(await fil.evaluate(() => window.__fetches), 0, 'no new search');
  assert.deepStrictEqual(await fil.evaluate(() => { const { level, age, confirmed } = window.__store.jobSearch; return { level, age, confirmed }; }), { level: 'any', age: '3', confirmed: true });
  assert.ok((await fil.$eval('.linkrow a', (a) => a.href)).includes('r259200'), 'search links follow the filter');
  await fil.click('[data-tab=saved]');
  assert.ok(await fil.isHidden('#filters'), 'filters are for the Jobs tab');
  await browser.close();
  console.log('findjobs: all checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
