// "Find jobs": a list of matching jobs from companies' public job feeds (jobfeed.js),
// plus search links for sites that can't be read (LinkedIn, Naukri, Indeed...).
const $ = (id) => document.getElementById(id);
const enc = encodeURIComponent;
const list = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const KERALA = /kerala|kochi|cochin|ernakulam|trivandrum|thiruvananthapuram|kozhikode|calicut|thrissur|kannur|kollam/i;
const STALE_MS = 12 * 3600e3; // refresh by itself when the list is older than this

let settings = { roles: "", locations: "", level: "fresher", age: "7" };
// feed: last results; seen: job links shown before ("New" = not seen); hidden: links you hid;
// custom: companies you added; removed: companies you skipped.
let feed = null, seen = new Set(), hidden = new Set(), custom = [], removed = new Set(), adzuna = { id: "", key: "" };
let applications = [];
let view = "all";

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
}

// ---------- Companies ----------
function companies() {
  const byId = new Map();
  for (const c of [...JobFeed.STARTER_COMPANIES, ...custom]) byId.set(c[0] + ":" + c[1], c);
  // Career sites of jobs you saved or applied to.
  for (const a of applications) {
    const c = a.url && JobFeed.parseCareerUrl(a.url);
    if (c && !byId.has(c[0] + ":" + c[1])) byId.set(c[0] + ":" + c[1], [c[0], c[1], a.company || c[2]]);
  }
  return [...byId.values()];
}
const activeCompanies = () => companies().filter((c) => !removed.has(c[0] + ":" + c[1]));

function renderCompanies() {
  const box = $("companies");
  box.innerHTML = "";
  const all = companies();
  $("coCount").textContent = `${all.length - [...removed].filter((k) => all.some((c) => c[0] + ":" + c[1] === k)).length} companies`;
  for (const c of all.slice().sort((a, b) => a[2].localeCompare(b[2]))) {
    const k = c[0] + ":" + c[1], off = removed.has(k);
    const b = el("button", { textContent: off ? "+" : "×", title: off ? "Check again" : "Skip this company" });
    b.onclick = () => { off ? removed.delete(k) : removed.add(k); saveState(); renderCompanies(); };
    box.append(el("span", { className: "co" + (off ? " off" : ""), title: c[0] }, c[2], b));
  }
}

$("addCo").onclick = () => {
  const c = JobFeed.parseCareerUrl($("addUrl").value.trim());
  if (!c) { $("addMsg").textContent = "That doesn't look like a Greenhouse, Lever, Ashby or Workday careers link."; return; }
  if (!custom.some((x) => x[0] === c[0] && x[1] === c[1])) custom.push(c);
  removed.delete(c[0] + ":" + c[1]);
  $("addUrl").value = "";
  $("addMsg").textContent = `Added ${c[2]}. Click "Find jobs now" to include it.`;
  saveState();
  renderCompanies();
};

// ---------- Finding jobs ----------
async function refresh() {
  const roles = list(settings.roles), locations = list(settings.locations);
  if (!roles.length || !locations.length) { $("status").textContent = "Add at least one role and one location above."; return; }
  $("refresh").disabled = true;
  $("progress").hidden = false;
  const cos = activeCompanies();
  $("status").textContent = `Checking ${cos.length} companies…`;
  try {
    const r = await JobFeed.findJobs({
      roles, locations, level: settings.level, maxDays: Number(settings.age), companies: cos,
      adzuna: adzuna.id && adzuna.key ? adzuna : null,
      onProgress: (done, total) => { $("progress").max = total; $("progress").value = done; $("status").textContent = `Checked ${done} of ${total}…`; },
    });
    // "New" = not in the list you saw last time.
    const before = feed ? new Set(feed.jobs.map((j) => j.url)) : null;
    if (before) for (const u of before) seen.add(u);
    feed = { at: Date.now(), jobs: r.jobs, failed: r.failed, checked: r.checked, key: JSON.stringify(settings) };
    saveState();
    view = "all";
    renderJobs();
  } catch (e) {
    $("status").textContent = "Couldn't finish: " + e.message;
  } finally {
    $("refresh").disabled = false;
    $("progress").hidden = true;
  }
}
$("refresh").onclick = refresh;

function ago(ms) {
  const m = Math.round(ms / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
}
const postedText = (d) => (d === null || d === undefined ? "" : d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`);
const savedKeys = () => new Set(applications.map((a) => a.key));

async function saveJob(job) {
  const { applications: apps = [] } = await chrome.storage.local.get("applications");
  const key = JobFeed.jobKeyFor(job.url);
  if (!apps.some((a) => a.key === key)) {
    apps.push({ id: Date.now().toString(36), key, url: job.url, company: job.company, role: job.title, status: "To apply",
      created: today(), updated: today(), appliedOn: "", notes: `Found via Find jobs (${job.source})` });
    await chrome.storage.local.set({ applications: apps });
  }
  applications = apps;
}

function jobRow(job, saved) {
  const title = el("a", { className: "title", href: job.url, target: "_blank", rel: "noopener", textContent: job.title });
  const tags = [];
  if (job.fresher) tags.push(el("span", { className: "tag t-fresher", textContent: "Fresher-friendly" }));
  if (job.midLevel) tags.push(el("span", { className: "tag t-mid", textContent: "Usually 1–3 years", title: "“II” level roles often want some experience; your internship may count." }));
  if (seen.size && !seen.has(job.url)) tags.push(el("span", { className: "tag t-new", textContent: "New" }));
  if (saved) tags.push(el("span", { className: "tag t-saved", textContent: "Saved" }));
  const meta = el("div", { className: "meta", textContent: [job.company, job.location, postedText(job.days), "via " + job.source].filter(Boolean).join(" · ") });
  const apply = el("button", { className: "primary", textContent: "Apply ↗" });
  apply.onclick = async () => { await saveJob(job); chrome.tabs.create({ url: job.url }); renderJobs(); };
  const save = el("button", { textContent: saved ? "Saved" : "Save", disabled: saved, title: "Add to My applications as “To apply”" });
  save.onclick = async () => { await saveJob(job); renderJobs(); };
  const hide = el("button", { textContent: "Hide", title: "Not interested" });
  hide.onclick = () => { hidden.add(job.url); saveState(); renderJobs(); };
  return el("div", { className: "job" }, el("div", { className: "info" }, title, ...tags, meta), el("div", { className: "acts" }, apply, save, hide));
}

const VIEWS = [
  ["all", "All", () => true],
  ["fresher", "Fresher-friendly", (j) => j.fresher],
  ["new", "New", (j) => seen.size > 0 && !seen.has(j.url)],
  ["near", "In your cities", (j) => j.where === 3],
  ["remote", "Remote", (j) => /remote|anywhere|worldwide/i.test(j.location)],
];

function renderJobs() {
  const box = $("jobs");
  box.innerHTML = "";
  $("chips").innerHTML = "";
  if (!feed) {
    $("status").textContent = "";
    box.append(el("p", { className: "empty", textContent: "Click “Find jobs now” to check companies' career sites. It takes about a minute." }));
    return;
  }
  const stale = feed.key !== JSON.stringify(settings);
  $("status").textContent = `Updated ${ago(Date.now() - feed.at)} · ${feed.checked} sources` +
    (feed.failed.length ? ` · couldn't reach ${feed.failed.join(", ")}` : "") + (stale ? " · your filters changed: find again" : "");
  const visible = feed.jobs.filter((j) => !hidden.has(j.url));
  for (const [key, name, test] of VIEWS) {
    const n = visible.filter(test).length;
    if (key !== "all" && !n) continue;
    const b = el("button", { className: "chip" + (view === key ? " on" : "") }, name, el("b", { textContent: n }));
    b.onclick = () => { view = view === key ? "all" : key; renderJobs(); };
    $("chips").append(b);
  }
  const q = $("filterText").value.trim().toLowerCase();
  const test = (VIEWS.find((v) => v[0] === view) || VIEWS[0])[2];
  const shown = visible.filter(test).filter((j) => !q || [j.title, j.company, j.location].join(" ").toLowerCase().includes(q));
  const keys = savedKeys();
  shown.forEach((j) => box.append(jobRow(j, keys.has(JobFeed.jobKeyFor(j.url)))));
  if (!shown.length) {
    box.append(el("p", { className: "empty", textContent: visible.length
      ? "Nothing in this filter."
      : "No matching jobs right now. Try “Past month”, add more roles or cities, add companies below, or add an Adzuna key for more Indian job sites." }));
  }
}
$("filterText").oninput = renderJobs;

// ---------- Search links for sites that can't be read ----------
const quoted = (roles) => roles.map((r) => `"${r}"`).join(" OR ");
const FRESHER_WORDS = '(fresher OR "entry level" OR junior OR graduate OR "0-2 years")';
function google(q, days) {
  const tbs = days === "1" ? "qdr:d" : days === "7" ? "qdr:w" : "qdr:m";
  return `https://www.google.com/search?q=${enc(q)}&tbs=${tbs}`;
}
function searches(roles, loc, level, days) {
  const remote = /^remote$/i.test(loc), fresher = level === "fresher", top = roles.slice(0, 3), where = remote ? "remote" : loc;
  const out = [];
  const li = new URLSearchParams({ keywords: top.join(" OR "), location: remote ? "India" : loc, f_TPR: "r" + Number(days) * 86400 });
  if (fresher) li.set("f_E", "1,2");
  if (remote) li.set("f_WT", "2");
  out.push(["LinkedIn Jobs", fresher ? "Internship + entry level filter." : "All levels.", "https://www.linkedin.com/jobs/search/?" + li]);
  const nq = new URLSearchParams({ k: top.join(", ") });
  if (!remote) nq.set("l", loc);
  if (fresher) nq.set("experience", "0");
  out.push(["Naukri", fresher ? "0 years experience filter." : "All levels.", `https://www.naukri.com/${slug(top[0])}-jobs${remote ? "" : "-in-" + slug(loc)}?${nq}`]);
  out.push(["Indeed", "Large Indian listing.", `https://in.indeed.com/jobs?q=${enc(top.join(" or ") + (fresher ? " fresher" : ""))}&l=${enc(remote ? "" : loc)}${remote ? "&remotejob=1" : ""}&fromage=${days === "30" ? 14 : days}`]);
  out.push(["Foundit (Monster)", "Another big Indian board.", `https://www.foundit.in/srp/results?query=${enc(top.join(","))}&locations=${enc(remote ? "" : loc)}`]);
  out.push(["Google Jobs", "Postings from many sites in one list.", `https://www.google.com/search?q=${enc(top[0] + (fresher ? " fresher" : "") + " jobs " + where)}&ibp=htl;jobs`]);
  out.push(["Indian startup career sites", "Keka, Darwinbox, Zoho Recruit, Freshteam.",
    google(`(site:keka.com OR site:darwinbox.in OR site:zohorecruit.com OR site:freshteam.com) (${quoted(top)}) ${remote ? "remote" : `"${loc}"`}${fresher ? " " + FRESHER_WORDS : ""}`, days)]);
  out.push(["Startup job boards", "Wellfound, Cutshort, Instahyre.", google(`(site:wellfound.com OR site:cutshort.io OR site:instahyre.com) (${quoted(top)}) ${where}`, days)]);
  if (KERALA.test(loc)) out.push(["Kerala IT parks", "Infopark, Technopark, Cyberpark companies.", google(`(Infopark OR Technopark OR Cyberpark) (${quoted(top)})${fresher ? " " + FRESHER_WORDS : ""} jobs`, days)]);
  out.push(["Hiring posts on LinkedIn", "“We're hiring” posts, often before a job is listed.",
    google(`site:linkedin.com/posts (hiring OR "we're hiring") (${quoted(top)}) ${where}${fresher ? " (fresher OR junior OR graduate)" : ""}`, days)]);
  return out;
}
function renderLinks() {
  const roles = list(settings.roles), locs = list(settings.locations), box = $("results");
  box.innerHTML = "";
  for (const loc of locs) {
    const grid = el("div", { className: "links" });
    for (const [name, note, url] of searches(roles, loc, settings.level, settings.age)) {
      grid.append(el("a", { className: "src", href: url, target: "_blank", rel: "noopener" }, el("b", { textContent: name }), el("span", { textContent: note })));
    }
    box.append(el("div", { className: "loc-head" }, el("h3", { textContent: loc })), grid);
  }
}

// ---------- Settings and storage ----------
function saveState() {
  chrome.storage.local.set({ jobSearch: settings, jobFeed: feed, jobFeedState: { seen: [...seen].slice(-3000), hidden: [...hidden], custom, removed: [...removed], adzuna } });
}
for (const id of ["roles", "locations", "level", "age"]) {
  $(id).addEventListener(id === "roles" || id === "locations" ? "input" : "change", () => { settings[id] = $(id).value; saveState(); renderJobs(); renderLinks(); });
}
for (const [id, k] of [["adzId", "id"], ["adzKey", "key"]]) $(id).addEventListener("input", () => { adzuna[k] = $(id).value.trim(); saveState(); });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.applications) { applications = changes.applications.newValue || []; renderJobs(); }
});

chrome.storage.local.get(["jobSearch", "profile", "jobFeed", "jobFeedState", "applications"], (s) => {
  if (s.jobSearch) settings = { ...settings, ...s.jobSearch };
  else {
    // First visit: roles from your current job, and your city plus Bangalore and Remote.
    const now = ((s.profile && s.profile.experience) || []).find((e) => e.current) || {};
    const base = (now.title || "").replace(/\bintern(ship)?\b/i, "").trim();
    settings.roles = [base, "Software Engineer", "Full Stack Developer"].filter((r, i, a) => r && a.findIndex((x) => x.toLowerCase() === r.toLowerCase()) === i).join(", ");
    const city = s.profile && s.profile.personal && s.profile.personal.city;
    settings.locations = [city, "Bangalore", "Remote"].filter(Boolean).join(", ");
  }
  const st = s.jobFeedState || {};
  seen = new Set(st.seen || []); hidden = new Set(st.hidden || []); custom = st.custom || []; removed = new Set(st.removed || []);
  adzuna = st.adzuna || adzuna;
  applications = s.applications || [];
  feed = s.jobFeed || null;
  for (const id of ["roles", "locations", "level", "age"]) $(id).value = settings[id];
  $("adzId").value = adzuna.id || ""; $("adzKey").value = adzuna.key || "";
  renderCompanies();
  renderJobs();
  renderLinks();
  if (!feed || Date.now() - feed.at > STALE_MS) refresh();
});
