// "Find jobs": one simple list. Jobs come from companies' public job feeds (jobfeed.js) and,
// with a free key, Adzuna. Saved jobs (from here or Alt+Shift+S anywhere) are the second tab.
const $ = (id) => document.getElementById(id);
const enc = encodeURIComponent;
const list = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const STALE_MS = 12 * 3600e3; // refresh by itself when the list is older than this
const AGE_TEXT = { 1: "past 24 hours", 7: "past week", 30: "past month" };

let settings = { roles: "", locations: "", level: "fresher", age: "30" };
// feed: last results; seen: links shown before ("New" = not seen); hidden: links you hid;
// custom/removed: companies you added or skipped; adzuna: your free key.
let feed = null, seen = new Set(), hidden = new Set(), custom = [], removed = new Set(), adzuna = { id: "", key: "" };
let applications = [];
let tab = "jobs";

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
}

// ---------- What you're looking for ----------
function renderWhat() {
  const roles = list(settings.roles), locs = list(settings.locations);
  $("what").innerHTML = "";
  $("what").append(
    el("b", { textContent: roles.join(", ") || "No roles yet" }), " · ",
    locs.length ? `${locs.join(", ")} first, then anywhere in India` : "anywhere in India", " · ",
    settings.level === "fresher" ? "fresher / entry level" : "any level", " · ", AGE_TEXT[settings.age] || "");
}
$("change").onclick = () => { $("settings").hidden = !$("settings").hidden; };
$("done").onclick = () => { $("settings").hidden = true; renderWhat(); renderLinks(); refresh(); };
for (const id of ["roles", "locations", "level", "age"]) {
  $(id).addEventListener(id === "roles" || id === "locations" ? "input" : "change", () => { settings[id] = $(id).value; saveState(); renderWhat(); });
}

// ---------- Get more jobs (Adzuna) ----------
function renderMoreJobs() {
  const box = $("moreJobs");
  box.innerHTML = "";
  if (adzuna.id && adzuna.key) { box.hidden = true; return; }
  const id = el("input", { placeholder: "App ID", value: adzuna.id || "" });
  const key = el("input", { placeholder: "App key", value: adzuna.key || "" });
  const go = el("button", { className: "primary", textContent: "Save and find jobs" });
  go.onclick = () => {
    adzuna = { id: id.value.trim(), key: key.value.trim() };
    if (!adzuna.id || !adzuna.key) return;
    saveState(); renderMoreJobs(); refresh();
  };
  const open = el("button", { textContent: "Open Adzuna sign-up" });
  open.onclick = () => chrome.tabs.create({ url: "https://developer.adzuna.com/" });
  const later = el("button", { className: "link", textContent: "Not now" });
  later.onclick = () => { box.hidden = true; };
  box.append(el("b", { textContent: "Get many more jobs, including Kochi and smaller cities" }),
    el("ol", {}, el("li", { textContent: "Sign up free at Adzuna (it collects jobs from many Indian job sites)." }),
      el("li", { textContent: "Copy the App ID and App key from your Adzuna dashboard and paste them here. Takes about 2 minutes." })),
    el("div", { className: "row" }, open, id, key, go, later));
  box.hidden = false;
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
  $("coCount").textContent = activeCompanies().length;
  for (const c of all.slice().sort((a, b) => a[2].localeCompare(b[2]))) {
    const k = c[0] + ":" + c[1], off = removed.has(k);
    const b = el("button", { textContent: off ? "+" : "×", title: off ? "Check again" : "Skip this company" });
    b.onclick = () => { off ? removed.delete(k) : removed.add(k); saveState(); renderCompanies(); };
    box.append(el("span", { className: "co" + (off ? " off" : ""), title: c[0] }, c[2], b));
  }
}
$("addCo").onclick = () => {
  const c = JobFeed.parseCareerUrl($("addUrl").value.trim());
  if (!c) { $("addMsg").textContent = "That doesn't look like a Greenhouse, Lever, Ashby, SmartRecruiters or Workday careers link."; return; }
  if (!custom.some((x) => x[0] === c[0] && x[1] === c[1])) custom.push(c);
  removed.delete(c[0] + ":" + c[1]);
  $("addUrl").value = "";
  $("addMsg").textContent = `Added ${c[2]}. It's included next time you refresh.`;
  saveState();
  renderCompanies();
};

// ---------- Finding jobs ----------
async function refresh() {
  const roles = list(settings.roles);
  if (!roles.length) { $("settings").hidden = false; $("status").textContent = "Add the roles you want first."; return; }
  $("refresh").disabled = true;
  $("progress").hidden = false;
  $("status").textContent = "Looking for jobs…";
  try {
    const r = await JobFeed.findJobs({
      roles, locations: list(settings.locations), level: settings.level, maxDays: Number(settings.age), companies: activeCompanies(),
      adzuna: adzuna.id && adzuna.key ? adzuna : null,
      onProgress: (done, total, soFar) => {
        $("progress").max = total; $("progress").value = done;
        // Show what's found so far, while it keeps looking (first time, or when you have no list yet).
        if (soFar && (!feed || feed.partial)) { feed = { at: Date.now(), jobs: soFar(), failed: [], checked: done, partial: true }; renderList(); }
        $("status").textContent = `Checked ${done} of ${total} sources…`;
      },
    });
    if (feed && feed.partial) feed = null; // the full list replaces the partial one
    if (feed) for (const j of feed.jobs) seen.add(j.url); // "New" = not in the previous list
    feed = { at: Date.now(), jobs: r.jobs, failed: r.failed, checked: r.checked, adzunaError: r.adzunaError };
    saveState();
    showTab("jobs");
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
const postedText = (d) => (d === null || d === undefined ? "" : d === 0 ? "posted today" : d === 1 ? "posted yesterday" : `posted ${d} days ago`);
const savedKeys = () => new Set(applications.map((a) => a.key));
const siteName = (url) => {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    return /linkedin/.test(h) ? "LinkedIn" : /naukri/.test(h) ? "Naukri" : /indeed/.test(h) ? "Indeed" : h;
  } catch (_) { return ""; }
};

async function saveJob(job) {
  const { applications: apps = [] } = await chrome.storage.local.get("applications");
  const key = JobFeed.jobKeyFor(job.url);
  if (!apps.some((a) => a.key === key)) {
    apps.push({ id: Date.now().toString(36), key, url: job.url, company: job.company, role: job.title, location: job.location, status: "To apply",
      created: today(), updated: today(), appliedOn: "", notes: `Found via Find jobs (${job.source})` });
    await chrome.storage.local.set({ applications: apps });
  }
  applications = apps;
}
async function changeApp(id, change) {
  const { applications: apps = [] } = await chrome.storage.local.get("applications");
  applications = change === null ? apps.filter((a) => a.id !== id) : apps.map((a) => (a.id === id ? { ...a, ...change, updated: today() } : a));
  await chrome.storage.local.set({ applications });
  renderList();
}

// One card per job: title, company · city · posted, a big Apply, small Save / Hide.
function jobCard(job, saved) {
  const tags = [];
  if (job.fresher) tags.push(el("span", { className: "tag t-fresher", textContent: "Fresher-friendly" }));
  if (job.midLevel) tags.push(el("span", { className: "tag t-mid", textContent: "Usually 1–3 years" }));
  if (seen.size && !seen.has(job.url)) tags.push(el("span", { className: "tag t-new", textContent: "New" }));
  const apply = el("button", { className: "primary apply", textContent: "Apply" });
  apply.onclick = async () => { await saveJob(job); chrome.tabs.create({ url: job.url }); renderList(); };
  const save = el("button", { className: "link", textContent: saved ? "Saved ✓" : "Save for later", disabled: saved });
  save.onclick = async () => { await saveJob(job); renderList(); };
  const hide = el("button", { className: "link", textContent: "Not interested" });
  hide.onclick = () => { hidden.add(job.url); saveState(); renderList(); };
  return el("div", { className: "card" },
    el("div", { className: "info" },
      el("a", { className: "title", href: job.url, target: "_blank", rel: "noopener", textContent: job.title }), ...tags,
      el("div", { className: "meta", textContent: [job.company, job.location, postedText(job.days)].filter(Boolean).join(" · ") }),
      el("div", { className: "small" }, save, hide)),
    apply);
}

function savedCard(a) {
  const apply = el("button", { className: "primary apply", textContent: "Apply", disabled: !a.url });
  apply.onclick = () => chrome.tabs.create({ url: a.url });
  const done = el("button", { className: "link", textContent: "I applied ✓", title: "Applied already (e.g. LinkedIn Easy Apply)" });
  done.onclick = () => changeApp(a.id, { status: "Applied", appliedOn: today() });
  const remove = el("button", { className: "link", textContent: "Remove" });
  remove.onclick = () => changeApp(a.id, null);
  return el("div", { className: "card" },
    el("div", { className: "info" },
      el("a", { className: "title", href: a.url || "#", target: "_blank", rel: "noopener", textContent: a.role || "(no title)" }),
      el("div", { className: "meta", textContent: [a.company, a.location, a.url && "from " + siteName(a.url)].filter(Boolean).join(" · ") }),
      el("div", { className: "small" }, done, remove)),
    apply);
}

// Says whether your Adzuna key worked, so a wrong key doesn't just look like few jobs.
function adzunaStatus() {
  if (!adzuna.id || !adzuna.key || feed.partial) return "";
  const err = feed.adzunaError;
  if (err) return /40[13]/.test(err) ? " · Adzuna didn't accept your key, check it under More, below" : ` · Adzuna didn't answer (${err})`;
  return ` · ${feed.jobs.filter((j) => j.source === "Adzuna").length} from Adzuna`;
}

function renderList() {
  const box = $("list");
  box.innerHTML = "";
  const q = $("filterText").value.trim().toLowerCase();
  const match = (...parts) => !q || parts.join(" ").toLowerCase().includes(q);
  const jobs = feed ? feed.jobs.filter((j) => !hidden.has(j.url)) : [];
  const saved = applications.filter((a) => a.status === "To apply").sort((a, b) => (b.created || "").localeCompare(a.created || ""));
  $("jobsCount").textContent = jobs.length;
  $("savedCount").textContent = saved.length;

  if (tab === "saved") {
    const shown = saved.filter((a) => match(a.role, a.company, a.location));
    shown.forEach((a) => box.append(savedCard(a)));
    if (!shown.length) box.append(el("p", { className: "empty", textContent: saved.length ? "Nothing matches your filter."
      : "No saved jobs yet. Click “Save for later” on a job, or press Alt+Shift+S on any job page (LinkedIn, Naukri, Indeed…)." }));
    return;
  }
  if (!feed) {
    box.append(el("p", { className: "empty", textContent: "Looking for jobs… this takes about a minute the first time." }));
    return;
  }
  const otherFailed = feed.failed.filter((n) => n !== "Adzuna").length;
  $("status").textContent = `Updated ${ago(Date.now() - feed.at)}` + (otherFailed ? ` · ${otherFailed} source(s) didn't answer` : "") + adzunaStatus();
  const keys = savedKeys();
  const shown = jobs.filter((j) => match(j.title, j.company, j.location));
  shown.forEach((j) => box.append(jobCard(j, keys.has(JobFeed.jobKeyFor(j.url)))));
  if (!shown.length) {
    box.append(el("p", { className: "empty", textContent: jobs.length ? "Nothing matches your filter."
      : "No matching jobs right now. Try “Past month” or more roles (Change, above), or add an Adzuna key for many more jobs." }));
  }
}

function showTab(name) {
  tab = name;
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  renderList();
}
document.querySelectorAll(".tab").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
$("filterText").oninput = renderList;

// ---------- Search links for sites that can't be read ----------
function renderLinks() {
  const roles = list(settings.roles).slice(0, 3), loc = list(settings.locations).find((l) => !/^remote$/i.test(l)) || "India";
  const fresher = settings.level === "fresher", days = settings.age;
  const li = new URLSearchParams({ keywords: roles.join(" OR "), location: loc, f_TPR: "r" + Number(days) * 86400 });
  if (fresher) li.set("f_E", "1,2");
  const nq = new URLSearchParams({ k: roles.join(", "), l: loc });
  if (fresher) nq.set("experience", "0");
  const links = [
    ["LinkedIn Jobs", "https://www.linkedin.com/jobs/search/?" + li],
    ["Naukri", `https://www.naukri.com/${slug(roles[0] || "software engineer")}-jobs-in-${slug(loc)}?${nq}`],
    ["Indeed", `https://in.indeed.com/jobs?q=${enc(roles.join(" or ") + (fresher ? " fresher" : ""))}&l=${enc(loc)}&fromage=${days === "30" ? 14 : days}`],
    ["Foundit", `https://www.foundit.in/srp/results?query=${enc(roles.join(","))}&locations=${enc(loc)}`],
    ["Google Jobs", `https://www.google.com/search?q=${enc((roles[0] || "software engineer") + (fresher ? " fresher" : "") + " jobs " + loc)}&ibp=htl;jobs`],
  ];
  $("links").innerHTML = "";
  for (const [name, url] of links) $("links").append(el("a", { className: "src", href: url, target: "_blank", rel: "noopener" }, name, el("span", { textContent: loc })));
}

// ---------- Storage ----------
function saveState() {
  chrome.storage.local.set({ jobSearch: settings, jobFeed: feed, jobFeedState: { seen: [...seen].slice(-3000), hidden: [...hidden], custom, removed: [...removed], adzuna } });
}
for (const [id, k] of [["adzId2", "id"], ["adzKey2", "key"]]) $(id).addEventListener("input", () => { adzuna[k] = $(id).value.trim(); saveState(); renderMoreJobs(); });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.applications) { applications = changes.applications.newValue || []; renderList(); }
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
  $("adzId2").value = adzuna.id || ""; $("adzKey2").value = adzuna.key || "";
  renderWhat();
  renderMoreJobs();
  renderCompanies();
  renderLinks();
  showTab("jobs");
  if (!feed || Date.now() - feed.at > STALE_MS) refresh();
});
