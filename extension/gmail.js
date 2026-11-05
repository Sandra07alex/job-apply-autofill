// Injected into a Gmail compose tab opened from "Email companies".
// Attaches your saved resume, then marks the company as emailed when you click Send.
(async () => {
  const job = window.__outreachJob;
  if (!job || window.__outreachStarted) return;
  window.__outreachStarted = true;
  window.__outreachJob = null;

  const hasChrome = typeof chrome !== "undefined" && !!chrome.storage;
  const getStore = (keys) => hasChrome ? chrome.storage.local.get(keys) : Promise.resolve(window.__AUTOFILL_TEST__ || {});
  const setStore = (v) => hasChrome ? chrome.storage.local.set(v) : Promise.resolve(Object.assign(window.__AUTOFILL_TEST__, v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

  // One message box at a time; `link` adds e.g. a "Download resume" link.
  let current = null;
  function toast(message, ms = 9000, link = null) {
    if (current) current.remove();
    const box = current = document.createElement("div");
    box.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:380px;background:#1f2937;color:#fff;" +
      "font:13px/1.4 system-ui,sans-serif;padding:10px 12px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.25)";
    box.textContent = message;
    if (link) {
      const a = document.createElement("a");
      Object.assign(a, link);
      a.style.cssText = "color:#93c5fd;margin-left:6px;font-weight:600";
      box.appendChild(a);
    }
    document.body.appendChild(box);
    if (ms) setTimeout(() => box.remove(), ms);
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

    // (No file name here: the check below looks for the name on the page.)
    toast("Attaching your resume…", 0);

    // Gmail shows the attachment as a chip with the file name (sometimes shortened).
    const base = resume.name.replace(/\.[^.]+$/, "").slice(0, 20);
    const shown = () => (document.body.innerText || "").includes(base) ||
      [...document.querySelectorAll("[aria-label], [title]")].some((e) => (e.getAttribute("aria-label") || e.getAttribute("title") || "").includes(base));
    const waitShown = async (ms) => { for (let t = 0; t < ms; t += 250) { if (shown()) return true; await sleep(250); } return false; };
    const fillInput = (input) => {
      input.files = dt.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const fileInputs = () => [...document.querySelectorAll("input[type=file]")];

    const strategies = [
      // 1. Gmail's hidden upload input, when it already exists.
      ["upload input", async () => {
        const input = document.querySelector("input[type=file][name='Filedata']") || fileInputs()[0];
        if (!input) return false;
        fillInput(input);
        return true;
      }],
      // 2. A full drag: Gmail shows a "Drop files here" layer while a file is dragged
      //    over the message, and only takes the drop on that layer.
      ["drag and drop", async () => {
        const r = body.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + Math.min(r.height / 2, 120);
        const fire = (node, type) => node.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y }));
        fire(document.documentElement, "dragenter");
        fire(body, "dragenter");
        fire(body, "dragover");
        await sleep(500);
        const zone = document.elementFromPoint(x, y) || body;
        fire(zone, "dragenter");
        fire(zone, "dragover");
        fire(zone, "drop");
        fire(zone, "dragleave");
        return true;
      }],
      // 3. Gmail's paperclip button creates the upload input. Without a real click,
      //    Chrome doesn't open the file window, so the input can be filled directly.
      ["paperclip button", async () => {
        const btn = document.querySelector("[command='Files'], [data-tooltip^='Attach files'], [aria-label^='Attach files']");
        if (!btn) return false;
        const before = new Set(fileInputs());
        for (const type of ["mousedown", "mouseup", "click"]) btn.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
        await sleep(400);
        const input = fileInputs().find((i) => !before.has(i)) || fileInputs()[0];
        if (!input) return false;
        fillInput(input);
        return true;
      }],
      // 4. Pasting the file into the message.
      ["paste", async () => {
        body.focus();
        body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
        return true;
      }],
    ];

    let attached = shown();
    for (const [name, attempt] of strategies) {
      if (attached) break;
      let tried = false;
      try { tried = await attempt(); } catch (e) { console.warn(`Job Apply Autofill: attaching by ${name} failed`, e); }
      if (tried) attached = await waitShown(4000);
      console.info(`Job Apply Autofill: attach by ${name}: ${!tried ? "not available" : attached ? "worked" : "no attachment seen"}`);
    }
    if (attached) {
      toast(`Attached ${resume.name}. Read the email, then click Send.`);
    } else {
      // Last resort: hand you the file to drag in.
      const url = URL.createObjectURL(new Blob([bytes], { type: resume.type || "application/pdf" }));
      toast(`Couldn't attach your resume automatically. Click the 📎 in Gmail and choose it, or`, 0,
        { href: url, download: resume.name, textContent: "download it here" });
    }
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
