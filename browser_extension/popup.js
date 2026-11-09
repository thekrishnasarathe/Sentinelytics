/**
 * Sentinelytics Extension Popup Controller v3.0
 * Live Sentiment Preview, Gauge Rendering, and Dashboard Sync
 */

const BACKEND_URL = "http://localhost:8000";
const DASHBOARD_URL = "http://localhost:3000";
const CIRCUMFERENCE = 238.76; // 2 * Math.PI * 38

let currentTabId = null;
let currentPlatform = "unsupported";
let currentPostId = null;
let currentTitle = "";
let currentUrl = "";
let isScrolling = false;
let lastAnalyzedCount = -1;
let isAnalyzingQuick = false;

document.addEventListener("DOMContentLoaded", async () => {
  const platformPill = document.getElementById("platformPill");
  const targetTitle = document.getElementById("targetTitle");
  const extractedCountBadge = document.getElementById("extractedCountBadge");
  const commentCount = document.getElementById("commentCount"); // optional fallback
  const toggleScrollBtn = document.getElementById("toggleScrollBtn");
  const toggleScrollText = document.getElementById("toggleScrollText");
  const paginateBtn = document.getElementById("paginateBtn");
  const sendToDashboardBtn = document.getElementById("sendToDashboardBtn");
  const statusBanner = document.getElementById("statusBanner");
  const backendStatus = document.getElementById("backendStatus");
  const openDashboardLink = document.getElementById("openDashboardLink");

  // Donut elements
  const donutNeg = document.getElementById("donutNeg");
  const donutNeu = document.getElementById("donutNeu");
  const donutPos = document.getElementById("donutPos");
  const gaugeCenterPct = document.getElementById("gaugeCenterPct");
  const gaugeCenterLabel = document.getElementById("gaugeCenterLabel");
  const pctNeg = document.getElementById("pctNeg");
  const pctNeu = document.getElementById("pctNeu");
  const pctPos = document.getElementById("pctPos");

  // Signal pills
  const healthBadge = document.getElementById("healthBadge");
  const sarcasmPill = document.getElementById("sarcasmPill");
  const topIssuesContainer = document.getElementById("topIssuesContainer");
  const issue1 = document.getElementById("issue1");
  const issue2 = document.getElementById("issue2");
  const miniCommentsList = document.getElementById("miniCommentsList");

  if (openDashboardLink) openDashboardLink.href = DASHBOARD_URL;

  // Check backend health
  let isBackendOnline = false;
  fetch(`${BACKEND_URL}/health`)
    .then((r) => r.json())
    .then(() => {
      isBackendOnline = true;
      if (backendStatus) {
        backendStatus.textContent = "Connected (8000)";
        backendStatus.style.color = "#34d399";
      }
    })
    .catch(() => {
      isBackendOnline = false;
      if (backendStatus) {
        backendStatus.textContent = "Offline (Local mode)";
        backendStatus.style.color = "#fbbf24";
      }
    });

  // Query active tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs || tabs.length === 0) {
    setBanner("No active tab found.", "error");
    return;
  }
  const tab = tabs[0];
  currentTabId = tab.id;
  currentUrl = tab.url || "";

  function setBanner(text, type = "normal") {
    if (!statusBanner) return;
    statusBanner.textContent = text;
    statusBanner.className = `status-banner ${type}`;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Ensure content script is injected BEFORE any message call
  async function ensureContentScript() {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: currentTabId },
        files: ["content.js"],
      });
    } catch (err) {
      console.warn("[Sentinelytics] executeScript notice:", err.message);
    }
  }

  async function sendTabMessage(msg) {
    await ensureContentScript();
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(currentTabId, msg, (resp) => {
        if (chrome.runtime.lastError) {
          console.warn("[Sentinelytics] Message error:", chrome.runtime.lastError.message);
          resolve(null);
        } else {
          resolve(resp);
        }
      });
    });
  }

  // Client-side fallback rule engine when backend is offline
  function runClientSideScan(comments) {
    const POS_WORDS = [
      "good", "great", "love", "best", "amazing", "awesome", "excellent",
      "perfect", "mast", "badiya", "badhiya", "super", "nice", "fast", "cool",
      "happy", "liked", "wonderful", "kamaal", "zabardast", "helpful", "gem", "fire"
    ];
    const NEG_WORDS = [
      "bad", "worst", "terrible", "poor", "hate", "broken", "fake", "delay",
      "defect", "waste", "scam", "slow", "horribl", "bakwas", "ghatiya",
      "rubbish", "pathetic", "issue", "problem", "disappoint", "fraud", "cheat"
    ];
    const MOCKING_EMOJIS = ["😡", "😭", "💔", "🤮", "😤", "🤡", "👎"];

    let pos = 0, neg = 0, neu = 0, sarcastic = 0;
    const scored = [];
    const negWordCounts = {};

    for (const c of comments) {
      const text = (c.raw_text || c.text || "").toLowerCase();
      const origText = c.raw_text || c.text || "";
      if (!text.trim()) continue;

      const hasPos = POS_WORDS.some((w) => text.includes(w));
      const hasNeg = NEG_WORDS.some((w) => text.includes(w));
      const hasMocking = MOCKING_EMOJIS.some((e) => origText.includes(e));

      let sentiment = "Neutral";
      let isSarcastic = false;

      if (hasPos && hasMocking) {
        sentiment = "Negative";
        isSarcastic = true;
        sarcastic++;
        neg++;
      } else if (hasNeg) {
        sentiment = "Negative";
        neg++;
      } else if (hasPos) {
        sentiment = "Positive";
        pos++;
      } else {
        neu++;
      }

      if (sentiment === "Negative") {
        for (const w of NEG_WORDS) {
          if (text.includes(w)) {
            negWordCounts[w] = (negWordCounts[w] || 0) + 1;
          }
        }
      }

      scored.push({
        author: c.author || "user",
        text: origText.slice(0, 140),
        sentiment,
        is_sarcastic: isSarcastic,
      });
    }

    const total = (pos + neg + neu) || 1;
    const pos_pct = Math.round((pos / total) * 1000) / 10;
    const neg_pct = Math.round((neg / total) * 1000) / 10;
    const neu_pct = Math.round((neu / total) * 1000) / 10;

    const is_high_neg = neg_pct >= 70;
    let health_badge = `⚖️ ${Math.round(neu_pct)}% Balanced Engagement`;
    if (is_high_neg) health_badge = `🚨 ${Math.round(neg_pct)}% High Negative Alert`;
    else if (neg_pct >= 45) health_badge = `⚠️ ${Math.round(neg_pct)}% Critical Negative`;
    else if (pos_pct >= 60) health_badge = `✅ ${Math.round(pos_pct)}% Favorable`;

    const topIssues = Object.entries(negWordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));

    return {
      total_comments: comments.length,
      positive_pct: pos_pct,
      negative_pct: neg_pct,
      neutral_pct: neu_pct,
      positive_count: pos,
      negative_count: neg,
      neutral_count: neu,
      is_high_negative: is_high_neg,
      health_badge,
      sarcastic_count: sarcastic,
      top_issues: topIssues.length ? topIssues : (neg > 0 ? ["Friction", "Defects"] : ["No Active Issues"]),
      preview_comments: scored.slice(0, 3),
    };
  }

  // Update Donut SVG, KPIs, and Signals
  function renderSentimentUI(data) {
    if (!data) return;

    const negPct = data.negative_pct || 0;
    const neuPct = data.neutral_pct || 0;
    const posPct = data.positive_pct || 0;

    // Percent text
    if (pctNeg) pctNeg.textContent = `${negPct}%`;
    if (pctNeu) pctNeu.textContent = `${neuPct}%`;
    if (pctPos) pctPos.textContent = `${posPct}%`;

    // Calculate arc lengths
    const negLen = (negPct / 100) * CIRCUMFERENCE;
    const neuLen = (neuPct / 100) * CIRCUMFERENCE;
    const posLen = (posPct / 100) * CIRCUMFERENCE;

    if (donutNeg) {
      donutNeg.setAttribute("stroke-dasharray", `${negLen} ${CIRCUMFERENCE}`);
      donutNeg.setAttribute("stroke-dashoffset", "0");
    }
    if (donutNeu) {
      donutNeu.setAttribute("stroke-dasharray", `${neuLen} ${CIRCUMFERENCE}`);
      donutNeu.setAttribute("stroke-dashoffset", `-${negLen}`);
    }
    if (donutPos) {
      donutPos.setAttribute("stroke-dasharray", `${posLen} ${CIRCUMFERENCE}`);
      donutPos.setAttribute("stroke-dashoffset", `-${negLen + neuLen}`);
    }

    // Center KPI
    if (gaugeCenterPct && gaugeCenterLabel) {
      if (negPct >= posPct && negPct >= neuPct && negPct > 0) {
        gaugeCenterPct.textContent = `${Math.round(negPct)}%`;
        gaugeCenterPct.style.color = "#f43f5e";
        gaugeCenterLabel.textContent = "NEGATIVE";
      } else if (posPct >= neuPct && posPct > 0) {
        gaugeCenterPct.textContent = `${Math.round(posPct)}%`;
        gaugeCenterPct.style.color = "#10b981";
        gaugeCenterLabel.textContent = "FAVORABLE";
      } else if (neuPct > 0) {
        gaugeCenterPct.textContent = `${Math.round(neuPct)}%`;
        gaugeCenterPct.style.color = "#38bdf8";
        gaugeCenterLabel.textContent = "NEUTRAL";
      } else {
        gaugeCenterPct.textContent = "--%";
        gaugeCenterPct.style.color = "#ffffff";
        gaugeCenterLabel.textContent = "POLARITY";
      }
    }

    // Health Badge
    if (healthBadge) {
      healthBadge.textContent = data.health_badge || "Awaiting comments...";
      if (posPct >= 60) {
        healthBadge.className = "health-badge favorable";
      } else {
        healthBadge.className = "health-badge";
      }
    }

    // Sarcasm Pill
    if (sarcasmPill) {
      if (data.sarcastic_count > 0) {
        sarcasmPill.style.display = "inline-flex";
        sarcasmPill.textContent = `⚡ ${data.sarcastic_count} Sarcastic Comments (Text-Emoji Conflict)`;
      } else {
        sarcasmPill.style.display = "none";
      }
    }

    // Top Issues
    if (topIssuesContainer && issue1 && issue2) {
      const issues = data.top_issues || [];
      if (issues.length > 0 && issues[0] !== "No Active Issues") {
        topIssuesContainer.style.display = "flex";
        issue1.textContent = issues[0];
        if (issues[1]) {
          issue2.textContent = issues[1];
          issue2.style.display = "inline";
        } else {
          issue2.style.display = "none";
        }
      } else {
        topIssuesContainer.style.display = "none";
      }
    }

    // Top 3 Mini Comments
    if (miniCommentsList && data.preview_comments && data.preview_comments.length > 0) {
      miniCommentsList.innerHTML = data.preview_comments
        .map((c) => {
          const chipClass = `chip-${c.sentiment || "Neutral"}`;
          const sarcBadge = c.is_sarcastic ? ` <span style="color:#fbbf24;font-size:8px;">[Sarcasm]</span>` : "";
          return `
            <div class="mini-comment-card">
              <div class="comment-card-top">
                <span class="comment-author">@${escapeHtml(c.author)}</span>
                <span class="comment-chip ${chipClass}">${escapeHtml(c.sentiment)}${sarcBadge}</span>
              </div>
              <div class="comment-text-body">${escapeHtml(c.text)}</div>
            </div>
          `;
        })
        .join("");
    }
  }

  // Rapid Scan Function
  async function refreshQuickScan(force = false) {
    if (isAnalyzingQuick) return;
    const count = parseInt(extractedCountBadge?.textContent || "0", 10) || 0;
    if (!force && count === lastAnalyzedCount) return;
    if (count === 0) return;

    isAnalyzingQuick = true;
    try {
      const resp = await sendTabMessage({ action: "GET_ALL_COMMENTS" });
      if (!resp || !resp.comments || resp.comments.length === 0) {
        isAnalyzingQuick = false;
        return;
      }

      lastAnalyzedCount = resp.comments.length;
      if (extractedCountBadge) {
        extractedCountBadge.textContent = `${resp.comments.length} comments`;
      }

      let scanResult = null;
      // Try ultra-fast FastAPI scan
      try {
        const fetchRes = await fetch(`${BACKEND_URL}/api/analyze-quick`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comments: resp.comments.slice(0, 300), platform: currentPlatform }),
        });
        if (fetchRes.ok) {
          scanResult = await fetchRes.json();
        }
      } catch (e) {
        // Fallback to client-side scanner
        scanResult = null;
      }

      if (!scanResult) {
        scanResult = runClientSideScan(resp.comments);
      }

      renderSentimentUI(scanResult);
    } catch (err) {
      console.warn("[Sentinelytics] quick scan error:", err);
    } finally {
      isAnalyzingQuick = false;
    }
  }

  function updateStatusFromResponse(resp) {
    if (!resp) return;
    currentPlatform = resp.platform || "unsupported";
    currentPostId = resp.postId;
    currentTitle = resp.title || tab.title;
    isScrolling = Boolean(resp.isAutoScrolling);

    if (platformPill) {
      platformPill.textContent = currentPlatform.toUpperCase();
      platformPill.className = `platform-pill platform-${currentPlatform}`;
    }
    if (targetTitle) {
      targetTitle.textContent = currentTitle || "Active Webpage";
    }
    const cCount = resp.count || 0;
    if (extractedCountBadge) extractedCountBadge.textContent = `${cCount} comments`;
    if (commentCount) commentCount.textContent = cCount;

    if (currentPlatform !== "unsupported") {
      toggleScrollBtn.disabled = false;
      sendToDashboardBtn.disabled = cCount === 0;

      if (isScrolling) {
        toggleScrollBtn.className = "btn btn-stop";
        toggleScrollText.textContent = "Stop Auto-Collector";
        setBanner("Auto-scrolling and collecting comments in real time...", "normal");
      } else {
        toggleScrollBtn.className = "btn btn-secondary";
        toggleScrollText.textContent = "Start Auto-Collector";
      }

      if (paginateBtn) {
        if (currentPlatform === "flipkart" || currentPlatform === "amazon") {
          paginateBtn.style.display = "flex";
        } else {
          paginateBtn.style.display = "none";
        }
      }
    } else {
      toggleScrollBtn.disabled = true;
      sendToDashboardBtn.disabled = true;
      if (paginateBtn) paginateBtn.style.display = "none";
      setBanner("Navigate to YouTube, Instagram, Flipkart, Amazon, Myntra, Meesho, Nykaa, or Ajio.", "normal");
    }
  }

  async function queryTabStatus() {
    const resp = await sendTabMessage({ action: "GET_STATUS" });
    if (resp) {
      updateStatusFromResponse(resp);
      if (resp.count > 0) {
        await refreshQuickScan(true);
      }
    } else {
      setBanner("Could not connect to active tab DOM. Ensure URL is http(s).", "error");
    }
  }

  await queryTabStatus();

  // Auto-refresh counter and gauge every 1.5 seconds
  const pollInterval = setInterval(async () => {
    if (currentPlatform !== "unsupported") {
      const resp = await sendTabMessage({ action: "GET_STATUS" });
      if (resp) {
        const count = resp.count || 0;
        if (extractedCountBadge) extractedCountBadge.textContent = `${count} comments`;
        if (commentCount) commentCount.textContent = count;
        if (count > 0) {
          sendToDashboardBtn.disabled = false;
          refreshQuickScan(false);
        }
      }
    }
  }, 1500);

  // Toggle Auto-Scroll Button
  toggleScrollBtn.addEventListener("click", async () => {
    const action = isScrolling ? "STOP_AUTO_SCROLL" : "START_AUTO_SCROLL";
    const resp = await sendTabMessage({ action });
    if (resp) {
      await queryTabStatus();
    }
  });

  // E-Commerce Pagination Button (if present)
  if (paginateBtn) {
    paginateBtn.addEventListener("click", async () => {
      paginateBtn.disabled = true;
      setBanner("Fetching subsequent pages using your active cookies...", "normal");
      const resp = await sendTabMessage({ action: "FETCH_PAGES", pages: 5 });
      paginateBtn.disabled = false;
      if (resp && resp.status === "success") {
        if (extractedCountBadge) extractedCountBadge.textContent = `${resp.count} comments`;
        sendToDashboardBtn.disabled = false;
        setBanner(`Fetched pages! Total reviews now: ${resp.count}`, "success");
        await refreshQuickScan(true);
      } else {
        setBanner("Pagination complete or blocked.", "normal");
      }
    });
  }

  // Send to Dashboard Button
  sendToDashboardBtn.addEventListener("click", async () => {
    sendToDashboardBtn.disabled = true;
    setBanner("Extracting comments from active session...", "normal");

    // Immediately halt auto-scrolling
    await sendTabMessage({ action: "STOP_AUTO_SCROLL" });

    const resp = await sendTabMessage({ action: "GET_ALL_COMMENTS" });
    if (!resp || !resp.comments || resp.comments.length === 0) {
      setBanner("No comments found to send. Open a post or reel and scroll to collect.", "error");
      sendToDashboardBtn.disabled = false;
      return;
    }

    setBanner(`Sending ${resp.comments.length} comments to Sentinelytics Engine...`, "normal");

    let cleanPostId = resp.postId;
    if (resp.platform === "instagram") {
      const match = (resp.url || "").match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
      if (match) cleanPostId = match[1];
    }

    const payload = {
      post_url: resp.url,
      post_id: cleanPostId,
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
      const finalId = data.post_id || cleanPostId;
      setBanner(`✅ Analyzed ${data.total_valid_comments || resp.comments.length} comments! Opening dashboard...`, "success");

      const dashboardUrl = `${DASHBOARD_URL}/?post_id=${encodeURIComponent(finalId)}`;
      chrome.runtime.sendMessage({ action: "OPEN_DASHBOARD", url: dashboardUrl }, () => {
        if (chrome.runtime.lastError) {
          chrome.tabs.create({ url: dashboardUrl });
        }
      });
      setTimeout(() => window.close(), 400);
    } catch (err) {
      setBanner(`Error: ${err.message}`, "error");
      sendToDashboardBtn.disabled = false;
    }
  });
});
