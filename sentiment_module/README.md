# Social Media Sentiment & Root-Cause Analysis Module

A production-ready NLP comment sentiment and root-cause analysis pipeline for YouTube and Instagram.

## Key Capabilities
- **Tier-1 Polarity Scoring:** Classifies comments into **Positive** (`>= 0.05`), **Neutral** (`-0.05` to `0.05`), and **Negative** (`<= -0.05`).
- **2-Tier Deep Dive for Flagged Uploads:** Automatically detects when negative sentiment exceeds **70.0%** (`high_negative_alert=True`) and sub-tags all negative comments into 4 actionable root causes:
  1. *Technical / Feature Bugs* (crash, login failure, freeze, broken update, UI glitch)
  2. *Audio / Video / Caption Quality* (audio sync, echo, mic noise, resolution blur, subtitle desync)
  3. *Content Dissatisfaction* (clickbait, misleading thumbnail, boring pace, time waste)
  4. *Coordinated Spam / Trolls* (hate raids, ratio campaigns, dead channel comments)
- **4-Step Linguistic Preprocessing:**
  1. *Spam & Bot URL Removal & Author Deduplication* (rejects promotional links, crypto spam, and repeated comments from identical author hashes).
  2. *Expressive Emoji-to-Text Mapping* (converts emojis like 🔥, ❤️, 😡, 😭, 👎, 💔 into polarity anchor tokens before cleanup).
  3. *Hinglish & Code-Mixing Lexicon* (maps Romanized Hindi tokens like `mast`, `sahi`, `zabardast`, `bekar`, `ghatiya`, `bakwas`, `faltu`).
  4. *Sarcasm & Negation Preservation* (detects sarcastic templates like *"great job breaking the UI"* and inverts negation phrases like *"not working after login"* to strongly negative).
- **Sub-Second (<1s) PDF & CSV Exporters:**
  - Pre-computes post summaries asynchronously and writes atomically to `cache/<post_id>.json`.
  - Downloads multi-table CSVs and polished 1-page ReportLab PDFs in **< 0.03 seconds**, bypassing inference latency.

---

## Directory Layout
```
sentiment_module/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI server, async background tasks, REST endpoints
│   ├── schemas.py           # Pydantic models for inputs, comments, and cached reports
│   ├── extractor.py         # YouTube Data API v3 + Instagram Graph/Scraper + fallback generator
│   ├── preprocessor.py      # 4-step noise filter (Spam/Bots, Emoji map, Hinglish, Sarcasm/Negation)
│   ├── nlp_engine.py        # Tier-1 Polarity & Tier-2 Root-Cause Sub-Tagging
│   ├── cache_manager.py     # Atomic JSON file caching (<5ms retrieval)
│   ├── exporter.py          # Sub-second CSV and ReportLab PDF generators
│   └── static/
│       └── index.html       # Clean single-page dashboard UI (Tailwind CSS + Vanilla JS)
├── sample_data/
│   └── youtube_flagged_post.json  # 1,045-comment realistic dataset (72% Neg, 18% Pos, 10% Neu)
├── cache/                   # Lightweight pre-computed JSON post summaries
├── exports/                 # Generated PDF and CSV executive reports
├── tests/
│   └── test_pipeline.py     # End-to-end pytest suite
├── cli_batch_runner.py      # CLI runner for terminal batch ingestion & exports
├── requirements.txt
└── README.md
```

---

## Quickstart

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Run CLI Batch Runner
```bash
python3 cli_batch_runner.py
```
Outputs baseline summary table, validates 72.0% negative alert, and exports:
- `exports/yt_demo_72neg.csv` (<0.001s)
- `exports/yt_demo_72neg.pdf` (<0.03s)

### 3. Launch FastAPI Server
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
- Open browser at `http://localhost:8000` to interact with the dashboard.
- API docs available at `http://localhost:8000/docs`.

### 4. Run Automated Test Suite
```bash
pytest tests/test_pipeline.py -v
```

---

## REST Endpoints
- `GET /` -> Serves interactive web dashboard
- `POST /api/analyze` -> Ingests post comments, runs 4-step preprocessing, 2-tier classification, and writes to cache
- `GET /api/report/{post_id}` -> Returns cached summary in `< 5ms`
- `GET /api/export/{post_id}/csv` -> Streams CSV export file in `< 1.0s`
- `GET /api/export/{post_id}/pdf` -> Streams ReportLab executive PDF report in `< 1.0s`
- `GET /api/posts` -> Lists cached analyzed posts
- `GET /health` -> Service health check
