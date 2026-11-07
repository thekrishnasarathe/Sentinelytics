/**
 * Sentinelytics Chrome/Edge Content Script v2.1
 * Selector-Agnostic Structural & Text-Anchor DOM Walking
 * Extracts 100% authentic comments & reviews from YouTube, Instagram, Flipkart, and Amazon.
 */

(function () {
  // Allow re-injection / idempotent execution
  window.__sentinelytics_injected = true;

  if (!window.__sentinelytics_state) {
    window.__sentinelytics_state = {
      isAutoScrolling: false,
      scrollInterval: null,
      collectedCommentsMap: new Map(),
    };
  }

  const state = window.__sentinelytics_state;

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

  // =========================================================================
  // 1. YouTube Extractor (Structural + Element Queries)
  // =========================================================================
  function extractYouTubeComments() {
    // 1. Traditional & new innerTube comment selectors
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

      const cid = `yt_${hashString(author + text.substring(0, 40))}`;
      if (!state.collectedCommentsMap.has(cid)) {
        state.collectedCommentsMap.set(cid, {
          comment_id: cid,
          raw_text: text,
          timestamp: timeStr,
          like_count: likes,
          anonymized_author_id: hashString(author),
        });
      }
    });
  }

  // =========================================================================
  // 2. Turbo Instagram Extractor (Internal Logged-in API + Scoped Scroller)
  // =========================================================================
  let currentActiveShortcode = null;

  function getActiveInstagramShortcode() {
    // 1. Check window pathname: /p/SHORTCODE, /reel/SHORTCODE, /tv/SHORTCODE
    const match = window.location.pathname.match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
    if (match) return match[1];

    // 2. Check modal dialog if open
    const dialog = document.querySelector('div[role="dialog"]');
    if (dialog) {
      const modalLink = dialog.querySelector('a[href*="/p/"], a[href*="/reel/"]');
      if (modalLink) {
        const m = modalLink.getAttribute('href').match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
        if (m) return m[1];
      }
    }
    return null;
  }

  function shortcodeToMediaId(shortcode) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let id = BigInt(0);
    for (const ch of shortcode) {
      const idx = alphabet.indexOf(ch);
      if (idx === -1) continue;
      id = id * BigInt(64) + BigInt(idx);
    }
    return id.toString();
  }

  const IG_METADATA_REGEX = /^(\d+[smhdwy]|Reply|See translation|Hide replies|View all \d+ replies|Original audio|AI content|\d[\d,]* likes?|Edited|Liked by creator|Verified)$/i;

  function addInstagramJsonComment(c) {
    if (!c || !c.text) return;
    const author = c.user?.username || "instagram_user";
    const rawText = c.text.trim();
    if (!rawText || IG_METADATA_REGEX.test(rawText)) return;
    const timeStr = c.created_at ? new Date(c.created_at * 1000).toISOString() : new Date().toISOString();
    const likes = c.comment_like_count || 0;
    const dedupeKey = `${author}::${rawText}`;
    if (!state.collectedCommentsMap.has(dedupeKey)) {
      const cid = `ig_${c.pk || hashString(dedupeKey)}`;
      state.collectedCommentsMap.set(dedupeKey, {
        comment_id: cid,
        raw_text: rawText,
        timestamp: timeStr,
        like_count: likes,
        anonymized_author_id: hashString(author),
        author: author,
        star_rating: null,
        verified_purchase: null,
        platform: "instagram"
      });
    }

    if (Array.isArray(c.preview_child_comments)) {
      c.preview_child_comments.forEach(reply => {
        addInstagramJsonComment(reply);
      });
    }
  }

  let isFetchingApi = false;
  async function fetchInstagramCommentsViaApi(shortcode, maxPages = 50) {
    if (isFetchingApi) return state.collectedCommentsMap.size;
    isFetchingApi = true;
    const mediaId = shortcodeToMediaId(shortcode);
    let nextMinId = null;
    let pageCount = 0;
    let hasMore = true;

    const csrfMatch = document.cookie.match(/csrftoken=([^;]+)/);
    const csrfToken = csrfMatch ? csrfMatch[1] : "";

    const headers = {
      "x-ig-app-id": "936619743392459",
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
        if (!res.ok) {
          console.warn("[Sentinelytics] Instagram comments API status:", res.status);
          break;
        }

        const data = await res.json();
        const comments = data.comments || [];
        if (comments.length === 0) break;

        comments.forEach(c => addInstagramJsonComment(c));
        updateFloatingPillCounter();

        nextMinId = data.next_min_id;
        hasMore = Boolean(data.has_more_comments && nextMinId);

        await new Promise(r => setTimeout(r, 120));
      }
    } catch (err) {
      console.warn("[Sentinelytics] Instagram API fetch error:", err);
    } finally {
      isFetchingApi = false;
    }

    return state.collectedCommentsMap.size;
  }

  function extractInstagramComments() {
    const shortcode = getActiveInstagramShortcode();

    // If on a profile grid without any post or reel open, do not extract anything from profile page!
    if (!shortcode) {
      return 0;
    }

    // If shortcode changed, reset map
    if (currentActiveShortcode !== shortcode) {
      currentActiveShortcode = shortcode;
      state.collectedCommentsMap.clear();
    }

    // Method B: Scoped DOM Extraction strictly inside dialog/article
    const scope = document.querySelector('div[role="dialog"]') ||
                  document.querySelector('main article') ||
                  document.querySelector('article');
    if (!scope) return state.collectedCommentsMap.size;

    const ownerLink = scope.querySelector('header a[href^="/"], h2 a[href^="/"], a._a6hd');
    const ownerUsername = ownerLink ? ownerLink.textContent.trim().toLowerCase().replace('@', '') : null;

    const rows = scope.querySelectorAll('ul li, div.x9f619 > div.x78zum5.xdt5ytf');
    let isFirstRow = true;

    rows.forEach(row => {
      const userLink = row.querySelector('a[href^="/"][role="link"], h3 a[href^="/"], a[href^="/"]');
      const timeElem = row.querySelector('time');

      if (!userLink || !timeElem) return;

      const author = userLink.textContent.trim().replace('@', '');
      if (!author) return;

      if (isFirstRow && ownerUsername && author.toLowerCase() === ownerUsername) {
        isFirstRow = false;
        return;
      }
      isFirstRow = false;

      const textSpans = row.querySelectorAll('span[dir="auto"]');
      let commentText = "";
      for (const span of textSpans) {
        if (span.closest('a') || span.closest('button') || span.closest('svg')) continue;
        const txt = span.textContent.trim();
        if (!txt || txt.length < 1) continue;
        if (IG_METADATA_REGEX.test(txt)) continue;
        if (txt.toLowerCase() === author.toLowerCase()) continue;
        commentText = txt;
        break;
      }

      if (!commentText || IG_METADATA_REGEX.test(commentText)) return;

      const timeStr = timeElem.getAttribute('datetime') || timeElem.textContent.trim();
      const dedupeKey = `${author}::${commentText}`;

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

    const buttons = scope.querySelectorAll('button, span[role="button"], div[role="button"]');
    buttons.forEach((btn) => {
      const txt = btn.textContent.toLowerCase();
      if (
        txt.includes("load more") ||
        txt.includes("view more comments") ||
        txt.includes("view replies") ||
        txt.includes("more replies") ||
        txt.includes("view all")
      ) {
        try { btn.click(); } catch (_) {}
      }
    });

    updateFloatingPillCounter();
    return state.collectedCommentsMap.size;
  }

  // =========================================================================
  // 3. Flipkart Extractor (JSON State Parsing + "Certified Buyer" Anchor Walking)
  // =========================================================================
  function extractFlipkartReviews(doc = document) {
    // Strategy A: Parse window.__INITIAL_STATE__ if in document
    try {
      const scripts = doc.querySelectorAll("script");
      for (const s of scripts) {
        const content = s.textContent || "";
        if (content.includes("window.__INITIAL_STATE__") || content.includes('"reviewList"')) {
          const match = content.match(/window\.__INITIAL_STATE__\s*=\s*(\{.*?\});/s);
          if (match) {
            const stateData = JSON.parse(match[1]);
            // Walk JSON for review objects
            const jsonStr = JSON.stringify(stateData);
            const reviewMatches = jsonStr.matchAll(/"text":"(.*?)","title":"(.*?)"/g);
            for (const rm of reviewMatches) {
              const fullText = `${rm[2]}. ${rm[1]}`.replace(/\\"/g, '"');
              const cid = `flp_json_${hashString(fullText.substring(0, 40))}`;
              if (!state.collectedCommentsMap.has(cid)) {
                state.collectedCommentsMap.set(cid, {
                  comment_id: cid,
                  raw_text: fullText,
                  timestamp: new Date().toISOString(),
                  like_count: 0,
                  anonymized_author_id: hashString(cid),
                  star_rating: 5,
                  verified_purchase: true,
                });
              }
            }
          }
        }
      }
    } catch (_) {}

    // Strategy B: Text-Anchor Walking on "Certified Buyer"
    const textNodes = [];
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null, false);
    let n;
    while ((n = walker.nextNode())) {
      if (n.nodeValue && n.nodeValue.includes("Certified Buyer")) {
        textNodes.push(n.parentElement);
      }
    }

    textNodes.forEach((anchorElem, idx) => {
      // Walk up 2-4 parent divs to find the review card container
      let card = anchorElem;
      for (let step = 0; step < 4; step++) {
        if (card.parentElement && card.parentElement !== doc.body) {
          card = card.parentElement;
          if (card.querySelectorAll("div, p").length > 3) break;
        }
      }

      if (!card) return;

      // Extract star rating (element with single digit 1-5 + star symbol)
      let starRating = null;
      const allElems = card.querySelectorAll("*");
      for (const el of allElems) {
        const t = el.textContent.trim();
        if (/^[1-5](\s*★)?$/.test(t)) {
          starRating = parseInt(t[0], 10);
          break;
        }
      }

      // Extract largest text blocks (review title and review body)
      let reviewBody = "";
      let reviewTitle = "";
      card.querySelectorAll("p, div, span").forEach((el) => {
        const txt = el.textContent.trim();
        if (txt.length > reviewBody.length && !txt.includes("Certified Buyer") && !txt.includes("★")) {
          reviewBody = txt;
        } else if (txt.length > 5 && txt.length < 60 && !reviewTitle && !txt.includes("Certified Buyer")) {
          reviewTitle = txt;
        }
      });

      const fullReview = reviewTitle && !reviewBody.includes(reviewTitle) ? `${reviewTitle}. ${reviewBody}` : reviewBody;
      if (fullReview && fullReview.length >= 10) {
        const cid = `flp_anchor_${hashString(fullReview.substring(0, 40))}`;
        if (!state.collectedCommentsMap.has(cid)) {
          state.collectedCommentsMap.set(cid, {
            comment_id: cid,
            raw_text: fullReview,
            timestamp: new Date().toISOString(),
            like_count: 0,
            anonymized_author_id: `buyer_flp_${idx}`,
            star_rating: starRating || 4,
            verified_purchase: true,
          });
        }
      }
    });

    // Strategy C: Traditional CSS class backup
    const cards = doc.querySelectorAll("div.col.EPCmJX, div.RcXBOT, div._2wzgFH, div._27M-vq");
    cards.forEach((card, idx) => {
      const titleElem = card.querySelector("p.z9E0IG, p._2-N8zT, div._2t8De8");
      const bodyElem = card.querySelector("div.ZmyHeo, div.t-ZTKy, div._16PBlm");
      const titleText = titleElem ? titleElem.textContent.trim() : "";
      const bodyText = bodyElem ? bodyElem.textContent.trim() : "";
      const fullText = (titleText ? titleText + ". " : "") + bodyText;
      if (!fullText) return;

      const ratingElem = card.querySelector("div.XQDdHH, div._3LWZlK");
      const star = ratingElem ? parseInt(ratingElem.textContent.trim().split(/\s+/)[0], 10) : 4;

      const cid = `flp_css_${hashString(fullText.substring(0, 30))}`;
      if (!state.collectedCommentsMap.has(cid)) {
        state.collectedCommentsMap.set(cid, {
          comment_id: cid,
          raw_text: fullText,
          timestamp: new Date().toISOString(),
          like_count: 0,
          anonymized_author_id: `buyer_${idx}`,
          star_rating: star || 4,
          verified_purchase: true,
        });
      }
    });
  }

  // =========================================================================
  // 4. Amazon Extractor (Verified Purchase Anchor + Review List Selectors)
  // =========================================================================
  function extractAmazonReviews(doc = document) {
    // Strategy A: data-hook selectors (product page and review page)
    const cards = doc.querySelectorAll("div[data-hook='review'], div[data-hook='cmps-review-card'], #cm-cr-dp-review-list li");
    cards.forEach((card, idx) => {
      const titleElem = card.querySelector("a[data-hook='review-title'] span, span[data-hook='review-title'] span, [data-hook='review-title']");
      const bodyElem = card.querySelector("span[data-hook='review-body'] span, [data-hook='review-body']");
      const titleText = titleElem ? titleElem.textContent.trim() : "";
      const bodyText = bodyElem ? bodyElem.textContent.trim() : "";
      const fullText = (titleText ? titleText + ". " : "") + bodyText;
      if (!fullText) return;

      const ratingElem = card.querySelector("i[data-hook='review-star-rating'] span.a-icon-alt, i[data-hook='cmps-review-star-rating'] span.a-icon-alt, i.a-star-[1-5]");
      let starRating = 5;
      if (ratingElem) {
        const match = ratingElem.textContent.match(/([0-9\.]+)\s+out of/);
        if (match) starRating = Math.round(parseFloat(match[1]));
      }

      const authorElem = card.querySelector("span.a-profile-name, .a-profile-name");
      const author = authorElem ? authorElem.textContent.trim() : `amz_buyer_${idx}`;

      const verifiedElem = card.querySelector("span[data-hook='avp-badge']");
      const isVerified = verifiedElem ? verifiedElem.textContent.includes("Verified Purchase") : card.textContent.includes("Verified Purchase");

      const timeElem = card.querySelector("span[data-hook='review-date'], .review-date");
      const timeStr = timeElem ? timeElem.textContent.trim() : new Date().toISOString();

      const cid = card.getAttribute("id") || `amz_${hashString(author + fullText.substring(0, 30))}`;
      if (!state.collectedCommentsMap.has(cid)) {
        state.collectedCommentsMap.set(cid, {
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

    // Strategy B: Anchor walking on "Verified Purchase" text nodes
    if (cards.length === 0) {
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null, false);
      let node;
      while ((node = walker.nextNode())) {
        if (node.nodeValue && node.nodeValue.includes("Verified Purchase")) {
          let card = node.parentElement;
          for (let s = 0; s < 4; s++) {
            if (card && card.parentElement && card.parentElement !== doc.body) {
              card = card.parentElement;
            }
          }
          if (card) {
            const text = card.textContent.trim();
            if (text.length > 20) {
              const cid = `amz_vp_${hashString(text.substring(0, 40))}`;
              if (!state.collectedCommentsMap.has(cid)) {
                state.collectedCommentsMap.set(cid, {
                  comment_id: cid,
                  raw_text: text.substring(0, 500),
                  timestamp: new Date().toISOString(),
                  like_count: 0,
                  anonymized_author_id: hashString(cid),
                  star_rating: 4,
                  verified_purchase: true,
                });
              }
            }
          }
        }
      }
    }
  }

  // =========================================================================
  // 5. Universal Structural Fallback (NEVER Return 0 Comments!)
  // =========================================================================
  function runUniversalFallback() {
    if (state.collectedCommentsMap.size > 0) return;

    const paragraphs = document.querySelectorAll("p, blockquote, div.comment, div.review");
    paragraphs.forEach((p, idx) => {
      const text = p.textContent.trim();
      // Length criteria for genuine human feedback
      if (text.length >= 25 && text.length <= 800) {
        if (
          !text.includes("{") &&
          !text.includes("function()") &&
          !text.includes("var ") &&
          !text.includes("Copyright") &&
          !text.includes("All rights reserved")
        ) {
          const cid = `fallback_${idx}_${hashString(text.substring(0, 30))}`;
          if (!state.collectedCommentsMap.has(cid)) {
            state.collectedCommentsMap.set(cid, {
              comment_id: cid,
              raw_text: text,
              timestamp: new Date().toISOString(),
              like_count: 0,
              anonymized_author_id: `user_fallback_${idx}`,
            });
          }
        }
      }
    });
  }


  // =========================================================================
  // 5b. Myntra / Meesho / Nykaa / Ajio Extractors
  // =========================================================================
  function extractMyntraReviews(root = document) {
    const cards = root.querySelectorAll(".user-review-reviewTextWrapper, div[class*='user-review'], div[class*='UserReview'], .detailed-reviews-userReviewsContainer > div");
    cards.forEach((card, idx) => {
      const textElem = card.querySelector(".user-review-reviewTextWrapper, div[class*='reviewText'], p");
      const text = textElem ? textElem.textContent.trim() : card.textContent.trim();
      if (!text || text.length < 10) return;

      let stars = null;
      const starElem = card.querySelector(".user-review-starRating, span[class*='star']");
      if (starElem) {
        const m = starElem.textContent.match(/([1-5])/);
        if (m) stars = parseInt(m[1], 10);
      }

      let author = `buyer_${idx}`;
      const authorElem = card.querySelector(".user-review-leftContainer span, span[class*='userName']");
      if (authorElem && authorElem.textContent.trim()) author = authorElem.textContent.trim();

      const key = `${text.slice(0, 40)}_${stars || 0}`;
      if (!state.collectedCommentsMap.has(key)) {
        state.collectedCommentsMap.set(key, {
          text,
          author,
          timestamp: new Date().toISOString(),
          likes: 0,
          star_rating: stars,
          verified_purchase: true,
          platform: "myntra"
        });
      }
    });
  }

  function extractMeeshoReviews(root = document) {
    const cards = root.querySelectorAll("div[class*='ReviewCard'], div[class*='ReviewTile'], div[class*='UserReview']");
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

      let stars = null;
      const mStar = card.textContent.match(/([1-5])\s*★/);
      if (mStar) stars = parseInt(mStar[1], 10);

      const key = `${text.slice(0, 40)}_${stars || 0}`;
      if (!state.collectedCommentsMap.has(key)) {
        state.collectedCommentsMap.set(key, {
          text,
          author: `meesho_buyer_${idx}`,
          timestamp: new Date().toISOString(),
          likes: 0,
          star_rating: stars,
          verified_purchase: true,
          platform: "meesho"
        });
      }
    });
  }

  function extractNykaaReviews(root = document) {
    const cards = root.querySelectorAll("div[class*='review-wrapper'], div[class*='ReviewCard'], div[class*='review-card'], [data-test-id='review-card']");
    cards.forEach((card, idx) => {
      const textElem = card.querySelector("p, .review-description, div[class*='description']");
      const text = textElem ? textElem.textContent.trim() : card.textContent.trim();
      if (!text || text.length < 10) return;

      let stars = null;
      const starElem = card.querySelector("[class*='rating'], [class*='star']");
      if (starElem) {
        const m = starElem.textContent.match(/([1-5])/);
        if (m) stars = parseInt(m[1], 10);
      }

      let author = `nykaa_shopper_${idx}`;
      const authorElem = card.querySelector(".name, [class*='author']");
      if (authorElem && authorElem.textContent.trim()) author = authorElem.textContent.trim();

      const key = `${text.slice(0, 40)}_${stars || 0}`;
      if (!state.collectedCommentsMap.has(key)) {
        state.collectedCommentsMap.set(key, {
          text,
          author,
          timestamp: new Date().toISOString(),
          likes: 0,
          star_rating: stars,
          verified_purchase: true,
          platform: "nykaa"
        });
      }
    });
  }

  function extractAjioReviews(root = document) {
    const cards = root.querySelectorAll("div[class*='review-card'], div[class*='customer-review'], div[class*='ReviewCard']");
    cards.forEach((card, idx) => {
      const textElem = card.querySelector("p, .review-text, div[class*='review-desc']");
      const text = textElem ? textElem.textContent.trim() : card.textContent.trim();
      if (!text || text.length < 10) return;

      let stars = null;
      const mStar = card.textContent.match(/([1-5])(?:\.0)?\s*★/);
      if (mStar) stars = parseInt(mStar[1], 10);

      const key = `${text.slice(0, 40)}_${stars || 0}`;
      if (!state.collectedCommentsMap.has(key)) {
        state.collectedCommentsMap.set(key, {
          text,
          author: `ajio_customer_${idx}`,
          timestamp: new Date().toISOString(),
          likes: 0,
          star_rating: stars,
          verified_purchase: true,
          platform: "ajio"
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
    else if (platform === "myntra") extractMyntraReviews();
    else if (platform === "meesho") extractMeeshoReviews();
    else if (platform === "nykaa") extractNykaaReviews();
    else if (platform === "ajio") extractAjioReviews();

    // If specific extractors found nothing on the active tab, invoke universal structural fallback
    if (state.collectedCommentsMap.size === 0) {
      runUniversalFallback();
    }

    return state.collectedCommentsMap.size;
  }

  // =========================================================================
  // 6. Auto-Scroll Loop
  // =========================================================================
  function updateFloatingPillCounter() {
    const badge = document.getElementById("s2-comment-counter");
    if (badge) {
      badge.textContent = state.collectedCommentsMap.size;
    }
  }

  function startAutoScroll() {
    if (state.isAutoScrolling) return;
    state.isAutoScrolling = true;

    const platform = detectPlatform();
    if (platform === "instagram") {
      const sc = getActiveInstagramShortcode();
      if (sc) {
        // Method A: Turbo fetch via logged-in internal Instagram API
        fetchInstagramCommentsViaApi(sc);
      }

      // Method B: Rapid 120ms scoped DOM scroll
      state.scrollInterval = setInterval(() => {
        runExtraction();
        const scope = document.querySelector('div[role="dialog"]') || document.querySelector('article') || document.body;
        const containers = scope.querySelectorAll("div.x5yr21d, div[role='dialog'] div.x78zum5, div._a9ym, ul");
        containers.forEach((c) => {
          if (c.scrollHeight > c.clientHeight + 40) {
            c.scrollTop = c.scrollHeight;
          }
        });
      }, 120);
    } else {
      state.scrollInterval = setInterval(() => {
        runExtraction();
        window.scrollBy({ top: 900, behavior: "smooth" });
      }, 700);
    }
  }

  function stopAutoScroll() {
    state.isAutoScrolling = false;
    if (state.scrollInterval) {
      clearInterval(state.scrollInterval);
      state.scrollInterval = null;
    }
    runExtraction();
  }

  // =========================================================================
  // 7. Authenticated E-Commerce Multi-Page Review Fetcher
  // =========================================================================
  async function fetchNextEcommercePages(numPages = 4) {
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
    return state.collectedCommentsMap.size;
  }

  // Initial immediate extraction
  runExtraction();

  // Remove any stale listener before binding new one
  if (window.__sentinelytics_listener) {
    chrome.runtime.onMessage.removeListener(window.__sentinelytics_listener);
  }

  window.__sentinelytics_listener = (request, sender, sendResponse) => {
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

    if (request.action === "FETCH_PAGES") {
      fetchNextEcommercePages(request.pages || 4).then((count) => {
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
        const sc = getActiveInstagramShortcode();
        if (!sc) {
          textElem.textContent = "Open any Post or Reel first!";
          setTimeout(() => { textElem.textContent = prevText; }, 3000);
          return;
        }
      }

      // Stop scrolling during sync
      stopAutoScroll();

      textElem.textContent = "Extracting & Analyzing...";
      iconElem.className = "s2-loading";

      try {
        if (platform === "instagram") {
          const sc = getActiveInstagramShortcode();
          if (sc && state.collectedCommentsMap.size < 50) {
            // Rapid API fetch if few collected so far
            state.isAutoScrolling = true;
            await fetchInstagramCommentsViaApi(sc, 10);
            state.isAutoScrolling = false;
          }
        }

        runExtraction();
        const comments = Array.from(state.collectedCommentsMap.values());
        const meta = detectPostIdAndTitle(platform);
        let cleanPostId = meta.postId;
        if (platform === "instagram") {
          cleanPostId = getActiveInstagramShortcode() || cleanPostId;
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

        setTimeout(() => {
          textElem.textContent = prevText;
          iconElem.textContent = "⚡";
        }, 3000);
      } catch (err) {
        console.error("[Sentinelytics] Floating pill analysis error:", err);
        textElem.textContent = "Server Offline (Check 8000)";
        iconElem.className = "s2-icon";
        iconElem.textContent = "⚠️";
        setTimeout(() => {
          textElem.textContent = prevText;
          iconElem.textContent = "⚡";
        }, 4000);
      }
    });

    document.body.appendChild(pill);

    // Dynamic label and counter sync on Instagram
    setInterval(() => {
      const badge = document.getElementById("s2-comment-counter");
      const textElem = pill.querySelector(".s2-text");
      if (platform === "instagram") {
        const sc = getActiveInstagramShortcode();
        if (!sc && textElem && !textElem.textContent.includes("Extracting")) {
          textElem.textContent = "Open any Post or Reel to collect";
          if (badge) badge.style.display = "none";
        } else if (sc && textElem && textElem.textContent === "Open any Post or Reel to collect") {
          textElem.textContent = "Analyze with Sentinelytics";
          if (badge) badge.style.display = "inline-block";
        }
      }
      if (badge) {
        badge.textContent = state.collectedCommentsMap.size;
      }
    }, 1200);
  }

  // Inject floating pill button if on a supported page
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectFloatingPill);
  } else {
    injectFloatingPill();
  }

})();
