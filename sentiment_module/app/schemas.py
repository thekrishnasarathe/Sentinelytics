"""
Pydantic data schemas for inputs, comments, classification models, and cached reports.
Supports Social Media (YouTube, Instagram) and E-Commerce (Amazon, Flipkart).
"""

from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel, Field, model_validator


class CommentInput(BaseModel):
    comment_id: str = Field(default="", description="Unique comment or review identifier")
    raw_text: str = Field(default="", description="Original raw text preserving emojis, Hinglish, and slang")
    timestamp: str = Field(default="", description="ISO-8601 formatted timestamp string")
    like_count: int = Field(default=0, description="Number of likes or helpful upvotes")
    anonymized_author_id: str = Field(default="user", description="SHA-256 hashed or raw author identifier for deduplication")
    author: Optional[str] = Field(default=None, description="Original buyer or commenter name")
    # E-Commerce Product Review fields
    star_rating: Optional[int] = Field(default=None, description="Star rating 1 to 5 for Amazon/Flipkart reviews")
    verified_purchase: Optional[bool] = Field(default=None, description="Whether review is from a verified buyer")
    product_variant: Optional[str] = Field(default=None, description="Purchased product variant/SKU")

    @model_validator(mode="before")
    @classmethod
    def normalize_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # 1. Map flexible text aliases to raw_text
            if not data.get("raw_text"):
                data["raw_text"] = (
                    data.get("text")
                    or data.get("comment")
                    or data.get("review_text")
                    or data.get("body")
                    or ""
                )

            # 2. Map flexible author aliases to anonymized_author_id
            if not data.get("anonymized_author_id"):
                data["anonymized_author_id"] = (
                    data.get("author")
                    or data.get("user")
                    or data.get("author_id")
                    or data.get("reviewer")
                    or "user"
                )

            # 3. Map flexible rating aliases to star_rating
            if data.get("star_rating") is None:
                val = data.get("rating") or data.get("stars") or data.get("score_stars")
                if val is not None:
                    try:
                        data["star_rating"] = int(val)
                    except (ValueError, TypeError):
                        pass

            # 4. Generate comment_id if missing
            if not data.get("comment_id"):
                import hashlib
                auth = str(data.get("anonymized_author_id", "user"))
                txt = str(data.get("raw_text", ""))
                h = hashlib.sha256(f"{auth}::{txt}".encode("utf-8")).hexdigest()[:16]
                data["comment_id"] = f"c_{h}"

            # 5. Default timestamp if missing
            if not data.get("timestamp"):
                from datetime import datetime, timezone
                data["timestamp"] = datetime.now(timezone.utc).isoformat()
        return data


class PostInput(BaseModel):
    post_id: str = Field(..., description="Unique identifier of video, reel, ASIN, or product FSN")
    post_url: str = Field(..., description="Public link to post or product page")
    platform: Literal["youtube", "instagram", "amazon", "flipkart", "myntra", "meesho", "nykaa", "ajio"] = Field(
        default="youtube",
        description="Source platform: youtube, instagram, amazon, flipkart, myntra, meesho, nykaa, ajio"
    )
    comments: List[CommentInput] = Field(default_factory=list, description="List of raw comments or reviews")
    unbounded_fetch: bool = Field(default=True, description="Whether comments were fetched uncapped without limit")
    pages_fetched: int = Field(default=1, description="Number of pagination pages fetched")
    is_demo: bool = Field(default=False, description="Whether data is from an offline sample preset")
    data_source: str = Field(default="Live Web Scrape (Zero API Key)", description="Provenance of data")
    data_source_badge: str = Field(default="LIVE: Direct Scraper", description="Short badge representation")
    platform_reported_total: Optional[int] = Field(default=None, description="Reported total from platform metadata")
    warning_message: Optional[str] = Field(default=None, description="Warning banner for anti-bot detection or fallbacks")


class AnalyzeRequest(BaseModel):
    post_id: Optional[str] = Field(default="yt_demo_72neg", description="Post ID, Video ID, ASIN, FSN, or full URL")
    post_url: Optional[str] = Field(
        default=None,
        description="Optional full public URL to video or product"
    )
    platform: Optional[str] = Field(
        default=None,
        description="Optional platform override (youtube, instagram, amazon, flipkart, myntra, meesho, nykaa, ajio); auto-detected if omitted"
    )
    model_option: Literal["vader_hybrid", "xlm_roberta", "gemini_flash"] = Field(
        default="vader_hybrid",
        description="Sentiment model backend: vader_hybrid (fast local), xlm_roberta (multilingual), gemini_flash (LLM)"
    )
    comments: Optional[List[CommentInput]] = Field(
        default=None,
        description="Optional pre-extracted comments. If omitted, extractor pulls live or loads demo dataset."
    )
    custom_comments: Optional[List[CommentInput]] = Field(
        default=None,
        description="Direct custom comments list payload from extension or manual injection"
    )
    use_cache: bool = Field(
        default=True,
        description="Whether to return cached report if available"
    )
    unbounded_fetch: bool = Field(default=True, description="Whether to fetch all available comments without cap limit")
    is_demo: bool = Field(default=False, description="True if explicitly requesting the demo preset dataset")
    # Runtime optional API Keys from UI modal
    youtube_api_key: Optional[str] = Field(default=None, description="Optional YouTube Data API v3 key")
    gemini_api_key: Optional[str] = Field(default=None, description="Optional Gemini API key")
    apify_api_token: Optional[str] = Field(default=None, description="Optional Apify API token")
    instagram_access_token: Optional[str] = Field(default=None, description="Optional Instagram access token")
    scraper_api_key: Optional[str] = Field(default=None, description="Optional Scraper API key for Amazon/Flipkart")


class BrowserIngestRequest(BaseModel):
    post_url: str = Field(..., description="Public link of the post or product page")
    post_id: Optional[str] = Field(default=None, description="Unique post ID, ASIN, FSN, or video ID")
    title: Optional[str] = Field(default=None, description="Title of the video or product")
    platform: Optional[Literal["youtube", "instagram", "amazon", "flipkart", "myntra", "meesho", "nykaa", "ajio"]] = Field(
        default=None,
        description="Platform: youtube, instagram, amazon, flipkart, myntra, meesho, nykaa, ajio"
    )
    comments: List[CommentInput] = Field(default_factory=list, description="List of scraped comments/reviews from browser extension")
    model_option: Literal["vader_hybrid", "xlm_roberta", "gemini_flash"] = Field(
        default="vader_hybrid",
        description="Sentiment model backend"
    )


class ProcessedComment(BaseModel):
    comment_id: str
    anonymized_author_id: str
    author: Optional[str] = None
    raw_text: str
    cleaned_text: str
    timestamp: str
    like_count: int
    sentiment: Literal["Positive", "Neutral", "Negative"]
    score: float
    root_cause: Optional[str] = None
    is_spam_or_duplicate: bool = False
    irony_sarcasm_detected: bool = Field(default=False, description="Whether sarcasm or text-emoji conflict was detected")
    confidence_score: float = Field(default=0.85, description="NLP confidence score between 0.0 and 1.0")
    subjectivity_score: float = Field(default=0.50, description="Subjectivity score between 0.0 (objective) and 1.0 (highly subjective)")
    # E-Commerce Product Review fields
    star_rating: Optional[int] = None
    verified_purchase: Optional[bool] = None
    product_variant: Optional[str] = None


class SentimentBreakdownRow(BaseModel):
    category: Literal["Negative", "Positive", "Neutral"]
    comment_count: int
    percentage: float
    top_keywords: List[str] = Field(default_factory=list)


class Tier2RootCauseBreakdown(BaseModel):
    category: str = Field(..., description="Root cause bucket name")
    count: int = Field(..., description="Number of negative comments under this root cause")
    percentage: float = Field(..., description="Percentage relative to all negative comments")
    sample_comments: List[str] = Field(default_factory=list, description="Sample raw comments demonstrating this cause")


class CachedReport(BaseModel):
    post_id: str
    post_url: str
    platform: str
    model_used: str
    generated_at: str
    total_raw_comments: int
    spam_duplicates_removed: int
    total_valid_comments: int
    high_negative_alert: bool = Field(..., description="True if negative sentiment exceeds 70.0%")
    breakdown: List[SentimentBreakdownRow]
    tier2_root_causes: List[Tier2RootCauseBreakdown]
    sample_comments: Optional[List[ProcessedComment]] = Field(
        default=None,
        description="Curated list of sample classified comments for UI preview"
    )
    unbounded_fetch: bool = Field(
        default=True,
        description="Indicates 100% uncapped pagination was executed without arbitrary limits"
    )
    pages_fetched: int = Field(
        default=1,
        description="Total pagination pages traversed during extraction"
    )
    star_rating_breakdown: Optional[Dict[str, int]] = Field(
        default=None,
        description="1 to 5 star rating distribution for e-commerce reviews"
    )
    star_rating_distribution: Optional[Dict[str, Dict[str, int]]] = Field(
        default=None,
        description="1 to 5 star rating distribution segmented by sentiment ({'5': {'Positive': 120, 'Neutral': 5, 'Negative': 2}, ...})"
    )
    keyword_frequencies: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Dynamic keyword counts for issue & praise breakdown (e.g. [{'keyword': 'crash', 'count': 42, 'sentiment': 'Negative'}])"
    )
    keyword_stats: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Top 8-12 dynamic keywords/phrases extracted directly from comments"
    )
    timeline_buckets: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="10 to 12 evenly-spaced chronological wave buckets with positive, neutral, negative counts"
    )
    platform_reported_total: Optional[int] = Field(
        default=None,
        description="Total comments reported by platform metadata (e.g. 51,240 on YouTube)"
    )
    warning_message: Optional[str] = Field(
        default=None,
        description="Active warning or anti-bot notification banner"
    )
    is_demo: bool = Field(
        default=False,
        description="Whether this report is from an offline sample preset or scraped live"
    )
    data_source: str = Field(
        default="Live Web Scrape (Zero API Key)",
        description="Detailed provenance of data"
    )
    data_source_badge: str = Field(
        default="LIVE: Direct Scraper",
        description="Short badge identifier for extraction provenance"
    )
    # Executive Insights & Metametrics
    executive_summary: Optional[str] = Field(
        default=None,
        description="AI Executive Summary synthesized from sentiment breakdown and top root causes"
    )
    pain_points: Optional[List[str]] = Field(
        default_factory=list,
        description="Top 3 prioritized customer friction points or root causes"
    )
    recommendations: Optional[List[str]] = Field(
        default_factory=list,
        description="Top 3 actionable business or engineering recommendations"
    )
    overall_confidence_score: Optional[float] = Field(
        default=0.88,
        description="Aggregated pipeline confidence score (0.0 to 1.0)"
    )
    overall_subjectivity_score: Optional[float] = Field(
        default=0.62,
        description="Aggregated subjective vs objective comment ratio (0.0 to 1.0)"
    )
    sarcastic_comments_count: Optional[int] = Field(
        default=0,
        description="Total count of comments with irony/sarcasm or emoji-text polarity conflict"
    )
    status: Optional[str] = Field(
        default="ok",
        description="Execution status indicator ('ok', 'success', etc.)"
    )
    redirect_url: Optional[str] = Field(
        default=None,
        description="Direct link to view this report in the web dashboard"
    )


class HistoryItemResponse(BaseModel):
    post_id: str
    post_url: str
    platform: str
    total_comments: int
    positive_pct: float
    negative_pct: float
    neutral_pct: float
    generated_at: str
    model_used: str
    high_negative_alert: bool = False
    executive_summary: Optional[str] = None


class CompareRequest(BaseModel):
    post_id_a: str = Field(..., description="First post ID, URL, ASIN or identifier")
    post_id_b: str = Field(..., description="Second post ID, URL, ASIN or identifier")


class CompareResponse(BaseModel):
    report_a: CachedReport
    report_b: CachedReport
    delta_positive_pct: float
    delta_negative_pct: float
    winner: str = Field(..., description="Which target scored higher positive sentiment ratio")


class SettingsKeysResponse(BaseModel):
    youtube_api_key_configured: bool = Field(default=False)
    gemini_api_key_configured: bool = Field(default=False)
    apify_api_token_configured: bool = Field(default=False)
    instagram_access_token_configured: bool = Field(default=False)
    scraper_api_key_configured: bool = Field(default=False)
    rapidapi_key_configured: bool = Field(default=False)
    masked_keys: Dict[str, str] = Field(default_factory=dict)


class SettingsKeysUpdate(BaseModel):
    youtube_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None
    apify_api_token: Optional[str] = None
    instagram_access_token: Optional[str] = None
    scraper_api_key: Optional[str] = None
    rapidapi_key: Optional[str] = None


class RapidApiInstagramRequest(BaseModel):
    shortcode: Optional[str] = None
    post_id: Optional[str] = None
    post_url: Optional[str] = None
    max_comments: Optional[int] = 1000


class RapidApiAmazonRequest(BaseModel):
    asin: Optional[str] = None
    post_id: Optional[str] = None
    post_url: Optional[str] = None
    country_code: Optional[str] = "IN"
    max_reviews: Optional[int] = 200
