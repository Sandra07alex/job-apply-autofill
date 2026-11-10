// jobfeed.js filtering, with fake feeds instead of the internet.
const assert = require('node:assert');
const F = require('../extension/jobfeed.js');

const feeds = {
  'boards-api.greenhouse.io/v1/boards/acme/jobs': { jobs: [
    { title: 'Software Engineer, New Grad', location: { name: 'Bengaluru' }, absolute_url: 'https://acme.com/jobs?gh_jid=1', first_published: new Date().toISOString() },
    { title: 'Senior Software Engineer', location: { name: 'Bangalore' }, absolute_url: 'https://acme.com/jobs?gh_jid=2', first_published: new Date().toISOString() },
    { title: 'Software Engineer 4', location: { name: 'Bangalore' }, absolute_url: 'https://acme.com/jobs?gh_jid=3', first_published: new Date().toISOString() },
    { title: 'Sales Engineer', location: { name: 'Kochi' }, absolute_url: 'https://acme.com/jobs?gh_jid=4', first_published: new Date().toISOString() },
    { title: 'Software Engineer', location: { name: 'Remote - US' }, absolute_url: 'https://acme.com/jobs?gh_jid=5', first_published: new Date().toISOString() },
    { title: 'Software Engineer', location: { name: 'Kochi, Kerala' }, absolute_url: 'https://acme.com/jobs?gh_jid=6', first_published: '2020-01-01T00:00:00Z' },
  ] },
  'api.lever.co/v0/postings/beta?mode=json': [
    { text: 'Web Developer', categories: { location: 'Cochin' }, hostedUrl: 'https://jobs.lever.co/beta/a', createdAt: Date.now(), descriptionPlain: '0-2 years of experience' },
    { text: 'Full Stack Developer', categories: { location: 'Bangalore' }, hostedUrl: 'https://jobs.lever.co/beta/b', createdAt: Date.now(), descriptionPlain: 'You have 4+ years of experience building web apps.' },
  ],
  'wd.example.wd1.myworkdayjobs.com/wday/cxs/wd/Ext/jobs': { jobPostings: [
    { title: 'Associate Software Developer - Java Full Stack', externalPath: '/job/Chennai/X_1', locationsText: 'IND - Chennai, India', postedOn: 'Posted 2 Days Ago' },
    { title: 'Associate Software Developer - Java Full Stack', externalPath: '/job/Chennai/X_1b', locationsText: 'IND - Chennai, India', postedOn: 'Posted 2 Days Ago' },
    { title: 'Software Engineer II', externalPath: '/job/Pune/Y_2', locationsText: '3 Locations', postedOn: 'Posted 5 Days Ago' },
  ] },
};
// Remote is in the locations, so Remotive is read too.
for (const role of ['Software Engineer', 'Full Stack Developer', 'web development']) feeds['remotive.com/api/remote-jobs?search=' + encodeURIComponent(role) + '&limit=50'] = { jobs: [] };
const fakeFetch = async (url) => {
  const key = url.replace(/^https:\/\//, '');
  const body = feeds[key];
  return { ok: !!body, status: body ? 200 : 404, json: async () => body };
};

(async () => {
  const r = await F.findJobs({
    roles: ['Software Engineer', 'Full Stack Developer', 'web development'], locations: ['Kochi', 'Bangalore', 'Remote'],
    level: 'fresher', maxDays: 30, fetch: fakeFetch, concurrency: 2,
    companies: [['greenhouse', 'acme', 'Acme'], ['lever', 'beta', 'Beta'], ['workday', 'wd.example.wd1.myworkdayjobs.com|wd|Ext', 'WD'], ['lever', 'missing', 'Gone']],
  });
  const titles = r.jobs.map((j) => `${j.title} @ ${j.company}${j.fresher ? ' [fresher]' : ''}`);
  console.log('== jobfeed |', titles.join(' | '), '| failed:', r.failed.join(','));
  assert.deepStrictEqual(r.failed, ['Gone']);
  assert.ok(titles.includes('Software Engineer, New Grad @ Acme [fresher]'));
  assert.ok(titles.includes('Associate Software Developer - Java Full Stack @ WD [fresher]'));
  assert.ok(titles.includes('Web Developer @ Beta'), '"web development" matches "Web Developer"');
  for (const gone of ['Senior Software Engineer', 'Software Engineer 4', 'Sales Engineer']) assert.ok(!titles.some((t) => t.startsWith(gone + ' @')), gone);
  assert.ok(!titles.some((t) => t.startsWith('Full Stack Developer @ Beta')), '4+ years in the description is dropped for freshers');
  assert.strictEqual(r.jobs.filter((j) => j.company === 'Acme' && j.title === 'Software Engineer').length, 0, 'Remote-US and a 2020 posting are dropped');
  assert.strictEqual(r.jobs.filter((j) => j.title.startsWith('Associate Software Developer')).length, 1, 'duplicates removed');
  assert.ok(!r.jobs.some((j) => j.title === 'Software Engineer II'), 'level 2 is not a fresher job');
  assert.strictEqual(r.jobs[0].fresher, true, 'fresher-friendly jobs come first');

  // Adzuna: your city, then all of India over two pages, without showing the key's failure as another source.
  const adzunaCalls = [];
  const adzunaFetch = async (url) => {
    const u = new URL(url), page = u.pathname.split('/').pop();
    adzunaCalls.push({ where: u.searchParams.get('where'), page, what: u.searchParams.get('what'), type: u.searchParams.get('content-type') });
    const created = new Date().toISOString();
    const job = (id, title, display_name) => ({ id, title, company: { display_name: 'Co' }, location: { display_name }, created, redirect_url: 'https://adzuna.example/' + id, description: '' });
    if (u.searchParams.get('where')) return { ok: true, status: 200, json: async () => ({ results: u.searchParams.get('what') === 'Software Engineer' ? [job('k', '<strong>Software</strong> Engineer', 'Ernakulam')] : [] }) };
    const what = u.searchParams.get('what');
    const results = what !== 'Software Engineer' ? [] : page === '1'
      ? Array.from({ length: 50 }, (_, i) => job('p' + i, 'Software Engineer ' + (i ? 'Team ' + i : 'Trainee'), 'Indore, Madhya Pradesh'))
      : [job('p2', 'Software Developer Trainee', 'Nashik')];
    return { ok: true, status: 200, json: async () => ({ results }) };
  };
  const az = await F.findJobs({ roles: ['Software Engineer'], locations: ['Kochi'], level: 'fresher', maxDays: 30, fetch: adzunaFetch, companies: [], adzuna: { id: 'i', key: 'k' } });
  assert.deepStrictEqual(az.failed, []);
  assert.ok(az.jobs.some((j) => j.url.endsWith('/k') && j.title === 'Software Engineer' && j.where === 3), 'Ernakulam counts as Kochi');
  assert.ok(az.jobs.some((j) => j.url.endsWith('/p0') && j.where === 2), 'an Indian city the location check does not know is kept');
  assert.ok(az.jobs.some((j) => j.url.endsWith('/p2')), 'second page of all-India results is read');
  assert.ok(adzunaCalls.length <= 15, 'stays within the request cap');
  assert.ok(adzunaCalls.every((c) => c.type === 'application/json'));
  assert.ok(!adzunaCalls.some((c) => c.what === 'Software Developer' && c.page === '2'), 'no second page when the first was short');

  const badKey = await F.findJobs({ roles: ['Software Engineer'], locations: ['Kochi'], level: 'fresher', maxDays: 30, companies: [], adzuna: { id: 'i', key: 'bad' },
    fetch: async () => ({ ok: false, status: 401, json: async () => ({}) }) });
  assert.deepStrictEqual(badKey.failed, ['Adzuna'], 'a failed Adzuna is named Adzuna, not Remotive');
  assert.strictEqual(badKey.adzunaError, 'HTTP 401');

  // Last date to apply: read when published, closed jobs dropped, never invented.
  for (const [text, want] of [
    ['Last date to apply: 30th Nov 2030', '2030-11-30'],
    ['Applications close:&lt;/strong&gt; 3 Dec 2030&lt;/li&gt;', '2030-12-03'],
    ['Apply by December 5, 2030.', '2030-12-05'],
    ['Application deadline - Friday, 6 December 2030', '2030-12-06'],
    ['Last date: 05/12/2030', '2030-12-05'],
    ['Closing date 2030-01-15', '2030-01-15'],
    ['Apply by 31 Feb 2030', ''],
    ['We closed a funding round on 3 Dec 2030', ''],
    ['Apply today, 5 years of experience', ''],
    ['', ''],
  ]) assert.strictEqual(F.findDeadline(text), want, text);
  const dated = await F.findJobs({ roles: ['Software Engineer'], locations: ['Kochi'], level: 'any', maxDays: 30, companies: [['lever', 'x', 'X'], ['greenhouse', 'y', 'Y']],
    fetch: async (url) => ({ ok: true, status: 200, json: async () => (url.includes('lever') ? [
      { text: 'Software Engineer', categories: { location: 'Kochi' }, hostedUrl: 'https://l/open', createdAt: Date.now(), descriptionPlain: 'Last date to apply: 30 Nov 2030' },
      { text: 'Software Developer', categories: { location: 'Kochi' }, hostedUrl: 'https://l/closed', createdAt: Date.now(), descriptionPlain: 'Last date to apply: 30 Nov 2020' },
      { text: 'Software Programmer', categories: { location: 'Kochi' }, hostedUrl: 'https://l/none', createdAt: Date.now(), descriptionPlain: 'Join us' },
    ] : { jobs: [{ title: 'Web Developer', location: { name: 'Kochi' }, absolute_url: 'https://g/1', first_published: new Date().toISOString(), application_deadline: '2030-10-01T00:00:00Z' }] }) }) });
  const when = Object.fromEntries(dated.jobs.map((j) => [j.url, j.deadline]));
  assert.deepStrictEqual(when, { 'https://l/open': '2030-11-30', 'https://l/none': '', 'https://g/1': '2030-10-01' });

  // Fresher means 1 year or less.
  const byYears = await F.findJobs({ roles: ['Software Engineer'], locations: ['Kochi'], level: 'fresher', maxDays: 30, companies: [], adzuna: { id: 'i', key: 'k' },
    fetch: async (url) => ({ ok: true, status: 200, json: async () => ({ results: url.includes('where=') ? ['0-1 years', '1-3 years', '2+ years', '5 yrs experience'].map((d, i) => ({ title: 'Software Engineer', company: { display_name: 'C' + i }, location: { display_name: 'Kochi' }, created: new Date().toISOString(), redirect_url: 'https://www.adzuna.in/land/ad/' + i, description: d })) : [] }) }) });
  assert.deepStrictEqual(byYears.jobs.map((j) => j.company).sort(), ['C0', 'C1']);

  // Experience: the feeds without a description are read job by job; senior jobs aren't.
  const detailCalls = [];
  const detailed = await F.findJobs({ roles: ['Software Engineer', 'Full Stack Developer'], locations: ['Kochi'], level: 'fresher', maxDays: 30, concurrency: 2, // two roles: Workday returns its job twice
    companies: [['greenhouse', 'g', 'G'], ['smartrecruiters', 's', 'S'], ['workday', 'w.wd1.myworkdayjobs.com|w|Ext', 'W']],
    fetch: async (url) => {
      const u = url.replace('https://', '');
      detailCalls.push(u);
      const body = {
        'boards-api.greenhouse.io/v1/boards/g/jobs': { jobs: [
          { id: 1, title: 'Software Engineer', location: { name: 'Kochi' }, absolute_url: 'https://g/1', first_published: new Date().toISOString() },
          { id: 2, title: 'Software Engineer, Platform', location: { name: 'Kochi' }, absolute_url: 'https://g/2', first_published: new Date().toISOString() },
          { id: 3, title: 'Senior Software Engineer', location: { name: 'Kochi' }, absolute_url: 'https://g/3', first_published: new Date().toISOString() }] },
        'boards-api.greenhouse.io/v1/boards/g/jobs/1': { content: '&lt;p&gt;You have 6+ years of experience, and 1 year of Go.&lt;/p&gt;' },
        'boards-api.greenhouse.io/v1/boards/g/jobs/2': { content: '&lt;p&gt;0-1 years of experience.&lt;/p&gt;' },
        'api.smartrecruiters.com/v1/companies/s/postings?country=in&limit=100&offset=0': { totalFound: 3, content: [
          { id: 'a', name: 'Software Engineer A', releasedDate: new Date().toISOString(), location: { city: 'Kochi', country: 'in' }, experienceLevel: { id: 'mid_senior_level' } },
          { id: 'b', name: 'Software Engineer B', releasedDate: new Date().toISOString(), location: { city: 'Kochi', country: 'in' }, experienceLevel: { id: 'entry_level' } },
          { id: 'c', name: 'Software Engineer C', releasedDate: new Date().toISOString(), location: { city: 'Kochi', country: 'in' }, experienceLevel: { id: 'associate' } }] },
        'api.smartrecruiters.com/v1/companies/s/postings/b': { jobAd: { sections: { qualifications: { text: 'Fresh graduates welcome' } } } },
        'api.smartrecruiters.com/v1/companies/s/postings/c': { jobAd: { sections: { qualifications: { text: '<p>Minimum 4 years experience</p>' } } } },
        'w.wd1.myworkdayjobs.com/wday/cxs/w/Ext/jobs': { jobPostings: [{ title: 'Software Engineer W', externalPath: '/job/1', locationsText: 'Kochi, India', postedOn: 'Posted Today' }] },
        'w.wd1.myworkdayjobs.com/wday/cxs/w/Ext/job/1': { jobPostingInfo: { jobDescription: '<p>Requires 8&#43; years of experience</p>' } },
      }[u];
      return { ok: !!body, status: body ? 200 : 404, json: async () => body };
    } });
  assert.deepStrictEqual(detailed.jobs.map((j) => j.title).sort(), ['Software Engineer B', 'Software Engineer, Platform']);
  assert.strictEqual(detailed.jobs.find((j) => j.title === 'Software Engineer B').fresher, true, "the feed's own entry-level label counts");
  assert.ok(!detailCalls.some((u) => /jobs\/3$|postings\/a$/.test(u)), 'jobs already known to be senior are not looked up');

  // The filters on the page.
  const fits = (job, f) => F.fitsFilters({ days: 3, years: null, ...job }, f);
  for (const title of ['Sr. Software Engineer', 'SWE III', 'Snr Developer', 'Software Engineer L5', 'Developer Level 4', 'Team Leader, Engineering']) {
    const j = (await F.findJobs({ roles: ['Developer', 'Software Engineer'], locations: ['Kochi'], level: 'fresher', maxDays: 30, related: false, companies: [['greenhouse', 't', 'T']],
      fetch: async () => ({ ok: true, status: 200, json: async () => ({ jobs: [{ title, location: { name: 'Kochi' }, absolute_url: 'https://t/1', first_published: new Date().toISOString() }] }) }) })).jobs;
    assert.deepStrictEqual(j, [], title);
  }
  assert.ok(!fits({ days: 31 }, { maxDays: 30 }));
  assert.ok(fits({ days: 30 }, { maxDays: 30 }));
  assert.ok(fits({ days: null }, { maxDays: 1 }), 'no date is kept unless asked otherwise');
  assert.ok(!fits({ days: null }, { maxDays: 1, confirmed: true }));
  assert.ok(!fits({ years: 2 }, { level: 'fresher' }));
  assert.ok(fits({ years: 1 }, { level: 'fresher' }));
  assert.ok(!fits({ midLevel: true }, { level: 'fresher' }));
  assert.ok(fits({ midLevel: true, years: 3 }, { level: 'junior' }));
  assert.ok(!fits({ years: 4 }, { level: 'junior' }));
  assert.ok(!fits({ senior: true }, { level: 'junior' }));
  assert.ok(fits({ senior: true, years: 9 }, { level: 'any' }));
  assert.ok(!fits({}, { level: 'fresher', confirmed: true }), 'experience not stated');
  assert.ok(fits({ fresher: true }, { level: 'fresher', confirmed: true }), 'an entry-level title states it');

  // Small pieces
  assert.strictEqual(F.minYears('You have 5+ years of experience, including 1 year of Go.'), 5);
  assert.strictEqual(F.minYears('5+ years of experience. 2 years of Go experience is a plus.'), 5);
  assert.strictEqual(F.minYears('We have been around for 12 years. 1-2 years of experience needed.'), 1);
  assert.strictEqual(F.minYears('Experience: 0-2 years'), 0);
  assert.deepStrictEqual(F.parseCareerUrl('https://intel.wd1.myworkdayjobs.com/en-US/External/job/India-Bangalore/X_JR1'), ['workday', 'intel.wd1.myworkdayjobs.com|intel|External', 'intel']);
  assert.deepStrictEqual(F.parseCareerUrl('https://job-boards.greenhouse.io/stripe/jobs/123'), ['greenhouse', 'stripe', 'stripe']);
  assert.deepStrictEqual(F.parseCareerUrl('https://jobs.lever.co/cred/abc/apply'), ['lever', 'cred', 'cred']);
  assert.strictEqual(F.parseCareerUrl('https://www.naukri.com/job-listings-x'), null);
  assert.strictEqual(F.minYears('Requires 3-5 years; we are 10 years old'), 3);
  assert.strictEqual(F.postedDaysFromText('Posted Yesterday'), 1);
  // Saved from Find jobs and later filled on the apply page: the same tracker entry.
  assert.strictEqual(F.jobKeyFor('https://intel.wd1.myworkdayjobs.com/en-US/External/job/X_JR1/apply/applyManually'), 'intel.wd1.myworkdayjobs.com/en-US/External/job/X_JR1');
  assert.strictEqual(F.jobKeyFor('https://stripe.com/jobs/search?gh_jid=42&utm=x'), 'stripe.com/jobs/search?gh_jid=42');
  console.log('jobfeed: all checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
