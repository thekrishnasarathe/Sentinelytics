/**
 * Sentinelytics Extension Popup Controller
 * Connects active browser tab with FastAPI backend at http://localhost:8000
 */

const BACKEND_URL = "http://localhost:8000";
const DASHBOARD_URL = "http://localhost:3000";

let currentTabId = null;
let currentPlatform = "unsupported";
let currentPostId = null;
let currentTitle = "";
let currentUrl = "";
let isScrolling = false;

document.addEventListener("DOMContentLoaded", async () => {
  const platformPill = document.getElementById("platformPill");
  const targetTitle = document.getElementById("targetTitle");
  const commentCount = document.getElementById("commentCount");
  const toggleScrollBtn = document.getElementById("toggleScrollBtn");
  const toggleScrollText = document.getElementById("toggleScrollText");
  const paginateBtn = document.getElementById("paginateBtn");
  const sendToDashboardBtn = document.getElementById("sendToDashboardBtn");
  const statusBanner = document.getElementById("statusBanner");
  const backendStatus = document.getElementById("backendStatus");
  const openDashboardLink = document.getElementById("openDashboardLink");

  openDashboardLink.href = DASHBOARD_URL;

  // Check backend health
  fetch(`${BACKEND_URL}/health`)
    .then((r) => r.json())
    .then(() => {
      backendStatus.textContent = "Connected (8000)";
      backendStatus.style.color = "#34d399";
    })
    .catch(() => {
      backendStatus.textContent = "Offline (start server)";
      backendStatus.style.color = "#f87171";
    });

  // Query active tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs || tabs.length === 0) {
    statusBanner.textContent = "No active tab found.";
    return;
  }
  const tab = tabs[0];
  currentTabId = tab.id;
  currentUrl = tab.url || "";

  function setBanner(text, type = "normal") {
    statusBanner.textContent = text;
    statusBanner.className = `status-banner ${type}`;
  }

  function updateStatusFromResponse(resp) {
    if (!resp) return;
    currentPlatform = resp.platform || "unsupported";
    currentPostId = resp.postId;
    currentTitle = resp.title || tab.title;
    isScrolling = resp.isAutoScrolling;

    platformPill.textContent = currentPlatform.toUpperCase();
    platformPill.className = `platform-pill platform-${currentPlatform}`;
    targetTitle.textContent = currentTitle || "Unknown Page";
    commentCount.textContent = resp.count || 0;

    if (currentPlatform !== "unsupported") {
      toggleScrollBtn.disabled = false;
      sendToDashboardBtn.disabled = (resp.count === 0);

      if (isScrolling) {
        toggleScrollBtn.className = "btn btn-stop";
        toggleScrollText.textContent = "Stop Auto-Collector";
        setBanner("Auto-scrolling and collecting comments in real time...", "normal");
      } else {
        toggleScrollBtn.className = "btn btn-secondary";
        toggleScrollText.textContent = "Start Auto-Collector";
      }

      if (currentPlatform === "flipkart" || currentPlatform === "amazon") {
        paginateBtn.style.display = "flex";
      } else {
        paginateBtn.style.display = "none";
      }
    } else {
      toggleScrollBtn.disabled = true;
      sendToDashboardBtn.disabled = true;
      paginateBtn.style.display = "none";
      setBanner("Navigate to YouTube, Instagram, Flipkart, or Amazon to collect live reviews.", "normal");
    }
  }

  function queryTabStatus() {
    chrome.tabs.sendMessage(currentTabId, { action: "GET_STATUS" }, (resp) => {
      if (chrome.runtime.lastError || !resp) {
        // Content script might need injection if tab was open before extension load
        chrome.scripting.executeScript(
          { target: { tabId: currentTabId }, files: ["content.js"] },
          () => {
            if (!chrome.runtime.lastError) {
              setTimeout(() => {
                chrome.tabs.sendMessage(currentTabId, { action: "GET_STATUS" }, updateStatusFromResponse);
              }, 300);
            } else {
              setBanner("Refresh active tab to enable Sentinelytics collector.", "error");
            }
          }
        );
      } else {
        updateStatusFromResponse(resp);
      }
    });
  }

  queryTabStatus();

  // Auto-refresh counter every 1.5 seconds if scrolling
  const pollInterval = setInterval(() => {
    if (currentPlatform !== "unsupported") {
      chrome.tabs.sendMessage(currentTabId, { action: "GET_STATUS" }, (resp) => {
        if (!chrome.runtime.lastError && resp) {
          commentCount.textContent = resp.count || 0;
          if (resp.count > 0) sendToDashboardBtn.disabled = false;
        }
      });
    }
  }, 1500);

  // Toggle Auto-Scroll Button
  toggleScrollBtn.addEventListener("click", () => {
    const action = isScrolling ? "STOP_AUTO_SCROLL" : "START_AUTO_SCROLL";
    chrome.tabs.sendMessage(currentTabId, { action }, (resp) => {
      queryTabStatus();
    });
  });

  // E-Commerce Pagination Button
  paginateBtn.addEventListener("click", () => {
    paginateBtn.disabled = true;
    setBanner("Fetching subsequent pages using your active cookies...", "normal");
    chrome.tabs.sendMessage(currentTabId, { action: "FETCH_PAGES", pages: 5 }, (resp) => {
      paginateBtn.disabled = false;
      if (resp && resp.status === "success") {
        commentCount.textContent = resp.count;
        sendToDashboardBtn.disabled = false;
        setBanner(`Fetched pages! Total reviews now: ${resp.count}`, "success");
      } else {
        setBanner("Failed to paginate pages.", "error");
      }
    });
  });

  // Send to Dashboard Button
  sendToDashboardBtn.addEventListener("click", () => {
    sendToDashboardBtn.disabled = true;
    setBanner("Extracting comments from active DOM...", "normal");

    chrome.tabs.sendMessage(currentTabId, { action: "GET_ALL_COMMENTS" }, async (resp) => {
      if (!resp || !resp.comments || resp.comments.length === 0) {
        setBanner("No comments found in DOM to send.", "error");
        sendToDashboardBtn.disabled = false;
        return;
      }

      setBanner(`Sending ${resp.comments.length} comments to FastAPI backend...`, "normal");

      const payload = {
        post_url: resp.url,
        post_id: resp.postId,
        title: resp.title,
        platform: resp.platform,
        comments: resp.comments,
        model_option: "vader_hybrid",
      };

      try {
        const apiRes = await fetch(`${BACKEND_URL}/api/ingest-browser`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!apiRes.ok) {
          const errData = await apiRes.json().catch(() => ({}));
          throw new Error(errData.detail || `Server returned ${apiRes.status}`);
        }

        const data = await apiRes.json();
        setBanner(`✅ Analyzed ${data.total_valid_comments} comments! Opening dashboard...`, "success");

        // Open dashboard with query param
        chrome.tabs.create({ url: `${DASHBOARD_URL}/?post_id=${data.post_id}` });
        window.close();
      } catch (err) {
        setBanner(`Error: ${err.message}`, "error");
        sendToDashboardBtn.disabled = false;
      }
    });
  });
});
