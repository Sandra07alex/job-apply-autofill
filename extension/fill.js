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
  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  // ---------- Reading what each field is asking for ----------
  const textOf = (el) => (el ? (el.innerText || el.textContent || "") : "").replace(/\s+/g, " ").trim();
  const byIds = (ids) => (ids || "").split(/\s+/).map((id) => textOf(document.getElementById(id))).join(" ");

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
    parts.push(el.getAttribute("aria-label") || "", el.placeholder || "", el.name || "", el.id || "");
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
    if (t(/country\s*(phone\s*)?code|dial(ling)?\s*code|phone.*(country|code)|isd/)) return { key: "phoneCountryCode" };
    if (t(/phone|mobile|contact\s*number|cell/)) return { key: "phone" };
    if (t(/notice/)) return { key: "noticePeriod" };
    if (t(/expected.*(ctc|salary|compensation|pay)|desired\s*(salary|pay)|salary\s*expectation/)) return { key: "expectedCtc" };
    if (t(/current.*(ctc|salary|compensation)/)) return { key: "currentCtc" };
    // Skill-specific questions ("years of experience with Python") are left for you.
    if (t(/experience\b[^|]*\b(with|using|in|on)\s+(?!total\b|years?\b)\w/) && t(/years?/)) return null;
    if (t(/(total|years\s*of|how\s*many\s*years).*experience|experience.*\(?\s*years?/) && !isDateType) return { key: "totalExperience" };
    if (t(/sponsor|visa/)) return { key: "needSponsorship" };
    if (t(/authori[sz]ed|legally.*work|eligible\s*to\s*work|right\s*to\s*work/)) return { key: "workAuthorized" };
    if (t(/relocat/)) return { key: "willingToRelocate" };

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

    // Address
    if (t(/address\s*(line)?\s*2/)) return null;
    if (t(/address|street/)) return { key: "addressLine1" };
    if (t(/zip|postal|pin\s*code|pincode/)) return { key: "postalCode" };
    if (t(/\bcity\b|\btown\b/)) return { key: "city" };
    if (t(/\bstate\b|province/)) return { key: "state" };
    if (t(/country/)) return { key: "country" };
    if (t(/location/)) return { key: "location", section: "maybeExp" };
    if (t(/portfolio|website|personal\s*site|\burl\b/)) return { key: "portfolio" };
    if (t(/skills?/) && el.type !== "checkbox") return { key: "skills" };
    return null;
  }

  function personalValue(key) {
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
  function setText(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    el.focus();
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function setSelect(el, candidates) {
    const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9+]/g, "");
    const cands = candidates.filter(Boolean).map(norm).filter(Boolean);
    if (!cands.length) return false;
    const opts = [...el.options];
    let hit = opts.find((o) => cands.includes(norm(o.text)) || cands.includes(norm(o.value)));
    if (!hit) hit = opts.find((o) => norm(o.text) && cands.some((c) => norm(o.text).includes(c) || (c.length > 3 && c.includes(norm(o.text)))));
    if (!hit) return false;
    el.value = hit.value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) &&
    getComputedStyle(el).visibility !== "hidden";
  const mark = (el, ok) => {
    el.style.outline = ok ? "2px solid #22c55e" : "2px dashed #f59e0b";
    el.style.outlineOffset = "1px";
  };

  // ---------- Main pass, in page order ----------
  const SKIP = new Set(["hidden", "password", "file", "submit", "button", "image", "reset", "search", "range", "color"]);
  const fields = [...document.querySelectorAll("input, select, textarea")]
    .filter((el) => !SKIP.has(el.type) && !el.disabled && !el.readOnly && visible(el));

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
      const want = c && !c.section ? personalValue(c.key) : "";
      if (!want || (!overwrite && group.some((r) => r.checked))) continue;
      const target = group.find((r) => {
        const lbl = (describe(r) + " " + (r.value || "")).toLowerCase();
        return new RegExp(`\\b${want.toLowerCase()}\\b`).test(lbl);
      });
      if (target) { target.click(); mark(target, true); filled++; }
      continue;
    }

    const d = describe(el);
    const c = classify(d, el);
    // Already-filled fields still advance section tracking, so entries stay aligned.
    const hasValue = el.type !== "checkbox" &&
      (el.tagName === "SELECT" ? el.selectedIndex > 0 && !!el.value : !!el.value);

    let value = null;
    if (c) {
      let section = c.section;
      if (section === "maybeExp") section = current === "exp" ? "exp" : undefined;
      if (section === "edu" || section === "exp") {
        const entry = entryFor(section, c.key);
        if (entry) {
          if (c.key === "current") {
            if (!!entry.current !== el.checked) el.click();
            mark(el, true); filled++; continue;
          }
          value = entry[c.key] ? { text: entry[c.key] } : null;
        }
      } else if (section === "date") {
        if (current) {
          const entry = entryFor(current, c.key);
          if (entry) value = dateValue(entry, c.key, el);
        }
      } else if (el.type !== "checkbox") {
        const v = personalValue(c.key);
        if (v) value = { text: v };
      }
    }

    if (el.type === "checkbox") continue; // never guess on checkboxes (consents, etc.)
    if (hasValue && !overwrite) continue;

    if (value && value.text) {
      let ok;
      if (el.tagName === "SELECT") ok = setSelect(el, [value.text, ...(value.alts || [])]);
      else { setText(el, value.text); ok = true; }
      mark(el, ok);
      ok ? filled++ : unmatched++;
    } else if (!el.value || el.tagName === "SELECT" && el.selectedIndex <= 0) {
      if (el.required || el.getAttribute("aria-required") === "true" || !c) { mark(el, false); unmatched++; }
    }
  }

  return { filled, unmatched };
})();
