"""
4-Step Noise & Linguistic Preprocessing Filter:
1. Bot & Spam URL/Promo Removal & Author Deduplication
2. Expressive Emoji-to-Sentiment Mapping
3. Hinglish & Romanized Code-Mixing Lexicon Normalization (Social Media & E-Commerce)
4. Sarcasm Detection & Negation Phrase Preservation
"""

import re
from typing import List, Tuple, Set, Dict, Optional, Any
from .schemas import CommentInput


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

    def preprocess(self, raw_text: str) -> Dict[str, Any]:
        """
        Full 4-step preprocessing for a single comment or review.
        Returns dictionary with transformed text and linguistic flags.
        """
        is_spam = self.is_spam_or_promo(raw_text)
        step2_text = self.map_emojis(raw_text)
        step3_text = self.normalize_hinglish(step2_text)
        step4_text, is_sarcastic, override_score = self.handle_sarcasm_and_negations(step3_text)
        final_text = re.sub(r"\s+", " ", step4_text).strip()

        return {
            "raw_text": raw_text,
            "cleaned_text": final_text,
            "is_spam": is_spam,
            "is_sarcastic": is_sarcastic,
            "sarcastic_override_score": override_score,
        }
