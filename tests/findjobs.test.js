// The real Find jobs page with chrome.storage faked: "Save all" after a search.
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const job = (n, title, company) => ({ title, company, location: 'Kochi', days: 1, url: 'https://jobs.example.com/view/' + n, source: 'Adzuna', fresher: true, where: 3 });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const feed = { at: Date.now(), failed: [], checked: 1, jobs: [job(1, 'Web Developer', 'One Co'), job(2, 'React Developer', 'Two Co'), job(3, 'Python Developer', 'Three Co'), job(4, 'Java Developer', 'Hidden Co')] };
  const existing = { id: 'old', key: 'jobs.example.com/view/2', url: feed.jobs[1].url, status: 'Applied', role: 'React Developer' };
  await page.addInitScript(({ feed, existing }) => {
    const store = { jobSearch: { roles: 'Developer', locations: 'Kochi', level: 'fresher', age: '30' }, jobFeed: feed, jobFeedState: { hidden: ['https://jobs.example.com/view/4'] }, applications: [existing] };
    window.__store = store;
    const pick = (keys) => Object.fromEntries([].concat(keys).map((k) => [k, store[k]]));
    window.chrome = { tabs: { create() {} }, storage: { onChanged: { addListener() {} }, local: {
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

  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log('findjobs: all checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
