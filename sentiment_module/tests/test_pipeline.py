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
        "mast update 🤡",
        "badiya feature 💔",
        "great service 😭",
        "awesome battery life 🤮",
        "love this product 👎",
        "badiya packaging 😤",
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
        if any(e in raw_text for e in ["😡", "🤡", "💔", "😭", "🤮", "👎", "😤"]) and any(w in raw_text.lower() for w in ["great", "mast", "badiya", "awesome", "love"]):
            assert p_res["is_sarcastic"] is True, f"Expected is_sarcastic=True for '{raw_text}'"
            assert p_res["sarcastic_override_score"] == -0.75, f"Expected override score -0.75 for '{raw_text}'"


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


def test_smart_url_parser_and_platform_autodetector():
    """
    Verify parse_input_url_or_id correctly parses:
    - YouTube: watch?v=, youtu.be/, shorts/
    - Instagram: /reel/, /p/, /tv/
    - Flipkart: /p/ auto-converted to /product-reviews/ with pid preserved
    - Amazon: /dp/ASIN extracted to 10-char uppercase ASIN
    - Demo presets: preserved without modification
    """
    from app.extractor import parse_input_url_or_id

    # 1. YouTube variants
    vid1, plat1, url1 = parse_input_url_or_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    assert vid1 == "dQw4w9WgXcQ" and plat1 == "youtube" and "youtube.com/watch?v=dQw4w9WgXcQ" in url1

    vid2, plat2, url2 = parse_input_url_or_id("https://youtu.be/jNQXAC9IVRw")
    assert vid2 == "jNQXAC9IVRw" and plat2 == "youtube"

    vid3, plat3, url3 = parse_input_url_or_id("https://www.youtube.com/shorts/abc12345678")
    assert vid3 == "abc12345678" and plat3 == "youtube"

    # 2. Instagram variants
    ig1, plat_ig1, url_ig1 = parse_input_url_or_id("https://www.instagram.com/reel/C8xyz123abc/")
    assert ig1 == "C8xyz123abc" and plat_ig1 == "instagram" and "instagram.com/p/C8xyz123abc" in url_ig1

    ig2, plat_ig2, url_ig2 = parse_input_url_or_id("https://www.instagram.com/p/C-foo_bar/")
    assert ig2 == "C-foo_bar" and plat_ig2 == "instagram"

    # 3. Flipkart: auto-converts /p/ to /product-reviews/ and preserves pid
    flp_id, plat_flp, url_flp = parse_input_url_or_id(
        "https://www.flipkart.com/realme-12-pro-5g/p/itme12345?pid=MOBGH73XHZ6QG9FZ&marketplace=FLIPKART"
    )
    assert flp_id == "MOBGH73XHZ6QG9FZ"
    assert plat_flp == "flipkart"
    assert "/product-reviews/" in url_flp
    assert "pid=MOBGH73XHZ6QG9FZ" in url_flp

    # 4. Amazon: extracts ASIN and constructs canonical URL
    amz_asin, plat_amz, url_amz = parse_input_url_or_id(
        "https://www.amazon.in/Apple-iPhone-15-128-GB/dp/B0CHX1W1XY/ref=sr_1_1"
    )
    assert amz_asin == "B0CHX1W1XY"
    assert plat_amz == "amazon"
    assert "product-reviews/B0CHX1W1XY" in url_amz

    # 5. Presets
    demo_id, demo_plat, _ = parse_input_url_or_id("yt_demo_72neg")
    assert demo_id == "yt_demo_72neg" and demo_plat == "youtube"


def test_instagram_extractor_waterfall_routing(monkeypatch):
    """
    Verify InstagramExtractor 3-tier waterfall:
    - Tier 1: Graph API
    - Tier 2: Apify
    - Tier 3: Instaloader
    - Demo preset: returns DEMO PRESET badge
    """
    # Demo preset
    ig = InstagramExtractor()
    demo_res = ig.extract("ig_demo_creator_reel", is_demo=True)
    assert demo_res.is_demo is True
    assert demo_res.data_source_badge == "DEMO PRESET: Offline Sample Dataset"

    # Tier 2 Apify routing
    called_apify = False

    def mock_fetch_apify(self, post_url, max_comments=None):
        nonlocal called_apify
        called_apify = True
        return [
            CommentInput(
                comment_id="apify_mock_1",
                raw_text="Awesome reel and great edit!",
                timestamp="2026-11-03T00:00:00Z",
                like_count=42,
                anonymized_author_id="mock_author_1234",
            )
        ]

    monkeypatch.setattr(InstagramExtractor, "_fetch_apify", mock_fetch_apify)

    ig_apify = InstagramExtractor(apify_token="apify_test_token_123")
    res_apify = ig_apify.extract("https://www.instagram.com/reel/C8xyz123abc/")
    assert called_apify is True
    assert res_apify.data_source_badge == "LIVE: Instagram Apify Scraper"
    assert len(res_apify.comments) == 1


def test_flipkart_html_review_parser_and_verified_buyer():
    """
    Verify FlipkartExtractor DOM parsing:
    - Extracts star ratings (1★–5★)
    - Concatenates review title and review body
    - Identifies Certified Buyer badge
    """
    sample_flipkart_html = """
    <div class="RcXBOT">
      <div class="col EPCmJX">
        <div class="row">
          <div class="XQDdHH">4 <img src="star.svg"></div>
          <p class="z9E0IG">Terrific purchase</p>
        </div>
        <div class="row">
          <div class="ZmyHeo"><div><div>The camera quality is superb in daylight, fast charging is really good.</div></div></div>
        </div>
        <div class="row">
          <p class="_2NsDsF">Ankit Verma</p>
          <p class="MztJPv"><span>Certified Buyer</span></p>
        </div>
      </div>
    </div>
    """
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(sample_flipkart_html, "html.parser")
    card = soup.select_one("div.col.EPCmJX, div.RcXBOT")
    assert card is not None

    rating_elem = card.select_one("div.XQDdHH, div._3LWZlK")
    rating = int(float(rating_elem.get_text(strip=True).split()[0]))
    assert rating == 4

    title_elem = card.select_one("p.z9E0IG, p._2-N8zT")
    title = title_elem.get_text(strip=True)
    body_elem = card.select_one("div.ZmyHeo")
    body = body_elem.get_text(separator=" ", strip=True)
    full_text = f"{title}. {body}"
    assert "Terrific purchase" in full_text
    assert "The camera quality is superb" in full_text

    cert_elem = card.select_one("p.MztJPv")
    assert cert_elem is not None
    assert "Certified Buyer" in cert_elem.get_text()


@pytest.mark.anyio
async def test_runtime_api_keys_settings_endpoint():
    """
    Verify GET /api/settings/keys and POST /api/settings/keys:
    - Successfully updates environment variables at runtime
    - Returns masked keys for frontend dashboard security
    """
    from app.main import get_settings_keys, update_settings_keys
    from app.schemas import SettingsKeysUpdate

    original_key = os.environ.get("YOUTUBE_API_KEY", "")

    # 1. Update keys via endpoint
    update_payload = SettingsKeysUpdate(
        youtube_api_key="AIzaSy_TEST_RUNTIME_KEY_XYZ999",
        apify_api_token="apify_test_token_abc123",
    )
    update_res = await update_settings_keys(update_payload)
    assert update_res["status"] == "success"
    assert os.environ["YOUTUBE_API_KEY"] == "AIzaSy_TEST_RUNTIME_KEY_XYZ999"
    assert os.environ["APIFY_API_TOKEN"] == "apify_test_token_abc123"

    # 2. Get masked keys
    settings_res = await get_settings_keys()
    assert settings_res.youtube_api_key_configured is True
    assert settings_res.apify_api_token_configured is True
    assert "..." in settings_res.masked_keys["youtube_api_key"]
    assert settings_res.masked_keys["youtube_api_key"].startswith("AIza")

    # Restore original key
    if original_key:
        os.environ["YOUTUBE_API_KEY"] = original_key
    await update_settings_keys(SettingsKeysUpdate(
        youtube_api_key=original_key,
        apify_api_token=os.environ.get("APIFY_API_TOKEN", "apify_test_token_abc123"),
    ))


def test_normalize_timestamp_unit():
    """
    Verify preprocessor.normalize_timestamp converts relative time strings,
    UNIX epochs, Amazon review strings, and standard dates to valid ISO-8601 UTC.
    """
    from app.preprocessor import CommentPreprocessor
    cp = CommentPreprocessor()

    # Relative time
    ts_hours = cp.normalize_timestamp("4 hours ago")
    assert "T" in ts_hours and ts_hours.endswith("Z")

    ts_days = cp.normalize_timestamp("3 days ago")
    assert "T" in ts_days and ts_days.endswith("Z")

    # Amazon format
    ts_amz = cp.normalize_timestamp("Reviewed in India on 15 October 2026")
    assert "2026-10-15" in ts_amz

    # UNIX epoch
    ts_epoch = cp.normalize_timestamp(1700000000)
    assert "T" in ts_epoch and ts_epoch.endswith("Z")

    # Empty or none
    ts_fallback = cp.normalize_timestamp(None)
    assert "T" in ts_fallback and ts_fallback.endswith("Z")


@pytest.mark.anyio
async def test_browser_ingestion_endpoint():
    """
    Verify POST /api/ingest-browser:
    - Ingests real browser-scraped payload
    - Computes 100% negative root causes
    - Computes dynamic keyword frequencies
    - Computes star rating distribution
    - Caches report with 'LIVE: Browser Extension (Verified)' badge
    """
    from app.main import ingest_browser
    from app.schemas import BrowserIngestRequest, CommentInput
    from fastapi import BackgroundTasks

    payload = BrowserIngestRequest(
        post_url="https://www.instagram.com/reel/C8browserTest/",
        post_id="C8browserTest",
        title="Live Instagram Test Post",
        platform="instagram",
        comments=[
            CommentInput(
                comment_id="ig_ext_1",
                raw_text="App crash on mobile whenever I open the dashboard! Terrible bug",
                timestamp="2 hours ago",
                like_count=15,
                anonymized_author_id="hash_user_1",
            ),
            CommentInput(
                comment_id="ig_ext_2",
                raw_text="Bhai this tutorial was super helpful and mast explanation! Loved it 🔥",
                timestamp="5 hours ago",
                like_count=45,
                anonymized_author_id="hash_user_2",
            ),
            CommentInput(
                comment_id="ig_ext_3",
                raw_text="Audio sync is completely broken in the second half. Buzzing sound",
                timestamp="1 day ago",
                like_count=5,
                anonymized_author_id="hash_user_3",
            ),
        ],
        model_option="vader_hybrid",
    )

    bg_tasks = BackgroundTasks()
    report = await ingest_browser(payload, bg_tasks)

    assert report.post_id == "C8browserTest"
    assert report.platform == "instagram"
    assert report.total_raw_comments == 3
    assert report.data_source_badge == "LIVE: Browser Extension (Verified)"
    assert report.keyword_frequencies is not None
    assert len(report.keyword_frequencies) > 0
    # Root causes for negatives must cover 100% of negative comments
    neg_count = sum(r.comment_count for r in report.breakdown if r.category == "Negative")
    root_cause_sum = sum(rc.count for rc in report.tier2_root_causes)
    assert root_cause_sum == neg_count


def test_blocked_live_extractor_raises_value_error():
    """
    Verify live extractors do NOT generate fake synthetic comments when blocked;
    instead they raise a descriptive ValueError prompting the browser extension.
    """
    from app.extractor import AmazonExtractor, FlipkartExtractor, InstagramExtractor
    import pytest

    amz = AmazonExtractor()
    with pytest.raises(ValueError, match="Amazon live scraping blocked"):
        amz.extract("https://www.amazon.in/dp/B0XYZFAKE99", is_demo=False)

    flp = FlipkartExtractor()
    with pytest.raises(ValueError, match="Flipkart live scraping blocked"):
        flp.extract("https://www.flipkart.com/test-product/p/itm123456fake?pid=XYZ999", is_demo=False)

    ig = InstagramExtractor()
    with pytest.raises(ValueError, match="Instagram live scraping blocked"):
        ig.extract("https://www.instagram.com/p/FAKE1234567/", is_demo=False)


def test_deepmoji_emotion_conflict_and_scoring():
    """Verify 64-Emoji DeepMoji conflict detection, irony flags, confidence & subjectivity."""
    from app.preprocessor import CommentPreprocessor, DeepMojiEmotionEngine

    cp = CommentPreprocessor()

    # Positive text with negative emojis -> sarcasm & conflict detected
    sarcastic_conflict = "Great job on the latest update guys 🤡😡👎"
    res1 = cp.preprocess(sarcastic_conflict)
    assert res1["irony_sarcasm_detected"] is True
    assert res1["is_sarcastic"] is True

    # High subjectivity text
    subj_text = "I personally felt this is the worst and most laggy experience ever!"
    res2 = cp.preprocess(subj_text)
    assert res2["subjectivity_score"] >= 0.50
    assert 0.0 <= res2["confidence_score"] <= 1.0


@pytest.mark.anyio
async def test_sqlite_history_db_and_endpoints():
    """Verify SQLite sentiment_hub.db saves reports, returns history, and deletes records."""
    from app.main import get_history, delete_history_item, execute_analysis_pipeline
    from app.schemas import AnalyzeRequest
    from app.history_db import HistoryDB

    # Run pipeline for demo post
    req = AnalyzeRequest(post_id="yt_demo_72neg", is_demo=True)
    report = execute_analysis_pipeline(req)

    # Check history endpoint returns the saved report
    history = await get_history(limit=10)
    assert len(history) > 0
    found = any(h["post_id"] == "yt_demo_72neg" for h in history)
    assert found is True

    # Delete test record
    del_res = await delete_history_item("yt_demo_72neg")
    assert del_res["success"] is True


@pytest.mark.anyio
async def test_multi_comparison_endpoint():
    """Verify POST /api/compare computes sentiment deltas and determines winner."""
    from app.main import compare_posts, execute_analysis_pipeline
    from app.schemas import CompareRequest, AnalyzeRequest

    # Pre-populate both demo reports
    execute_analysis_pipeline(AnalyzeRequest(post_id="yt_demo_72neg", is_demo=True))
    execute_analysis_pipeline(AnalyzeRequest(post_id="amz_smartphone_reviews", is_demo=True))

    payload = CompareRequest(post_id_a="yt_demo_72neg", post_id_b="amz_smartphone_reviews")
    compare_res = await compare_posts(payload)

    assert compare_res.report_a.post_id == "yt_demo_72neg"
    assert compare_res.report_b.post_id == "amz_smartphone_reviews"
    assert isinstance(compare_res.delta_positive_pct, float)
    assert isinstance(compare_res.delta_negative_pct, float)
    assert compare_res.winner in ("yt_demo_72neg", "amz_smartphone_reviews")


def test_universal_ecommerce_and_expanded_platforms():
    """Verify URL detection and extraction for Myntra, Meesho, Nykaa, and Ajio."""
    from app.extractor import parse_input_url_or_id, UniversalEcommerceExtractor

    # 1. URL detection
    myntra_url = "https://www.myntra.com/dresses/tokyo-talkies/women-navy-blue-maxi-dress/12345/buy"
    pid, plat, _ = parse_input_url_or_id(myntra_url)
    assert plat == "myntra"

    meesho_url = "https://www.meesho.com/wireless-bluetooth-earbuds/p/1a2b3c"
    _, plat_m, _ = parse_input_url_or_id(meesho_url)
    assert plat_m == "meesho"

    nykaa_url = "https://www.nykaa.com/matte-liquid-lipstick/p/98765"
    _, plat_n, _ = parse_input_url_or_id(nykaa_url)
    assert plat_n == "nykaa"

    ajio_url = "https://www.ajio.com/cotton-slim-fit-shirt/p/54321"
    _, plat_a, _ = parse_input_url_or_id(ajio_url)
    assert plat_a == "ajio"

    # 2. Universal extraction on live URL without browser session blocks cleanly with ValueError (Zero fake data)
    extractor = UniversalEcommerceExtractor(platform="myntra")
    with pytest.raises(ValueError) as excinfo:
        extractor.extract(myntra_url, max_comments=50, fallback_on_blocked=False)
    assert "Sentinelytics Chrome Extension" in str(excinfo.value) or "Could not extract" in str(excinfo.value)


@pytest.mark.anyio
async def test_instagram_browser_ingestion_and_no_overwrite():
    """
    Verify Instagram Browser Ingestion & Anti-Overwrite Protection:
    - Ingesting 500 comments for https://www.instagram.com/p/DFc6yh2NpZX/?hl=en normalizes post_id to DFc6yh2NpZX
    - GET /api/report/DFc6yh2NpZX returns real browser comments with Verified badge
    - POST /api/analyze with post_id=DFc6yh2NpZX preserves real comments and never overwrites with synthetic data
    """
    from app.main import ingest_browser, get_cached_report, analyze_post
    from app.schemas import BrowserIngestRequest, CommentInput, AnalyzeRequest
    from fastapi import BackgroundTasks

    shortcode = "DFc6yh2NpZX"
    test_url = f"https://www.instagram.com/p/{shortcode}/?hl=en"

    comments = [
        CommentInput(
            comment_id=f"ig_real_{i}",
            raw_text=f"Authentic user comment #{i} on Samay reel - timing and comedy is legendary!",
            timestamp="2026-11-07T12:00:00Z",
            like_count=i + 5,
            anonymized_author_id=f"user_samay_{i}",
        )
        for i in range(500)
    ]

    payload = BrowserIngestRequest(
        post_url=test_url,
        post_id=test_url,
        title="Samay Raina Reel",
        platform="instagram",
        comments=comments,
        model_option="vader_hybrid",
    )

    bg = BackgroundTasks()
    ingest_res = await ingest_browser(payload, bg)
    assert ingest_res.post_id == shortcode
    assert ingest_res.total_valid_comments == 500
    assert "Browser Extension" in ingest_res.data_source_badge

    # 1. Test GET /api/report/DFc6yh2NpZX
    cached_res = await get_cached_report(shortcode)
    assert cached_res.post_id == shortcode
    assert cached_res.total_valid_comments == 500
    assert "Authentic user comment #0" in cached_res.sample_comments[0].raw_text

    # 2. Test POST /api/analyze with DFc6yh2NpZX (without custom_comments payload)
    analyze_req = AnalyzeRequest(
        post_id=shortcode,
        platform="instagram",
        model_option="vader_hybrid",
    )
    analyze_res = await analyze_post(analyze_req, bg)
    assert analyze_res.post_id == shortcode
    assert analyze_res.total_valid_comments == 500
    assert "Authentic user comment #0" in analyze_res.sample_comments[0].raw_text
    assert "Browser Extension" in analyze_res.data_source_badge


@pytest.mark.anyio
async def test_quick_analyze_endpoint_and_sarcasm_counter():
    """Verify POST /api/analyze-quick instant preview and sarcasm counting."""
    from app.main import analyze_quick

    payload = {
        "comments": [
            {"author": "user1", "text": "great update guys 🤡 broken completely"},
            {"author": "user2", "text": "badiya battery backup 😭 drains in 1 hour"},
            {"author": "user3", "text": "fantastic performance, smooth and snappy"},
            {"author": "user4", "text": "okay average video nothing special"},
            {"author": "user5", "text": "app crash freeze whenever I click login"},
        ],
        "platform": "instagram"
    }

    res = await analyze_quick(payload)
    assert res["total_comments"] == 5
    assert res["negative_count"] >= 3
    assert res["positive_count"] >= 1
    assert res["sarcastic_count"] >= 2
    assert isinstance(res["health_badge"], str)
    assert len(res["preview_comments"]) == 3
    assert any(c["is_sarcastic"] for c in res["preview_comments"])


@pytest.mark.anyio
async def test_browser_ingestion_with_flexible_field_aliases():
    """
    Verify flexible field alias normalization and zero demo fallback:
    - Accepts 'text', 'comment', 'review_text', 'body' -> 'raw_text'
    - Accepts 'author', 'user', 'reviewer' -> 'anonymized_author_id'
    - Accepts 'rating', 'stars' -> 'star_rating'
    - Prevents 422 validation failure
    - Re-uses cached browser report on subsequent analyze requests
    - Rejects empty or whitespace-only comment payloads with HTTP 400
    """
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)

    # 1. Test ingestion with flexible field aliases
    payload = {
        "post_url": "https://www.flipkart.com/item/p/itm_flp_test_99",
        "post_id": "itm_flp_test_99",
        "title": "Genuine Test Product",
        "platform": "flipkart",
        "comments": [
            {"text": "Genuine review, outstanding performance and fast delivery!", "rating": 5, "author": "Real User 1"},
            {"comment": "Worst display quality, cracked screen on arrival", "stars": 1, "reviewer": "Real User 2"},
            {"review_text": "Average battery life, works for daily usage", "rating": 3, "user": "Real User 3"}
        ]
    }

    res = client.post("/api/ingest-browser", json=payload)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["post_id"] == "itm_flp_test_99"
    assert data["total_valid_comments"] == 3
    assert data["data_source_badge"] == "LIVE: Browser Extension (Verified)"
    assert data["is_demo"] is False
    assert len(data["sample_comments"]) == 3

    # Check star ratings preserved
    stars_present = [c.get("star_rating") for c in data["sample_comments"]]
    assert 5 in stars_present
    assert 1 in stars_present
    assert 3 in stars_present

    # 2. Subsequent POST /api/analyze for itm_flp_test_99 re-uses authentic cached data
    analyze_res = client.post("/api/analyze", json={"post_id": "itm_flp_test_99", "platform": "flipkart"})
    assert analyze_res.status_code == 200, analyze_res.text
    a_data = analyze_res.json()
    assert a_data["post_id"] == "itm_flp_test_99"
    assert a_data["total_valid_comments"] == 3
    assert a_data["data_source_badge"] == "LIVE: Browser Extension (Verified)"
    assert a_data["is_demo"] is False

    # 3. Test empty comments payload rejection with 400
    bad_res_1 = client.post("/api/ingest-browser", json={
        "post_url": "https://www.flipkart.com/item/p/empty",
        "comments": []
    })
    assert bad_res_1.status_code == 400

    bad_res_2 = client.post("/api/ingest-browser", json={
        "post_url": "https://www.flipkart.com/item/p/whitespace",
        "comments": [{"text": "   "}]
    })
    assert bad_res_2.status_code == 400
    assert "No reviews found" in bad_res_2.json()["detail"]


@pytest.mark.anyio
async def test_flipkart_multiple_review_cards_extraction_and_zero_synthetic_padding():
    """
    Verify:
    1. Direct parsing of 5 distinct Flipkart review cards extracts all 5 reviews accurately.
    2. Star ratings (5, 4, 3, 2, 1) and titles/bodies are parsed with zero collisions.
    3. Ingesting them sets data_source_badge='LIVE: Browser Extension (Verified)', is_demo=False.
    4. Exactly 5 reviews are preserved: ZERO fake/synthetic reviews are generated or padded.
    """
    from fastapi.testclient import TestClient
    from bs4 import BeautifulSoup
    from app.main import app

    # Simulated Flipkart HTML containing 5 distinct review cards with "Certified Buyer"
    html_markup = """
    <div class="col JOp12">
      <div class="col EPCmJX">
        <div class="XQDdHH">5 ★</div>
        <p class="z9E0IG">Terrific purchase</p>
        <div class="ZmyHeo">Super fast delivery and great build quality! Battery easily lasts 2 days. READ MORE</div>
        <p class="_2NsDsF">Rohan Sharma</p>
        <span class="_2mcMHG">Certified Buyer</span>
      </div>
      <div class="col EPCmJX">
        <div class="XQDdHH">4 ★</div>
        <p class="z9E0IG">Value-for-money</p>
        <div class="ZmyHeo">Good display and sound quality. Camera is decent in daylight but average in low light. READ MORE</div>
        <p class="_2NsDsF">Priya Verma</p>
        <span class="_2mcMHG">Certified Buyer</span>
      </div>
      <div class="col EPCmJX">
        <div class="XQDdHH">3 ★</div>
        <p class="z9E0IG">Average experience</p>
        <div class="ZmyHeo">Heating issues during charging. Performance is okay for daily use but not for gaming. READ MORE</div>
        <p class="_2NsDsF">Amit Kumar</p>
        <span class="_2mcMHG">Certified Buyer</span>
      </div>
      <div class="col EPCmJX">
        <div class="XQDdHH">2 ★</div>
        <p class="z9E0IG">Disappointing</p>
        <div class="ZmyHeo">Delivery was delayed by 5 days and box seal was torn. Product looks slightly used. READ MORE</div>
        <p class="_2NsDsF">Sneha Patel</p>
        <span class="_2mcMHG">Certified Buyer</span>
      </div>
      <div class="col EPCmJX">
        <div class="XQDdHH">1 ★</div>
        <p class="z9E0IG">Defective product</p>
        <div class="ZmyHeo">Screen flickering and touch sensor not responding at all. Return request is pending! READ MORE</div>
        <p class="_2NsDsF">Vikram Singh</p>
        <span class="_2mcMHG">Certified Buyer</span>
      </div>
    </div>
    """

    soup = BeautifulSoup(html_markup, "html.parser")
    cards = soup.select("div.col.EPCmJX")
    assert len(cards) == 5

    parsed_reviews = []
    for idx, c in enumerate(cards):
        rating_elem = c.select_one("div.XQDdHH")
        star = int(rating_elem.get_text(strip=True).split()[0])
        title_elem = c.select_one("p.z9E0IG")
        title = title_elem.get_text(strip=True) if title_elem else ""
        body_elem = c.select_one("div.ZmyHeo")
        body = body_elem.get_text(strip=True).replace("READ MORE", "").strip() if body_elem else ""
        full_text = f"{title}. {body}" if title and not body.startswith(title) else body
        author_elem = c.select_one("p._2NsDsF")
        author = author_elem.get_text(strip=True) if author_elem else f"user_{idx}"
        is_verified = "Certified Buyer" in c.get_text()

        parsed_reviews.append({
            "raw_text": full_text,
            "star_rating": star,
            "anonymized_author_id": author,
            "verified_purchase": is_verified,
        })

    assert len(parsed_reviews) == 5
    assert [r["star_rating"] for r in parsed_reviews] == [5, 4, 3, 2, 1]

    # Ingest the 5 parsed reviews through /api/ingest-browser
    client = TestClient(app)
    ingest_res = client.post("/api/ingest-browser", json={
        "post_url": "https://www.flipkart.com/item/p/itm_flp_real_5_reviews",
        "post_id": "itm_flp_real_5_reviews",
        "title": "Flipkart Real 5 Reviews Test",
        "platform": "flipkart",
        "comments": parsed_reviews,
    })

    assert ingest_res.status_code == 200, ingest_res.text
    data = ingest_res.json()
    assert data["post_id"] == "itm_flp_real_5_reviews"
    assert data["total_valid_comments"] == 5
    assert data["data_source_badge"] == "LIVE: Browser Extension (Verified)"
    assert data["is_demo"] is False
    assert len(data["sample_comments"]) == 5

    # Verify each distinct review is preserved with exact star rating and zero synthetic padding
    extracted_texts = [c["raw_text"] for c in data["sample_comments"]]
    assert any("Terrific purchase" in t for t in extracted_texts)
    assert any("Value-for-money" in t for t in extracted_texts)
    assert any("Average experience" in t for t in extracted_texts)
    assert any("Disappointing" in t for t in extracted_texts)
    assert any("Defective product" in t for t in extracted_texts)

    ratings_in_data = [c.get("star_rating") for c in data["sample_comments"]]
    assert set(ratings_in_data) == {1, 2, 3, 4, 5}

    # Verify subsequent POST /api/analyze does NOT regenerate or pad fake data
    analyze_res = client.post("/api/analyze", json={
        "post_id": "itm_flp_real_5_reviews",
        "platform": "flipkart"
    })
    assert analyze_res.status_code == 200
    a_data = analyze_res.json()
    assert a_data["total_valid_comments"] == 5
    assert a_data["is_demo"] is False
    assert a_data["data_source_badge"] == "LIVE: Browser Extension (Verified)"


def test_flipkart_2026_acer_nitro_review_card_parsing():
    """
    Verify 2026 Flipkart DOM review card structure (Acer Nitro 5 live test format):
    - Star header: '5.0 • Fabulous!'
    - Product variant noise: 'Review for: Color Herald Grey • Dedicated Graphic Memory Capacity 8 GB...'
    - Review body: 'Amazing laptop.'
    - Reviewer line: 'Saurabh Adhikari, Nainital'
    - Upvote counter noise: 'Helpful for 5'
    - Verification anchor: 'Verified Purchase • 26 days ago'

    Ensures:
    1. Extracted raw_text is 'Fabulous! — Amazing laptop.'
    2. Does NOT include 'Review for: Color Herald Grey...' or 'Helpful for 5' or JSON fragments
    3. Extracted star_rating is 5
    4. Author is 'Saurabh Adhikari, Nainital'
    5. verified_purchase is True
    6. Timestamp is normalized from '26 days ago' to standard ISO-8601 UTC
    """
    from bs4 import BeautifulSoup
    from app.extractor import FlipkartExtractor
    from app.preprocessor import CommentPreprocessor
    import hashlib

    acer_nitro_html = """
    <html>
      <head><title>Acer Nitro 5 Intel Core i5 14th Gen - (16 GB/512 GB SSD/Windows 11 Home/8 GB Graphics)</title></head>
      <body>
        <div class="reviews-list-container">
          <div class="review-card-wrapper EPCmJX">
            <div class="rating-title-row">5.0 • Fabulous!</div>
            <div class="variant-info">Review for: Color Herald Grey • Dedicated Graphic Memory Capacity 8 GB • Processor Gen 14th Gen...</div>
            <div class="review-body-text">Amazing laptop.</div>
            <div class="reviewer-name-loc">Saurabh Adhikari, Nainital</div>
            <div class="helpful-btn-row">Helpful for 5</div>
            <div class="verified-badge-row">Verified Purchase • 26 days ago</div>
          </div>
          <div class="review-card-wrapper EPCmJX">
            <div class="rating-title-row">4.0 • Good device</div>
            <div class="variant-info">Review for: Color Black • 16 GB</div>
            <div class="review-body-text">Great performance for gaming and coding. Battery backup could be better.</div>
            <div class="reviewer-name-loc">Rahul Verma, Pune</div>
            <div class="helpful-btn-row">Helpful for 2</div>
            <div class="verified-badge-row">Verified Purchase • 14 days ago</div>
          </div>
        </div>
      </body>
    </html>
    """

    soup = BeautifulSoup(acer_nitro_html, "html.parser")
    fe = FlipkartExtractor()
    extracted_reviews = fe.parse_flipkart_review_cards_from_soup(soup, clean_id="acer_nitro_5")

    assert len(extracted_reviews) == 2

    r1 = extracted_reviews[0]
    # 1. Extracted raw_text is "Fabulous! — Amazing laptop."
    assert r1.raw_text == "Fabulous! — Amazing laptop."
    # 2. Does NOT include variant info, helpful counter, or JSON fragments
    assert "Review for:" not in r1.raw_text
    assert "Color Herald Grey" not in r1.raw_text
    assert "Helpful for" not in r1.raw_text
    assert "viewAllImageUrl" not in r1.raw_text
    assert "tracking:" not in r1.raw_text
    assert "Acer Nitro 5" not in r1.raw_text

    # 3. Star rating is 5
    assert r1.star_rating == 5

    # 4. Author is "Saurabh Adhikari, Nainital" (verified via anonymized author hash)
    expected_author_hash = hashlib.sha256("Saurabh Adhikari, Nainital".encode()).hexdigest()[:16]
    assert r1.anonymized_author_id == expected_author_hash

    # 5. Verified purchase is True
    assert r1.verified_purchase is True

    # 6. Timestamp is normalized from "26 days ago"
    assert r1.timestamp == "26 days ago"
    cp = CommentPreprocessor()
    normalized_ts = cp.normalize_timestamp(r1.timestamp)
    assert "T" in normalized_ts and normalized_ts.endswith("Z")


def test_flipkart_screenshot_malformed_reviews_and_deduplication():
    """
    Verify fixes for the exact Flipkart bugs from the user's live screenshots:
    1. Input 1: "Fabulous! Amazing laptop. Saurabh Adhikari · 27 days ago" with header
       "5.0 • Fabulous!" and footer "Helpful for 5 \n 2":
       - star_rating == 5 (NOT 2!)
       - author == "Saurabh Adhikari"
       - raw_text == "Fabulous! — Amazing laptop."
       - timestamp is normalized to ~27 days before today (NOT today's timestamp!)
    2. Input 2: "Highly recommended great Hriday Kashyap · 23 days ago" and
       "• — Highly recommended great Hriday Kashyap Helpful · 23 days ago":
       - Normalize to the EXACT SAME deduplication key
       - Produce only 1 entry ("Highly recommended — great" by "Hriday Kashyap")
    """
    from bs4 import BeautifulSoup
    from app.extractor import FlipkartExtractor
    from app.preprocessor import CommentPreprocessor
    from app.schemas import CommentInput
    from datetime import datetime, timezone, timedelta

    # 1. Test Input 1: Card with header "5.0 • Fabulous!", body text containing author/date suffix, and footer dislike "2"
    card1_html = """
    <html>
      <body>
        <div class="reviews-list-container">
          <div class="review-card-wrapper EPCmJX">
            <div class="rating-title-row">5.0 • Fabulous!</div>
            <div class="review-body-text">Amazing laptop. Saurabh Adhikari · 27 days ago</div>
            <div class="helpful-footer">
              <span>Helpful for 5</span>
              <span class="dislike-count">2</span>
            </div>
          </div>
        </div>
      </body>
    </html>
    """
    soup1 = BeautifulSoup(card1_html, "html.parser")
    fe = FlipkartExtractor()
    extracted1 = fe.parse_flipkart_review_cards_from_soup(soup1, clean_id="acer_nitro")
    assert len(extracted1) == 1
    r1 = extracted1[0]

    # Star rating is 5 (NOT 2 from dislike footer!)
    assert r1.star_rating == 5

    # Author is Saurabh Adhikari (extracted from suffix)
    assert r1.author == "Saurabh Adhikari"

    # raw_text is "Fabulous! — Amazing laptop."
    assert r1.raw_text == "Fabulous! — Amazing laptop."

    # Timestamp normalized from "27 days ago" is 27 days before today (NOT today's timestamp!)
    assert r1.timestamp == "27 days ago"
    cp = CommentPreprocessor()
    norm_ts = cp.normalize_timestamp(r1.timestamp)
    now = datetime.now(timezone.utc)
    expected_approx_date = (now - timedelta(days=27)).strftime("%Y-%m-%d")
    today_date = now.strftime("%Y-%m-%d")
    assert norm_ts.startswith(expected_approx_date), f"Expected date {expected_approx_date}, got {norm_ts}"
    assert not norm_ts.startswith(today_date), "Timestamp should NOT be today's date!"

    # 2. Test Input 2: Two duplicate cards that differ only by bullet/dash prefix and "Helpful" suffix
    card2_html = """
    <html>
      <body>
        <div class="reviews-list-container">
          <div class="review-card-wrapper EPCmJX">
            <div class="rating-title-row">5.0 • Highly recommended</div>
            <div class="review-body-text">great Hriday Kashyap · 23 days ago</div>
          </div>
          <div class="review-card-wrapper EPCmJX">
            <div class="rating-title-row">• — Highly recommended</div>
            <div class="review-body-text">great Hriday Kashyap Helpful · 23 days ago</div>
          </div>
        </div>
      </body>
    </html>
    """
    soup2 = BeautifulSoup(card2_html, "html.parser")
    extracted2 = fe.parse_flipkart_review_cards_from_soup(soup2, clean_id="acer_nitro")

    # Extractor deduplication produces only 1 review
    assert len(extracted2) == 1
    r2 = extracted2[0]
    assert r2.raw_text == "Highly recommended — great"
    assert r2.author == "Hriday Kashyap"
    assert r2.timestamp == "23 days ago"

    # Preprocessor deduplication also catches both strings if fed as CommentInputs
    raw_inputs = [
        CommentInput(
            comment_id="c1",
            raw_text="Highly recommended great Hriday Kashyap · 23 days ago",
            timestamp="23 days ago",
            anonymized_author_id="usr_3112",
            author="Hriday Kashyap",
        ),
        CommentInput(
            comment_id="c2",
            raw_text="• — Highly recommended great Hriday Kashyap Helpful · 23 days ago",
            timestamp="23 days ago",
            anonymized_author_id="usr_3112",
            author="Hriday Kashyap",
        ),
    ]
    cleaned_comments, removed_count = cp.filter_bots_and_spam(raw_inputs)
    assert len(cleaned_comments) == 1
    assert removed_count == 1


@pytest.mark.anyio
async def test_rapidapi_instagram_and_settings_endpoints():
    """
    Verify RapidAPI endpoint and key settings for both Instagram and Amazon:
    - /api/settings/keys returns rapidapi_key_configured
    - /api/instagram/rapidapi returns status when called
    - /api/amazon/rapidapi returns status when called
    """
    from app.main import get_settings_keys, update_settings_keys, fetch_instagram_rapidapi, fetch_amazon_rapidapi
    from app.schemas import SettingsKeysUpdate, RapidApiInstagramRequest, RapidApiAmazonRequest

    import os
    orig_key = os.environ.get("RAPIDAPI_KEY", "")

    # Test settings update
    await update_settings_keys(SettingsKeysUpdate(rapidapi_key="test_rapid_key_12345"))
    keys_resp = await get_settings_keys()
    assert keys_resp.rapidapi_key_configured is True
    assert "rapidapi_key" in keys_resp.masked_keys

    # Test /api/instagram/rapidapi endpoint with shortcode
    req = RapidApiInstagramRequest(shortcode="C-demo123", max_comments=10)
    rapid_res = await fetch_instagram_rapidapi(req)
    assert rapid_res["status"] in ("ok", "no_key", "quota_exceeded")

    # Test /api/amazon/rapidapi endpoint with ASIN
    amz_req = RapidApiAmazonRequest(asin="B09X6GMNP7", country_code="IN", max_reviews=10)
    amz_res = await fetch_amazon_rapidapi(amz_req)
    assert amz_res["status"] in ("ok", "no_key")

    # Restore original RapidAPI key in settings
    if orig_key:
        await update_settings_keys(SettingsKeysUpdate(rapidapi_key=orig_key))


