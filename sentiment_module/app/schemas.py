"""
Pydantic data schemas for inputs, comments, classification models, and cached reports.
Supports Social Media (YouTube, Instagram) and E-Commerce (Amazon, Flipkart).
"""

from typing import List, Optional, Literal, Dict
from pydantic import BaseModel, Field


class CommentInput(BaseModel):
    comment_id: str = Field(..., description="Unique comment or review identifier")
    raw_text: str = Field(..., description="Original raw text preserving emojis, Hinglish, and slang")
    timestamp: str = Field(..., description="ISO-8601 formatted timestamp string")
    like_count: int = Field(default=0, description="Number of likes or helpful upvotes")
    anonymized_author_id: str = Field(..., description="SHA-256 hashed author identifier for spam deduplication")
    # E-Commerce Product Review fields
    star_rating: Optional[int] = Field(default=None, description="Star rating 1 to 5 for Amazon/Flipkart reviews")
    verified_purchase: Optional[bool] = Field(default=None, description="Whether review is from a verified buyer")
    product_variant: Optional[str] = Field(default=None, description="Purchased product variant/SKU")


class PostInput(BaseModel):
    post_id: str = Field(..., description="Unique identifier of video, reel, ASIN, or product FSN")
    post_url: str = Field(..., description="Public link to post or product page")
    platform: Literal["youtube", "instagram", "amazon", "flipkart"] = Field(
        default="youtube",
        description="Source platform: youtube, instagram, amazon, flipkart"
    )
    comments: List[CommentInput] = Field(default_factory=list, description="List of raw comments or reviews")
    unbounded_fetch: bool = Field(default=True, description="Whether comments were fetched uncapped without limit")
    pages_fetched: int = Field(default=1, description="Number of pagination pages fetched")
    is_demo: bool = Field(default=False, description="Whether data is from an offline sample preset")
    data_source: str = Field(default="Live Web Scrape (Zero API Key)", description="Provenance of data")
    data_source_badge: str = Field(default="LIVE: Direct Scraper", description="Short badge representation")


class AnalyzeRequest(BaseModel):
    post_id: Optional[str] = Field(default="yt_demo_72neg", description="Post ID, Video ID, ASIN, FSN, or full URL")
    post_url: Optional[str] = Field(
        default=None,
        description="Optional full public URL to video or product"
    )
    platform: Optional[str] = Field(
        default=None,
        description="Optional platform override (youtube, instagram, amazon, flipkart); auto-detected if omitted"
    )
    model_option: Literal["vader_hybrid", "xlm_roberta", "gemini_flash"] = Field(
        default="vader_hybrid",
        description="Sentiment model backend: vader_hybrid (fast local), xlm_roberta (multilingual), gemini_flash (LLM)"
    )
    comments: Optional[List[CommentInput]] = Field(
        default=None,
        description="Optional pre-extracted comments. If omitted, extractor pulls live or loads demo dataset."
    )
    unbounded_fetch: bool = Field(default=True, description="Whether to fetch all available comments without cap limit")
    is_demo: bool = Field(default=False, description="True if explicitly requesting the demo preset dataset")
    # Runtime optional API Keys from UI modal
    youtube_api_key: Optional[str] = Field(default=None, description="Optional YouTube Data API v3 key")
    gemini_api_key: Optional[str] = Field(default=None, description="Optional Gemini API key")
    apify_api_token: Optional[str] = Field(default=None, description="Optional Apify API token")
    instagram_access_token: Optional[str] = Field(default=None, description="Optional Instagram access token")
    scraper_api_key: Optional[str] = Field(default=None, description="Optional Scraper API key for Amazon/Flipkart")


class ProcessedComment(BaseModel):
    comment_id: str
    anonymized_author_id: str
    raw_text: str
    cleaned_text: str
    timestamp: str
    like_count: int
    sentiment: Literal["Positive", "Neutral", "Negative"]
    score: float
    root_cause: Optional[str] = None
    is_spam_or_duplicate: bool = False
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


class SettingsKeysResponse(BaseModel):
    youtube_api_key_configured: bool = Field(default=False)
    gemini_api_key_configured: bool = Field(default=False)
    apify_api_token_configured: bool = Field(default=False)
    instagram_access_token_configured: bool = Field(default=False)
    scraper_api_key_configured: bool = Field(default=False)
    masked_keys: Dict[str, str] = Field(default_factory=dict)


class SettingsKeysUpdate(BaseModel):
    youtube_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None
    apify_api_token: Optional[str] = None
    instagram_access_token: Optional[str] = None
    scraper_api_key: Optional[str] = None
