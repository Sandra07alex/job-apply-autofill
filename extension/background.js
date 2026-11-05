// guide.js (the step-by-step bar) runs first, then fill.js reports to it.
const FILL_FILES = ["guide.js", "fill.js"];

function fillTab(tabId, frameIds) {
  return chrome.scripting.executeScript({ target: frameIds ? { tabId, frameIds } : { tabId, allFrames: true }, files: FILL_FILES });
}

// Keyboard shortcuts: Alt+Shift+F fills the current page, Alt+Shift+N goes to the next step.
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  try {
    if (command === "fill-page") await fillTab(tab.id);
    if (command === "next-step") await chrome.tabs.sendMessage(tab.id, { type: "guide-next" });
  } catch (e) {
    console.warn("Autofill could not run on this page:", e);
  }
});

// ---------- Step-by-step guide ----------
// The bar asks for each new step to be filled. For sites that load a whole new page per
// step, remember the tab while guiding and fill again after each load on the same site.
const guideKey = (tabId) => "guide-" + tabId;

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || !sender.tab) return;
  if (msg.type === "guide-fill") fillTab(sender.tab.id, [sender.frameId]).catch((e) => console.warn("Guide fill failed:", e));
  if (msg.type === "guide-start" && sender.frameId === 0) chrome.storage.session.set({ [guideKey(sender.tab.id)]: { host: new URL(sender.url).host } });
  if (msg.type === "guide-stop") chrome.storage.session.remove(guideKey(sender.tab.id));
});

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== "complete" || !tab.url) return;
  const key = guideKey(tabId);
  const guide = (await chrome.storage.session.get(key))[key];
  if (!guide) return;
  let host = "";
  try { host = new URL(tab.url).host; } catch (_) {}
  if (host !== guide.host) { chrome.storage.session.remove(key); return; } // left the application
  fillTab(tabId).catch((e) => console.warn("Guide fill failed:", e));
});

// ---------- Email companies ----------
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

chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove(["outreach-" + tabId, guideKey(tabId)]));
