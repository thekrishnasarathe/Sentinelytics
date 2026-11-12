# Sentinelytics — Social Media & E-Commerce Sentiment Intelligence Platform (v3.0)

[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-009688.svg)](https://fastapi.tiangolo.com/)
[![React 19](https://img.shields.io/badge/React-19.0-61DAFB.svg)](https://react.dev/)
[![Tailwind CSS v4](https://img.shields.io/badge/TailwindCSS-4.0-38B2AC.svg)](https://tailwindcss.com/)
[![Vite 8](https://img.shields.io/badge/Vite-8.3-646CFF.svg)](https://vitejs.dev/)
[![Chrome Extension MV3](https://img.shields.io/badge/Extension-Manifest%20V3-4285F4.svg)](https://developer.chrome.com/docs/extensions/mv3/)
[![Tests](https://img.shields.io/badge/Tests-27%20Passed%20(100%25)-success.svg)](https://pytest.org/)

An enterprise-grade, dual-domain sentiment analysis and root-cause diagnostic platform for **Social Media (YouTube, Instagram)** and **E-Commerce (Amazon, Flipkart, Myntra, Meesho, Nykaa, Ajio)**. Built with a **Domain-Adaptive 2-Tier NLP & Sarcasm Engine**, **Hybrid Live/Extension Ingestion**, **SQLite Persistence & Multi-Comparison**, **Obsidian Architectural Dashboard (v3.0)**, and **Sub-Second (<1s) ReportLab PDF and CSV Exporters**.

---

## Key Capabilities (v3.0)

### 1. Multi-Channel & Hybrid Ingestion Architecture
- **Social Media:** YouTube (Data API v3 & keyless `youtube-comment-downloader`) and Instagram (RapidAPI / Graph API / Instaloader + Browser Extension DOM collector fallback).
- **E-Commerce:** Amazon (`amazon.in` / `amazon.com` via direct HTML + RapidAPI metadata hybrid + Apify fallback), Flipkart (`flipkart.com` 2026 `"Verified Purchase"` & legacy card parser), plus universal e-commerce support (Myntra, Meesho, Nykaa, Ajio) with star ratings (1★–5★), verified buyer badges, and SKU variant parsing.
- **Chrome Extension Collector (`browser_extension/`, Manifest V3 v2.2.0):** Isolated platform engines (`Instagram`, `Flipkart`, `Amazon`, `YouTube`) with single-instance state guard, automatic multi-page pagination for Flipkart/Amazon, and direct one-click streaming to `POST /api/ingest-browser`.

### 2. Domain-Adaptive 2-Tier NLP & Polarity Conflict Engine
- **Tier-1 Polarity Scoring:** Positive (`>= 0.05`), Neutral (`-0.05` to `0.05`), Negative (`<= -0.05`).
- **DeepMoji-Style Text–Emoji Conflict & Sarcasm Detection:** Detects polarity clashes where surface positive phrasing pairs with negative/frustrated emojis (and vice versa), flagging sarcastic overrides cleanly (`sarcastic_comments_count`, Forensic Sarcasm Badges).
- **Tier-2 Negative Root-Cause Sub-Tagging (with >70% High-Negative Critical Alert):**
  - **Social Media:**
    1. *Technical / Feature Bugs* (crash, login failure, freeze, broken update, UI glitch)
    2. *Audio / Video / Caption Quality* (audio desync, echo, mic noise, resolution blur, subtitle delay)
    3. *Content Dissatisfaction* (clickbait thumbnail, misleading title, dull pace, time waste)
    4. *Coordinated Spam / Trolls* (hate raids, ratio campaigns, dead channel comments)
  - **E-Commerce:**
    1. *Product Defect / Hardware Quality* (battery drain, heating issue, stopped working, defective screen, poor build)
    2. *Delivery, Packaging & Logistics* (late delivery, courier rude, box crushed, seal broken, missing charger)
    3. *Counterfeit / Wrong Item Received* (fake product, duplicate copy, nakli, wrong color/model, dhoka)
    4. *Value for Money / Pricing & Warranty* (overpriced, paisa barbaad, refund denied, warranty rejected)

### 3. 4-Step Linguistic & Noise Preprocessor
1. **Bot & Spam URL Stripping + Author Deduplication:** Filters promotional URLs, crypto scams, and duplicate comments per hashed author ID (`SHA-256`).
2. **Expressive Emoji-to-Sentiment Mapping:** Anchors unicode emojis (`🔥`, `❤️`, `😍`, `😡`, `😭`, `👎`, `💔`, `🤮`) to explicit polarity weights.
3. **Bilingual Hinglish Normalization:** Normalizes Romanized Hindi phrases (`paisa vasool`, `bilkul nakli`, `battery backup bekar hai`, `zabardast`, `shandar`, `kamaal`, `paisa barbaad`).
4. **Sarcasm & Negation Preservation:** Preserves multi-word negations (`"not working"`, `"won't turn on"`, `"doesn't load"`) and ironic templates (`"great job breaking the UI"`).

### 4. Obsidian Architectural Analytics Dashboard (v3.0)
- **`Ctrl+K` / `⌘K` Command Palette:** Keyboard-driven launcher (`CommandPalette.tsx`) to jump across demo benchmarks, views, settings, and sub-second exports.
- **Sentiment Telemetry Ribbon:** Full-width proportional negative / neutral / positive polarity gauge with compound score indicator and one-click Sarcasm Clash filtering.
- **Cross-Filtering Active Filter Bar:** Click any slice in the Polarity Donut Chart, bar in the Tier-2 Root-Cause Chart, keyword chip, or star-rating bar to cross-filter the paginated Comment Explorer (`50 items/page`), complete with dismissible filter chips and instant client-side **Export Filtered CSV**.
- **4 Interactive Recharts Visualizations:** Polarity Donut Chart with center Net Score KPI, Domain-Adaptive Root-Cause Bar Chart, Normalized Wave Timeline Trend Chart, and Top Keywords / 1★–5★ Rating Distribution Widget.
- **AI Executive Insights & Product Preview Drawer:** Displays executive summaries, top customer pain points, actionable recommendations, confidence/subjectivity meters, and raw feed inspection.
- **History Hub & Multi-Comparison View:** Persists every run in SQLite (`sentiment_module/sentiment_hub.db`) for instant reload and side-by-side target comparison (`POST /api/compare`).
- **React `ErrorBoundary` Recovery:** Safe diagnostic fallback UI (`src/main.tsx`) preventing unhandled exceptions from blanking the screen.
- **Sub-Second Exporters:** Generates ReportLab executive PDFs and normalized CSV reports in **< 0.02s** from pre-computed cache JSON files.

---

## Repository Architecture

```text
social-media-sentiment-analysis-module/
├── sentiment_module/                  # Core Python Package & FastAPI Backend
│   ├── app/
│   │   ├── main.py                    # FastAPI app, REST endpoints, /static & /assets mounts
│   │   ├── schemas.py                 # Pydantic v2 models & flexible field aliases
│   │   ├── extractor.py               # YouTube, Instagram, Amazon, Flipkart & Universal extractors
│   │   ├── preprocessor.py            # 4-step noise, emoji, Hinglish & sarcasm preprocessor
│   │   ├── nlp_engine.py              # Domain-adaptive Tier-1, Tier-2 & conflict NLP engine
│   │   ├── cache_manager.py           # Atomic JSON cache manager (<5ms retrieval)
│   │   ├── history_db.py              # SQLite manager (sentiment_hub.db) for history & comparison
│   │   ├── exporter.py                # Sub-second ReportLab PDF & CSV exporters
│   │   └── static/                    # Production Vite build served by FastAPI (:8000)
│   ├── sample_data/                   # Pre-loaded 1,000+ item offline benchmark datasets
│   │   ├── youtube_flagged_post.json
│   │   ├── amazon_product_reviews.json
│   │   └── flipkart_product_reviews.json
│   ├── tests/
│   │   └── test_pipeline.py           # End-to-end pytest suite (27 tests)
│   ├── cli_batch_runner.py            # CLI benchmark runner across all 4 core platforms
│   ├── cache/                         # Runtime pre-computed JSON caches (gitignored)
│   ├── exports/                       # Runtime PDF & CSV exports (gitignored)
│   └── sentiment_hub.db               # Runtime SQLite history database (gitignored)
├── browser_extension/                 # Chrome Extension (Manifest V3, v2.2.0)
│   ├── manifest.json                  # Permissions & supported social/e-commerce host patterns
│   ├── popup.html                     # Obsidian-themed extension popup UI
│   ├── popup.js                       # Extension popup controller & dashboard push
│   ├── content.js                     # Isolated YouTube/Instagram/Flipkart/Amazon engines
│   ├── content.css                    # Floating collection telemetry badge styles
│   └── background.js                  # Service worker event handling
├── src/                               # React 19 + TypeScript + Tailwind CSS v4 Frontend
│   ├── App.tsx                        # Main command center dashboard
│   ├── main.tsx                       # React entrypoint wrapped with ErrorBoundary
│   ├── types.ts                       # TypeScript interfaces matching FastAPI schemas
│   ├── index.css                      # Tailwind CSS v4 & Obsidian architectural tokens
│   └── components/
│       ├── ActiveFilterBar.tsx        # Cross-chart filter pills & filtered CSV export
│       ├── CommandPalette.tsx         # Ctrl+K / ⌘K modal command launcher
│       ├── EngagementTrendsChart.tsx  # Chronological wave area chart
│       ├── HistoryView.tsx            # SQLite Historical Runs manager
│       ├── LiveInsightsPanel.tsx      # Executive summary, pain points & recommendations
│       ├── MultiComparisonView.tsx    # Side-by-side post/product comparison view
│       ├── PlatformIcons.tsx          # Crisp vector platform SVG icons
│       ├── ProductPreviewDrawer.tsx   # Raw audited comment/review slide-over inspector
│       ├── RootCauseBarChart.tsx      # Interactive horizontal Tier-2 root-cause chart
│       ├── SentimentDonutChart.tsx    # Interactive polarity donut chart with center KPI
│       ├── SentimentTelemetryRibbon.tsx # Full-width proportional telemetry bar
│       └── TopKeywordsWidget.tsx      # Keyword clusters & 1★–5★ distribution tabs
├── docs/                              # Architecture docs & progress logs
│   └── ARCHITECTURE.md
├── .env.example                       # Optional API keys template (copy to .env)
├── .gitignore                         # Excludes .env, node_modules, dist, cache, exports, *.db
├── cli_batch_runner.py                # Root CLI runner wrapper
├── index.html                         # Vite HTML entry with Plus Jakarta Sans & JetBrains Mono
├── package.json                       # React 19, Recharts 3, Lucide Icons, Tailwind v4, Vite 8
├── pytest.ini                         # Pytest configuration
├── requirements.txt                   # FastAPI, Uvicorn, VaderSentiment, ReportLab, Pandas, BS4
├── start.py                           # Unified full-stack launcher & port manager
├── tsconfig.json                      # TypeScript compiler configuration
├── vite.config.ts                     # Vite config with /api proxy to :8000
└── README.md
```

---

## Quickstart & Environment Setup

### 1. Install Backend Dependencies
```bash
pip install -r requirements.txt
```

### 2. Install Frontend Dependencies
```bash
npm install
```

### 3. Optional API Keys (`.env` or In-App Settings Modal)
Copy `.env.example` to `.env` (never commit `.env` to Git) or configure keys at runtime via the **API Keys** button in the dashboard (`POST /api/settings/keys`):
- `YOUTUBE_API_KEY` *(optional)* — Official YouTube Data API v3 key (keyless scraping works automatically as fallback)
- `GEMINI_API_KEY` *(optional)* — Enables `gemini-2.5-flash` deep contextual LLM scoring
- `RAPIDAPI_KEY` *(optional)* — Enables hybrid RapidAPI metadata/comment lookups
- `INSTAGRAM_ACCESS_TOKEN` / `SCRAPER_API_KEY` / `APIFY_API_TOKEN` *(optional)* — Additional cloud extraction providers

---

## Running the Application

### Option A: One-Command Full-Stack Launcher (Recommended)
Starts both the FastAPI backend (`:8000`) and Vite React dev dashboard (`:3000`) with automatic port conflict cleanup and health checks:
```bash
python start.py
```
Supported flags:
- `--no-browser` — Skip auto-opening the browser tab
- `--backend-only` — Start only FastAPI on `--backend-port` (default `8000`)
- `--frontend-only` — Start only Vite on `--frontend-port` (default `3000`)
- `--backend-port PORT` / `--frontend-port PORT` — Override default ports

### Option B: Standalone FastAPI Production Mode
Build the React production bundle and sync it into `sentiment_module/app/static/`, then run Uvicorn:
```bash
npx tsc --noEmit
npm run build
# Copy dist/* into sentiment_module/app/static/ (e.g., PowerShell):
Copy-Item -Path dist\* -Destination sentiment_module\app\static\ -Recurse -Force

uvicorn sentiment_module.app.main:app --host 0.0.0.0 --port 8000
```
- Web Dashboard: `http://localhost:8000`
- Swagger / OpenAPI Docs: `http://localhost:8000/docs`

### Option C: Chrome Extension Installation (Live Browser Session Collector)
1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `browser_extension/` directory.
4. Open any supported YouTube, Instagram, Flipkart, Amazon, Myntra, Meesho, Nykaa, or Ajio page, collect comments/reviews from the extension popup, and click **Send to Dashboard**.

### Option D: Terminal Batch Runner & Latency Benchmark
Pre-compute benchmark caches across all 4 core platforms:
```bash
python sentiment_module/cli_batch_runner.py
```
Verified benchmark output:
- Processed **4 platforms (4,500+ raw items)** in **1.31s** total runtime.
- Sub-second exports verified on all 4 caches: **CSV in `0.0015s–0.0156s`**, **PDF in `0.0101s–0.0131s`**.

---

## Running the Automated Test Suite

Execute all 27 unit & FastAPI integration tests:
```bash
python -m pytest sentiment_module/tests -v
```
Verified coverage (**27 passed, 100%**):
- 4-step spam/bot filtering, author deduplication, ISO-8601 timestamp normalization
- Bilingual Hinglish classification & DeepMoji-style text–emoji conflict sarcasm detection
- Domain-adaptive Tier-2 root-cause diagnostics & 1★–5★ star rating distributions
- Live HTML parsing for Flipkart 2026 `"Verified Purchase"` review cards & anti-JSON-fragment guards
- Uncapped pagination & blocked-extractor fallback handling
- FastAPI endpoints: `/api/analyze`, `/api/ingest-browser` (with flexible field aliases), `/api/analyze-quick`, `/api/compare`, `/api/history`, `/api/settings/keys`, and sub-second `/api/export/{post_id}/csv|pdf`

You can also run TypeScript verification on the frontend:
```bash
npx tsc --noEmit
npm run build
```

---

## REST API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/` | `GET` | Serves the production React dashboard from `sentiment_module/app/static/index.html` |
| `/assets/*` & `/static/*` | `GET` | Serves bundled JS/CSS static assets |
| `/api/analyze` | `POST` | Runs URL/ID detection, extraction waterfall, 4-step preprocessing, 2-tier NLP, cache & SQLite save |
| `/api/ingest-browser` | `POST` | Ingests raw comments/reviews scraped live by the Chrome Extension and computes full analytics |
| `/api/analyze-quick` | `POST` | Runs rapid sentiment + sarcasm scoring on pasted text/comment arrays |
| `/api/instagram/rapidapi` | `POST` | Dedicated RapidAPI + fallback ingestion route for Instagram posts/reels |
| `/api/amazon/rapidapi` | `POST` | Dedicated RapidAPI + direct HTML hybrid ingestion route for Amazon ASINs |
| `/api/report/{post_id}` | `GET` | Retrieves a cached `CachedReport` JSON (`< 5ms`) or executes pipeline if uncached |
| `/api/export/{post_id}/csv` | `GET` | Streams multi-table normalized CSV report (`< 1s` SLA) |
| `/api/export/{post_id}/pdf` | `GET` | Streams ReportLab executive PDF summary (`< 1s` SLA) |
| `/api/posts` | `GET` | Lists cached analyzed `post_id` entries |
| `/api/history` | `GET` | Returns historical analysis summaries persisted in SQLite `sentiment_hub.db` |
| `/api/history/{post_id}` | `DELETE` | Deletes a historical analysis entry from SQLite |
| `/api/compare` | `POST` | Side-by-side comparison (`report_a`, `report_b`, polarity deltas, and winner) |
| `/api/settings/keys` | `GET` / `POST` | Inspects masked key status or updates runtime API keys in memory and `.env` |
| `/health` | `GET` | Service health check returning status and UTC timestamp |

---

## Pushing Changes to GitHub

`.gitignore` automatically excludes `.env`, `node_modules/`, `dist/`, runtime `cache/`, `exports/`, and `*.db` files. To commit and push updates cleanly:

```powershell
git add .
git commit -m "docs: update README for Sentinelytics v3.0, browser extension, and 27 passing tests"
git push origin main
```

---

## License
Apache License 2.0.
