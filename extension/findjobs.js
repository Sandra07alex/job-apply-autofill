// Builds job-search links from your roles, locations, level and recency.
// Only links: the searches run on each site when you open them.
const $ = (id) => document.getElementById(id);
const enc = encodeURIComponent;
const list = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const KERALA = /kerala|kochi|cochin|ernakulam|trivandrum|thiruvananthapuram|kozhikode|calicut|thrissur|kannur|kollam/i;

let settings = { roles: "", locations: "", level: "fresher", age: "7" };

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
}

// ---------- Search links ----------
const quoted = (roles) => roles.map((r) => `"${r}"`).join(" OR ");
const FRESHER_WORDS = '(fresher OR "entry level" OR junior OR graduate OR "0-2 years")';

function google(q, days) {
  const tbs = days === "1" ? "qdr:d" : days === "7" ? "qdr:w" : "qdr:m";
  return `https://www.google.com/search?q=${enc(q)}&tbs=${tbs}`;
}

// Career sites (applicant tracking systems) that companies post on directly.
const ATS_GROUPS = [
  ["Workday career sites", "Big companies (Intel, banks, MNCs) post here first.", ["myworkdayjobs.com"]],
  ["Greenhouse, Lever & Ashby", "Product companies and funded startups.", ["boards.greenhouse.io", "job-boards.greenhouse.io", "jobs.lever.co", "jobs.ashbyhq.com"]],
  ["Indian startup career sites", "Keka, Darwinbox, Zoho Recruit, Freshteam, Rippling.", ["keka.com", "darwinbox.in", "zohorecruit.com", "freshteam.com", "ats.rippling.com"]],
];

function searches(roles, loc, level, days) {
  const remote = /^remote$/i.test(loc);
  const fresher = level === "fresher";
  const top = roles.slice(0, 3);
  const where = remote ? "remote" : loc;
  const out = [];

  // Job boards
  const li = new URLSearchParams({ keywords: top.join(" OR "), location: remote ? "India" : loc,
    f_TPR: "r" + Number(days) * 86400 });
  if (fresher) li.set("f_E", "1,2"); // internship, entry level
  if (remote) li.set("f_WT", "2");
  out.push(["boards", "LinkedIn Jobs", fresher ? "Internship + entry level filter." : "All levels.", "https://www.linkedin.com/jobs/search/?" + li]);

  const nq = new URLSearchParams({ k: top.join(", ") });
  if (!remote) nq.set("l", loc);
  if (fresher) nq.set("experience", "0");
  out.push(["boards", "Naukri", fresher ? "0 years experience filter." : "All levels.",
    `https://www.naukri.com/${slug(top[0])}-jobs${remote ? "" : "-in-" + slug(loc)}?${nq}`]);

  out.push(["boards", "Indeed", "Large Indian listing; posted-within filter.",
    `https://in.indeed.com/jobs?q=${enc(top.join(" or ") + (fresher ? " fresher" : ""))}&l=${enc(remote ? "" : loc)}${remote ? "&remotejob=1" : ""}&fromage=${days === "30" ? 14 : days}`]);

  out.push(["boards", "Foundit (Monster)", "Another big Indian board.",
    `https://www.foundit.in/srp/results?query=${enc(top.join(","))}&locations=${enc(remote ? "" : loc)}`]);

  out.push(["boards", "Google Jobs", "Collects postings from many sites in one list.",
    `https://www.google.com/search?q=${enc(top[0] + (fresher ? " fresher" : "") + " jobs " + where)}&ibp=htl;jobs`]);

  // Company career sites, through Google
  for (const [name, note, sites] of ATS_GROUPS) {
    const q = `(${sites.map((s) => "site:" + s).join(" OR ")}) (${quoted(top)}) ${remote ? "remote" : `"${loc}"`}${fresher ? " " + FRESHER_WORDS : ""}`;
    out.push(["quiet", name, note, google(q, days)]);
  }
  out.push(["quiet", "Startup job boards", "Wellfound, Cutshort, Instahyre.",
    google(`(site:wellfound.com OR site:cutshort.io OR site:instahyre.com) (${quoted(top)}) ${where}`, days)]);
  if (KERALA.test(loc)) {
    out.push(["quiet", "Kerala IT parks", "Companies at Infopark, Technopark and Cyberpark.",
      google(`(Infopark OR Technopark OR Cyberpark) (${quoted(top)})${fresher ? " " + FRESHER_WORDS : ""} jobs`, days)]);
  }
  out.push(["quiet", "Hiring posts on LinkedIn", "“We're hiring” posts by people, often before a job is listed.",
    google(`site:linkedin.com/posts (hiring OR "we're hiring") (${quoted(top)}) ${where}${fresher ? " (fresher OR junior OR graduate)" : ""}`, days)]);
  return out;
}

// ---------- Page ----------
function render() {
  const roles = list(settings.roles), locs = list(settings.locations);
  const box = $("results");
  box.innerHTML = "";
  if (!roles.length || !locs.length) {
    box.append(el("section", {}, el("p", { className: "empty", textContent: "Add at least one role and one location to see searches." })));
    return;
  }
  for (const loc of locs) {
    const items = searches(roles, loc, settings.level, settings.age);
    const open = el("button", { className: "primary", textContent: `Open all ${items.length} in tabs` });
    open.onclick = () => {
      if (items.length > 6 && !confirm(`Open ${items.length} tabs for ${loc}?`)) return;
      items.forEach(([, , , url]) => chrome.tabs.create({ url, active: false }));
    };
    const sec = el("section", {}, el("h2", {}, `${loc}`, open));
    for (const [group, title] of [["boards", "Job boards"], ["quiet", "Company career sites and startup boards"]]) {
      sec.append(el("h3", { textContent: title }));
      const grid = el("div", { className: "links" });
      for (const [g, name, note, url] of items) {
        if (g !== group) continue;
        grid.append(el("a", { className: "src" + (g === "quiet" ? " quiet" : ""), href: url, target: "_blank", rel: "noopener" },
          el("b", { textContent: name }), el("span", { textContent: note })));
      }
      sec.append(grid);
    }
    box.append(sec);
  }
}

function save() { chrome.storage.local.set({ jobSearch: settings }); }

for (const id of ["roles", "locations", "level", "age"]) {
  $(id).addEventListener(id === "roles" || id === "locations" ? "input" : "change", () => {
    settings[id] = $(id).value;
    save();
    render();
  });
}

// First visit: suggest roles from your current job and a location from your profile.
chrome.storage.local.get(["jobSearch", "profile"], ({ jobSearch, profile }) => {
  if (jobSearch) settings = { ...settings, ...jobSearch };
  else {
    const now = ((profile && profile.experience) || []).find((e) => e.current) || {};
    const base = (now.title || "").replace(/\bintern(ship)?\b/i, "").trim();
    const roles = [base, "Software Engineer", "Full Stack Developer"].filter((r, i, a) => r && a.findIndex((x) => x.toLowerCase() === r.toLowerCase()) === i);
    const city = profile && profile.personal && profile.personal.city;
    settings.roles = roles.join(", ");
    settings.locations = [city, "Bangalore", "Remote"].filter(Boolean).join(", ");
  }
  for (const id of ["roles", "locations", "level", "age"]) $(id).value = settings[id];
  render();
});
