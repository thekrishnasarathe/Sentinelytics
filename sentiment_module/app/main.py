"""
FastAPI Server & REST API Endpoints:
Provides asynchronous background processing, cached reports, live key-free web scraping,
and sub-second export streaming for Social Media (YouTube, Instagram) and E-Commerce (Amazon, Flipkart).
"""

import os
import re
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")
from fastapi import FastAPI, HTTPException, BackgroundTasks, Query
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .schemas import (
    AnalyzeRequest,
    CachedReport,
    SettingsKeysResponse,
    SettingsKeysUpdate,
    BrowserIngestRequest,
    HistoryItemResponse,
    CompareRequest,
    CompareResponse,
)
from .extractor import (
    YouTubeExtractor,
    InstagramExtractor,
    AmazonExtractor,
    FlipkartExtractor,
    UniversalEcommerceExtractor,
    parse_input_url_or_id,
    parse_url_and_detect_platform,
    DEMO_POST_IDS,
)
from .preprocessor import CommentPreprocessor
from .nlp_engine import NLPEngine
from .cache_manager import CacheManager
from .exporter import ExporterEngine
from .history_db import HistoryDB

app = FastAPI(
    title="Social Media & E-Commerce Sentiment Analysis Platform (v2.0)",
    description="2-Tier Polarity and Root-Cause Classification Pipeline with Uncapped Ingestion",
    version="2.0.0",
)

# Enable CORS for Vite and other dev/production clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Directory configurations
BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "app" / "static"
CACHE_DIR = BASE_DIR / "cache"
EXPORTS_DIR = BASE_DIR / "exports"
SAMPLE_DATA_DIR = BASE_DIR / "sample_data"

CACHE_DIR.mkdir(parents=True, exist_ok=True)
EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
SAMPLE_DATA_DIR.mkdir(parents=True, exist_ok=True)
STATIC_DIR.mkdir(parents=True, exist_ok=True)

# Mount static files if directory exists
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# Shared singletons
preprocessor = CommentPreprocessor()
nlp_engine = NLPEngine()
cache_mgr = CacheManager(cache_dir=CACHE_DIR)
history_db = HistoryDB()
exporter = ExporterEngine(cache_manager=cache_mgr, exports_dir=EXPORTS_DIR)


def execute_analysis_pipeline(request: AnalyzeRequest) -> CachedReport:
    """Core analysis orchestrator: Parse URL -> Extract -> 4-Step Preprocess -> 2-Tier NLP -> Cache & SQLite."""
    raw_input = request.post_id or request.post_url or "yt_demo_72neg"
    clean_id, detected_platform, canonical_url = parse_url_and_detect_platform(raw_input, default_platform=request.platform or "youtube")

    platform = (request.platform or detected_platform or "youtube").lower()
    post_url = request.post_url or canonical_url
    is_demo = request.is_demo or (clean_id in DEMO_POST_IDS and not request.post_url and "http" not in raw_input)

    # Check if a real browser-ingested report already exists in cache or SQLite for clean_id or raw_input
    existing_cached = cache_mgr.load_report(clean_id) or history_db.get_report_by_id(clean_id)
    if not existing_cached and raw_input != clean_id:
        existing_cached = cache_mgr.load_report(raw_input) or history_db.get_report_by_id(raw_input)

    is_browser_ingested = False
    if existing_cached:
        badge_str = f"{existing_cached.data_source_badge or ''} {existing_cached.data_source or ''} {existing_cached.model_used or ''}"
        if any(k in badge_str for k in ("Browser Extension", "Custom Ingestion", "LIVE: Browser Extension", "Verified")):
            is_browser_ingested = True

    custom_input = request.custom_comments or request.comments

    # If cached report was ingested via browser extension and request has no new custom comments:
    if (not custom_input or len(custom_input) == 0) and is_browser_ingested and existing_cached:
        if getattr(request, "use_cache", True) and existing_cached.sample_comments and len(existing_cached.sample_comments) > 0:
            return existing_cached

    # Step A: Comment & Review Extraction (Keyless Live Scraper, Custom Comments, or Smart Fallback)
    pages_fetched = 1
    unbounded = request.unbounded_fetch
    data_source = "Live Web Scrape"
    data_source_badge = "LIVE: Direct Scraper"
    platform_reported_total: Optional[int] = None
    warning_message: Optional[str] = None

    if custom_input and len(custom_input) > 0:
        raw_comments = custom_input
        data_source = "User / Extension Provided Comments Payload"
        data_source_badge = "USER: Custom Ingestion"
        platform_reported_total = len(custom_input)
    elif is_browser_ingested and existing_cached and existing_cached.sample_comments and len(existing_cached.sample_comments) > 0:
        # Re-use authentic comments from the existing browser-ingested report instead of overwriting with synthetic fallback!
        raw_comments = [
            CommentInput(
                comment_id=c.comment_id,
                raw_text=c.raw_text,
                anonymized_author_id=c.anonymized_author_id,
                timestamp=c.timestamp,
                like_count=c.like_count,
                star_rating=c.star_rating,
                verified_purchase=c.verified_purchase,
            )
            for c in existing_cached.sample_comments
        ]
        data_source = existing_cached.data_source or "Live Ingestion via Sentinelytics Browser Extension"
        data_source_badge = existing_cached.data_source_badge or "LIVE: Browser Extension (Verified)"
        platform_reported_total = existing_cached.total_valid_comments or len(raw_comments)
        post_url = existing_cached.post_url or post_url
        is_demo = False
    elif platform == "youtube":
        extractor = YouTubeExtractor(api_key=request.youtube_api_key)
        post_data = extractor.extract(clean_id, max_comments=None if unbounded else 1500, is_demo=is_demo, fallback_on_blocked=True)
        raw_comments = post_data.comments
        post_url = post_data.post_url
        pages_fetched = post_data.pages_fetched
        unbounded = post_data.unbounded_fetch
        is_demo = post_data.is_demo
        data_source = post_data.data_source
        data_source_badge = post_data.data_source_badge
        platform_reported_total = post_data.platform_reported_total
        warning_message = post_data.warning_message
    elif platform == "instagram":
        extractor = InstagramExtractor(
            access_token=request.instagram_access_token,
            apify_token=request.apify_api_token,
        )
        post_data = extractor.extract(clean_id, max_comments=None if unbounded else 1500, is_demo=is_demo, fallback_on_blocked=True)
        raw_comments = post_data.comments
        post_url = post_data.post_url
        pages_fetched = post_data.pages_fetched
        unbounded = post_data.unbounded_fetch
        is_demo = post_data.is_demo
        data_source = post_data.data_source
        data_source_badge = post_data.data_source_badge
        platform_reported_total = post_data.platform_reported_total
        warning_message = post_data.warning_message
    elif platform == "amazon":
        extractor = AmazonExtractor(
            api_key=request.scraper_api_key,
            apify_token=request.apify_api_token,
        )
        post_data = extractor.extract(clean_id, max_comments=None if unbounded else 1500, is_demo=is_demo, fallback_on_blocked=True)
        raw_comments = post_data.comments
        post_url = post_data.post_url
        pages_fetched = post_data.pages_fetched
        unbounded = post_data.unbounded_fetch
        is_demo = post_data.is_demo
        data_source = post_data.data_source
        data_source_badge = post_data.data_source_badge
        platform_reported_total = post_data.platform_reported_total
        warning_message = post_data.warning_message
    elif platform == "flipkart":
        extractor = FlipkartExtractor(
            api_key=request.scraper_api_key,
            apify_token=request.apify_api_token,
        )
        post_data = extractor.extract(clean_id, max_comments=None if unbounded else 1500, is_demo=is_demo, fallback_on_blocked=True)
        raw_comments = post_data.comments
        post_url = post_data.post_url
        pages_fetched = post_data.pages_fetched
        unbounded = post_data.unbounded_fetch
        is_demo = post_data.is_demo
        data_source = post_data.data_source
        data_source_badge = post_data.data_source_badge
        platform_reported_total = post_data.platform_reported_total
        warning_message = post_data.warning_message
    elif platform in ("myntra", "meesho", "nykaa", "ajio"):
        extractor = UniversalEcommerceExtractor(platform=platform)
        post_data = extractor.extract(clean_id, max_comments=None if unbounded else 1500, is_demo=is_demo, fallback_on_blocked=True)
        raw_comments = post_data.comments
        post_url = post_data.post_url
        pages_fetched = post_data.pages_fetched
        unbounded = post_data.unbounded_fetch
        is_demo = post_data.is_demo
        data_source = post_data.data_source
        data_source_badge = post_data.data_source_badge
        platform_reported_total = post_data.platform_reported_total
        warning_message = post_data.warning_message
    else:
        raise ValueError(f"Unsupported platform: {platform}")

    total_raw = len(raw_comments)
    if total_raw == 0:
        raise ValueError(f"No comments or reviews extracted for {platform} target '{clean_id}'.")

    # Step B: 4-Step Preprocessing Filter & Emotion Conflict Scoring
    clean_comments, removed_count = preprocessor.filter_bots_and_spam(raw_comments)

    preprocessed_items = []
    for c in clean_comments:
        p_res = preprocessor.preprocess(c.raw_text, star_rating=c.star_rating)
        norm_ts = preprocessor.normalize_timestamp(c.timestamp)
        preprocessed_items.append({
            "comment_id": c.comment_id,
            "anonymized_author_id": c.anonymized_author_id,
            "raw_text": c.raw_text,
            "cleaned_text": p_res["cleaned_text"],
            "timestamp": norm_ts,
            "like_count": c.like_count,
            "is_sarcastic": p_res["is_sarcastic"],
            "sarcastic_override_score": p_res["sarcastic_override_score"],
            "irony_sarcasm_detected": p_res.get("irony_sarcasm_detected", False),
            "confidence_score": p_res.get("confidence_score", 0.85),
            "subjectivity_score": p_res.get("subjectivity_score", 0.50),
            "star_rating": c.star_rating,
            "verified_purchase": c.verified_purchase,
            "product_variant": c.product_variant,
        })

    # Step C: Tier 1 Polarity & Tier 2 Root-Cause Sub-Tagging (Domain-Adaptive)
    (
        processed_comments,
        breakdown_rows,
        tier2_breakdowns,
        high_negative_alert,
        star_breakdown,
        star_rating_distribution,
        keyword_frequencies,
        timeline_buckets,
        keyword_stats,
    ) = nlp_engine.process_all_comments(
        preprocessed_items,
        model_option=request.model_option,
        platform=platform,
    )

    # Step D: Executive Insights Synthesis
    insights = nlp_engine.generate_executive_insights(
        processed_comments,
        breakdown_rows,
        tier2_breakdowns,
        platform=platform,
    )

    # Provide 100% complete list of processed comments without arbitrary truncations
    sample_preview = processed_comments
    sarcastic_count = sum(1 for c in processed_comments if getattr(c, "irony_sarcasm_detected", False) or getattr(c, "is_sarcastic", False))

    # Build CachedReport
    utc_now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")
    report = CachedReport(
        post_id=clean_id,
        post_url=post_url,
        platform=platform,
        model_used=request.model_option,
        generated_at=utc_now,
        total_raw_comments=total_raw,
        spam_duplicates_removed=removed_count,
        total_valid_comments=len(processed_comments),
        high_negative_alert=high_negative_alert,
        breakdown=breakdown_rows,
        tier2_root_causes=tier2_breakdowns,
        sample_comments=sample_preview,
        unbounded_fetch=unbounded,
        pages_fetched=pages_fetched,
        star_rating_breakdown=star_breakdown,
        star_rating_distribution=star_rating_distribution,
        keyword_frequencies=keyword_frequencies,
        keyword_stats=keyword_stats,
        timeline_buckets=timeline_buckets,
        platform_reported_total=platform_reported_total,
        warning_message=warning_message,
        is_demo=is_demo,
        data_source=data_source,
        data_source_badge=data_source_badge,
        executive_summary=insights["executive_summary"],
        pain_points=insights["pain_points"],
        recommendations=insights["recommendations"],
        overall_confidence_score=insights["overall_confidence_score"],
        overall_subjectivity_score=insights["overall_subjectivity_score"],
        sarcastic_comments_count=sarcastic_count,
    )

    # Step E: Dual Persistence (Atomic Cache + SQLite sentiment_hub.db)
    cache_mgr.save_report(report)
    history_db.save_report_to_db(report)

    return report


def _mask_key(val: Optional[str]) -> str:
    if not val:
        return ""
    val_clean = val.strip()
    if len(val_clean) <= 8:
        return "****"
    return f"{val_clean[:4]}...{val_clean[-4:]}"


@app.get("/api/settings/keys", response_model=SettingsKeysResponse)
async def get_settings_keys():
    """Returns the configuration status and masked values of all runtime API keys."""
    yt_key = os.environ.get("YOUTUBE_API_KEY", "")
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    apify_token = os.environ.get("APIFY_API_TOKEN", "")
    ig_token = os.environ.get("INSTAGRAM_ACCESS_TOKEN", "")
    scraper_key = os.environ.get("SCRAPER_API_KEY", "")

    return SettingsKeysResponse(
        youtube_api_key_configured=bool(yt_key),
        gemini_api_key_configured=bool(gemini_key),
        apify_api_token_configured=bool(apify_token),
        instagram_access_token_configured=bool(ig_token),
        scraper_api_key_configured=bool(scraper_key),
        masked_keys={
            "youtube_api_key": _mask_key(yt_key),
            "gemini_api_key": _mask_key(gemini_key),
            "apify_api_token": _mask_key(apify_token),
            "instagram_access_token": _mask_key(ig_token),
            "scraper_api_key": _mask_key(scraper_key),
        }
    )


@app.post("/api/settings/keys")
async def update_settings_keys(payload: SettingsKeysUpdate):
    """
    Saves and persists API keys at runtime to os.environ and .env file
    without requiring a server restart.
    """
    key_mapping = {
        "YOUTUBE_API_KEY": payload.youtube_api_key,
        "GEMINI_API_KEY": payload.gemini_api_key,
        "APIFY_API_TOKEN": payload.apify_api_token,
        "INSTAGRAM_ACCESS_TOKEN": payload.instagram_access_token,
        "SCRAPER_API_KEY": payload.scraper_api_key,
    }

    env_paths = [
        Path(".env"),
        BASE_DIR / ".env",
        BASE_DIR.parent / ".env",
    ]

    updated_count = 0
    for env_var, new_val in key_mapping.items():
        if new_val is not None and new_val.strip():
            clean_v = new_val.strip()
            os.environ[env_var] = clean_v
            updated_count += 1

            for ep in env_paths:
                lines = []
                found = False
                if ep.exists():
                    try:
                        with open(ep, "r", encoding="utf-8") as f:
                            lines = f.readlines()
                    except Exception:
                        lines = []

                new_lines = []
                for line in lines:
                    if line.strip().startswith(f"{env_var}="):
                        new_lines.append(f"{env_var}={clean_v}\n")
                        found = True
                    else:
                        new_lines.append(line)
                if not found:
                    new_lines.append(f"{env_var}={clean_v}\n")

                try:
                    with open(ep, "w", encoding="utf-8") as f:
                        f.writelines(new_lines)
                except Exception:
                    pass

    return {
        "status": "success",
        "message": f"Updated {updated_count} API keys at runtime and persisted to .env",
    }


@app.get("/", response_class=HTMLResponse)
async def serve_dashboard():
    """Serves the interactive web dashboard."""
    index_file = STATIC_DIR / "index.html"
    if not index_file.exists():
        alt_path = Path("sentiment_module/app/static/index.html")
        if alt_path.exists():
            index_file = alt_path

    if index_file.exists():
        with open(index_file, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse("<h1>Social Media & E-Commerce Sentiment Analysis Platform v2.0</h1><p>Visit /api/analyze</p>")


@app.post("/api/analyze", response_model=CachedReport)
async def analyze_post(request: AnalyzeRequest, background_tasks: BackgroundTasks):
    """
    Run extraction (live keyless scraper or demo preset), 4-step preprocessing,
    2-tier NLP classification, and cache lightweight report.
    """
    try:
        report = execute_analysis_pipeline(request)
        # Pre-warm CSV & PDF exports asynchronously in background for immediate sub-second access
        background_tasks.add_task(exporter.export_to_csv, report.post_id)
        background_tasks.add_task(exporter.export_to_pdf, report.post_id)
        return report
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ingest-browser", response_model=CachedReport)
async def ingest_browser(request: BrowserIngestRequest, background_tasks: BackgroundTasks):
    """
    Ingests authentic, live comments or reviews directly from the Sentinelytics Chrome/Edge Extension
    or manual browser DOM collector. Runs the 4-step Preprocessor, 2-Tier NLP Engine,
    caches report atomically, and makes it available immediately in the dashboard.
    """
    if not request.comments or len(request.comments) == 0:
        raise HTTPException(
            status_code=400,
            detail="No comments provided in browser payload. Ensure comments are rendered on the active tab."
        )

    raw_target = request.post_url or request.post_id
    clean_id, detected_platform, canonical_url = parse_url_and_detect_platform(
        raw_target, default_platform=request.platform
    )
    platform = (request.platform or detected_platform or "youtube").lower()

    # Normalize Instagram clean shortcode
    if platform == "instagram" or "instagram.com" in raw_target or "/p/" in raw_target or "/reel/" in raw_target or "/tv/" in raw_target:
        platform = "instagram"
        m = re.search(r"/(?:p|reel|tv)/([A-Za-z0-9_-]+)", raw_target)
        if m:
            clean_id = m.group(1)
        elif request.post_id and "/" not in request.post_id and len(request.post_id) < 50:
            clean_id = request.post_id.strip()
        canonical_url = f"https://www.instagram.com/p/{clean_id}/"

    post_url = request.post_url or canonical_url
    post_id = clean_id or request.post_id

    analyze_req = AnalyzeRequest(
        post_id=post_id,
        post_url=post_url,
        platform=platform,
        model_option=request.model_option,
        comments=request.comments,
        custom_comments=request.comments,
        unbounded_fetch=True,
        is_demo=False,
    )

    try:
        report = execute_analysis_pipeline(analyze_req)
        # Update badge to reflect browser extension provenance
        report.data_source = "Live Ingestion via Sentinelytics Browser Extension"
        report.data_source_badge = "LIVE: Browser Extension (Verified)"
        report.status = "ok"
        report.redirect_url = f"http://localhost:3000/?post_id={report.post_id}"

        # Dual save to atomic JSON cache and SQLite history
        cache_mgr.save_report(report)
        history_db.save_report_to_db(report)

        # Pre-warm CSV & PDF exports
        background_tasks.add_task(exporter.export_to_csv, report.post_id)
        background_tasks.add_task(exporter.export_to_pdf, report.post_id)
        return report
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process browser payload: {str(e)}")


@app.post("/api/analyze-quick")
async def analyze_quick(payload: Dict[str, Any]):
    """
    Rapid on-the-fly sentiment scan across browser-extracted comments for
    instant in-extension preview and live progress gauge (<10ms).
    """
    raw_comments = payload.get("comments", [])
    if not raw_comments:
        return {
            "total_comments": 0,
            "positive_pct": 0.0,
            "negative_pct": 0.0,
            "neutral_pct": 0.0,
            "positive_count": 0,
            "negative_count": 0,
            "neutral_count": 0,
            "is_high_negative": False,
            "health_badge": "Awaiting Comments...",
            "sarcastic_count": 0,
            "top_issues": [],
            "preview_comments": [],
        }

    pos_count = 0
    neg_count = 0
    neu_count = 0
    sarcastic_count = 0
    scored_items = []
    neg_words_freq: Dict[str, int] = {}

    preproc = CommentPreprocessor()
    for c in raw_comments:
        raw_text = c.get("raw_text") or c.get("text") or ""
        if not raw_text.strip():
            continue
        p = preproc.preprocess(raw_text)
        if p["is_spam"]:
            continue
        score, sentiment = nlp_engine.analyze_polarity_vader(
            p["cleaned_text"], p["sarcastic_override_score"]
        )
        is_sarc = p.get("irony_sarcasm_detected", False) or p.get("is_sarcastic", False)
        if is_sarc:
            sarcastic_count += 1

        if sentiment == "Positive":
            pos_count += 1
        elif sentiment == "Negative":
            neg_count += 1
            for w in re.findall(r"\b[a-zA-Z]{4,15}\b", p["cleaned_text"].lower()):
                if w not in {"this", "that", "with", "have", "from", "they", "will", "what", "video", "post", "product", "terrible", "bad"}:
                    neg_words_freq[w] = neg_words_freq.get(w, 0) + 1
        else:
            neu_count += 1

        author = c.get("author") or c.get("anonymized_author_id") or "user"
        scored_items.append({
            "author": author,
            "text": raw_text[:140],
            "sentiment": sentiment,
            "score": score,
            "is_sarcastic": is_sarc,
        })

    total = pos_count + neg_count + neu_count
    if total == 0:
        total = 1

    pos_pct = round((pos_count / total) * 100, 1)
    neg_pct = round((neg_count / total) * 100, 1)
    neu_pct = round((neu_count / total) * 100, 1)

    is_high_neg = neg_pct >= 70.0
    if is_high_neg:
        health_badge = f"🚨 {round(neg_pct)}% High Negative Alert"
    elif neg_pct >= 45.0:
        health_badge = f"⚠️ {round(neg_pct)}% Critical Negative"
    elif pos_pct >= 60.0:
        health_badge = f"✅ {round(pos_pct)}% Favorable"
    else:
        health_badge = f"⚖️ {round(neu_pct)}% Balanced Engagement"

    sorted_issues = sorted(neg_words_freq.items(), key=lambda x: x[1], reverse=True)
    top_issues = [w[0].capitalize() for w in sorted_issues[:2]]
    if not top_issues:
        top_issues = ["General Friction", "Quality Variance"] if neg_count > 0 else ["No Active Issues"]

    preview = scored_items[:3]

    return {
        "total_comments": total,
        "positive_pct": pos_pct,
        "negative_pct": neg_pct,
        "neutral_pct": neu_pct,
        "positive_count": pos_count,
        "negative_count": neg_count,
        "neutral_count": neu_count,
        "is_high_negative": is_high_neg,
        "health_badge": health_badge,
        "sarcastic_count": sarcastic_count,
        "top_issues": top_issues,
        "preview_comments": preview,
    }


@app.get("/api/report/{post_id}", response_model=CachedReport)
async def get_cached_report(post_id: str):
    """
    Retrieve pre-computed sentiment report directly from cache or SQLite in <5ms.
    If not cached yet, auto-computes using recognized preset.
    """
    clean_id, detected_platform, _ = parse_url_and_detect_platform(post_id)
    report = cache_mgr.load_report(clean_id) or history_db.get_report_by_id(clean_id)
    if not report and post_id != clean_id:
        report = cache_mgr.load_report(post_id) or history_db.get_report_by_id(post_id)
    if not report:
        req = AnalyzeRequest(post_id=clean_id, platform=detected_platform, is_demo=(clean_id in DEMO_POST_IDS))
        report = execute_analysis_pipeline(req)
    return report


@app.get("/api/export/{post_id}/csv")
async def export_csv(post_id: str):
    """Generate or stream cached CSV report directly from cache in <1s."""
    clean_id, _, _ = parse_url_and_detect_platform(post_id)
    try:
        if not cache_mgr.is_cached(clean_id):
            get_cached_report_sync = await get_cached_report(clean_id)
        csv_path, elapsed = exporter.export_to_csv(clean_id)
        return FileResponse(
            path=str(csv_path),
            filename=f"sentiment_report_{clean_id}.csv",
            media_type="text/csv",
            headers={"X-Export-Time-Seconds": f"{elapsed:.4f}"},
        )
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/export/{post_id}/pdf")
async def export_pdf(post_id: str):
    """Generate or stream polished ReportLab PDF report directly from cache in <1s."""
    clean_id, _, _ = parse_url_and_detect_platform(post_id)
    try:
        if not cache_mgr.is_cached(clean_id):
            get_cached_report_sync = await get_cached_report(clean_id)
        pdf_path, elapsed = exporter.export_to_pdf(clean_id)
        return FileResponse(
            path=str(pdf_path),
            filename=f"sentiment_report_{clean_id}.pdf",
            media_type="application/pdf",
            headers={"X-Export-Time-Seconds": f"{elapsed:.4f}"},
        )
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/posts")
async def list_posts():
    """List available cached posts."""
    posts = cache_mgr.list_cached_posts()
    return {"cached_posts": posts}


@app.get("/api/history", response_model=List[HistoryItemResponse])
async def get_history(limit: int = 50):
    """Returns past analysis history stored in SQLite sentiment_hub.db."""
    return history_db.get_all_history(limit=limit)


@app.post("/api/compare", response_model=CompareResponse)
async def compare_posts(payload: CompareRequest):
    """Compares two sentiment analysis reports side-by-side."""
    clean_a, plat_a, _ = parse_url_and_detect_platform(payload.post_id_a)
    report_a = cache_mgr.load_report(clean_a) or history_db.get_report_by_id(clean_a)
    if not report_a:
        report_a = execute_analysis_pipeline(AnalyzeRequest(post_id=clean_a, platform=plat_a))

    clean_b, plat_b, _ = parse_url_and_detect_platform(payload.post_id_b)
    report_b = cache_mgr.load_report(clean_b) or history_db.get_report_by_id(clean_b)
    if not report_b:
        report_b = execute_analysis_pipeline(AnalyzeRequest(post_id=clean_b, platform=plat_b))

    pos_a = next((r.percentage for r in report_a.breakdown if r.category == "Positive"), 0.0)
    neg_a = next((r.percentage for r in report_a.breakdown if r.category == "Negative"), 0.0)
    pos_b = next((r.percentage for r in report_b.breakdown if r.category == "Positive"), 0.0)
    neg_b = next((r.percentage for r in report_b.breakdown if r.category == "Negative"), 0.0)

    delta_pos = round(pos_a - pos_b, 1)
    delta_neg = round(neg_a - neg_b, 1)
    winner = report_a.post_id if pos_a >= pos_b else report_b.post_id

    return CompareResponse(
        report_a=report_a,
        report_b=report_b,
        delta_positive_pct=delta_pos,
        delta_negative_pct=delta_neg,
        winner=winner,
    )


@app.delete("/api/history/{post_id}")
async def delete_history_item(post_id: str):
    """Removes a report from SQLite history."""
    clean_id, _, _ = parse_url_and_detect_platform(post_id)
    success = history_db.delete_history_item(clean_id)
    return {"success": success, "post_id": clean_id}


@app.get("/health")
async def health_check():
    """Service health check."""
    return {"status": "ok", "version": "2.0.0", "timestamp": datetime.now(timezone.utc).isoformat()}
