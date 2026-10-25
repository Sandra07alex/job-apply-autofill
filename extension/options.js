const PERSONAL = [
  ["firstName", "First name"], ["lastName", "Last name"],
  ["email", "Email"], ["phone", "Phone (without country code)"],
  ["phoneCountryCode", "Phone country code (e.g. +91)"],
  ["addressLine1", "Address line 1", "wide"],
  ["city", "City"], ["state", "State"], ["postalCode", "PIN / postal code"], ["country", "Country"],
  ["linkedin", "LinkedIn URL"], ["github", "GitHub URL"], ["portfolio", "Portfolio / website"],
];
const JOB = [
  ["totalExperience", "Total experience (years)"], ["noticePeriod", "Notice period (e.g. Immediate, 30 days)"],
  ["currentCtc", "Current CTC / salary"], ["expectedCtc", "Expected CTC / salary"],
  ["workAuthorized", "Authorized to work in your country?", "yesno"],
  ["needSponsorship", "Need visa sponsorship?", "yesno"],
  ["willingToRelocate", "Willing to relocate?", "yesno"],
  ["skills", "Skills (comma separated)", "wide"],
];
const EDU = [
  ["school", "School / college / university", "wide"], ["degree", "Degree (e.g. B.Tech)"],
  ["field", "Field of study / branch"], ["gpa", "CGPA / percentage"],
  ["startMonth", "Start month", "month"], ["startYear", "Start year"],
  ["endMonth", "End month", "month"], ["endYear", "End / graduation year"],
];
const EXP = [
  ["title", "Job title / role"], ["company", "Company"], ["location", "Location"],
  ["startMonth", "Start month", "month"], ["startYear", "Start year"],
  ["endMonth", "End month", "month"], ["endYear", "End year"],
  ["current", "I currently work here", "check"],
  ["description", "What you did (description)", "textarea"],
];
const MONTHS = ["", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
const MONTH_NAMES = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function field([key, label, kind], value, prefix) {
  const wrap = document.createElement("label");
  let input;
  if (kind === "yesno" || kind === "month") {
    input = document.createElement("select");
    const opts = kind === "yesno" ? ["", "Yes", "No"] : MONTHS;
    opts.forEach((v, i) => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = kind === "month" ? (v ? `${v} - ${MONTH_NAMES[i]}` : "") : v;
      input.appendChild(o);
    });
    input.value = value || "";
  } else if (kind === "check") {
    wrap.className = "check";
    input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !!value;
  } else if (kind === "textarea") {
    wrap.classList.add("wide");
    input = document.createElement("textarea");
    input.value = value || "";
  } else {
    input = document.createElement("input");
    input.value = value || "";
  }
  if (kind === "wide") wrap.classList.add("wide");
  input.dataset.key = key;
  if (kind === "check") { wrap.append(input, document.createTextNode(label)); }
  else { wrap.append(document.createTextNode(label), input); }
  return wrap;
}

function renderGrid(container, defs, data) {
  container.innerHTML = "";
  defs.forEach((d) => container.appendChild(field(d, data[d[0]])));
}

function addEntry(container, defs, data, title) {
  const div = document.createElement("div");
  div.className = "entry";
  const head = document.createElement("div");
  head.className = "entry-head";
  const t = document.createElement("span");
  const del = document.createElement("button");
  del.textContent = "Remove";
  del.className = "danger";
  del.onclick = () => { div.remove(); renumber(container, title); };
  head.append(t, del);
  const grid = document.createElement("div");
  grid.className = "grid";
  defs.forEach((d) => grid.appendChild(field(d, data[d[0]])));
  div.append(head, grid);
  container.appendChild(div);
  renumber(container, title);
}

function renumber(container, title) {
  [...container.children].forEach((c, i) => (c.querySelector(".entry-head span").textContent = `${title} ${i + 1}`));
}

function readGrid(container) {
  const out = {};
  container.querySelectorAll("[data-key]").forEach((el) => {
    out[el.dataset.key] = el.type === "checkbox" ? el.checked : el.value.trim();
  });
  return out;
}

function collect() {
  return {
    personal: readGrid(document.getElementById("personal")),
    job: readGrid(document.getElementById("job")),
    education: [...document.getElementById("education").children].map(readGrid),
    experience: [...document.getElementById("experience").children].map(readGrid),
  };
}

function render(p) {
  p = p || {};
  renderGrid(document.getElementById("personal"), PERSONAL, p.personal || {});
  renderGrid(document.getElementById("job"), JOB, p.job || {});
  const edu = document.getElementById("education"), exp = document.getElementById("experience");
  edu.innerHTML = ""; exp.innerHTML = "";
  (p.education && p.education.length ? p.education : [{}]).forEach((e) => addEntry(edu, EDU, e, "Education"));
  (p.experience || []).forEach((e) => addEntry(exp, EXP, e, "Experience"));
}

document.getElementById("addEdu").onclick = () => addEntry(document.getElementById("education"), EDU, {}, "Education");
document.getElementById("addExp").onclick = () => addEntry(document.getElementById("experience"), EXP, {}, "Experience");

document.getElementById("save").onclick = () => {
  chrome.storage.local.set({ profile: collect() }, () => {
    const s = document.getElementById("saved");
    s.textContent = "Saved \u2713";
    setTimeout(() => (s.textContent = ""), 2000);
  });
};

document.getElementById("export").onclick = () => {
  const blob = new Blob([JSON.stringify(collect(), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "job-profile.json";
  a.click();
};
document.getElementById("importBtn").onclick = () => document.getElementById("importFile").click();
document.getElementById("importFile").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try { render(JSON.parse(await f.text())); alert("Imported. Click Save profile to keep it."); }
  catch { alert("That file isn't a valid profile backup."); }
};

chrome.storage.local.get("profile", ({ profile }) => render(profile));
