/**
 * Sentinelytics Chrome/Edge Content Script v3.0
 * Strict Platform Isolation Architecture:
 * - YouTubeEngine
 * - InstagramEngine (Stream A: Unthrottled Internal API + Stream B: O(1) Fast Scoped Scroller)
 * - FlipkartEngine (2026 DOM Line-Parser + Concurrent Multi-Page Auto-Collector)
 * - AmazonEngine (Concurrent Multi-Page Auto-Collector)
 * - Universal E-Commerce Fallbacks
 */

(function () {
  if (window.__SENTINELYTICS_CONTENT_LOADED__) {
    return;
  }
  window.__SENTINELYTICS_CONTENT_LOADED__ = true;
  window.__sentinelytics_injected = true;

  if (!window.__sentinelytics_state) {
    window.__sentinelytics_state = {
      isAutoScrolling: false,
      scrollInterval: null,
      collectedCommentsMap: new Map(),
    };
  }

  const state = window.__sentinelytics_state;

  // =========================================================================
  // Shared Utilities
  // =========================================================================
  function detectPlatform() {
    const host = window.location.hostname.toLowerCase();
    if (host.includes("youtube.com")) return "youtube";
    if (host.includes("instagram.com")) return "instagram";
    if (host.includes("flipkart.com")) return "flipkart";
    if (host.includes("amazon.in") || host.includes("amazon.com")) return "amazon";
    if (host.includes("myntra.com")) return "myntra";
    if (host.includes("meesho.com")) return "meesho";
    if (host.includes("nykaa.com")) return "nykaa";
    if (host.includes("ajio.com")) return "ajio";
    return "unsupported";
  }

  function detectPostIdAndTitle(platform) {
    const url = window.location.href;
    let postId = "unknown";
    let title = document.title || "";

    if (platform === "youtube") {
      const match = url.match(/[?&]v=([^&]+)/) || url.match(/\/shorts\/([^?&]+)/);
      if (match) postId = match[1];
      const titleElem = document.querySelector("h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string, h1 yt-formatted-string, #title");
      if (titleElem && titleElem.textContent.trim()) {
        title = titleElem.textContent.trim();
      }
    } else if (platform === "instagram") {
      const match = url.match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
      if (match) postId = match[1];
      const authorElem = document.querySelector("header h2, header a, div._aa_y a, div.x1i10hfl a");
      if (authorElem) {
        title = `Instagram Post by @${authorElem.textContent.trim()} (${postId})`;
      } else {
        title = `Instagram Reel / Post (${postId})`;
      }
    } else if (platform === "flipkart") {
      const matchPid = url.match(/pid=([A-Z0-9]+)/i);
      const matchItem = url.match(/\/(?:p|product-reviews)\/([a-zA-Z0-9]+)/);
      postId = matchPid ? matchPid[1] : (matchItem ? matchItem[1] : "flp_item");
      const titleElem = document.querySelector("span.B_NuCI, h1._6EBuvT, span.VU-ZEz, div._2NKhZn, h1");
      if (titleElem && titleElem.textContent.trim()) {
        title = titleElem.textContent.trim();
      }
    } else if (platform === "amazon") {
      const matchAsin = url.match(/\/(?:dp|gp\/product|product-reviews)\/([A-Z0-9]{10})/i);
      if (matchAsin) postId = matchAsin[1];
      const titleElem = document.querySelector("#productTitle, [data-hook='product-link'], #cm-cr-dp-review-header");
      if (titleElem && titleElem.textContent.trim()) {
        title = titleElem.textContent.trim();
      }
    } else if (platform === "myntra") {
      const match = url.match(/\/(\d+)\/buy/) || url.match(/\/buy\/(\d+)/);
      postId = match ? match[1] : (url.split("/").filter(Boolean).pop() || "myntra_item");
      const titleElem = document.querySelector(".pdp-name, .pdp-title, h1");
      if (titleElem && titleElem.textContent.trim()) title = titleElem.textContent.trim();
    } else if (platform === "meesho") {
      const match = url.match(/\/p\/([a-zA-Z0-9]+)/);
      postId = match ? match[1] : (url.split("/").filter(Boolean).pop() || "meesho_item");
      const titleElem = document.querySelector("h1, span[class*='ProductTitle']");
      if (titleElem && titleElem.textContent.trim()) title = titleElem.textContent.trim();
    } else if (platform === "nykaa") {
      const match = url.match(/\/p\/(\d+)/) || url.match(/productId=(\d+)/);
      postId = match ? match[1] : (url.split("/").filter(Boolean).pop() || "nykaa_item");
      const titleElem = document.querySelector("h1, .product-title");
      if (titleElem && titleElem.textContent.trim()) title = titleElem.textContent.trim();
    } else if (platform === "ajio") {
      const match = url.match(/\/p\/([a-zA-Z0-9_]+)/);
      postId = match ? match[1] : (url.split("/").filter(Boolean).pop() || "ajio_item");
      const titleElem = document.querySelector("h1.prod-title, h1, .brand-name");
      if (titleElem && titleElem.textContent.trim()) title = titleElem.textContent.trim();
    }

    return { postId, title };
  }

  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return "usr_" + Math.abs(hash).toString(16);
  }

  function normalizeKey(str) {
    if (!str) return "";
    return String(str).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 120);
  }

  function countOccurrences(el, regex) {
    if (!el || !el.textContent) return 0;
    const matches = el.textContent.match(regex);
    return matches ? matches.length : 0;
  }

  let maxPillCount = 0;
  function updateFloatingPillCounter() {
    const badge = document.getElementById("s2-comment-counter");
    if (badge) {
      maxPillCount = Math.max(maxPillCount, state.collectedCommentsMap.size);
      badge.textContent = maxPillCount;
    }
  }

  let lastBroadcastTime = 0;
  function throttledBroadcastProgress(platform, page, totalPages, newReviews = 0) {
    updateFloatingPillCounter();
    const now = Date.now();
    if (now - lastBroadcastTime < 250) return;
    lastBroadcastTime = now;
    try {
      chrome.runtime.sendMessage({
        action: "TURBO_PAGE_PROGRESS",
        platform,
        page,
        totalPages,
        pageNumber: page,
        totalCollected: state.collectedCommentsMap.size,
        newReviews,
      });
    } catch (_) {}
  }

  // =========================================================================
  // 1. YouTubeEngine (Isolated)
  // =========================================================================
  const YouTubeEngine = {
    intervalId: null,

    extract() {
      const textNodes = document.querySelectorAll(
        "#content-text, yt-attributed-string#content-text, span.yt-core-attributed-string--link-inherit-color, ytd-comment-view-model #content-text"
      );

      textNodes.forEach((node, idx) => {
        const text = node.textContent.trim();
        if (!text || text.length < 2) return;

        const container = node.closest("ytd-comment-view-model") || node.closest("ytd-comment-thread-renderer") || node.closest("#body") || node.parentElement;
        let author = `user_${idx}`;
        let likes = 0;
        let timeStr = "recently";

        if (container) {
          const authorElem = container.querySelector("#author-text span, #author-text, a#author-text");
          if (authorElem) author = authorElem.textContent.trim();

          const likeElem = container.querySelector("#vote-count-middle, [aria-label*='like']");
          if (likeElem) {
            const rawLikes = likeElem.textContent.trim().toUpperCase();
            if (rawLikes.includes("K")) likes = Math.round(parseFloat(rawLikes) * 1000);
            else if (rawLikes.includes("M")) likes = Math.round(parseFloat(rawLikes) * 1000000);
            else likes = parseInt(rawLikes, 10) || 0;
          }

          const timeElem = container.querySelector(".published-time-text a, #header-author yt-formatted-string, span.published-time-text");
          if (timeElem) timeStr = timeElem.textContent.trim();
        }

        const normKey = normalizeKey(text);
        if (normKey && !state.collectedCommentsMap.has(normKey)) {
          state.collectedCommentsMap.set(normKey, {
            comment_id: `yt_${hashString(normKey)}`,
            raw_text: text,
            timestamp: timeStr,
            like_count: likes,
            anonymized_author_id: hashString(author),
            author: author,
            platform: "youtube",
          });
        }
      });
      return state.collectedCommentsMap.size;
    },

    startAutoCollector() {
      this.extract();
      this.intervalId = setInterval(() => {
        if (!state.isAutoScrolling) {
          this.stop();
          return;
        }
        this.extract();
        window.scrollBy({ top: 900, behavior: "smooth" });
        document.querySelectorAll("ytd-button-renderer#more-replies, button[aria-label*='more replies'], #more, yt-icon-button.ytd-comment-replies-renderer, yt-button-shape button").forEach((b) => {
          try { b.click(); } catch (_) {}
        });
        throttledBroadcastProgress("youtube", 1, 1);
      }, 500);
    },

    async turboFetch(burstCount = 5) {
      for (let burst = 1; burst <= burstCount; burst++) {
        window.scrollBy({ top: 1800, behavior: "instant" });
        document.querySelectorAll("ytd-button-renderer#more-replies, button[aria-label*='more replies'], #more, yt-button-shape button").forEach((b) => {
          try { b.click(); } catch (_) {}
        });
        await new Promise((r) => setTimeout(r, 200));
        const prev = state.collectedCommentsMap.size;
        this.extract();
        const diff = state.collectedCommentsMap.size - prev;
        throttledBroadcastProgress("youtube", burst, burstCount, diff);
      }
      return state.collectedCommentsMap.size;
    },

    stop() {
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
    }
  };

  // =========================================================================
  // 2. InstagramEngine (Stream A: Unthrottled API + Stream B: High-Speed Scroller)
  // =========================================================================
  const InstagramEngine = {
    scrollIntervalId: null,
    isApiActive: false,
    replyQueue: [],
    isReplyWorkerRunning: false,
    currentShortcode: null,

    getActiveShortcode() {
      const match = window.location.pathname.match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
      if (match) return match[1];

      const dialog = document.querySelector('div[role="dialog"]');
      if (dialog) {
        const modalLink = dialog.querySelector('a[href*="/p/"], a[href*="/reel/"]');
        if (modalLink) {
          const m = modalLink.getAttribute('href').match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
          if (m) return m[1];
        }
      }
      return null;
    },

    shortcodeToMediaId(shortcode) {
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
      let id = BigInt(0);
      for (const ch of shortcode) {
        const idx = alphabet.indexOf(ch);
        if (idx === -1) continue;
        id = id * BigInt(64) + BigInt(idx);
      }
      return id.toString();
    },

    getMediaId(shortcode) {
      try {
        const m = document.body.innerHTML.match(/"media_id"\s*:\s*"(\d+)"/) ||
                  document.body.innerHTML.match(/"pk"\s*:\s*"(\d+)"/) ||
                  document.body.innerHTML.match(/"id"\s*:\s*"(\d+_\d+)"/);
        if (m) {
          const val = m[1].includes("_") ? m[1].split("_")[0] : m[1];
          return val;
        }
      } catch (_) {}
      try {
        const scripts = document.querySelectorAll('script');
        for (const s of scripts) {
          const txt = s.textContent || "";
          if (txt.includes(shortcode)) {
            const m = txt.match(/"media_id"\s*:\s*"(\d+)"/) || txt.match(/"pk"\s*:\s*"(\d+)"/);
            if (m) return m[1];
          }
        }
      } catch (_) {}
      return this.shortcodeToMediaId(shortcode);
    },

    findInstagramScrollContainers(scope) {
      if (!scope) return [];
      const containers = [];

      // 1. Instant ancestor-walk from comments list (ul)
      const ul = scope.querySelector('ul');
      if (ul) {
        let parent = ul.parentElement;
        while (parent && parent !== scope && parent !== document.body && parent !== document.documentElement) {
          if (parent.scrollHeight > parent.clientHeight + 30 && parent.clientHeight > 100) {
            containers.push(parent);
            break;
          }
          parent = parent.parentElement;
        }
      }

      // 2. Direct Instagram modal container classes (never div.x78zum5)
      const candidateElems = scope.querySelectorAll('div[tabindex="0"], div.x5yr21d, div._a9ym, div[role="dialog"] > div > div');
      for (let i = 0; i < candidateElems.length; i++) {
        const el = candidateElems[i];
        if (el.scrollHeight > el.clientHeight + 40 && el.clientHeight > 120 && !containers.includes(el)) {
          containers.push(el);
        }
      }

      if (containers.length > 0) return containers;

      if (scope.scrollHeight > scope.clientHeight + 40 && scope.clientHeight > 120) {
        containers.push(scope);
      }
      return containers;
    },

    addComment(c, mediaId, headers) {
      if (!c || !c.text) return;
      const rawText = c.text.trim();
      const IG_METADATA_REGEX = /^(\d+[smhdwy]|Reply|See translation|Hide replies|View all \d+ replies|Original audio|AI content|\d[\d,]* likes?|Edited|Liked by creator|Verified)$/i;
      if (!rawText || IG_METADATA_REGEX.test(rawText)) return;

      const author = c.user?.username || "instagram_user";
      const dedupeKey = `ig_${normalizeKey(rawText)}`;
      if (!state.collectedCommentsMap.has(dedupeKey)) {
        const cid = `ig_${c.pk || hashString(dedupeKey)}`;
        const timeStr = c.created_at ? new Date(c.created_at * 1000).toISOString() : new Date().toISOString();
        state.collectedCommentsMap.set(dedupeKey, {
          comment_id: cid,
          raw_text: rawText,
          timestamp: timeStr,
          like_count: c.comment_like_count || 0,
          anonymized_author_id: hashString(author),
          author: author,
          star_rating: null,
          verified_purchase: null,
          platform: "instagram"
        });
      }

      if (Array.isArray(c.preview_child_comments)) {
        c.preview_child_comments.forEach(reply => this.addComment(reply, mediaId, headers));
      }

      const childCount = c.child_comment_count || 0;
      const previewCount = (c.preview_child_comments || []).length;
      if (childCount > previewCount && c.pk && mediaId && headers) {
        this.replyQueue.push(c.pk);
        this.triggerReplyWorker(mediaId, headers);
      }
    },

    triggerReplyWorker(mediaId, headers) {
      if (this.isReplyWorkerRunning) return;
      this.isReplyWorkerRunning = true;

      (async () => {
        try {
          while (this.replyQueue.length > 0 && state.isAutoScrolling) {
            // Process up to 6 concurrent reply requests
            const batch = this.replyQueue.splice(0, 6);
            await Promise.all(batch.map(async (commentPk) => {
              try {
                const url = `https://www.instagram.com/api/v1/media/${mediaId}/comments/${commentPk}/child_comments/`;
                const res = await fetch(url, { headers, credentials: "include" });
                if (res.ok) {
                  const data = await res.json();
                  (data.child_comments || []).forEach(child => this.addComment(child, mediaId, headers));
                }
              } catch (_) {}
            }));
            await new Promise(r => setTimeout(r, 15));
          }
        } finally {
          this.isReplyWorkerRunning = false;
        }
      })();
    },

    async startApiLoop(shortcode, maxPages = 200) {
      if (this.isApiActive) return;
      this.isApiActive = true;
      const mediaId = this.getMediaId(shortcode);
      let nextMinId = null;
      let pageCount = 0;
      let hasMore = true;

      const csrfMatch = document.cookie.match(/csrftoken=([^;]+)/);
      const csrfToken = csrfMatch ? csrfMatch[1] : "";
      const headers = {
        "x-ig-app-id": "936619743392459",
        "x-asbd-id": "129477",
        "x-requested-with": "XMLHttpRequest",
        "accept": "*/*"
      };
      if (csrfToken) headers["x-csrftoken"] = csrfToken;

      try {
        while (hasMore && pageCount < maxPages && state.isAutoScrolling) {
          pageCount++;
          let url = `https://www.instagram.com/api/v1/media/${mediaId}/comments/?can_support_threading=true&permalink_enabled=false`;
          if (nextMinId) {
            url += `&min_id=${encodeURIComponent(nextMinId)}`;
          }

          const res = await fetch(url, { headers, credentials: "include" });
          if (!res.ok) break;

          const data = await res.json();
          const comments = data.comments || [];
          if (comments.length === 0) break;

          comments.forEach(c => this.addComment(c, mediaId, headers));
          throttledBroadcastProgress("instagram", pageCount, maxPages);

          nextMinId = data.next_min_id;
          hasMore = Boolean(data.has_more_comments && nextMinId);

          // Fast 15ms tick between parent page requests for 50-100+ comments/sec
          await new Promise(r => setTimeout(r, 15));
        }
      } catch (e) {
        console.warn("[Sentinelytics] Instagram API error:", e);
      } finally {
        this.isApiActive = false;
      }
    },

    fetchInstagramCommentsViaInternalAPI(shortcode, maxPages = 200) {
      return this.startApiLoop(shortcode, maxPages);
    },

    extract(tailOnly = false) {
      const shortcode = this.getActiveShortcode();
      if (!shortcode) return state.collectedCommentsMap.size;

      if (this.currentShortcode && shortcode && this.currentShortcode !== shortcode) {
        state.collectedCommentsMap.clear();
        maxPillCount = 0;
      }
      this.currentShortcode = shortcode;

      const scope = document.querySelector('div[role="dialog"]') ||
                    document.querySelector('main article') ||
                    document.querySelector('article') ||
                    document.body;
      if (!scope) return state.collectedCommentsMap.size;

      const ownerLink = scope.querySelector('header a[href^="/"], h2 a[href^="/"], a._a6hd');
      const ownerUsername = ownerLink ? ownerLink.textContent.trim().toLowerCase().replace('@', '') : null;

      const allCommentNodes = scope.querySelectorAll('ul li, div.x9f619 > div.xdt5ytf, div._a9ym');
      let rows = allCommentNodes;
      if (tailOnly && allCommentNodes.length > 150) {
        // Fast O(1) Sliding Window Tail-Scan
        rows = Array.from(allCommentNodes).slice(-150);
      }

      const IG_METADATA_REGEX = /^(\d+[smhdwy]|Reply|See translation|Hide replies|View all \d+ replies|Original audio|AI content|\d[\d,]* likes?|Edited|Liked by creator|Verified)$/i;

      rows.forEach(row => {
        const userLink = row.querySelector('a[href^="/"][role="link"], h3 a[href^="/"], a[href^="/"]');
        if (!userLink) return;

        const timeElem = row.querySelector('time');
        const timeStr = timeElem ? (timeElem.getAttribute('datetime') || timeElem.textContent.trim()) : new Date().toISOString();

        const author = userLink.textContent.trim().replace('@', '');
        if (!author || (ownerUsername && author.toLowerCase() === ownerUsername)) return;

        const textSpans = row.querySelectorAll('span[dir="auto"], span.x193iq5w');
        let commentText = "";
        for (const span of textSpans) {
          if (span.closest('a') || span.closest('button') || span.closest('svg')) continue;
          const txt = span.textContent.trim();
          if (!txt || txt.length < 1 || IG_METADATA_REGEX.test(txt) || txt.toLowerCase() === author.toLowerCase()) continue;
          commentText = txt;
          break;
        }

        if (!commentText || IG_METADATA_REGEX.test(commentText)) return;

        const dedupeKey = `ig_${normalizeKey(commentText)}`;
        if (!state.collectedCommentsMap.has(dedupeKey)) {
          const cid = `ig_${hashString(dedupeKey)}`;
          state.collectedCommentsMap.set(dedupeKey, {
            comment_id: cid,
            raw_text: commentText,
            timestamp: timeStr,
            like_count: 0,
            anonymized_author_id: hashString(author),
            author: author,
            star_rating: null,
            verified_purchase: null,
            platform: "instagram"
          });
        }
      });

      return state.collectedCommentsMap.size;
    },

    async fetchRapidApiBoost(shortcode) {
      if (!shortcode) return 0;
      try {
        const res = await fetch("http://localhost:8000/api/instagram/rapidapi", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shortcode, max_comments: 500 })
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.status === "ok" && Array.isArray(data.comments)) {
            let added = 0;
            for (const c of data.comments) {
              const text = (c.raw_text || "").trim();
              if (!text) continue;
              const dedupeKey = `ig_${normalizeKey(text)}`;
              if (!state.collectedCommentsMap.has(dedupeKey)) {
                state.collectedCommentsMap.set(dedupeKey, {
                  comment_id: c.comment_id || `ig_${hashString(dedupeKey)}`,
                  raw_text: text,
                  timestamp: c.timestamp || new Date().toISOString(),
                  like_count: c.like_count || 0,
                  anonymized_author_id: c.author || c.anonymized_author_id || "ig_user",
                  author: c.author || "ig_user",
                  star_rating: null,
                  verified_purchase: null,
                  platform: "instagram"
                });
                added++;
              }
            }
            if (added > 0) {
              updateFloatingPillCounter();
              throttledBroadcastProgress("instagram", 1, 1, added);
            }
            return added;
          }
        }
      } catch (_) {}
      return 0;
    },

    startAutoCollector() {
      const shortcode = this.getActiveShortcode();
      if (shortcode) {
        if (this.currentShortcode && this.currentShortcode !== shortcode) {
          state.collectedCommentsMap.clear();
          maxPillCount = 0;
        }
        this.currentShortcode = shortcode;
        // Stream 1: RapidAPI Cloud Boost
        this.fetchRapidApiBoost(shortcode);
        // Stream 2A: Unthrottled Parallel Internal API Fetcher (50-100+ comments/sec)
        this.startApiLoop(shortcode);
      }

      // Stream B: Dynamic Scoped Scroller (65ms tick, WheelEvents, Tail-Scan)
      let tickCount = 0;
      this.scrollIntervalId = setInterval(() => {
        if (!state.isAutoScrolling) {
          this.stop();
          return;
        }
        tickCount++;

        const scope = document.querySelector('div[role="dialog"]') ||
                      document.querySelector('main article') ||
                      document.querySelector('article') ||
                      document.body;

        const containers = this.findInstagramScrollContainers(scope);
        containers.forEach((c) => {
          c.scrollTop = c.scrollHeight - 50;
          c.scrollTop = c.scrollHeight - 10;
          c.scrollTop = c.scrollHeight;
          try {
            c.dispatchEvent(new WheelEvent('wheel', { deltaY: 1000, bubbles: true }));
          } catch (_) {}
        });

        // Also scroll window / document for direct post/reel page view
        window.scrollBy({ top: 700, behavior: "instant" });
        if (document.scrollingElement) {
          document.scrollingElement.scrollTop = document.scrollingElement.scrollHeight;
        }

        // Fast button clicker: click up to 5 buttons per tick in parallel
        const buttons = scope.querySelectorAll('button, span[role="button"], div[role="button"]');
        let clicked = 0;
        for (let i = 0; i < buttons.length && clicked < 5; i++) {
          const btn = buttons[i];
          const txt = (btn.textContent || "").toLowerCase();
          const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
          const hasSvg = Boolean(btn.querySelector('svg[aria-label*="Load more"], svg[aria-label*="comments"]'));
          if (
            txt.includes("load more") ||
            txt.includes("view more") ||
            txt.includes("replies") ||
            txt.includes("view all") ||
            aria.includes("load more") ||
            aria.includes("view all") ||
            hasSvg
          ) {
            try {
              btn.click();
              clicked++;
            } catch (_) {}
          }
        }

        const tailOnly = (tickCount % 15 !== 0);
        this.extract(tailOnly);
        throttledBroadcastProgress("instagram", 1, 1);
      }, 65);
    },

    async turboFetch(pageCount = 5) {
      const shortcode = this.getActiveShortcode();
      if (shortcode) {
        if (this.currentShortcode && this.currentShortcode !== shortcode) {
          state.collectedCommentsMap.clear();
          maxPillCount = 0;
        }
        this.currentShortcode = shortcode;
        state.isAutoScrolling = true;

        // 1. Parallel RapidAPI cloud boost + In-browser API loop
        const rapidPromise = this.fetchRapidApiBoost(shortcode);
        const apiPages = Math.max(10, pageCount * 4);
        const apiPromise = this.startApiLoop(shortcode, apiPages);

        // 2. 25 turbo scroll bursts with WheelEvents and button clicks
        const scope = document.querySelector('div[role="dialog"]') ||
                      document.querySelector('main article') ||
                      document.querySelector('article') ||
                      document.body;

        const bursts = 25;
        for (let b = 1; b <= bursts; b++) {
          const containers = this.findInstagramScrollContainers(scope);
          containers.forEach((c) => {
            c.scrollTop = c.scrollHeight;
            try {
              c.dispatchEvent(new WheelEvent('wheel', { deltaY: 1000, bubbles: true }));
            } catch (_) {}
          });

          const buttons = scope.querySelectorAll('button, span[role="button"], div[role="button"]');
          let clicked = 0;
          for (let i = 0; i < buttons.length && clicked < 5; i++) {
            const btn = buttons[i];
            const txt = (btn.textContent || "").toLowerCase();
            const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
            if (txt.includes("load more") || txt.includes("view more") || txt.includes("replies") || aria.includes("load more")) {
              try { btn.click(); clicked++; } catch (_) {}
            }
          }

          this.extract(true);
          throttledBroadcastProgress("instagram", b, bursts);
          await new Promise(r => setTimeout(r, 40));
        }

        // Full sweep at the end
        this.extract(false);
        await apiPromise;
        state.isAutoScrolling = false;
      } else {
        this.extract(false);
      }
      return state.collectedCommentsMap.size;
    },

    stop() {
      if (this.scrollIntervalId) {
        clearInterval(this.scrollIntervalId);
        this.scrollIntervalId = null;
      }
      this.isApiActive = false;
    }
  };

  // =========================================================================
  // 3. FlipkartEngine (2026 DOM Line-Parser + Multi-Page Concurrent Auto-Collector)
  // =========================================================================
  const FlipkartEngine = {
    loopActive: false,
    EXCLUDE_SELECTORS: "div._3k-BhJ, table._14cfVK, div._1UhVsV, div._1xHGtK, #qna, div._2N5rRh, div[data-carousel], #specifications, div[data-qa]",
    ANCHOR_RE: /(Verified\s+Purchase|Certified\s+Buyer)/i,
    ANCHOR_GLOBAL_RE: /(Verified\s+Purchase|Certified\s+Buyer)/gi,
    NOISE_RE: /^(Review for\s*:|Helpful for\b|READ MORE|Read more|Report Abuse|Permalink|Most Helpful|Latest|Positive|Negative|Overall|User reviews sorted by|Images uploaded|All Reviews|Photos)/i,
    VERIFIED_RE: /^(Verified\s+Purchase|Certified\s+Buyer)/i,
    JSON_JUNK_RE: /[{}"\\]|viewAllImageUrl|tracking:|reviewList|__INITIAL_STATE__|"text":|"title":/,

    getCleanLines(el) {
      let raw = "";
      try {
        if (el.innerText && el.innerText.trim().length > 0) {
          raw = el.innerText;
        }
      } catch (_) {}

      if (!raw || raw.trim().length === 0) {
        const lines = [];
        const walker = (el.ownerDocument || document).createTreeWalker(
          el,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode(node) {
              const text = (node.nodeValue || "").trim();
              if (!text) return NodeFilter.FILTER_REJECT;
              const parent = node.parentElement;
              if (parent && (parent.tagName === "SCRIPT" || parent.tagName === "STYLE" || parent.tagName === "NOSCRIPT")) {
                return NodeFilter.FILTER_REJECT;
              }
              return NodeFilter.FILTER_ACCEPT;
            }
          }
        );
        let node;
        while ((node = walker.nextNode())) {
          const t = node.nodeValue.trim();
          if (t) lines.push(t);
        }
        return lines;
      }
      return raw.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    },

    extractFromDoc(doc = document) {
      const pageTitle = (doc.title || "").trim().toLowerCase();
      const processedCards = new Set();

      // Strategy A: Direct Flipkart review card selectors (never div.cPHDOP which is grid column)
      const directCards = doc.querySelectorAll("div.EPCmJX, div._27M-vq, div.RcXBOT, div._2wzgFH, div._16PBlm, div[data-review-id]");
      directCards.forEach((card) => {
        if (!processedCards.has(card) && !card.closest(this.EXCLUDE_SELECTORS)) {
          this.parseAndAddCard(card, processedCards, pageTitle);
        }
      });

      // Strategy B: Anchor walking on "Verified Purchase" and "Certified Buyer"
      const allElements = doc.querySelectorAll("span, p, div");
      const leafAnchors = [];
      allElements.forEach((el) => {
        if (this.ANCHOR_RE.test(el.textContent)) {
          const hasChildMatch = Array.from(el.children).some(child => this.ANCHOR_RE.test(child.textContent));
          if (!hasChildMatch && !el.closest(this.EXCLUDE_SELECTORS)) {
            leafAnchors.push(el);
          }
        }
      });

      leafAnchors.forEach((leaf) => {
        let card = leaf;
        while (
          card.parentElement &&
          card.parentElement !== doc.body &&
          card.parentElement !== doc.documentElement &&
          countOccurrences(card.parentElement, this.ANCHOR_GLOBAL_RE) === 1
        ) {
          card = card.parentElement;
        }

        if (!card || processedCards.has(card) || card.closest(this.EXCLUDE_SELECTORS)) return;
        this.parseAndAddCard(card, processedCards, pageTitle);
      });

      return state.collectedCommentsMap.size;
    },

    parseAndAddCard(card, processedCards, pageTitle) {
      if (!card || processedCards.has(card)) return;
      processedCards.add(card);

      // Auto-expand truncated text by clicking "... more" or "READ MORE"
      const moreBtns = card.querySelectorAll("span, button, a");
      for (let b = 0; b < moreBtns.length; b++) {
        const btnText = (moreBtns[b].textContent || "").trim().toLowerCase();
        if (btnText === "read more" || btnText === "more" || btnText === "... more") {
          try { moreBtns[b].click(); } catch (_) {}
        }
      }

      const AUTHOR_DATE_RE = /\s+([A-Za-z][A-Za-z\s.]{1,35}?)\s*(?:Helpful)?\s*[·•]\s*(\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago|today|yesterday|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*,?\s*\d{4})(?:\s*Helpful.*)?$/i;
      const HELPFUL_NOISE_RE = /\s*(?:Helpful\s*(?:for\s*\d+)?|\bHelpful\b|\bREAD MORE\b|\bRead more\b|\.\.\.\s*more)\s*$/i;
      const LEADING_BULLET_RE = /^[•·★*!\-—\s:]+/;

      // 1. Direct DOM queries on Flipkart card
      let starRating = null;
      let reviewTitle = "";
      let reviewBody = "";
      let author = "Flipkart Customer";
      let timestamp = new Date().toISOString();
      let isVerified = false;

      const starElem = card.querySelector("div.XQDdHH, div._3LWZlK, div.XWuL2k, div._5OesEi, span.Y1HWO0, div[class*='rating-title'], div.rating-title-row, [class*='star-rating'], [class*='StarRating']");
      if (starElem && !starElem.closest(".helpful-btn-row, .helpful-footer, [class*='helpful']")) {
        const m = starElem.textContent.match(/([1-5](?:\.\d)?)/);
        if (m) starRating = Math.round(parseFloat(m[1]));
      }

      const titleElem = card.querySelector("p.z9E0IG, p._2-N8zT, div.rating-title-row, [class*='title']");
      if (titleElem && titleElem.textContent.trim()) {
        let t = titleElem.textContent.replace(/^[1-5](\.\d)?\s*[•·★*]?\s*/, "").trim();
        t = t.replace(LEADING_BULLET_RE, "").trim();
        if (t.length > 1 && t.length < 80 && !/^[•·★*!\-—\s:]+$/.test(t)) reviewTitle = t;
      }

      const bodyElem = card.querySelector("div.ZmyHeo, div.t-ZTKy, div.review-body-text, [class*='reviewText'], [class*='review-body']");
      if (bodyElem && bodyElem.textContent.trim()) {
        reviewBody = bodyElem.textContent.replace(/\s*READ MORE\s*$/i, "").replace(/\s*Read more\s*$/i, "").trim();
      }

      const authorElem = card.querySelector("p._2NsDsF, p._2sc7ZR, div.reviewer-name-loc, [class*='reviewer']");
      if (authorElem && authorElem.textContent.trim()) {
        let rawAuth = authorElem.textContent.trim();
        rawAuth = rawAuth.replace(/[•·,]\s*Verified.*$/i, "").trim();
        if (rawAuth) author = rawAuth;
      }

      const verifiedElem = card.querySelector("p.MztJPv, p._2mcPpO, div.verified-badge-row, [class*='certified'], [class*='verified']");
      if (verifiedElem) {
        isVerified = this.VERIFIED_RE.test(verifiedElem.textContent);
        const dm = verifiedElem.textContent.match(/[•·,]\s*(.+)$/);
        if (dm) timestamp = dm[1].trim();
      }

      // 2. Fallback to clean line parsing if direct selectors didn't get body or star rating
      if (!reviewBody || starRating === null) {
        const lines = this.getCleanLines(card);
        if (lines.length >= 2 && !lines.some(l => this.JSON_JUNK_RE.test(l)) && (!pageTitle || !lines.some(l => l.toLowerCase() === pageTitle))) {
          let verifiedIdx = -1;
          const bodyLines = [];

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Star rating: ONLY from line 0 or 1 at the top of the card! NEVER from footer lines!
            if (starRating === null && i <= 1) {
              const rm = line.match(/^([1-5](?:\.\d)?)\s*[•·★*]?\s*(.*)$/);
              if (rm && line.length < 80) {
                starRating = Math.round(parseFloat(rm[1]));
                const possibleTitle = rm[2].replace(LEADING_BULLET_RE, "").trim();
                if (possibleTitle.length > 1 && possibleTitle.length < 60 && !reviewTitle && !/^[•·★*!\-—\s:]+$/.test(possibleTitle)) {
                  reviewTitle = possibleTitle;
                }
                continue;
              }
            }

            if (!reviewTitle && starRating !== null && bodyLines.length === 0 && i <= 2 && line.length < 70 && !this.NOISE_RE.test(line) && !this.VERIFIED_RE.test(line)) {
              const cleanedT = line.replace(LEADING_BULLET_RE, "").trim();
              if (cleanedT.length > 1 && !/^[•·★*!\-—\s:]+$/.test(cleanedT)) {
                reviewTitle = cleanedT;
                continue;
              }
            }

            if (this.VERIFIED_RE.test(line)) {
              isVerified = true;
              verifiedIdx = i;
              const dateMatch = line.match(/[•·,]\s*(.+)$/);
              if (dateMatch && (!timestamp || timestamp.includes("T"))) timestamp = dateMatch[1].trim();
              continue;
            }

            if (this.NOISE_RE.test(line)) continue;
            if (/^\d+$/.test(line)) continue;

            const adm = line.match(AUTHOR_DATE_RE);
            if (adm) {
              if (!author || author === "Flipkart Customer") author = adm[1].trim();
              timestamp = adm[2].trim();
              const lineClean = line.slice(0, adm.index).trim();
              if (lineClean) bodyLines.push({ text: lineClean, idx: i });
              continue;
            }

            bodyLines.push({ text: line, idx: i });
          }

          let authorFoundIdx = -1;
          for (let bi = bodyLines.length - 1; bi >= 0; bi--) {
            const bl = bodyLines[bi];
            if (
              bl.text.length < 60 &&
              !bl.text.endsWith(".") &&
              !bl.text.endsWith("!") &&
              !bl.text.endsWith("?") &&
              !/^(READ MORE|Report Abuse|Helpful)/i.test(bl.text)
            ) {
              if (verifiedIdx > 0 && bl.idx < verifiedIdx) {
                if (author === "Flipkart Customer") author = bl.text;
                authorFoundIdx = bi;
                break;
              }
              if (verifiedIdx === -1 && bi === bodyLines.length - 1) {
                if (author === "Flipkart Customer") author = bl.text;
                authorFoundIdx = bi;
                break;
              }
            }
          }
          if (authorFoundIdx >= 0) bodyLines.splice(authorFoundIdx, 1);

          if (!reviewBody && bodyLines.length > 0) {
            reviewBody = bodyLines.map(bl => bl.text).join(" ")
              .replace(/\s*READ MORE\s*$/i, "").replace(/\s*Read more\s*$/i, "").trim();
          }
        }
      }

      // Check for trailing author + relative date pattern in reviewBody
      if (reviewBody) {
        const adm = reviewBody.match(AUTHOR_DATE_RE);
        if (adm) {
          if (!author || author === "Flipkart Customer") author = adm[1].trim();
          timestamp = adm[2].trim();
          reviewBody = reviewBody.slice(0, adm.index).trim();
        }
        reviewBody = reviewBody.replace(HELPFUL_NOISE_RE, "").trim();
        reviewBody = reviewBody.replace(LEADING_BULLET_RE, "").trim();
      }

      let rawText = "";
      if (reviewTitle && reviewBody) {
        const safeTitle = reviewTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const cleanB = reviewBody.replace(new RegExp("^" + safeTitle + "[—\\-·•!:]*\\s*", "i"), "").trim();
        rawText = cleanB ? `${reviewTitle} — ${cleanB}` : (reviewBody || reviewTitle);
      } else if (reviewBody) {
        rawText = reviewBody;
      } else if (reviewTitle) {
        rawText = reviewTitle;
      }

      rawText = rawText.replace(LEADING_BULLET_RE, "").trim();
      rawText = rawText.replace(HELPFUL_NOISE_RE, "").trim();

      // Final pass on author date suffix if still in rawText
      const finalAdm = rawText.match(AUTHOR_DATE_RE);
      if (finalAdm) {
        if (!author || author === "Flipkart Customer") author = finalAdm[1].trim();
        timestamp = finalAdm[2].trim();
        rawText = rawText.slice(0, finalAdm.index).trim();
        rawText = rawText.replace(LEADING_BULLET_RE, "").trim();
        rawText = rawText.replace(HELPFUL_NOISE_RE, "").trim();
      }

      if (!rawText || rawText.length < 3) return;

      // Canonical deduplication key using clean alphanumeric review content
      const canonKey = rawText.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 150);
      if (!canonKey) return;
      const cid = `flp_${canonKey}`;

      if (!state.collectedCommentsMap.has(cid)) {
        state.collectedCommentsMap.set(cid, {
          comment_id: cid,
          raw_text: rawText,
          timestamp: timestamp,
          like_count: 0,
          anonymized_author_id: author,
          author: author,
          star_rating: starRating || 5,
          verified_purchase: isVerified,
          platform: "flipkart"
        });
      }
    },

    getCanonicalReviewsUrl() {
      const currentUrl = window.location.href;
      const allReviewsLink = document.querySelector('a[href*="/product-reviews/"]');
      let target = currentUrl;
      if (allReviewsLink && allReviewsLink.href) {
        target = allReviewsLink.href;
      } else if (target.includes("/p/")) {
        target = target.replace("/p/", "/product-reviews/");
      } else if (!target.includes("/product-reviews/")) {
        const matchPid = target.match(/pid=([A-Z0-9]+)/i);
        if (matchPid) {
          target = `${window.location.origin}/product-reviews/itm?pid=${matchPid[1]}`;
        }
      }
      return target;
    },

    async fetchAndParsePage(urlStr) {
      try {
        const res = await fetch(urlStr, {
          credentials: "include",
          headers: {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Cache-Control": "no-cache",
          },
        });
        if (!res.ok) return 0;
        const html = await res.text();
        const parser = new DOMParser();
        const parsedDoc = parser.parseFromString(html, "text/html");
        const prevCount = state.collectedCommentsMap.size;
        this.extractFromDoc(parsedDoc);
        return state.collectedCommentsMap.size - prevCount;
      } catch (err) {
        return 0;
      }
    },

    async startAutoCollector() {
      if (this.loopActive) return;
      this.loopActive = true;

      // 1. Immediate current page scrape
      this.extractFromDoc(document);
      throttledBroadcastProgress("flipkart", 1, 1);

      // 2. Resolve canonical review URL
      const canonicalBase = this.getCanonicalReviewsUrl();
      let urlObj;
      try { urlObj = new URL(canonicalBase); } catch (_) { urlObj = new URL(window.location.href); }

      const isAlreadyOnReviewPage = urlObj.pathname.includes("/product-reviews/");
      let pageNum = parseInt(urlObj.searchParams.get("page") || (isAlreadyOnReviewPage ? "1" : "0"), 10) || 0;
      let consecutiveEmptyBatches = 0;

      // 3. Continuous Multi-Page Background Loop (batches of 2 concurrent pages)
      while (state.isAutoScrolling && this.loopActive && consecutiveEmptyBatches < 2) {
        const p1 = pageNum + 1;
        const p2 = pageNum + 2;
        pageNum += 2;

        urlObj.searchParams.set("page", String(p1));
        const url1 = urlObj.href;
        urlObj.searchParams.set("page", String(p2));
        const url2 = urlObj.href;

        // Smooth scroll to simulate user activity and render any lazy images/reviews
        window.scrollBy({ top: 400, behavior: "smooth" });

        const [new1, new2] = await Promise.all([
          this.fetchAndParsePage(url1),
          this.fetchAndParsePage(url2)
        ]);

        const totalNew = new1 + new2;
        if (totalNew === 0) {
          consecutiveEmptyBatches++;
        } else {
          consecutiveEmptyBatches = 0;
        }

        throttledBroadcastProgress("flipkart", p2, p2, totalNew);
        await new Promise(r => setTimeout(r, 250));
      }

      this.loopActive = false;
    },

    async turboFetch(pageCount = 5) {
      // 1. Immediate scrape
      this.extractFromDoc(document);

      const canonicalBase = this.getCanonicalReviewsUrl();
      let urlObj;
      try { urlObj = new URL(canonicalBase); } catch (_) { urlObj = new URL(window.location.href); }
      const isAlreadyOnReviewPage = urlObj.pathname.includes("/product-reviews/");
      const startPage = parseInt(urlObj.searchParams.get("page") || (isAlreadyOnReviewPage ? "1" : "0"), 10) || 0;

      // Fetch all requested pages concurrently for sub-second speed
      const pagePromises = Array.from({ length: pageCount }, (_, idx) => {
        const p = startPage + idx + 1;
        const pageUrl = new URL(urlObj.href);
        pageUrl.searchParams.set("page", String(p));
        return this.fetchAndParsePage(pageUrl.href).then(newReviews => {
          throttledBroadcastProgress("flipkart", idx + 1, pageCount, newReviews);
          return newReviews;
        });
      });

      await Promise.all(pagePromises);
      return state.collectedCommentsMap.size;
    },

    stop() {
      this.loopActive = false;
    }
  };

  // =========================================================================
  // 4. AmazonEngine (2026 DOM Hook + Concurrent Multi-Page Auto-Collector)
  // =========================================================================
  const AmazonEngine = {
    loopActive: false,
    EXCLUDE_SELECTORS: "#feature-bullets, #aplus, #ask-btf_feature_div, #productDescription, #detailBullets_feature_div, #prodDetails, #technicalSpecifications_feature_div",

    extractFromDoc(doc = document) {
      const cards = Array.from(doc.querySelectorAll("div[data-hook='review'], div[data-hook='cmps-review-card'], #cm-cr-dp-review-list li, div.review, div[id^='customer_review-']"));

      if (cards.length === 0) {
        const VERIFIED_REGEX = /verified\s+purchase/i;
        const VERIFIED_GLOBAL_REGEX = /verified\s+purchase/gi;
        const candidates = doc.querySelectorAll("span, p, div");
        const leafAnchors = [];
        candidates.forEach((el) => {
          if (VERIFIED_REGEX.test(el.textContent)) {
            const hasChild = Array.from(el.children).some(child => VERIFIED_REGEX.test(child.textContent));
            if (!hasChild && !el.closest(this.EXCLUDE_SELECTORS)) {
              leafAnchors.push(el);
            }
          }
        });

        leafAnchors.forEach((leaf) => {
          let card = leaf;
          while (
            card.parentElement &&
            card.parentElement !== doc.body &&
            card.parentElement !== doc.documentElement &&
            countOccurrences(card.parentElement, VERIFIED_GLOBAL_REGEX) === 1
          ) {
            card = card.parentElement;
          }
          if (card && !card.closest(this.EXCLUDE_SELECTORS) && !cards.includes(card)) {
            cards.push(card);
          }
        });
      }

      cards.forEach((card, idx) => {
        if (card.closest(this.EXCLUDE_SELECTORS)) return;

        // Accurate title extraction: skip .a-icon-alt star spans to preserve genuine title
        let titleText = "";
        const titleAnchor = card.querySelector("[data-hook='review-title'], [data-hook='reviewTitle'], a.review-title, h5[data-hook='reviewTitle']");
        if (titleAnchor) {
          const nonAltSpans = Array.from(titleAnchor.querySelectorAll("span:not(.a-icon-alt):not(.a-letter-space)"));
          if (nonAltSpans.length > 0) {
            titleText = nonAltSpans.map(s => s.textContent.trim()).filter(Boolean).join(" ");
          } else {
            titleText = titleAnchor.textContent.trim();
          }
          titleText = titleText.replace(/^[0-9.]+\s*out of\s*5\s*stars\s*/i, "").replace(/^[1-5]\s*stars?\s*/i, "").trim();
        }

        // Accurate body extraction
        let bodyText = "";
        const bodyContainer = card.querySelector("[data-hook='review-body'], [data-hook='reviewText'], [data-hook='reviewTextContainer'], .review-text, div.review-data");
        if (bodyContainer) {
          const bodyInner = bodyContainer.querySelector("span:not([class*='cr-translated'])") || bodyContainer;
          bodyText = bodyInner.textContent
            .replace(/Brief content visible, double tap to read full content\./gi, "")
            .replace(/Full content visible, double tap to read brief content\./gi, "")
            .replace(/\s*Read more\s*$/i, "")
            .replace(/\s*Read less\s*$/i, "")
            .trim();
        }

        const fullText = (titleText && bodyText && !bodyText.toLowerCase().startsWith(titleText.toLowerCase())) ? (titleText + ". " + bodyText) : (bodyText || titleText);
        if (!fullText || fullText.length < 3) return;

        const ratingElem = card.querySelector("i[data-hook='review-star-rating'] span.a-icon-alt, i[data-hook='cmps-review-star-rating'] span.a-icon-alt, [data-hook='review-star-rating'], [data-hook='cmps-review-star-rating'], i.a-star-[1-5], [class*='a-star-']");
        let starRating = 5;
        if (ratingElem) {
          const match = ratingElem.textContent.match(/([0-9\.]+)\s+out of/);
          if (match) {
            starRating = Math.round(parseFloat(match[1]));
          } else {
            const clsMatch = (ratingElem.className || "").match(/a-star-([1-5])/);
            if (clsMatch) starRating = parseInt(clsMatch[1], 10);
          }
        }

        const authorElem = card.querySelector("span.a-profile-name, .a-profile-name, [data-hook='author']");
        const author = authorElem ? authorElem.textContent.trim() : `amz_buyer_${idx}`;

        const verifiedElem = card.querySelector("span[data-hook='avp-badge'], [data-hook='avp-badge-linkless']");
        const isVerified = verifiedElem ? verifiedElem.textContent.includes("Verified Purchase") : card.textContent.includes("Verified Purchase");

        const timeElem = card.querySelector("span[data-hook='review-date'], .review-date");
        const timeStr = timeElem ? timeElem.textContent.trim() : new Date().toISOString();

        const norm = normalizeKey(fullText + "_" + author);
        if (!norm) return;
        const cid = `amz_${norm}`;
        if (!state.collectedCommentsMap.has(cid)) {
          state.collectedCommentsMap.set(cid, {
            comment_id: cid,
            raw_text: fullText,
            timestamp: timeStr,
            like_count: 0,
            anonymized_author_id: hashString(author),
            author: author,
            star_rating: starRating,
            verified_purchase: isVerified,
            platform: "amazon"
          });
        }
      });

      return state.collectedCommentsMap.size;
    },

    getAsin() {
      const matchAsin = window.location.href.match(/\/(?:dp|gp\/product|product-reviews)\/([A-Z0-9]{10})/i);
      const asinInput = document.querySelector('input#ASIN, input[name="ASIN"], [data-asin]');
      return matchAsin ? matchAsin[1] : (asinInput ? (asinInput.value || asinInput.getAttribute("data-asin")) : null);
    },

    async fetchAndParsePage(urlStr) {
      try {
        const res = await fetch(urlStr, {
          credentials: "include",
          headers: { "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }
        });
        if (!res.ok) return 0;
        const html = await res.text();
        const parser = new DOMParser();
        const parsedDoc = parser.parseFromString(html, "text/html");
        const prevCount = state.collectedCommentsMap.size;
        this.extractFromDoc(parsedDoc);
        return state.collectedCommentsMap.size - prevCount;
      } catch (err) {
        return 0;
      }
    },

    async startAutoCollector() {
      if (this.loopActive) return;
      this.loopActive = true;

      this.extractFromDoc(document);
      throttledBroadcastProgress("amazon", 1, 1);

      const asin = this.getAsin();
      if (!asin) return;

      const origin = window.location.origin;
      const isAlreadyOnReviewPage = window.location.href.includes("/product-reviews/");
      const pageParamMatch = window.location.href.match(/[?&]pageNumber=(\d+)/);
      let pageNum = isAlreadyOnReviewPage && pageParamMatch ? parseInt(pageParamMatch[1], 10) : (isAlreadyOnReviewPage ? 1 : 0);
      let consecutiveEmpty = 0;

      while (state.isAutoScrolling && this.loopActive && consecutiveEmpty < 2) {
        const p1 = pageNum + 1;
        const p2 = pageNum + 2;
        pageNum += 2;

        const url1 = `${origin}/product-reviews/${asin}/?pageNumber=${p1}&reviewerType=all_reviews`;
        const url2 = `${origin}/product-reviews/${asin}/?pageNumber=${p2}&reviewerType=all_reviews`;

        window.scrollBy({ top: 400, behavior: "smooth" });

        const [new1, new2] = await Promise.all([
          this.fetchAndParsePage(url1),
          this.fetchAndParsePage(url2)
        ]);

        if (new1 + new2 === 0) {
          consecutiveEmpty++;
        } else {
          consecutiveEmpty = 0;
        }

        throttledBroadcastProgress("amazon", p2, p2, new1 + new2);
        await new Promise(r => setTimeout(r, 250));
      }

      this.loopActive = false;
    },

    async turboFetch(pageCount = 5) {
      this.extractFromDoc(document);

      const asin = this.getAsin();
      if (!asin) return state.collectedCommentsMap.size;

      const origin = window.location.origin;
      const isAlreadyOnReviewPage = window.location.href.includes("/product-reviews/");
      const pageParamMatch = window.location.href.match(/[?&]pageNumber=(\d+)/);
      const startPage = isAlreadyOnReviewPage && pageParamMatch ? parseInt(pageParamMatch[1], 10) : (isAlreadyOnReviewPage ? 1 : 0);

      const pagePromises = Array.from({ length: pageCount }, (_, idx) => {
        const p = startPage + idx + 1;
        const pageUrl = `${origin}/product-reviews/${asin}/?pageNumber=${p}&reviewerType=all_reviews`;
        return this.fetchAndParsePage(pageUrl).then(newReviews => {
          throttledBroadcastProgress("amazon", idx + 1, pageCount, newReviews);
          return newReviews;
        });
      });

      await Promise.all(pagePromises);
      return state.collectedCommentsMap.size;
    },

    stop() {
      this.loopActive = false;
    }
  };

  // =========================================================================
  // 5. Universal Fallbacks for Myntra, Meesho, Nykaa, Ajio
  // =========================================================================
  function extractMyntraReviews() {
    const cards = document.querySelectorAll(".user-review-reviewTextWrapper, div[class*='user-review'], div[class*='UserReview'], .detailed-reviews-userReviewsContainer > div");
    cards.forEach((card, idx) => {
      const textElem = card.querySelector(".user-review-reviewTextWrapper, div[class*='reviewText'], p");
      const text = textElem ? textElem.textContent.trim() : card.textContent.trim();
      if (!text || text.length < 10) return;

      let stars = 5;
      const starElem = card.querySelector(".user-review-starRating, span[class*='star']");
      if (starElem) {
        const m = starElem.textContent.match(/([1-5])/);
        if (m) stars = parseInt(m[1], 10);
      }

      let author = `buyer_${idx}`;
      const authorElem = card.querySelector(".user-review-leftContainer span, span[class*='userName']");
      if (authorElem && authorElem.textContent.trim()) author = authorElem.textContent.trim();

      const norm = normalizeKey(text + "_" + author);
      if (!norm) return;
      const key = `myntra_${norm}`;
      if (!state.collectedCommentsMap.has(key)) {
        state.collectedCommentsMap.set(key, {
          comment_id: key,
          raw_text: text,
          timestamp: new Date().toISOString(),
          like_count: 0,
          anonymized_author_id: hashString(author),
          author: author,
          star_rating: stars,
          verified_purchase: true,
          platform: "myntra"
        });
      }
    });
  }

  function extractMeeshoReviews() {
    const cards = document.querySelectorAll("div[class*='ReviewCard'], div[class*='ReviewTile'], div[class*='UserReview']");
    cards.forEach((card, idx) => {
      const textNodes = card.querySelectorAll("span, p");
      let text = "";
      for (const n of textNodes) {
        const t = n.textContent.trim();
        if (t.length >= 15 && !t.includes("Verified") && !t.includes("Helpful")) {
          text = t;
          break;
        }
      }
      if (!text && card.textContent.length >= 15) text = card.textContent.trim();
      if (!text || text.length < 10) return;

      let stars = 5;
      const mStar = card.textContent.match(/([1-5])\s*★/);
      if (mStar) stars = parseInt(mStar[1], 10);

      const author = `meesho_buyer_${idx}`;
      const norm = normalizeKey(text + "_" + author);
      if (!norm) return;
      const key = `meesho_${norm}`;
      if (!state.collectedCommentsMap.has(key)) {
        state.collectedCommentsMap.set(key, {
          comment_id: key,
          raw_text: text,
          timestamp: new Date().toISOString(),
          like_count: 0,
          anonymized_author_id: hashString(author),
          author: author,
          star_rating: stars,
          verified_purchase: true,
          platform: "meesho"
        });
      }
    });
  }

  function extractNykaaReviews() {
    const cards = document.querySelectorAll("div[class*='review-wrapper'], div[class*='ReviewCard'], div[class*='review-card'], [data-test-id='review-card']");
    cards.forEach((card, idx) => {
      const textElem = card.querySelector("p, .review-description, div[class*='description']");
      const text = textElem ? textElem.textContent.trim() : card.textContent.trim();
      if (!text || text.length < 10) return;

      let stars = 5;
      const starElem = card.querySelector("[class*='rating'], [class*='star']");
      if (starElem) {
        const m = starElem.textContent.match(/([1-5])/);
        if (m) stars = parseInt(m[1], 10);
      }

      let author = `nykaa_shopper_${idx}`;
      const authorElem = card.querySelector(".name, [class*='author']");
      if (authorElem && authorElem.textContent.trim()) author = authorElem.textContent.trim();

      const norm = normalizeKey(text + "_" + author);
      if (!norm) return;
      const key = `nykaa_${norm}`;
      if (!state.collectedCommentsMap.has(key)) {
        state.collectedCommentsMap.set(key, {
          comment_id: key,
          raw_text: text,
          timestamp: new Date().toISOString(),
          like_count: 0,
          anonymized_author_id: hashString(author),
          author: author,
          star_rating: stars,
          verified_purchase: true,
          platform: "nykaa"
        });
      }
    });
  }

  function extractAjioReviews() {
    const cards = document.querySelectorAll("div[class*='review-card'], div[class*='customer-review'], div[class*='ReviewCard']");
    cards.forEach((card, idx) => {
      const textElem = card.querySelector("p, .review-text, div[class*='review-desc']");
      const text = textElem ? textElem.textContent.trim() : card.textContent.trim();
      if (!text || text.length < 10) return;

      let stars = 5;
      const mStar = card.textContent.match(/([1-5])(?:\.0)?\s*★/);
      if (mStar) stars = parseInt(mStar[1], 10);

      const author = `ajio_customer_${idx}`;
      const norm = normalizeKey(text + "_" + author);
      if (!norm) return;
      const key = `ajio_${norm}`;
      if (!state.collectedCommentsMap.has(key)) {
        state.collectedCommentsMap.set(key, {
          comment_id: key,
          raw_text: text,
          timestamp: new Date().toISOString(),
          like_count: 0,
          anonymized_author_id: hashString(author),
          author: author,
          star_rating: stars,
          verified_purchase: true,
          platform: "ajio"
        });
      }
    });
  }

  // Backward compatibility alias for Flipkart tests / external callers
  function extractFlipkartReviews(doc = document) {
    return FlipkartEngine.extractFromDoc(doc);
  }
  function extractAmazonReviews(doc = document) {
    return AmazonEngine.extractFromDoc(doc);
  }

  // =========================================================================
  // 6. Coordinator: Strict Platform Isolation Execution
  // =========================================================================
  function runExtraction() {
    const platform = detectPlatform();
    if (platform === "youtube") YouTubeEngine.extract();
    else if (platform === "instagram") InstagramEngine.extract();
    else if (platform === "flipkart") FlipkartEngine.extractFromDoc(document);
    else if (platform === "amazon") AmazonEngine.extractFromDoc(document);
    else if (platform === "myntra") extractMyntraReviews();
    else if (platform === "meesho") extractMeeshoReviews();
    else if (platform === "nykaa") extractNykaaReviews();
    else if (platform === "ajio") extractAjioReviews();

    return state.collectedCommentsMap.size;
  }

  function startAutoScroll() {
    if (state.isAutoScrolling) return;
    state.isAutoScrolling = true;

    const platform = detectPlatform();
    if (platform === "youtube") {
      YouTubeEngine.startAutoCollector();
    } else if (platform === "instagram") {
      InstagramEngine.startAutoCollector();
    } else if (platform === "flipkart") {
      FlipkartEngine.startAutoCollector();
    } else if (platform === "amazon") {
      AmazonEngine.startAutoCollector();
    } else {
      // General fallbacks (Myntra, Meesho, Nykaa, Ajio)
      state.scrollInterval = setInterval(() => {
        runExtraction();
        window.scrollBy({ top: 800, behavior: "smooth" });
        throttledBroadcastProgress(platform, 1, 1);
      }, 700);
    }
  }

  function stopAutoScroll() {
    state.isAutoScrolling = false;
    if (state.scrollInterval) {
      clearInterval(state.scrollInterval);
      state.scrollInterval = null;
    }
    YouTubeEngine.stop();
    InstagramEngine.stop();
    FlipkartEngine.stop();
    AmazonEngine.stop();
    runExtraction();
  }

  async function turboFetchEcommercePages(pageCount = 5) {
    const platform = detectPlatform();
    if (platform === "youtube") return await YouTubeEngine.turboFetch(pageCount);
    if (platform === "instagram") return await InstagramEngine.turboFetch(pageCount);
    if (platform === "flipkart") return await FlipkartEngine.turboFetch(pageCount);
    if (platform === "amazon") return await AmazonEngine.turboFetch(pageCount);

    runExtraction();
    return state.collectedCommentsMap.size;
  }

  // Initial immediate extraction on injection
  runExtraction();

  // Remove any stale listener before binding new one
  if (window.__sentinelytics_listener) {
    chrome.runtime.onMessage.removeListener(window.__sentinelytics_listener);
  }

  window.__sentinelytics_listener = (request, sender, sendResponse) => {
    if (request.action === "PING") {
      sendResponse({ status: "PONG" });
      return true;
    }

    if (request.action === "INGEST_RAPIDAPI_COMMENTS") {
      const items = request.comments || [];
      let added = 0;
      for (const c of items) {
        const text = (c.raw_text || "").trim();
        if (!text) continue;
        const dedupeKey = `ig_${normalizeKey(text)}`;
        if (!state.collectedCommentsMap.has(dedupeKey)) {
          state.collectedCommentsMap.set(dedupeKey, {
            comment_id: c.comment_id || `ig_${hashString(dedupeKey)}`,
            raw_text: text,
            timestamp: c.timestamp || new Date().toISOString(),
            like_count: c.like_count || 0,
            anonymized_author_id: c.author || c.anonymized_author_id || "ig_user",
            author: c.author || "ig_user",
            star_rating: null,
            verified_purchase: null,
            platform: "instagram"
          });
          added++;
        }
      }
      if (added > 0) {
        updateFloatingPillCounter();
        throttledBroadcastProgress("instagram", 1, 1, added);
      }
      sendResponse({ status: "ok", added, count: state.collectedCommentsMap.size });
      return true;
    }

    const platform = detectPlatform();
    const meta = detectPostIdAndTitle(platform);

    if (request.action === "GET_STATUS") {
      runExtraction();
      sendResponse({
        platform,
        postId: meta.postId,
        title: meta.title,
        url: window.location.href,
        count: state.collectedCommentsMap.size,
        isAutoScrolling: state.isAutoScrolling,
        isEcommerce: ["flipkart", "amazon", "myntra", "meesho", "nykaa", "ajio"].includes(platform),
      });
      return true;
    }

    if (request.action === "START_AUTO_SCROLL") {
      startAutoScroll();
      sendResponse({ status: "started", count: state.collectedCommentsMap.size });
      return true;
    }

    if (request.action === "STOP_AUTO_SCROLL") {
      stopAutoScroll();
      sendResponse({ status: "stopped", count: state.collectedCommentsMap.size });
      return true;
    }

    if (request.action === "turboFetchPages" || request.action === "FETCH_PAGES") {
      const pageCount = request.pageCount || request.pages || 5;
      turboFetchEcommercePages(pageCount).then((count) => {
        sendResponse({ status: "success", count });
      });
      return true;
    }

    if (request.action === "GET_ALL_COMMENTS") {
      runExtraction();
      const commentsArray = Array.from(state.collectedCommentsMap.values());
      sendResponse({
        platform,
        postId: meta.postId,
        title: meta.title,
        url: window.location.href,
        comments: commentsArray,
      });
      return true;
    }
  };

  chrome.runtime.onMessage.addListener(window.__sentinelytics_listener);

  // =========================================================================
  // 7. Floating On-Page "⚡ Analyze with Sentinelytics" Pill
  // =========================================================================
  function injectFloatingPill() {
    const platform = detectPlatform();
    if (platform === "unsupported") return;
    if (document.getElementById("sentinelytics-floating-pill")) return;

    const pill = document.createElement("div");
    pill.id = "sentinelytics-floating-pill";
    pill.innerHTML = `
      <span class="s2-icon">⚡</span>
      <span class="s2-text">Analyze with Sentinelytics</span>
      <span class="s2-badge" id="s2-comment-counter">${state.collectedCommentsMap.size}</span>
    `;

    pill.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();

      const textElem = pill.querySelector(".s2-text");
      const iconElem = pill.querySelector(".s2-icon");
      const prevText = textElem.textContent;

      if (platform === "instagram") {
        const sc = InstagramEngine.getActiveShortcode();
        if (!sc) {
          textElem.textContent = "Open any Post or Reel first!";
          setTimeout(() => { textElem.textContent = prevText; }, 3000);
          return;
        }
      }

      stopAutoScroll();
      textElem.textContent = "Extracting & Analyzing...";
      iconElem.className = "s2-loading";

      try {
        if (platform === "instagram") {
          const sc = InstagramEngine.getActiveShortcode();
          if (sc && state.collectedCommentsMap.size < 50) {
            state.isAutoScrolling = true;
            await InstagramEngine.startApiLoop(sc, 10);
            state.isAutoScrolling = false;
          }
        }

        runExtraction();
        const comments = Array.from(state.collectedCommentsMap.values());
        const meta = detectPostIdAndTitle(platform);
        let cleanPostId = meta.postId;
        if (platform === "instagram") {
          cleanPostId = InstagramEngine.getActiveShortcode() || cleanPostId;
        }

        const payload = {
          post_url: window.location.href,
          post_id: cleanPostId,
          title: meta.title,
          platform: platform,
          comments: comments.length > 0 ? comments : [],
          model_option: "vader_hybrid"
        };

        const res = await fetch("http://localhost:8000/api/ingest-browser", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        const finalId = data.post_id || cleanPostId;
        textElem.textContent = `Analyzed (${data.total_valid_comments || comments.length})!`;
        iconElem.className = "s2-icon";
        iconElem.textContent = "✅";

        const dashboardUrl = `http://localhost:3000/?post_id=${encodeURIComponent(finalId)}`;
        try {
          chrome.runtime.sendMessage({ action: "OPEN_DASHBOARD", url: dashboardUrl }, () => {
            if (chrome.runtime.lastError) {
              window.open(dashboardUrl, "_blank");
            }
          });
        } catch (_) {
          window.open(dashboardUrl, "_blank");
        }
      } catch (err) {
        textElem.textContent = "Backend Offline";
        iconElem.className = "s2-icon";
        iconElem.textContent = "⚠️";
        setTimeout(() => {
          textElem.textContent = prevText;
          iconElem.textContent = "⚡";
        }, 3000);
      }
    });

    document.body.appendChild(pill);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectFloatingPill);
  } else {
    injectFloatingPill();
  }
})();
