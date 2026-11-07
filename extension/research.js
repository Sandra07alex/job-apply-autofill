// Company research for personal notes: reads a few pages of the company's own site
// (home, products/solutions, services, about, news), pulls out facts, and turns them
// into note ideas that link the company to your own experience. You pick and edit one.
(function (root) {
  // ---------- Reading HTML (no DOM needed, so it also runs in tests) ----------
  const ENT = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", hellip: "…" };
  const decode = (s) => String(s || "").replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENT[e.toLowerCase()] ?? m));
  const strip = (h) => String(h || "").replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  const plain = (h) => decode(strip(h).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  const headings = (h, tags = "h1|h2|h3") => [...strip(h).matchAll(new RegExp(`<(${tags})\\b[^>]*>([\\s\\S]*?)</\\1>`, "gi"))]
    .map((m) => plain(m[2])).filter((s) => s && s.length <= 120);
  function meta(h, key) {
    for (const re of [new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*content=["']([^"']*)`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${key}["']`, "i")]) {
      const m = String(h || "").match(re);
      if (m) return decode(m[1]).trim();
    }
    return "";
  }
  function links(h, base) {
    const out = [];
    for (const m of strip(h).matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      try { out.push({ url: new URL(decode(m[1]), base), text: plain(m[2]) }); } catch (_) {}
    }
    return out;
  }
  const words = (s) => s.split(/\s+/).filter(Boolean).length;
  // Names taken from web addresses: "ai-automation" -> "AI Automation".
  const ACRONYMS = { ai: "AI", ml: "ML", ui: "UI", ux: "UX", it: "IT", api: "API", apis: "APIs", iot: "IoT", saas: "SaaS", erp: "ERP", crm: "CRM", qa: "QA" };
  const titleCase = (s) => s.replace(/[-_]+/g, " ").replace(/\b[a-z]+\b/gi, (w) => ACRONYMS[w.toLowerCase()] || w[0].toUpperCase() + w.slice(1));
  const KEEP_CASE = /^(India|Indian|Kerala|Kochi|Bangalore|Bengaluru|London|Europe|CPG|FMCG|SaaS|AI|IT|ML|IoT|API|APIs|MES|ERP|CRM|AR|VR|US|UK)$/;
  // "Advanced Image Recognition For CPG" -> "advanced image recognition for CPG"
  const softLower = (s) => s.replace(/\b[A-Z][a-z]+\b/g, (w) => (KEEP_CASE.test(w) ? w : w.toLowerCase()));
  const clip = (s, n) => (words(s) > n ? s.split(/\s+/).slice(0, n).join(" ").replace(/[,;:—-]+$/, "") : s);

  // ---------- What to look for ----------
  const TECH = ["React", "React Native", "Angular", "Vue", "Next.js", "Node.js", "Express", "Python", "Django", "Flask", "FastAPI", "Java", "Spring",
    "Golang", "TypeScript", "JavaScript", "Flutter", "Kotlin", "Swift", "AWS", "Azure", "GCP", "Docker", "Kubernetes", "MongoDB", "PostgreSQL", "MySQL",
    "TensorFlow", "PyTorch", "OpenCV", "Supabase", "Firebase", "GraphQL"];
  const INDUSTRIES = ["retail", "CPG", "FMCG", "banking", "fintech", "insurance", "healthcare", "manufacturing", "logistics", "aviation", "airline", "travel",
    "hospitality", "education", "e-commerce", "automotive", "real estate", "media", "telecom", "energy", "agriculture", "government"];
  const PLACES = ["Kochi", "Cochin", "Infopark", "Technopark", "Trivandrum", "Thiruvananthapuram", "Kozhikode", "Calicut", "Cyberpark", "Thrissur", "Kerala"];
  // News is a headline that names the company and says it did something
  // ("Infilect Joins Andavi"), not a slogan ("Technology should open doors").
  const MILESTONE = /\b(joins|joined|launches|launched|announces|announced|raises|raised|acquires|acquired|wins|won|expands|expanded|opens|opened|named|partners with|unveils|introduces|secures|secured|crosses|celebrates)\b/i;
  // A product description says what it is ("image recognition for retail"), not a slogan.
  const SLOGAN_START = /^(we|our|your|you|built|bring|meet|make|get|let|the right|good|robust|fuel|transform\w*|empower\w*|unlock|discover|welcome|looking|elevat\w*|build|create|deliver\w*|enabl\w*|power\w*|accelerat\w*|reimagin\w*|simplif\w*|scale|grow|driv\w*|boost|take|start|join|see|why)\b/i;
  const DESCRIBES = /\b(for|platform|software|analytics|recognition|management|system|solution|app|tool|engine|api|apis|data|automation|intelligence|payments?|trading|booking|cargo|airline|crew|loyalty|retail|prevention|monitoring|tracking|marketplace|commerce|learning|assistant)\b/i;
  const GENERIC = /^(learn more|read more|explore|home|about( us)?|contact( us)?|careers?|blog|news|products?|solutions?|services?|platform|company|view all|see all|get started|book a demo|request a demo)$/i;
  const PAGE_KINDS = [
    ["product", /\/(products?|solutions?|platforms?)\/[^/]+\/?$/i],
    ["service", /\/(services?|what-we-do|capabilities)\/[^/]+\/?$/i],
    ["about", /\/(about[\w-]*|company|who-we-are|our-story)\/?$/i],
    ["news", /\/(news|press|newsroom|media|blog|insights|resources\/latest-news|news-and-media)\/?$/i],
    ["industry", /\/(industries\/[^/]+|[\w-]*(banking|insur|retail|logistic|health|manufactur|aviation|travel|fintech)[\w-]*)\/?$/i],
  ];

  // Ways your profile connects to what a company does. Each needs the skill on your side
  // and the matching words on theirs.
  function angles(profile) {
    const P = profile || {}, J = P.job || {};
    const exp = P.experience || [];
    const now = exp.find((e) => e.current) || exp[0] || {};
    const mine = [J.skills, ...exp.map((e) => [e.title, e.company, e.description].join(" ")), ...(P.education || []).map((e) => e.field)].join(" ").toLowerCase();
    const at = now.company ? ` at ${now.company}` : "";
    const has = (re) => re.test(mine);
    const skillsIn = (list) => list.filter((s) => mine.includes(s.toLowerCase()));
    const out = [];
    if (has(/manufactur|\bmes\b|execution system/)) out.push({ re: /manufactur|factory|factories|industrial|shop floor|\bMES\b|industry 4\.0|production line/i, phrase: `I build features for a Manufacturing Execution System (MES)${at}` });
    if (has(/opencv|computer vision|yolo|image|keras|pytorch|tensorflow/)) out.push({ re: /image recognition|computer vision|visual intelligence|video analytics|object detection|\bOCR\b|camera/i, phrase: "I've built computer vision and deep learning models" });
    const mobile = skillsIn(["React Native", "Flutter", "Expo", "Kotlin", "Android"]);
    if (mobile.length) out.push({ re: /mobile|app development|\bios\b|android/i, phrase: `I've built mobile apps with ${mobile.slice(0, 2).join(" and ")}` });
    if (has(/tensorflow|pytorch|machine learning|deep learning|scikit|nlp/)) out.push({ re: /machine learning|\bAI\b|artificial intelligence|agentic|generative|LLM|data science|automation/i, phrase: "I've built machine learning projects end to end" });
    const web = skillsIn(["React", "Next.js", "Node.js", "Express", "TypeScript", "Django", "MongoDB"]);
    if (web.length || has(/full ?stack/)) out.push({ re: /SaaS|web|platform|digital product|product engineering|custom software|software development|portal|dashboard/i,
      phrase: `I build full-stack features${web.length ? " with " + web.slice(0, 2).join(" and ") : ""}${at}` });
    return { list: out, skills: mine };
  }

  // ---------- Research ----------
  async function research({ site, company, profile, fetch: fetchFn = fetch.bind(root), maxPages = 5 }) {
    const get = async (url) => {
      try {
        const r = await fetchFn(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined });
        return r.ok ? await r.text() : "";
      } catch (_) { return ""; }
    };
    const homeUrl = "https://" + site;
    const home = await get(homeUrl);
    if (!home) return { ok: false, why: `couldn't open ${site}` };

    // Pick a few useful pages on the same site.
    const host = new URL(homeUrl).hostname.replace(/^www\./, "");
    const seen = new Set();
    const pages = { product: [], service: [], about: [], news: [], industry: [] };
    for (const { url, text } of links(home, homeUrl)) {
      if (url.hostname.replace(/^www\./, "") !== host || seen.has(url.pathname)) continue;
      const kind = (PAGE_KINDS.find(([, re]) => re.test(url.pathname)) || [])[0];
      if (!kind) continue;
      seen.add(url.pathname);
      pages[kind].push({ url: url.origin + url.pathname, text });
    }
    const toRead = [...pages.product.slice(0, 2), ...pages.about.slice(0, 1), ...pages.news.slice(0, 1), ...pages.service.slice(0, 1)].slice(0, maxPages);
    const read = await Promise.all(toRead.map(async (p) => ({ ...p, html: await get(p.url) })));
    const htmlOf = (url) => (read.find((p) => p.url === url) || {}).html || "";
    const allText = [home, ...read.map((p) => p.html)].map(plain).join(" ");

    const facts = { site, pages: [homeUrl, ...read.filter((p) => p.html).map((p) => p.url)] };
    facts.tagline = (headings(home, "h1")[0] || "").slice(0, 120);
    facts.description = (meta(home, "description") || meta(home, "og:description")).slice(0, 300);

    // Products: name from the link (or the address), what it does from its page.
    // Link text is often "Name — short description"; keep the name part.
    const linkName = (t) => (t || "").split(/\s+[—–|-]\s+|\s{2,}/)[0].trim();
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    facts.products = [];
    for (const p of pages.product.slice(0, 4)) {
      const slug = decodeURIComponent(p.url.split("/").filter(Boolean).pop() || "");
      const fromLink = linkName(p.text);
      const name = fromLink && words(fromLink) <= 4 && !GENERIC.test(fromLink) ? fromLink : titleCase(slug);
      if (!name || name.length <= 3 || /^(digital |our |all )?(products?|solutions?|platforms?)$/i.test(name)) continue;
      const html = htmlOf(p.url);
      const candidates = [...(html ? headings(html, "h1|h2") : []), meta(html, "description"), p.text.slice(fromLink.length)]
        .map((h) => (h || "").replace(new RegExp(`^\\s*[—–|:-]?\\s*${esc(name)}\\s*[|:–—-]\\s*`, "i"), "").replace(/^\s*[—–|:-]\s*/, "").trim());
      // A short description ("image recognition AI for loss prevention"), not a sentence ("iRetail is ...").
      const what = candidates.find((h) => h && !GENERIC.test(h) && !SLOGAN_START.test(h) && !/\?|\blet[’']?s\b|\blet us\b|^(wherever|whatever|whether|where|when|if)\b|\b(is|are|was|were)\b/i.test(h) &&
        DESCRIBES.test(h) && words(h) >= 3 && words(h) <= 18 &&
        h.toLowerCase() !== name.toLowerCase()) || "";
      // Without a description, only a real product name ("InfiArt", "iFlight") is worth a note,
      // not a generic one ("Connected Operations").
      if (!what && !/[a-z][A-Z]|^i[A-Z]/.test(name)) continue;
      if (!facts.products.some((x) => x.name.toLowerCase() === name.toLowerCase())) facts.products.push({ name, what: clip(what, 14), url: p.url });
    }
    facts.services = pages.service.map((p) => { const n = linkName(p.text); return n && words(n) <= 4 && !GENERIC.test(n) ? n : titleCase(p.url.split("/").filter(Boolean).pop() || ""); })
      .filter((s, i, a) => s && a.indexOf(s) === i).slice(0, 5);
    facts.industries = INDUSTRIES.filter((k) => new RegExp(`\\b${k}\\b`, "i").test(allText)).slice(0, 5);
    facts.tech = TECH.filter((t) => new RegExp(`(^|[^\\w.])${t.replace(/[.+]/g, "\\$&")}(?![\\w])`, "i").test(allText));
    const mine = angles(profile);
    facts.techOverlap = facts.tech.filter((t) => mine.skills.includes(t.toLowerCase()));
    // The company's own name (or its first word, e.g. "IBS" for "IBS Software") must be in the headline.
    const nameWords = [company, host.split(".")[0]].filter(Boolean).map((n) => n.split(/\s+/)[0].toLowerCase()).filter((n) => n.length >= 3);
    facts.news = [...headings(home), ...read.filter((p) => /news|press|blog|insight|media/.test(p.url)).flatMap((p) => headings(p.html, "h2|h3"))]
      .filter((h) => MILESTONE.test(h) && words(h) >= 3 && words(h) <= 16 && nameWords.some((n) => h.toLowerCase().includes(n)))
      .filter((h, i, a) => a.indexOf(h) === i).slice(0, 3);
    // A mission only from the home or about page, and only when it says "mission".
    const aboutText = [home, ...read.filter((p) => /about|company|who-we-are|story/.test(p.url)).map((p) => p.html)].map(plain).join(" ");
    // Start at the mission words themselves: menus and headings often run straight into them
    // ("... About WHY WE EXIST Our mission is ...").
    const mission = aboutText.match(/\b(?:our mission|we exist to|we're on a mission|we are on a mission)\b[^.!?]{10,170}[.!]/i);
    facts.mission = mission ? mission[0].trim().replace(/^[a-z]/, (c) => c.toUpperCase()) : "";
    facts.place = PLACES.find((p) => new RegExp(`\\b${p}\\b`, "i").test(allText)) || "";
    facts.place = /infopark|cochin/i.test(facts.place) ? "Kochi" : /technopark|thiruvananthapuram/i.test(facts.place) ? "Trivandrum" : /cyberpark|calicut/i.test(facts.place) ? "Kozhikode" : facts.place;

    return { ok: true, facts, ideas: ideasFrom(facts, mine.list, company) };
  }

  // ---------- Note ideas (each finishes "I am excited about {company} because ...") ----------
  function ideasFrom(f, angleList, company) {
    const ideas = [];
    const add = (kind, text) => { if (text && !ideas.some((i) => i.text === text)) ideas.push({ kind, text }); };
    const angleFor = (text) => angleList.find((a) => a.re.test(text));
    const join = (list) => (list.length > 1 ? list.slice(0, -1).join(", ") + " and " + list[list.length - 1] : list[0] || "");
    const what = (s) => softLower(clip(s.replace(/[.!]+$/, ""), 14));

    for (const p of f.products.slice(0, 2)) {
      const a = angleFor(`${p.name} ${p.what}`) || angleFor(f.tagline + " " + f.description);
      add("product", `of ${p.name}${p.what ? `, your ${what(p.what)}` : ""}. ${a ? `${a.phrase}, and I'd love to work on something like it.` : "I'd love to help build it."}`);
    }
    if (f.services.length) {
      const a = angleFor(f.services.join(" ") + " " + f.description);
      add("services", `of your ${softLower(join(f.services.slice(0, 3)))} work${f.industries.length ? ` for ${join(f.industries.slice(0, 2))} clients` : ""}. ${a ? a.phrase + ", so I'd love to contribute." : "It's the kind of work I want to grow in."}`);
    }
    if (f.techOverlap.length >= 2) add("tech", `you build with ${join(f.techOverlap.slice(0, 3))}, the same tools I use in my own work.`);
    if (f.news.length) add("news", `of your recent news, “${f.news[0].replace(/[.!]+$/, "")}”, and I'd love to join the team as it grows.`);
    if (f.place) add("local", `you have a team in ${f.place}, and I'd love to build my career in Kerala, close to home.`);
    if (f.mission && words(f.mission) <= 30) {
      // "Our mission is to make X" -> "of your mission to make X."; anything else is quoted.
      const to = f.mission.match(/^our mission is (to .+?)[.!]?$/i);
      add("mission", to ? `of your mission ${to[1]}.` : `of your mission: “${f.mission.replace(/[.!]$/, "")}.”`);
    }
    if (!ideas.length) {
      const a = angleFor(f.tagline + " " + f.description);
      const summary = f.description || f.tagline;
      if (summary) add("about", `of your work on ${what(summary)}${a ? `. ${a.phrase}` : ""}.`);
    }
    // Most specific first: product with a link to you, then services, tech, news, place, mission.
    const order = ["product", "services", "tech", "news", "local", "mission", "about"];
    return ideas.sort((x, y) => order.indexOf(x.kind) - order.indexOf(y.kind)).slice(0, 5);
  }

  const api = { research, ideasFrom, angles, _html: { plain, headings, meta, links, decode } };
  root.CompanyResearch = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
