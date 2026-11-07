/**
 * Sentinelytics Background Service Worker v2.3
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log("[Sentinelytics] Extension installed & active.");
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "OPEN_DASHBOARD") {
    const targetUrl = request.url || "http://localhost:3000";

    chrome.tabs.query({}, (tabs) => {
      // Find existing dashboard tab
      const existingTab = tabs.find(
        (t) =>
          t.url &&
          (t.url.startsWith("http://localhost:3000") ||
            t.url.startsWith("http://localhost:8000") ||
            t.url.startsWith("http://127.0.0.1:3000") ||
            t.url.startsWith("http://127.0.0.1:8000"))
      );

      if (existingTab && existingTab.id) {
        chrome.tabs.update(existingTab.id, { url: targetUrl, active: true }, (tab) => {
          sendResponse({ status: "success", tabId: tab.id, updated: true });
        });
      } else {
        chrome.tabs.create({ url: targetUrl }, (tab) => {
          sendResponse({ status: "success", tabId: tab.id, created: true });
        });
      }
    });

    return true;
  }
});
