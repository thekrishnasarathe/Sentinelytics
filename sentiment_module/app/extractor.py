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
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from typing import List, Dict, Any, Optional, Tuple
import httpx
from bs4 import BeautifulSoup
from .schemas import CommentInput, PostInput

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


def parse_url_and_detect_platform(input_str: str) -> Tuple[str, str, str]:
    """
    Automatic URL Parser & Platform Detector.
    Takes any input string (Full URL, Video ID, ASIN, FSN, or Demo ID) and returns:
    (clean_id, detected_platform, canonical_url)
    """
    raw = input_str.strip()

    # 1. YouTube Detection
    # Formats: youtube.com/watch?v=XXXX, youtu.be/XXXX, youtube.com/shorts/XXXX, embed/XXXX
    if "youtube.com" in raw or "youtu.be" in raw:
        m = re.search(r"(?:v=|\/shorts\/|\/embed\/|\/v\/|youtu\.be\/)([\w-]{11})", raw)
        if m:
            vid = m.group(1)
            return vid, "youtube", f"https://www.youtube.com/watch?v={vid}"
        # Query param fallback
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

    # 3. Amazon Detection
    # Formats: amazon.in/dp/B0XXXX, amazon.com/gp/product/B0XXXX, amazon.in/product-reviews/B0XXXX
    if "amazon" in raw:
        m = re.search(r"\/(?:dp|gp\/product|product-reviews)\/([A-Z0-9]{10})", raw)
        if m:
            asin = m.group(1)
            return asin, "amazon", f"https://www.amazon.in/dp/{asin}"
        return raw, "amazon", raw

    # 4. Flipkart Detection
    # Formats: flipkart.com/.../p/XXXX?pid=YYYY
    if "flipkart" in raw:
        m_pid = re.search(r"pid=([A-Z0-9]+)", raw)
        m_p = re.search(r"\/p\/([a-zA-Z0-9]+)", raw)
        if m_pid:
            fsn = m_pid.group(1)
            return fsn, "flipkart", raw
        if m_p:
            fsn = m_p.group(1)
            return fsn, "flipkart", raw
        return raw, "flipkart", raw

    # 5. Raw ID / Preset Heuristics
    if raw in DEMO_POST_IDS:
        if raw.startswith("yt_"):
            return raw, "youtube", "https://www.youtube.com/watch?v=flagged_demo_video"
        elif raw.startswith("ig_"):
            return raw, "instagram", "https://www.instagram.com/p/ig_demo_creator_reel/"
        elif raw.startswith("amz_"):
            return raw, "amazon", "https://www.amazon.in/dp/B09X6GMNP7"
        elif raw.startswith("flp_"):
            return raw, "flipkart", "https://www.flipkart.com/realme-12-pro-5g/p/itme12345"

    # Standalone ASIN (10 characters alphanumeric usually starting with B0)
    if len(raw) == 10 and raw.isalnum() and raw.startswith("B0"):
        return raw, "amazon", f"https://www.amazon.in/dp/{raw}"

    # Standalone YouTube Video ID (11 characters)
    if len(raw) == 11 and re.match(r"^[\w-]+$", raw):
        return raw, "youtube", f"https://www.youtube.com/watch?v={raw}"

    # Default fallback to youtube
    return raw, "youtube", f"https://www.youtube.com/watch?v={raw}"


# --- Realistic Sample Fallback Dataset Generators ---

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
    ) -> PostInput:
        clean_id, _, canonical_url = parse_url_and_detect_platform(post_id)

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
            )

        # 2. Live YouTube Data API v3 (if key provided)
        if self.api_key:
            extracted: List[CommentInput] = []
            base_url = "https://www.googleapis.com/youtube/v3/commentThreads"
            next_page_token: Optional[str] = None
            pages_traversed = 0

            with httpx.Client(timeout=20.0) as client:
                while True:
                    fetch_limit = 100
                    if max_comments is not None:
                        remaining = max_comments - len(extracted)
                        if remaining <= 0:
                            break
                        fetch_limit = min(100, remaining)

                    params = {
                        "part": "snippet",
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

                        extracted.append(
                            CommentInput(
                                comment_id=cid,
                                raw_text=text,
                                timestamp=timestamp,
                                like_count=like_count,
                                anonymized_author_id=author_hash,
                            )
                        )

                    next_page_token = data.get("nextPageToken")
                    if not next_page_token:
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
                    data_source="Official YouTube Data API v3 (Live Ingestion)",
                )

        # 3. Key-Free Live Scraping via youtube-comment-downloader (100% Real Live Comments)
        try:
            from youtube_comment_downloader import YoutubeCommentDownloader
            downloader = YoutubeCommentDownloader()
            gen = downloader.get_comments(clean_id)

            extracted_live: List[CommentInput] = []
            # Default live limit to ensure high responsiveness for UI
            live_limit = max_comments if max_comments is not None else 300

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
                iso_time = "2026-11-02T00:00:00Z"
                if parsed_time:
                    try:
                        from datetime import datetime, timezone
                        iso_time = datetime.fromtimestamp(parsed_time, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                    except Exception:
                        iso_time = "2026-11-02T00:00:00Z"

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
                )
            else:
                raise ValueError(
                    f"No comments found for YouTube video '{clean_id}'. "
                    "The video may have comments disabled or be unavailable."
                )

        except Exception as e:
            if isinstance(e, ValueError):
                raise e
            raise ValueError(
                f"Failed to fetch live YouTube comments for '{clean_id}': {str(e)}. "
                "Ensure video is public and comments are enabled, or select the YouTube Demo Preset."
            )


class AmazonExtractor:
    """
    Amazon Product Review Extractor:
    - Direct HTML Review Scraper via httpx + BeautifulSoup
    - Live Scraper API / Rainforest API (if scraper_api_key provided)
    - Demo Sample Fallback only when is_demo=True or explicit demo post requested
    """

    def __init__(self, api_key: Optional[str] = None, scraper_url: Optional[str] = None):
        self.api_key = api_key or os.environ.get("AMAZON_SCRAPER_API_KEY") or os.environ.get("RAINFOREST_API_KEY")
        self.scraper_url = scraper_url

    def extract(
        self,
        post_id: str = "amz_smartphone_reviews",
        max_comments: Optional[int] = None,
        is_demo: bool = False,
    ) -> PostInput:
        clean_id, _, canonical_url = parse_url_and_detect_platform(post_id)

        # 1. Offline Demo Preset explicitly requested
        if is_demo or clean_id in ("amz_smartphone_reviews", "B09X6GMNP7"):
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
            )

        # 2. Live Scraper API (Rainforest / RapidAPI) if configured
        if self.api_key:
            extracted: List[CommentInput] = []
            page = 1
            with httpx.Client(timeout=20.0) as client:
                while True:
                    req_url = self.scraper_url or "https://api.rainforestapi.com/request"
                    domain = "amazon.com" if ".com" in canonical_url else "amazon.in"
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
                        extracted.append(
                            CommentInput(
                                comment_id=r.get("id", f"amz_{page}_{len(extracted)}"),
                                raw_text=r.get("body", r.get("review", "")),
                                timestamp=r.get("date", {}).get("utc", "2026-10-31T00:00:00Z"),
                                like_count=r.get("helpful_votes", 0),
                                anonymized_author_id=get_author_hash(r.get("profile", {}).get("name", "amz_buyer")),
                                star_rating=r.get("rating"),
                                verified_purchase=r.get("verified_purchase", True),
                                product_variant=r.get("attributes", {}).get("style_name"),
                            )
                        )
                        if max_comments and len(extracted) >= max_comments:
                            break

                    if max_comments and len(extracted) >= max_comments:
                        break

                    pagination = body.get("pagination", {})
                    if page >= pagination.get("total_pages", page):
                        break
                    page += 1

            if extracted:
                return PostInput(
                    post_id=clean_id,
                    post_url=canonical_url,
                    platform="amazon",
                    comments=extracted,
                    unbounded_fetch=(max_comments is None),
                    pages_fetched=page,
                    is_demo=False,
                    data_source="Live Ingestion via Amazon Scraper API",
                )

        # 3. Direct Key-Free HTML Review Scraping
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
        extracted_html: List[CommentInput] = []
        target_review_url = f"https://www.amazon.in/dp/{clean_id}"

        try:
            with httpx.Client(timeout=15.0, follow_redirects=True) as client:
                resp = client.get(target_review_url, headers=headers)
                text = resp.text
                if "api-services-support@amazon.com" in text or "Type the characters you see in this image" in text:
                    raise ValueError(
                        f"Amazon anti-bot CAPTCHA active for product ASIN '{clean_id}'. "
                        "Direct requests from this IP are challenged by Amazon. "
                        "Please provide an Amazon Scraper API Key in the API Keys modal, or select the Amazon Demo Preset."
                    )

                soup = BeautifulSoup(text, "html.parser")
                review_blocks = soup.select('div[data-hook="review"]')
                for idx, block in enumerate(review_blocks):
                    body_elem = block.select_one('span[data-hook="review-body"]')
                    if not body_elem:
                        continue
                    body_text = body_elem.get_text(strip=True)
                    star_elem = block.select_one('i[data-hook="review-star-rating"] span') or block.select_one('i[data-hook="cmps-review-star-rating"] span')
                    stars = 5
                    if star_elem:
                        try:
                            stars = int(float(star_elem.get_text().split()[0]))
                        except Exception:
                            stars = 5

                    author_elem = block.select_one("span.a-profile-name")
                    author_name = author_elem.get_text(strip=True) if author_elem else f"buyer_{idx}"
                    verified_elem = block.select_one('span[data-hook="avp-badge"]')
                    verified = verified_elem is not None

                    extracted_html.append(
                        CommentInput(
                            comment_id=f"amz_live_{clean_id}_{idx}",
                            raw_text=body_text,
                            timestamp="2026-11-02T00:00:00Z",
                            like_count=0,
                            anonymized_author_id=get_author_hash(author_name),
                            star_rating=stars,
                            verified_purchase=verified,
                            product_variant=None,
                        )
                    )

            if extracted_html:
                return PostInput(
                    post_id=clean_id,
                    post_url=canonical_url,
                    platform="amazon",
                    comments=extracted_html,
                    unbounded_fetch=True,
                    pages_fetched=1,
                    is_demo=False,
                    data_source="Live Web Scrape (Zero API Key - Amazon HTML Scraper)",
                )
            else:
                raise ValueError(
                    f"No customer reviews found on Amazon page for ASIN '{clean_id}'. "
                    "Amazon may require a Scraper API key or CAPTCHA resolution. Try the Amazon Demo Preset."
                )

        except Exception as e:
            if isinstance(e, ValueError):
                raise e
            raise ValueError(
                f"Failed to scrape Amazon product reviews for '{clean_id}': {str(e)}. "
                "Provide an Amazon Scraper API key in the API Keys modal or use the Amazon Demo Preset."
            )


class FlipkartExtractor:
    """
    Flipkart Product Review Extractor:
    - Direct HTML Review Scraper via httpx + BeautifulSoup
    - Affiliate / Scraper API fallback
    - Demo Sample Fallback only when is_demo=True or explicit demo post requested
    """

    def __init__(self, api_key: Optional[str] = None, scraper_url: Optional[str] = None):
        self.api_key = api_key or os.environ.get("FLIPKART_API_KEY")
        self.scraper_url = scraper_url

    def extract(
        self,
        post_id: str = "flp_electronics_sale",
        max_comments: Optional[int] = None,
        is_demo: bool = False,
    ) -> PostInput:
        clean_id, _, canonical_url = parse_url_and_detect_platform(post_id)

        # 1. Offline Demo Preset explicitly requested
        if is_demo or clean_id in ("flp_electronics_sale", "MOBGH73XHZ6QG9FZ"):
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
            )

        # 2. Live Flipkart Scraper / Affiliate API
        if self.api_key:
            extracted: List[CommentInput] = []
            page = 1
            with httpx.Client(timeout=20.0) as client:
                while True:
                    req_url = self.scraper_url or "https://api.flipkart.com/affiliate/reviews"
                    params = {"fsn": clean_id, "page": page}
                    headers = {"Fk-Affiliate-Token": self.api_key}
                    res = client.get(req_url, params=params, headers=headers)
                    if res.status_code == 429:
                        time.sleep(1.0)
                        res = client.get(req_url, params=params, headers=headers)

                    if res.status_code != 200:
                        break

                    body = res.json()
                    items = body.get("reviews", [])
                    if not items:
                        break

                    for r in items:
                        extracted.append(
                            CommentInput(
                                comment_id=r.get("id", f"flp_{page}_{len(extracted)}"),
                                raw_text=r.get("text", ""),
                                timestamp=r.get("date", "2026-10-31T00:00:00Z"),
                                like_count=r.get("likes", 0),
                                anonymized_author_id=get_author_hash(r.get("reviewerName", "flp_buyer")),
                                star_rating=r.get("rating"),
                                verified_purchase=r.get("certifiedBuyer", True),
                                product_variant=r.get("variant"),
                            )
                        )
                        if max_comments and len(extracted) >= max_comments:
                            break

                    if max_comments and len(extracted) >= max_comments:
                        break

                    if not body.get("hasNextPage", False):
                        break
                    page += 1

            if extracted:
                return PostInput(
                    post_id=clean_id,
                    post_url=canonical_url,
                    platform="flipkart",
                    comments=extracted,
                    unbounded_fetch=(max_comments is None),
                    pages_fetched=page,
                    is_demo=False,
                    data_source="Live Ingestion via Flipkart API",
                )

        # 3. Direct Key-Free HTML Scraping
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
        extracted_flp: List[CommentInput] = []

        try:
            with httpx.Client(timeout=15.0, follow_redirects=True) as client:
                target_url = canonical_url if "http" in canonical_url else f"https://www.flipkart.com/product/p/{clean_id}"
                resp = client.get(target_url, headers=headers)
                soup = BeautifulSoup(resp.text, "html.parser")
                # Flipkart reviews container pattern
                containers = soup.select("div.RcXBOT, div._2wzgFH, div.col.EPCmJX")
                for idx, c in enumerate(containers):
                    txt_div = c.select_one("div.ZmyHeo, div._1135xD, div.row")
                    if not txt_div:
                        continue
                    r_text = txt_div.get_text(strip=True)
                    rating_elem = c.select_one("div.XQDdHH, div._3LWZlK")
                    rating = 5
                    if rating_elem:
                        try:
                            rating = int(float(rating_elem.get_text(strip=True)))
                        except Exception:
                            rating = 5

                    extracted_flp.append(
                        CommentInput(
                            comment_id=f"flp_live_{clean_id}_{idx}",
                            raw_text=r_text,
                            timestamp="2026-11-02T00:00:00Z",
                            like_count=0,
                            anonymized_author_id=get_author_hash(f"flp_user_{idx}"),
                            star_rating=rating,
                            verified_purchase=True,
                            product_variant=None,
                        )
                    )

            if extracted_flp:
                return PostInput(
                    post_id=clean_id,
                    post_url=canonical_url,
                    platform="flipkart",
                    comments=extracted_flp,
                    unbounded_fetch=True,
                    pages_fetched=1,
                    is_demo=False,
                    data_source="Live Web Scrape (Zero API Key - Flipkart HTML Scraper)",
                )
            else:
                raise ValueError(
                    f"Flipkart product reviews could not be extracted directly from URL '{clean_id}'. "
                    "Flipkart requires JS rendering or session token. Please provide a Scraper API key or select the Flipkart Demo Preset."
                )

        except Exception as e:
            if isinstance(e, ValueError):
                raise e
            raise ValueError(
                f"Failed to scrape Flipkart reviews for '{clean_id}': {str(e)}. "
                "Select the Flipkart Demo Preset or provide a Scraper API key."
            )


class InstagramExtractor:
    """
    Instagram Comment Extractor:
    - Instagram Graph API (if INSTAGRAM_ACCESS_TOKEN provided)
    - Demo Sample Fallback only when is_demo=True or explicit demo post requested
    """

    def __init__(self, mode: str = "public_scraper", access_token: Optional[str] = None):
        self.mode = mode
        self.access_token = access_token or os.environ.get("INSTAGRAM_ACCESS_TOKEN")

    def extract(
        self,
        post_id: str,
        max_comments: Optional[int] = None,
        is_demo: bool = False,
    ) -> PostInput:
        clean_id, _, canonical_url = parse_url_and_detect_platform(post_id)

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
            )

        # 2. Live Graph API
        if self.access_token:
            url = f"https://graph.facebook.com/v19.0/{clean_id}/comments"
            params = {
                "access_token": self.access_token,
                "fields": "id,text,timestamp,like_count,from",
                "limit": 50,
            }
            extracted = []
            pages_traversed = 0
            with httpx.Client(timeout=15.0) as client:
                while True:
                    res = client.get(url, params=params)
                    if res.status_code != 200:
                        break
                    pages_traversed += 1
                    body = res.json()
                    items = body.get("data", [])
                    for item in items:
                        author_name = item.get("from", {}).get("username", "anon")
                        extracted.append(
                            CommentInput(
                                comment_id=item["id"],
                                raw_text=item.get("text", ""),
                                timestamp=item.get("timestamp", ""),
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

            if extracted:
                return PostInput(
                    post_id=clean_id,
                    post_url=canonical_url,
                    platform="instagram",
                    comments=extracted,
                    unbounded_fetch=(max_comments is None),
                    pages_fetched=pages_traversed or 1,
                    is_demo=False,
                    data_source="Live Ingestion via Instagram Graph API",
                )

        # 3. No token provided for live scrape
        raise ValueError(
            f"Instagram requires an authenticated Access Token for live scraping reel/post '{clean_id}'. "
            "Please add an INSTAGRAM_ACCESS_TOKEN in the API Keys modal, or select the Instagram Demo Preset."
        )
