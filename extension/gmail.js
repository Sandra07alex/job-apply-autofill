// Injected into a Gmail compose tab opened from "Email companies".
// Attaches your saved resume, then marks the company as emailed when you click Send.
(async () => {
  const job = window.__outreachJob;
  if (!job) return;
  window.__outreachJob = null;

  const hasChrome = typeof chrome !== "undefined" && !!chrome.storage;
  const getStore = (keys) => hasChrome ? chrome.storage.local.get(keys) : Promise.resolve(window.__AUTOFILL_TEST__ || {});
  const setStore = (v) => hasChrome ? chrome.storage.local.set(v) : Promise.resolve(Object.assign(window.__AUTOFILL_TEST__, v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

  function toast(message) {
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:380px;background:#1f2937;color:#fff;" +
      "font:13px/1.4 system-ui,sans-serif;padding:10px 12px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.25)";
    box.textContent = message;
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 9000);
  }

  // Gmail renders compose a moment after the page loads.
  const composeBody = () => document.querySelector("div[aria-label='Message Body'][contenteditable='true'], div[role='textbox'][contenteditable='true']");
  for (let t = 0; t < 30000 && !composeBody(); t += 300) await sleep(300);
  const body = composeBody();
  if (!body) { toast("Couldn't find the Gmail compose window, so your resume wasn't attached."); return; }

  // ---------- Attach the resume ----------
  const { resume } = await getStore(["resume"]);
  if (resume && resume.data) {
    const bin = atob(resume.data.slice(resume.data.indexOf(",") + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], resume.name || "resume.pdf", { type: resume.type || "application/pdf" }));

    const shown = () => (document.body.innerText || "").includes(resume.name);
    const alreadyThere = shown();
    // Gmail's hidden attachment input; dropping on the message is the fallback.
    const input = document.querySelector("input[type=file][name='Filedata']");
    if (input) {
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      for (const type of ["dragenter", "dragover", "drop"]) {
        body.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
      }
    }
    let attached = false;
    for (let t = 0; t < 8000 && !attached; t += 250) { await sleep(250); attached = !alreadyThere && shown(); }
    toast(attached
      ? `Attached ${resume.name}. Read the email, then click Send.`
      : `Couldn't attach your resume automatically. Drag ${resume.name} into the email before sending.`);
  } else {
    toast("No resume saved in your profile, so nothing was attached. Read the email, then click Send.");
  }

  // ---------- Mark as sent ----------
  let done = false;
  async function markSent() {
    if (done) return;
    done = true;
    const s = await getStore(["outreach", "applications"]);
    const outreach = s.outreach || { rows: [] };
    const row = (outreach.rows || []).find((r) => r.id === job.id);
    if (row) {
      // Keep what was actually sent, including any edits you made in Gmail.
      const subjectBox = document.querySelector("input[name='subjectbox']");
      row.history = (row.history || []).concat({ kind: job.kind || "first", on: today(),
        subject: (subjectBox && subjectBox.value) || job.subject || "", body: (body.innerText || "").trim() || job.body || "" });
      if (job.kind === "followup") {
        row.status = "followed"; row.followedOn = today(); row.followUps = (row.followUps || 0) + 1;
      } else {
        row.status = "sent"; row.sentOn = today();
      }
    }
    if (job.kind === "followup") {
      await setStore({ outreach });
      toast(`Follow-up to ${job.company || job.email} saved in your email tracker.`);
      return;
    }
    // Also log it in "My applications", once per address and role.
    const apps = s.applications || [];
    const key = `email:${job.email.toLowerCase()}:${job.role || ""}`;
    if (!apps.some((a) => a.key === key)) {
      apps.push({ id: Date.now().toString(36), key, url: "", company: job.company, role: job.role || "",
        status: "Applied", created: today(), updated: today(), appliedOn: today(), notes: `Emailed ${job.email}` });
    }
    await setStore({ outreach, applications: apps });
    toast(`Marked ${job.company || job.email} as sent in your email tracker and added it to My applications.`);
  }
  // Send button (its tooltip/label starts with "Send"), or Ctrl/Cmd+Enter.
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[role='button'], button");
    const label = b && (b.getAttribute("data-tooltip") || b.getAttribute("aria-label") || b.textContent || "").trim();
    if (label && /^send\b/i.test(label)) markSent();
  }, true);
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && e.target.closest && e.target.closest("[contenteditable='true'], input")) markSent();
  }, true);
})();
