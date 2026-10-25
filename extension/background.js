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
