// Job feed: reads companies' public job feeds (Greenhouse, Lever, Ashby, Workday),
// Remotive and, with a free key, Adzuna, then keeps the jobs that fit your roles,
// locations, recency and level. These feeds are published for tools to read; job
// boards like LinkedIn, Naukri and Indeed are not read (their terms forbid it).
(function (root) {
  // Companies whose feeds were checked to list jobs in India (Nov 2026). [kind, id, name]
  const STARTER_COMPANIES = [
    ...[["samsara", "Samsara"], ["zscaler", "Zscaler"], ["coinbase", "Coinbase"], ["databricks", "Databricks"], ["stripe", "Stripe"],
      ["twilio", "Twilio"], ["okta", "Okta"], ["mongodb", "MongoDB"], ["toast", "Toast"], ["inmobi", "InMobi"], ["highradius", "HighRadius"],
      ["rubrik", "Rubrik"], ["dropbox", "Dropbox"], ["airbnb", "Airbnb"], ["devrev", "DevRev"], ["razorpaysoftwareprivatelimited", "Razorpay"],
      ["glance", "Glance"], ["hackerrank", "HackerRank"], ["netskope", "Netskope"], ["elastic", "Elastic"], ["druva", "Druva"], ["agoda", "Agoda"],
      ["groww", "Groww"], ["observeai", "Observe.AI"], ["slice", "slice"], ["figma", "Figma"], ["thoughtworks", "Thoughtworks"],
      ["cloudflare", "Cloudflare"], ["gitlab", "GitLab"]].map(([id, name]) => ["greenhouse", id, name]),
    ...[["hevodata", "Hevo Data"], ["zeta", "Zeta"], ["cred", "CRED"], ["nium", "Nium"], ["outreach", "Outreach"]].map(([id, name]) => ["lever", id, name]),
    ...[["sarvam", "Sarvam AI"], ["atlan", "Atlan"], ["composio", "Composio"], ["perplexity", "Perplexity"],
      ["airwallex", "Airwallex"]].map(([id, name]) => ["ashby", id, name]),
    // Added Nov 2026: Indian product companies and startups (checked to list India jobs).
    ...[["sigmoid", "Sigmoid"], ["zenoti", "Zenoti"], ["zetaglobal", "Zeta Global"], ["nasdaq", "Nasdaq"]].map(([id, name]) => ["greenhouse", id, name]),
    ...[["paytm", "Paytm"], ["meesho", "Meesho"], ["mindtickle", "Mindtickle"], ["pocketfm", "Pocket FM"]].map(([id, name]) => ["lever", id, name]),
    ...[["tekion", "Tekion"], ["bureau", "Bureau"], ["spotdraft", "SpotDraft"]].map(([id, name]) => ["ashby", id, name]),
    ...[["swiggy", "Swiggy"], ["BoschGroup", "Bosch"], ["ServiceNow", "ServiceNow"], ["LinkedIn3", "LinkedIn"], ["freshworks", "Freshworks"],
      ["Ubisoft2", "Ubisoft"], ["unacademy", "Unacademy"], ["whatfix", "Whatfix"], ["upstox", "Upstox"], ["nobroker", "NoBroker"], ["cars24", "Cars24"],
      ["newtonschool", "Newton School"], ["interviewbit", "InterviewBit"], ["freecharge", "Freecharge"]].map(([id, name]) => ["smartrecruiters", id, name]),
    ...[["intel.wd1.myworkdayjobs.com|intel|External", "Intel"], ["nvidia.wd5.myworkdayjobs.com|nvidia|NVIDIAExternalCareerSite", "NVIDIA"],
      ["salesforce.wd12.myworkdayjobs.com|salesforce|External_Career_Site", "Salesforce"], ["adobe.wd5.myworkdayjobs.com|adobe|external_experienced", "Adobe"],
      ["mastercard.wd1.myworkdayjobs.com|mastercard|CorporateCareers", "Mastercard"], ["hp.wd5.myworkdayjobs.com|hp|ExternalCareerSite", "HP"],
      ["paypal.wd1.myworkdayjobs.com|paypal|jobs", "PayPal"], ["target.wd5.myworkdayjobs.com|target|targetcareers", "Target"],
      ["micron.wd1.myworkdayjobs.com|micron|External", "Micron"], ["analogdevices.wd1.myworkdayjobs.com|analogdevices|External", "Analog Devices"],
      ["nxp.wd3.myworkdayjobs.com|nxp|careers", "NXP"], ["citi.wd5.myworkdayjobs.com|citi|2", "Citi"],
      ["accenture.wd103.myworkdayjobs.com|accenture|AccentureCareers", "Accenture"], ["boeing.wd1.myworkdayjobs.com|boeing|EXTERNAL_CAREERS", "Boeing"],
      ["philips.wd3.myworkdayjobs.com|philips|jobs-and-careers", "Philips"], ["cadence.wd1.myworkdayjobs.com|cadence|External_Careers", "Cadence"],
      ["motorolasolutions.wd5.myworkdayjobs.com|motorolasolutions|Careers", "Motorola Solutions"],
      ["guidewire.wd5.myworkdayjobs.com|guidewire|external", "Guidewire"], ["sprinklr.wd1.myworkdayjobs.com|sprinklr|careers", "Sprinklr"],
      ["workday.wd5.myworkdayjobs.com|workday|Workday", "Workday"], ["thomsonreuters.wd5.myworkdayjobs.com|thomsonreuters|External_Career_Site", "Thomson Reuters"],
      ["broadcom.wd1.myworkdayjobs.com|broadcom|External_Career", "Broadcom"]].map(([id, name]) => ["workday", id, name]),
  ];

  // ---------- Recognising a career page you paste or applied on ----------
  function parseCareerUrl(url) {
    let u;
    try { u = new URL(url); } catch (_) { return null; }
    const parts = u.pathname.split("/").filter(Boolean);
    if (/(^|\.)greenhouse\.io$/.test(u.hostname)) {
      const id = u.hostname.startsWith("boards-api") ? parts[2] : (parts[0] === "embed" ? u.searchParams.get("for") : parts[0]);
      return id ? ["greenhouse", id, id] : null;
    }
    if (u.hostname === "jobs.lever.co" && parts[0]) return ["lever", parts[0], parts[0]];
    if (u.hostname === "jobs.ashbyhq.com" && parts[0]) return ["ashby", parts[0], parts[0]];
    if (/^(jobs|careers)\.smartrecruiters\.com$/.test(u.hostname) && parts[0]) return ["smartrecruiters", parts[0], parts[0]];
    const wd = u.hostname.match(/^([\w-]+)\.wd\d+\.myworkdayjobs\.com$/);
    if (wd) {
      const site = /^[a-z]{2}-[A-Z]{2}$/.test(parts[0] || "") ? parts[1] : parts[0];
      return site ? ["workday", `${u.hostname}|${wd[1]}|${site}`, wd[1]] : null;
    }
    return null;
  }

  // ---------- Matching ----------
  const stem = (w) => (w.length >= 5 ? w.slice(0, 5) : w);
  const words = (s) => String(s || "").toLowerCase().replace(/full[\s-]?stack/g, "fullstack").replace(/front[\s-]?end/g, "frontend")
    .replace(/back[\s-]?end/g, "backend").split(/[^a-z0-9+#.]+/).filter((w) => w && !["and", "or", "of", "the", "a", "an", "in", "for", "&", "-"].includes(w));
  const GENERIC = new Set(["engin", "devel", "progr", "sde", "swe", "intern"]);

  // "Software Engineer" matches "Software Development Engineer" and "Software Engineering Intern";
  // "web development" matches "Web Developer". Each role's specific words must all appear.
  function roleMatcher(roles) {
    const parsed = roles.map((r) => {
      const ws = words(r).map(stem);
      return { specific: ws.filter((w) => !GENERIC.has(w)), generic: ws.filter((w) => GENERIC.has(w)) };
    });
    return (title) => {
      const t = new Set(words(title.replace(/\bsde\b|\bswe\b/gi, "software engineer")).map(stem));
      const anyGeneric = [...t].some((w) => GENERIC.has(w));
      // A role's own kind of word must be there too ("Trainee Engineer" needs "engineer"), so
      // "Training Developer" doesn't match it. Synonyms come from relatedRoles().
      return parsed.some((p) => p.specific.length
        ? p.specific.every((w) => t.has(w)) && (p.generic.every((w) => t.has(w)) || (!p.generic.length && anyGeneric))
        : p.generic.every((w) => t.has(w)));
    };
  }

  // Titles software freshers are hired under, added when your roles are software roles.
  const RELATED_SOFTWARE = ["Software Developer", "Software Development Engineer", "SDE", "Associate Software Engineer", "Associate Engineer",
    "Graduate Engineer Trainee", "Trainee Engineer", "Software Engineer Intern", "Backend Developer", "Backend Engineer", "Frontend Developer",
    "Frontend Engineer", "Full Stack Developer", "Full Stack Engineer", "Web Developer", "React Developer", "Node.js Developer", "Python Developer",
    "JavaScript Developer", "Mobile Developer", "React Native Developer", "Application Developer", "Programmer"];
  function relatedRoles(roles) {
    const software = roles.some((r) => /software|developer|engineer|programmer|full ?stack|web|backend|frontend|sde/i.test(r));
    return software ? [...new Set([...roles, ...RELATED_SOFTWARE])] : roles;
  }

  const CITY_ALIASES = [["bangalore", "bengaluru"], ["kochi", "cochin", "ernakulam", "infopark"], ["trivandrum", "thiruvananthapuram", "technopark"],
    ["gurgaon", "gurugram"], ["calicut", "kozhikode", "cyberpark"], ["mumbai", "bombay"], ["chennai", "madras"], ["delhi", "new delhi", "ncr"]];
  const INDIA_RE = /\bindia\b|\bind\b|bengaluru|bangalore|hyderabad|pune|chennai|mumbai|gurugram|gurgaon|noida|delhi|kochi|cochin|trivandrum|thiruvananthapuram|kerala|ahmedabad|kolkata|jaipur|karnataka|telangana|tamil nadu|maharashtra|haryana/i;
  const REMOTE_RE = /remote|anywhere|worldwide|work from home|wfh/i;
  const OPEN_REMOTE_RE = /worldwide|anywhere|global|\bindia\b|asia|apac/i;

  // Returns how well a job's location fits: 3 your city, 2 elsewhere in India / several
  // locations, 1 remote you can take from India, 0 no.
  function locationScore(loc, wanted) {
    const l = String(loc || "").toLowerCase();
    const cities = wanted.filter((w) => !/^remote$/i.test(w)).map((w) => w.toLowerCase());
    for (const c of cities) {
      const names = CITY_ALIASES.find((g) => g.some((n) => c.includes(n))) || [c];
      if (names.some((n) => l.includes(n))) return 3;
    }
    if (REMOTE_RE.test(l)) {
      if (!wanted.some((w) => /^remote$/i.test(w))) return INDIA_RE.test(l) ? 2 : 0;
      // "Remote - US" is no good from India; "Remote, India" or "Worldwide" is.
      return INDIA_RE.test(l) || OPEN_REMOTE_RE.test(l) || /^remote$/i.test(l.trim()) ? 1 : 0;
    }
    if (INDIA_RE.test(l) || /^\d+ locations$/i.test(l.trim())) return 2;
    return 0;
  }

  // Senior titles, including company levels: "Engineer 4", Salesforce SMTS/LMTS/PMTS, "AVP".
  const SENIOR_RE = /\b(senior|sr\.?|lead|principal|staff|manager|director|head|architect|vp|avp|vice president|chief|distinguished|fellow|expert|iii|iv|smts|lmts|pmts)\b|\b(engineer|developer|sde)[\s-]*([3-9]|v)\b/i;
  const FRESHER_RE = /\b(intern|internship|graduate|grad|new grad|fresher|junior|jr\.?|entry|trainee|apprentice|associate|campus|university|amts)\b|\b(engineer|developer|sde)[\s-]*(i|1)\b/i;

  // Smallest "N years" the description asks for, e.g. "3+ years" -> 3, "0-2 years" -> 0.
  function minYears(text) {
    let min = null;
    for (const m of String(text || "").matchAll(/(\d{1,2})\s*(?:\+|plus)?\s*(?:(?:-|to|–)\s*\d{1,2}\s*)?\+?\s*(?:years?|yrs?)\b(?!\s+old\b)/gi)) { // not "10 years old"
      const n = Number(m[1]);
      if (n <= 20 && (min === null || n < min)) min = n;
    }
    return min;
  }

  // ---------- Last date to apply ----------
  const localToday = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
  const DEADLINE_LABEL = "(?:last date(?:\\s+(?:to|for|of)\\s+[a-z]+(?:\\s+[a-z]+)?)?|apply (?:by|before|on or before)|applications? deadline|deadline(?:\\s+(?:to|for)\\s+[a-z]+)?" +
    "|closing date(?:\\s+for\\s+applications?)?|applications? (?:close|closes|closing)(?:\\s+on)?)[\\s:–—-]*(?:is\\s+|on\\s+|by\\s+)?(?:[a-z]+day,?\\s+)?";
  const DEADLINE_FORMS = [
    [new RegExp(DEADLINE_LABEL + "(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?" + MONTH + "[,\\s]*(\\d{4})?", "i"), (m) => [m[3], m[2], m[1]]],
    [new RegExp(DEADLINE_LABEL + MONTH + "\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})?", "i"), (m) => [m[3], m[1], m[2]]],
    [new RegExp(DEADLINE_LABEL + "(\\d{4})-(\\d{2})-(\\d{2})", "i"), (m) => [m[1], m[2], m[3]]],
    [new RegExp(DEADLINE_LABEL + "(\\d{1,2})[/.-](\\d{1,2})[/.-](\\d{4}|\\d{2})\\b", "i"), (m) => [m[3], m[2], m[1]]], // day first, as in India
  ];
  const monthNumber = (m) => (/^\d+$/.test(m) ? Number(m) : "janfebmaraprmayjunjulaugsepoctnovdec".indexOf(m.slice(0, 3).toLowerCase()) / 3 + 1);

  // "Last date to apply: 30th Nov 2026" -> "2026-11-30". "" when the text doesn't state one.
  function findDeadline(text) {
    const plain = String(text || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    for (const [re, parts] of DEADLINE_FORMS) {
      const m = plain.match(re);
      if (!m) continue;
      const [y, mon, d] = parts(m), month = monthNumber(mon), day = Number(d);
      let year = y ? Number(y) + (y.length === 2 ? 2000 : 0) : new Date().getFullYear();
      // No year given, and the date is long gone: it means next year.
      if (!y && Date.UTC(year, month - 1, day) < Date.now() - 60 * 864e5) year++;
      const date = new Date(Date.UTC(year, month - 1, day));
      if (date.getUTCMonth() === month - 1 && date.getUTCDate() === day) return date.toISOString().slice(0, 10);
    }
    return "";
  }

  // ---------- Reading the feeds ----------
  const DAY = 864e5;
  function postedDaysFromText(t) {
    const s = String(t || "").toLowerCase();
    if (/today|just now|hours? ago/.test(s)) return 0;
    if (/yesterday/.test(s)) return 1;
    const m = s.match(/(\d+)\+?\s*days?/);
    return m ? Number(m[1]) + (/\+/.test(s) ? 1 : 0) : null;
  }
  const daysSince = (date) => (date ? Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / DAY)) : null);

  async function getJson(fetchFn, url, init) {
    const r = await fetchFn(url, { ...init, signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  // Each returns [{ title, company, location, days, url, source, text }]
  const READERS = {
    async greenhouse(fetchFn, id, name) {
      const d = await getJson(fetchFn, `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(id)}/jobs`);
      return (d.jobs || []).map((j) => ({ title: j.title, company: j.company_name || name, location: (j.location && j.location.name) || "",
        days: daysSince(j.first_published || j.updated_at), url: j.absolute_url, source: "Greenhouse",
        deadline: j.application_deadline ? String(j.application_deadline).slice(0, 10) : "" }));
    },
    async lever(fetchFn, id, name) {
      const d = await getJson(fetchFn, `https://api.lever.co/v0/postings/${encodeURIComponent(id)}?mode=json`);
      return (Array.isArray(d) ? d : []).map((j) => {
        const c = j.categories || {};
        return { title: j.text, company: name, location: [c.location, ...(c.allLocations || []), j.workplaceType === "remote" ? "Remote" : ""].filter(Boolean).join(", "),
          days: daysSince(j.createdAt), url: j.hostedUrl, source: "Lever",
          text: [j.descriptionPlain, ...(j.lists || []).map((l) => (l.text || "") + " " + String(l.content || "").replace(/<[^>]+>/g, " "))].join(" ") };
      });
    },
    async ashby(fetchFn, id, name) {
      const d = await getJson(fetchFn, `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(id)}`);
      return (d.jobs || []).filter((j) => j.isListed !== false).map((j) => ({ title: j.title, company: name,
        location: [j.location, ...(j.secondaryLocations || []).map((x) => x.location), j.isRemote ? "Remote" : ""].filter(Boolean).join(", "),
        days: daysSince(j.publishedAt), url: j.jobUrl, source: "Ashby", text: j.descriptionPlain }));
    },
    // India jobs only (country=in), up to 300.
    async smartrecruiters(fetchFn, id, name) {
      const out = [];
      for (let offset = 0; offset < 300; offset += 100) {
        const d = await getJson(fetchFn, `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(id)}/postings?country=in&limit=100&offset=${offset}`);
        for (const j of d.content || []) {
          const l = j.location || {};
          out.push({ title: j.name, company: (j.company && j.company.name) || name,
            location: [l.city, l.region, l.country === "in" ? "India" : l.country, l.remote ? "Remote" : ""].filter(Boolean).join(", "),
            days: daysSince(j.releasedDate), url: `https://jobs.smartrecruiters.com/${encodeURIComponent(id)}/${j.id}`, source: "SmartRecruiters" });
        }
        if (offset + 100 >= (d.totalFound || 0)) break;
      }
      return out;
    },
    async workday(fetchFn, id, name, opts) {
      const [host, tenant, site] = id.split("|");
      const out = [];
      for (const role of opts.roles.slice(0, 3)) {
        const d = await getJson(fetchFn, `https://${host}/wday/cxs/${tenant}/${site}/jobs`, {
          method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText: role + (opts.india ? " India" : "") }) });
        for (const j of d.jobPostings || []) {
          out.push({ title: j.title, company: name, location: j.locationsText || "", days: postedDaysFromText(j.postedOn),
            url: `https://${host}/en-US/${site}${j.externalPath}`, source: "Workday" });
        }
      }
      return out;
    },
  };

  async function readRemotive(fetchFn, roles) {
    const out = [];
    for (const role of roles.slice(0, 3)) {
      const d = await getJson(fetchFn, `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(role)}&limit=50`);
      for (const j of d.jobs || []) {
        out.push({ title: j.title, company: j.company_name, location: "Remote: " + (j.candidate_required_location || "Worldwide"),
          days: daysSince(j.publication_date), url: j.url, source: "Remotive", text: String(j.description || "").replace(/<[^>]+>/g, " ") });
      }
    }
    return out;
  }

  // Your cities first, then all of India (two pages). At most 15 requests per refresh, one
  // at a time, to stay well inside a free key's limits.
  async function readAdzuna(fetchFn, key, searches, locations, maxDays) {
    const PER_PAGE = 50;
    const cities = locations.filter((l) => !/^remote$/i.test(l)).slice(0, 3);
    const roles = searches.slice(0, 3);
    const plan = [];
    for (const role of roles) for (const city of cities) plan.push({ role, city, page: 1 });
    for (const role of roles) for (const page of [1, 2]) plan.push({ role, city: "", page });

    const out = [], noMore = new Set();
    for (const { role, city, page } of plan) {
      if (!city && noMore.has(role)) continue;
      const q = new URLSearchParams({ app_id: key.id, app_key: key.key, what: role, results_per_page: String(PER_PAGE),
        max_days_old: String(maxDays), "content-type": "application/json" });
      if (city) q.set("where", city);
      let d;
      // A wrong key fails on the first request. A limit reached later keeps what was found.
      try { d = await getJson(fetchFn, `https://api.adzuna.com/v1/api/jobs/in/search/${page}?${q}`); }
      catch (e) { if (!out.length) throw e; break; }
      const results = d.results || [];
      if (!city && results.length < PER_PAGE) noMore.add(role);
      for (const j of results) {
        out.push({ title: String(j.title || "").replace(/<[^>]+>/g, ""), company: (j.company && j.company.display_name) || "",
          location: (j.location && j.location.display_name) || "", days: daysSince(j.created), url: j.redirect_url, source: "Adzuna",
          text: j.description, inIndia: true });
      }
    }
    return out;
  }

  // ---------- Putting it together ----------
  // opts: { roles, locations, level: "fresher"|"any", maxDays, companies, adzuna: {id,key}|null, fetch, onProgress }
  async function findJobs(opts) {
    const fetchFn = opts.fetch || fetch.bind(root);
    const roles = opts.roles.filter(Boolean), locations = opts.locations.filter(Boolean);
    // Fresher jobs often have other names ("SDE I", "Associate Engineer", "React Developer").
    const searchRoles = opts.related === false ? roles : relatedRoles(roles);
    const matchRole = roleMatcher(searchRoles);
    // Workday searches are global, so add "India" to them (you're applying from India).
    const tasks = opts.companies.map(([kind, id, name]) => async () => READERS[kind](fetchFn, id, name, { roles, india: true }));
    const names = opts.companies.map((c) => c[2]);
    if (locations.some((l) => /^remote$/i.test(l))) { tasks.push(() => readRemotive(fetchFn, roles)); names.push("Remotive"); }
    let adzunaTask = -1, adzunaError = "";
    if (opts.adzuna && opts.adzuna.id && opts.adzuna.key) {
      adzunaTask = tasks.push(() => readAdzuna(fetchFn, opts.adzuna, searchRoles, locations, opts.maxDays)) - 1;
      names.push("Adzuna");
    }

    const all = [], failed = [];
    const filterJobs = (found) => filterJobsWith(found, opts, matchRole, locations);
    let done = 0, next = 0;
    async function worker() {
      while (next < tasks.length) {
        const i = next++;
        try { all.push(...await tasks[i]()); } catch (e) { failed.push(names[i]); if (i === adzunaTask) adzunaError = e.message; }
        done++;
        // Every few sources, hand back the jobs so far so the page can show them while it keeps looking.
        if (opts.onProgress) opts.onProgress(done, tasks.length, done % 8 === 0 || done === tasks.length ? () => filterJobs(all) : null);
      }
    }
    await Promise.all(Array.from({ length: opts.concurrency || 8 }, worker));
    return { jobs: filterJobs(all), failed, checked: tasks.length, adzunaError };
  }

  // Keep the jobs that fit, best first. Used for the final list and the lists shown on the way.
  function filterJobsWith(all, opts, matchRole, locations) {
    const seen = new Set();
    const jobs = [];
    for (const j of all) {
      // "Deputy Manager_Application Engineer" -> words the filters can see.
      if (j.title) j.title = String(j.title).replace(/_/g, " ").replace(/\s+/g, " ").trim();
      // The same job can come back under two links (Workday lists it per location search).
      const same = [j.company, j.title, j.location].join("|").toLowerCase();
      if (!j.title || !j.url || seen.has(j.url) || seen.has(same)) continue;
      seen.add(j.url);
      seen.add(same);
      if (!matchRole(j.title)) continue;
      if (j.days !== null && j.days > opts.maxDays) continue;
      const deadline = j.deadline || findDeadline(j.text);
      if (deadline && deadline < localToday()) continue; // applications have closed
      // Adzuna's India search is all India, including cities the location check doesn't know.
      const where = locationScore(j.location, locations) || (j.inIndia ? 2 : 0);
      if (!where) continue;
      const fresher = FRESHER_RE.test(j.title);
      if (opts.level === "fresher") {
        if (SENIOR_RE.test(j.title)) continue;
        const yrs = minYears(j.text);
        if (yrs !== null && yrs >= 3) continue;
      }
      const midLevel = /\b(engineer|developer|sde)[\s-]*(ii|2)\b|\b(intermediate|mid[\s-]?level)\b/i.test(j.title); // usually 1–3 years
      jobs.push({ title: j.title.trim(), company: j.company, location: j.location, days: j.days, url: j.url, source: j.source, fresher, midLevel, where, deadline });
    }
    // Fresher-friendly first, then your city, then newest.
    jobs.sort((a, b) => (b.fresher - a.fresher) || (b.where - a.where) || ((a.days ?? 99) - (b.days ?? 99)));
    return jobs;
  }

  // The tracker's key for a job, matching fill.js's jobKey() for the same job's apply page.
  function jobKeyFor(url) {
    const u = new URL(url);
    const gh = u.searchParams.get("gh_jid");
    return u.hostname + u.pathname.replace(/\/(apply|application|applyManually|autofillWithResume|useMyLastApplication)(\/.*)?$/i, "").replace(/\/$/, "") +
      (gh ? "?gh_jid=" + gh : "");
  }

  const api = { STARTER_COMPANIES, parseCareerUrl, roleMatcher, locationScore, minYears, findDeadline, postedDaysFromText, findJobs, jobKeyFor };
  root.JobFeed = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
