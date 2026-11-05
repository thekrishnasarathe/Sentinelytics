#!/usr/bin/env python3
"""
CLI Batch Runner for Social Media & E-Commerce Sentiment Analysis Platform (v2.0)
- Ingests uncapped datasets for YouTube, Instagram, Amazon, and Flipkart
- Executes 4-step preprocessing & 2-tier domain-adaptive NLP classification
- Stores atomic pre-computed summaries in cache/<post_id>.json
- Generates sub-second (<1s) CSV and PDF exports for all 4 platforms
- Displays ASCII summary tables and performance benchmarks
"""

import os
import sys
import time
from pathlib import Path
from datetime import datetime, timezone

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
ROOT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT_DIR.parent
for p in [ROOT_DIR, PROJECT_ROOT]:
    p_str = str(p)
    if p_str not in sys.path:
        sys.path.insert(0, p_str)

from app.schemas import AnalyzeRequest, CachedReport
from app.extractor import (
    YouTubeExtractor,
    InstagramExtractor,
    AmazonExtractor,
    FlipkartExtractor,
    generate_realistic_flagged_dataset,
    generate_realistic_amazon_dataset,
    generate_realistic_flipkart_dataset,
)
from app.preprocessor import CommentPreprocessor
from app.nlp_engine import NLPEngine
from app.cache_manager import CacheManager
from app.exporter import ExporterEngine


def run_platform_batch(
    platform: str,
    post_id: str,
    title: str,
    cache_dir: Path,
    exports_dir: Path,
    sample_data_dir: Path,
    model_option: str = "vader_hybrid",
):
    print("\n" + "=" * 78)
    print(f"  PLATFORM: {platform.upper()} | {title} [{post_id}]")
    print("=" * 78)

    # 1. Extraction (Uncapped)
    extract_start = time.perf_counter()
    if platform == "youtube":
        extractor = YouTubeExtractor()
        post_input = extractor.extract(post_id, max_comments=None)
    elif platform == "instagram":
        extractor = InstagramExtractor()
        post_input = extractor.extract(post_id, max_comments=None)
    elif platform == "amazon":
        extractor = AmazonExtractor()
        post_input = extractor.extract(post_id, max_comments=None)
    elif platform == "flipkart":
        extractor = FlipkartExtractor()
        post_input = extractor.extract(post_id, max_comments=None)
    else:
        raise ValueError(f"Unknown platform {platform}")

    extract_elapsed = time.perf_counter() - extract_start
    total_raw = len(post_input.comments)
    print(f"  [1/5] Ingested raw {platform} comments/reviews: {total_raw:,} in {extract_elapsed:.3f}s")
    print(f"        -> Unbounded pagination: {post_input.unbounded_fetch} ({post_input.pages_fetched} pages traversed)")

    # 2. 4-Step Preprocessing
    preprocessor = CommentPreprocessor()
    clean_comments, removed_count = preprocessor.filter_bots_and_spam(post_input.comments)
    print(f"  [2/5] 4-Step Preprocessing: {removed_count} bots/spam/duplicates removed, {len(clean_comments):,} clean items")

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

    # 3. 2-Tier NLP Engine
    nlp_engine = NLPEngine()
    nlp_start = time.perf_counter()
    (
        processed_comments,
        breakdown_rows,
        tier2_breakdowns,
        high_negative_alert,
        star_breakdown,
        star_rating_distribution,
        keyword_frequencies,
    ) = nlp_engine.process_all_comments(
        preprocessed_items,
        model_option=model_option,
        platform=platform,
    )
    nlp_elapsed = time.perf_counter() - nlp_start
    print(f"  [3/5] 2-Tier NLP inference completed in {nlp_elapsed:.3f}s")
    print(f"        -> High Negative Alert (>70%): {'[CRITICAL ALERT] TRIGGERED' if high_negative_alert else 'NORMAL'}")

    # 4. Atomic Cache Persistence
    cache_mgr = CacheManager(cache_dir=cache_dir)
    utc_now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")
    sample_preview = (
        [c for c in processed_comments if c.sentiment == "Negative"][:20]
        + [c for c in processed_comments if c.sentiment == "Positive"][:10]
        + [c for c in processed_comments if c.sentiment == "Neutral"][:5]
    )
    report = CachedReport(
        post_id=post_id,
        post_url=post_input.post_url,
        platform=platform,
        model_used=model_option,
        generated_at=utc_now,
        total_raw_comments=total_raw,
        spam_duplicates_removed=removed_count,
        total_valid_comments=len(processed_comments),
        high_negative_alert=high_negative_alert,
        breakdown=breakdown_rows,
        tier2_root_causes=tier2_breakdowns,
        sample_comments=sample_preview,
        unbounded_fetch=post_input.unbounded_fetch,
        pages_fetched=post_input.pages_fetched,
        star_rating_breakdown=star_breakdown,
        star_rating_distribution=star_rating_distribution,
        keyword_frequencies=keyword_frequencies,
    )
    cache_path = cache_mgr.save_report(report)
    print(f"  [4/5] Pre-computed summary saved atomically to: {cache_path.name}")

    # 5. Sub-Second PDF and CSV Export Generation
    exporter = ExporterEngine(cache_manager=cache_mgr, exports_dir=exports_dir)
    csv_path, csv_elapsed = exporter.export_to_csv(post_id)
    pdf_path, pdf_elapsed = exporter.export_to_pdf(post_id)

    csv_status = "PASSED (<1.0s)" if csv_elapsed < 1.0 else "SLOW (>1.0s)"
    pdf_status = "PASSED (<1.0s)" if pdf_elapsed < 1.0 else "SLOW (>1.0s)"
    print(f"  [5/5] Sub-Second Exporters:")
    print(f"        -> CSV Export: {csv_path.name} in {csv_elapsed:.4f}s ({csv_status})")
    print(f"        -> PDF Export: {pdf_path.name} in {pdf_elapsed:.4f}s ({pdf_status})")

    # ASCII Summary Tables
    print("\n  TIER-1 POLARITY BREAKDOWN:")
    print(f"  {'Category':<12} | {'Count':<8} | {'Percentage':<12} | {'Top Issues / Praise'}")
    print("  " + "-" * 74)
    for row in breakdown_rows:
        kw = ", ".join(row.top_keywords) if row.top_keywords else "N/A"
        print(f"  {row.category:<12} | {row.comment_count:<8} | {f'{row.percentage}%':<12} | {kw}")

    print(f"\n  TIER-2 ROOT-CAUSE DIAGNOSTICS ({platform.upper()} DOMAIN):")
    print(f"  {'Root Cause Bucket':<38} | {'Count':<8} | {'% of Negative':<14} | {'Sample Issue'}")
    print("  " + "-" * 74)
    for rc in tier2_breakdowns:
        sample = rc.sample_comments[0][:30] + "..." if rc.sample_comments else "None"
        print(f"  {rc.category:<38} | {rc.count:<8} | {f'{rc.percentage}%':<14} | {sample}")

    if star_breakdown:
        print("\n  E-COMMERCE STAR RATING DISTRIBUTION:")
        star_line = " | ".join(f"{k.replace('_', ' ').title()}: {v}" for k, v in star_breakdown.items())
        print(f"  {star_line}")

    return {
        "platform": platform,
        "post_id": post_id,
        "raw_total": total_raw,
        "valid_total": len(processed_comments),
        "csv_elapsed": csv_elapsed,
        "pdf_elapsed": pdf_elapsed,
    }


def main():
    print("=" * 78)
    print("  SOCIAL MEDIA & E-COMMERCE SENTIMENT ANALYSIS PLATFORM (v2.0)")
    print("  Batch Processing Runner & Sub-Second Latency Benchmark")
    print("=" * 78)

    sample_data_dir = ROOT_DIR / "sample_data"
    cache_dir = ROOT_DIR / "cache"
    exports_dir = ROOT_DIR / "exports"

    sample_data_dir.mkdir(parents=True, exist_ok=True)
    cache_dir.mkdir(parents=True, exist_ok=True)
    exports_dir.mkdir(parents=True, exist_ok=True)

    # Ensure all realistic sample datasets exist
    yt_sample = sample_data_dir / "youtube_flagged_post.json"
    if not yt_sample.exists():
        generate_realistic_flagged_dataset(yt_sample)

    amz_sample = sample_data_dir / "amazon_product_reviews.json"
    if not amz_sample.exists():
        generate_realistic_amazon_dataset(amz_sample)

    flp_sample = sample_data_dir / "flipkart_product_reviews.json"
    if not flp_sample.exists():
        generate_realistic_flipkart_dataset(flp_sample)

    platforms_to_run = [
        ("youtube", "yt_demo_72neg", "YouTube Flagged Upload (>70% Neg)"),
        ("instagram", "ig_demo_creator_reel", "Instagram Creator Reel"),
        ("amazon", "amz_smartphone_reviews", "Amazon Smartphone Reviews (E-Commerce)"),
        ("flipkart", "flp_electronics_sale", "Flipkart Electronics Sale (E-Commerce)"),
    ]

    results = []
    overall_start = time.perf_counter()

    for platform, post_id, title in platforms_to_run:
        res = run_platform_batch(
            platform=platform,
            post_id=post_id,
            title=title,
            cache_dir=cache_dir,
            exports_dir=exports_dir,
            sample_data_dir=sample_data_dir,
        )
        results.append(res)

    overall_elapsed = time.perf_counter() - overall_start

    print("\n" + "=" * 78)
    print("  BENCHMARK SUMMARY ACROSS ALL 4 PLATFORMS")
    print("=" * 78)
    print(f"  {'Platform':<12} | {'Post ID':<24} | {'Items':<8} | {'CSV Time':<10} | {'PDF Time':<10} | {'Status'}")
    print("-" * 78)
    all_sub_second = True
    for r in results:
        max_exp = max(r["csv_elapsed"], r["pdf_elapsed"])
        status = "PASSED (<1s)" if max_exp < 1.0 else "FAILED"
        if max_exp >= 1.0:
            all_sub_second = False
        print(f"  {r['platform']:<12} | {r['post_id']:<24} | {r['valid_total']:<8} | {r['csv_elapsed']:.4f}s    | {r['pdf_elapsed']:.4f}s    | {status}")
    print("=" * 78)
    print(f"  Total processing time for 4 platforms (4,500+ items): {overall_elapsed:.2f}s")
    if all_sub_second:
        print("  VERIFICATION SUCCESS: 100% of PDF & CSV reports exported in < 1.0s!")
    print("=" * 78 + "\n")


if __name__ == "__main__":
    main()
