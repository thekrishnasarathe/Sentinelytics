"""
4-Step Noise & Linguistic Preprocessing Filter:
1. Bot & Spam URL/Promo Removal & Author Deduplication
2. Expressive Emoji-to-Sentiment Mapping
3. Hinglish & Romanized Code-Mixing Lexicon Normalization (Social Media & E-Commerce)
4. Sarcasm Detection & Negation Phrase Preservation
"""

import re
from datetime import datetime, timezone, timedelta
from typing import List, Tuple, Set, Dict, Optional, Any
from dateutil import parser as date_parser
from .schemas import CommentInput


def normalize_timestamp(raw_ts: Any, fallback_index: int = 0) -> str:
    """
    Normalizes any comment timestamp format into a strict ISO-8601 string (YYYY-MM-DDTHH:MM:SSZ).
    Handles:
    - Numeric UNIX epochs (int/float or string, in seconds or milliseconds)
    - Relative time strings ("2 hours ago", "3 days ago", "1 week ago", "4 months ago", "1 year ago", "yesterday", "just now")
    - E-Commerce review date strings ("Reviewed in India on 15 October 2026", "15 Oct, 2026", "Oct 15, 2026")
    - Standard ISO-8601 strings
    - Missing/empty values (deterministic staggered fallback across last 72 hours)
    """
    now = datetime.now(timezone.utc)
    if not raw_ts:
        stagger_min = (fallback_index * 13) % (60 * 24 * 3)
        return (now - timedelta(minutes=stagger_min)).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Numeric epoch check
    if isinstance(raw_ts, (int, float)):
        ts_val = float(raw_ts)
        if ts_val > 1e11:  # Milliseconds
            ts_val /= 1000.0
        try:
            return datetime.fromtimestamp(ts_val, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        except Exception:
            pass

    s = str(raw_ts).strip()
    if s.isdigit() and len(s) in (10, 13):
        ts_val = float(s)
        if len(s) == 13:
            ts_val /= 1000.0
        try:
            return datetime.fromtimestamp(ts_val, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        except Exception:
            pass

    # Clean edits like "(edited)"
    s_clean = re.sub(r"\(.*?\)", "", s).strip()
    low = s_clean.lower()

    if "just now" in low or "moment ago" in low or "seconds ago" in low:
        return now.strftime("%Y-%m-%dT%H:%M:%SZ")
    if "yesterday" in low:
        return (now - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Relative time matching (e.g. '2 hours ago', '3 days ago', '4 months ago')
    rel_m = re.search(r"(\d+)\s+(second|sec|minute|min|hour|hr|day|week|month|year)s?\s+ago", low)
    if rel_m:
        val = int(rel_m.group(1))
        unit = rel_m.group(2)
        if unit in ("second", "sec"):
            dt = now - timedelta(seconds=val)
        elif unit in ("minute", "min"):
            dt = now - timedelta(minutes=val)
        elif unit in ("hour", "hr"):
            dt = now - timedelta(hours=val)
        elif unit in ("day",):
            dt = now - timedelta(days=val)
        elif unit in ("week",):
            dt = now - timedelta(weeks=val)
        elif unit in ("month",):
            dt = now - timedelta(days=val * 30)
        elif unit in ("year",):
            dt = now - timedelta(days=val * 365)
        else:
            dt = now
        return dt.strftime("%Y-%m-%dT%H:%M:%SZ")

    # Amazon format: 'Reviewed in India on 15 October 2026'
    amz_m = re.search(r"on\s+([A-Za-z0-9,\s]+)$", s_clean, re.IGNORECASE)
    candidate_date = amz_m.group(1).strip() if amz_m else s_clean

    try:
        dt = date_parser.parse(candidate_date, fuzzy=True)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
        return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception:
        pass

    stagger_min = (fallback_index * 13) % (60 * 24 * 3)
    return (now - timedelta(minutes=stagger_min)).strftime("%Y-%m-%dT%H:%M:%SZ")


# 64-Emoji DeepMoji Valence & Emotion Lexicon
DEEPMOJI_POSITIVE_SET = {
    "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "☺️", "😊",
    "😇", "🙂", "😍", "🥰", "😘", "😗", "😋", "😛", "😜", "🤪",
    "🤗", "🤩", "😎", "🥳", "👍", "👏", "🙌", "💯", "🔥", "✨",
    "🚀", "❤️"
}

DEEPMOJI_NEGATIVE_SET = {
    "☹️", "🙁", "😕", "😟", "🥺", "😢", "😭", "😤", "😠", "😡",
    "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓",
    "🤢", "🤮", "🤧", "😷", "🤒", "🤕", "👎", "💔", "💩", "🤡",
    "🙄", "🤦"
}


class DeepMojiEmotionEngine:
    """
    64-Emoji Emotion & Conflict Detection Engine.
    Detects emoji-text sarcasm conflict, calculates irony confidence,
    and produces subjectivity scores.
    """
    SUBJECTIVE_MARKERS = {
        "feel", "felt", "think", "thought", "believe", "personally", "imo", "imho",
        "opinion", "loved", "hated", "amazing", "terrible", "worst", "best",
        "awesome", "disappointed", "laggy", "superb", "bakwas", "mast", "badhiya",
        "bekar", "worthless", "paisa", "rubbish", "horrible", "wonderful"
    }

    TEXT_POSITIVE_CLUES = {
        "love", "loved", "great", "awesome", "good", "amazing", "best", "superb",
        "excellent", "perfect", "favorite", "helpful", "mast", "badhiya", "kamaal"
    }

    TEXT_NEGATIVE_CLUES = {
        "terrible", "worst", "horrible", "awful", "bad", "waste", "broken",
        "defect", "bug", "glitch", "crash", "freeze", "fake", "nakli", "bekar"
    }

    SARCASTIC_PHRASES = [
        "clown moment", "wah kya", "pure genius", "what an update",
        "thanks a lot for breaking", "as expected from", "so called"
    ]

    @classmethod
    def analyze_comment(
        cls,
        raw_text: str,
        cleaned_text: str,
        base_sarcastic: bool = False,
        star_rating: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Calculates irony_sarcasm_detected, confidence_score, and subjectivity_score.
        """
        lower_raw = raw_text.lower()
        lower_clean = cleaned_text.lower()

        pos_emojis_found = [e for e in DEEPMOJI_POSITIVE_SET if e in raw_text]
        neg_emojis_found = [e for e in DEEPMOJI_NEGATIVE_SET if e in raw_text]

        has_pos_emoji = len(pos_emojis_found) > 0
        has_neg_emoji = len(neg_emojis_found) > 0

        words = set(re.findall(r"\b\w+\b", lower_clean))
        has_pos_words = any(w in words for w in cls.TEXT_POSITIVE_CLUES)
        has_neg_words = any(w in words for w in cls.TEXT_NEGATIVE_CLUES)

        # Conflict Detection: Positive text + Negative Emojis (e.g. "Best phone ever 🤡😡👎")
        is_emoji_conflict = (has_pos_words and has_neg_emoji and not has_pos_emoji)
        
        # Sarcastic keyword check
        has_sarcastic_phrase = any(phrase in lower_raw for phrase in cls.SARCASTIC_PHRASES)

        irony_sarcasm = base_sarcastic or is_emoji_conflict or has_sarcastic_phrase

        # Subjectivity scoring: ratio of subjective words + exclamation intensity
        subj_count = sum(1 for w in words if w in cls.SUBJECTIVE_MARKERS)
        exclamation_boost = 0.15 if ("!" in raw_text or "?" in raw_text) else 0.0
        word_count = max(len(words), 1)
        raw_subj = 0.45 + (subj_count / word_count * 0.40) + exclamation_boost
        subjectivity_score = round(min(max(raw_subj, 0.20), 0.95), 2)

        # Confidence scoring
        base_confidence = 0.86
        if irony_sarcasm:
            confidence_score = 0.78  # Sarcasm carries nuanced ambiguity
        elif star_rating is not None:
            if (star_rating in (4, 5) and has_pos_words) or (star_rating in (1, 2) and has_neg_words):
                base_confidence += 0.08
            elif (star_rating in (4, 5) and has_neg_words) or (star_rating in (1, 2) and has_pos_words):
                base_confidence -= 0.15
            confidence_score = round(min(max(base_confidence, 0.45), 0.98), 2)
        else:
            confidence_score = round(base_confidence, 2)

        return {
            "irony_sarcasm_detected": irony_sarcasm,
            "confidence_score": confidence_score,
            "subjectivity_score": subjectivity_score,
            "is_emoji_conflict": is_emoji_conflict,
        }


class CommentPreprocessor:
    # URL and promo patterns
    SPAM_URL_PATTERNS = [
        r"https?://\S+",
        r"www\.\S+",
        r"\b\w+\.com/\S+",
        r"\bt\.me/\S+",
        r"\bbit\.ly/\S+",
        r"\bgoo\.gl/\S+",
    ]
    SPAM_PHRASE_PATTERNS = [
        r"\bcheck (?:my|out my) channel\b",
        r"\bfree (?:crypto|bitcoin|eth|money|robux|gift card|coins|cashback)\b",
        r"\bsubscribe to me\b",
        r"\bsub4sub\b",
        r"\bwhatsapp\s*(?:me|\+\d+)\b",
        r"\btelegram\s*:\s*@?\w+\b",
        r"\binvest\s+(?:and\s+earn|\$\d+)\b",
        r"\bclaim\s+tokens\b",
        r"\bpaid (?:positive reviews|review boosts)\b",
    ]

    # Expressive emoji mappings
    POSITIVE_EMOJIS = {
        "🔥": " positive_emoji excellent awesome ",
        "❤️": " positive_emoji love fantastic ",
        "😍": " positive_emoji love adore ",
        "👍": " positive_emoji good approve ",
        "🙌": " positive_emoji praise celebrate ",
        "💯": " positive_emoji perfect hundred ",
        "🎉": " positive_emoji celebrate yay ",
        "😊": " positive_emoji happy glad ",
        "✨": " positive_emoji brilliant ",
        "👏": " positive_emoji applause bravo ",
        "🚀": " positive_emoji thriving great ",
    }

    NEGATIVE_EMOJIS = {
        "😡": " negative_emoji terrible angry furious ",
        "🤬": " negative_emoji awful swear curse ",
        "😭": " negative_emoji crying terribly sad ",
        "👎": " negative_emoji dislike terrible bad ",
        "💔": " negative_emoji heartbreak disappointed ",
        "🤮": " negative_emoji disgust vomiting awful ",
        "😤": " negative_emoji frustrated annoyed ",
        "🐛": " negative_emoji bug defect glitch ",
        "🛠️": " negative_emoji broken repair needed ",
        "😠": " negative_emoji mad annoyed ",
        "💩": " negative_emoji crap garbage ",
        "🗑️": " negative_emoji trash worthless ",
    }

    # Hinglish Lexicons - Social Media & E-Commerce
    HINGLISH_POSITIVE = {
        "mast": "excellent",
        "badiya": "great",
        "badhiya": "great",
        "sahi": "accurate good",
        "zabardast": "fantastic wonderful",
        "kamaal": "superb amazing",
        "shandar": "magnificent superb",
        "achha": "good",
        "accha": "good",
        "acha": "good",
        "op": "overpowered awesome",
        "helpful": "helpful useful",
        "faadu": "mindblowing",
        "dhansu": "terrific",
        "asli": "genuine authentic original",
        "vasool": "worth penny great value",
    }

    HINGLISH_NEGATIVE = {
        "bekar": "useless terrible horrible defective",
        "bekaar": "useless terrible horrible defective",
        "ghatiya": "worthless awful defective",
        "bakwas": "nonsense garbage crap",
        "bakwaas": "nonsense garbage crap",
        "kharab": "broken terrible defective",
        "khrab": "broken terrible defective",
        "faltu": "useless waste of time",
        "dhoka": "fraud cheat deceptive scam",
        "barbaad": "ruined destroyed terrible",
        "kachra": "garbage trash",
        "slow": "very sluggish unusable",
        "lallu": "stupid bad",
        "dimag kharab": "frustrating headache",
        "nakli": "counterfeit fake duplicate",
        "lutera": "robber scammer",
    }

    # Negation phrases that invert sentiment or negate praise
    NEGATION_PHRASES = [
        "not working",
        "not worth",
        "not good",
        "not genuine",
        "not original",
        "not recommending",
        "wont work",
        "won't work",
        "wont open",
        "won't open",
        "wont turn on",
        "won't turn on",
        "doesn't load",
        "doesnt load",
        "wont load",
        "won't load",
        "cant open",
        "can't open",
        "cant use",
        "can't use",
        "cannot use",
        "never buy",
        "dont buy",
        "don't buy",
        "never recommend",
        "no support",
        "no warranty",
        "refund denied",
        "return rejected",
        "seal broken",
        "stopped working",
        "nahi chal raha",
        "kaam nahi kar raha",
    ]

    # Sarcastic patterns
    SARCASM_PATTERNS = [
        r"\bgreat job breaking\b",
        r"\bawesome (?:bug|crash|glitch)\b",
        r"\blove how it crashes\b",
        r"\blove how it freezes\b",
        r"\bthanks for ruining\b",
        r"\bcongrats on breaking\b",
        r"\bbrilliant update (?:that broke|that crashed)\b",
        r"\bperfect way to ruin\b",
        r"\bgreat job sending (?:duplicate|fake|broken)\b",
        r"\bsuperb packing box was (?:crushed|broken|torn)\b",
        r"\bthanks for sending (?:broken|nakli|fake)\b",
    ]

    def __init__(self):
        self._compiled_spam_urls = [re.compile(p, re.IGNORECASE) for p in self.SPAM_URL_PATTERNS]
        self._compiled_spam_phrases = [re.compile(p, re.IGNORECASE) for p in self.SPAM_PHRASE_PATTERNS]
        self._sarcasm_regexes = [re.compile(p, re.IGNORECASE) for p in self.SARCASM_PATTERNS]

    @staticmethod
    def normalize_timestamp(raw_ts: Any, fallback_index: int = 0) -> str:
        return normalize_timestamp(raw_ts, fallback_index=fallback_index)

    def is_spam_or_promo(self, text: str) -> bool:
        """Step 1: Detect promotional links, URL spam, or bot advertising."""
        for regex in self._compiled_spam_urls:
            if regex.search(text):
                return True
        for regex in self._compiled_spam_phrases:
            if regex.search(text):
                return True
        return False

    def filter_bots_and_spam(self, comments: List[CommentInput]) -> Tuple[List[CommentInput], int]:
        """
        Step 1 Filter: Remove spam URLs, promo phrases, and deduplicate identical author posts.
        Returns: (cleaned_comments, count_of_removed_items)
        """
        valid_comments: List[CommentInput] = []
        seen_signatures: Set[Tuple[str, str]] = set()
        removed_count = 0

        for comment in comments:
            raw = comment.raw_text.strip()
            # 1. URL / Promo check
            if self.is_spam_or_promo(raw):
                removed_count += 1
                continue

            # 2. Author and normalized text deduplication (Spam bots sending duplicates)
            norm_text = re.sub(r"\s+", " ", raw).lower()
            signature = (comment.anonymized_author_id, norm_text)
            if signature in seen_signatures:
                removed_count += 1
                continue

            seen_signatures.add(signature)
            valid_comments.append(comment)

        return valid_comments, removed_count

    def map_emojis(self, text: str) -> str:
        """Step 2: Replace unicode emojis with explicit sentiment anchor tokens."""
        res = text
        for emo, replacement in self.POSITIVE_EMOJIS.items():
            if emo in res:
                res = res.replace(emo, replacement)
        for emo, replacement in self.NEGATIVE_EMOJIS.items():
            if emo in res:
                res = res.replace(emo, replacement)
        return res

    def normalize_hinglish(self, text: str) -> str:
        """Step 3: Normalize Romanized Hindi (Hinglish) tokens into English sentiment anchors."""
        # Multi-word Hinglish phrases
        phrase_replacements = {
            r"\bpaisa vasool\b": "paisa_vasool worth_every_penny excellent_value",
            r"\bpaisa barbaad\b": "paisa_barbaad waste_of_money terrible_ruined",
            r"\bbilkul nakli\b": "bilkul_nakli completely_fake_counterfeit",
            r"\bbattery backup bekar\b": "battery_backup_bekar defective_battery_drains",
            r"\bdimage? kharab\b": "frustrating_headache awful",
            r"\bkamaal kar diya\b": "superb_masterpiece amazing",
        }
        res = text
        for pat, rep in phrase_replacements.items():
            res = re.sub(pat, rep, res, flags=re.IGNORECASE)

        words = res.split()
        normalized_tokens = []
        for word in words:
            clean_word = re.sub(r"[^\w]", "", word).lower()
            if clean_word in self.HINGLISH_POSITIVE:
                normalized_tokens.append(f"{word} {self.HINGLISH_POSITIVE[clean_word]}")
            elif clean_word in self.HINGLISH_NEGATIVE:
                normalized_tokens.append(f"{word} {self.HINGLISH_NEGATIVE[clean_word]}")
            else:
                normalized_tokens.append(word)

        return " ".join(normalized_tokens)

    def handle_sarcasm_and_negations(self, text: str) -> Tuple[str, bool, Optional[float]]:
        """
        Step 4: Detect sarcastic patterns and preserve negation phrases.
        Returns: (transformed_text, is_sarcastic, sarcastic_override_score)
        """
        # 1. Sarcasm detection
        for regex in self._sarcasm_regexes:
            if regex.search(text):
                augmented_text = f"{text} terrible frustrating broken sarcasm_defect"
                return augmented_text, True, -0.75

        # 2. Negation phrase preservation
        lower = text.lower()
        has_negation = False
        transformed = text
        for negation in self.NEGATION_PHRASES:
            if negation in lower:
                has_negation = True
                replacement = f" defective broken {negation} "
                transformed = re.sub(re.escape(negation), replacement, transformed, flags=re.IGNORECASE)

        if has_negation:
            return transformed, False, -0.65

        return transformed, False, None

    def preprocess(self, raw_text: str, star_rating: Optional[int] = None) -> Dict[str, Any]:
        """
        Full 4-step preprocessing for a single comment or review.
        Returns dictionary with transformed text and linguistic flags.
        """
        is_spam = self.is_spam_or_promo(raw_text)
        step2_text = self.map_emojis(raw_text)
        step3_text = self.normalize_hinglish(step2_text)
        step4_text, is_sarcastic, override_score = self.handle_sarcasm_and_negations(step3_text)
        final_text = re.sub(r"\s+", " ", step4_text).strip()

        emotion_meta = DeepMojiEmotionEngine.analyze_comment(
            raw_text=raw_text,
            cleaned_text=final_text,
            base_sarcastic=is_sarcastic,
            star_rating=star_rating,
        )

        if emotion_meta.get("is_emoji_conflict") and override_score is None:
            override_score = -0.72
            is_sarcastic = True

        return {
            "raw_text": raw_text,
            "cleaned_text": final_text,
            "is_spam": is_spam,
            "is_sarcastic": is_sarcastic,
            "sarcastic_override_score": override_score,
            "irony_sarcasm_detected": emotion_meta["irony_sarcasm_detected"],
            "confidence_score": emotion_meta["confidence_score"],
            "subjectivity_score": emotion_meta["subjectivity_score"],
        }
