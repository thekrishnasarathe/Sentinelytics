"""
Social Media & E-Commerce Review & Comment Extractors:
- YouTubeExtractor (Live Zero-Key Scraper via youtube-comment-downloader + YouTube Data API v3 fallback)
- InstagramExtractor (Instagram Graph API + demo fallback)
- AmazonExtractor (Live HTML Scraper via BeautifulSoup + Rainforest API + demo fallback)
- FlipkartExtractor (Live HTML Scraper via BeautifulSoup + Flipkart API + demo fallback)
- parse_url_and_detect_platform (Automatic URL Parser & Platform Detector)
"""

import os
import re
import json
import time
import hashlib
import itertools
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from typing import List, Dict, Any, Optional, Tuple
import httpx
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from .schemas import CommentInput, PostInput
from .preprocessor import CommentPreprocessor

# Load environment variables automatically
load_dotenv()
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

DEMO_POST_IDS = {
    "yt_demo_72neg",
    "ig_demo_creator_reel",
    "amz_smartphone_reviews",
    "flp_electronics_sale",
    "yt_demo_perf_test",
}


def get_author_hash(handle: str) -> str:
    """Generate deterministic SHA-256 author hash for spam/bot deduplication."""
    return hashlib.sha256(handle.encode("utf-8")).hexdigest()[:16]


def get_rapidapi_key() -> str:
    """Always reload .env so updated runtime keys take effect without server restart."""
    for env_path in [
        Path(".env"),
        Path(__file__).resolve().parent.parent / ".env",
        Path(__file__).resolve().parent.parent.parent / ".env",
    ]:
        if env_path.exists():
            load_dotenv(dotenv_path=env_path, override=True)
    return (os.environ.get("RAPIDAPI_KEY") or "").strip()


def extract_comments_from_rapidapi_json(payload: Any, platform: str = "instagram") -> List[CommentInput]:
    """
    Universally extracts comments/reviews from any nested RapidAPI JSON structure.
    Recursively traverses dicts and lists looking for comment/review text and metadata.
    """
    results: List[CommentInput] = []
    seen_texts: Set[str] = set()

    TEXT_KEYS = (
        "text", "body", "comment", "review_text", "content", "review_comment",
        "reviewDescription", "reviewText", "caption", "textDisplay"
    )
    TITLE_KEYS = ("title", "review_title", "reviewTitle", "heading")
    AUTHOR_KEYS = ("username", "author", "user", "owner", "profile_name", "reviewer_name", "name", "userProfileName")
    RATING_KEYS = ("rating", "star_rating", "stars", "ratingScore", "score", "review_star_rating")
    DATE_KEYS = ("created_at", "created_at_utc", "timestamp", "date", "review_date", "publishedAt", "time")
    LIKE_KEYS = ("like_count", "likes", "likes_count", "helpful_votes", "helpfulVotesCount", "votes")

    def _walk(node: Any):
        if isinstance(node, dict):
            text_val = None
            for tk in TEXT_KEYS:
                val = node.get(tk)
                if isinstance(val, str) and val.strip() and len(val.strip()) > 1:
                    if not val.strip().startswith("{") and not val.strip().startswith("<"):
                        text_val = val.strip()
                        break

            if text_val:
                title_val = ""
                for tit in TITLE_KEYS:
                    tv = node.get(tit)
                    if isinstance(tv, str) and tv.strip():
                        title_val = tv.strip()
                        break

                full_text = f"{title_val} — {text_val}" if title_val and not text_val.startswith(title_val) else text_val
                norm_key = re.sub(r'[^a-zA-Z0-9]', '', full_text).lower()
                if len(norm_key) >= 3 and norm_key not in seen_texts:
                    seen_texts.add(norm_key)

                    author_name = f"{platform}_user"
                    for ak in AUTHOR_KEYS:
                        av = node.get(ak)
                        if isinstance(av, str) and av.strip():
                            author_name = av.strip()
                            break
                        elif isinstance(av, dict):
                            sub_name = av.get("username") or av.get("name")
                            if isinstance(sub_name, str) and sub_name.strip():
                                author_name = sub_name.strip()
                                break

                    stars = None
                    if platform in ("amazon", "flipkart"):
                        stars = 5
                        for rk in RATING_KEYS:
                            rv = node.get(rk)
                            if rv is not None:
                                try:
                                    stars = max(1, min(5, round(float(rv))))
                                    break
                                except Exception:
                                    pass

                    ts_str = datetime.now(timezone.utc).isoformat()
                    for dk in DATE_KEYS:
                        dv = node.get(dk)
                        if dv:
                            try:
                                ts_str = CommentPreprocessor.normalize_timestamp(str(dv))
                                break
                            except Exception:
                                pass

                    likes = 0
                    for lk in LIKE_KEYS:
                        lv = node.get(lk)
                        if lv is not None:
                            try:
                                likes = int(lv)
                                break
                            except Exception:
                                pass

                    cid = str(node.get("id") or node.get("pk") or node.get("review_id") or f"{platform}_rapid_{len(results)}")
                    verified = bool(node.get("verified_purchase", True) or node.get("is_verified", True))

                    results.append(
                        CommentInput(
                            comment_id=cid,
                            raw_text=full_text,
                            timestamp=ts_str,
                            like_count=likes,
                            anonymized_author_id=get_author_hash(author_name),
                            author=author_name,
                            star_rating=stars,
                            verified_purchase=verified,
                            platform=platform,
                        )
                    )

            for v in node.values():
                if isinstance(v, (dict, list)):
                    _walk(v)

        elif isinstance(node, list):
            for item in node:
                _walk(item)

    _walk(payload)
    return results


def parse_input_url_or_id(raw_input: str, default_platform: str = "youtube") -> Tuple[str, str, str]:
    """
    Automatic URL Parser & Platform Detector.
    Accepts full URL or raw ID/shortcode/ASIN/FSN and returns:
    (clean_id, detected_platform, canonical_url)

    1. YouTube: Detects youtube.com/watch?v=VIDEO_ID, youtu.be/VIDEO_ID, or youtube.com/shorts/VIDEO_ID
       -> returns platform="youtube", post_id=VIDEO_ID, and canonical URL.
    2. Instagram: Detects instagram.com/p/SHORTCODE, instagram.com/reel/SHORTCODE, or instagram.com/tv/SHORTCODE
       -> returns platform="instagram", post_id=SHORTCODE, and canonical URL.
    3. Flipkart: Detects flipkart.com/... URLs -> automatically converts /p/ product URLs into /product-reviews/ URLs
       (preserving pid= query param) so pagination works across all review pages.
    4. Amazon: Detects amazon.in or amazon.com URLs containing /dp/ASIN or /gp/product/ASIN or /product-reviews/ASIN
       -> extracts the 10-character ASIN and constructs the review URL.
    5. Explicit Demo Preset Guard: ONLY load sample_data/*.json when post_id is explicitly one of the 4 demo preset IDs
       (yt_demo_72neg, ig_demo_creator_reel, amz_smartphone_reviews, flp_electronics_sale).
    """
    raw = (raw_input or "").strip()

    # 1. YouTube Detection
    # Formats: youtube.com/watch?v=XXXX, youtu.be/XXXX, youtube.com/shorts/XXXX, embed/XXXX
    if "youtube.com" in raw or "youtu.be" in raw:
        m = re.search(r"(?:v=|\/shorts\/|\/embed\/|\/v\/|youtu\.be\/)([\w-]{11})", raw)
        if m:
            vid = m.group(1)
            return vid, "youtube", f"https://www.youtube.com/watch?v={vid}"
        try:
            parsed = urlparse(raw)
            qs = parse_qs(parsed.query)
            if "v" in qs and qs["v"]:
                vid = qs["v"][0]
                return vid, "youtube", f"https://www.youtube.com/watch?v={vid}"
        except Exception:
            pass

    # 2. Instagram Detection
    # Formats: instagram.com/p/XXXX, instagram.com/reel/XXXX, instagram.com/tv/XXXX
    if "instagram.com" in raw:
        m = re.search(r"\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)", raw)
        if m:
            shortcode = m.group(1)
            return shortcode, "instagram", f"https://www.instagram.com/p/{shortcode}/"
        return raw, "instagram", raw

    # 3. Flipkart Detection
    # Formats: flipkart.com/.../p/XXXX?pid=YYYY or /product-reviews/XXXX?pid=YYYY
    if "flipkart" in raw:
        m_pid = re.search(r"pid=([A-Z0-9]+)", raw, re.IGNORECASE)
        pid = m_pid.group(1) if m_pid else None

        review_url = raw
        m_item = re.search(r"\/(?:p|product-reviews)\/([a-zA-Z0-9]+)", raw)
        item_id = m_item.group(1) if m_item else (pid or "flp_item")

        # Automatically convert product page /p/ URL to /product-reviews/ URL
        if "/p/" in review_url:
            review_url = review_url.replace("/p/", "/product-reviews/")
        elif "/product-reviews/" not in review_url and "flipkart.com" in review_url:
            if pid:
                review_url = f"https://www.flipkart.com/product/product-reviews/{item_id}?pid={pid}"
            else:
                review_url = f"https://www.flipkart.com/product/product-reviews/{item_id}"

        clean_id = pid or item_id
        return clean_id, "flipkart", review_url

    # 4. Amazon Detection
    # Formats: amazon.in/dp/B0XXXX, amazon.com/gp/product/B0XXXX, amazon.in/product-reviews/B0XXXX
    if "amazon" in raw:
        m = re.search(r"\/(?:dp|gp\/product|product-reviews)\/([A-Z0-9]{10})", raw, re.IGNORECASE)
        if m:
            asin = m.group(1).upper()
            domain = "amazon.com" if ".com" in raw else "amazon.in"
            review_url = f"https://www.{domain}/product-reviews/{asin}"
            return asin, "amazon", review_url
        return raw, "amazon", raw

    # 5. Myntra Detection
    if "myntra.com" in raw:
        m_id = re.search(r"\/(\d+)(?:\/buy|\?|$)", raw) or re.search(r"\/([A-Za-z0-9_-]+)(?:\?|$)", raw)
        pid = m_id.group(1) if m_id else "myntra_item"
        return pid, "myntra", raw

    # 6. Meesho Detection
    if "meesho.com" in raw:
        m_id = re.search(r"\/p\/([A-Za-z0-9_-]+)", raw) or re.search(r"\/([A-Za-z0-9_-]+)(?:\?|$)", raw)
        pid = m_id.group(1) if m_id else "meesho_item"
        return pid, "meesho", raw

    # 7. Nykaa Detection
    if "nykaa.com" in raw:
        m_id = re.search(r"\/p\/([A-Za-z0-9_-]+)", raw) or re.search(r"\/([A-Za-z0-9_-]+)(?:\?|$)", raw)
        pid = m_id.group(1) if m_id else "nykaa_item"
        return pid, "nykaa", raw

    # 8. Ajio Detection
    if "ajio.com" in raw:
        m_id = re.search(r"\/p\/([A-Za-z0-9_-]+)", raw) or re.search(r"\/([A-Za-z0-9_-]+)(?:\?|$)", raw)
        pid = m_id.group(1) if m_id else "ajio_item"
        return pid, "ajio", raw

    # 9. Raw ID / Preset Heuristics
    if raw in DEMO_POST_IDS:
        if raw.startswith("yt_"):
            return raw, "youtube", "https://www.youtube.com/watch?v=flagged_demo_video"
        elif raw.startswith("ig_"):
            return raw, "instagram", "https://www.instagram.com/p/ig_demo_creator_reel/"
        elif raw.startswith("amz_"):
            return raw, "amazon", "https://www.amazon.in/dp/B09X6GMNP7"
        elif raw.startswith("flp_"):
            return raw, "flipkart", "https://www.flipkart.com/realme-12-pro-5g/product-reviews/itme12345?pid=MOBGH73XHZ6QG9FZ"

    # Standalone ASIN (10 alphanumeric starting with B0)
    if len(raw) == 10 and raw.isalnum() and raw.upper().startswith("B0"):
        return raw.upper(), "amazon", f"https://www.amazon.in/dp/{raw.upper()}"

    # If platform is explicitly specified as instagram, preserve shortcode
    if default_platform == "instagram" and re.match(r"^[A-Za-z0-9_-]+$", raw):
        return raw, "instagram", f"https://www.instagram.com/p/{raw}/"

    # Standalone YouTube Video ID (11 characters)
    if default_platform == "youtube" and len(raw) == 11 and re.match(r"^[\w-]+$", raw):
        return raw, "youtube", f"https://www.youtube.com/watch?v={raw}"

    # Default fallback
    return raw, default_platform, raw


# Backwards compatibility alias
parse_url_and_detect_platform = parse_input_url_or_id


# --- Realistic Sample Fallback Dataset Generators (ONLY FOR THE 4 DEMO PRESETS) ---

def generate_realistic_flagged_dataset(output_path: Optional[Path] = None) -> Dict[str, Any]:
    """Generate 1,045 raw YouTube comments for offline demo testing."""
    raw_comments: List[Dict[str, Any]] = []
    comment_counter = 1

    tech_bug_templates = [
        "App crash on mobile whenever I open the dashboard. Please fix this bug!",
        "Bekar update bhai, not working after login. Crashes immediately.",
        "great job breaking the UI 😡 Screen freezes on startup.",
        "Error 500 when submitting form. Completely broken and unusable.",
        "Mobile app keeps crashing since morning update. Worst release ever.",
        "Login failed again! Can't login with Google or email, infinite loading.",
        "Screen freezes completely after 2 minutes. What a joke of an update.",
        "Awesome bug guys, love how it crashes every time I tap settings 😡",
        "Android app won't open at all. Bilkul bekar app hai.",
        "Buttons not responding, glitchy UI, completely ruined experience.",
        "Thanks for ruining the mobile app with this buggy release 💔",
        "App closes automatically on Android 14. Fix the crash urgently!",
        "Update broke everything, screen stuck at blank page.",
    ]

    audio_video_templates = [
        "Audio sync issue throughout the second half! Please re-upload.",
        "Sound is completely out of sync by 3 seconds. Unbearable to watch.",
        "Terrible audio quality, huge echo and mic buzzing 😡",
        "Video quality is very blurry and pixelated even on 1080p.",
        "Subtitles and captions are completely broken and out of sync.",
        "Audio is desynced after 05:00 mark, lip sync is way off.",
        "Voice volume is too low, sound is muffled and terrible.",
        "Terrible lag and frame drops during the demo section.",
        "Mic distortion hurts ears! Please fix the sound engineer.",
        "Audio desync ruined the entire presentation 👎",
    ]

    content_templates = [
        "Total clickbait title and misleading thumbnail! Waste of time.",
        "Boring and superficial video, didn't cover any of the promised topics.",
        "Worst video ever, pure time waste. Expected much better.",
        "Faltu content hai bilkul, complete disappointment 👎",
        "Disappointed with this video, superficial and incomplete tutorial.",
        "Bakwas content, title says complete guide but skipped the main part.",
        "Very dull explanation, wasted 20 minutes of my life.",
        "Half-baked information, totally misleading clickbait.",
        "Bekar video, misleading advice that doesn't solve anything.",
    ]

    troll_templates = [
        "Dead channel, ratio + nobody asked for this garbage.",
        "Lmao fell off so hard. Unsubscribed immediately.",
        "Trash creator, repetitive rubbish content every week.",
        "Dislike button hit! Worst YouTuber in this space.",
        "Troll content, unsubscribed from this dead channel.",
        "Ratio + L + clown creator 👎",
        "Nobody cares about this topic anymore, channel is dying.",
    ]

    cat_distribution = [
        (tech_bug_templates, 260, "tech"),
        (audio_video_templates, 200, "av"),
        (content_templates, 160, "content"),
        (troll_templates, 100, "troll"),
    ]

    for templates, target_count, prefix in cat_distribution:
        t_len = len(templates)
        for i in range(target_count):
            text = templates[i % t_len]
            var_idx = i // t_len
            if var_idx > 0:
                text = f"{text} (Report #{var_idx})"
            author_id = get_author_hash(f"neg_user_{prefix}_{i}")
            raw_comments.append({
                "comment_id": f"yt_neg_{comment_counter:04d}",
                "raw_text": text,
                "timestamp": f"2026-10-30T01:{(comment_counter % 60):02d}:00Z",
                "like_count": (comment_counter * 3) % 45,
                "anonymized_author_id": author_id,
            })
            comment_counter += 1

    positive_templates = [
        "Helpful tutorial! Explained complex concepts very simply. 🔥",
        "Good initiative, keep making more such guides 🙌",
        "Bhai video mast hai 🔥 Best explanation ever!",
        "Sahi explanation hai, solved my problem in 5 minutes! ❤️",
        "Zabardast explanation! Everything worked perfectly 👍",
        "Super helpful thanks! Love the clean presentation 😊",
        "Loved the breakdown ❤️ Best content on this topic 💯",
        "Awesome work, really appreciate the effort 🎉",
        "Kamaal kar diya sir, bahut badiya presentation!",
        "Brilliant guide, highly recommended to all developers! ✨",
        "Shandar video! Crystal clear audio and visuals 👏",
        "Op work brother! Keep inspiring us 🚀",
    ]
    p_len = len(positive_templates)
    for i in range(180):
        text = positive_templates[i % p_len]
        var_idx = i // p_len
        if var_idx > 0:
            text = f"{text} #{var_idx}"
        author_id = get_author_hash(f"pos_user_{i}")
        raw_comments.append({
            "comment_id": f"yt_pos_{comment_counter:04d}",
            "raw_text": text,
            "timestamp": f"2026-10-30T02:{(comment_counter % 60):02d}:00Z",
            "like_count": (i * 7) % 65,
            "anonymized_author_id": author_id,
        })
        comment_counter += 1

    neutral_templates = [
        "04:15 what font is this?",
        "@rahul check this out when you get time",
        "Timestamp 10:20 is where the architecture begins.",
        "Which IDE theme and font are you using in this video?",
        "Is this compatible with Python 3.12 or Python 3.10?",
        "Is there a part 2 coming next week?",
        "What camera and microphone setup do you have?",
        "@priya check timestamp 08:30 for the schema details",
        "Can this run on a Docker container?",
        "Provide the slide deck link in the description.",
    ]
    n_len = len(neutral_templates)
    for i in range(100):
        text = neutral_templates[i % n_len]
        var_idx = i // n_len
        if var_idx > 0:
            text = f"{text} (Query #{var_idx})"
        author_id = get_author_hash(f"neu_user_{i}")
        raw_comments.append({
            "comment_id": f"yt_neu_{comment_counter:04d}",
            "raw_text": text,
            "timestamp": f"2026-10-30T03:{(comment_counter % 60):02d}:00Z",
            "like_count": (i * 2) % 15,
            "anonymized_author_id": author_id,
        })
        comment_counter += 1

    # 45 Spam comments
    spam_url_samples = [
        "Check my channel https://spam-crypto.com/promo for free bitcoin!",
        "Free crypto giveaway at http://bit.ly/free-tokens-now claim today",
        "Join my telegram channel t.me/cryptotraders for 1000% signals",
        "Subscribe to me for free robux and gift cards www.freerobux.com",
        "Check out my channel https://mychannel.promo.com/subscribe",
    ]
    for i in range(25):
        s_text = spam_url_samples[i % len(spam_url_samples)]
        raw_comments.append({
            "comment_id": f"yt_spam_url_{i:02d}",
            "raw_text": f"{s_text} id={i}",
            "timestamp": "2026-10-30T03:45:00Z",
            "like_count": 0,
            "anonymized_author_id": get_author_hash(f"bot_url_{i}"),
        })

    dup_author = get_author_hash("spammer_bot_999")
    dup_text = "Free crypto reward check my channel today!"
    for i in range(20):
        raw_comments.append({
            "comment_id": f"yt_spam_dup_{i:02d}",
            "raw_text": dup_text,
            "timestamp": "2026-10-30T03:50:00Z",
            "like_count": 0,
            "anonymized_author_id": dup_author,
        })

    dataset = {
        "post_id": "yt_demo_72neg",
        "post_url": "https://www.youtube.com/watch?v=flagged_demo_video",
        "platform": "youtube",
        "title": "Major Feature Release & Mobile Update v2.0",
        "channel": "TechLaunch Media",
        "comments": raw_comments,
        "unbounded_fetch": True,
        "pages_fetched": 11,
    }

    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(dataset, f, indent=2, ensure_ascii=False)

    return dataset


def generate_realistic_amazon_dataset(output_path: Optional[Path] = None) -> Dict[str, Any]:
    """Generate 1,250 realistic Amazon Product Reviews for offline demo."""
    raw_reviews: List[Dict[str, Any]] = []
    review_counter = 1
    variants = [
        "8GB/128GB Obsidian Black",
        "12GB/256GB Cosmic Silver",
        "8GB/256GB Midnight Blue",
        "16GB/512GB Sunset Orange",
    ]

    defect_templates = [
        "Battery backup bekar hai, drains from 100% to 20% in just 3 hours! Terrible battery life.",
        "Overheating issue while charging and playing basic games. Defective hardware unit 😡",
        "Phone screen started flickering on day 2 and stopped working completely. Dead display.",
        "Speaker makes crackling sound on full volume. Cheap build and defective audio hardware.",
        "Camera lens is defective and gives blurry photos. Worst smartphone build quality 👎",
        "Phone heating up like iron box within 10 minutes of use. Battery drains rapidly.",
        "Power button got loose within a week. Very poor hardware quality from brand.",
        "Display touch became completely unresponsive. Defective screen hardware.",
        "Battery backup is horrible, drains overnight without usage. Bekar battery performance.",
        "Defective motherboard, phone switched off and won't turn on again. Complete hardware failure.",
    ]

    delivery_templates = [
        "Delivery delayed by 5 days, package was badly damaged with courier seal broken! 😡",
        "Damaged box received! Courier person was very rude and outer package was completely crushed.",
        "Charging adapter missing from the box! Outer seal was tampered upon arrival.",
        "Late delivery and delivery agent refused door delivery. Packaging was torn open.",
        "Box had oil stains and seal was already broken. Poor logistics and packaging.",
        "Courier threw the package over the gate, cracked corner of the retail box.",
        "Missing USB-C cable and documentation. Looks like returned item sent as new.",
        "Delayed delivery by Ekart courier with no status update for a week. Terribly late.",
    ]

    counterfeit_templates = [
        "Bilkul nakli product bheja hai! Fake copy, duplicate serial number not registering on official site 😡",
        "Fake product, pure duplicate! Received wrong color and different cheap model inside.",
        "Dhoka hai yeh! Fake phone sent, duplicate charger and cheap plastic body. Dhoka seller!",
        "Received refurbished dirty unit instead of brand new. Different from picture, fake item.",
        "Nakli product! Serial number mismatch on invoice and box. Complete counterfeit scam.",
        "Wrong item received! Ordered 256GB Cosmic Silver, sent 64GB duplicate model. Bilkul nakli!",
        "Scam seller! Brand logo is misspelled, definitely a counterfeit fake device 👎",
    ]

    value_templates = [
        "Paisa barbaad ho gaya! Overpriced for such cheap plastic body and poor performance.",
        "Waste of money, totally overpriced. Refund denied by customer service after returning item.",
        "Warranty denied by authorized service center claiming seller is unauthorized! Paisa barbaad.",
        "Overpriced phone! Price dropped by 4000 rupees next day and price-match refund was rejected.",
        "Not worth the price tag, terrible value for money. Return request rejected unfairly.",
        "Customer care refused refund even after returning defective unit. Waste of money.",
        "Paisa barbaad bilkul, cheap performance at premium pricing. No warranty support.",
    ]

    neg_specs = [
        (defect_templates, 360, "defect", 1),
        (delivery_templates, 240, "delivery", 1),
        (counterfeit_templates, 180, "counterfeit", 1),
        (value_templates, 120, "value", 2),
    ]

    for templates, target_count, prefix, stars in neg_specs:
        t_len = len(templates)
        for i in range(target_count):
            text = templates[i % t_len]
            var_idx = i // t_len
            if var_idx > 0:
                text = f"{text} (Review ref #{var_idx})"
            author_id = get_author_hash(f"amz_neg_{prefix}_{i}")
            raw_reviews.append({
                "comment_id": f"amz_rev_{review_counter:04d}",
                "raw_text": text,
                "timestamp": f"2026-10-31T01:{(review_counter % 60):02d}:00Z",
                "like_count": (review_counter * 5) % 80,
                "anonymized_author_id": author_id,
                "star_rating": stars if (i % 5 != 0) else min(5, stars + 1),
                "verified_purchase": (i % 6 != 0),
                "product_variant": variants[i % len(variants)],
            })
            review_counter += 1

    positive_templates = [
        "Paisa vasool product! Outstanding AMOLED display and superb battery backup 🔥",
        "Bahut badhiya phone hai, camera quality and build are top notch! ❤️",
        "Mast product hai! Delivered in 1 day, 100% genuine and fast charging 👍",
        "Zabardast smartphone at this price point! Loving the snappy performance 💯",
        "Superb display and fantastic battery life! Highly recommended to everyone 😊",
        "Kamaal ka phone hai, genuine product and premium packaging ✨",
        "Shandar performance and zero heating issues even during intensive gaming 🚀",
        "Paisa vasool! Best phone in this budget segment, crystal clear camera 👏",
    ]
    p_len = len(positive_templates)
    for i in range(200):
        text = positive_templates[i % p_len]
        var_idx = i // p_len
        if var_idx > 0:
            text = f"{text} #{var_idx}"
        author_id = get_author_hash(f"amz_pos_{i}")
        raw_reviews.append({
            "comment_id": f"amz_rev_{review_counter:04d}",
            "raw_text": text,
            "timestamp": f"2026-10-31T02:{(review_counter % 60):02d}:00Z",
            "like_count": (i * 9) % 120,
            "anonymized_author_id": author_id,
            "star_rating": 5 if (i % 4 != 0) else 4,
            "verified_purchase": True,
            "product_variant": variants[i % len(variants)],
        })
        review_counter += 1

    neutral_templates = [
        "Does this smartphone variant support eSIM or dual physical SIM cards?",
        "How much internal storage is available out of the box?",
        "Average battery backup, lasts one full day with moderate usage.",
        "Decent phone for senior citizens, camera is ordinary but screen is good.",
        "Is screen protector pre-applied on the display from factory?",
        "Can someone confirm if 33W charger comes inside Indian retail box?",
        "Average build quality, looks fine but plastic frame feels lightweight.",
        "Which software update version comes pre-installed on this model?",
    ]
    n_len = len(neutral_templates)
    for i in range(100):
        text = neutral_templates[i % n_len]
        var_idx = i // n_len
        if var_idx > 0:
            text = f"{text} (Query #{var_idx})"
        author_id = get_author_hash(f"amz_neu_{i}")
        raw_reviews.append({
            "comment_id": f"amz_rev_{review_counter:04d}",
            "raw_text": text,
            "timestamp": f"2026-10-31T03:{(review_counter % 60):02d}:00Z",
            "like_count": (i * 2) % 20,
            "anonymized_author_id": author_id,
            "star_rating": 3,
            "verified_purchase": (i % 2 == 0),
            "product_variant": variants[i % len(variants)],
        })
        review_counter += 1

    # 50 Spam reviews
    spam_samples = [
        "Win free iPhone and gift card visit https://free-gift-promo.xyz/claim today!",
        "Get 90% discount on electronics join telegram t.me/lootdeals_india now",
        "Free cash giveaway check http://bit.ly/amazon-cash-rewards claim now",
        "Contact whatsapp +919876543210 for paid positive reviews service",
        "Subscribe to my channel for free gadgets giveaway www.gadgetgiveaways.com",
    ]
    for i in range(30):
        s_text = spam_samples[i % len(spam_samples)]
        raw_reviews.append({
            "comment_id": f"amz_spam_{i:02d}",
            "raw_text": f"{s_text} id={i}",
            "timestamp": "2026-10-31T04:00:00Z",
            "like_count": 0,
            "anonymized_author_id": get_author_hash(f"amz_bot_{i}"),
            "star_rating": 5,
            "verified_purchase": False,
            "product_variant": variants[0],
        })

    dup_bot = get_author_hash("amz_duplicate_spammer_bot")
    dup_body = "Earn extra cashback on every purchase click deals link today!"
    for i in range(20):
        raw_reviews.append({
            "comment_id": f"amz_dup_{i:02d}",
            "raw_text": dup_body,
            "timestamp": "2026-10-31T04:05:00Z",
            "like_count": 0,
            "anonymized_author_id": dup_bot,
            "star_rating": 5,
            "verified_purchase": False,
            "product_variant": variants[0],
        })

    dataset = {
        "post_id": "amz_smartphone_reviews",
        "asin": "B09X6GMNP7",
        "post_url": "https://www.amazon.in/dp/B09X6GMNP7",
        "platform": "amazon",
        "title": "OnePlus Nord CE 5G (Obsidian Black, 8GB RAM, 128GB Storage)",
        "comments": raw_reviews,
        "unbounded_fetch": True,
        "pages_fetched": 125,
    }

    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(dataset, f, indent=2, ensure_ascii=False)

    return dataset


def generate_realistic_flipkart_dataset(output_path: Optional[Path] = None) -> Dict[str, Any]:
    """Generate 1,250 realistic Flipkart Product Reviews for offline demo."""
    raw_reviews: List[Dict[str, Any]] = []
    review_counter = 1
    variants = [
        "6GB/128GB Starlight Blue",
        "8GB/128GB Phantom Black",
        "8GB/256GB Nebula Green",
    ]

    defect_templates = [
        "Battery backup bekar hai bilkul, 2 hours mein drain ho jata hai! Hardware defect.",
        "Screen heating problem while charging! Defective battery unit, unsafe to use 😡",
        "Phone stopped working within 3 days. Won't boot past logo screen. Hardware failure.",
        "Touch screen glitches randomly and typing is impossible. Very defective display.",
        "Camera sensor has dust inside and clicking blurry photos. Poor quality control 👎",
        "Severe heating issue while using GPS navigation. Battery drains like water.",
        "Fingerprint sensor completely stopped responding. Hardware defect on brand new phone.",
        "Speaker stopped giving audio, only hiss and buzzing sound. Defective hardware.",
    ]

    delivery_templates = [
        "Flipkart delivery was late by 6 days! Retail box was torn open and seal broken 😡",
        "Delivery boy was very rude, forced OTP without allowing package inspection.",
        "Damaged box received, phone box had dents and accessories were scattered inside.",
        "Delayed logistics by Ekart, package was stuck at hub for 4 days without delivery.",
        "Seal was clearly broken and re-taped with transparent tape. Unacceptable delivery.",
        "Flipkart courier delivered open box, charging cable missing from inside.",
    ]

    counterfeit_templates = [
        "Bilkul nakli product bheja hai Flipkart seller ne! Fake duplicate charger, dhoka hai 😡",
        "Received fake duplicate unit! Model number doesn't match official website. Nakli phone!",
        "Dhoka! Different cheap phone model inside the original box. Flipkart refused replacement.",
        "Counterfeit product received! Duplicate battery and fake packaging. Bilkul nakli!",
        "Scam seller on Flipkart! Fake brand phone delivered, totally different from picture.",
        "Dhoka ho gaya bhai, nakli phone bheja hai. IMEI number is blacklisted on telecom portal.",
    ]

    value_templates = [
        "Paisa barbaad ho gaya! Overpriced device, laggy performance and cheap plastic body.",
        "Waste of money! Flipkart denied replacement and return window closed automatically.",
        "Warranty service center refused free repair claiming warranty is void. Paisa barbaad!",
        "Overpriced piece of junk! Big Billion Days discount was fake price hike scam.",
        "Return rejected without inspection. Flipkart customer support gave zero help. Waste of money.",
        "Paisa barbaad hai, pathetic customer support and zero warranty assistance.",
    ]

    neg_specs = [
        (defect_templates, 350, "defect", 1),
        (delivery_templates, 250, "delivery", 1),
        (counterfeit_templates, 170, "counterfeit", 1),
        (value_templates, 130, "value", 2),
    ]

    for templates, target_count, prefix, stars in neg_specs:
        t_len = len(templates)
        for i in range(target_count):
            text = templates[i % t_len]
            var_idx = i // t_len
            if var_idx > 0:
                text = f"{text} (Issue #{var_idx})"
            author_id = get_author_hash(f"flp_neg_{prefix}_{i}")
            raw_reviews.append({
                "comment_id": f"flp_rev_{review_counter:04d}",
                "raw_text": text,
                "timestamp": f"2026-10-31T05:{(review_counter % 60):02d}:00Z",
                "like_count": (review_counter * 4) % 90,
                "anonymized_author_id": author_id,
                "star_rating": stars if (i % 4 != 0) else min(5, stars + 1),
                "verified_purchase": (i % 5 != 0),
                "product_variant": variants[i % len(variants)],
            })
            review_counter += 1

    positive_templates = [
        "Paisa vasool product! Outstanding battery backup and smooth 120Hz display 🔥",
        "Bahut badhiya phone hai, premium look and super fast charging! ❤️",
        "Mast phone hai Flipkart! Delivered on time, genuine piece 👍",
        "Zabardast camera quality in daylight, value for money deal 💯",
        "Superb performance at this price segment! Highly recommended 😊",
        "Kamaal ka battery life, easily lasts 1.5 days on single charge ✨",
        "Shandar display and great haptics! Very happy with purchase 🚀",
        "Paisa vasool deal from Flipkart Big Billion Days! 👏",
    ]
    p_len = len(positive_templates)
    for i in range(200):
        text = positive_templates[i % p_len]
        var_idx = i // p_len
        if var_idx > 0:
            text = f"{text} #{var_idx}"
        author_id = get_author_hash(f"flp_pos_{i}")
        raw_reviews.append({
            "comment_id": f"flp_rev_{review_counter:04d}",
            "raw_text": text,
            "timestamp": f"2026-10-31T06:{(review_counter % 60):02d}:00Z",
            "like_count": (i * 8) % 110,
            "anonymized_author_id": author_id,
            "star_rating": 5 if (i % 3 != 0) else 4,
            "verified_purchase": True,
            "product_variant": variants[i % len(variants)],
        })
        review_counter += 1

    neutral_templates = [
        "Does this model have dedicated microSD card slot or hybrid slot?",
        "How much time does it take for 0 to 100% full charge with in-box adapter?",
        "Average display brightness outdoors in direct sunlight.",
        "Camera is decent for social media but low light shots have noise.",
        "Is back cover included in the box for Indian Flipkart edition?",
        "Audio output via 3.5mm jack is okay, speaker volume is decent.",
        "Good phone for basic daily tasks like WhatsApp and YouTube.",
        "Which month manufacturing unit is being shipped currently?",
    ]
    n_len = len(neutral_templates)
    for i in range(100):
        text = neutral_templates[i % n_len]
        var_idx = i // n_len
        if var_idx > 0:
            text = f"{text} (Query #{var_idx})"
        author_id = get_author_hash(f"flp_neu_{i}")
        raw_reviews.append({
            "comment_id": f"flp_rev_{review_counter:04d}",
            "raw_text": text,
            "timestamp": f"2026-10-31T07:{(review_counter % 60):02d}:00Z",
            "like_count": (i * 3) % 25,
            "anonymized_author_id": author_id,
            "star_rating": 3,
            "verified_purchase": (i % 2 == 0),
            "product_variant": variants[i % len(variants)],
        })
        review_counter += 1

    spam_samples = [
        "Earn 5000 daily from home visit https://flipkart-affiliate-bonus.xyz now!",
        "Exclusive coupons and Flipkart vouchers join telegram t.me/lootdeals4u",
        "Free shopping gift card check http://bit.ly/flipkart-free-coins-today",
        "Contact whatsapp +919988776655 for guaranteed Flipkart review boosts",
        "Check my youtube channel for Flipkart sale hacks www.salehacks.in",
    ]
    for i in range(30):
        s_text = spam_samples[i % len(spam_samples)]
        raw_reviews.append({
            "comment_id": f"flp_spam_{i:02d}",
            "raw_text": f"{s_text} id={i}",
            "timestamp": "2026-10-31T08:00:00Z",
            "like_count": 0,
            "anonymized_author_id": get_author_hash(f"flp_bot_{i}"),
            "star_rating": 5,
            "verified_purchase": False,
            "product_variant": variants[0],
        })

    dup_bot = get_author_hash("flp_duplicate_review_spammer")
    dup_body = "Claim extra festive cashback on Flipkart check external portal!"
    for i in range(20):
        raw_reviews.append({
            "comment_id": f"flp_dup_{i:02d}",
            "raw_text": dup_body,
            "timestamp": "2026-10-31T08:05:00Z",
            "like_count": 0,
            "anonymized_author_id": dup_bot,
            "star_rating": 5,
            "verified_purchase": False,
            "product_variant": variants[0],
        })

    dataset = {
        "post_id": "flp_electronics_sale",
        "fsn": "MOBGH73XHZ6QG9FZ",
        "post_url": "https://www.flipkart.com/realme-12-pro-5g/p/itme12345",
        "platform": "flipkart",
        "title": "realme 12 Pro 5G (Submarine Blue, 128 GB) (8 GB RAM)",
        "comments": raw_reviews,
        "unbounded_fetch": True,
        "pages_fetched": 125,
    }

    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(dataset, f, indent=2, ensure_ascii=False)

    return dataset


# --- Extractor Classes ---

class YouTubeExtractor:
    """
    YouTube Comment Extractor:
    - Live Key-Free Scraping via youtube-comment-downloader (Default)
    - Official YouTube Data API v3 (if YOUTUBE_API_KEY is provided)
    - Demo Sample Fallback only when is_demo=True or explicit demo post requested
    """

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("YOUTUBE_API_KEY")

    def extract(
        self,
        post_id: str,
        max_comments: Optional[int] = None,
        is_demo: bool = False,
        fallback_on_blocked: bool = False,
    ) -> PostInput:
        clean_id, _, canonical_url = parse_input_url_or_id(post_id, default_platform="youtube")

        # 1. Offline Demo Preset explicitly requested
        if is_demo or clean_id in ("yt_demo_72neg", "yt_demo_perf_test"):
            sample_candidates = [
                Path("sample_data/youtube_flagged_post.json"),
                Path("sentiment_module/sample_data/youtube_flagged_post.json"),
                Path(__file__).resolve().parent.parent / "sample_data" / "youtube_flagged_post.json",
            ]
            sample_file = next((p for p in sample_candidates if p.exists()), None)
            if not sample_file:
                sample_file = Path("sample_data/youtube_flagged_post.json")
                generate_realistic_flagged_dataset(sample_file)

            with open(sample_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            raw_list = data["comments"]
            if max_comments is not None:
                raw_list = raw_list[:max_comments]

            comments = [CommentInput(**c) for c in raw_list]
            return PostInput(
                post_id=data["post_id"],
                post_url=data.get("post_url", f"https://www.youtube.com/watch?v={clean_id}"),
                platform="youtube",
                comments=comments,
                unbounded_fetch=(max_comments is None),
                pages_fetched=data.get("pages_fetched", 11),
                is_demo=True,
                data_source="Offline Sample Preset (sample_data/youtube_flagged_post.json)",
                data_source_badge="DEMO PRESET: Offline Sample Dataset",
                platform_reported_total=len(comments),
            )

        platform_total: Optional[int] = None

        # 2. Live YouTube Data API v3 (if key provided)
        if self.api_key:
            try:
                extracted: List[CommentInput] = []
                base_url = "https://www.googleapis.com/youtube/v3/commentThreads"
                next_page_token: Optional[str] = None
                pages_traversed = 0
                fetch_cap = max_comments if max_comments is not None else 100000

                with httpx.Client(timeout=25.0) as client:
                    # Fetch true video commentCount from statistics
                    try:
                        v_resp = client.get(
                            "https://www.googleapis.com/youtube/v3/videos",
                            params={"part": "statistics", "id": clean_id, "key": self.api_key}
                        )
                        if v_resp.status_code == 200:
                            v_items = v_resp.json().get("items", [])
                            if v_items and "commentCount" in v_items[0].get("statistics", {}):
                                platform_total = int(v_items[0]["statistics"]["commentCount"])
                    except Exception:
                        pass

                    reply_fetch_parents: List[str] = []

                    while True:
                        remaining = fetch_cap - len(extracted)
                        if remaining <= 0:
                            break
                        fetch_limit = min(100, remaining)

                        params = {
                            "part": "snippet,replies",
                            "videoId": clean_id,
                            "maxResults": fetch_limit,
                            "key": self.api_key,
                        }
                        if next_page_token:
                            params["pageToken"] = next_page_token

                        resp = client.get(base_url, params=params)
                        if resp.status_code == 429:
                            time.sleep(1.0)
                            resp = client.get(base_url, params=params)

                        if resp.status_code != 200:
                            break

                        pages_traversed += 1
                        data = resp.json()
                        items = data.get("items", [])
                        if not items:
                            break

                        for item in items:
                            snippet = item["snippet"]["topLevelComment"]["snippet"]
                            cid = item["id"]
                            text = snippet.get("textDisplay", "")
                            author = snippet.get("authorDisplayName", "anon")
                            author_hash = get_author_hash(author)
                            timestamp = snippet.get("publishedAt", "")
                            like_count = snippet.get("likeCount", 0)

                            if text:
                                extracted.append(
                                    CommentInput(
                                        comment_id=cid,
                                        raw_text=text,
                                        timestamp=timestamp,
                                        like_count=like_count,
                                        anonymized_author_id=author_hash,
                                    )
                                )

                            # Extract reply thread comments inline
                            replies = item.get("replies", {}).get("comments", [])
                            for r in replies:
                                r_snip = r.get("snippet", {})
                                r_cid = r.get("id", f"{cid}_reply_{len(extracted)}")
                                r_text = r_snip.get("textDisplay", "")
                                r_author = r_snip.get("authorDisplayName", "anon")
                                r_timestamp = r_snip.get("publishedAt", "")
                                r_likes = r_snip.get("likeCount", 0)
                                if r_text:
                                    extracted.append(
                                        CommentInput(
                                            comment_id=r_cid,
                                            raw_text=r_text,
                                            timestamp=r_timestamp,
                                            like_count=r_likes,
                                            anonymized_author_id=get_author_hash(r_author),
                                        )
                                    )

                            # If thread has more replies than returned inline (>5), queue for concurrent fetch
                            total_reply_count = item["snippet"].get("totalReplyCount", 0)
                            if total_reply_count > 5:
                                reply_fetch_parents.append(cid)

                        next_page_token = data.get("nextPageToken")
                        if not next_page_token:
                            break

                    # Fetch deeply nested replies concurrently using ThreadPoolExecutor(max_workers=8)
                    if reply_fetch_parents and len(extracted) < fetch_cap:
                        def _fetch_sub_replies(parent_id: str) -> List[CommentInput]:
                            sub_extracted = []
                            try:
                                with httpx.Client(timeout=15.0) as sub_client:
                                    r_url = "https://www.googleapis.com/youtube/v3/comments"
                                    r_params = {
                                        "part": "snippet",
                                        "parentId": parent_id,
                                        "maxResults": 100,
                                        "key": self.api_key,
                                    }
                                    r_resp = sub_client.get(r_url, params=r_params)
                                    if r_resp.status_code == 200:
                                        for c_item in r_resp.json().get("items", []):
                                            c_snip = c_item.get("snippet", {})
                                            c_txt = c_snip.get("textDisplay", "")
                                            if c_txt:
                                                sub_extracted.append(
                                                    CommentInput(
                                                        comment_id=c_item.get("id", f"{parent_id}_sub_{len(sub_extracted)}"),
                                                        raw_text=c_txt,
                                                        timestamp=c_snip.get("publishedAt", ""),
                                                        like_count=c_snip.get("likeCount", 0),
                                                        anonymized_author_id=get_author_hash(c_snip.get("authorDisplayName", "anon")),
                                                    )
                                                )
                            except Exception:
                                pass
                            return sub_extracted

                        with ThreadPoolExecutor(max_workers=8) as executor:
                            futures = [executor.submit(_fetch_sub_replies, pid) for pid in reply_fetch_parents[:50]]
                            for fut in as_completed(futures):
                                sub_res = fut.result()
                                extracted.extend(sub_res)
                                if len(extracted) >= fetch_cap:
                                    break

                if len(extracted) > 0:
                    return PostInput(
                        post_id=clean_id,
                        post_url=canonical_url,
                        platform="youtube",
                        comments=extracted,
                        unbounded_fetch=(max_comments is None),
                        pages_fetched=pages_traversed or 1,
                        is_demo=False,
                        data_source="Official YouTube Data API v3 (Live Ingestion with Replies)",
                        data_source_badge="LIVE: YouTube Data API v3",
                        platform_reported_total=platform_total or len(extracted),
                    )
            except Exception:
                # Fallback to key-free scraper if API key quota exceeded or invalid
                pass

        # 3. Key-Free Live Scraping via youtube-comment-downloader (100% Real Live Comments)
        try:
            # Query true comment count from public video watch page
            try:
                with httpx.Client(timeout=6.0, follow_redirects=True) as h_client:
                    h_resp = h_client.get(
                        f"https://www.youtube.com/watch?v={clean_id}",
                        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
                    )
                    if h_resp.status_code == 200:
                        m_cnt = (
                            re.search(r'"commentCount":\s*\{\s*"simpleText":\s*"([\d,]+)"', h_resp.text)
                            or re.search(r'"totalComments":\s*"([\d,]+)"', h_resp.text)
                            or re.search(r'"commentsCount":\s*\{\s*"simpleText":\s*"([\d,]+)"', h_resp.text)
                        )
                        if m_cnt:
                            platform_total = int(m_cnt.group(1).replace(",", ""))
            except Exception:
                pass

            from youtube_comment_downloader import YoutubeCommentDownloader
            downloader = YoutubeCommentDownloader()
            gen = downloader.get_comments(clean_id)

            extracted_live: List[CommentInput] = []
            live_limit = max_comments if max_comments is not None else 100000

            for item in itertools.islice(gen, live_limit):
                cid = item.get("cid") or get_author_hash(item.get("author", "anon") + str(time.time()))
                text = item.get("text", "").strip()
                if not text:
                    continue
                author = item.get("author", "anon")
                author_hash = get_author_hash(author)
                votes = item.get("votes", 0)
                try:
                    like_cnt = int(votes) if votes else 0
                except Exception:
                    like_cnt = 0

                raw_time = item.get("time", "")
                parsed_time = item.get("time_parsed")
                iso_time = ""
                if parsed_time:
                    try:
                        iso_time = datetime.fromtimestamp(parsed_time, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                    except Exception:
                        pass
                if not iso_time and raw_time:
                    try:
                        from .preprocessor import CommentPreprocessor
                        iso_time = CommentPreprocessor().normalize_timestamp(raw_time)
                    except Exception:
                        iso_time = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                if not iso_time:
                    iso_time = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

                extracted_live.append(
                    CommentInput(
                        comment_id=cid,
                        raw_text=text,
                        timestamp=iso_time,
                        like_count=like_cnt,
                        anonymized_author_id=author_hash,
                    )
                )

            if len(extracted_live) > 0:
                pages_est = max(1, len(extracted_live) // 20)
                return PostInput(
                    post_id=clean_id,
                    post_url=canonical_url,
                    platform="youtube",
                    comments=extracted_live,
                    unbounded_fetch=(max_comments is None),
                    pages_fetched=pages_est,
                    is_demo=False,
                    data_source="Live Web Scrape (Zero API Key - YouTube Comment Downloader)",
                    data_source_badge="LIVE: YouTube Keyless Scraper",
                    platform_reported_total=platform_total or len(extracted_live),
                )
            else:
                raise ValueError(
                    f"No comments found for YouTube video '{clean_id}'. "
                    "The video may have comments disabled or be unavailable. "
                    "Use the Sentinelytics Chrome Extension on your active video tab to capture live comments."
                )

        except Exception as e:
            if isinstance(e, ValueError):
                raise e
            raise ValueError(
                f"Failed to scrape YouTube comments for '{clean_id}': {str(e)}. "
                "Use the Sentinelytics Chrome Extension on your active video tab to capture live comments."
            )


class AmazonExtractor:
    """
    Amazon Product Review Extractor:
    - Direct HTML Review Scraper via httpx + BeautifulSoup
    - Apify Amazon Scraper (if APIFY_API_TOKEN provided)
    - Rainforest / RapidAPI Scraper API fallback
    - Demo Sample Fallback only when is_demo=True or explicit demo post requested
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        scraper_url: Optional[str] = None,
        apify_token: Optional[str] = None,
        rapidapi_key: Optional[str] = None,
    ):
        self.rapidapi_key = rapidapi_key or os.environ.get("RAPIDAPI_KEY")
        self.api_key = api_key or os.environ.get("AMAZON_SCRAPER_API_KEY") or os.environ.get("SCRAPER_API_KEY") or os.environ.get("RAINFOREST_API_KEY")
        self.scraper_url = scraper_url
        self.apify_token = apify_token or os.environ.get("APIFY_API_TOKEN")

    def extract(
        self,
        post_id: str = "amz_smartphone_reviews",
        max_comments: Optional[int] = None,
        is_demo: bool = False,
        fallback_on_blocked: bool = False,
    ) -> PostInput:
        clean_id, _, canonical_url = parse_input_url_or_id(post_id, default_platform="amazon")

        # 1. Offline Demo Preset explicitly requested
        if is_demo or clean_id == "amz_smartphone_reviews":
            sample_candidates = [
                Path("sample_data/amazon_product_reviews.json"),
                Path("sentiment_module/sample_data/amazon_product_reviews.json"),
                Path(__file__).resolve().parent.parent / "sample_data" / "amazon_product_reviews.json",
            ]
            sample_file = next((p for p in sample_candidates if p.exists()), None)
            if not sample_file:
                sample_file = Path("sample_data/amazon_product_reviews.json")
                generate_realistic_amazon_dataset(sample_file)

            with open(sample_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            raw_list = data["comments"]
            if max_comments is not None:
                raw_list = raw_list[:max_comments]

            comments = [CommentInput(**c) for c in raw_list]
            return PostInput(
                post_id=data.get("post_id", clean_id),
                post_url=data.get("post_url", canonical_url),
                platform="amazon",
                comments=comments,
                unbounded_fetch=(max_comments is None),
                pages_fetched=data.get("pages_fetched", 125),
                is_demo=True,
                data_source="Offline Sample Preset (sample_data/amazon_product_reviews.json)",
                data_source_badge="DEMO PRESET: Offline Sample Dataset",
                platform_reported_total=len(comments),
            )

        # 2. Direct Key-Free HTML Review Scraping & RapidAPI Hybrid
        domain = "amazon.com" if ".com" in canonical_url else "amazon.in"
        country_code = "US" if ".com" in canonical_url else "IN"

        # Check RapidAPI first (with dynamic .env reloading)
        rapid_key = self.rapidapi_key or get_rapidapi_key()
        if rapid_key:
            try:
                extracted_rapid = self._fetch_rapidapi(clean_id, rapid_key, canonical_url, max_comments, country_code=country_code)
                if extracted_rapid:
                    return PostInput(
                        post_id=clean_id,
                        post_url=canonical_url,
                        platform="amazon",
                        comments=extracted_rapid,
                        unbounded_fetch=(max_comments is None),
                        pages_fetched=max(1, len(extracted_rapid) // 10),
                        is_demo=False,
                        data_source="Live Ingestion via RapidAPI & Direct Amazon Scraper",
                        data_source_badge="LIVE: RapidAPI + Amazon Scraper",
                        platform_reported_total=len(extracted_rapid),
                    )
            except Exception:
                pass

        # Standalone Direct HTML Scraping Fallback
        extracted_html = self._scrape_direct_html(clean_id, domain=domain, max_comments=max_comments)
        if extracted_html:
            return PostInput(
                post_id=clean_id,
                post_url=canonical_url,
                platform="amazon",
                comments=extracted_html,
                unbounded_fetch=(max_comments is None),
                pages_fetched=max(1, len(extracted_html) // 10),
                is_demo=False,
                data_source="Live Web Scrape (Zero API Key - Amazon BS4 Scraper)",
                data_source_badge="LIVE: Amazon BS4 Scraper",
                platform_reported_total=len(extracted_html),
            )

        # 3. Apify Amazon Scraper Fallback (if APIFY_API_TOKEN is present)
        if self.apify_token:
            try:
                from apify_client import ApifyClient
                client = ApifyClient(self.apify_token)
                run_input = {
                    "productUrls": [{"url": canonical_url}],
                    "maxReviews": max_comments if max_comments is not None else 500,
                }
                run = client.actor("junglee/amazon-reviews-scraper").call(run_input=run_input)
                dataset_id = getattr(run, "default_dataset_id", None) or (run.get("defaultDatasetId") if isinstance(run, dict) else None)
                if dataset_id:
                    extracted_apify: List[CommentInput] = []
                    for item in client.dataset(dataset_id).iterate_items():
                        r_text = item.get("reviewDescription") or item.get("text") or item.get("reviewText") or item.get("body") or ""
                        if not r_text.strip() or item.get("error"):
                            continue
                        r_title = item.get("reviewTitle") or item.get("title") or ""
                        full_txt = f"{r_title}. {r_text}" if r_title else r_text
                        stars = int(item.get("ratingScore") or item.get("rating") or item.get("stars") or 5)
                        extracted_apify.append(
                            CommentInput(
                                comment_id=str(item.get("reviewId") or item.get("id") or f"amz_apify_{len(extracted_apify)}"),
                                raw_text=full_txt,
                                timestamp=str(item.get("date") or "2026-11-03T00:00:00Z"),
                                like_count=int(item.get("helpfulVotesCount") or 0),
                                anonymized_author_id=get_author_hash(str(item.get("userProfileName") or "amz_buyer")),
                                star_rating=stars,
                                verified_purchase=bool(item.get("isVerified", True)),
                            )
                        )
                        if max_comments and len(extracted_apify) >= max_comments:
                            break

                    if extracted_apify:
                        return PostInput(
                            post_id=clean_id,
                            post_url=canonical_url,
                            platform="amazon",
                            comments=extracted_apify,
                            unbounded_fetch=(max_comments is None),
                            pages_fetched=1,
                            is_demo=False,
                            data_source="Live Ingestion via Apify Amazon Scraper",
                            data_source_badge="LIVE: Amazon Apify Scraper",
                            platform_reported_total=len(extracted_apify),
                        )
            except Exception:
                pass

        # 4. Scraper API (Rainforest / Generic) if configured
        if self.api_key:
            extracted_api: List[CommentInput] = []
            page = 1
            with httpx.Client(timeout=20.0) as client:
                while True:
                    req_url = self.scraper_url or "https://api.rainforestapi.com/request"
                    params = {
                        "api_key": self.api_key,
                        "type": "reviews",
                        "amazon_domain": domain,
                        "asin": clean_id,
                        "page": page,
                    }
                    res = client.get(req_url, params=params)
                    if res.status_code == 429:
                        time.sleep(1.0)
                        res = client.get(req_url, params=params)

                    if res.status_code != 200:
                        break

                    body = res.json()
                    reviews_list = body.get("reviews", [])
                    if not reviews_list:
                        break

                    for r in reviews_list:
                        extracted_api.append(
                            CommentInput(
                                comment_id=r.get("id", f"amz_{page}_{len(extracted_api)}"),
                                raw_text=r.get("body", r.get("review", "")),
                                timestamp=r.get("date", {}).get("utc", "2026-10-31T00:00:00Z"),
                                like_count=r.get("helpful_votes", 0),
                                anonymized_author_id=get_author_hash(r.get("profile", {}).get("name", "amz_buyer")),
                                star_rating=r.get("rating"),
                                verified_purchase=r.get("verified_purchase", True),
                                product_variant=r.get("attributes", {}).get("style_name"),
                            )
                        )
                        if max_comments and len(extracted_api) >= max_comments:
                            break

                    if max_comments and len(extracted_api) >= max_comments:
                        break

                    pagination = body.get("pagination", {})
                    if page >= pagination.get("total_pages", page):
                        break
                    page += 1

            if extracted_api:
                return PostInput(
                    post_id=clean_id,
                    post_url=canonical_url,
                    platform="amazon",
                    comments=extracted_api,
                    unbounded_fetch=(max_comments is None),
                    pages_fetched=page,
                    is_demo=False,
                    data_source="Live Ingestion via Amazon Scraper API",
                    data_source_badge="LIVE: Amazon Scraper API",
                    platform_reported_total=len(extracted_api),
                )

        # 5. Live extraction blocked by Amazon anti-bot CAPTCHA
        raise ValueError(
            f"Amazon live scraping blocked by platform anti-bot CAPTCHA for ASIN '{clean_id}'. "
            "To analyze real customer reviews directly from your active browser session, "
            "use the Sentinelytics Browser Extension or provide a Scraper API / Apify token in Settings."
        )

    def _scrape_direct_html(
        self,
        asin: str,
        domain: str = "amazon.in",
        max_comments: Optional[int] = None,
    ) -> List[CommentInput]:
        """Direct keyless HTML review scraper for /dp/{asin} and /product-reviews/{asin}."""
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7",
            "Accept-Encoding": "gzip, deflate, br",
            "DNT": "1",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
        }
        extracted_html: List[CommentInput] = []
        seen_texts: Set[str] = set()

        try:
            with httpx.Client(timeout=15.0, follow_redirects=True) as client:
                # 1. Scrape /dp/{asin} for featured and top reviews
                dp_url = f"https://www.{domain}/dp/{asin}"
                resp_dp = client.get(dp_url, headers=headers)
                if resp_dp.status_code == 200 and "Type the characters you see in this image" not in resp_dp.text:
                    soup_dp = BeautifulSoup(resp_dp.text, "html.parser")
                    dp_blocks = soup_dp.select('div[data-hook="review"], div[data-hook="cmps-review-card"], #cm-cr-dp-review-list [data-hook="review"], div[id^="customer_review-"]')
                    for idx, block in enumerate(dp_blocks):
                        body_elem = (
                            block.select_one('[data-hook="reviewText"]') or
                            block.select_one('[data-hook="review-body"]') or
                            block.select_one('[data-hook="reviewTextContainer"]') or
                            block.select_one('.review-text')
                        )
                        if not body_elem:
                            continue
                        body_text = body_elem.get_text(separator=" ", strip=True)
                        for boilerplate in [
                            "Brief content visible, double tap to read full content.",
                            "Full content visible, double tap to read brief content.",
                            "Read more",
                            "Read less",
                        ]:
                            body_text = body_text.replace(boilerplate, "").strip()

                        if not body_text:
                            continue

                        title_elem = (
                            block.select_one('[data-hook="reviewTitle"]') or
                            block.select_one('[data-hook="review-title"]') or
                            block.select_one('a[data-hook="review-title"] span') or
                            block.select_one('h5[data-hook="reviewTitle"]')
                        )
                        title_text = title_elem.get_text(strip=True) if title_elem else ""
                        full_text = f"{title_text} — {body_text}" if title_text and not body_text.startswith(title_text) else body_text

                        norm_k = re.sub(r'[^a-zA-Z0-9]', '', full_text).lower()
                        if not norm_k or norm_k in seen_texts:
                            continue
                        seen_texts.add(norm_k)

                        star_elem = block.select_one('i[data-hook="review-star-rating"] span, i[data-hook="cmps-review-star-rating"] span, span.a-icon-alt')
                        stars = 5
                        if star_elem:
                            try:
                                stars = int(float(star_elem.get_text().split()[0]))
                            except Exception:
                                stars = 5

                        author_elem = block.select_one("span.a-profile-name, .a-profile-name")
                        author_name = author_elem.get_text(strip=True) if author_elem else f"buyer_dp_{idx}"
                        verified = bool(block.select_one('span[data-hook="avp-badge"]') or "Verified Purchase" in block.get_text())

                        date_elem = block.select_one('[data-hook="review-date"]')
                        ts_str = "2026-11-03T00:00:00Z"
                        if date_elem:
                            try:
                                raw_d = date_elem.get_text(strip=True)
                                if " on " in raw_d:
                                    raw_d = raw_d.split(" on ", 1)[1]
                                ts_str = CommentPreprocessor.normalize_timestamp(raw_d)
                            except Exception:
                                pass

                        extracted_html.append(
                            CommentInput(
                                comment_id=f"amz_dp_{asin}_{idx}",
                                raw_text=full_text,
                                timestamp=ts_str,
                                like_count=0,
                                anonymized_author_id=get_author_hash(author_name),
                                author=author_name,
                                star_rating=stars,
                                verified_purchase=verified,
                                platform="amazon",
                            )
                        )

                # 2. Scrape /product-reviews/{asin}
                page = 1
                max_pages = max(1, (max_comments + 9) // 10) if max_comments else 3
                while page <= max_pages:
                    target_url = f"https://www.{domain}/product-reviews/{asin}?pageNumber={page}"
                    resp = client.get(target_url, headers=headers)
                    if "api-services-support@amazon.com" in resp.text or "Type the characters you see in this image" in resp.text:
                        break

                    soup = BeautifulSoup(resp.text, "html.parser")
                    review_blocks = soup.select('div[data-hook="review"], div[data-hook="cmps-review-card"], div[id^="customer_review-"]')
                    if not review_blocks:
                        break

                    for idx, block in enumerate(review_blocks):
                        body_elem = (
                            block.select_one('[data-hook="reviewText"]') or
                            block.select_one('[data-hook="review-body"]') or
                            block.select_one('[data-hook="reviewTextContainer"]') or
                            block.select_one('.review-text')
                        )
                        if not body_elem:
                            continue
                        body_text = body_elem.get_text(separator=" ", strip=True)
                        for boilerplate in [
                            "Brief content visible, double tap to read full content.",
                            "Full content visible, double tap to read brief content.",
                            "Read more",
                            "Read less",
                        ]:
                            body_text = body_text.replace(boilerplate, "").strip()

                        if not body_text:
                            continue

                        title_elem = (
                            block.select_one('[data-hook="reviewTitle"]') or
                            block.select_one('[data-hook="review-title"]') or
                            block.select_one('a[data-hook="review-title"] span') or
                            block.select_one('h5[data-hook="reviewTitle"]')
                        )
                        title_text = title_elem.get_text(strip=True) if title_elem else ""
                        full_text = f"{title_text} — {body_text}" if title_text and not body_text.startswith(title_text) else body_text

                        norm_k = re.sub(r'[^a-zA-Z0-9]', '', full_text).lower()
                        if not norm_k or norm_k in seen_texts:
                            continue
                        seen_texts.add(norm_k)

                        star_elem = block.select_one('i[data-hook="review-star-rating"] span') or block.select_one('i[data-hook="cmps-review-star-rating"] span')
                        stars = 5
                        if star_elem:
                            try:
                                stars = int(float(star_elem.get_text().split()[0]))
                            except Exception:
                                stars = 5

                        author_elem = block.select_one("span.a-profile-name, .a-profile-name")
                        author_name = author_elem.get_text(strip=True) if author_elem else f"buyer_{page}_{idx}"
                        verified = bool(block.select_one('span[data-hook="avp-badge"]') or "Verified Purchase" in block.get_text())

                        date_elem = block.select_one('[data-hook="review-date"]')
                        ts_str = "2026-11-03T00:00:00Z"
                        if date_elem:
                            try:
                                raw_d = date_elem.get_text(strip=True)
                                if " on " in raw_d:
                                    raw_d = raw_d.split(" on ", 1)[1]
                                ts_str = CommentPreprocessor.normalize_timestamp(raw_d)
                            except Exception:
                                pass

                        extracted_html.append(
                            CommentInput(
                                comment_id=f"amz_live_{asin}_{page}_{idx}",
                                raw_text=full_text,
                                timestamp=ts_str,
                                like_count=0,
                                anonymized_author_id=get_author_hash(author_name),
                                author=author_name,
                                star_rating=stars,
                                verified_purchase=verified,
                                platform="amazon",
                            )
                        )
                        if max_comments and len(extracted_html) >= max_comments:
                            break
                    if max_comments and len(extracted_html) >= max_comments:
                        break
                    page += 1
        except Exception:
            pass

        return extracted_html

    def _fetch_rapidapi(
        self,
        asin: str,
        api_key: Optional[str] = None,
        canonical_url: str = "",
        max_comments: Optional[int] = None,
        country_code: Optional[str] = None,
    ) -> List[CommentInput]:
        """Hybrid RapidAPI + Direct HTML Amazon Review Extractor."""
        key = api_key or self.rapidapi_key or get_rapidapi_key()
        limit = max_comments if max_comments is not None else 200
        extracted: List[CommentInput] = []
        seen_texts: Set[str] = set()

        domain = "amazon.com" if ".com" in canonical_url else "amazon.in"
        if not country_code:
            country_code = "US" if ".com" in canonical_url else "IN"

        # 1. Primary endpoint: amazon-online-data-api.p.rapidapi.com/product (firstocenka)
        if key:
            headers = {
                "x-rapidapi-key": key,
                "x-rapidapi-host": "amazon-online-data-api.p.rapidapi.com",
            }
            try:
                with httpx.Client(timeout=15.0) as client:
                    url = "https://amazon-online-data-api.p.rapidapi.com/product"
                    params = {"asins": asin, "geo": country_code, "country_code": country_code}
                    res = client.get(url, headers=headers, params=params)
                    if res.status_code == 200:
                        rapid_comments = extract_comments_from_rapidapi_json(res.json(), "amazon")
                        for rc in rapid_comments:
                            norm = re.sub(r'[^a-zA-Z0-9]', '', rc.raw_text).lower()
                            if norm not in seen_texts:
                                seen_texts.add(norm)
                                extracted.append(rc)
            except Exception:
                pass

        # 2. Hybrid Boost: Simultaneously scrape direct HTML (/dp/ & /product-reviews/)
        try:
            direct_html_comments = self._scrape_direct_html(asin, domain=domain, max_comments=limit)
            for dc in direct_html_comments:
                norm = re.sub(r'[^a-zA-Z0-9]', '', dc.raw_text).lower()
                if norm not in seen_texts:
                    seen_texts.add(norm)
                    extracted.append(dc)
        except Exception:
            pass

        return extracted[:limit]


class FlipkartExtractor:
    """
    Flipkart Product Review Extractor:
    - Direct HTML Review Scraper via httpx + BeautifulSoup (auto-converts /p/ to /product-reviews/)
    - Apify Flipkart Review Scraper (if APIFY_API_TOKEN provided)
    - Demo Sample Fallback only when is_demo=True or explicit demo post requested
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        scraper_url: Optional[str] = None,
        apify_token: Optional[str] = None,
    ):
        self.api_key = api_key or os.environ.get("FLIPKART_API_KEY")
        self.scraper_url = scraper_url
        self.apify_token = apify_token or os.environ.get("APIFY_API_TOKEN")

    @staticmethod
    def parse_flipkart_review_cards_from_soup(soup, clean_id="flp_item", page_num=1) -> List[CommentInput]:
        """Parse review cards from BeautifulSoup doc using 2026 Flipkart text-line algorithm.
        Handles both 'Verified Purchase' (2026) and 'Certified Buyer' (legacy) anchor phrases.
        NO <script> / window.__INITIAL_STATE__ regex parsing — that produces JSON fragment junk!
        """
        ANCHOR_RE = re.compile(r'(Verified\s+Purchase|Certified\s+Buyer)', re.IGNORECASE)
        NOISE_RE = re.compile(r'^(Review for\s*:|Helpful for\b|READ MORE|Read more|Report Abuse|Permalink|Most Helpful|Latest|Positive|Negative|Overall|User reviews sorted by|Images uploaded|All Reviews|Photos)', re.IGNORECASE)
        JSON_JUNK_RE = re.compile(r'[{}"\\]|viewAllImageUrl|tracking:|reviewList|__INITIAL_STATE__|"text":|"title":')

        reviews = []
        page_title = (soup.title.string if soup.title else "").strip().lower()

        # Find leaf elements containing the anchor phrase
        leaf_anchors = []
        for el in soup.find_all(['span', 'p', 'div']):
            txt = el.get_text()
            if ANCHOR_RE.search(txt):
                has_child_match = any(
                    ANCHOR_RE.search(child.get_text())
                    for child in el.find_all(['span', 'p', 'div'], recursive=False)
                )
                if not has_child_match:
                    leaf_anchors.append(el)

        candidate_cards = []
        for leaf in leaf_anchors:
            card = leaf
            while card.parent and card.parent.name not in (None, '[document]', 'body', 'html'):
                parent_text = card.parent.get_text()
                if len(ANCHOR_RE.findall(parent_text)) > 1:
                    break
                card = card.parent
            candidate_cards.append(card)

        # Also add classic Flipkart class review cards (NEVER include div.cPHDOP which is page column wrapper)
        candidate_cards.extend(soup.select("div.EPCmJX, div._27M-vq, div.RcXBOT, div._2wzgFH, div[data-review-id]"))

        processed_cards = set()

        AUTHOR_DATE_RE = re.compile(
            r'(?:(?<=[.!?])\s+|\s+)([A-Z][A-Za-z.]*(?:\s+[A-Z][A-Za-z.]*)*)\s*(?:[Hh]elpful)?\s*[·•]\s*((?i:\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago|today|yesterday|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*,?\s*\d{4}))(?i:\s*Helpful.*)?$'
        )
        HELPFUL_NOISE_RE = re.compile(r'\s*(?:Helpful\s*(?:for\s*\d+)?|\bHelpful\b|\bREAD MORE\b|\bRead more\b|\.\.\.\s*more)\s*$', re.IGNORECASE)
        LEADING_BULLET_RE = re.compile(r'^[•·★*!\-—\s:]+')

        seen_review_signatures: Set[str] = set()

        for card in candidate_cards:
            card_id = id(card)
            if card_id in processed_cards:
                continue
            processed_cards.add(card_id)

            # Direct element selectors on modern Flipkart card first
            direct_star = None
            star_el = card.select_one("div.XQDdHH, div._3LWZlK, div.XWuL2k, div._5OesEi, span.Y1HWO0, div[class*='rating-title'], div.rating-title-row, [class*='star-rating'], [class*='StarRating']")
            if star_el:
                parent_footer = star_el.find_parent(class_=re.compile(r'helpful|dislike|footer', re.I))
                if not parent_footer:
                    sm = re.search(r'([1-5](?:\.\d)?)', star_el.get_text())
                    if sm:
                        direct_star = round(float(sm.group(1)))

            direct_title = ""
            title_el = card.select_one("p.z9E0IG, p._2-N8zT, div.rating-title-row, [class*='title']")
            if title_el:
                dt = re.sub(r'^[1-5](\.\d)?\s*[•·★*]?\s*', '', title_el.get_text()).strip()
                dt = LEADING_BULLET_RE.sub('', dt).strip()
                if 1 < len(dt) < 80 and not re.match(r'^[•·★*!\-—\s:]+$', dt):
                    direct_title = dt

            direct_body = ""
            body_el = card.select_one("div.ZmyHeo, div.t-ZTKy, div.review-body-text, [class*='reviewText'], [class*='review-body']")
            if body_el:
                direct_body = body_el.get_text(separator=' ', strip=True)
                direct_body = re.sub(r'\s*READ MORE\s*$', '', direct_body, flags=re.IGNORECASE).strip()

            direct_author = ""
            author_el = card.select_one("p._2NsDsF, p._2sc7ZR, div.reviewer-name-loc, [class*='reviewer']")
            if author_el:
                direct_author = author_el.get_text(strip=True)
                direct_author = re.sub(r'[•·,]\s*Verified.*$', '', direct_author, flags=re.I).strip()

            direct_verified = False
            direct_time = "2026-11-10T00:00:00Z"
            verified_el = card.select_one("p.MztJPv, p._2mcPpO, div.verified-badge-row, [class*='certified'], [class*='verified']")
            if verified_el:
                vt = verified_el.get_text()
                direct_verified = bool(re.search(r'Verified|Certified', vt, re.IGNORECASE))
                dm = re.search(r'[•·,]\s*(.+)$', vt)
                if dm:
                    direct_time = dm.group(1).strip()

            # Clean direct_body and extract author/date suffix if stuck in body
            if direct_body:
                adm = AUTHOR_DATE_RE.search(direct_body)
                if adm:
                    if not direct_author or direct_author.startswith("flp_user"):
                        direct_author = adm.group(1).strip()
                    if direct_time.startswith("2026-11-10"):
                        direct_time = adm.group(2).strip()
                    direct_body = direct_body[:adm.start()].strip()
                direct_body = HELPFUL_NOISE_RE.sub('', direct_body).strip()
                direct_body = LEADING_BULLET_RE.sub('', direct_body).strip()

            # If direct selectors extracted body/title, use them
            if direct_body or direct_title:
                effective_star = direct_star if direct_star is not None else 5
                if direct_title and direct_body:
                    clean_b = re.sub(r'^' + re.escape(direct_title) + r'\s*[—\-·•!:]*\s*', '', direct_body, flags=re.IGNORECASE).strip()
                    full_text = f"{direct_title} — {clean_b}" if clean_b else (direct_body or direct_title)
                else:
                    full_text = direct_body or direct_title
                full_text = LEADING_BULLET_RE.sub('', full_text).strip()
                full_text = HELPFUL_NOISE_RE.sub('', full_text).strip()

                author_name = direct_author or f"flp_user_{page_num}_{len(reviews)}"
                canon_key = re.sub(r'[^a-zA-Z0-9]', '', full_text).lower()
                if canon_key in seen_review_signatures:
                    continue
                seen_review_signatures.add(canon_key)

                rev_hash = hashlib.md5(f"{full_text}_{author_name}".encode('utf-8')).hexdigest()[:12]
                reviews.append(
                    CommentInput(
                        comment_id=f"flp_{clean_id}_{rev_hash}",
                        raw_text=full_text,
                        timestamp=direct_time,
                        like_count=0,
                        anonymized_author_id=get_author_hash(author_name),
                        author=author_name,
                        star_rating=effective_star,
                        verified_purchase=direct_verified,
                        platform="flipkart",
                    )
                )
                continue

            # Fallback to text line parser
            raw_lines = card.get_text("\n").split("\n")
            lines = [l.strip() for l in raw_lines if l.strip()]
            if len(lines) < 2:
                continue

            # Reject JSON fragment leaks from <script> tags
            if any(JSON_JUNK_RE.search(l) for l in lines):
                continue
            # Reject if any line IS the page title
            if page_title and any(l.lower() == page_title for l in lines):
                continue

            star_rating = direct_star
            review_title = direct_title
            body_lines = []
            author_name = direct_author or f"flp_user_{page_num}_{len(reviews)}"
            timestamp_str = direct_time
            is_verified = direct_verified
            verified_idx = -1

            for i, line in enumerate(lines):
                # Star rating: ONLY from line 0 or 1 at the top of the card! NEVER from footer lines!
                if star_rating is None and i <= 1:
                    rm = re.match(r'^([1-5](?:\.\d)?)\s*[•·★*]?\s*(.*)$', line)
                    if rm and len(line) < 80:
                        star_rating = round(float(rm.group(1)))
                        possible_title = LEADING_BULLET_RE.sub('', rm.group(2)).strip()
                        if 1 < len(possible_title) < 60 and not re.match(r'^[•·★*!\-—\s:]+$', possible_title):
                            review_title = possible_title
                        continue

                # Review title on line after star rating (only within top lines)
                if not review_title and star_rating is not None and len(body_lines) == 0 and i <= 2 and len(line) < 70 and not NOISE_RE.match(line) and not re.match(r'^(Verified\s+Purchase|Certified\s+Buyer)', line, re.IGNORECASE):
                    cleaned_t = LEADING_BULLET_RE.sub('', line).strip()
                    if len(cleaned_t) > 1 and not re.match(r'^[•·★*!\-—\s:]+$', cleaned_t):
                        review_title = cleaned_t
                        continue

                # Verified/Certified line
                if re.match(r'^(Verified\s+Purchase|Certified\s+Buyer)', line, re.IGNORECASE):
                    is_verified = True
                    verified_idx = i
                    date_m = re.search(r'[•·,]\s*(.+)$', line)
                    if date_m:
                        timestamp_str = date_m.group(1).strip()
                    continue

                # Noise lines / lone numbers (footer thumbs up/down counters)
                if NOISE_RE.match(line):
                    continue
                if re.match(r'^\d+$', line):
                    continue

                # Check if line contains author · relative date pattern
                adm = AUTHOR_DATE_RE.search(line)
                if adm:
                    if not direct_author or direct_author.startswith("flp_user"):
                        author_name = adm.group(1).strip()
                    timestamp_str = adm.group(2).strip()
                    line_clean = line[:adm.start()].strip()
                    if line_clean:
                        body_lines.append((line_clean, i))
                    continue

                body_lines.append((line, i))

            # Identify author: short line near end, before verified, looks like a name (only if not already found)
            if not author_name or author_name.startswith("flp_user"):
                author_found_idx = -1
                for bi in range(len(body_lines) - 1, -1, -1):
                    bl_text, bl_idx = body_lines[bi]
                    if (
                        len(bl_text) < 60
                        and not bl_text.endswith(".")
                        and not bl_text.endswith("!")
                        and not bl_text.endswith("?")
                        and not re.match(r'^(READ MORE|Report Abuse|Helpful)', bl_text, re.IGNORECASE)
                    ):
                        if verified_idx > 0 and bl_idx < verified_idx:
                            author_name = bl_text
                            author_found_idx = bi
                            break
                        if verified_idx == -1 and bi == len(body_lines) - 1:
                            author_name = bl_text
                            author_found_idx = bi
                            break

                if author_found_idx >= 0:
                    body_lines.pop(author_found_idx)

            body_text = " ".join(bl[0] for bl in body_lines)
            body_text = re.sub(r'\s*READ MORE\s*$', '', body_text, flags=re.IGNORECASE).strip()
            # Clean author date suffix if still in body_text
            adm = AUTHOR_DATE_RE.search(body_text)
            if adm:
                if not author_name or author_name.startswith("flp_user"):
                    author_name = adm.group(1).strip()
                timestamp_str = adm.group(2).strip()
                body_text = body_text[:adm.start()].strip()

            body_text = HELPFUL_NOISE_RE.sub('', body_text).strip()
            body_text = LEADING_BULLET_RE.sub('', body_text).strip()

            if review_title and body_text:
                clean_b = re.sub(r'^' + re.escape(review_title) + r'\s*[—\-·•!:]*\s*', '', body_text, flags=re.IGNORECASE).strip()
                raw_text = f"{review_title} — {clean_b}" if clean_b else (body_text or review_title)
            elif body_text:
                raw_text = body_text
            elif review_title:
                raw_text = review_title
            else:
                continue

            raw_text = LEADING_BULLET_RE.sub('', raw_text).strip()
            raw_text = HELPFUL_NOISE_RE.sub('', raw_text).strip()

            if len(raw_text) < 3:
                continue

            canon_key = re.sub(r'[^a-zA-Z0-9]', '', raw_text).lower()
            if canon_key in seen_review_signatures:
                continue
            seen_review_signatures.add(canon_key)

            reviews.append(
                CommentInput(
                    comment_id=f"flp_live_{clean_id}_{page_num}_{len(reviews)}",
                    raw_text=raw_text,
                    timestamp=timestamp_str,
                    like_count=0,
                    anonymized_author_id=get_author_hash(author_name),
                    author=author_name,
                    star_rating=star_rating if star_rating else 5,
                    verified_purchase=is_verified,
                    product_variant=None,
                )
            )

        return reviews

    def extract(
        self,
        post_id: str = "flp_electronics_sale",
        max_comments: Optional[int] = None,
        is_demo: bool = False,
        fallback_on_blocked: bool = False,
    ) -> PostInput:
        clean_id, _, canonical_url = parse_input_url_or_id(post_id, default_platform="flipkart")

        # 1. Offline Demo Preset explicitly requested
        if is_demo or clean_id == "flp_electronics_sale":
            sample_candidates = [
                Path("sample_data/flipkart_product_reviews.json"),
                Path("sentiment_module/sample_data/flipkart_product_reviews.json"),
                Path(__file__).resolve().parent.parent / "sample_data" / "flipkart_product_reviews.json",
            ]
            sample_file = next((p for p in sample_candidates if p.exists()), None)
            if not sample_file:
                sample_file = Path("sample_data/flipkart_product_reviews.json")
                generate_realistic_flipkart_dataset(sample_file)

            with open(sample_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            raw_list = data["comments"]
            if max_comments is not None:
                raw_list = raw_list[:max_comments]

            comments = [CommentInput(**c) for c in raw_list]
            return PostInput(
                post_id=data.get("post_id", clean_id),
                post_url=data.get("post_url", canonical_url),
                platform="flipkart",
                comments=comments,
                unbounded_fetch=(max_comments is None),
                pages_fetched=data.get("pages_fetched", 125),
                is_demo=True,
                data_source="Offline Sample Preset (sample_data/flipkart_product_reviews.json)",
                data_source_badge="DEMO PRESET: Offline Sample Dataset",
                platform_reported_total=len(comments),
            )

        # 2. Direct Key-Free HTML Scraping with /p/ & /product-reviews/ extraction
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-IN,en;q=0.9",
            "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
        }
        extracted_flp: List[CommentInput] = []

        # Convert /p/ URL to /product-reviews/ URL
        review_base_url = canonical_url
        if "/p/" in review_base_url:
            review_base_url = review_base_url.replace("/p/", "/product-reviews/")

        page = 1
        max_pages = max(1, (max_comments + 9) // 10) if max_comments else 25

        try:
            with httpx.Client(timeout=15.0, follow_redirects=True) as client:
                # First attempt: Scrape product page /p/ for DOM review cards (NO script/JSON regex!)
                if "/p/" in canonical_url or "/product-reviews/" not in canonical_url:
                    p_resp = client.get(canonical_url, headers=headers)
                    if p_resp.status_code == 200:
                        p_soup = BeautifulSoup(p_resp.text, "html.parser")
                        extracted_flp.extend(self.parse_flipkart_review_cards_from_soup(p_soup, clean_id, 0))

                # Second attempt: Paginate /product-reviews/
                while page <= max_pages:
                    sep = "&" if "?" in review_base_url else "?"
                    target_url = f"{review_base_url}{sep}page={page}"
                    resp = client.get(target_url, headers=headers)
                    if resp.status_code != 200:
                        break

                    soup = BeautifulSoup(resp.text, "html.parser")
                    new_reviews = self.parse_flipkart_review_cards_from_soup(soup, clean_id, page)
                    if not new_reviews:
                        break

                    for rev in new_reviews:
                        if not any(e.raw_text == rev.raw_text for e in extracted_flp):
                            extracted_flp.append(rev)
                        if max_comments and len(extracted_flp) >= max_comments:
                            break

                    if max_comments and len(extracted_flp) >= max_comments:
                        break
                    page += 1

                    if max_comments and len(extracted_flp) >= max_comments:
                        break
                    page += 1

            if extracted_flp:
                return PostInput(
                    post_id=clean_id,
                    post_url=canonical_url,
                    platform="flipkart",
                    comments=extracted_flp,
                    unbounded_fetch=(max_comments is None),
                    pages_fetched=page,
                    is_demo=False,
                    data_source="Live Web Scrape (Zero API Key - Flipkart BS4 Scraper)",
                    data_source_badge="LIVE: Flipkart BS4 Scraper",
                    platform_reported_total=len(extracted_flp),
                )
        except Exception:
            pass

        # 3. Apify Fallback for Flipkart (if APIFY_API_TOKEN is present)
        if self.apify_token:
            try:
                from apify_client import ApifyClient
                client = ApifyClient(self.apify_token)
                run_input = {
                    "startUrls": [{"url": canonical_url}],
                    "maxReviews": max_comments if max_comments is not None else 500,
                }
                run = client.actor("codingfrontend/flipkart-reviews-scraper").call(run_input=run_input)
                dataset_id = getattr(run, "default_dataset_id", None) or (run.get("defaultDatasetId") if isinstance(run, dict) else None)
                if dataset_id:
                    extracted_apify: List[CommentInput] = []
                    for item in client.dataset(dataset_id).iterate_items():
                        r_text = item.get("reviewText") or item.get("review") or item.get("text") or item.get("description") or ""
                        if not r_text.strip():
                            continue
                        r_title = item.get("reviewTitle") or item.get("title") or ""
                        full_txt = f"{r_title}. {r_text}" if r_title else r_text
                        stars = int(item.get("rating") or item.get("stars") or 5)
                        author_name = item.get("reviewerName") or item.get("author") or "flp_buyer"
                        is_cert = bool(item.get("certifiedBuyer", True))
                        extracted_apify.append(
                            CommentInput(
                                comment_id=str(item.get("id") or f"flp_apify_{len(extracted_apify)}"),
                                raw_text=full_txt,
                                timestamp=str(item.get("date") or "2026-11-03T00:00:00Z"),
                                like_count=int(item.get("likes") or 0),
                                anonymized_author_id=get_author_hash(str(author_name)),
                                star_rating=stars,
                                verified_purchase=is_cert,
                            )
                        )
                        if max_comments and len(extracted_apify) >= max_comments:
                            break

                    if extracted_apify:
                        return PostInput(
                            post_id=clean_id,
                            post_url=canonical_url,
                            platform="flipkart",
                            comments=extracted_apify,
                            unbounded_fetch=(max_comments is None),
                            pages_fetched=1,
                            is_demo=False,
                            data_source="Live Ingestion via Apify Flipkart Scraper",
                            data_source_badge="LIVE: Flipkart Apify Scraper",
                            platform_reported_total=len(extracted_apify),
                        )
            except Exception:
                pass

        # 4. Live extraction blocked by Flipkart challenge/login wall
        raise ValueError(
            f"Flipkart live scraping blocked by anti-bot challenge for item '{clean_id}'. "
            "To analyze real customer reviews directly from your active browser session, "
            "use the Sentinelytics Browser Extension on your active Flipkart product tab, "
            "or configure an Apify token in Settings."
        )


class UniversalEcommerceExtractor:
    """
    Universal E-Commerce Review Extractor for Myntra, Meesho, Nykaa, Ajio:
    - Multi-Channel Waterfall:
      1. Direct HTML scraping with spoofed desktop browser headers and BeautifulSoup
      2. Context-Aware Smart Benchmark Fallback (Extracts product slug from URL and generates authentic domain-specific reviews)
    """
    def __init__(self, platform: str = "myntra"):
        self.platform = platform.lower()

    def extract(
        self,
        post_id: str,
        max_comments: Optional[int] = None,
        is_demo: bool = False,
        fallback_on_blocked: bool = False,
    ) -> PostInput:
        clean_id, detected_platform, canonical_url = parse_input_url_or_id(post_id, default_platform=self.platform)
        platform = self.platform or detected_platform

        extracted_reviews: List[CommentInput] = []

        # Attempt 1: Direct HTML scrape via httpx + BeautifulSoup
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
                "Referer": "https://www.google.com/",
            }
            with httpx.Client(timeout=10.0, follow_redirects=True) as client:
                resp = client.get(canonical_url, headers=headers)
                if resp.status_code == 200:
                    soup = BeautifulSoup(resp.text, "html.parser")
                    review_elements = soup.select(
                        ".user-review-main, .review-container, [data-testid='review-card'], "
                        ".ReviewCard, .comment-item, .reviews-list-item, div[class*='Review']"
                    )
                    for idx, el in enumerate(review_elements):
                        body = el.select_one("p, .review-text, .user-review-reviewText, [class*='text']")
                        if not body:
                            continue
                        txt = body.get_text(separator=" ", strip=True)
                        if len(txt) < 10:
                            continue
                        star = 5
                        star_el = el.select_one("[class*='rating'], [class*='star']")
                        if star_el:
                            nums = re.findall(r"[1-5]", star_el.get_text())
                            if nums:
                                star = int(nums[0])
                        extracted_reviews.append(
                            CommentInput(
                                comment_id=f"{platform}_{clean_id}_{idx}",
                                raw_text=txt,
                                timestamp=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                                like_count=0,
                                anonymized_author_id=get_author_hash(f"{platform}_user_{idx}"),
                                star_rating=star,
                                verified_purchase=True,
                            )
                        )
                        if max_comments and len(extracted_reviews) >= max_comments:
                            break
        except Exception:
            pass

        if extracted_reviews:
            return PostInput(
                post_id=clean_id,
                post_url=canonical_url,
                platform=platform,
                comments=extracted_reviews,
                unbounded_fetch=(max_comments is None),
                pages_fetched=1,
                is_demo=False,
                data_source=f"Live Web Scrape (Zero API Key - {platform.capitalize()} BS4 Scraper)",
                data_source_badge=f"LIVE: {platform.capitalize()} BS4 Scraper",
                platform_reported_total=len(extracted_reviews),
            )

        raise ValueError(
            f"Could not extract live reviews for {platform.capitalize()} item '{clean_id}'. "
            "Anti-bot or login wall encountered. Please use the Sentinelytics Chrome Extension "
            "on your active browser tab to capture live reviews directly."
        )


class InstagramExtractor:
    """
    Instagram Comment Extractor (3-Tier Multi-Channel Waterfall):
    - Tier 1: Official Instagram Graph API (for owned business/creator accounts with Media ID)
    - Tier 2: Apify Cloud Scraper (for any public post/reel URL with anti-bot proxies)
    - Tier 3: Instaloader Local Python Scraper (100% free keyless fallback for public shortcodes)
    - Demo Preset Fallback: when is_demo=True or post_id is 'ig_demo_creator_reel'
    """

    def __init__(
        self,
        mode: str = "public_scraper",
        access_token: Optional[str] = None,
        apify_token: Optional[str] = None,
        rapidapi_key: Optional[str] = None,
    ):
        self.mode = mode
        self.access_token = access_token or os.environ.get("INSTAGRAM_ACCESS_TOKEN")
        self.apify_token = apify_token or os.environ.get("APIFY_API_TOKEN")
        self.rapidapi_key = rapidapi_key or os.environ.get("RAPIDAPI_KEY")
        self.last_quota_exceeded = False

    def extract(
        self,
        post_id: str,
        max_comments: Optional[int] = None,
        is_demo: bool = False,
        fallback_on_blocked: bool = False,
    ) -> PostInput:
        clean_id, _, canonical_url = parse_input_url_or_id(post_id, default_platform="instagram")

        # 1. Demo Preset requested
        if is_demo or clean_id == "ig_demo_creator_reel":
            dataset = generate_realistic_flagged_dataset()
            raw_list = dataset["comments"]
            if max_comments is not None:
                raw_list = raw_list[:max_comments]

            comments = [CommentInput(**c) for c in raw_list]
            return PostInput(
                post_id=clean_id,
                post_url=canonical_url,
                platform="instagram",
                comments=comments,
                unbounded_fetch=(max_comments is None),
                pages_fetched=dataset.get("pages_fetched", 11),
                is_demo=True,
                data_source="Offline Sample Preset (Instagram Creator Reel)",
                data_source_badge="DEMO PRESET: Offline Sample Dataset",
                platform_reported_total=len(comments),
            )

        # Tier 1: Official Instagram Graph API (For Owned Business/Creator Accounts)
        if self.access_token and (clean_id.isdigit() or self.mode == "graph_api"):
            try:
                extracted_graph = self._fetch_graph_api(clean_id, max_comments)
                if extracted_graph:
                    return PostInput(
                        post_id=clean_id,
                        post_url=canonical_url,
                        platform="instagram",
                        comments=extracted_graph,
                        unbounded_fetch=(max_comments is None),
                        pages_fetched=max(1, len(extracted_graph) // 50),
                        is_demo=False,
                        data_source="Official Instagram Graph API (Live Ingestion)",
                        data_source_badge="LIVE: Instagram Graph API",
                        platform_reported_total=len(extracted_graph),
                    )
            except Exception:
                # If Graph API fails (e.g. non-owned media), fall through to Tier 2
                pass

        # Tier 1.5: RapidAPI Instagram Scraper (Stable Real-Time Scraper)
        rapidapi_key = self.rapidapi_key or os.environ.get("RAPIDAPI_KEY")
        if rapidapi_key:
            try:
                extracted_rapid = self._fetch_rapidapi(clean_id, rapidapi_key, max_comments)
                if extracted_rapid:
                    return PostInput(
                        post_id=clean_id,
                        post_url=canonical_url,
                        platform="instagram",
                        comments=extracted_rapid,
                        unbounded_fetch=(max_comments is None),
                        pages_fetched=max(1, len(extracted_rapid) // 50),
                        is_demo=False,
                        data_source="Live Ingestion via RapidAPI Instagram Scraper",
                        data_source_badge="LIVE: RapidAPI Instagram",
                        platform_reported_total=len(extracted_rapid),
                    )
            except Exception:
                pass

        # Tier 2: Apify Cloud Scraper (For Any Public Post/Reel URL with Anti-Bot Proxies)
        if self.apify_token:
            try:
                extracted_apify = self._fetch_apify(canonical_url, max_comments)
                if extracted_apify:
                    return PostInput(
                        post_id=clean_id,
                        post_url=canonical_url,
                        platform="instagram",
                        comments=extracted_apify,
                        unbounded_fetch=(max_comments is None),
                        pages_fetched=max(1, len(extracted_apify) // 50),
                        is_demo=False,
                        data_source="Live Ingestion via Apify Instagram Scraper",
                        data_source_badge="LIVE: Instagram Apify Scraper",
                        platform_reported_total=len(extracted_apify),
                    )
            except Exception:
                # If Apify fails, fall through to Tier 3
                pass

        # Tier 3: Instaloader Local Python Scraper (100% Free Keyless Fallback for Public URLs)
        try:
            extracted_instaloader = self._fetch_instaloader(clean_id, max_comments)
            if extracted_instaloader:
                return PostInput(
                    post_id=clean_id,
                    post_url=canonical_url,
                    platform="instagram",
                    comments=extracted_instaloader,
                    unbounded_fetch=(max_comments is None),
                    pages_fetched=max(1, len(extracted_instaloader) // 25),
                    is_demo=False,
                    data_source="Live Keyless Scrape via Instaloader",
                    data_source_badge="LIVE: Instagram Instaloader",
                    platform_reported_total=len(extracted_instaloader),
                )
        except Exception:
            pass

        # Tier 4: Live extraction blocked by Instagram login wall (Zero fake comments)
        raise ValueError(
            f"Instagram live scraping blocked by login wall for '{clean_id}'. "
            "To analyze real Instagram comments without blocks, click '🧩 Browser Extension & Live Collector' "
            "in the top bar or use the Sentinelytics Chrome Extension on your active Instagram tab (while logged in), "
            "or configure an Instagram Access Token / Apify token in Settings."
        )

    def _fetch_graph_api(self, media_id: str, max_comments: Optional[int] = None) -> List[CommentInput]:
        url = f"https://graph.facebook.com/v19.0/{media_id}/comments"
        params = {
            "access_token": self.access_token,
            "fields": "id,text,timestamp,like_count,from",
            "limit": 100,
        }
        extracted = []
        with httpx.Client(timeout=15.0) as client:
            while True:
                res = client.get(url, params=params)
                if res.status_code != 200:
                    break
                body = res.json()
                items = body.get("data", [])
                for item in items:
                    author_name = item.get("from", {}).get("username", "anon")
                    extracted.append(
                        CommentInput(
                            comment_id=item["id"],
                            raw_text=item.get("text", ""),
                            timestamp=item.get("timestamp", "2026-11-03T00:00:00Z"),
                            like_count=item.get("like_count", 0),
                            anonymized_author_id=get_author_hash(author_name),
                        )
                    )
                    if max_comments and len(extracted) >= max_comments:
                        break

                if max_comments and len(extracted) >= max_comments:
                    break

                next_cursor = body.get("paging", {}).get("cursors", {}).get("after")
                if not next_cursor:
                    break
                params["after"] = next_cursor
        return extracted

    def _fetch_apify(self, post_url: str, max_comments: Optional[int] = None) -> List[CommentInput]:
        from apify_client import ApifyClient
        client = ApifyClient(self.apify_token)
        run_input = {
            "directUrls": [post_url],
            "resultsLimit": max_comments if max_comments is not None else 1000,
        }
        run = client.actor("apify/instagram-comment-scraper").call(run_input=run_input)
        dataset_id = getattr(run, "default_dataset_id", None) or (run.get("defaultDatasetId") if isinstance(run, dict) else None)
        if not dataset_id:
            return []
        extracted = []
        for item in client.dataset(dataset_id).iterate_items():
            cid = str(item.get("id") or item.get("pk") or f"ig_{len(extracted)}")
            text = item.get("text") or item.get("comment_text") or ""
            if not text.strip():
                continue
            author = item.get("ownerUsername") or item.get("owner_username") or item.get("user", {}).get("username") or "anon"
            timestamp = item.get("timestamp") or item.get("created_at") or "2026-11-03T00:00:00Z"
            likes = int(item.get("likesCount") or item.get("likes_count") or 0)
            extracted.append(
                CommentInput(
                    comment_id=cid,
                    raw_text=text,
                    timestamp=timestamp,
                    like_count=likes,
                    anonymized_author_id=get_author_hash(author),
                )
            )
            if max_comments and len(extracted) >= max_comments:
                break
        return extracted

    def _fetch_instaloader(self, shortcode: str, max_comments: Optional[int] = None) -> List[CommentInput]:
        import instaloader
        L = instaloader.Instaloader(quiet=True, download_pictures=False, download_videos=False)
        if os.environ.get("IG_LOGIN_USER") and os.environ.get("IG_LOGIN_PASS"):
            L.login(os.environ["IG_LOGIN_USER"], os.environ["IG_LOGIN_PASS"])
        post = instaloader.Post.from_shortcode(L.context, shortcode)
        extracted = []
        limit = max_comments if max_comments is not None else 1000
        for comment in itertools.islice(post.get_comments(), limit):
            cid = str(comment.id)
            text = comment.text
            if not text.strip():
                continue
            author = comment.owner.username if comment.owner else "anon"
            timestamp = comment.created_at_utc.strftime("%Y-%m-%dT%H:%M:%SZ") if comment.created_at_utc else "2026-11-03T00:00:00Z"
            likes = comment.likes_count or 0
            extracted.append(
                CommentInput(
                    comment_id=cid,
                    raw_text=text,
                    timestamp=timestamp,
                    like_count=likes,
                    anonymized_author_id=get_author_hash(author),
                )
            )
        return extracted

    def _fetch_rapidapi(self, shortcode: str, api_key: Optional[str] = None, max_comments: Optional[int] = None) -> List[CommentInput]:
        key = api_key or self.rapidapi_key or get_rapidapi_key()
        if not key:
            return []

        limit = max_comments if max_comments is not None else 500
        extracted: List[CommentInput] = []
        seen_texts: Set[str] = set()
        self.last_quota_exceeded = False

        # Convert shortcode to numeric Instagram media ID required by this API
        numeric_id = ""
        try:
            alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
            m_id = 0
            for ch in shortcode:
                m_id = (m_id * 64) + alpha.index(ch)
            numeric_id = str(m_id)
        except Exception:
            numeric_id = shortcode

        with httpx.Client(timeout=15.0) as client:
            # Endpoint 1: instagram-scraper-stable-api (thetechguy32711)
            try:
                url1 = "https://instagram-scraper-stable-api.p.rapidapi.com/get_post_comments.php"
                headers1 = {
                    "x-rapidapi-key": key,
                    "x-rapidapi-host": "instagram-scraper-stable-api.p.rapidapi.com",
                }
                cursor = None
                for _ in range(5):
                    params1 = {"post_id": numeric_id or shortcode, "media_code": shortcode}
                    if cursor:
                        params1["cursor"] = cursor
                    r1 = client.get(url1, headers=headers1, params=params1)
                    if r1.status_code == 429:
                        self.last_quota_exceeded = True
                        break
                    elif r1.status_code == 200:
                        body1 = r1.json()
                        items = extract_comments_from_rapidapi_json(body1, "instagram")
                        for it in items:
                            norm = re.sub(r'[^a-zA-Z0-9]', '', it.raw_text).lower()
                            if norm not in seen_texts:
                                seen_texts.add(norm)
                                extracted.append(it)
                        if len(extracted) >= limit:
                            break
                        cursor = body1.get("data", {}).get("next_cursor") or body1.get("next_cursor") or body1.get("next_max_id")
                        if not cursor:
                            break
                    else:
                        break
            except Exception:
                pass

            # Endpoint 2 Fallback: instagram-scraper-api2
            if not extracted and not self.last_quota_exceeded:
                try:
                    url2 = "https://instagram-scraper-api2.p.rapidapi.com/v1/comments"
                    headers2 = {
                        "x-rapidapi-key": key,
                        "x-rapidapi-host": "instagram-scraper-api2.p.rapidapi.com",
                    }
                    r2 = client.get(url2, headers=headers2, params={"code_or_id_or_url": shortcode})
                    if r2.status_code == 429:
                        self.last_quota_exceeded = True
                    elif r2.status_code == 200:
                        items = extract_comments_from_rapidapi_json(r2.json(), "instagram")
                        for it in items:
                            norm = re.sub(r'[^a-zA-Z0-9]', '', it.raw_text).lower()
                            if norm not in seen_texts:
                                seen_texts.add(norm)
                                extracted.append(it)
                except Exception:
                    pass

            # Endpoint 3 Fallback: instagram-bulk-scraper-latest
            if not extracted and not self.last_quota_exceeded:
                try:
                    url3 = f"https://instagram-bulk-scraper-latest.p.rapidapi.com/webget_comments_by_shortcode/{shortcode}"
                    headers3 = {
                        "x-rapidapi-key": key,
                        "x-rapidapi-host": "instagram-bulk-scraper-latest.p.rapidapi.com",
                    }
                    r3 = client.get(url3, headers=headers3)
                    if r3.status_code == 429:
                        self.last_quota_exceeded = True
                    elif r3.status_code == 200:
                        items = extract_comments_from_rapidapi_json(r3.json(), "instagram")
                        for it in items:
                            norm = re.sub(r'[^a-zA-Z0-9]', '', it.raw_text).lower()
                            if norm not in seen_texts:
                                seen_texts.add(norm)
                                extracted.append(it)
                except Exception:
                    pass

        return extracted[:limit]
