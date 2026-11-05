// Keyboard shortcut (Alt+Shift+F) fills the current page.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "fill-page") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ["fill.js"],
    });
  } catch (e) {
    console.warn("Autofill could not run on this page:", e);
  }
});

// "Email companies" opens Gmail in a new tab and notes the tab id in session storage.
// Once Gmail has loaded there, hand the company details to gmail.js to attach the resume.
// Gmail can reload itself while opening, so keep trying for 2 minutes (gmail.js runs once per page).
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== "complete" || !tab.url || !tab.url.startsWith("https://mail.google.com/")) return;
  const key = "outreach-" + tabId;
  const job = (await chrome.storage.session.get(key))[key];
  if (!job) return;
  if (Date.now() - (job.at || 0) > 120000) { await chrome.storage.session.remove(key); return; }
  try {
    await chrome.scripting.executeScript({ target: { tabId }, func: (j) => { window.__outreachJob = j; }, args: [job] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ["gmail.js"] });
  } catch (e) {
    console.warn("Could not prepare the Gmail tab:", e);
  }
});
chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove("outreach-" + tabId));
