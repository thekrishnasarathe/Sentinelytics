export type PlatformType =
  | 'youtube'
  | 'instagram'
  | 'amazon'
  | 'flipkart'
  | 'myntra'
  | 'meesho'
  | 'nykaa'
  | 'ajio';

export interface SentimentBreakdownRow {
  category: 'Negative' | 'Positive' | 'Neutral';
  comment_count: number;
  percentage: number;
  top_keywords: string[];
}

export interface Tier2RootCauseBreakdown {
  category: string;
  count: number;
  percentage: number;
  sample_comments: string[];
}

export interface ProcessedComment {
  comment_id: string;
  anonymized_author_id: string;
  raw_text: string;
  cleaned_text: string;
  timestamp: string;
  like_count: number;
  sentiment: 'Positive' | 'Neutral' | 'Negative';
  score: number;
  root_cause?: string | null;
  is_spam_or_duplicate?: boolean;
  irony_sarcasm_detected?: boolean;
  confidence_score?: number;
  subjectivity_score?: number;
  star_rating?: number | null;
  verified_purchase?: boolean | null;
  product_variant?: string | null;
}

export interface TimelineBucket {
  label: string;
  positive: number;
  neutral: number;
  negative: number;
  total: number;
}

export interface KeywordFrequencyItem {
  keyword: string;
  count: number;
  sentiment: 'Positive' | 'Negative' | 'Neutral';
  percentage?: number;
}

export interface CachedReport {
  post_id: string;
  post_url: string;
  platform: PlatformType | string;
  model_used: string;
  generated_at: string;
  total_raw_comments: number;
  spam_duplicates_removed: number;
  total_valid_comments: number;
  high_negative_alert: boolean;
  breakdown: SentimentBreakdownRow[];
  tier2_root_causes: Tier2RootCauseBreakdown[];
  sample_comments: ProcessedComment[];
  unbounded_fetch: boolean;
  pages_fetched: number;
  star_rating_breakdown?: Record<string, number> | null;
  star_rating_distribution?: Record<string, { Positive: number; Neutral: number; Negative: number; total: number }> | null;
  keyword_frequencies?: KeywordFrequencyItem[] | null;
  keyword_stats?: KeywordFrequencyItem[] | null;
  timeline_buckets?: TimelineBucket[] | null;
  platform_reported_total?: number | null;
  warning_message?: string | null;
  is_demo?: boolean;
  data_source?: string;
  data_source_badge?: string;
  executive_summary?: string | null;
  pain_points?: string[] | null;
  recommendations?: string[] | null;
  overall_confidence_score?: number | null;
  overall_subjectivity_score?: number | null;
  sarcastic_comments_count?: number;
}

export interface HistoryItem {
  post_id: string;
  post_url: string;
  platform: string;
  total_comments: number;
  positive_pct: number;
  negative_pct: number;
  neutral_pct: number;
  generated_at: string;
  model_used: string;
  high_negative_alert?: boolean;
  executive_summary?: string;
}

export interface CompareResponse {
  report_a: CachedReport;
  report_b: CachedReport;
  delta_positive_pct: number;
  delta_negative_pct: number;
  winner: string;
}

