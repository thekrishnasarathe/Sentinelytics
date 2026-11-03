"""
FastAPI Server & REST API Endpoints:
Provides asynchronous background processing, cached reports, live key-free web scraping,
and sub-second export streaming for Social Media (YouTube, Instagram) and E-Commerce (Amazon, Flipkart).
"""

import os
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks, Query
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .schemas import AnalyzeRequest, CachedReport
from .extractor import (
    YouTubeExtractor,
    InstagramExtractor,
    AmazonExtractor,
    FlipkartExtractor,
    parse_url_and_detect_platform,
    DEMO_POST_IDS,
)
from .preprocessor import CommentPreprocessor
from .nlp_engine import NLPEngine
from .cache_manager import CacheManager
from .exporter import ExporterEngine

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
exporter = ExporterEngine(cache_manager=cache_mgr, exports_dir=EXPORTS_DIR)


def execute_analysis_pipeline(request: AnalyzeRequest) -> CachedReport:
    """Core analysis orchestrator: Parse URL -> Extract -> 4-Step Preprocess -> 2-Tier NLP -> Cache."""
    raw_input = request.post_id or request.post_url or "yt_demo_72neg"
    clean_id, detected_platform, canonical_url = parse_url_and_detect_platform(raw_input)

    platform = (request.platform or detected_platform or "youtube").lower()
    post_url = request.post_url or canonical_url
    is_demo = request.is_demo or (clean_id in DEMO_POST_IDS and not request.post_url and "http" not in raw_input)

    # Step A: Comment & Review Extraction (Keyless Live Scraper or Demo Fallback)
    pages_fetched = 1
    unbounded = request.unbounded_fetch
    data_source = "Live Web Scrape"

    if request.comments and len(request.comments) > 0:
        raw_comments = request.comments
        data_source = "User Provided Comments Payload"
    elif platform == "youtube":
        extractor = YouTubeExtractor(api_key=request.youtube_api_key)
        post_data = extractor.extract(clean_id, max_comments=None if unbounded else 1500, is_demo=is_demo)
        raw_comments = post_data.comments
        post_url = post_data.post_url
        pages_fetched = post_data.pages_fetched
        unbounded = post_data.unbounded_fetch
        is_demo = post_data.is_demo
        data_source = post_data.data_source
    elif platform == "instagram":
        extractor = InstagramExtractor(access_token=request.instagram_access_token)
        post_data = extractor.extract(clean_id, max_comments=None if unbounded else 1500, is_demo=is_demo)
        raw_comments = post_data.comments
        post_url = post_data.post_url
        pages_fetched = post_data.pages_fetched
        unbounded = post_data.unbounded_fetch
        is_demo = post_data.is_demo
        data_source = post_data.data_source
    elif platform == "amazon":
        extractor = AmazonExtractor(api_key=request.scraper_api_key)
        post_data = extractor.extract(clean_id, max_comments=None if unbounded else 1500, is_demo=is_demo)
        raw_comments = post_data.comments
        post_url = post_data.post_url
        pages_fetched = post_data.pages_fetched
        unbounded = post_data.unbounded_fetch
        is_demo = post_data.is_demo
        data_source = post_data.data_source
    elif platform == "flipkart":
        extractor = FlipkartExtractor(api_key=request.scraper_api_key)
        post_data = extractor.extract(clean_id, max_comments=None if unbounded else 1500, is_demo=is_demo)
        raw_comments = post_data.comments
        post_url = post_data.post_url
        pages_fetched = post_data.pages_fetched
        unbounded = post_data.unbounded_fetch
        is_demo = post_data.is_demo
        data_source = post_data.data_source
    else:
        raise ValueError(f"Unsupported platform: {platform}")

    total_raw = len(raw_comments)
    if total_raw == 0:
        raise ValueError(f"No comments or reviews extracted for {platform} target '{clean_id}'.")

    # Step B: 4-Step Preprocessing Filter
    clean_comments, removed_count = preprocessor.filter_bots_and_spam(raw_comments)

    preprocessed_items = []
    for c in clean_comments:
        p_res = preprocessor.preprocess(c.raw_text)
        preprocessed_items.append({
            "comment_id": c.comment_id,
            "anonymized_author_id": c.anonymized_author_id,
            "raw_text": c.raw_text,
            "cleaned_text": p_res["cleaned_text"],
            "timestamp": c.timestamp,
            "like_count": c.like_count,
            "is_sarcastic": p_res["is_sarcastic"],
            "sarcastic_override_score": p_res["sarcastic_override_score"],
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
    ) = nlp_engine.process_all_comments(
        preprocessed_items,
        model_option=request.model_option,
        platform=platform,
    )

    # Provide large scrollable preview (up to 250 comments) for interactive feed
    sample_preview = processed_comments[:250]

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
        is_demo=is_demo,
        data_source=data_source,
    )

    # Step D: Atomic Write to Cache
    cache_mgr.save_report(report)

    return report


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


@app.get("/api/report/{post_id}", response_model=CachedReport)
async def get_cached_report(post_id: str):
    """
    Retrieve pre-computed sentiment report directly from cache in <5ms.
    If not cached yet, auto-computes using recognized preset.
    """
    clean_id, detected_platform, _ = parse_url_and_detect_platform(post_id)
    report = cache_mgr.load_report(clean_id)
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


@app.get("/health")
async def health_check():
    """Service health check."""
    return {"status": "ok", "version": "2.0.0", "timestamp": datetime.now(timezone.utc).isoformat()}
