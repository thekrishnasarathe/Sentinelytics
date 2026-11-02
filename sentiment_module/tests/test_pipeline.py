"""
End-to-End Automated Test Suite for Social Media & E-Commerce Sentiment Analysis Pipeline (v2.0)
Verifies:
1. Noise filtering: Spam links, promotional URLs, and duplicate author comments removal
2. Emoji semantic polarity: 🔥, 😡, 😭 classification (never Neutral)
3. Hinglish code-mixing: 'Bhai video mast hai', 'Bekar update' (never Neutral)
4. Sarcasm & negation preservation: 'not working', 'great job breaking the UI' -> Negative
5. Flagged post metrics: 72.0% Negative (720), 18.0% Positive (180), 10.0% Neutral (100)
6. Critical alert trigger: high_negative_alert == True
7. Tier-2 root cause coverage: All 4 social buckets populated
8. Sub-second export performance: CSV and PDF generation complete in < 1.0 second
9. Uncapped fetching: max_comments=None ingests all available items without truncation
10. E-Commerce Hinglish: 'Paisa vasool', 'Bilkul nakli product', 'Battery backup bekar hai'
11. E-Commerce Tier-2 root causes: Product Defect, Delivery, Counterfeit, Value for Money
12. Full E-Commerce Pipeline (Amazon & Flipkart) with star rating breakdowns
"""

import os
import sys
import time
from pathlib import Path
import pytest

# Ensure project modules are resolvable from any working directory
TEST_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = TEST_DIR.parent
for p in [PROJECT_ROOT, PROJECT_ROOT / "sentiment_module", Path.cwd(), Path.cwd() / "sentiment_module"]:
    p_str = str(p.resolve())
    if p_str not in sys.path:
        sys.path.insert(0, p_str)

from app.schemas import CommentInput, PostInput, AnalyzeRequest
from app.preprocessor import CommentPreprocessor
from app.nlp_engine import (
    NLPEngine,
    ROOT_CAUSE_TECHNICAL,
    ROOT_CAUSE_AUDIO_VIDEO,
    ROOT_CAUSE_CONTENT,
    ROOT_CAUSE_TROLLS,
    ROOT_CAUSE_ECOMM_DEFECT,
    ROOT_CAUSE_ECOMM_DELIVERY,
    ROOT_CAUSE_ECOMM_COUNTERFEIT,
    ROOT_CAUSE_ECOMM_VALUE,
)
from app.extractor import (
    YouTubeExtractor,
    InstagramExtractor,
    AmazonExtractor,
    FlipkartExtractor,
    generate_realistic_flagged_dataset,
    generate_realistic_amazon_dataset,
    generate_realistic_flipkart_dataset,
)
from app.cache_manager import CacheManager
from app.exporter import ExporterEngine
from app.main import execute_analysis_pipeline


@pytest.fixture
def preprocessor():
    return CommentPreprocessor()


@pytest.fixture
def nlp_engine():
    return NLPEngine()


@pytest.fixture
def cache_mgr(tmp_path):
    return CacheManager(cache_dir=tmp_path / "cache")


@pytest.fixture
def exporter(cache_mgr, tmp_path):
    return ExporterEngine(cache_manager=cache_mgr, exports_dir=tmp_path / "exports")


def test_spam_links_and_duplicates_removal(preprocessor):
    """Verify promotional URLs and duplicate author comments are filtered out."""
    comments = [
        CommentInput(
            comment_id="c1",
            raw_text="Check my channel https://spam.com/crypto for free bitcoin!",
            timestamp="2026-10-30T00:00:00Z",
            like_count=0,
            anonymized_author_id="bot_user_1",
        ),
        CommentInput(
            comment_id="c2",
            raw_text="Visit http://bit.ly/claim-tokens-now to earn money",
            timestamp="2026-10-30T00:01:00Z",
            like_count=0,
            anonymized_author_id="bot_user_2",
        ),
        CommentInput(
            comment_id="c3",
            raw_text="Join telegram t.me/freecrypto for pump signals",
            timestamp="2026-10-30T00:02:00Z",
            like_count=0,
            anonymized_author_id="bot_user_3",
        ),
        # Legitimate comment
        CommentInput(
            comment_id="c4",
            raw_text="App crash on mobile after updating to version 2.0",
            timestamp="2026-10-30T00:03:00Z",
            like_count=5,
            anonymized_author_id="real_user_1",
        ),
        # Duplicate comments by identical author
        CommentInput(
            comment_id="c5",
            raw_text="Will this update be rolled back soon?",
            timestamp="2026-10-30T00:04:00Z",
            like_count=0,
            anonymized_author_id="dup_author",
        ),
        CommentInput(
            comment_id="c6",
            raw_text="Will this update be rolled back soon?",
            timestamp="2026-10-30T00:05:00Z",
            like_count=0,
            anonymized_author_id="dup_author",
        ),
    ]

    clean_comments, removed_count = preprocessor.filter_bots_and_spam(comments)

    assert removed_count == 4
    assert len(clean_comments) == 2
    assert any(c.comment_id == "c4" for c in clean_comments)


def test_emoji_and_hinglish_classification(preprocessor, nlp_engine):
    """
    Verify expressive emojis and Hinglish tokens are classified as Positive / Negative
    and never Neutral.
    """
    test_cases = [
        ("Bhai video mast hai 🔥", "Positive"),
        ("Sahi explanation hai, bahut badiya! ❤️", "Positive"),
        ("Zabardast presentation keep it up 👍", "Positive"),
        ("Kamaal kar diya op tutorial 🎉", "Positive"),
        ("Bekar update bhai 😡", "Negative"),
        ("Ghatiya app bilkul kaam nahi kar raha 🤮", "Negative"),
        ("Bakwas video, total waste of time 👎", "Negative"),
        ("Kharab audio sync issue 😭", "Negative"),
    ]

    for raw_text, expected_sentiment in test_cases:
        p_res = preprocessor.preprocess(raw_text)
        score, sentiment = nlp_engine.analyze_polarity_vader(
            p_res["cleaned_text"], p_res["sarcastic_override_score"]
        )

        assert sentiment == expected_sentiment, (
            f"Failed for '{raw_text}': got {sentiment} (score={score}), expected {expected_sentiment}"
        )
        assert sentiment != "Neutral", f"Comment '{raw_text}' was incorrectly scored as Neutral!"


def test_sarcasm_and_negation_classification(preprocessor, nlp_engine):
    """
    Verify sarcasm templates and negation phrases force Negative classification (score <= -0.05).
    """
    negative_cases = [
        "not working after login",
        "great job breaking the UI 😡",
        "love how it crashes every time I open settings",
        "thanks for ruining the update",
        "awesome bug guys, completely broken",
        "camera feature doesn't load and won't open",
        "nahi chal raha hai bilkul",
    ]

    for raw_text in negative_cases:
        p_res = preprocessor.preprocess(raw_text)
        score, sentiment = nlp_engine.analyze_polarity_vader(
            p_res["cleaned_text"], p_res["sarcastic_override_score"]
        )

        assert sentiment == "Negative", (
            f"Expected Negative for '{raw_text}', but got {sentiment} (score={score})"
        )
        assert score <= -0.05, f"Score for '{raw_text}' should be <= -0.05, got {score}"


def test_flagged_youtube_demo_dataset_and_root_causes(tmp_path):
    """
    Verify YouTube flagged demo post produces:
    - 72.0% Negative (720 comments)
    - 18.0% Positive (180 comments)
    - 10.0% Neutral (100 comments)
    - Sets high_negative_alert == True
    - Populates all 4 Tier-2 root-cause buckets
    """
    sample_file = tmp_path / "youtube_flagged_post.json"
    generate_realistic_flagged_dataset(sample_file)

    extractor = YouTubeExtractor()
    post_input = extractor.extract("yt_demo_72neg")

    assert len(post_input.comments) == 1045, "Raw dataset must contain exactly 1,045 comments"

    # Run analysis
    request = AnalyzeRequest(post_id="yt_demo_72neg", platform="youtube", model_option="vader_hybrid")
    report = execute_analysis_pipeline(request)

    assert report.total_raw_comments == 1045
    assert report.spam_duplicates_removed == 45
    assert report.total_valid_comments == 1000

    breakdown_map = {r.category: r for r in report.breakdown}

    assert breakdown_map["Negative"].comment_count == 720
    assert breakdown_map["Negative"].percentage == 72.0

    assert breakdown_map["Positive"].comment_count == 180
    assert breakdown_map["Positive"].percentage == 18.0

    assert breakdown_map["Neutral"].comment_count == 100
    assert breakdown_map["Neutral"].percentage == 10.0

    assert report.high_negative_alert is True

    tier2_map = {rc.category: rc for rc in report.tier2_root_causes}
    expected_causes = [
        ROOT_CAUSE_TECHNICAL,
        ROOT_CAUSE_AUDIO_VIDEO,
        ROOT_CAUSE_CONTENT,
        ROOT_CAUSE_TROLLS,
    ]

    for cause in expected_causes:
        assert cause in tier2_map, f"Missing root cause category: {cause}"
        assert tier2_map[cause].count > 0, f"Root cause '{cause}' has 0 comments"
        assert len(tier2_map[cause].sample_comments) > 0, f"Root cause '{cause}' missing sample comments"


def test_sub_second_pdf_and_csv_export_performance(tmp_path):
    """
    Verify both CSV and PDF exporters read directly from cache and execute in < 1.0 second.
    """
    cache_dir = tmp_path / "cache"
    exports_dir = tmp_path / "exports"
    cache_dir.mkdir(parents=True, exist_ok=True)
    exports_dir.mkdir(parents=True, exist_ok=True)

    cache_mgr = CacheManager(cache_dir=cache_dir)
    exporter = ExporterEngine(cache_manager=cache_mgr, exports_dir=exports_dir)

    request = AnalyzeRequest(post_id="yt_demo_perf_test", platform="youtube", model_option="vader_hybrid")
    report = execute_analysis_pipeline(request)
    cache_mgr.save_report(report)

    # 1. Benchmark CSV Export Speed
    csv_path, csv_elapsed = exporter.export_to_csv("yt_demo_perf_test")
    assert csv_path.exists(), "CSV export file was not created"
    assert csv_path.stat().st_size > 0, "CSV export file is empty"
    assert csv_elapsed < 1.0, f"CSV export exceeded 1.0s limit: {csv_elapsed:.4f}s"

    # 2. Benchmark PDF Export Speed
    pdf_path, pdf_elapsed = exporter.export_to_pdf("yt_demo_perf_test")
    assert pdf_path.exists(), "PDF export file was not created"
    assert pdf_path.stat().st_size > 0, "PDF export file is empty"
    assert pdf_elapsed < 1.0, f"PDF export exceeded 1.0s limit: {pdf_elapsed:.4f}s"


# ==============================================================================
# NEW 2 NOVEMBER 2026 MOM TESTS (E-Commerce, Uncapped Fetching, Adapting Root Causes)
# ==============================================================================

def test_uncapped_comment_fetching():
    """
    Verify uncapped comment fetching (max_comments=None) across all 4 extractors:
    - Ingests 100% of available items without truncation
    - Sets unbounded_fetch=True and pages_fetched >= 1
    """
    # 1. YouTube uncapped
    yt = YouTubeExtractor()
    yt_full = yt.extract("yt_demo_72neg", max_comments=None)
    assert yt_full.unbounded_fetch is True
    assert len(yt_full.comments) == 1045
    # When explicit max_comments is passed, it caps
    yt_capped = yt.extract("yt_demo_72neg", max_comments=50)
    assert yt_capped.unbounded_fetch is False
    assert len(yt_capped.comments) == 50

    # 2. Amazon uncapped
    amz = AmazonExtractor()
    amz_full = amz.extract("amz_smartphone_reviews", max_comments=None)
    assert amz_full.unbounded_fetch is True
    assert len(amz_full.comments) >= 1200
    assert amz_full.pages_fetched >= 10

    # 3. Flipkart uncapped
    flp = FlipkartExtractor()
    flp_full = flp.extract("flp_electronics_sale", max_comments=None)
    assert flp_full.unbounded_fetch is True
    assert len(flp_full.comments) >= 1200
    assert flp_full.pages_fetched >= 10

    # 4. Instagram uncapped
    ig = InstagramExtractor()
    ig_full = ig.extract("ig_demo_creator_reel", max_comments=None)
    assert ig_full.unbounded_fetch is True
    assert len(ig_full.comments) >= 1000


def test_ecommerce_hinglish_classification(preprocessor, nlp_engine):
    """
    Verify E-Commerce Hinglish reviews are classified correctly (Positive / Negative)
    and never Neutral.
    """
    ecommerce_cases = [
        ("Paisa vasool product! Outstanding battery and display 🔥", "Positive"),
        ("Bahut badhiya phone hai, mast camera quality ❤️", "Positive"),
        ("Zabardast fast charging, genuine product delivered 👍", "Positive"),
        ("Bilkul nakli product bheja hai seller ne 😡", "Negative"),
        ("Battery backup bekar hai, drains in 2 hours 👎", "Negative"),
        ("Paisa barbaad ho gaya! Worst smartphone ever", "Negative"),
        ("Ghatiya build quality and broken seal 🤮", "Negative"),
        ("Fake duplicate charger received, pure dhoka 💔", "Negative"),
    ]

    for raw_text, expected in ecommerce_cases:
        p_res = preprocessor.preprocess(raw_text)
        score, sentiment = nlp_engine.analyze_polarity_vader(
            p_res["cleaned_text"], p_res["sarcastic_override_score"]
        )
        assert sentiment == expected, (
            f"E-commerce review '{raw_text}' expected {expected}, got {sentiment} (score={score})"
        )
        assert sentiment != "Neutral"


def test_ecommerce_tier2_root_causes_adaptation(nlp_engine):
    """
    Verify Tier-2 negative root-cause sub-tagging assigns the 4 E-Commerce buckets:
    1. Product Defect / Hardware Quality
    2. Delivery, Packaging & Logistics
    3. Counterfeit / Wrong Item Received
    4. Value for Money / Pricing & Warranty
    """
    test_cases = [
        (
            "Battery backup bekar hai, drains rapidly and severe heating issue with motherboard defect",
            ROOT_CAUSE_ECOMM_DEFECT,
        ),
        (
            "Delivery delayed by 6 days! Retail box was crushed and courier seal broken",
            ROOT_CAUSE_ECOMM_DELIVERY,
        ),
        (
            "Bilkul nakli product bheja hai! Fake duplicate model, pure dhoka scam seller",
            ROOT_CAUSE_ECOMM_COUNTERFEIT,
        ),
        (
            "Paisa barbaad ho gaya! Overpriced device and customer care refused refund warranty",
            ROOT_CAUSE_ECOMM_VALUE,
        ),
    ]

    for raw_text, expected_cause in test_cases:
        assigned = nlp_engine.sub_tag_negative_root_cause(raw_text, raw_text, platform="amazon")
        assert assigned == expected_cause, (
            f"For review '{raw_text}', expected '{expected_cause}', got '{assigned}'"
        )


def test_ecommerce_full_pipeline_and_star_ratings():
    """
    Verify complete Amazon & Flipkart analysis pipelines:
    - Populates star_rating_breakdown (1★ to 5★)
    - Marks unbounded_fetch=True
    - Populates all 4 E-Commerce root causes
    - Sub-second (<1s) PDF and CSV export verification
    """
    # 1. Amazon Pipeline
    req_amz = AnalyzeRequest(post_id="amz_smartphone_reviews", platform="amazon")
    rep_amz = execute_analysis_pipeline(req_amz)

    assert rep_amz.platform == "amazon"
    assert rep_amz.unbounded_fetch is True
    assert rep_amz.total_raw_comments >= 1200
    assert rep_amz.star_rating_breakdown is not None
    assert "5_star" in rep_amz.star_rating_breakdown
    assert "1_star" in rep_amz.star_rating_breakdown
    assert rep_amz.star_rating_breakdown["1_star"] > 0

    ecomm_causes_found = {rc.category: rc.count for rc in rep_amz.tier2_root_causes}
    assert ROOT_CAUSE_ECOMM_DEFECT in ecomm_causes_found
    assert ROOT_CAUSE_ECOMM_DELIVERY in ecomm_causes_found
    assert ROOT_CAUSE_ECOMM_COUNTERFEIT in ecomm_causes_found
    assert ROOT_CAUSE_ECOMM_VALUE in ecomm_causes_found

    # 2. Flipkart Pipeline
    req_flp = AnalyzeRequest(post_id="flp_electronics_sale", platform="flipkart")
    rep_flp = execute_analysis_pipeline(req_flp)

    assert rep_flp.platform == "flipkart"
    assert rep_flp.unbounded_fetch is True
    assert rep_flp.total_raw_comments >= 1200
    assert rep_flp.star_rating_breakdown is not None
    assert rep_flp.high_negative_alert is True  # 76% negative triggers alert

    # 3. Exporter benchmark for E-Commerce
    exporter = ExporterEngine()
    csv_p, csv_t = exporter.export_to_csv("amz_smartphone_reviews")
    pdf_p, pdf_t = exporter.export_to_pdf("amz_smartphone_reviews")

    assert csv_p.exists() and csv_t < 1.0
    assert pdf_p.exists() and pdf_t < 1.0
