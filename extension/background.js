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
// gmail.js runs on every Gmail page and asks here whether its tab was opened that way.
// The answer stays valid for 2 minutes, in case Gmail reloads itself while opening.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "outreach-job" || !sender.tab) return;
  const key = "outreach-" + sender.tab.id;
  chrome.storage.session.get(key).then((s) => {
    const job = s[key];
    sendResponse(job && Date.now() - (job.at || 0) < 120000 ? job : null);
  });
  return true; // answering asynchronously
});
chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove("outreach-" + tabId));
