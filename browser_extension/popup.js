/**
 * Sentinelytics Extension Popup Controller v3.1
 * Platform-Adaptive Turbo Review Fetcher, Gauge Rendering, and Dashboard Sync
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
  const commentCount = document.getElementById("commentCount");
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

  // Star Rating Breakdown elements
  const starPreviewContainer = document.getElementById("starPreviewContainer");
  const avgStarBadge = document.getElementById("avgStarBadge");

  // Unified action panel controls
  const toggleScrollBtn = document.getElementById("toggleScrollBtn");
  const toggleScrollIcon = document.getElementById("toggleScrollIcon");
  const toggleScrollText = document.getElementById("toggleScrollText");
  const turboBox = document.getElementById("turboBox");
  const turboSubtext = document.getElementById("turboSubtext");
  const fetch5PagesBtn = document.getElementById("fetch5PagesBtn");
  const fetch10PagesBtn = document.getElementById("fetch10PagesBtn");
  const customPageInput = document.getElementById("customPageInput");
  const startTurboFetchBtn = document.getElementById("startTurboFetchBtn");
  const autoConvertRow = document.getElementById("autoConvertRow");
  const autoConvertReviewsToggle = document.getElementById("autoConvertReviewsToggle");
  const ecommerceProgressContainer = document.getElementById("ecommerceProgressContainer");
  const ecommerceProgressBar = document.getElementById("ecommerceProgressBar");
  const ecommerceProgressText = document.getElementById("ecommerceProgressText");
  const rapidApiFetchBtn = document.getElementById("rapidApiFetchBtn");

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

  // RapidAPI key configuration in popup
  const rapidApiKeyInput = document.getElementById("rapidApiKeyInput");
  const saveRapidApiKeyBtn = document.getElementById("saveRapidApiKeyBtn");
  const rapidApiKeyStatus = document.getElementById("rapidApiKeyStatus");

  fetch(`${BACKEND_URL}/api/settings/keys`)
    .then((r) => r.json())
    .then((data) => {
      if (data && data.rapidapi_key_configured) {
        if (rapidApiKeyStatus) {
          rapidApiKeyStatus.textContent = "Active";
          rapidApiKeyStatus.style.color = "#34d399";
        }
        if (rapidApiKeyInput && data.masked_keys && data.masked_keys.rapidapi_key) {
          rapidApiKeyInput.placeholder = data.masked_keys.rapidapi_key;
        }
      } else if (rapidApiKeyStatus) {
        rapidApiKeyStatus.textContent = "Not Set";
        rapidApiKeyStatus.style.color = "#94a3b8";
      }
    })
    .catch(() => {
      if (rapidApiKeyStatus) rapidApiKeyStatus.textContent = "Offline";
    });

  if (saveRapidApiKeyBtn && rapidApiKeyInput) {
    saveRapidApiKeyBtn.addEventListener("click", async () => {
      const keyVal = (rapidApiKeyInput.value || "").trim();
      if (!keyVal) return;
      saveRapidApiKeyBtn.disabled = true;
      saveRapidApiKeyBtn.textContent = "...";
      try {
        const res = await fetch(`${BACKEND_URL}/api/settings/keys`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rapidapi_key: keyVal })
        });
        if (res.ok) {
          if (rapidApiKeyStatus) {
            rapidApiKeyStatus.textContent = "Saved ✅";
            rapidApiKeyStatus.style.color = "#34d399";
          }
          rapidApiKeyInput.value = "";
          rapidApiKeyInput.placeholder = "Key saved!";
        }
      } catch (err) {
        if (rapidApiKeyStatus) {
          rapidApiKeyStatus.textContent = "Error saving";
          rapidApiKeyStatus.style.color = "#f87171";
        }
      } finally {
        saveRapidApiKeyBtn.disabled = false;
        saveRapidApiKeyBtn.textContent = "Save";
      }
    });
  }

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

  // Monotonic count tracker to eliminate jumping/glitching counters
  let maxObservedCount = 0;
  let lastKnownPostId = null;

  function updateMonotonicCount(rawCount, postId) {
    const num = parseInt(rawCount, 10) || 0;
    if (postId && lastKnownPostId && postId !== lastKnownPostId) {
      maxObservedCount = num;
      lastKnownPostId = postId;
    } else {
      if (postId) lastKnownPostId = postId;
      maxObservedCount = Math.max(maxObservedCount, num);
    }
    return maxObservedCount;
  }

  // Ensure content script is active: PING first, ONLY inject if uncommunicative
  async function ensureContentScript() {
    try {
      const resp = await new Promise((resolve) => {
        chrome.tabs.sendMessage(currentTabId, { action: "PING" }, (res) => {
          if (chrome.runtime.lastError || !res) resolve(null);
          else resolve(res);
        });
      });
      if (resp && resp.status === "PONG") {
        return; // Content script is already injected and responsive
      }
    } catch (_) {}

    // Only inject if PING failed
    try {
      await chrome.scripting.executeScript({
        target: { tabId: currentTabId },
        files: ["content.js"],
      });
    } catch (err) {
      console.warn("[Sentinelytics] executeScript notice:", err.message);
    }
  }

  let isContentScriptEnsured = false;
  async function sendTabMessage(msg) {
    if (!isContentScriptEnsured) {
      await ensureContentScript();
      isContentScriptEnsured = true;
    }
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(currentTabId, msg, (resp) => {
        if (chrome.runtime.lastError) {
          isContentScriptEnsured = false;
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
      "happy", "liked", "wonderful", "kamaal", "zabardast", "helpful", "gem", "fire",
      "worth", "genuine", "original", "sturdy", "smooth"
    ];
    const NEG_WORDS = [
      "bad", "worst", "terrible", "poor", "hate", "broken", "fake", "delay",
      "defect", "waste", "scam", "slow", "horribl", "bakwas", "ghatiya",
      "rubbish", "pathetic", "issue", "problem", "disappoint", "fraud", "cheat",
      "duplicate", "heating", "battery", "drain", "loose"
    ];
    const MOCKING_EMOJIS = ["😡", "😭", "💔", "🤮", "😤", "🤡", "👎"];

    let pos = 0, neg = 0, neu = 0, sarcastic = 0;
    const scored = [];
    const negWordCounts = {};
    const starCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalStars = 0;
    let starSum = 0;

    for (const c of comments) {
      const text = (c.raw_text || c.text || "").toLowerCase();
      const origText = c.raw_text || c.text || "";
      if (!text.trim()) continue;

      // Track stars if present
      const star = parseInt(c.star_rating, 10);
      if (star >= 1 && star <= 5) {
        starCounts[star]++;
        starSum += star;
        totalStars++;
      }

      const hasPos = POS_WORDS.some((w) => text.includes(w));
      const hasNeg = NEG_WORDS.some((w) => text.includes(w));
      const hasMocking = MOCKING_EMOJIS.some((e) => origText.includes(e));

      let sentiment = "Neutral";
      let isSarcastic = false;

      // Star-based sentiment priority if available
      if (star >= 4) {
        sentiment = hasMocking ? "Negative" : "Positive";
        if (hasMocking) { isSarcastic = true; sarcastic++; neg++; }
        else { pos++; }
      } else if (star === 1 || star === 2) {
        sentiment = "Negative";
        neg++;
      } else {
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
      }

      if (sentiment === "Negative") {
        for (const w of NEG_WORDS) {
          if (text.includes(w)) {
            negWordCounts[w] = (negWordCounts[w] || 0) + 1;
          }
        }
      }

      scored.push({
        author: c.author || c.anonymized_author_id || "user",
        text: origText.slice(0, 140),
        sentiment,
        is_sarcastic: isSarcastic,
        star_rating: star || null,
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
      star_counts: starCounts,
      total_stars: totalStars,
      avg_star: totalStars > 0 ? (starSum / totalStars).toFixed(1) : null,
    };
  }

  // Update Donut SVG, KPIs, Signals, and Star Breakdown
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
        sarcasmPill.textContent = `${data.sarcastic_count} Sarcastic Comments (Text-Emoji Conflict)`;
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

    // Star Breakdown Rendering for E-Commerce
    const isEcom = ["flipkart", "amazon", "myntra", "meesho", "nykaa", "ajio"].includes(currentPlatform);
    if (starPreviewContainer) {
      const starCounts = data.star_counts;
      const totalStars = data.total_stars || 0;
      if (isEcom && starCounts && totalStars > 0) {
        starPreviewContainer.style.display = "block";
        if (avgStarBadge) avgStarBadge.textContent = `${data.avg_star || "4.0"} ★`;
        for (let s = 1; s <= 5; s++) {
          const count = starCounts[s] || 0;
          const pct = Math.round((count / totalStars) * 100);
          const bar = document.getElementById(`starBar${s}`);
          const cnt = document.getElementById(`starCount${s}`);
          if (bar) bar.style.width = `${pct}%`;
          if (cnt) cnt.textContent = `${count} (${pct}%)`;
        }
      } else {
        starPreviewContainer.style.display = "none";
      }
    }

    // Top 3 Mini Comments
    if (miniCommentsList && data.preview_comments && data.preview_comments.length > 0) {
      miniCommentsList.innerHTML = data.preview_comments
        .map((c) => {
          const chipClass = `chip-${c.sentiment || "Neutral"}`;
          const sarcBadge = c.is_sarcastic ? ` <span style="color:#fbbf24;font-size:8px;">[Sarcasm]</span>` : "";
          const starBadge = c.star_rating ? ` <span style="color:#fbbf24;font-size:9px;font-weight:bold;">★${c.star_rating}</span>` : "";
          return `
            <div class="mini-comment-card">
              <div class="comment-card-top">
                <span class="comment-author">@${escapeHtml(c.author)}${starBadge}</span>
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

    isAnalyzingQuick = true;
    try {
      const resp = await sendTabMessage({ action: "GET_ALL_COMMENTS" });
      if (!resp || !resp.comments || resp.comments.length === 0) {
        isAnalyzingQuick = false;
        return;
      }

      lastAnalyzedCount = resp.comments.length;
      const qCount = updateMonotonicCount(resp.comments.length, currentPostId);
      if (extractedCountBadge) {
        extractedCountBadge.textContent = `${qCount} ${isEcomPlatform(currentPlatform) ? "reviews" : "comments"}`;
      }
      if (commentCount) commentCount.textContent = qCount;

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
        scanResult = null;
      }

      // Merge client-side star counts if server didn't compute them
      const clientFallback = runClientSideScan(resp.comments);
      if (!scanResult) {
        scanResult = clientFallback;
      } else {
        scanResult.star_counts = scanResult.star_counts || clientFallback.star_counts;
        scanResult.total_stars = scanResult.total_stars || clientFallback.total_stars;
        scanResult.avg_star = scanResult.avg_star || clientFallback.avg_star;
      }

      renderSentimentUI(scanResult);
    } catch (err) {
      console.warn("[Sentinelytics] quick scan error:", err);
    } finally {
      isAnalyzingQuick = false;
    }
  }

  // Platform-Adaptive UI Switcher (Both Action Modes Available on All Platforms)
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
    const cCount = updateMonotonicCount(resp.count, resp.postId);
    if (extractedCountBadge) {
      extractedCountBadge.textContent = `${cCount} ${isEcomPlatform(currentPlatform) ? "reviews" : "comments"}`;
    }
    if (commentCount) commentCount.textContent = cCount;

    const isSupported = currentPlatform !== "unsupported";
    const isEcom = isEcomPlatform(currentPlatform);

    // Both action modes remain available on all platforms!
    if (toggleScrollBtn) toggleScrollBtn.disabled = !isSupported;
    if (fetch5PagesBtn) fetch5PagesBtn.disabled = !isSupported;
    if (fetch10PagesBtn) fetch10PagesBtn.disabled = !isSupported;
    if (startTurboFetchBtn) startTurboFetchBtn.disabled = !isSupported;
    if (rapidApiFetchBtn) rapidApiFetchBtn.disabled = !isSupported || !(currentPlatform === "instagram" || currentPlatform === "amazon");
    if (sendToDashboardBtn) sendToDashboardBtn.disabled = !isSupported || cCount === 0;

    // Auto-convert row only relevant on e-commerce
    if (autoConvertRow) {
      autoConvertRow.style.display = isEcom ? "flex" : "none";
    }
    if (turboSubtext) {
      turboSubtext.textContent = isEcom ? "Authenticated In-Browser" : "Fast Scroll Bursts";
    }

    if (isSupported) {
      if (isScrolling) {
        toggleScrollBtn.className = "btn-collector active-stop";
        if (toggleScrollIcon) toggleScrollIcon.textContent = "⏹";
        if (toggleScrollText) toggleScrollText.textContent = "Stop Auto-Collector";
        setBanner("Auto-scrolling and collecting comments in real time...", "normal");
      } else {
        toggleScrollBtn.className = "btn-collector";
        if (toggleScrollIcon) toggleScrollIcon.textContent = "▶";
        if (toggleScrollText) toggleScrollText.textContent = "Start Auto-Collector";
        if (cCount > 0) {
          setBanner(`Collected ${cCount} ${isEcom ? "reviews" : "comments"}. Click Turbo Fetch or Send to Dashboard.`, "normal");
        } else {
          setBanner(`Ready to collect from ${currentPlatform.toUpperCase()}. Click Start Auto-Collector or Turbo Fetch.`, "normal");
        }
      }
    } else {
      toggleScrollBtn.className = "btn-collector";
      if (toggleScrollIcon) toggleScrollIcon.textContent = "▶";
      if (toggleScrollText) toggleScrollText.textContent = "Start Auto-Collector";
      setBanner("Navigate to YouTube, Instagram, Flipkart, Amazon, Myntra, Meesho, Nykaa, or Ajio.", "normal");
    }
  }

  function isEcomPlatform(p) {
    return ["flipkart", "amazon", "myntra", "meesho", "nykaa", "ajio"].includes(p);
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

  // Real-Time Progress Listener from content script turbo pagination
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.action === "TURBO_PAGE_PROGRESS") {
      if (ecommerceProgressContainer) ecommerceProgressContainer.style.display = "flex";
      const pct = Math.max(10, Math.round((msg.page / msg.totalPages) * 100));
      if (ecommerceProgressBar) ecommerceProgressBar.style.width = `${pct}%`;
      const totalCollected = updateMonotonicCount(msg.totalCollected, currentPostId);
      if (ecommerceProgressText) {
        ecommerceProgressText.textContent = `Fetching Page ${msg.page} of ${msg.totalPages}... (${totalCollected} reviews collected)`;
      }
      if (extractedCountBadge) extractedCountBadge.textContent = `${totalCollected} reviews`;
      if (commentCount) commentCount.textContent = totalCollected;
      if (sendToDashboardBtn) sendToDashboardBtn.disabled = totalCollected === 0;
      refreshQuickScan(true);
    }
  });

  // Auto-refresh counter and gauge every 1.5 seconds during auto-scroll
  setInterval(async () => {
    if (currentPlatform !== "unsupported" && isScrolling) {
      const resp = await sendTabMessage({ action: "GET_STATUS" });
      if (resp) {
        const count = updateMonotonicCount(resp.count, resp.postId);
        if (extractedCountBadge) {
          extractedCountBadge.textContent = `${count} ${isEcomPlatform(currentPlatform) ? "reviews" : "comments"}`;
        }
        if (commentCount) commentCount.textContent = count;
        if (count > 0) {
          sendToDashboardBtn.disabled = false;
          refreshQuickScan(false);
        }
      }
    }
  }, 1500);

  function triggerRapidApiBoostIfInstagram() {
    if (currentPlatform === "instagram" && currentPostId) {
      fetch(`${BACKEND_URL}/api/instagram/rapidapi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shortcode: currentPostId, max_comments: 500 })
      })
      .then((r) => r.json())
      .then((d) => {
        if (d && d.status === "ok" && Array.isArray(d.comments) && d.comments.length > 0) {
          chrome.tabs.sendMessage(currentTabId, { action: "INGEST_RAPIDAPI_COMMENTS", comments: d.comments })
            .then((res) => {
              const newTotal = res?.count || d.comments.length;
              updateMonotonicCount(newTotal, currentPostId);
              setBanner(`☁️ RapidAPI: +${d.comments.length} comments fetched!`, "success");
              refreshQuickScan(true);
            })
            .catch(() => {});
        } else if (d && d.status === "quota_exceeded") {
          setBanner("⚠️ RapidAPI Quota Exceeded — using Browser DOM", "normal");
        }
      })
      .catch(() => {});
    }
  }

  function triggerRapidApiBoostIfAmazon() {
    if (currentPlatform === "amazon" && currentPostId) {
      fetch(`${BACKEND_URL}/api/amazon/rapidapi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asin: currentPostId, max_reviews: 200 })
      })
      .then((r) => r.json())
      .then((d) => {
        if (d && d.status === "ok" && Array.isArray(d.comments) && d.comments.length > 0) {
          chrome.tabs.sendMessage(currentTabId, { action: "INGEST_RAPIDAPI_COMMENTS", comments: d.comments })
            .then((res) => {
              const newTotal = res?.count || d.comments.length;
              updateMonotonicCount(newTotal, currentPostId);
              setBanner(`☁️ RapidAPI: +${d.comments.length} reviews fetched!`, "success");
              refreshQuickScan(true);
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
    }
  }

  // Dedicated RapidAPI Cloud Fetcher Button Click
  if (rapidApiFetchBtn) {
    rapidApiFetchBtn.addEventListener("click", async () => {
      if (!currentPostId) {
        setBanner("No active post or product detected on this tab.", "error");
        return;
      }
      rapidApiFetchBtn.disabled = true;
      const origHtml = rapidApiFetchBtn.innerHTML;
      rapidApiFetchBtn.innerHTML = "<span>Fetching RapidAPI stream...</span>";
      setBanner("Connecting to RapidAPI cloud stream...", "normal");

      try {
        let endpoint = "";
        let bodyPayload = {};
        if (currentPlatform === "instagram") {
          endpoint = `${BACKEND_URL}/api/instagram/rapidapi`;
          bodyPayload = { shortcode: currentPostId, max_comments: 500 };
        } else if (currentPlatform === "amazon") {
          endpoint = `${BACKEND_URL}/api/amazon/rapidapi`;
          bodyPayload = { asin: currentPostId, max_reviews: 200 };
        } else {
          setBanner("RapidAPI acceleration is available on Instagram & Amazon.", "normal");
          rapidApiFetchBtn.disabled = false;
          rapidApiFetchBtn.innerHTML = origHtml;
          return;
        }

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyPayload),
        });
        const data = await res.json();

        if (data.status === "quota_exceeded") {
          setBanner("RapidAPI Quota Exceeded — using Browser DOM", "error");
        } else if (data.status === "no_key") {
          setBanner("RapidAPI Key not set in Settings", "error");
        } else if (data.status === "ok" && Array.isArray(data.comments)) {
          if (data.comments.length > 0) {
            const tabResp = await chrome.tabs.sendMessage(currentTabId, {
              action: "INGEST_RAPIDAPI_COMMENTS",
              comments: data.comments,
            });
            const newCount = tabResp?.count || data.comments.length;
            updateMonotonicCount(newCount, currentPostId);
            setBanner(`RapidAPI: +${data.comments.length} comments fetched!`, "success");
            await refreshQuickScan(true);
          } else {
            setBanner("RapidAPI returned 0 comments. Continuing in browser session.", "normal");
          }
        } else {
          setBanner(`RapidAPI: ${data.message || "Completed"}`, "normal");
        }
      } catch (err) {
        setBanner(`RapidAPI error: ${err.message}`, "error");
      } finally {
        rapidApiFetchBtn.disabled = false;
        rapidApiFetchBtn.innerHTML = origHtml;
      }
    });
  }

  // Turbo Multi-Page Review / Burst Fetch Execution (All Platforms)
  async function runTurboFetch(pageCount) {
    if (currentPlatform === "instagram") {
      triggerRapidApiBoostIfInstagram();
    } else if (currentPlatform === "amazon") {
      triggerRapidApiBoostIfAmazon();
    }
    if (fetch5PagesBtn) fetch5PagesBtn.disabled = true;
    if (fetch10PagesBtn) fetch10PagesBtn.disabled = true;
    if (startTurboFetchBtn) startTurboFetchBtn.disabled = true;

    const isEcom = isEcomPlatform(currentPlatform);
    const unit = isEcom ? "pages" : "burst cycles";

    if (ecommerceProgressContainer) {
      ecommerceProgressContainer.style.display = "flex";
      if (ecommerceProgressBar) ecommerceProgressBar.style.width = "8%";
      if (ecommerceProgressText) {
        ecommerceProgressText.textContent = isEcom
          ? `Connecting to ${currentPlatform.toUpperCase()} pagination engine...`
          : `Running 5 fast scroll-bursts on ${currentPlatform.toUpperCase()}...`;
      }
    }
    setBanner(
      isEcom
        ? `Fetching next ${pageCount} review pages using active session...`
        : `Executing ${pageCount} rapid comment scroll-burst cycles...`,
      "normal"
    );

    const autoConvert = autoConvertReviewsToggle ? autoConvertReviewsToggle.checked : true;
    const resp = await sendTabMessage({
      action: "turboFetchPages",
      pageCount,
      autoConvert,
    });

    if (fetch5PagesBtn) fetch5PagesBtn.disabled = false;
    if (fetch10PagesBtn) fetch10PagesBtn.disabled = false;
    if (startTurboFetchBtn) startTurboFetchBtn.disabled = false;

    if (resp && resp.status === "success") {
      const finalCount = updateMonotonicCount(resp.count, currentPostId);
      if (extractedCountBadge) {
        extractedCountBadge.textContent = `${finalCount} ${isEcom ? "reviews" : "comments"}`;
      }
      if (commentCount) commentCount.textContent = finalCount;
      if (sendToDashboardBtn) sendToDashboardBtn.disabled = finalCount === 0;
      setBanner(`✅ Turbo fetch complete! Total collected: ${finalCount}`, "success");
      if (ecommerceProgressText) {
        ecommerceProgressText.textContent = `Completed! ${finalCount} collected from ${pageCount} ${unit}.`;
      }
      if (ecommerceProgressBar) ecommerceProgressBar.style.width = "100%";
      await refreshQuickScan(true);
      setTimeout(() => {
        if (ecommerceProgressContainer) ecommerceProgressContainer.style.display = "none";
      }, 3500);
    } else {
      setBanner("Pagination or scroll burst completed.", "normal");
      if (ecommerceProgressContainer) ecommerceProgressContainer.style.display = "none";
      await refreshQuickScan(true);
    }
  }

  // Turbo Button Listeners
  if (fetch5PagesBtn) {
    fetch5PagesBtn.addEventListener("click", () => runTurboFetch(5));
  }
  if (fetch10PagesBtn) {
    fetch10PagesBtn.addEventListener("click", () => runTurboFetch(10));
  }
  if (startTurboFetchBtn) {
    startTurboFetchBtn.addEventListener("click", () => {
      const pages = parseInt(customPageInput?.value || "5", 10) || 5;
      runTurboFetch(Math.min(25, Math.max(1, pages)));
    });
  }

  // Toggle Auto-Scroll Button (YouTube & Instagram & E-Commerce)
  if (toggleScrollBtn) {
    toggleScrollBtn.addEventListener("click", async () => {
      if (!isScrolling) {
        if (currentPlatform === "instagram") {
          triggerRapidApiBoostIfInstagram();
        } else if (currentPlatform === "amazon") {
          triggerRapidApiBoostIfAmazon();
        }
      }
      const action = isScrolling ? "STOP_AUTO_SCROLL" : "START_AUTO_SCROLL";
      const resp = await sendTabMessage({ action });
      if (resp) {
        await queryTabStatus();
      }
    });
  }

  // Send to Dashboard Button
  sendToDashboardBtn.addEventListener("click", async () => {
    sendToDashboardBtn.disabled = true;
    setBanner("Extracting reviews from active session...", "normal");

    // Immediately halt auto-scrolling
    await sendTabMessage({ action: "STOP_AUTO_SCROLL" });

    const resp = await sendTabMessage({ action: "GET_ALL_COMMENTS" });
    if (!resp || !resp.comments || resp.comments.length === 0) {
      setBanner("No comments/reviews found to send. Click Fetch Next Pages or auto-collector first.", "error");
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
      setBanner(`✅ Analyzed ${data.total_valid_comments || resp.comments.length} reviews! Opening dashboard...`, "success");

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
