# Daily Engineering Log — 3 Nov 2026

## 1. Milestone Overview: Live Multi-Channel Extractors & UI Glitch Resolution

Today's focus was upgrading the prototype into a fully live, multi-channel sentiment analysis platform with real scrapers, runtime API key management, and resolving the critical UI glitching issue reported in the screen recording.

---

## 2. Root Cause Analysis & Fix: UI Glitching / Infinite Reload Loop

### Symptoms Observed:
- Screen recording (`Recording_2026-11-03_101846.mp4`) revealed the "Scrape & Analyze" action button repeatedly flickering between `"Scraping Live Comments..."` and `"Scrape & Analyze URL"`.
- The dashboard below the input form remained an empty void and never stabilized.
- Server logs showed continuous pairs of `POST /api/analyze` and `GET /api/settings/keys` executing in rapid succession.

### Root Causes Identified:
1. **Vite File Watcher Infinite Loop**:
   - Vite was running with `watch: {}`, monitoring all files in the workspace root.
   - Every time `/api/analyze` processed a request, it atomically saved the report to `sentiment_module/cache/<post_id>.json`.
   - Vite detected the cache file modification and issued a WebSocket `page reload` signal to the browser.
   - The browser reloaded `http://localhost:3000/`, which fired the `useEffect` mount hook to run the default demo analysis, saving to cache again and triggering an infinite loop.
2. **Missing Defensive Property Checks**:
   - Certain properties (`report.breakdown.find`, `report.tier2_root_causes.map`, `report.sample_comments.length`) lacked optional chaining (`?.`), causing render errors if any section of the cache was partially formed.
3. **Empty Black Void & Race Conditions**:
   - While `isLoading` was true before `report` populated, there was no placeholder skeleton, creating a jarring blank screen.
   - In-flight requests lacked abort controllers, allowing stale responses to overwrite newer requests.

### Engineering Solutions Implemented:
1. **Configured `watch.ignored` in `vite.config.ts`**:
   - Explicitly excluded `**/sentiment_module/**`, `**/sample_data/**`, `**/cache/**`, `**/exports/**`, `**/.env*`, `**/*.py`, `**/*.json`, `**/*.csv`, and `**/*.pdf` from Vite's watcher. Vite now strictly monitors frontend source files (`src/`).
2. **Safe Fetching & Concurrency Controls in `src/App.tsx`**:
   - Integrated `abortRef = useRef<AbortController | null>(null)` to automatically cancel previous in-flight requests upon new actions.
   - Added `isDemoAction` state to display accurate messaging (`"Loading Demo Benchmark..."` vs `"Scraping Live Comments..."`).
   - Built a sleek animated loading skeleton with KPI placeholders to provide immediate visual feedback.
   - Added comprehensive defensive optional chaining across all report metrics, charts, and audited comment lists.

---

## 3. Live Multi-Channel Ingestion Architecture

### Channel Implementations:
- **YouTube**:
  - Primary: Official YouTube Data API v3 using user-provided API key.
  - Fallback: Key-free live scraping via `youtube-comment-downloader` (zero API quota consumption).
- **Instagram**:
  - Tier 1: Instagram Graph API via user access token.
  - Tier 2: Apify Cloud Scraper (`apify/instagram-comment-scraper`) fallback.
  - Tier 3: Instaloader direct public fallback.
- **Amazon & Flipkart**:
  - Direct multi-page HTML parsing using `httpx` + `BeautifulSoup` with verified buyer and star rating extraction.
  - Graceful fallback chain with honest UI notifications when blocked by anti-bot CAPTCHAs.
- **Smart URL Parser**:
  - Auto-extracts YouTube video IDs, Instagram shortcodes, Amazon ASINs, and Flipkart FSNs from pasted URLs.

---

## 4. Verification & Testing

- **Automated Test Suite**: 13/13 pytest tests passing (`sentiment_module/tests/test_pipeline.py` & `tests/test_pipeline.py`).
- **Frontend Build**: `npm run build` completed cleanly in 432ms with 0 errors.
- **Live Services**:
  - FastAPI running on `http://127.0.0.1:8000` (serving `/api/analyze`, `/api/settings/keys`, `/api/export`).
  - Vite React frontend running on `http://localhost:3000`.

