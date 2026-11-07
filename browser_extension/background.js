/**
 * Sentinelytics Background Service Worker v2.2
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log("[Sentinelytics] Extension installed & active.");
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "OPEN_DASHBOARD") {
    const targetUrl = request.url || "http://localhost:8000";
    chrome.tabs.create({ url: targetUrl }, (tab) => {
      sendResponse({ status: "success", tabId: tab.id });
    });
    return true;
  }
});

