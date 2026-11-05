const DEFAULT_TEMPLATE = {
  subject: "Application for {role} – {fullName}",
  body: `Dear {hrName},

My name is {fullName}, and I'm writing to apply for the {role} role at {company}.
{note}

I currently work as {currentTitle} at {currentCompany}.
I studied {degree} in {field} at {school}.
My skills include {skills}.

I've attached my resume and would be glad to talk about how I can contribute to {company}.

Best regards,
{fullName}
{phone}
{email}
{linkedin}
{portfolio}`,
};
const PLACEHOLDERS = ["company", "role", "hrName", "note", "fullName", "firstName", "currentTitle", "currentCompany",
  "skills", "experience", "degree", "field", "school", "phone", "email", "linkedin", "github", "portfolio"];
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$/i;

let profile = {}, resume = null;
let data = { template: { ...DEFAULT_TEMPLATE }, rows: [] };
let selected = null;

const $ = (id) => document.getElementById(id);
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const save = () => chrome.storage.local.set({ outreach: data });

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
}

// ---------- Template ----------
function vars(row) {
  const P = profile.personal || {}, J = profile.job || {};
  const now = (profile.experience || []).find((e) => e.current) || {};
  const edu = (profile.education || [])[0] || {};
  return {
    company: row.company, role: row.role, hrName: row.hrName || "Hiring Team", note: row.note,
    fullName: [P.firstName, P.lastName].filter(Boolean).join(" "), firstName: P.firstName,
    currentTitle: now.title, currentCompany: now.company, skills: J.skills, experience: J.totalExperience,
    degree: edu.degree, field: edu.field, school: edu.school,
    phone: [P.phoneCountryCode, P.phone].filter(Boolean).join(" "), email: P.email,
    linkedin: P.linkedin, github: P.github, portfolio: P.portfolio,
  };
}

// Drops any line with an empty placeholder; unknown {words} are left as typed.
function render(text, v) {
  return text.split("\n")
    .filter((line) => [...line.matchAll(/\{(\w+)\}/g)].every((m) => !(m[1] in v) || v[m[1]]))
    .map((line) => line.replace(/\{(\w+)\}/g, (all, k) => (k in v ? v[k] : all)))
    .join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function emailFor(row) {
  const v = vars(row);
  const name = v.fullName || "";
  return {
    to: row.email,
    subject: render(data.template.subject, v) || `Job application${name ? " – " + name : ""}`,
    body: render(data.template.body, v),
  };
}

// ---------- Opening in Gmail ----------
function gmailUrl(mail) {
  const q = new URLSearchParams({ view: "cm", fs: "1", to: mail.to, su: mail.subject, body: mail.body });
  return "https://mail.google.com/mail/?" + q.toString();
}

async function openInGmail(row) {
  if (!EMAIL_RE.test(row.email || "")) { alert(`Check the email address for ${row.company || "this company"}.`); return; }
  if (row.status === "sent" && !confirm(`You already emailed ${row.company} on ${row.sentOn}. Open it again?`)) return;
  const mail = emailFor(row);
  const tab = await chrome.tabs.create({ url: gmailUrl(mail) });
  // The background script attaches the resume once Gmail has loaded in this tab.
  await chrome.storage.session.set({ ["outreach-" + tab.id]: { id: row.id, company: row.company, role: row.role, email: row.email } });
  if (row.status !== "sent") row.status = "opened";
  save();
  renderRows();
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
    data.rows.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), hrName: "", note: "", status: "new", sentOn: "", ...r });
    added++;
  }
  save();
  $("addMsg").textContent = found.length
    ? `Added ${added}.` + (dupes ? ` Skipped ${dupes} already in the list.` : "")
    : "No email addresses found. Use: Company, email, Role";
  if (added) $("paste").value = "";
  if (!selected && data.rows.length) selected = data.rows[0].id;
  renderRows();
  renderPreview();
}

function cell(row, key, cls, placeholder) {
  const input = el("input", { value: row[key] || "", placeholder });
  if (key === "email") input.classList.toggle("bad", !!row.email && !EMAIL_RE.test(row.email));
  input.onfocus = () => { selected = row.id; markSelected(); renderPreview(); };
  input.oninput = () => {
    row[key] = input.value.trim();
    if (key === "email") input.classList.toggle("bad", !!row.email && !EMAIL_RE.test(row.email));
    save();
    renderPreview();
  };
  return el("td", { className: cls }, input);
}

const STATUS_TEXT = { new: "Not sent", opened: "Opened", sent: "Sent" };

function rowEl(row) {
  const status = el("td", { className: "status st-" + row.status, textContent: STATUS_TEXT[row.status] || row.status,
    title: row.sentOn ? `Sent on ${row.sentOn}` : "" });
  const open = el("button", { className: "primary", textContent: "Open in Gmail" });
  open.onclick = () => openInGmail(row);
  const preview = el("button", { textContent: "Preview" });
  preview.onclick = () => { selected = row.id; markSelected(); renderPreview(); $("previewWrap").scrollIntoView({ behavior: "smooth" }); };
  const del = el("button", { className: "x", title: "Remove", textContent: "✕" });
  del.onclick = () => {
    data.rows = data.rows.filter((r) => r !== row);
    if (selected === row.id) selected = data.rows[0] && data.rows[0].id;
    save(); renderRows(); renderPreview();
  };
  const tr = el("tr", {},
    cell(row, "company", "company", "Company"), cell(row, "email", "email", "hr@company.com"),
    cell(row, "role", "", "Role"), cell(row, "hrName", "", "Hiring Team"),
    cell(row, "note", "", "Why this company (optional)"),
    status, el("td", { className: "acts" }, preview, " ", open, " ", del));
  tr.dataset.id = row.id;
  return tr;
}

function markSelected() {
  document.querySelectorAll("#rows tr").forEach((tr) => tr.classList.toggle("sel", tr.dataset.id === selected));
}

function renderRows() {
  const tbody = $("rows");
  tbody.innerHTML = "";
  data.rows.forEach((r) => tbody.appendChild(rowEl(r)));
  $("empty").hidden = data.rows.length > 0;
  $("openNext").disabled = !data.rows.some((r) => r.status !== "sent");
  markSelected();
}

function renderPreview() {
  const row = data.rows.find((r) => r.id === selected);
  const sample = row || { company: "Acme Systems", email: "hr@acme.com", role: data.rows.length ? "" : "Software Engineer" };
  const mail = emailFor(sample);
  $("pvTo").textContent = row ? mail.to : "(example) hr@acme.com";
  $("pvSubject").textContent = mail.subject;
  $("preview").textContent = mail.body;
  $("openSel").disabled = !row;
  $("copy").disabled = !row;
}

// ---------- Template editor ----------
function renderTemplate() {
  $("subject").value = data.template.subject;
  $("body").value = data.template.body;
}
let lastField = null;
for (const id of ["subject", "body"]) {
  $(id).addEventListener("focus", () => (lastField = $(id)));
  $(id).addEventListener("input", () => { data.template[id] = $(id).value; save(); renderPreview(); });
}
const chips = $("chips");
for (const p of PLACEHOLDERS) {
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
$("resetTemplate").onclick = () => {
  if (!confirm("Replace your email text with the default?")) return;
  data.template = { ...DEFAULT_TEMPLATE };
  save(); renderTemplate(); renderPreview();
};

$("addRows").onclick = addRows;
$("openNext").onclick = () => {
  const next = data.rows.find((r) => r.status === "new") || data.rows.find((r) => r.status !== "sent");
  if (next) { selected = next.id; renderPreview(); openInGmail(next); }
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
  if (changes.resume) { resume = changes.resume.newValue || null; renderResumeLine(); }
  if (changes.outreach && changes.outreach.newValue) {
    const fresh = changes.outreach.newValue.rows || [];
    for (const r of data.rows) {
      const f = fresh.find((x) => x.id === r.id);
      if (f && f.status !== r.status) { r.status = f.status; r.sentOn = f.sentOn; }
    }
    if (!document.activeElement || !document.activeElement.closest("#rows")) renderRows();
  }
});

chrome.storage.local.get(["profile", "resume", "outreach"], (s) => {
  profile = s.profile || {};
  resume = s.resume || null;
  if (s.outreach) data = { template: s.outreach.template || { ...DEFAULT_TEMPLATE }, rows: s.outreach.rows || [] };
  selected = data.rows[0] && data.rows[0].id;
  renderTemplate();
  renderResumeLine();
  renderRows();
  renderPreview();
});
