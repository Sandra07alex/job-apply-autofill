const statusEl = document.getElementById("status");
const overwriteEl = document.getElementById("overwrite");

chrome.storage.local.get(["settings", "profile"], ({ settings, profile }) => {
  overwriteEl.checked = !!(settings && settings.overwrite);
  if (!profile) statusEl.textContent = "No profile yet. Click \u201cEdit my profile\u201d first.";
});

overwriteEl.addEventListener("change", () => {
  chrome.storage.local.set({ settings: { overwrite: overwriteEl.checked } });
});

document.getElementById("edit").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.getElementById("apps").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("tracker.html") }));
document.getElementById("mail").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("outreach.html") }));
document.getElementById("find").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("findjobs.html") }));

// Save the job on this page to My applications as "To apply" (nothing is filled).
document.getElementById("save").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => { window.__AUTOFILL_SAVE_ONLY__ = true; } });
    const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["fill.js"] });
    const res = r && r.result;
    if (!res || res.error) { statusEl.textContent = (res && res.error) || "Couldn't save this job."; return; }
    statusEl.textContent = `Saved: ${[res.saved.role, res.saved.company].filter(Boolean).join(" at ") || "this job"} ` +
      `(${res.saved.status}). Find it in My applications; you can fix the name there.`;
  } catch (e) {
    statusEl.textContent = "Can't run on this page (Chrome blocks extensions on some pages).";
  }
});

document.getElementById("fill").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  statusEl.textContent = "Filling\u2026";
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ["guide.js", "fill.js"], // guide.js: the step-by-step bar
    });
    let filled = 0, needs = 0, uploaded = 0, watching = 0, err = null, tracked = null;
    for (const r of results) {
      if (!r.result) continue;
      if (r.result.error) err = r.result.error;
      filled += r.result.filled || 0;
      needs += r.result.unmatched || 0;
      uploaded += r.result.uploaded || 0;
      watching += r.result.watching || 0;
      tracked = tracked || r.result.tracked;
    }
    if (err && !filled) statusEl.textContent = err;
    else {
      statusEl.innerHTML = `Filled <b>${filled}</b> field(s). <b>${needs}</b> left for you.` +
        (uploaded ? "<br>Attached your resume." : "") +
        (needs ? "<br>Check the orange ones, then review and submit." : "<br>Review everything, then submit.") +
        (watching ? "<br>Answers you pick yourself are saved for next time." : "");
      // Company/role come from the page, so add them as text, never as HTML.
      if (tracked) {
        const line = document.createElement("div");
        line.style.marginTop = "6px";
        line.textContent = `Tracked: ${[tracked.role, tracked.company].filter(Boolean).join(" at ")} (${tracked.status})`;
        statusEl.appendChild(line);
      }
    }
  } catch (e) {
    statusEl.textContent = "Can't run on this page (Chrome blocks extensions on some pages).";
  }
});
