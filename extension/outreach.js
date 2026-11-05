const DEFAULT_TEMPLATES = {
  first: {
    subject: "Application for {role} – {fullName}",
    body: `Dear {hrName},

I am writing to apply for {position} at {company}.
I am {education}.
I am currently working as a {currentTitle} at {currentCompany}.

During college I built 15+ projects, from full-stack web platforms to computer vision and deep learning models. Each one meant learning a new tool or technology, so I pick things up quickly and put them to work.

I am excited about {company} because {note}
I would be glad to grow with your team and contribute from day one.

I have attached my resume.
You can also see my work at {workLinks}.

Thank you for your time and consideration.

Best regards,
{fullName}
{phone}
{email}
LinkedIn: {linkedin}`,
  },
  followup: {
    subject: "Re: {firstSubject}",
    body: `Dear {hrName},

I'm following up on my application for {position} at {company}, which I sent on {sentOn}.
I'm still very interested and happy to share anything else you need. I've attached my resume again for convenience.

Thank you for your time.

Best regards,
{fullName}
{phone}
{email}`,
  },
};
// The intro line of the first default, before {position}. Saved templates still equal to it get upgraded.
const OLD_INTRO = "My name is {fullName}, and I'm writing to apply for the {role} role at {company}.";
// The previous first-email default. A saved template still exactly this is replaced by the new
// default; one you've edited is left alone.
const PREVIOUS_FIRST_BODY = `Dear {hrName},

My name is {fullName}, and I'm writing to apply for {position} at {company}.
{note}

I currently work at {currentCompany} as a {currentTitle}.
I studied {degree} in {field} at {school}.
My skills include {skills}.

I've attached my resume and would be glad to talk about how I can contribute to {company}.

Best regards,
{fullName}
{phone}
{email}
{linkedin}
{portfolio}`;
const SKILLS_IN_EMAIL = 8;
const PLACEHOLDERS = {
  first: ["company", "position", "role", "hrName", "note", "fullName", "firstName", "education", "currentTitle", "currentCompany",
    "skills", "experience", "degree", "field", "school", "gradYear", "gpa", "phone", "email", "linkedin", "github", "portfolio", "workLinks"],
  followup: ["company", "position", "role", "hrName", "sentOn", "firstSubject", "fullName", "firstName", "phone", "email", "linkedin"],
};
const STATUSES = [
  ["new", "Not sent"], ["opened", "Draft opened"], ["sent", "Sent"], ["followed", "Followed up"],
  ["replied", "Replied"], ["interview", "Interview"], ["offer", "Offer"], ["rejected", "Rejected"], ["noreply", "No response"],
];
const STATUS_LABEL = Object.fromEntries(STATUSES);
// Statuses that also move the matching entry in "My applications".
const TO_TRACKER = { interview: "Interview", offer: "Offer", rejected: "Rejected" };
const FOLLOW_UP_DAYS = 7, MAX_FOLLOW_UPS = 2;
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$/i;

let profile = {}, resume = null;
let data = { templates: structuredClone(DEFAULT_TEMPLATES), rows: [] };
let selected = null, editing = "first", filter = "all";

const $ = (id) => document.getElementById(id);
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const daysSince = (iso) => (iso ? Math.floor((Date.parse(today()) - Date.parse(iso)) / 864e5) : 0);
const niceDate = (iso) => (iso ? new Date(iso + "T00:00").toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "");
const save = () => chrome.storage.local.set({ outreach: data });

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
}

// ---------- Follow-ups ----------
const lastContact = (r) => [r.sentOn, r.followedOn].filter(Boolean).sort().pop();
const followUpDue = (r) => (r.status === "sent" || r.status === "followed") &&
  (r.followUps || 0) < MAX_FOLLOW_UPS && daysSince(lastContact(r)) >= FOLLOW_UP_DAYS;
const nextKind = (r) => (r.status === "new" || r.status === "opened" ? "first" : "followup");

// ---------- Templates ----------
const titleCase = (s) => (s && s === s.toUpperCase() ? s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : s);

// A long skills list reads like keyword stuffing in an email: keep the first few
// ("Python, C, Java and React"). Also drops stray "\" left by pasting Markdown ("TensorFlow\.js").
function shortSkills(list) {
  const items = String(list || "").replace(/\\(?=[^\w\s])/g, "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, SKILLS_IN_EMAIL);
  return items.length > 1 ? items.slice(0, -1).join(", ") + " and " + items[items.length - 1] : items.join("");
}

// "https://www.linkedin.com/in/x/" -> "linkedin.com/in/x": easier to read in an email.
const shortUrl = (u) => String(u || "").trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
// "8.66" -> "a CGPA of 8.66/10", "82" -> "82%".
function gpaText(g) {
  const n = parseFloat(g);
  if (!g || isNaN(n)) return "";
  return n <= 10 ? `a CGPA of ${String(g).replace(/\s*\/\s*10$/, "")}/10` : `${n}%`;
}
// "a 2026 B.Tech graduate in Computer Science and Design from GEC Kozhikode, with a CGPA of 8.66/10",
// built from whatever parts your first education entry has.
function educationText(edu) {
  if (!edu.degree && !edu.school) return "";
  const graduated = edu.endYear && Number(edu.endYear) <= new Date().getFullYear();
  const who = [edu.endYear, edu.degree, graduated || !edu.endYear ? "graduate" : "student"].filter(Boolean).join(" ");
  return `a ${who}` + (edu.field ? ` in ${edu.field}` : "") + (edu.school ? ` from ${edu.school}` : "") +
    (gpaText(edu.gpa) ? `, with ${gpaText(edu.gpa)}` : "");
}

function vars(row) {
  const P = profile.personal || {}, J = profile.job || {};
  const now = (profile.experience || []).find((e) => e.current) || {};
  const edu = (profile.education || [])[0] || {};
  const first = (row.history || []).find((h) => h.kind === "first");
  return {
    company: row.company, role: row.role, hrName: row.hrName || "Hiring Team", note: row.note,
    // Works with or without a role, so the opening line is never dropped.
    position: row.role ? `the ${row.role} role` : "a suitable role",
    fullName: [P.firstName, P.lastName].filter(Boolean).map(titleCase).join(" "), firstName: titleCase(P.firstName),
    currentTitle: now.title, currentCompany: now.company, skills: shortSkills(J.skills), experience: J.totalExperience,
    degree: edu.degree, field: edu.field, school: edu.school, gradYear: edu.endYear, gpa: gpaText(edu.gpa),
    education: educationText(edu),
    phone: [P.phoneCountryCode, P.phone].filter(Boolean).join(" "), email: P.email,
    linkedin: shortUrl(P.linkedin), github: shortUrl(P.github), portfolio: shortUrl(P.portfolio),
    workLinks: [P.portfolio, P.github].map(shortUrl).filter(Boolean).join(" and "),
    sentOn: niceDate(row.sentOn), firstSubject: first ? first.subject.replace(/^re:\s*/i, "") : "",
  };
}

// Drops any line with an empty placeholder; unknown {words} are left as typed.
// "a {currentTitle}" becomes "an" before a vowel ("an Engineer").
function render(text, v) {
  return text.split("\n")
    .filter((line) => [...line.matchAll(/\{(\w+)\}/g)].every((m) => !(m[1] in v) || v[m[1]]))
    .map((line) => line.replace(/(\ba )?\{(\w+)\}/gi, (all, article, k) => {
      if (!(k in v)) return all;
      const val = String(v[k]);
      return article ? (/^[aeiou]/i.test(val) ? article.replace(/a/i, (x) => x + "n") : article) + val : val;
    }))
    .join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function emailFor(row, kind = nextKind(row)) {
  const v = vars(row), t = data.templates[kind];
  const fallback = kind === "first" ? `Job application${v.fullName ? " – " + v.fullName : ""}` : `Following up on my application – ${v.fullName}`;
  return { kind, to: row.email, subject: render(t.subject, v) || fallback, body: render(t.body, v) };
}

// ---------- Opening in Gmail ----------
function gmailUrl(mail) {
  const q = new URLSearchParams({ view: "cm", fs: "1", to: mail.to, su: mail.subject, body: mail.body });
  return "https://mail.google.com/mail/?" + q.toString();
}

async function openInGmail(row) {
  if (!EMAIL_RE.test(row.email || "")) { alert(`Check the email address for ${row.company || "this company"}.`); return; }
  const mail = emailFor(row);
  if (mail.kind === "followup" && !confirm(`Open a follow-up email to ${row.company || row.email}?`)) return;
  const job = { id: row.id, company: row.company, role: row.role, email: row.email, kind: mail.kind,
    subject: mail.subject, body: mail.body, at: Date.now() };
  // gmail.js finds this draft by the "jaa" marker in the Gmail address, or failing
  // that by asking the background script about its tab.
  const pending = (await chrome.storage.local.get("outreachPending")).outreachPending || {};
  pending[row.id] = job;
  await chrome.storage.local.set({ outreachPending: pending });
  const tab = await chrome.tabs.create({ url: gmailUrl(mail) + "&jaa=" + encodeURIComponent(row.id) });
  await chrome.storage.session.set({ ["outreach-" + tab.id]: job });
  if (row.status === "new") row.status = "opened";
  save();
  renderAll();
  hideNotice();
  // gmail.js marks the draft as picked up; if it never does, say so here.
  setTimeout(async () => {
    const p = ((await chrome.storage.local.get("outreachPending")).outreachPending || {})[row.id];
    if (p && p.at === job.at && !p.ack) {
      showNotice(`The Gmail tab for ${row.company || row.email} didn't respond, so your resume wasn't attached. ` +
        "Check that the extension may run on Gmail (button below, or Extension details → Site access), reload the Gmail tab, " +
        "or attach the resume yourself with the 📎 in Gmail.", "Allow Gmail access", requestGmailAccess);
    }
  }, 30000);
}

// ---------- Gmail access ----------
const GMAIL = { origins: ["https://mail.google.com/*"] };
function showNotice(text, buttonText, onClick) {
  const n = $("notice");
  n.innerHTML = "";
  n.append(el("span", { textContent: text }));
  if (buttonText) {
    const b = el("button", { className: "primary", textContent: buttonText });
    b.onclick = onClick;
    n.append(" ", b);
  }
  n.hidden = false;
}
function hideNotice() { $("notice").hidden = true; }
function requestGmailAccess() {
  chrome.permissions.request(GMAIL, (granted) => {
    if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError.message);
    if (granted) showNotice("Gmail access is on. Close the Gmail draft and click Open in Gmail again.");
  });
}
// Chrome's "Site access" setting can stop the extension from running on Gmail.
function checkGmailAccess() {
  chrome.permissions.contains(GMAIL, (ok) => {
    if (!ok) showNotice("Chrome isn't letting this extension run on Gmail, so it can't attach your resume there.",
      "Allow Gmail access", requestGmailAccess);
  });
}

// ---------- Companies list ----------
function parseLines(text, defaultRole) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const parts = line.split(/\s*[,;\t|]\s*/).map((s) => s.trim()).filter(Boolean);
    const email = parts.find((p) => EMAIL_RE.test(p.replace(/^<|>$/g, "")));
    if (!email) continue;
    const rest = parts.filter((p) => p !== email);
    out.push({ company: rest[0] || "", email: email.replace(/^<|>$/g, ""), role: rest.slice(1).join(", ") || defaultRole });
  }
  return out;
}

function addRows() {
  const found = parseLines($("paste").value, $("defaultRole").value.trim());
  let added = 0, dupes = 0;
  for (const r of found) {
    const same = data.rows.find((x) => x.email.toLowerCase() === r.email.toLowerCase() && (x.role || "") === (r.role || ""));
    if (same) { dupes++; continue; }
    data.rows.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), hrName: "", note: "",
      status: "new", sentOn: "", followedOn: "", followUps: 0, history: [], added: today(), ...r });
    added++;
  }
  save();
  $("addMsg").textContent = found.length
    ? `Added ${added}.` + (dupes ? ` Skipped ${dupes} already in the list.` : "")
    : "No email addresses found. Use: Company, email, Role";
  if (added) $("paste").value = "";
  if (!selected && data.rows.length) selected = data.rows[0].id;
  filter = "all";
  renderAll();
}

function setStatus(row, status) {
  row.status = status;
  save();
  const to = TO_TRACKER[status];
  if (!to) return;
  const key = `email:${row.email.toLowerCase()}:${row.role || ""}`;
  chrome.storage.local.get("applications", ({ applications }) => {
    const app = (applications || []).find((a) => a.key === key);
    if (app && app.status !== to) {
      Object.assign(app, { status: to, updated: today() });
      chrome.storage.local.set({ applications });
    }
  });
}

function cell(row, key, placeholder) {
  const input = el("input", { value: row[key] || "", placeholder });
  if (key === "email") input.classList.toggle("bad", !!row.email && !EMAIL_RE.test(row.email));
  input.onfocus = () => select(row.id);
  input.oninput = () => {
    row[key] = input.value.trim();
    if (key === "email") input.classList.toggle("bad", !!row.email && !EMAIL_RE.test(row.email));
    save();
    renderMessage();
  };
  return el("td", { className: key }, input);
}

function rowEl(row) {
  const status = el("select", { className: "st st-" + row.status });
  for (const [v, label] of STATUSES) status.appendChild(el("option", { value: v, textContent: label, selected: row.status === v }));
  status.onfocus = () => select(row.id);
  status.onchange = () => { setStatus(row, status.value); renderAll(); };
  const statusCell = el("td", {}, status);
  const when = lastContact(row);
  if (when) statusCell.appendChild(el("div", { className: "when", textContent: (row.followedOn ? "Followed up " : "Sent ") + niceDate(when) }));
  if (followUpDue(row)) statusCell.appendChild(el("span", { className: "badge", textContent: `No reply in ${daysSince(when)} days` }));

  const kind = nextKind(row);
  const open = el("button", { className: kind === "first" || followUpDue(row) ? "primary" : "",
    textContent: kind === "first" ? "Open in Gmail" : "Follow up" });
  open.onclick = () => { select(row.id); openInGmail(row); };
  if (["replied", "interview", "offer", "rejected", "noreply"].includes(row.status)) open.disabled = true;
  const view = el("button", { textContent: "Message" });
  view.onclick = () => { select(row.id); $("messageWrap").scrollIntoView({ behavior: "smooth" }); };
  const del = el("button", { className: "x", title: "Remove", textContent: "✕" });
  del.onclick = () => {
    if (row.history && row.history.length && !confirm(`Remove ${row.company || row.email} and its email history?`)) return;
    data.rows = data.rows.filter((r) => r !== row);
    if (selected === row.id) selected = data.rows[0] && data.rows[0].id;
    save(); renderAll();
  };
  const tr = el("tr", {},
    cell(row, "company", "Company"), cell(row, "email", "hr@company.com"), cell(row, "role", "Role"),
    cell(row, "hrName", "Hiring Team"), cell(row, "note", "Why this company (optional)"),
    statusCell, el("td", { className: "acts" }, view, " ", open, " ", del));
  tr.dataset.id = row.id;
  tr.onclick = (e) => { if (e.target === tr || e.target.tagName === "TD") select(row.id); };
  return tr;
}

function select(id) {
  if (selected === id) return;
  selected = id;
  document.querySelectorAll("#rows tr").forEach((tr) => tr.classList.toggle("sel", tr.dataset.id === selected));
  renderMessage();
}

const FILTERS = [
  ["all", "All", () => true],
  ["new", "Not sent", (r) => r.status === "new" || r.status === "opened"],
  ["due", "Follow up due", followUpDue],
  ["waiting", "Waiting for reply", (r) => r.status === "sent" || r.status === "followed"],
  ["replied", "Replied", (r) => ["replied", "interview", "offer"].includes(r.status)],
  ["closed", "Rejected / no response", (r) => r.status === "rejected" || r.status === "noreply"],
];

function renderChips() {
  const box = $("chips2");
  box.innerHTML = "";
  for (const [key, label, test] of FILTERS) {
    const n = data.rows.filter(test).length;
    if (key !== "all" && !n) continue;
    const b = el("button", { className: "chip" + (filter === key ? " on" : "") + (key === "due" ? " due" : "") }, label, el("b", { textContent: n }));
    b.onclick = () => { filter = filter === key ? "all" : key; renderRows(); renderChips(); };
    box.appendChild(b);
  }
  const sent = data.rows.filter((r) => r.sentOn).length;
  const replied = data.rows.filter((r) => ["replied", "interview", "offer", "rejected"].includes(r.status)).length;
  $("stats").textContent = sent ? `${sent} sent · ${replied} replied (${Math.round((replied / sent) * 100)}%)` : "";
}

function renderRows() {
  const test = (FILTERS.find((f) => f[0] === filter) || FILTERS[0])[2];
  // Follow-ups due first, then unsent, then the rest by last contact.
  const rank = (r) => (followUpDue(r) ? 0 : r.status === "new" || r.status === "opened" ? 1 : 2);
  const shown = data.rows.filter(test).sort((a, b) => rank(a) - rank(b) || (lastContact(b) || "").localeCompare(lastContact(a) || ""));
  const tbody = $("rows");
  tbody.innerHTML = "";
  shown.forEach((r) => tbody.appendChild(rowEl(r)));
  document.querySelectorAll("#rows tr").forEach((tr) => tr.classList.toggle("sel", tr.dataset.id === selected));
  $("empty").hidden = shown.length > 0;
  $("empty").textContent = data.rows.length ? "Nothing in this filter." : "No companies yet. Paste some above.";
  const next = nextToOpen();
  $("openNext").disabled = !next;
  $("openNext").textContent = next && nextKind(next) === "followup" ? "Open next follow-up in Gmail" : "Open next unsent in Gmail";
}

const nextToOpen = () => data.rows.find((r) => r.status === "new") || data.rows.find(followUpDue) || data.rows.find((r) => r.status === "opened");

// ---------- Message panel: what will be sent, and what was sent ----------
function mailBox(title, mail, note) {
  return el("div", { className: "mail" },
    el("div", { className: "mail-head" }, el("b", { textContent: title }), note ? el("span", { className: "when", textContent: note }) : ""),
    el("div", { className: "meta" }, el("b", { textContent: "To" }), mail.to || ""),
    el("div", { className: "meta" }, el("b", { textContent: "Subject" }), mail.subject || ""),
    el("pre", { className: "body", textContent: mail.body || "" }),
    resume && title !== "Sent" ? el("div", { className: "attach", textContent: "📎 " + resume.name }) : "");
}

function renderMessage() {
  const row = data.rows.find((r) => r.id === selected);
  const box = $("message");
  box.innerHTML = "";
  if (!row) {
    $("msgTitle").textContent = "3. Message";
    box.appendChild(mailBox("Example", emailFor({ company: "Acme Systems", email: "hr@acme.com", role: "Software Engineer", history: [] }, "first")));
    $("openSel").disabled = $("copy").disabled = true;
    return;
  }
  $("msgTitle").textContent = `3. Message – ${row.company || row.email}`;
  const done = ["replied", "interview", "offer", "rejected", "noreply"].includes(row.status);
  if (!done) {
    const mail = emailFor(row);
    box.appendChild(mailBox(mail.kind === "first" ? "Will send" : "Follow-up (will send)", mail,
      mail.kind === "followup" && !followUpDue(row) ? `Best sent after ${FOLLOW_UP_DAYS} days without a reply` : ""));
  }
  for (const h of [...(row.history || [])].reverse()) {
    box.appendChild(mailBox("Sent", { to: row.email, subject: h.subject, body: h.body },
      `${h.kind === "followup" ? "Follow-up" : "First email"} · ${niceDate(h.on)}`));
  }
  if (done && !(row.history || []).length) box.appendChild(el("p", { className: "hint", textContent: "No emails sent from here yet." }));
  $("openSel").disabled = done;
  $("openSel").textContent = nextKind(row) === "first" ? "Open in Gmail" : "Follow up in Gmail";
  $("copy").disabled = done;
}

function renderAll() {
  renderChips();
  renderRows();
  renderMessage();
}

// ---------- Template editor ----------
function renderTemplate() {
  const t = data.templates[editing];
  $("subject").value = t.subject;
  $("body").value = t.body;
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("on", b.dataset.kind === editing));
  $("tplHint").textContent = editing === "first"
    ? "Your first email to each company."
    : `Sent when a company hasn't replied after ${FOLLOW_UP_DAYS} days. Gmail can't thread it, so the subject starts with "Re:".`;
  const chips = $("chips");
  chips.innerHTML = "";
  for (const p of PLACEHOLDERS[editing]) {
    const c = el("code", { textContent: `{${p}}`, title: "Insert" });
    c.onclick = () => {
      const f = lastField || $("body");
      const at = f.selectionStart ?? f.value.length;
      f.value = f.value.slice(0, at) + `{${p}}` + f.value.slice(f.selectionEnd ?? at);
      f.focus();
      f.selectionStart = f.selectionEnd = at + p.length + 2;
      f.dispatchEvent(new Event("input"));
    };
    chips.append(c, " ");
  }
}
let lastField = null;
for (const id of ["subject", "body"]) {
  $(id).addEventListener("focus", () => (lastField = $(id)));
  $(id).addEventListener("input", () => { data.templates[editing][id] = $(id).value; save(); renderMessage(); });
}
document.querySelectorAll(".tab").forEach((b) => (b.onclick = () => { editing = b.dataset.kind; renderTemplate(); }));
$("resetTemplate").onclick = () => {
  if (!confirm(`Replace your ${editing === "first" ? "first email" : "follow-up"} text with the default?`)) return;
  data.templates[editing] = structuredClone(DEFAULT_TEMPLATES[editing]);
  save(); renderTemplate(); renderMessage();
};

$("addRows").onclick = addRows;
$("openNext").onclick = () => {
  const next = nextToOpen();
  if (next) { select(next.id); openInGmail(next); }
};
$("openSel").onclick = () => { const r = data.rows.find((x) => x.id === selected); if (r) openInGmail(r); };
$("copy").onclick = async () => {
  const r = data.rows.find((x) => x.id === selected);
  if (!r) return;
  const m = emailFor(r);
  await navigator.clipboard.writeText(`To: ${m.to}\nSubject: ${m.subject}\n\n${m.body}`);
  $("copy").textContent = "Copied ✓";
  setTimeout(() => ($("copy").textContent = "Copy text"), 1500);
};

function renderResumeLine() {
  const line = $("resumeLine");
  line.classList.toggle("missing", !resume);
  line.innerHTML = "";
  if (resume) line.append(`Attached to every email: ${resume.name}`);
  else {
    const a = el("a", { href: "#", textContent: "Add your resume on your profile page" });
    a.onclick = (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); };
    line.append("No resume saved yet, so emails will go without one. ", a, ".");
  }
}

// Gmail marks rows as sent from another tab.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.resume) { resume = changes.resume.newValue || null; renderResumeLine(); renderMessage(); }
  if (changes.outreach && changes.outreach.newValue) {
    const fresh = changes.outreach.newValue.rows || [];
    let changed = false;
    for (const r of data.rows) {
      const f = fresh.find((x) => x.id === r.id);
      if (f && (f.status !== r.status || (f.history || []).length !== (r.history || []).length)) {
        Object.assign(r, { status: f.status, sentOn: f.sentOn, followedOn: f.followedOn, followUps: f.followUps, history: f.history });
        changed = true;
      }
    }
    if (changed && (!document.activeElement || !document.activeElement.closest("#rows, #subject, #body"))) renderAll();
  }
});

chrome.storage.local.get(["profile", "resume", "outreach"], (s) => {
  profile = s.profile || {};
  resume = s.resume || null;
  if (s.outreach) {
    // Earlier versions kept one template under "template".
    const templates = s.outreach.templates || { first: s.outreach.template || DEFAULT_TEMPLATES.first };
    data = { templates: { ...structuredClone(DEFAULT_TEMPLATES), ...templates }, rows: s.outreach.rows || [] };
    // Upgrade the old intro line (dropped whenever a company had no role) if you haven't reworded it.
    data.templates.first.body = data.templates.first.body.replace(OLD_INTRO, "My name is {fullName}, and I'm writing to apply for {position} at {company}.");
    if (data.templates.first.body.trim() === PREVIOUS_FIRST_BODY.trim()) data.templates.first = structuredClone(DEFAULT_TEMPLATES.first);
    data.templates.followup.body = data.templates.followup.body.replace("my application for the {role} role at {company}", "my application for {position} at {company}");
  }
  selected = data.rows[0] && data.rows[0].id;
  renderTemplate();
  renderResumeLine();
  renderAll();
  checkGmailAccess();
});
