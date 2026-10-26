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

document.getElementById("fill").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  statusEl.textContent = "Filling\u2026";
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ["fill.js"],
    });
    let filled = 0, needs = 0, uploaded = 0, watching = 0, err = null;
    for (const r of results) {
      if (!r.result) continue;
      if (r.result.error) err = r.result.error;
      filled += r.result.filled || 0;
      needs += r.result.unmatched || 0;
      uploaded += r.result.uploaded || 0;
      watching += r.result.watching || 0;
    }
    if (err && !filled) statusEl.textContent = err;
    else statusEl.innerHTML = `Filled <b>${filled}</b> field(s). <b>${needs}</b> left for you.` +
      (uploaded ? "<br>Attached your resume." : "") +
      (needs ? "<br>Check the orange ones, then review and submit." : "<br>Review everything, then submit.") +
      (watching ? "<br>Answers you pick yourself are saved for next time." : "");
  } catch (e) {
    statusEl.textContent = "Can't run on this page (Chrome blocks extensions on some pages).";
  }
});
