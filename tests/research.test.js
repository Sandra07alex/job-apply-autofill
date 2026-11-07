// research.js on a fake company site: facts, filtering of slogans and fake news, note ideas.
const assert = require('node:assert');
const R = require('../extension/research.js');

const site = {
  'https://acme.ai': `<html><head><title>Acme | Vision AI for factories</title>
    <meta name="description" content="Acme builds computer vision for manufacturing quality inspection."></head><body>
    <h1>See every defect, before it ships</h1>
    <h2>Acme Opens New Office in Infopark Kochi</h2><h2>Acme Helped Me Secure Funding Fast</h2><h2>Technology should open doors</h2>
    <p>Let's go build something. We use React, Node.js and Python with AWS.</p>
    <a href="/products/inspectr">InspectR — visual inspection</a><a href="/products/connected-operations">Connected Operations</a>
    <a href="/services/ai-automation">AI Automation</a><a href="/about-us">About</a><a href="https://other.com/products/x">Other</a></body></html>`,
  'https://acme.ai/products/inspectr': `<h1>InspectR</h1><h2>Built around your next move</h2><h2>AI visual inspection for factory production lines</h2>`,
  'https://acme.ai/products/connected-operations': `<h1>Built around your next move</h1>`,
  'https://acme.ai/about-us': `<h2>WHY WE EXIST</h2><p>WHY WE EXIST Our mission is to make every factory defect-free. We started in 2019.</p>`,
  'https://acme.ai/services/ai-automation': `<h1>AI Automation</h1>`,
};
const fakeFetch = async (url) => {
  const body = site[url.replace(/\/$/, '')];
  return { ok: !!body, status: body ? 200 : 404, text: async () => body };
};
const profile = {
  job: { skills: 'React.js, Node.js, Python, OpenCV, PyTorch' },
  experience: [{ title: 'Full Stack Developer Intern', company: 'Velvetek Systems', current: true, description: 'Manufacturing Execution System (MES) SaaS platform' }],
};

(async () => {
  const r = await R.research({ site: 'acme.ai', company: 'Acme', profile, fetch: fakeFetch });
  assert.ok(r.ok);
  const f = r.facts;
  console.log('== research | products:', JSON.stringify(f.products.map((p) => [p.name, p.what])), '| news:', JSON.stringify(f.news),
    '| tech:', f.tech.join(','), '| place:', f.place, '| mission:', f.mission);
  assert.deepStrictEqual(f.products.map((p) => [p.name, p.what]), [['InspectR', 'AI visual inspection for factory production lines']],
    'slogan skipped for InspectR; generic "Connected Operations" with no description dropped');
  assert.deepStrictEqual(f.news, ['Acme Opens New Office in Infopark Kochi'], 'testimonial and slogan are not news');
  assert.ok(!f.tech.includes('Golang') && f.tech.includes('React') && f.tech.includes('Node.js'), '"go" in text is not Go');
  assert.deepStrictEqual(f.techOverlap.slice(0, 3), ['React', 'Node.js', 'Python']);
  assert.strictEqual(f.place, 'Kochi');
  assert.strictEqual(f.mission, 'Our mission is to make every factory defect-free.');
  assert.deepStrictEqual(f.services, ['AI Automation']);

  for (const i of r.ideas) console.log(`   [${i.kind}] ...because ${i.text}`);
  assert.strictEqual(r.ideas[0].kind, 'product');
  assert.match(r.ideas[0].text, /^of InspectR, your AI visual inspection for factory production lines\. I build features for a Manufacturing Execution System \(MES\) at Velvetek Systems/);
  assert.ok(r.ideas.some((i) => i.kind === 'tech' && /React, Node\.js and Python/.test(i.text)));
  assert.ok(r.ideas.some((i) => i.kind === 'local' && /Kochi/.test(i.text)));

  const none = await R.research({ site: 'gone.example', company: 'Gone', profile, fetch: fakeFetch });
  assert.deepStrictEqual(none, { ok: false, why: "couldn't open gone.example" });
  console.log('research: all checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
