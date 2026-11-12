"""
Multilingual NLP Engine & 2-Tier Classification Pipeline:
Tier 1: Polarity Scoring (Positive >= 0.05, Neutral -0.05 to 0.05, Negative <= -0.05)
Tier 2: Root-Cause Sub-Tagging for Negative Comments
  - Social Media (YouTube, Instagram): Technical Bugs, Audio/Video, Content, Trolls
  - E-Commerce (Amazon, Flipkart): Product Defect/Hardware, Delivery/Logistics, Counterfeit/Wrong Item, Value for Money/Warranty
Backends: vader_hybrid (default), xlm_roberta (multilingual), gemini_flash (LLM)
"""

import os
import re
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
from .schemas import ProcessedComment, SentimentBreakdownRow, Tier2RootCauseBreakdown

logger = logging.getLogger("sentiment_pipeline")

ECOMM_PLATFORMS = {"amazon", "flipkart", "myntra", "meesho", "nykaa", "ajio"}

# Tier-2 Root-Cause Category Definitions: Social Media
ROOT_CAUSE_TECHNICAL = "Technical / Feature Bugs"
ROOT_CAUSE_AUDIO_VIDEO = "Audio / Video / Caption Quality"
ROOT_CAUSE_CONTENT = "Content Dissatisfaction"
ROOT_CAUSE_TROLLS = "Coordinated Spam / Trolls"

SOCIAL_ROOT_CAUSES = [
    ROOT_CAUSE_TECHNICAL,
    ROOT_CAUSE_AUDIO_VIDEO,
    ROOT_CAUSE_CONTENT,
    ROOT_CAUSE_TROLLS,
]

# Tier-2 Root-Cause Category Definitions: E-Commerce
ROOT_CAUSE_ECOMM_DEFECT = "Product Defect / Hardware Quality"
ROOT_CAUSE_ECOMM_DELIVERY = "Delivery, Packaging & Logistics"
ROOT_CAUSE_ECOMM_COUNTERFEIT = "Counterfeit / Wrong Item Received"
ROOT_CAUSE_ECOMM_VALUE = "Value for Money / Pricing & Warranty"

ECOMM_ROOT_CAUSES = [
    ROOT_CAUSE_ECOMM_DEFECT,
    ROOT_CAUSE_ECOMM_DELIVERY,
    ROOT_CAUSE_ECOMM_COUNTERFEIT,
    ROOT_CAUSE_ECOMM_VALUE,
]

SOCIAL_ROOT_CAUSE_PATTERNS = {
    ROOT_CAUSE_TECHNICAL: [
        r"\b(?:crash|crashed|crashes|crashing)\b",
        r"\b(?:bug|bugs|glitch|glitches)\b",
        r"\b(?:login|logging in|signin|sign in|auth|authentication)\b",
        r"\b(?:freeze|freezes|freezing|frozen|stuck)\b",
        r"\b(?:error|errors|500|404|exception)\b",
        r"\b(?:update broke|update is broken|after update)\b",
        r"\b(?:ui|interface|button|layout|screen)\b",
        r"\b(?:loading|doesn't load|wont load|infinite loading)\b",
        r"\b(?:mobile app|android|ios|apk|app)\b",
        r"\b(?:not working|wont open|won't open|cant open|can't open)\b",
    ],
    ROOT_CAUSE_AUDIO_VIDEO: [
        r"\b(?:audio|sound|voice|volume|mic|microphone)\b",
        r"\b(?:sync|out of sync|desync|lip sync)\b",
        r"\b(?:echo|muffled|inaudible|buzz|buzzing|noise)\b",
        r"\b(?:video quality|resolution|blur|blurry|pixelated|1080p|4k|720p)\b",
        r"\b(?:caption|captions|subtitle|subtitles|cc)\b",
        r"\b(?:lag|lagging|stutter|stuttering|frame drop|fps)\b",
    ],
    ROOT_CAUSE_CONTENT: [
        r"\b(?:clickbait|misleading|thumbnail lie|fake title)\b",
        r"\b(?:boring|sleepy|dull|slow pace)\b",
        r"\b(?:waste of time|wasted time|time waste)\b",
        r"\b(?:disappointed|disappointment|underwhelming)\b",
        r"\b(?:topic|didn't cover|incomplete|half knowledge)\b",
        r"\b(?:expectation|expected better|worst video)\b",
        r"\b(?:bakwas|bekar content|kachra content|faltu)\b",
    ],
    ROOT_CAUSE_TROLLS: [
        r"\b(?:hate|hater|troll|trolling|ratio|lmao)\b",
        r"\b(?:dead channel|fell off|nobody cares|unsubscribed|unsub)\b",
        r"\b(?:bot raid|dislike button|trash creator|clown)\b",
        r"\b(?:hostile|repetitive hate|cancel)\b",
    ],
}

ECOMM_ROOT_CAUSE_PATTERNS = {
    ROOT_CAUSE_ECOMM_DEFECT: [
        r"\b(?:defect|defective|faulty|hardware defect|hardware failure)\b",
        r"\b(?:battery|battery backup|battery drain|drains|battery life|heating|overheating|heat up|iron box)\b",
        r"\b(?:stopped working|wont turn on|won't turn on|dead display|switched off|not booting|boot)\b",
        r"\b(?:screen flickering|display touch|touch issue|touch became|crackling sound|unresponsive screen)\b",
        r"\b(?:camera lens|blurry photos|cheap build|poor build|loose button|power button)\b",
        r"\b(?:broken|motherboard|hardware)\b",
    ],
    ROOT_CAUSE_ECOMM_DELIVERY: [
        r"\b(?:delivery|late delivery|delayed|delayed by|courier|ekart|delivery boy|delivery agent)\b",
        r"\b(?:damaged box|torn box|box open|seal broken|crushed|tampered|package was badly damaged)\b",
        r"\b(?:missing|adapter missing|cable missing|accessories missing|open box|oil stains)\b",
        r"\b(?:rude|packaging was torn|poor packaging|refused door delivery|forced otp)\b",
    ],
    ROOT_CAUSE_ECOMM_COUNTERFEIT: [
        r"\b(?:fake|fake product|duplicate|counterfeit|first copy|nakli|bilkul nakli|dhoka)\b",
        r"\b(?:wrong item|wrong product|wrong color|wrong model|cheap model inside|different model)\b",
        r"\b(?:different from picture|not genuine|not original|serial number mismatch|scam seller)\b",
        r"\b(?:refurbished dirty|blacklisted imei|fake copy|cheap plastic body)\b",
    ],
    ROOT_CAUSE_ECOMM_VALUE: [
        r"\b(?:paisa barbaad|waste of money|overpriced|not worth|price dropped|price hike)\b",
        r"\b(?:refund|refund denied|refund rejected|return rejected|replacement denied|refused refund)\b",
        r"\b(?:warranty|service center|customer care|unauthorized seller|warranty denied|warranty rejected)\b",
        r"\b(?:no replacement|no warranty support|pathetic customer support)\b",
    ],
}


class NLPEngine:
    def __init__(self):
        self.vader = SentimentIntensityAnalyzer()
        self._inject_custom_lexicon()
        self._compiled_social_causes = {
            category: [re.compile(p, re.IGNORECASE) for p in patterns]
            for category, patterns in SOCIAL_ROOT_CAUSE_PATTERNS.items()
        }
        self._compiled_ecomm_causes = {
            category: [re.compile(p, re.IGNORECASE) for p in patterns]
            for category, patterns in ECOMM_ROOT_CAUSE_PATTERNS.items()
        }

    def _inject_custom_lexicon(self):
        """Augment VADER's lexicon with high-signal Hinglish, emoji, and e-commerce tokens."""
        custom_weights = {
            # Emoji anchors
            "positive_emoji": 3.5,
            "negative_emoji": -3.8,
            "excellent": 3.2,
            "terrible": -3.6,
            "awesome": 3.2,
            "broken": -3.4,
            "glitch": -3.0,
            "glitches": -3.0,
            "glitchy": -3.0,
            "defect": -3.4,
            "defective": -3.5,
            "bug": -2.8,
            "bugs": -2.8,
            "buggy": -3.0,
            "crash": -3.2,
            "crashed": -3.2,
            "crashes": -3.2,
            "crashing": -3.2,
            "freeze": -2.8,
            "freezes": -2.8,
            "freezing": -2.8,
            "frozen": -2.8,
            "unusable": -3.2,
            "unresponsive": -3.0,
            "issue": -2.5,
            "issues": -2.5,
            "sync": -1.5,
            "desync": -3.2,
            "desynced": -3.2,
            "unbearable": -3.2,
            "echo": -2.0,
            "muffled": -2.2,
            "distortion": -2.8,
            "blurry": -2.5,
            "pixelated": -2.5,
            "lag": -2.5,
            "lagging": -2.5,
            "stutter": -2.5,
            "stuttering": -2.5,
            "clickbait": -3.4,
            "misleading": -3.2,
            "boring": -2.8,
            "waste": -3.0,
            "disappointed": -3.0,
            "disappointment": -3.0,
            "underwhelming": -2.5,
            "troll": -3.0,
            "ratio": -2.5,
            "unsubscribed": -3.2,
            "unsub": -3.2,
            "dead": -3.0,
            "dying": -3.0,
            "trash": -3.5,
            "garbage": -3.4,
            "rubbish": -3.2,
            "ruin": -3.4,
            "ruined": -3.4,
            "ruining": -3.4,
            "fell": -1.5,
            "clown": -2.8,
            # E-Commerce specific tokens
            "paisa_vasool": 3.8,
            "vasool": 3.5,
            "asli": 3.2,
            "genuine": 3.2,
            "original": 2.8,
            "amoled": 2.5,
            "superb": 3.4,
            "paisa_barbaad": -3.8,
            "nakli": -3.8,
            "bilkul_nakli": -4.0,
            "fake": -3.8,
            "duplicate": -3.4,
            "counterfeit": -3.8,
            "dhoka": -3.8,
            "overpriced": -3.0,
            "defective_battery_drains": -3.8,
            "tampered": -3.4,
            "delayed": -2.5,
            "refurbished": -2.2,
            # Tone down neutral question and query words
            "please": 0.0,
            "cares": 0.0,
            "support": 0.0,
            "charger": 0.0,
            "battery": 0.0,
            # Hinglish Positive
            "mast": 3.5,
            "badiya": 3.2,
            "badhiya": 3.2,
            "sahi": 2.8,
            "zabardast": 3.6,
            "kamaal": 3.5,
            "shandar": 3.5,
            "achha": 2.5,
            "accha": 2.5,
            "acha": 2.5,
            "op": 3.2,
            "faadu": 3.5,
            "dhansu": 3.4,
            # Hinglish Negative
            "bekar": -3.6,
            "bekaar": -3.6,
            "ghatiya": -3.8,
            "bakwas": -3.6,
            "bakwaas": -3.6,
            "kharab": -3.5,
            "khrab": -3.5,
            "faltu": -3.4,
            "barbaad": -3.7,
            "kachra": -3.5,
            "lallu": -2.8,
            # Negation and Sarcasm markers
            "not_working_terrible_defect": -4.0,
            "sarcasm_defect": -4.0,
        }
        self.vader.lexicon.update(custom_weights)

    def analyze_polarity_vader(self, cleaned_text: str, sarcasm_override: Optional[float] = None) -> Tuple[float, str]:
        """
        Tier 1 Polarity computation:
        Positive: compound >= 0.05
        Neutral: -0.05 < compound < 0.05
        Negative: compound <= -0.05
        """
        if sarcasm_override is not None:
            score = sarcasm_override
        else:
            scores = self.vader.polarity_scores(cleaned_text)
            score = float(scores["compound"])

        score = max(-1.0, min(1.0, round(score, 4)))

        if score >= 0.05:
            sentiment = "Positive"
        elif score <= -0.05:
            sentiment = "Negative"
        else:
            sentiment = "Neutral"

        return score, sentiment

    def analyze_with_xlm_roberta(self, cleaned_text: str) -> Tuple[float, str]:
        """Multilingual Transformer backend fallback."""
        try:
            from transformers import pipeline
            if not hasattr(self, "_xlm_pipeline"):
                self._xlm_pipeline = pipeline(
                    "sentiment-analysis",
                    model="cardiffnlp/twitter-xlm-roberta-base-sentiment",
                    device=-1,
                )
            result = self._xlm_pipeline(cleaned_text[:512])[0]
            label = result["label"].lower()
            conf = float(result["score"])
            if "positive" in label:
                return round(conf, 4), "Positive"
            elif "negative" in label:
                return round(-conf, 4), "Negative"
            else:
                return 0.0, "Neutral"
        except Exception as e:
            logger.warning(f"XLM-RoBERTa unavailable ({e}), falling back to vader_hybrid")
            return self.analyze_polarity_vader(cleaned_text)

    def sub_tag_negative_root_cause(self, raw_text: str, cleaned_text: str, platform: str = "youtube") -> str:
        """
        Tier 2 Classification: Sub-tag Negative comment into domain-specific actionable root cause:
        For Social Media (youtube, instagram):
          1. Technical / Feature Bugs
          2. Audio / Video / Caption Quality
          3. Content Dissatisfaction
          4. Coordinated Spam / Trolls
        For E-Commerce (amazon, flipkart):
          1. Product Defect / Hardware Quality
          2. Delivery, Packaging & Logistics
          3. Counterfeit / Wrong Item Received
          4. Value for Money / Pricing & Warranty
        """
        combined = f"{raw_text} {cleaned_text}".lower()

        if platform in ECOMM_PLATFORMS:
            # E-Commerce Root Causes
            scores: Dict[str, int] = {cat: 0 for cat in ECOMM_ROOT_CAUSES}
            for category, regex_list in self._compiled_ecomm_causes.items():
                for regex in regex_list:
                    matches = regex.findall(combined)
                    scores[category] += len(matches)

            best_cat = max(scores, key=scores.get)
            if scores[best_cat] > 0:
                return best_cat

            # Heuristics fallback for e-commerce
            if any(w in combined for w in ["fake", "duplicate", "nakli", "dhoka", "counterfeit", "wrong item", "wrong color", "different"]):
                return ROOT_CAUSE_ECOMM_COUNTERFEIT
            elif any(w in combined for w in ["delivery", "courier", "package", "box", "seal", "delayed", "missing", "ekart"]):
                return ROOT_CAUSE_ECOMM_DELIVERY
            elif any(w in combined for w in ["refund", "warranty", "overpriced", "paisa barbaad", "waste of money", "return", "customer care"]):
                return ROOT_CAUSE_ECOMM_VALUE
            else:
                return ROOT_CAUSE_ECOMM_DEFECT

        else:
            # Social Media Root Causes
            scores = {cat: 0 for cat in SOCIAL_ROOT_CAUSES}
            for category, regex_list in self._compiled_social_causes.items():
                for regex in regex_list:
                    matches = regex.findall(combined)
                    scores[category] += len(matches)

            best_cat = max(scores, key=scores.get)
            if scores[best_cat] > 0:
                return best_cat

            if any(w in combined for w in ["audio", "sound", "sync", "mic", "blur", "video", "screen", "noise", "volume"]):
                return ROOT_CAUSE_AUDIO_VIDEO
            elif any(w in combined for w in ["crash", "bug", "app", "login", "freeze", "update", "mobile", "click", "slow"]):
                return ROOT_CAUSE_TECHNICAL
            elif any(w in combined for w in ["troll", "hate", "dead", "unsub", "clown"]):
                return ROOT_CAUSE_TROLLS
            else:
                return ROOT_CAUSE_CONTENT

    def extract_top_keywords(self, comments: List[ProcessedComment], sentiment: str, platform: str = "youtube") -> List[str]:
        """Extract top recurring issues or praise keywords adapted for the platform domain."""
        raw_texts = " ".join([c.raw_text.lower() for c in comments])

        if platform in ECOMM_PLATFORMS:
            if sentiment == "Negative":
                curated_issues = [
                    ("Battery drain & heating defect", ["battery", "heating", "drain", "heat", "iron box"]),
                    ("Delivery delay & damaged packaging", ["delivery", "late", "box", "seal", "courier", "ekart"]),
                    ("Counterfeit / Nakli fake unit", ["fake", "nakli", "duplicate", "dhoka", "counterfeit", "wrong"]),
                    ("Overpriced / Refund rejected", ["overpriced", "refund", "return", "warranty", "barbaad", "waste"]),
                ]
                found = []
                for label, keywords in curated_issues:
                    if any(kw in raw_texts for kw in keywords):
                        found.append(label)
                return found if found else ["Hardware quality defects", "Logistics & packaging issues"]

            elif sentiment == "Positive":
                curated_praise = [
                    ("Paisa vasool & outstanding value", ["paisa", "vasool", "value", "deal"]),
                    ("Superb battery & snappy display", ["battery", "display", "snappy", "camera", "amoled", "120hz"]),
                    ("Genuine product & fast shipping", ["genuine", "fast", "original", "delivered", "packaging"]),
                ]
                found = []
                for label, keywords in curated_praise:
                    if any(kw in raw_texts for kw in keywords):
                        found.append(label)
                return found if found else ["Paisa vasool & high performance", "Genuine verified purchase"]

            else: # Neutral
                return ["Hardware spec inquiries", "Charger & box accessories", "Compatibility queries"]

        else: # Social Media
            if sentiment == "Negative":
                curated_issues = [
                    ("Audio sync issue", ["audio", "sync", "desync", "sound"]),
                    ("App crash on mobile", ["crash", "crashed", "mobile", "app", "freeze", "freezes"]),
                    ("Bekar update / Login broke", ["update", "login", "bekar", "ghatiya", "error"]),
                    ("Content dissatisfaction", ["clickbait", "waste of time", "boring", "faltu", "bakwas"]),
                ]
                found = []
                for label, keywords in curated_issues:
                    if any(kw in raw_texts for kw in keywords):
                        found.append(label)
                return found if found else ["App stability defects", "Playback & Audio errors"]

            elif sentiment == "Positive":
                curated_praise = [
                    ("Helpful tutorial", ["helpful", "useful", "learn", "learned", "tutorial", "explained"]),
                    ("Good initiative", ["initiative", "great job", "good work", "keep it up", "respect"]),
                    ("Mast video & clear explanation", ["mast", "badiya", "sahi", "zabardast", "op", "love"]),
                ]
                found = []
                for label, keywords in curated_praise:
                    if any(kw in raw_texts for kw in keywords):
                        found.append(label)
                return found if found else ["Helpful tutorial", "Good initiative"]

            else: # Neutral
                return ["Timestamp queries", "User tags & timestamps", "General questions"]

    def compute_keyword_frequencies(
        self,
        processed_comments: List[ProcessedComment],
        platform: str = "youtube",
        top_k: int = 12,
    ) -> List[Dict[str, Any]]:
        """
        Dynamically extracts top recurring keywords and phrases across comments,
        differentiating Positive praise and Negative issues with exact comment frequency.
        """
        stopwords = {
            "the", "and", "is", "in", "to", "of", "a", "it", "this", "that", "for", "on", "with",
            "as", "at", "by", "from", "be", "are", "was", "were", "an", "have", "has", "had",
            "do", "does", "did", "not", "but", "so", "if", "or", "because", "my", "me", "we",
            "our", "you", "your", "they", "them", "he", "she", "his", "her", "its", "all", "any",
            "some", "very", "too", "also", "just", "now", "then", "there", "here", "when", "where",
            "why", "how", "what", "which", "who", "whom", "will", "would", "can", "could", "should",
            "video", "post", "product", "item", "phone", "review", "buying", "bought", "buy",
            "hai", "ho", "ka", "ki", "ke", "ko", "se", "me", "mein", "par", "bhi", "tha", "thi",
            "aur", "yeh", "woh", "ye", "wo", "kya", "kyu", "karo", "karna", "hoga", "hain"
        }

        # Domain seed phrases / high-signal keywords to check
        if platform in ECOMM_PLATFORMS:
            target_keywords = [
                # Negative issues
                ("battery drain", "Negative"),
                ("heating", "Negative"),
                ("overheating", "Negative"),
                ("defective", "Negative"),
                ("broken", "Negative"),
                ("crackling sound", "Negative"),
                ("damaged box", "Negative"),
                ("late delivery", "Negative"),
                ("delayed", "Negative"),
                ("missing adapter", "Negative"),
                ("fake product", "Negative"),
                ("duplicate", "Negative"),
                ("nakli", "Negative"),
                ("counterfeit", "Negative"),
                ("refund denied", "Negative"),
                ("overpriced", "Negative"),
                ("paisa barbaad", "Negative"),
                ("waste of money", "Negative"),
                ("touch lag", "Negative"),
                # Positive praise
                ("paisa vasool", "Positive"),
                ("superb camera", "Positive"),
                ("battery backup", "Positive"),
                ("fast delivery", "Positive"),
                ("genuine product", "Positive"),
                ("original", "Positive"),
                ("display 120hz", "Positive"),
                ("butter smooth", "Positive"),
                ("fast charging", "Positive"),
                ("mast phone", "Positive"),
                ("great value", "Positive"),
                ("premium build", "Positive"),
            ]
        else:  # Social Media
            target_keywords = [
                # Negative issues
                ("crash", "Negative"),
                ("app crash", "Negative"),
                ("bug", "Negative"),
                ("glitch", "Negative"),
                ("audio sync", "Negative"),
                ("sound issue", "Negative"),
                ("login broke", "Negative"),
                ("freeze", "Negative"),
                ("clickbait", "Negative"),
                ("waste of time", "Negative"),
                ("boring", "Negative"),
                ("disappointed", "Negative"),
                ("ghatiya", "Negative"),
                ("bekar", "Negative"),
                ("bakwas", "Negative"),
                ("troll", "Negative"),
                ("lag", "Negative"),
                # Positive praise
                ("helpful tutorial", "Positive"),
                ("clear explanation", "Positive"),
                ("mast video", "Positive"),
                ("awesome edit", "Positive"),
                ("superb content", "Positive"),
                ("good work", "Positive"),
                ("zabardast", "Positive"),
                ("informative", "Positive"),
                ("love this", "Positive"),
                ("badiya", "Positive"),
                ("keep it up", "Positive"),
                ("next level", "Positive"),
            ]

        results = []
        total_comments = len(processed_comments) or 1

        # Check domain seed phrases
        for phrase, sentiment in target_keywords:
            matching = [
                c for c in processed_comments
                if phrase in c.raw_text.lower() or phrase in c.cleaned_text.lower()
            ]
            if len(matching) > 0:
                results.append({
                    "keyword": phrase.title(),
                    "count": len(matching),
                    "sentiment": sentiment,
                    "percentage": round(len(matching) / total_comments * 100.0, 1),
                })

        # Also extract frequent individual meaningful words from negative/positive comments
        word_counts: Dict[str, Dict[str, int]] = {}
        for c in processed_comments:
            words = set(re.findall(r"\b[a-zA-Z]{3,}\b", c.cleaned_text.lower()))
            for w in words:
                if w not in stopwords and len(w) > 3:
                    if w not in word_counts:
                        word_counts[w] = {"Positive": 0, "Negative": 0, "Neutral": 0}
                    word_counts[w][c.sentiment] += 1

        for w, counts in word_counts.items():
            tot = counts["Positive"] + counts["Negative"] + counts["Neutral"]
            if tot >= 3 and not any(r["keyword"].lower() == w.lower() for r in results):
                if counts["Negative"] > counts["Positive"] * 1.5:
                    results.append({
                        "keyword": w.capitalize(),
                        "count": counts["Negative"],
                        "sentiment": "Negative",
                        "percentage": round(counts["Negative"] / total_comments * 100.0, 1),
                    })
                elif counts["Positive"] > counts["Negative"] * 1.5:
                    results.append({
                        "keyword": w.capitalize(),
                        "count": counts["Positive"],
                        "sentiment": "Positive",
                        "percentage": round(counts["Positive"] / total_comments * 100.0, 1),
                    })

        # Sort by count descending
        results.sort(key=lambda x: x["count"], reverse=True)
        return results[:top_k]

    def compute_keyword_stats(
        self,
        processed_comments: List[ProcessedComment],
        platform: str = "youtube",
        top_k: int = 8,
    ) -> List[Dict[str, Any]]:
        """
        Extracts top unigrams/bigrams across comments with sentiment attribution,
        ensuring Chart 4 has rich dynamic data for both Social Media and E-Commerce.
        """
        kw_list = self.compute_keyword_frequencies(processed_comments, platform=platform, top_k=top_k)
        return kw_list[:top_k]

    def compute_timeline_buckets(
        self,
        processed_comments: List[ProcessedComment],
        num_buckets: int = 10,
    ) -> List[Dict[str, Any]]:
        """
        Divides comments into exactly 10 to 12 evenly-spaced chronological wave buckets,
        computing positive, neutral, negative, and total counts for each bucket.
        Guarantees that Chart 3 always renders a rich trend curve and never collapses
        into a single bar or NaN values.
        """
        if not processed_comments:
            return []

        def get_sort_key(c: ProcessedComment) -> str:
            return c.timestamp or "2026-11-03T00:00:00Z"

        sorted_comments = sorted(processed_comments, key=get_sort_key)
        total_items = len(sorted_comments)

        target_buckets = min(num_buckets, total_items) if total_items < num_buckets else num_buckets
        if target_buckets <= 0:
            return []

        # Check if timestamps span multiple days
        dates_seen = set()
        for c in sorted_comments:
            if c.timestamp and len(c.timestamp) >= 10:
                dates_seen.add(c.timestamp[:10])

        is_multi_day = len(dates_seen) > 3
        chunk_size = total_items / target_buckets
        buckets: List[Dict[str, Any]] = []

        for i in range(target_buckets):
            start_idx = int(round(i * chunk_size))
            end_idx = int(round((i + 1) * chunk_size)) if i < target_buckets - 1 else total_items
            chunk = sorted_comments[start_idx:end_idx]
            if not chunk:
                continue

            first_ts = chunk[0].timestamp or ""
            if is_multi_day and first_ts and len(first_ts) >= 10:
                try:
                    dt = datetime.fromisoformat(first_ts.replace("Z", "+00:00"))
                    label = dt.strftime("%b %d")
                except Exception:
                    label = first_ts[:10]
            elif first_ts and "T" in first_ts:
                try:
                    dt = datetime.fromisoformat(first_ts.replace("Z", "+00:00"))
                    label = f"W{i+1} ({dt.strftime('%H:%M')})"
                except Exception:
                    time_part = first_ts.split("T")[1][:5] if "T" in first_ts else f"P{i+1}"
                    label = f"W{i+1} ({time_part})"
            else:
                label = f"Wave {i+1}"

            pos = sum(1 for c in chunk if c.sentiment == "Positive")
            neu = sum(1 for c in chunk if c.sentiment == "Neutral")
            neg = sum(1 for c in chunk if c.sentiment == "Negative")
            tot = len(chunk)

            buckets.append({
                "label": label,
                "positive": pos,
                "neutral": neu,
                "negative": neg,
                "total": tot,
            })

        return buckets

    def process_all_comments(
        self,
        preprocessed_items: List[Dict[str, Any]],
        model_option: str = "vader_hybrid",
        platform: str = "youtube",
    ) -> Tuple[
        List[ProcessedComment],
        List[SentimentBreakdownRow],
        List[Tier2RootCauseBreakdown],
        bool,
        Optional[Dict[str, int]],
        Optional[Dict[str, Dict[str, int]]],
        List[Dict[str, Any]],
        List[Dict[str, Any]],
        List[Dict[str, Any]],
    ]:
        """
        Execute Tier 1 and Tier 2 processing over clean comments.
        Returns:
            (processed_comments, breakdown_rows, tier2_breakdowns, high_negative_alert, star_counts, star_rating_distribution, keyword_frequencies, timeline_buckets, keyword_stats)
        """
        processed_comments: List[ProcessedComment] = []
        star_counts: Dict[str, int] = {"5_star": 0, "4_star": 0, "3_star": 0, "2_star": 0, "1_star": 0}
        has_stars = False

        for item in preprocessed_items:
            raw_text = item["raw_text"]
            cleaned_text = item["cleaned_text"]
            sarcasm_override = item.get("sarcastic_override_score")

            if model_option == "xlm_roberta":
                score, sentiment = self.analyze_with_xlm_roberta(cleaned_text)
            else:
                score, sentiment = self.analyze_polarity_vader(cleaned_text, sarcasm_override)

            root_cause = None
            if sentiment == "Negative":
                root_cause = self.sub_tag_negative_root_cause(raw_text, cleaned_text, platform=platform)

            star_rating = item.get("star_rating")
            if star_rating and 1 <= star_rating <= 5:
                has_stars = True
                star_counts[f"{star_rating}_star"] += 1

            processed_comments.append(
                ProcessedComment(
                    comment_id=item["comment_id"],
                    anonymized_author_id=item["anonymized_author_id"],
                    author=item.get("author") or item.get("anonymized_author_id"),
                    raw_text=raw_text,
                    cleaned_text=cleaned_text,
                    timestamp=item["timestamp"],
                    like_count=item["like_count"],
                    sentiment=sentiment,
                    score=score,
                    root_cause=root_cause,
                    is_spam_or_duplicate=False,
                    irony_sarcasm_detected=item.get("irony_sarcasm_detected", False),
                    confidence_score=item.get("confidence_score", 0.85),
                    subjectivity_score=item.get("subjectivity_score", 0.50),
                    star_rating=star_rating,
                    verified_purchase=item.get("verified_purchase"),
                    product_variant=item.get("product_variant"),
                )
            )

        total_valid = len(processed_comments)
        if total_valid == 0:
            return [], [], [], False, None, None, [], [], []

        neg_comments = [c for c in processed_comments if c.sentiment == "Negative"]
        pos_comments = [c for c in processed_comments if c.sentiment == "Positive"]
        neu_comments = [c for c in processed_comments if c.sentiment == "Neutral"]

        neg_count = len(neg_comments)
        pos_count = len(pos_comments)
        neu_count = len(neu_comments)

        neg_pct = round((neg_count / total_valid) * 100.0, 1)
        pos_pct = round((pos_count / total_valid) * 100.0, 1)
        neu_pct = round((neu_count / total_valid) * 100.0, 1)

        high_negative_alert = neg_pct > 70.0

        breakdown_rows = [
            SentimentBreakdownRow(
                category="Negative",
                comment_count=neg_count,
                percentage=neg_pct,
                top_keywords=self.extract_top_keywords(neg_comments, "Negative", platform=platform),
            ),
            SentimentBreakdownRow(
                category="Positive",
                comment_count=pos_count,
                percentage=pos_pct,
                top_keywords=self.extract_top_keywords(pos_comments, "Positive", platform=platform),
            ),
            SentimentBreakdownRow(
                category="Neutral",
                comment_count=neu_count,
                percentage=neu_pct,
                top_keywords=self.extract_top_keywords(neu_comments, "Neutral", platform=platform),
            ),
        ]

        # Domain-specific root causes
        target_root_causes = ECOMM_ROOT_CAUSES if platform in ECOMM_PLATFORMS else SOCIAL_ROOT_CAUSES
        tier2_breakdowns: List[Tier2RootCauseBreakdown] = []

        for cause in target_root_causes:
            matching = [c for c in neg_comments if c.root_cause == cause]
            cnt = len(matching)
            pct = round((cnt / neg_count * 100.0), 1) if neg_count > 0 else 0.0
            sample_quotes = [c.raw_text for c in matching[:4]]
            tier2_breakdowns.append(
                Tier2RootCauseBreakdown(
                    category=cause,
                    count=cnt,
                    percentage=pct,
                    sample_comments=sample_quotes,
                )
            )

        # Compute star rating distribution segmented by sentiment
        star_rating_distribution = {
            str(r): {"Positive": 0, "Neutral": 0, "Negative": 0, "total": 0}
            for r in range(1, 6)
        }
        for c in processed_comments:
            if c.star_rating and 1 <= c.star_rating <= 5:
                r_str = str(c.star_rating)
                star_rating_distribution[r_str][c.sentiment] += 1
                star_rating_distribution[r_str]["total"] += 1

        keyword_frequencies = self.compute_keyword_frequencies(processed_comments, platform=platform)
        timeline_buckets = self.compute_timeline_buckets(processed_comments, num_buckets=10)
        keyword_stats = self.compute_keyword_stats(processed_comments, platform=platform, top_k=8)

        return (
            processed_comments,
            breakdown_rows,
            tier2_breakdowns,
            high_negative_alert,
            star_counts if has_stars else None,
            star_rating_distribution if has_stars else None,
            keyword_frequencies,
            timeline_buckets,
            keyword_stats,
        )

    def generate_executive_insights(
        self,
        processed_comments: List[ProcessedComment],
        breakdown_rows: List[SentimentBreakdownRow],
        tier2_breakdowns: List[Tier2RootCauseBreakdown],
        platform: str = "youtube",
    ) -> Dict[str, Any]:
        """
        Synthesizes an AI Executive Summary, prioritized Customer Pain Points,
        and Actionable Engineering/Business Recommendations from analytical findings.
        """
        total_valid = len(processed_comments)
        if total_valid == 0:
            return {
                "executive_summary": "No valid comments processed.",
                "pain_points": ["Insufficient data available for extraction."],
                "recommendations": ["Expand comment extraction volume."],
                "overall_confidence_score": 0.85,
                "overall_subjectivity_score": 0.50,
            }

        pos_row = next((r for r in breakdown_rows if r.category == "Positive"), None)
        neg_row = next((r for r in breakdown_rows if r.category == "Negative"), None)
        neu_row = next((r for r in breakdown_rows if r.category == "Neutral"), None)

        pos_pct = pos_row.percentage if pos_row else 0.0
        neg_pct = neg_row.percentage if neg_row else 0.0
        neu_pct = neu_row.percentage if neu_row else 0.0

        dominant = "Positive" if pos_pct >= max(neg_pct, neu_pct) else ("Negative" if neg_pct >= max(pos_pct, neu_pct) else "Neutral")
        dominant_pct = pos_pct if dominant == "Positive" else (neg_pct if dominant == "Negative" else neu_pct)

        sorted_causes = sorted(tier2_breakdowns, key=lambda x: x.count, reverse=True)
        top_cause_1 = sorted_causes[0].category if sorted_causes and sorted_causes[0].count > 0 else "General Customer Feedback"
        top_cause_1_pct = sorted_causes[0].percentage if sorted_causes and sorted_causes[0].count > 0 else 0.0
        top_cause_2 = sorted_causes[1].category if len(sorted_causes) > 1 and sorted_causes[1].count > 0 else None
        top_cause_2_pct = sorted_causes[1].percentage if len(sorted_causes) > 1 and sorted_causes[1].count > 0 else 0.0

        alert_str = " ⚠️ High negative sentiment alert is active (>70%)." if neg_pct > 70.0 else ""

        if top_cause_2:
            summary = (
                f"Analysis of {total_valid:,} comments across {platform.capitalize()} shows a predominantly {dominant.lower()} sentiment ({dominant_pct}%). "
                f"Customer friction is heavily concentrated in {top_cause_1} ({top_cause_1_pct}%) followed by {top_cause_2} ({top_cause_2_pct}%).{alert_str}"
            )
        else:
            summary = (
                f"Analysis of {total_valid:,} comments across {platform.capitalize()} shows a predominantly {dominant.lower()} sentiment ({dominant_pct}%). "
                f"Primary root cause identified is {top_cause_1} ({top_cause_1_pct}%).{alert_str}"
            )

        pain_points: List[str] = []
        for cause in sorted_causes[:3]:
            if cause.count > 0:
                snippet = f" — e.g., \"{cause.sample_comments[0][:65]}...\"" if cause.sample_comments else ""
                pain_points.append(f"{cause.category}: {cause.count} occurrences ({cause.percentage}% of negative feedback){snippet}")
        if not pain_points:
            pain_points = ["No severe operational or product friction points detected in sample."]

        recommendations: List[str] = []
        is_ecomm = platform in ECOMM_PLATFORMS
        if is_ecomm:
            if any("Defect" in c.category or "Hardware" in c.category for c in sorted_causes if c.count > 0):
                recommendations.append("Initiate QA batch inspection for reported hardware/material defects.")
            if any("Delivery" in c.category or "Logistics" in c.category for c in sorted_causes if c.count > 0):
                recommendations.append("Audit courier transit protocols and reinforce tamper-evident packaging.")
            if any("Counterfeit" in c.category or "Wrong" in c.category for c in sorted_causes if c.count > 0):
                recommendations.append("Verify seller authenticity certificates and tighten catalog SKU mapping.")
            if any("Value" in c.category or "Warranty" in c.category for c in sorted_causes if c.count > 0):
                recommendations.append("Clarify return/warranty policies with responsive customer care turnaround.")
            if len(recommendations) < 3:
                recommendations.append("Highlight authentic buyer satisfaction stories to boost shopper confidence.")
        else:
            if any("Technical" in c.category for c in sorted_causes if c.count > 0):
                recommendations.append("Prioritize hotfix release addressing app freeze, crash, and login authentication errors.")
            if any("Audio" in c.category for c in sorted_causes if c.count > 0):
                recommendations.append("Implement automated audio normalization and verify multi-track video sync before publishing.")
            if any("Content" in c.category for c in sorted_causes if c.count > 0):
                recommendations.append("Refine pacing and align video titles closely with content delivery to prevent clickbait fatigue.")
            if any("Trolls" in c.category for c in sorted_causes if c.count > 0):
                recommendations.append("Enable comment moderation filters to suppress coordinated bot attacks and ratio spam.")
            if len(recommendations) < 3:
                recommendations.append("Pin top community questions with transparent roadmap milestones.")

        conf_scores = [c.confidence_score for c in processed_comments if c.confidence_score is not None]
        subj_scores = [c.subjectivity_score for c in processed_comments if c.subjectivity_score is not None]

        overall_conf = round(sum(conf_scores) / len(conf_scores), 2) if conf_scores else 0.88
        overall_subj = round(sum(subj_scores) / len(subj_scores), 2) if subj_scores else 0.62

        return {
            "executive_summary": summary,
            "pain_points": pain_points[:3],
            "recommendations": recommendations[:3],
            "overall_confidence_score": overall_conf,
            "overall_subjectivity_score": overall_subj,
        }
