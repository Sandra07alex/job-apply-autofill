const STATUSES = ["To apply", "In progress", "Applied", "Interview", "Offer", "Rejected", "Withdrawn"];
const STATUS_COLORS = { "To apply": "#d97706", "In progress": "#6b7280", Applied: "#2563eb", Interview: "#7c3aed", Offer: "#16a34a", Rejected: "#dc2626", Withdrawn: "#9ca3af" };
const FOLLOW_UP_DAYS = 10;

let apps = [];
let filter = "All";

const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const daysSince = (iso) => iso ? Math.floor((Date.parse(today()) - Date.parse(iso)) / 864e5) : 0;

// Applied, and nothing has happened for a while.
const needsFollowUp = (a) => a.status === "Applied" &&
  daysSince([a.appliedOn, a.updated].filter(Boolean).sort().pop()) >= FOLLOW_UP_DAYS;

function save() {
  chrome.storage.local.set({ applications: apps });
}

function update(app, change) {
  Object.assign(app, change, { updated: today() });
  if (change.status === "Applied" && !app.appliedOn) app.appliedOn = today();
  save();
}

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
}

function renderChips() {
  const counts = { All: apps.length, "Follow up": apps.filter(needsFollowUp).length };
  for (const s of STATUSES) counts[s] = apps.filter((a) => a.status === s).length;
  const chips = document.getElementById("chips");
  chips.innerHTML = "";
  for (const name of ["All", ...STATUSES, "Follow up"]) {
    if (name !== "All" && !counts[name]) continue;
    const b = el("button", { className: "chip" + (filter === name ? " on" : "") }, name, el("b", { textContent: counts[name] }));
    b.onclick = () => { filter = filter === name && name !== "All" ? "All" : name; render(); };
    chips.appendChild(b);
  }
}

function textCell(app, key, cls, placeholder) {
  const input = el("input", { value: app[key] || "", placeholder });
  input.onchange = () => update(app, { [key]: input.value.trim() });
  return el("td", { className: cls }, input);
}

function row(app) {
  const status = el("select");
  for (const s of STATUSES) status.appendChild(el("option", { value: s, textContent: s, selected: app.status === s }));
  status.style.color = STATUS_COLORS[app.status] || "";
  status.onchange = () => { update(app, { status: status.value }); render(); };
  const statusCell = el("td", {}, el("div", { className: "status" }, status));
  if (needsFollowUp(app)) {
    const days = daysSince([app.appliedOn, app.updated].filter(Boolean).sort().pop());
    statusCell.firstChild.appendChild(el("span", { className: "badge", title: `No update for ${days} days`, textContent: "Follow up" }));
  }

  const applied = el("input", { type: "date", value: app.appliedOn || "" });
  applied.onchange = () => update(app, { appliedOn: applied.value });

  const icons = el("td", { className: "icons" });
  if (app.url) icons.appendChild(el("a", { href: app.url, target: "_blank", rel: "noopener", title: "Open job", textContent: "↗" }));
  const del = el("button", { title: "Delete", textContent: "✕" });
  del.onclick = () => {
    if (!confirm(`Delete ${app.company || "this application"}${app.role ? " – " + app.role : ""}?`)) return;
    apps = apps.filter((a) => a !== app);
    save();
    render();
  };
  icons.appendChild(del);

  return el("tr", {},
    textCell(app, "company", "company", "Company"),
    textCell(app, "role", "role", "Role"),
    statusCell,
    el("td", {}, applied),
    textCell(app, "notes", "notes", "Notes (recruiter, salary, next step…)"),
    icons);
}

function render() {
  renderChips();
  const q = document.getElementById("search").value.trim().toLowerCase();
  const shown = apps
    .filter((a) => filter === "All" || (filter === "Follow up" ? needsFollowUp(a) : a.status === filter))
    .filter((a) => !q || [a.company, a.role, a.notes].join(" ").toLowerCase().includes(q))
    .sort((a, b) => (b.updated || "").localeCompare(a.updated || "") || b.id.localeCompare(a.id));
  const rows = document.getElementById("rows");
  rows.innerHTML = "";
  shown.forEach((a) => rows.appendChild(row(a)));
  const empty = document.getElementById("empty");
  empty.hidden = shown.length > 0;
  empty.textContent = apps.length ? "Nothing matches." : "No applications yet. Click “Fill this page” on a job application and it shows up here.";
}

document.getElementById("search").oninput = render;

document.getElementById("add").onclick = () => {
  apps.push({ id: Date.now().toString(36), key: "manual-" + Date.now(), url: "", company: "", role: "",
    status: "Applied", created: today(), updated: today(), appliedOn: today(), notes: "" });
  save();
  filter = "All";
  document.getElementById("search").value = "";
  render();
  const first = document.querySelector("#rows tr:first-child .company input");
  if (first) first.focus();
};

document.getElementById("csv").onclick = () => {
  const cols = [["Company", "company"], ["Role", "role"], ["Status", "status"], ["Applied on", "appliedOn"],
    ["First filled", "created"], ["Last update", "updated"], ["Link", "url"], ["Notes", "notes"]];
  const cell = (v) => `"${String(v || "").replace(/"/g, '""')}"`;
  const csv = [cols.map((c) => cell(c[0])).join(","), ...apps.map((a) => cols.map((c) => cell(a[c[1]])).join(","))].join("\r\n");
  const a = el("a", { href: URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" })), download: `applications-${today()}.csv` });
  a.click();
};

// Fill on another tab can add or update entries while this page is open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.applications) return;
  apps = changes.applications.newValue || [];
  if (!document.activeElement || !document.activeElement.closest("#rows")) render();
});

chrome.storage.local.get("applications", ({ applications }) => { apps = applications || []; render(); });
