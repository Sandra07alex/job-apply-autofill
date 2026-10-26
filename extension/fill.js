// Injected into the page when you click "Fill this page".
// Wrapped in an IIFE so it can be injected repeatedly without redeclaration errors.
(async () => {
  const store = (typeof chrome !== "undefined" && chrome.storage)
    ? await chrome.storage.local.get(["profile", "settings"])
    : (window.__AUTOFILL_TEST__ || {});
  const profile = store.profile;
  const overwrite = !!(store.settings && store.settings.overwrite);
  if (!profile) return { error: "No profile saved yet. Click \u201cEdit my profile\u201d first." };

  const P = profile.personal || {}, J = profile.job || {};
  const EDU = profile.education || [], EXP = profile.experience || [];
  const ANSWERS = (profile.answers || []).filter((a) => a.q && a.a)
    .map((a) => ({ q: a.q.toLowerCase().replace(/\s+/g, " ").trim(), a: a.a }));
  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  // ---------- Reading what each field is asking for ----------
  const textOf = (el) => (el ? (el.innerText || el.textContent || "") : "").replace(/\s+/g, " ").trim();
  const byIds = (ids) => (ids || "").split(/\s+/).map((id) => textOf(document.getElementById(id))).join(" ");

  // Text of the closest earlier sibling (of the field or a wrapper) that isn't itself
  // a field. It may climb out of one small group of fields (a phone code + number row
  // shares one label), but stops before reaching another question's label.
  const CONTROL_SEL = "input:not([type=hidden]), select, textarea";
  function nearbyLabel(el) {
    let allowed = 1;
    for (let node = el, i = 0; i < 5 && node.parentElement && node !== document.body; i++, node = node.parentElement) {
      for (let s = node.previousElementSibling, j = 0; s && j < 3; s = s.previousElementSibling, j++) {
        if (s.matches(CONTROL_SEL) || s.querySelector(CONTROL_SEL)) break;
        const t = textOf(s);
        if (t) return t.length < 200 ? t : "";
      }
      const n = node.parentElement.querySelectorAll(CONTROL_SEL).length;
      if (n > allowed) {
        if (allowed > 1) return "";
        allowed = n;
      }
    }
    return "";
  }

  function describe(el) {
    const parts = [];
    if (el.id) {
      try {
        const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (l) parts.push(textOf(l));
      } catch (_) {}
    }
    const wrapLabel = el.closest("label");
    if (wrapLabel && el.type !== "radio" && el.type !== "checkbox") parts.push(textOf(wrapLabel));
    if (el.type === "checkbox" && wrapLabel) parts.push(textOf(wrapLabel));
    parts.push(byIds(el.getAttribute("aria-labelledby")));
    parts.push(el.getAttribute("aria-label") || "");
    // No linked label (e.g. Rippling): use the label text sitting just before the field.
    if (!parts.some(Boolean) && el.type !== "radio" && el.type !== "checkbox") parts.push(nearbyLabel(el));
    parts.push(el.placeholder || "", el.name || "", el.id || "");
    parts.push(el.getAttribute("data-automation-id") || "");
    const wd = el.closest("[data-automation-id^='formField']");
    if (wd) parts.push(wd.getAttribute("data-automation-id"));
    // Group context (e.g. "From" / "To" around month+year inputs, fieldset legends)
    const fs = el.closest("fieldset");
    if (fs) { const lg = fs.querySelector("legend"); if (lg) parts.push(textOf(lg)); }
    const grp = el.closest("[role='group']");
    if (grp) parts.push(grp.getAttribute("aria-label") || "", byIds(grp.getAttribute("aria-labelledby")));
    let joined = parts.filter(Boolean).join(" | ");
    // Last resort: short text from nearby parent
    if (joined.replace(/[|\s]/g, "").length < 3) {
      let p = el.parentElement;
      for (let i = 0; i < 3 && p; i++, p = p.parentElement) {
        const t = textOf(p);
        if (t && t.length < 80) { joined = t; break; }
      }
    }
    return joined.toLowerCase();
  }

  // ---------- Deciding which profile value a field wants ----------
  // Returns { key, section } where section is "edu" / "exp" / "date" / undefined.
  function classify(d, el) {
    const isDateType = el.type === "date" || el.type === "month";
    const t = (re) => re.test(d);
    if (t(/e-?mail/)) return { key: "email" };
    if (t(/linkedin/)) return { key: "linkedin" };
    if (t(/github/)) return { key: "github" };
    if (t(/country\s*(phone\s*)?code|dial(ling)?\s*code|phone.*(country|code)|\bisd\b/)) return { key: "phoneCountryCode" };
    if (t(/extension|\bext\b|device\s*type|phone\s*type/)) return null;
    // A dropdown in the phone row can only be the country code ("+1 US").
    if ((el.tagName === "SELECT" || el.tagName === "BUTTON") && t(/phone|mobile/)) return { key: "phoneCountryCode" };
    if (t(/phone|mobile|contact\s*number|\bcell/)) return { key: "phone" };
    if (t(/notice|available\s*to\s*join|joining\s*(time|period)|can\s*(you\s*)?join/)) return { key: "noticePeriod" };
    if (t(/date\s*of\s*birth|birth\s*date|\bdob\b/)) return { key: "dateOfBirth" };
    if (t(/gender|\bsex\b/)) return { key: "gender" };
    if (t(/expected.*(ctc|salary|compensation|pay)|desired\s*(salary|pay)|salary\s*expectation/)) return { key: "expectedCtc" };
    if (t(/current.*(ctc|salary|compensation)/)) return { key: "currentCtc" };
    // Skill-specific questions ("years of experience with Python") are left for you.
    if (t(/experience\b[^|]*\b(with|using|in|on)\s+(?!total\b|years?\b)\w/) && t(/years?/)) return null;
    if (t(/(total|years\s*of|how\s*many\s*years).*experience|experience.*\(?\s*years?/) && !isDateType) return { key: "totalExperience" };
    if (t(/sponsor|visa/)) return { key: "needSponsorship" };
    if (t(/authori[sz]ed|legally.*work|eligible\s*to\s*work|right\s*to\s*work/)) return { key: "workAuthorized" };
    if (t(/relocat/)) return { key: "willingToRelocate" };
    // One-off "current company / title" questions, not an experience block.
    if (t(/(current(ly)?|present)\s*(company|employer|organi[sz]ation)/)) return { key: "currentCompany" };
    if (t(/(current|present)\s*(job\s*)?(title|designation|role|position)/)) return { key: "currentTitle" };
    // Screening questions ("...agreement with your current employer?") only get the
    // answers above or a saved answer, never a profile field like company or name.
    if (d.includes("?") || d.length > 200) return null;

    // Education
    if (t(/school|universit|college|institut/)) return { key: "school", section: "edu" };
    if (t(/degree|qualification/)) return { key: "degree", section: "edu" };
    if (t(/field\s*of\s*study|major|discipline|speciali[sz]ation|branch|stream/)) return { key: "field", section: "edu" };
    if (t(/\bgpa\b|cgpa|grade|percentage|marks/)) return { key: "gpa", section: "edu" };

    // Experience
    if (t(/company|employer|organi[sz]ation/)) return { key: "company", section: "exp" };
    if (el.type === "checkbox" && t(/current(ly)?\s*(work|employed|job|role)|i\s*currently/)) return { key: "current", section: "exp" };
    if (el.tagName === "TEXTAREA" && t(/description|responsibilit|role\s*summary|what\s*you\s*did/)) return { key: "description", section: "exp" };
    if (el.tagName !== "TEXTAREA" && t(/job\s*title|\btitle\b|designation|position|\brole\b/) && !t(/name/)) return { key: "title", section: "exp" };

    // Dates (attached to whichever education/experience entry we're in)
    if (isDateType || t(/\bdate\b|month|year|mm\/|yyyy/)) {
      const end = t(/\bend|\bto\b|until|graduat|completion|finish|\bleft\b/);
      const start = t(/start|from|begin|join/);
      if (!end && !start) return null;
      const part = t(/month/) && !t(/year/) ? "Month" : t(/year/) && !t(/month/) ? "Year" : "";
      return { key: (end ? "end" : "start") + part, section: "date" };
    }

    // Names
    if (t(/first\s*name|given\s*name|fname|firstname/)) return { key: "firstName" };
    if (t(/last\s*name|family\s*name|surname|lname|lastname/)) return { key: "lastName" };
    if (t(/middle/)) return null;
    if (t(/full\s*name|your\s*name|legal\s*name|^name$|^name\b/)) return { key: "fullName" };

    // Address. Workday ids look like "address--city" / "webAddress-1--url", so the
    // specific parts must be checked before the generic "address".
    if (t(/address\s*(line)?\s*2/)) return null;
    if (t(/zip|postal|pin\s*code|pincode/)) return { key: "postalCode" };
    if (t(/\bcity\b|\btown\b/)) return { key: "city" };
    if (t(/\bstate\b|province/)) return { key: "state" };
    if (t(/country/)) return { key: "country" };
    if (t(/portfolio|website|web\s*address|personal\s*site|\burl\b/)) return { key: "portfolio" };
    if (t(/address|street/)) return { key: "addressLine1" };
    if (t(/location/)) return { key: "location", section: "maybeExp" };
    if (t(/skills?/) && el.type !== "checkbox") return { key: "skills" };
    return null;
  }

  // The user's saved answer whose words appear in the question, if any.
  const savedAnswer = (d) => (ANSWERS.find((x) => d.includes(x.q)) || {}).a;

  // Total years across experience entries, e.g. "1.5", when the profile doesn't say.
  function yearsOfExperience() {
    const now = new Date(), nowM = now.getFullYear() * 12 + now.getMonth();
    let months = 0;
    for (const e of EXP) {
      if (!e.startYear || (!e.current && !e.endYear)) continue;
      const start = +e.startYear * 12 + (+e.startMonth || 1) - 1;
      const end = e.current ? nowM : +e.endYear * 12 + (+e.endMonth || 12) - 1;
      months += Math.max(0, end - start + 1);
    }
    return months ? String(Math.round(months / 1.2) / 10) : "";
  }

  function personalValue(key) {
    const nowJob = EXP.find((e) => e.current) || {};
    if (key === "currentCompany") return nowJob.company || "";
    if (key === "currentTitle") return nowJob.title || "";
    if (key === "totalExperience" && !J.totalExperience) return yearsOfExperience();
    if (key === "fullName") return [P.firstName, P.lastName].filter(Boolean).join(" ");
    if (key in P) return P[key];
    if (key in J) return J[key];
    if (key === "location") return P.city;
    return "";
  }

  function dateValue(entry, key, el) {
    const prefix = key.startsWith("end") ? "end" : "start";
    if (prefix === "end" && entry.current) return null; // leave blank when "currently work here"
    const m = entry[prefix + "Month"] || "", y = entry[prefix + "Year"] || "";
    if (key.endsWith("Month")) return m ? { text: m, alts: [MONTH_NAMES[+m - 1], String(+m)] } : null;
    if (key.endsWith("Year")) return y ? { text: y } : null;
    if (!y) return null;
    const mm = m || "01";
    if (el.type === "month") return { text: `${y}-${mm}` };
    if (el.type === "date") return { text: `${y}-${mm}-01` };
    const ph = (el.placeholder || "").toLowerCase();
    if (ph && /yyyy/.test(ph) && !/mm/.test(ph)) return { text: y };
    return { text: `${mm}/${y}`, alts: [MONTH_NAMES[+mm - 1] + " " + y] };
  }

  // ---------- Writing values in a way React/Angular sites notice ----------
  // Sites like Workday only save a value after re-rendering, so we pause between fields.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9+]/g, "");
  const words = (s) => String(s || "").toLowerCase().split(/[^a-z0-9+]+/).filter((w) => w.length > 1);

  // Dropdowns list "Bachelor's Degree" where the profile says "B.Tech".
  function degreeAliases(d) {
    const n = norm(d);
    if (/bachelor/.test(n) || /^(btech|be|bs|bsc|ba|bca|bcom|bba|barch|bdes)$/.test(n)) return ["Bachelor's Degree", "Bachelor"];
    if (/master/.test(n) || /^(mtech|me|ms|msc|ma|mca|mcom|mba|march|mdes)$/.test(n)) return ["Master's Degree", "Master"];
    if (/phd|doctor/.test(n)) return ["Doctorate", "PhD", "Doctor"];
    if (/diploma/.test(n)) return ["Diploma"];
    if (/12|10|plustwo|highersecondary|hsc|hss|sslc|secondary|highschool|intermediate|puc/.test(n)) return ["High School Diploma", "High School", "Secondary"];
    return [];
  }

  function setText(el, value, keepFocus) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    el.focus();
    setter.call(el, value);
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    if (!keepFocus) el.blur();
  }

  // Does the text contain the candidate as whole words (ignoring punctuation)?
  const wordStart = (text, cand) => {
    const w = (s) => " " + String(s || "").toLowerCase().replace(/[^a-z0-9+]+/g, " ").trim() + " ";
    return w(text).includes(w(cand));
  };

  // Best-scoring item for any candidate (exact > contains > shared words), or null.
  function pickBest(items, getText, candidates) {
    let best = null, bestScore = 0;
    for (const it of items) {
      const o = norm(getText(it));
      if (!o) continue;
      for (const raw of candidates) {
        const c = norm(raw);
        if (!c) continue;
        let s = 0;
        if (o === c) s = 100;
        // "Kochi" should prefer "Kochi, Kerala" over "Kochin, Sri Lanka".
        else if (o.includes(c)) s = 60 + 20 * c.length / o.length - (wordStart(getText(it), raw) ? 0 : 25);
        else if (c.length > 3 && c.includes(o)) s = 40 + 20 * o.length / c.length;
        else {
          const ow = words(getText(it)), cw = words(raw);
          const shared = cw.filter((w) => ow.includes(w)).length / Math.max(ow.length, cw.length, 1);
          if (shared >= 0.5) s = 50 * shared;
        }
        if (s > bestScore) { best = it; bestScore = s; }
      }
    }
    return best;
  }

  function setSelect(el, candidates) {
    const hit = pickBest([...el.options].filter((o) => o.value), (o) => o.text || o.value, candidates);
    if (!hit) return false;
    el.value = hit.value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) &&
    getComputedStyle(el).visibility !== "hidden";

  function press(el) {
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
      const Ctor = type.startsWith("pointer") && typeof PointerEvent !== "undefined" ? PointerEvent : MouseEvent;
      el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, view: window }));
    }
    el.click();
  }
  function key(el, k) {
    const code = { Enter: 13, Escape: 27 }[k];
    for (const type of ["keydown", "keyup"]) {
      el.dispatchEvent(new KeyboardEvent(type, { key: k, code: k, keyCode: code, which: code, bubbles: true, cancelable: true }));
    }
  }

  // Popup options (Workday list buttons and search boxes, ARIA comboboxes).
  const OPTION_SEL = "[role='option'], [data-automation-id='promptOption'], .pac-item";
  function openOptions(el) {
    const ids = (el.getAttribute("aria-controls") || el.getAttribute("aria-owns") || "").split(/\s+/).filter(Boolean);
    const scopes = ids.map((id) => document.getElementById(id)).filter(Boolean);
    return (scopes.length ? scopes : [document]).flatMap((s) => [...s.querySelectorAll(OPTION_SEL)]).filter(visible);
  }
  async function waitForMatch(el, candidates, ms) {
    for (let t = 0; t <= ms; t += 100) {
      const hit = pickBest(openOptions(el), textOf, candidates);
      if (hit) return hit;
      await sleep(100);
    }
    return null;
  }
  async function closePopup(el) {
    key(document.activeElement || el, "Escape");
    await sleep(150);
  }

  // Workday "Select One" buttons that open a listbox.
  async function fillListButton(el, candidates) {
    press(el);
    const opt = await waitForMatch(el, candidates, 2000);
    if (opt) { press(opt); await sleep(200); return true; }
    await closePopup(el);
    return false;
  }

  const isWorkdayPrompt = (el) => el.getAttribute("data-automation-id") === "searchBox" ||
    !!el.closest("[data-automation-id='multiSelectContainer'], [data-automation-id='multiselectInputContainer']");
  const isPrompt = (el) => el.tagName === "INPUT" && (isWorkdayPrompt(el) ||
    el.getAttribute("role") === "combobox" || el.getAttribute("aria-autocomplete") === "list");

  // Search boxes only accept a value picked from their suggestions.
  async function fillPrompt(el, candidates) {
    setText(el, candidates[0], true);
    // Suggestions often come from a server, so give them time (Workday waits for Enter instead).
    let opt = await waitForMatch(el, candidates, isWorkdayPrompt(el) ? 500 : 2000);
    // Workday searches on Enter. Only press it when no list is showing, since on other
    // sites Enter would pick whatever option is highlighted (or submit the form).
    if (!opt && isWorkdayPrompt(el) && !openOptions(el).length) {
      key(el, "Enter");
      opt = await waitForMatch(el, candidates, 2500);
    }
    if (opt) { press(opt); await sleep(250); return true; }
    await closePopup(el);
    return false;
  }

  // Tag boxes ("Add new skill") take one item per Enter and often clear leftover
  // text on blur. If the first Enter isn't taken, it's a plain box: type the list.
  async function fillTags(el, list) {
    const items = list.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 15);
    for (const [i, s] of items.entries()) {
      setText(el, s, true);
      key(el, "Enter");
      await sleep(150);
      if (i === 0 && el.value === s) { setText(el, items.join(", ")); return true; }
    }
    el.blur();
    return items.length > 0;
  }

  // "Immediate" -> 0, "30 days" -> 30, "2 months" -> 60, for "(in days)" fields.
  function toDays(s) {
    const t = String(s).toLowerCase(), n = parseFloat(t);
    if (/immediate/.test(t)) return "0";
    if (isNaN(n)) return s;
    return String(Math.round(/month/.test(t) ? n * 30 : /week/.test(t) ? n * 7 : n));
  }

  // Profile stores YYYY-MM-DD; text boxes get it in their placeholder's order (default DD/MM/YYYY).
  function formatDate(iso, el) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m || el.type === "date") return iso;
    const ph = (el.placeholder || "").toLowerCase();
    const fmt = /dd/.test(ph) && /mm/.test(ph) && /yyyy/.test(ph) ? ph : "dd/mm/yyyy";
    return fmt.replace("yyyy", m[1]).replace("mm", m[2]).replace("dd", m[3]);
  }

  function hasValueOf(el) {
    if (el.type === "checkbox") return false;
    if (el.tagName === "SELECT") return el.selectedIndex > 0 && !!el.value;
    if (el.tagName === "BUTTON") return !/^(select( one)?|choose.*|-+)?$/i.test(textOf(el));
    if (isPrompt(el)) {
      const box = el.closest("[data-automation-id^='formField']") || el.parentElement?.parentElement;
      if (box && box.querySelector("[data-automation-id='selectedItem']")) return true;
    }
    return !!el.value;
  }
  const mark = (el, ok) => {
    el.style.outline = ok ? "2px solid #22c55e" : "2px dashed #f59e0b";
    el.style.outlineOffset = "1px";
  };

  // ---------- Main pass, in page order ----------
  const SKIP = new Set(["hidden", "password", "file", "submit", "button", "image", "reset", "search", "range", "color"]);
  const fields = [...document.querySelectorAll("input, select, textarea, button[aria-haspopup='listbox']")]
    .filter((el) => (el.tagName === "BUTTON" || !SKIP.has(el.type)) && !el.disabled && !el.readOnly && visible(el));

  const idx = { edu: -1, exp: -1 };
  const used = { edu: new Set(), exp: new Set() };
  let current = null; // which repeated section we're inside
  const doneRadios = new Set();
  let filled = 0, unmatched = 0;

  function entryFor(section, key) {
    if (idx[section] < 0 || used[section].has(key)) { idx[section]++; used[section] = new Set(); }
    used[section].add(key);
    current = section;
    const list = section === "edu" ? EDU : EXP;
    return list[idx[section]];
  }

  for (const el of fields) {
    // Earlier fills (e.g. "I currently work here") can remove later fields.
    if (!el.isConnected || !visible(el)) continue;
    // Radio groups (Yes/No questions)
    if (el.type === "radio") {
      if (!el.name || doneRadios.has(el.name)) continue;
      doneRadios.add(el.name);
      const group = [...document.querySelectorAll(`input[type=radio][name="${CSS.escape(el.name)}"]`)];
      const fs = el.closest("fieldset");
      const gd = (fs ? textOf(fs.querySelector("legend")) : "") + " " +
        (el.closest("[role='radiogroup']") ? byIds(el.closest("[role='radiogroup']").getAttribute("aria-labelledby")) : "") +
        " " + textOf(fs || el.parentElement?.parentElement);
      const c = classify(gd.toLowerCase(), el);
      const want = savedAnswer(gd.toLowerCase().replace(/\s+/g, " ")) || (c && !c.section ? personalValue(c.key) : "");
      if (!want || (!overwrite && group.some((r) => r.checked))) continue;
      const target = group.find((r) => {
        const lbl = (describe(r) + " " + (r.value || "")).toLowerCase();
        return new RegExp(`\\b${want.toLowerCase()}\\b`).test(lbl);
      });
      if (target) { target.click(); mark(target, true); filled++; await sleep(80); }
      continue;
    }

    const d = describe(el);
    const saved = el.type !== "checkbox" && savedAnswer(d);
    const c = saved ? { key: "answer" } : classify(d, el);
    // Already-filled fields still advance section tracking, so entries stay aligned.
    const hasValue = hasValueOf(el);

    let value = null;
    if (c) {
      let section = c.section;
      if (section === "maybeExp") section = current === "exp" ? "exp" : undefined;
      if (section === "edu" || section === "exp") {
        const entry = entryFor(section, c.key);
        if (entry) {
          if (c.key === "current") {
            if (!!entry.current !== el.checked) { el.click(); await sleep(200); }
            mark(el, true); filled++; continue;
          }
          const v = entry[c.key];
          value = v ? { text: v, alts: c.key === "degree" ? degreeAliases(v) : undefined } : null;
        }
      } else if (section === "date") {
        if (current) {
          const entry = entryFor(current, c.key);
          if (entry) value = dateValue(entry, c.key, el);
        }
      } else if (el.type !== "checkbox") {
        let v = saved || personalValue(c.key);
        if (v && !saved && c.key === "noticePeriod" && (el.type === "number" || /\bdays?\b/.test(d))) v = toDays(v);
        if (v && !saved && c.key === "dateOfBirth") v = formatDate(v, el);
        if (v && !saved && c.key === "phoneCountryCode") value = { text: v, alts: [P.country] };
        else if (v && !saved && c.key === "location") value = { text: v, alts: [[P.city, P.state].filter(Boolean).join(", ")] };
        else if (v) value = { text: v };
      }
    }

    if (el.type === "checkbox") continue; // never guess on checkboxes (consents, etc.)
    // Phone code pickers come preset (often "+1 US"); fix them when they don't match.
    const wrongDefault = c && c.key === "phoneCountryCode" && value && (el.tagName === "SELECT" || el.tagName === "BUTTON") &&
      !norm(el.tagName === "SELECT" ? (el.selectedOptions[0] || {}).text : textOf(el)).includes(norm(value.text));
    if (hasValue && !overwrite && !wrongDefault) continue;

    if (value && value.text) {
      const cands = [value.text, ...(value.alts || [])];
      let ok;
      if (el.tagName === "SELECT") ok = setSelect(el, cands);
      else if (el.tagName === "BUTTON") ok = await fillListButton(el, cands);
      else if (isPrompt(el) && c.key === "skills") {
        ok = false;
        for (const s of value.text.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 15)) {
          if (await fillPrompt(el, [s])) ok = true;
        }
      } else if (isPrompt(el)) ok = await fillPrompt(el, cands);
      else if (c.key === "skills" && el.tagName === "INPUT") ok = await fillTags(el, value.text);
      else { setText(el, value.text); ok = true; }
      mark(el, ok);
      ok ? filled++ : unmatched++;
      await sleep(80);
    } else if (!hasValue) {
      if (el.required || el.getAttribute("aria-required") === "true" || !c) { mark(el, false); unmatched++; }
    }
  }

  return { filled, unmatched };
})();
