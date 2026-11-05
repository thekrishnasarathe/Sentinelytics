/**
 * Sentinelytics Chrome/Edge Content Script
 * Extracts live comments and reviews directly from YouTube, Instagram, Flipkart, and Amazon DOM.
 */

(function () {
  if (window.__sentinelytics_injected) return;
  window.__sentinelytics_injected = true;

  let isAutoScrolling = false;
  let scrollInterval = null;
  const collectedCommentsMap = new Map(); // deduplicate by comment_id

  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes("youtube.com")) return "youtube";
    if (host.includes("instagram.com")) return "instagram";
    if (host.includes("flipkart.com")) return "flipkart";
    if (host.includes("amazon.in") || host.includes("amazon.com")) return "amazon";
    return "unsupported";
  }

  function detectPostIdAndTitle(platform) {
    const url = window.location.href;
    let postId = "unknown";
    let title = document.title || "";

    if (platform === "youtube") {
      const match = url.match(/[?&]v=([^&]+)/) || url.match(/\/shorts\/([^?&]+)/);
      if (match) postId = match[1];
      const titleElem = document.querySelector("h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string, h1 yt-formatted-string");
      if (titleElem && titleElem.textContent.trim()) {
        title = titleElem.textContent.trim();
      }
    } else if (platform === "instagram") {
      const match = url.match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
      if (match) postId = match[1];
      const authorElem = document.querySelector("header h2, header a");
      if (authorElem) {
        title = `Instagram Post by @${authorElem.textContent.trim()} (${postId})`;
      } else {
        title = `Instagram Reel / Post (${postId})`;
      }
    } else if (platform === "flipkart") {
      const matchPid = url.match(/pid=([A-Z0-9]+)/i);
      const matchItem = url.match(/\/(?:p|product-reviews)\/([a-zA-Z0-9]+)/);
      postId = matchPid ? matchPid[1] : (matchItem ? matchItem[1] : "flp_item");
      const titleElem = document.querySelector("span.B_NuCI, h1._6EBuvT, span.VU-ZEz, div._2NKhZn");
      if (titleElem && titleElem.textContent.trim()) {
        title = titleElem.textContent.trim();
      }
    } else if (platform === "amazon") {
      const matchAsin = url.match(/\/(?:dp|gp\/product|product-reviews)\/([A-Z0-9]{10})/i);
      if (matchAsin) postId = matchAsin[1];
      const titleElem = document.querySelector("#productTitle, [data-hook='product-link']");
      if (titleElem && titleElem.textContent.trim()) {
        title = titleElem.textContent.trim();
      }
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

  // --- YouTube Extractor ---
  function extractYouTubeComments() {
    const commentNodes = document.querySelectorAll("ytd-comment-view-model, ytd-comment-thread-renderer");
    commentNodes.forEach((node, idx) => {
      const textElem = node.querySelector("#content-text");
      if (!textElem) return;
      const text = textElem.textContent.trim();
      if (!text) return;

      const authorElem = node.querySelector("#author-text span, #author-text");
      const author = authorElem ? authorElem.textContent.trim() : `user_${idx}`;

      const likeElem = node.querySelector("#vote-count-middle");
      let likes = 0;
      if (likeElem) {
        const rawLikes = likeElem.textContent.trim().toUpperCase();
        if (rawLikes.includes("K")) likes = Math.round(parseFloat(rawLikes) * 1000);
        else if (rawLikes.includes("M")) likes = Math.round(parseFloat(rawLikes) * 1000000);
        else likes = parseInt(rawLikes, 10) || 0;
      }

      const timeElem = node.querySelector(".published-time-text a, #header-author yt-formatted-string.published-time-text");
      const timeStr = timeElem ? timeElem.textContent.trim() : "recently";

      const cid = node.getAttribute("id") || `yt_${hashString(author + text)}`;

      if (!collectedCommentsMap.has(cid)) {
        collectedCommentsMap.set(cid, {
          comment_id: cid,
          raw_text: text,
          timestamp: timeStr,
          like_count: likes,
          anonymized_author_id: hashString(author),
        });
      }
    });
  }

  // --- Instagram Extractor ---
  function extractInstagramComments() {
    // Collect from list items or visible comment blocks
    const nodes = document.querySelectorAll("ul._a9ym li, div.x9f619 div.x78zum5 span[dir='auto']");
    nodes.forEach((node, idx) => {
      const text = node.textContent.trim();
      if (!text || text.length < 3) return;
      // Filter out navigation words
      if (["Reply", "See translation", "View more comments", "Liked by"].includes(text)) return;

      const parentLi = node.closest("li") || node.closest("div[role='button']") || node.parentElement;
      const authorElem = parentLi ? parentLi.querySelector("a, h3, span._ap3a") : null;
      const author = authorElem ? authorElem.textContent.trim() : `ig_user_${idx}`;

      const timeElem = parentLi ? parentLi.querySelector("time") : null;
      const timeStr = timeElem ? (timeElem.getAttribute("datetime") || timeElem.textContent.trim()) : "recently";

      const cid = `ig_${hashString(author + text.substring(0, 40))}`;
      if (!collectedCommentsMap.has(cid)) {
        collectedCommentsMap.set(cid, {
          comment_id: cid,
          raw_text: text,
          timestamp: timeStr,
          like_count: 0,
          anonymized_author_id: hashString(author),
        });
      }
    });

    // Auto-click "Load more comments" buttons if found
    const loadMoreButtons = document.querySelectorAll("span[aria-label='Load more comments'], svg[aria-label='Load more comments']");
    loadMoreButtons.forEach((btn) => {
      const clickTarget = btn.closest("button") || btn.parentElement;
      if (clickTarget && clickTarget.click) clickTarget.click();
    });
  }

  // --- Flipkart Extractor ---
  function extractFlipkartReviews(doc = document) {
    const cards = doc.querySelectorAll("div.col.EPCmJX, div.RcXBOT, div._2wzgFH");
    cards.forEach((card, idx) => {
      const titleElem = card.querySelector("p.z9E0IG, p._2-N8zT");
      const bodyElem = card.querySelector("div.ZmyHeo, div.t-ZTKy");
      const titleText = titleElem ? titleElem.textContent.trim() : "";
      const bodyText = bodyElem ? bodyElem.textContent.trim() : "";
      const fullText = (titleText ? titleText + ". " : "") + bodyText;
      if (!fullText) return;

      const ratingElem = card.querySelector("div.XQDdHH, div._3LWZlK");
      let starRating = null;
      if (ratingElem) {
        starRating = parseInt(ratingElem.textContent.trim().split(/\s+/)[0], 10) || null;
      }

      const authorElem = card.querySelector("p._2NsDsF, p._2sc7ZR");
      const author = authorElem ? authorElem.textContent.trim() : `buyer_${idx}`;

      const certElem = card.querySelector("p.MztJPv, p._2mcDuH");
      const isCertified = certElem ? certElem.textContent.includes("Certified Buyer") : false;

      const cid = `flp_${hashString(author + fullText.substring(0, 30))}`;
      if (!collectedCommentsMap.has(cid)) {
        collectedCommentsMap.set(cid, {
          comment_id: cid,
          raw_text: fullText,
          timestamp: new Date().toISOString(),
          like_count: 0,
          anonymized_author_id: hashString(author),
          star_rating: starRating,
          verified_purchase: isCertified,
        });
      }
    });
  }

  // --- Amazon Extractor ---
  function extractAmazonReviews(doc = document) {
    const cards = doc.querySelectorAll("div[data-hook='review']");
    cards.forEach((card, idx) => {
      const titleElem = card.querySelector("a[data-hook='review-title'] span, span[data-hook='review-title'] span");
      const bodyElem = card.querySelector("span[data-hook='review-body'] span");
      const titleText = titleElem ? titleElem.textContent.trim() : "";
      const bodyText = bodyElem ? bodyElem.textContent.trim() : "";
      const fullText = (titleText ? titleText + ". " : "") + bodyText;
      if (!fullText) return;

      const ratingElem = card.querySelector("i[data-hook='review-star-rating'] span.a-icon-alt, i[data-hook='cmps-review-star-rating'] span.a-icon-alt");
      let starRating = null;
      if (ratingElem) {
        const match = ratingElem.textContent.match(/([0-9\.]+)\s+out of/);
        if (match) starRating = Math.round(parseFloat(match[1]));
      }

      const authorElem = card.querySelector("span.a-profile-name");
      const author = authorElem ? authorElem.textContent.trim() : `amz_buyer_${idx}`;

      const verifiedElem = card.querySelector("span[data-hook='avp-badge']");
      const isVerified = verifiedElem ? verifiedElem.textContent.includes("Verified Purchase") : false;

      const timeElem = card.querySelector("span[data-hook='review-date']");
      const timeStr = timeElem ? timeElem.textContent.trim() : new Date().toISOString();

      const cid = card.getAttribute("id") || `amz_${hashString(author + fullText.substring(0, 30))}`;
      if (!collectedCommentsMap.has(cid)) {
        collectedCommentsMap.set(cid, {
          comment_id: cid,
          raw_text: fullText,
          timestamp: timeStr,
          like_count: 0,
          anonymized_author_id: hashString(author),
          star_rating: starRating,
          verified_purchase: isVerified,
        });
      }
    });
  }

  function runExtraction() {
    const platform = detectPlatform();
    if (platform === "youtube") extractYouTubeComments();
    else if (platform === "instagram") extractInstagramComments();
    else if (platform === "flipkart") extractFlipkartReviews();
    else if (platform === "amazon") extractAmazonReviews();
    return collectedCommentsMap.size;
  }

  // --- Auto-Scroll Loop ---
  function startAutoScroll() {
    if (isAutoScrolling) return;
    isAutoScrolling = true;

    scrollInterval = setInterval(() => {
      const platform = detectPlatform();
      runExtraction();

      // Scroll window down smoothly
      window.scrollBy({ top: 900, behavior: "smooth" });

      // Special Instagram comments container scroll if modal is open
      if (platform === "instagram") {
        const scrollContainers = document.querySelectorAll("div.x5yr21d, div[role='dialog'] div.x78zum5");
        scrollContainers.forEach((c) => {
          c.scrollTop += 600;
        });
      }
    }, 1200);
  }

  function stopAutoScroll() {
    isAutoScrolling = false;
    if (scrollInterval) {
      clearInterval(scrollInterval);
      scrollInterval = null;
    }
    runExtraction();
  }

  // --- Authenticated E-Commerce Review Pagination via active browser session ---
  async function fetchNextEcommercePages(numPages = 3) {
    const platform = detectPlatform();
    const currentUrl = window.location.href;

    if (platform === "flipkart") {
      let baseUrl = currentUrl;
      if (baseUrl.includes("/p/")) {
        baseUrl = baseUrl.replace("/p/", "/product-reviews/");
      }
      for (let p = 2; p <= 1 + numPages; p++) {
        try {
          const sep = baseUrl.includes("?") ? "&" : "?";
          const pageUrl = `${baseUrl}${sep}page=${p}`;
          const res = await fetch(pageUrl, { credentials: "include" });
          if (res.ok) {
            const html = await res.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");
            extractFlipkartReviews(doc);
          }
        } catch (e) {
          console.warn("[Sentinelytics] Failed to fetch Flipkart page:", e);
        }
      }
    } else if (platform === "amazon") {
      let matchAsin = currentUrl.match(/\/(?:dp|gp\/product|product-reviews)\/([A-Z0-9]{10})/i);
      if (matchAsin) {
        const asin = matchAsin[1];
        const origin = window.location.origin;
        for (let p = 2; p <= 1 + numPages; p++) {
          try {
            const pageUrl = `${origin}/product-reviews/${asin}?pageNumber=${p}`;
            const res = await fetch(pageUrl, { credentials: "include" });
            if (res.ok) {
              const html = await res.text();
              const parser = new DOMParser();
              const doc = parser.parseFromString(html, "text/html");
              extractAmazonReviews(doc);
            }
          } catch (e) {
            console.warn("[Sentinelytics] Failed to fetch Amazon page:", e);
          }
        }
      }
    }
    return collectedCommentsMap.size;
  }

  // Initial immediate extraction on page load
  runExtraction();

  // Listen for messages from extension popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const platform = detectPlatform();
    const meta = detectPostIdAndTitle(platform);

    if (request.action === "GET_STATUS") {
      runExtraction();
      sendResponse({
        platform,
        postId: meta.postId,
        title: meta.title,
        url: window.location.href,
        count: collectedCommentsMap.size,
        isAutoScrolling,
      });
      return true;
    }

    if (request.action === "START_AUTO_SCROLL") {
      startAutoScroll();
      sendResponse({ status: "started", count: collectedCommentsMap.size });
      return true;
    }

    if (request.action === "STOP_AUTO_SCROLL") {
      stopAutoScroll();
      sendResponse({ status: "stopped", count: collectedCommentsMap.size });
      return true;
    }

    if (request.action === "FETCH_PAGES") {
      fetchNextEcommercePages(request.pages || 3).then((count) => {
        sendResponse({ status: "success", count });
      });
      return true;
    }

    if (request.action === "GET_ALL_COMMENTS") {
      runExtraction();
      const commentsArray = Array.from(collectedCommentsMap.values());
      sendResponse({
        platform,
        postId: meta.postId,
        title: meta.title,
        url: window.location.href,
        comments: commentsArray,
      });
      return true;
    }
  });
})();
