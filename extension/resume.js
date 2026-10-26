// Turns pasted resume text into a profile, entirely in the browser.
// Best effort: the profile page shows the result for review before saving.
(function (root) {
  const SECTIONS = [
    ["education", /^(education(al)?(\s*(details|background|qualifications?))?|academics?(\s*details)?|academic\s*(background|qualifications?)|qualifications?)$/],
    ["experience", /^((work|professional|relevant|industry)\s*experience|experience|employment(\s*history)?|work\s*history|internships?(\s*(and|&)\s*experience)?|experience\s*(and|&)\s*internships?)$/],
    ["skills", /^((technical|key|core|professional)\s*skills|skills(\s*(and|&)\s*\w+)?|technologies|tech\s*stack|tools(\s*(and|&)\s*technologies)?)$/],
    ["other", /^(projects?|academic\s*projects?|personal\s*projects?|certifications?|courses|trainings?|achievements?|awards?|honou?rs|summary|professional\s*summary|career\s*objective|objective|profile|about(\s*me)?|languages?(\s*known)?|interests|hobbies|activities|extra[\s-]*curricular(\s*activities)?|publications|references|declaration|contact(\s*(info|details))?|personal\s*(details|information)|volunteer(ing)?|leadership|positions?\s*of\s*responsibility)$/],
  ];
  const BULLET = /^\s*([•●▪◦○■□➢➤►\-–*·]|\d+[.)])\s*/;
  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const DATE_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*,?\s*'?(\d{4}|\d{2})\b|\b(\d{1,2})\s*[/.-]\s*((?:19|20)\d{2})\b|\b((?:19|20)\d{2})\b|\b(present|current(ly)?|now|till\s*date|to\s*date|ongoing)\b/gi;
  const SCHOOL_RE = /college|universit|institut|school|academy|polytechnic|vidyalaya|\b(iit|nit|iiit|bits|ghss|ghs|hss|vhss)\b/i;
  const DEGREE_RE = /\b(b\.?\s?tech|b\.?\s?e\b\.?|b\.?\s?sc|b\.?\s?com|b\.?\s?c\.?\s?a|b\.?\s?b\.?\s?a|b\.?\s?a\b\.?|b\.?\s?arch|bachelor(\s*of\s*[a-z]+|'?s)?|m\.?\s?tech|m\.?\s?e\b\.?|m\.?\s?sc|m\.?\s?c\.?\s?a|m\.?\s?b\.?\s?a|m\.?\s?s\b\.?|master(\s*of\s*[a-z]+|'?s)?|ph\.?\s?d|diploma|higher\s*secondary|senior\s*secondary|plus\s*two|class\s*(xii|x|12|10)|12th|10th|sslc|hsc|ssc|cbse|icse)/i;
  const GPA_RE = /\b(?:c?gpa|cpi|sgpa|score|percentage|marks)\s*[:\-–]?\s*(\d{1,2}(?:\.\d+)?)|(\d{1,2}(?:\.\d+)?)\s*%|(\d(?:\.\d+)?)\s*\/\s*10\b/i;
  const TITLE_RE = /intern|engineer|developer|analyst|manager|designer|consultant|lead\b|architect|associate|trainee|scientist|specialist|executive|officer|administrator|tester|programmer|director|freelance|assistant|researcher/i;

  const clean = (s) => s.replace(/\s+/g, " ").replace(/^[\s,|:–—-]+|[\s,|:–—-]+$/g, "").trim();

  function sectionOf(line) {
    const l = line.toLowerCase().replace(/[:\s]+$/, "").replace(/\s+/g, " ").trim();
    if (!l || l.length > 45) return null;
    const hit = SECTIONS.find(([, re]) => re.test(l));
    return hit ? hit[0] : null;
  }

  // All dates in a line, in order: { month, year } or { current: true }.
  function datesIn(line) {
    const out = [];
    for (const m of line.matchAll(DATE_RE)) {
      if (m[1]) out.push({ month: String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, "0"), year: m[2].length === 2 ? "20" + m[2] : m[2] });
      else if (m[3]) out.push({ month: m[3].padStart(2, "0"), year: m[4] });
      else if (m[5]) out.push({ month: "", year: m[5] });
      else out.push({ current: true });
    }
    return out;
  }
  const stripDates = (s) => clean(s.replace(DATE_RE, " ").replace(/\s*(?:–|—|-|to)\s*(?=\s|$)/gi, " ").replace(/\(\s*\)/g, ""));

  function applyDates(entry, dates) {
    const [a, b] = dates;
    if (a && !a.current) { entry.startMonth = a.month; entry.startYear = a.year; }
    if (b && b.current || a && a.current) entry.current = true;
    else if (b) { entry.endMonth = b.month; entry.endYear = b.year; }
  }

  function parsePersonal(lines) {
    const all = lines.join("\n"), p = {};
    const email = all.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/);
    if (email) p.email = email[0];
    const li = all.match(/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[\w%-]+\/?/i);
    if (li) p.linkedin = li[0].startsWith("http") ? li[0] : "https://" + li[0];
    const gh = all.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+\/?/i);
    if (gh) p.github = gh[0].startsWith("http") ? gh[0] : "https://" + gh[0];
    const site = (all.match(/https?:\/\/[^\s|,]+/gi) || []).find((u) => !/linkedin|github/i.test(u));
    if (site) p.portfolio = site;
    const phone = all.match(/(\+\d{1,3})?[\s-]?(\(?\d[\d\s()-]{8,14}\d)/);
    if (phone) {
      const digits = phone[2].replace(/\D/g, "");
      if (digits.length >= 10) {
        if (phone[1]) p.phoneCountryCode = phone[1];
        else if (digits.length === 12 && digits.startsWith("91")) p.phoneCountryCode = "+91";
        p.phone = digits.length > 10 && (phone[1] || digits.startsWith("91")) ? digits.slice(-10) : digits;
      }
    }
    // Name: first short line of letters near the top.
    const name = lines.slice(0, 6).find((l) => /^[A-Za-z][A-Za-z .'-]{1,40}$/.test(l) && l.split(/\s+/).length <= 4 && !sectionOf(l));
    if (name) {
      const titled = name === name.toUpperCase() ? name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : name;
      const parts = titled.replace(/\./g, " ").trim().split(/\s+/);
      p.firstName = parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0];
      if (parts.length > 1) p.lastName = parts[parts.length - 1];
    }
    // "Thrissur, Kerala" / "Kochi, Kerala, India" in the contact lines.
    for (const l of lines.slice(0, 8)) {
      const seg = l.split(/\s*[|•·]\s*/).find((s) => /^[A-Za-z][A-Za-z .]+,\s*[A-Za-z .]+(,\s*[A-Za-z .]+)?$/.test(s) && !/@/.test(s));
      if (!seg || seg === name) continue;
      const bits = seg.split(",").map(clean);
      p.city = bits[0];
      if (/^india$/i.test(bits[bits.length - 1])) { p.country = "India"; bits.pop(); }
      if (bits.length > 1) p.state = bits[1];
      break;
    }
    return p;
  }

  function parseSkills(lines) {
    const out = [];
    for (let l of lines) {
      l = l.replace(BULLET, "");
      if (l.includes(":")) l = l.slice(l.indexOf(":") + 1);
      for (const s of l.split(/\s*[,;|•·]\s*|\s{2,}/)) {
        const t = clean(s.replace(/\.$/, ""));
        if (t && t.length <= 40 && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
      }
    }
    return out.join(", ");
  }

  function parseEducation(lines) {
    const list = [];
    let cur = null;
    for (const raw of lines) {
      const line = raw.replace(BULLET, "");
      const school = SCHOOL_RE.test(line), degree = DEGREE_RE.exec(line);
      if (!cur || (school && cur.school) || (degree && cur.degree)) {
        if (!school && !degree && !cur) continue;
        if (school || degree) list.push(cur = {});
      }
      const gpa = GPA_RE.exec(line);
      if (gpa && !cur.gpa) cur.gpa = gpa[1] || gpa[2] || gpa[3];
      const dates = datesIn(line);
      if (dates.length && !cur.endYear && !cur.startYear) {
        if (dates.length === 1 && !dates[0].current) { cur.endMonth = dates[0].month; cur.endYear = dates[0].year; }
        else applyDates(cur, dates);
        delete cur.current;
      }
      const rest = stripDates(line.replace(GPA_RE, " ").replace(/\b(c?gpa|cpi|percentage)\b/gi, " "));
      for (const seg of rest.split(/\s*[|–—]\s*|\s+-\s+|\t/).map(clean).filter(Boolean)) {
        const dm = DEGREE_RE.exec(seg);
        if (dm && !cur.degree) {
          cur.degree = clean(dm[0]);
          const field = clean(seg.slice(dm.index + dm[0].length).replace(/^\s*(in|of|[-–,(])\s*/i, "").replace(/[()]/g, ""));
          if (field && !cur.field && !SCHOOL_RE.test(field)) cur.field = field;
          if (SCHOOL_RE.test(seg) && !cur.school) cur.school = clean(seg.replace(dm[0], "").replace(/^\s*(in|of|from|at)\s+/i, ""));
        } else if (SCHOOL_RE.test(seg) && !cur.school) cur.school = seg.replace(/^\s*(from|at)\s+/i, "");
      }
    }
    return list.filter((e) => e.school || e.degree);
  }

  function parseExperience(lines) {
    const list = [];
    let cur = null;
    const fresh = () => (cur = { description: "" }, list.push(cur), cur);
    for (const raw of lines) {
      const bullet = BULLET.test(raw);
      const line = raw.replace(BULLET, "");
      const dates = datesIn(line);
      const text = dates.length ? stripDates(line) : clean(line);
      // Sentences are description, but "Acme Pvt. Ltd." is a company.
      const sentence = /\.$/.test(text) && / /.test(text) && !/\b(ltd|inc|co|corp|llc|pvt|llp)\.$/i.test(text);
      if (bullet || sentence || text.length > 90) {
        if (!cur) fresh();
        if (text) cur.description += (cur.description ? "\n" : "") + text;
        if (dates.length && !cur.startYear) applyDates(cur, dates);
        continue;
      }
      // A heading line: starts a new job unless it completes the current one.
      if (text && (!cur || cur.description || (cur.title && cur.company && (cur.location || TITLE_RE.test(text))))) fresh();
      if (dates.length && !cur && !text) fresh();
      if (!cur) continue;
      if (dates.length && !cur.startYear) applyDates(cur, dates);
      if (!text) continue;
      if (cur.title && cur.company) {
        if (!cur.location && text.length < 40 && !/\.$/.test(text)) cur.location = text;
        else cur.description += (cur.description ? "\n" : "") + text;
        continue;
      }
      let segs = text.split(/\s+(?:at|@)\s+/i);
      if (segs.length < 2) segs = text.split(/\s*[|–—,]\s*|\s+-\s+/);
      segs = segs.map(clean).filter(Boolean);
      if (segs.length >= 2) {
        const titleFirst = TITLE_RE.test(segs[0]) || !TITLE_RE.test(segs[1]);
        cur.title = cur.title || (titleFirst ? segs[0] : segs[1]);
        cur.company = cur.company || (titleFirst ? segs[1] : segs[0]);
        if (segs[2] && !cur.location) cur.location = segs.slice(2).join(", ");
      } else if (TITLE_RE.test(text) && !cur.title) cur.title = text;
      else if (!cur.company) cur.company = text;
      else cur.title = text;
    }
    return list.filter((e) => e.title || e.company).map((e) => (e.description ? e : (delete e.description, e)));
  }

  function parseResume(text) {
    const lines = String(text || "").split(/\r?\n/).map((l) => l.replace(/ /g, " ").trim()).filter(Boolean);
    const parts = { top: [], education: [], experience: [], skills: [], other: [] };
    let at = "top";
    for (const l of lines) {
      const s = sectionOf(l);
      if (s) at = s;
      else parts[at].push(l);
    }
    const skills = parseSkills(parts.skills);
    return {
      personal: parsePersonal(parts.top.length ? parts.top : lines),
      job: skills ? { skills } : {},
      education: parseEducation(parts.education),
      experience: parseExperience(parts.experience),
    };
  }

  root.parseResume = parseResume;
  if (typeof module !== "undefined") module.exports = { parseResume };
})(typeof window !== "undefined" ? window : globalThis);
