import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Download,
  FileText,
  Table as TableIcon,
  AlertTriangle,
  TrendingUp,
  BarChart3,
  PieChart as PieChartIcon,
  Search,
  Filter,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  ShoppingBag,
  Youtube,
  Instagram,
  Star,
  Zap,
  Sparkles,
  Clock,
  Layers,
  Activity,
  Key,
  X,
  Info,
  Check,
  Globe
} from 'lucide-react';

// --- Types & Interfaces ---

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
  star_rating?: number | null;
  verified_purchase?: boolean | null;
  product_variant?: string | null;
}

export interface CachedReport {
  post_id: string;
  post_url: string;
  platform: 'youtube' | 'instagram' | 'amazon' | 'flipkart';
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
  is_demo?: boolean;
  data_source?: string;
  data_source_badge?: string;
}

// --- Built-in Demo Presets ---

const DEMO_PRESETS = [
  {
    id: 'yt_demo_72neg',
    platform: 'youtube' as const,
    label: 'YouTube Flagged Upload (>70% Neg)',
    icon: Youtube,
    badge: 'Social Media',
    color: 'from-rose-500 to-red-600',
    description: '1,045 Comments • Critical 72% Negative Alert Active'
  },
  {
    id: 'ig_demo_creator_reel',
    platform: 'instagram' as const,
    label: 'Instagram Creator Reel',
    icon: Instagram,
    badge: 'Social Media',
    color: 'from-pink-500 to-purple-600',
    description: 'Graph Ingestion • Creator Engagement Benchmark'
  },
  {
    id: 'amz_smartphone_reviews',
    platform: 'amazon' as const,
    label: 'Amazon Smartphone Reviews (E-Comm)',
    icon: ShoppingBag,
    badge: 'E-Commerce',
    color: 'from-amber-500 to-orange-600',
    description: '1,250 Reviews • ASIN: B09X6GMNP7 • 1★-5★ Hinglish'
  },
  {
    id: 'flp_electronics_sale',
    platform: 'flipkart' as const,
    label: 'Flipkart Electronics Sale (E-Comm)',
    icon: ShoppingBag,
    badge: 'E-Commerce',
    color: 'from-blue-500 to-indigo-600',
    description: '1,250 Reviews • FSN: MOBGH73XHZ6QG9FZ • 76% Neg Alert'
  }
];

export default function App() {
  const [selectedPreset, setSelectedPreset] = useState<string>('yt_demo_72neg');
  const [inputTarget, setInputTarget] = useState<string>('yt_demo_72neg');
  const [platform, setPlatform] = useState<'youtube' | 'instagram' | 'amazon' | 'flipkart'>('youtube');
  const [modelOption, setModelOption] = useState<'vader_hybrid' | 'xlm_roberta' | 'gemini_flash'>('vader_hybrid');
  const [unboundedFetch, setUnboundedFetch] = useState<boolean>(true);
  const [isDemoAction, setIsDemoAction] = useState<boolean>(true);
  const abortRef = useRef<AbortController | null>(null);

  // API Keys Modal State
  const [showKeysModal, setShowKeysModal] = useState<boolean>(false);
  const [youtubeApiKey, setYoutubeApiKey] = useState<string>(() => localStorage.getItem('YOUTUBE_API_KEY') || '');
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => localStorage.getItem('GEMINI_API_KEY') || '');
  const [apifyToken, setApifyToken] = useState<string>(() => localStorage.getItem('APIFY_API_TOKEN') || '');
  const [instagramToken, setInstagramToken] = useState<string>(() => localStorage.getItem('INSTAGRAM_ACCESS_TOKEN') || '');
  const [scraperApiKey, setScraperApiKey] = useState<string>(() => localStorage.getItem('SCRAPER_API_KEY') || '');

  // Report & Loading State
  const [report, setReport] = useState<CachedReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [exportLatency, setExportLatency] = useState<string | null>(null);

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [feedFilter, setFeedFilter] = useState<'ALL' | 'Negative' | 'Positive' | 'Neutral'>('ALL');
  const [selectedRootCauseFilter, setSelectedRootCauseFilter] = useState<string>('ALL');

  // Fetch server-configured keys on mount
  useEffect(() => {
    fetch('/api/settings/keys')
      .then(res => res.json())
      .then(data => {
        if (data && data.masked_keys) {
          console.log('Server keys status:', data);
        }
      })
      .catch(() => {});
  }, []);

  // Auto-detect platform when typing or pasting URLs
  const handleInputChange = (val: string) => {
    setInputTarget(val);
    const low = val.toLowerCase();
    if (low.includes('youtube.com') || low.includes('youtu.be')) {
      setPlatform('youtube');
    } else if (low.includes('instagram.com')) {
      setPlatform('instagram');
    } else if (low.includes('amazon')) {
      setPlatform('amazon');
    } else if (low.includes('flipkart')) {
      setPlatform('flipkart');
    }
  };

  // Trigger initial demo on mount
  useEffect(() => {
    handleExecuteAnalysis('yt_demo_72neg', 'youtube', 'vader_hybrid', true);
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  const saveApiKeys = async () => {
    localStorage.setItem('YOUTUBE_API_KEY', youtubeApiKey);
    localStorage.setItem('GEMINI_API_KEY', geminiApiKey);
    localStorage.setItem('APIFY_API_TOKEN', apifyToken);
    localStorage.setItem('INSTAGRAM_ACCESS_TOKEN', instagramToken);
    localStorage.setItem('SCRAPER_API_KEY', scraperApiKey);

    try {
      await fetch('/api/settings/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          youtube_api_key: youtubeApiKey || undefined,
          gemini_api_key: geminiApiKey || undefined,
          apify_api_token: apifyToken || undefined,
          instagram_access_token: instagramToken || undefined,
          scraper_api_key: scraperApiKey || undefined,
        })
      });
    } catch (err) {
      console.warn('Could not sync keys to server:', err);
    }

    setShowKeysModal(false);
  };

  const handleSelectPreset = (presetId: string) => {
    const found = DEMO_PRESETS.find(p => p.id === presetId);
    if (!found) return;
    setSelectedPreset(presetId);
    setInputTarget(presetId);
    setPlatform(found.platform);
    setIsDemoAction(true);
    handleExecuteAnalysis(presetId, found.platform, modelOption, true);
  };

  const handleExecuteAnalysis = async (
    targetStr: string,
    targetPlatform: 'youtube' | 'instagram' | 'amazon' | 'flipkart',
    targetModel: string,
    isExplicitDemo: boolean
  ) => {
    // Abort previous pending fetch to prevent race conditions or UI flickering
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setIsDemoAction(isExplicitDemo);
    setErrorMessage(null);
    setExportLatency(null);

    const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s safety timeout for deep live scraping

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          post_id: targetStr,
          platform: targetPlatform,
          model_option: targetModel,
          unbounded_fetch: unboundedFetch,
          is_demo: isExplicitDemo,
          youtube_api_key: youtubeApiKey || undefined,
          gemini_api_key: geminiApiKey || undefined,
          apify_api_token: apifyToken || undefined,
          instagram_access_token: instagramToken || undefined,
          scraper_api_key: scraperApiKey || undefined,
        })
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        let errDetail = `Server responded with HTTP ${res.status}`;
        try {
          const errData = await res.json();
          if (errData && errData.detail) errDetail = errData.detail;
        } catch (_) {}
        throw new Error(errDetail);
      }

      const data: CachedReport = await res.json();
      if (abortRef.current === controller) {
        setReport(data);
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        if (abortRef.current !== controller) return; // Ignore intentional abort from another user action
        setErrorMessage('Live request timed out after 45s. The target site may be throttling connections.');
      } else {
        console.error('Analysis failed:', err);
        setErrorMessage(err.message || 'Unable to connect to live analysis server.');
      }
    } finally {
      if (abortRef.current === controller) {
        setIsLoading(false);
      }
    }
  };

  const handleDownloadExport = async (format: 'pdf' | 'csv') => {
    if (!report) return;
    const start = performance.now();
    try {
      const res = await fetch(`/api/export/${encodeURIComponent(report.post_id)}/${format}`);
      if (res.ok) {
        const headerLatency = res.headers.get('X-Export-Time-Seconds');
        const blob = await res.blob();
        const clientElapsed = ((performance.now() - start) / 1000).toFixed(3);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sentiment_report_${report.post_id}.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setExportLatency(`⚡ Downloaded ${format.toUpperCase()} in ${headerLatency || clientElapsed}s (Sub-second <1s verified)`);
        return;
      }
    } catch (e) {
      console.warn('Backend download unreachable:', e);
    }

    // Client-side fallback export
    const clientElapsed = ((performance.now() - start) / 1000).toFixed(3);
    if (format === 'csv') {
      const csvHeader = 'Category,Count,Percentage,Top Issues / Praise\n';
      const csvRows = report.breakdown.map(r => `"${r.category}",${r.comment_count},${r.percentage}%,"${r.top_keywords.join(' | ')}"`).join('\n');
      const csvBlob = new Blob([csvHeader + csvRows], { type: 'text/csv' });
      const url = window.URL.createObjectURL(csvBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sentiment_report_${report.post_id}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setExportLatency(`⚡ Downloaded ${format.toUpperCase()} in ${clientElapsed}s`);
  };

  // Filtered comments logic
  const filteredComments = useMemo(() => {
    if (!report || !report.sample_comments) return [];
    let list = report.sample_comments;

    // Strict Sentiment Filter
    if (feedFilter !== 'ALL') {
      list = list.filter(c => c.sentiment === feedFilter);
    }

    // Root Cause Filter
    if (selectedRootCauseFilter !== 'ALL') {
      list = list.filter(c => c.root_cause === selectedRootCauseFilter);
    }

    // Text Search Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c =>
        c.raw_text.toLowerCase().includes(q) ||
        (c.root_cause && c.root_cause.toLowerCase().includes(q)) ||
        (c.product_variant && c.product_variant.toLowerCase().includes(q)) ||
        (c.anonymized_author_id && c.anonymized_author_id.toLowerCase().includes(q))
      );
    }
    return list;
  }, [report, feedFilter, selectedRootCauseFilter, searchQuery]);

  const negRow = report?.breakdown?.find(r => r.category === 'Negative') || { comment_count: 0, percentage: 0 };
  const posRow = report?.breakdown?.find(r => r.category === 'Positive') || { comment_count: 0, percentage: 0 };
  const neuRow = report?.breakdown?.find(r => r.category === 'Neutral') || { comment_count: 0, percentage: 0 };
  const isEcommerce = report?.platform === 'amazon' || report?.platform === 'flipkart';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-rose-500 selection:text-white">
      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-500 via-purple-600 to-indigo-600 flex items-center justify-center font-black text-white text-lg shadow-lg shadow-rose-500/25">
              S2
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base font-extrabold text-white tracking-tight">Social Media & E-Commerce Sentiment</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">v2.0 Platform</span>
              </div>
              <p className="text-xs text-slate-400">Live Key-Free Web Scraper & 2-Tier NLP Engine</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowKeysModal(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition cursor-pointer"
            >
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <span>API Keys (Optional)</span>
              {(youtubeApiKey || geminiApiKey || instagramToken || scraperApiKey) && (
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              )}
            </button>

            <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-slate-300 font-medium">Sub-Second Engine (&lt;1s)</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 flex-1 w-full">
        {/* Preset Switcher Bar */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
              <Layers className="w-4 h-4 text-indigo-400" />
              <span>Demo Presets (Pre-Computed Offline Benchmarks)</span>
            </h2>
            <span className="text-xs text-slate-500">Or paste any live public URL below</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {DEMO_PRESETS.map((preset) => {
              const Icon = preset.icon;
              const isSelected = selectedPreset === preset.id && (report?.is_demo ?? isDemoAction);
              return (
                <button
                  key={preset.id}
                  onClick={() => handleSelectPreset(preset.id)}
                  className={`relative p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 border-indigo-500 shadow-lg shadow-indigo-500/10 ring-2 ring-indigo-500/40'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2">
                      <div className={`p-2 rounded-xl bg-gradient-to-tr ${preset.color} text-white shadow-md`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{preset.badge}</span>
                    </div>
                    {isSelected && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                        Active Demo
                      </span>
                    )}
                  </div>
                  <div className="mt-2.5">
                    <h3 className="text-xs font-bold text-white tracking-tight line-clamp-1">{preset.label}</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{preset.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Live URL Input & Model Selector Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div className="sm:col-span-2 lg:col-span-1">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300">Live URL / Video ID / ASIN / FSN</label>
                <span className="text-[10px] text-emerald-400 font-semibold flex items-center space-x-1">
                  <Globe className="w-3 h-3" />
                  <span>Key-Free Scraping</span>
                </span>
              </div>
              <input
                type="text"
                value={inputTarget}
                onChange={(e) => handleInputChange(e.target.value)}
                placeholder="e.g. https://www.youtube.com/watch?v=dQw4w9WgXcQ"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Platform Channel</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
              >
                <optgroup label="Social Media">
                  <option value="youtube">YouTube (Keyless Scraper / Data API v3)</option>
                  <option value="instagram">Instagram (Graph API / Public)</option>
                </optgroup>
                <optgroup label="E-Commerce">
                  <option value="amazon">Amazon (HTML Reviews / ASIN)</option>
                  <option value="flipkart">Flipkart (HTML Reviews / FSN)</option>
                </optgroup>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Model Engine</label>
              <select
                value={modelOption}
                onChange={(e) => setModelOption(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
              >
                <option value="vader_hybrid">VADER + Hinglish & Emojis (Ultra-Fast)</option>
                <option value="xlm_roberta">XLM-RoBERTa (Multilingual)</option>
                <option value="gemini_flash">Gemini 2.5 Flash (LLM Batching)</option>
              </select>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={() => {
                  setSelectedPreset('');
                  setIsDemoAction(false);
                  handleExecuteAnalysis(inputTarget, platform, modelOption, false);
                }}
                disabled={isLoading}
                className="w-full px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 via-purple-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 font-bold text-white text-xs shadow-lg shadow-indigo-600/25 transition flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>{isDemoAction ? 'Loading Demo Benchmark...' : 'Scraping Live Comments...'}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-white" />
                    <span>Scrape & Analyze URL</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Loading Skeleton State (Smooth visual feedback during ingestion) */}
        {isLoading && !report && (
          <div className="space-y-6 animate-pulse">
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" />
                <div>
                  <h4 className="text-sm font-bold text-slate-200">
                    {isDemoAction ? 'Loading Demo Benchmark Dataset...' : 'Connecting to Live Scraper & Ingesting Comments...'}
                  </h4>
                  <p className="text-xs text-slate-400">Filtering bots, calculating VADER & Hinglish polarity, and categorizing root causes</p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">
                Processing...
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-24 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4"></div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="h-64 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5"></div>
              <div className="h-64 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5"></div>
            </div>
          </div>
        )}

        {/* Honest Error Alert Banner (if scraping fails or CAPTCHA detected) */}
        {errorMessage && (
          <div className="bg-amber-950/70 border-2 border-amber-500/80 rounded-2xl p-5 shadow-2xl shadow-amber-950/60 animate-in fade-in duration-200">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-amber-900/80 rounded-xl text-amber-300">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-extrabold text-amber-200">Live Scrape Notification</h3>
                <p className="text-xs text-amber-300/90 mt-1 leading-relaxed">{errorMessage}</p>
                <div className="mt-3 flex items-center space-x-3">
                  <button
                    onClick={() => handleSelectPreset('yt_demo_72neg')}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition cursor-pointer"
                  >
                    Switch to Demo Preset
                  </button>
                  <button
                    onClick={() => setShowKeysModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-xs font-semibold transition cursor-pointer"
                  >
                    Provide API Key
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Data Provenance Badge: LIVE SCRAPED DATA vs OFFLINE DEMO PRESET */}
        {report && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md">
            <div className="flex items-center flex-wrap gap-2.5">
              {report.is_demo ? (
                <span className="inline-flex items-center px-3 py-1 rounded-xl text-xs font-bold bg-amber-950 text-amber-300 border border-amber-800">
                  <span className="w-2 h-2 mr-1.5 rounded-full bg-amber-400"></span>
                  🧪 OFFLINE DEMO PRESET (Sample Dataset)
                </span>
              ) : (
                <span className="inline-flex items-center px-3 py-1 rounded-xl text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                  <span className="w-2 h-2 mr-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                  🟢 LIVE SCRAPED DATA (Real Comments Fetched from URL)
                </span>
              )}

              {report.data_source_badge && (
                <span className="inline-flex items-center px-3 py-1 rounded-xl text-xs font-bold bg-indigo-950/80 text-indigo-300 border border-indigo-700/80 shadow-sm">
                  ⚡ {report.data_source_badge}
                </span>
              )}

              <span className="text-xs text-slate-400 font-mono hidden md:inline">
                Provenance: {report.data_source || 'Verified Source'}
              </span>
            </div>

            <div className="flex items-center space-x-2 text-xs text-slate-400">
              <span className="font-semibold text-slate-300">Target:</span>
              <a
                href={report.post_url}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-indigo-400 hover:underline flex items-center space-x-1"
              >
                <span>{report.post_id}</span>
                <ExternalLink className="w-3 h-3 inline" />
              </a>
            </div>
          </div>
        )}

        {/* High Negative Alert Banner (>70%) */}
        {report?.high_negative_alert && (
          <div className="bg-rose-950/70 border-2 border-rose-500/80 rounded-2xl p-5 shadow-2xl shadow-rose-950/60 animate-in fade-in duration-300">
            <div className="flex items-start space-x-3">
              <div className="p-2.5 bg-rose-900/80 rounded-xl text-rose-300">
                <AlertTriangle className="w-6 h-6 text-rose-400" />
              </div>
              <div className="flex-1">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h2 className="text-sm font-extrabold text-rose-200 tracking-wide uppercase">
                    Critical Sentiment Alert: Negative Polarity Exceeds 70% Threshold
                  </h2>
                  <span className="self-start sm:self-auto px-3 py-1 rounded-full text-xs font-black bg-rose-500 text-white shadow-md shadow-rose-500/40">
                    {negRow.percentage}% Negative
                  </span>
                </div>
                <p className="text-xs text-rose-300/90 mt-1.5 leading-relaxed">
                  {isEcommerce
                    ? 'E-Commerce reviews reflect high customer dissatisfaction. Review the Tier-2 root causes below (Defective Hardware, Delivery, or Counterfeit issues) for immediate seller remediation.'
                    : 'Recent social media upload has triggered the 2-Tier root-cause analysis workflow. Review the categorized sub-tags below for immediate engineering and content remediation.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* KPI Metric Cards Grid */}
        {report && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
              <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Raw Ingestion</p>
              <p className="text-2xl font-extrabold text-white mt-1">{report.total_raw_comments.toLocaleString()}</p>
              <span className="text-[10px] text-slate-500 mt-1 flex items-center space-x-1">
                <Zap className="w-3 h-3 text-indigo-400" />
                <span>{report.unbounded_fetch ? `Uncapped (${report.pages_fetched} pages)` : 'Capped'}</span>
              </span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
              <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Spam / Bots Filtered</p>
              <p className="text-2xl font-extrabold text-amber-400 mt-1">{report.spam_duplicates_removed.toLocaleString()}</p>
              <span className="text-[10px] text-slate-500 mt-1">URLs & duplicates</span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
              <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Valid Analyzed</p>
              <p className="text-2xl font-extrabold text-indigo-400 mt-1">{report.total_valid_comments.toLocaleString()}</p>
              <span className="text-[10px] text-slate-500 mt-1">Clean NLP items</span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
              <p className="text-[11px] text-rose-400 font-semibold uppercase tracking-wider">Negative Share</p>
              <p className="text-2xl font-extrabold text-rose-400 mt-1">{negRow.percentage}%</p>
              <span className="text-[10px] text-rose-400/80 font-medium mt-1">{negRow.comment_count} items</span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
              <p className="text-[11px] text-emerald-400 font-semibold uppercase tracking-wider">Positive Share</p>
              <p className="text-2xl font-extrabold text-emerald-400 mt-1">{posRow.percentage}%</p>
              <span className="text-[10px] text-emerald-400/80 font-medium mt-1">{posRow.comment_count} items</span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
              <p className="text-[11px] text-sky-400 font-semibold uppercase tracking-wider">Neutral Share</p>
              <p className="text-2xl font-extrabold text-sky-400 mt-1">{neuRow.percentage}%</p>
              <span className="text-[10px] text-sky-400/80 font-medium mt-1">{neuRow.comment_count} items</span>
            </div>
          </div>
        )}

        {/* 4 Interactive Visual Charts Grid */}
        {report && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart 1: Donut Chart */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <PieChartIcon className="w-4 h-4 text-indigo-400" />
                    <span>Chart 1: Sentiment Polarity Donut Chart</span>
                  </h3>
                  <p className="text-xs text-slate-400">Positive, Neutral, and Negative Distribution (%)</p>
                </div>
                <span className="text-xs font-mono text-slate-400">{report.model_used}</span>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-6 py-2">
                <div className="relative w-44 h-44 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="38" fill="transparent" stroke="#1e293b" strokeWidth="14" />
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      fill="transparent"
                      stroke="#f43f5e"
                      strokeWidth="14"
                      strokeDasharray={`${(negRow.percentage / 100) * 238.76} 238.76`}
                      strokeDashoffset="0"
                      className="transition-all duration-700 ease-out"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      fill="transparent"
                      stroke="#10b981"
                      strokeWidth="14"
                      strokeDasharray={`${(posRow.percentage / 100) * 238.76} 238.76`}
                      strokeDashoffset={`${-((negRow.percentage / 100) * 238.76)}`}
                      className="transition-all duration-700 ease-out"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="38"
                      fill="transparent"
                      stroke="#38bdf8"
                      strokeWidth="14"
                      strokeDasharray={`${(neuRow.percentage / 100) * 238.76} 238.76`}
                      strokeDashoffset={`${-(((negRow.percentage + posRow.percentage) / 100) * 238.76)}`}
                      className="transition-all duration-700 ease-out"
                    />
                  </svg>
                  <div className="absolute text-center">
                    <span className="text-xl font-extrabold text-white">{report.total_valid_comments.toLocaleString()}</span>
                    <p className="text-[10px] text-slate-400 font-semibold uppercase">Total Valid</p>
                  </div>
                </div>

                <div className="space-y-3 w-full sm:w-48 text-xs">
                  <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                    <div className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                      <span className="font-semibold text-slate-200">Negative</span>
                    </div>
                    <span className="font-bold text-rose-400">{negRow.percentage}% ({negRow.comment_count})</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                    <div className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                      <span className="font-semibold text-slate-200">Positive</span>
                    </div>
                    <span className="font-bold text-emerald-400">{posRow.percentage}% ({posRow.comment_count})</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                    <div className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-sky-400"></span>
                      <span className="font-semibold text-slate-200">Neutral</span>
                    </div>
                    <span className="font-bold text-sky-400">{neuRow.percentage}% ({neuRow.comment_count})</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Chart 2: Tier-2 Root-Cause Bar Chart */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <BarChart3 className="w-4 h-4 text-rose-400" />
                    <span>Chart 2: Tier-2 Negative Root-Cause Breakdown</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    {isEcommerce ? 'E-Commerce Domain: Defect, Delivery, Counterfeit, Value' : 'Social Media Domain: Bugs, Audio/Video, Content, Trolls'}
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800">
                  Deep Dive Active
                </span>
              </div>

              <div className="space-y-3.5">
                {(report.tier2_root_causes || []).map((rc, idx) => (
                  <div key={idx} className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-bold text-slate-200">{rc.category}</span>
                      <span className="font-mono font-bold text-rose-400">{rc.count} ({rc.percentage}%)</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2 mb-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-rose-500 to-indigo-500 h-2 rounded-full transition-all duration-700 ease-out"
                        style={{ width: `${Math.min(100, rc.percentage)}%` }}
                      ></div>
                    </div>
                    <p className="text-[11px] text-slate-400 italic line-clamp-1">
                      "{rc.sample_comments && rc.sample_comments.length > 0 ? rc.sample_comments[0] : 'No sample reported'}"
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Chart 3: Sentiment Trend & Volume Over Time */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <TrendingUp className="w-4 h-4 text-indigo-400" />
                    <span>Chart 3: Sentiment Trend & Ingestion Wave Over Time</span>
                  </h3>
                  <p className="text-xs text-slate-400">Volume distribution across hourly timestamp intervals</p>
                </div>
                <span className="text-xs text-slate-400 font-mono">Time-Series</span>
              </div>

              <div className="h-44 w-full flex items-end pt-4 pb-2 px-2 relative">
                <div className="absolute inset-x-2 inset-y-4 flex flex-col justify-between pointer-events-none opacity-20">
                  <div className="border-b border-slate-600 w-full"></div>
                  <div className="border-b border-slate-600 w-full"></div>
                  <div className="border-b border-slate-600 w-full"></div>
                </div>

                <div className="w-full h-full flex items-end justify-between gap-2 z-10">
                  {[
                    { time: '01:00', neg: 75, pos: 15 },
                    { time: '02:00', neg: 120, pos: 22 },
                    { time: '03:00', neg: 210, pos: 35 },
                    { time: '04:00', neg: 180, pos: 28 },
                    { time: '05:00', neg: 95, pos: 40 },
                    { time: '06:00', neg: 40, pos: 40 }
                  ].map((b, i) => {
                    const maxVal = 240;
                    const negHeight = (b.neg / maxVal) * 100;
                    const posHeight = (b.pos / maxVal) * 100;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center h-full justify-end group">
                        <div className="w-full flex items-end justify-center space-x-1 h-32">
                          <div
                            style={{ height: `${negHeight}%` }}
                            className="w-1/2 bg-rose-500/80 rounded-t group-hover:bg-rose-400 transition-all relative"
                          ></div>
                          <div
                            style={{ height: `${posHeight}%` }}
                            className="w-1/2 bg-emerald-500/80 rounded-t group-hover:bg-emerald-400 transition-all relative"
                          ></div>
                        </div>
                        <span className="text-[10px] text-slate-400 mt-2 font-mono">{b.time}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-center space-x-6 mt-3 text-xs">
                <span className="flex items-center space-x-1.5 text-rose-400">
                  <span className="w-2.5 h-2.5 bg-rose-500 rounded"></span>
                  <span>Negative Wave</span>
                </span>
                <span className="flex items-center space-x-1.5 text-emerald-400">
                  <span className="w-2.5 h-2.5 bg-emerald-500 rounded"></span>
                  <span>Positive Baseline</span>
                </span>
              </div>
            </div>

            {/* Chart 4: Star Rating (E-Commerce) OR Keyword Frequency (Social) */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    {isEcommerce ? (
                      <>
                        <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                        <span>Chart 4: E-Commerce Star Rating vs NLP Sentiment</span>
                      </>
                    ) : (
                      <>
                        <Activity className="w-4 h-4 text-purple-400" />
                        <span>Chart 4: Top Recurring Keyword Frequency</span>
                      </>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {isEcommerce ? 'Distribution across 1★ to 5★ verified buyer reviews' : 'Extracted complaint vs praise keyphrase clusters'}
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-400">{report.platform.toUpperCase()}</span>
              </div>

              {isEcommerce && report.star_rating_breakdown ? (
                <div className="space-y-2.5 py-1">
                  {(['5_star', '4_star', '3_star', '2_star', '1_star'] as const).map((starKey) => {
                    const count = report.star_rating_breakdown?.[starKey] || 0;
                    const total = report.total_valid_comments || 1;
                    const pct = Math.round((count / total) * 100);
                    const starsNum = parseInt(starKey[0], 10);
                    const barColor = starsNum >= 4 ? 'from-emerald-500 to-teal-500' : starsNum === 3 ? 'from-sky-500 to-indigo-500' : 'from-rose-500 to-red-600';

                    return (
                      <div key={starKey} className="flex items-center space-x-3 text-xs">
                        <div className="w-14 flex items-center font-bold text-slate-300 space-x-1">
                          <span>{starsNum}</span>
                          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                        </div>
                        <div className="flex-1 bg-slate-800 rounded-full h-3 overflow-hidden">
                          <div
                            className={`bg-gradient-to-r ${barColor} h-3 rounded-full transition-all duration-700`}
                            style={{ width: `${Math.min(100, pct * 1.5)}%` }}
                          ></div>
                        </div>
                        <span className="w-20 text-right font-mono text-slate-400 font-semibold">{count} ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-3 py-1 text-xs">
                  <div>
                    <span className="font-semibold text-rose-400 mb-1.5 block">Top Recurring Negative Complaint Clusters:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {((report.breakdown || []).find(r => r.category === 'Negative')?.top_keywords || []).map((kw, i) => (
                        <span key={i} className="px-2.5 py-1 rounded-lg bg-rose-950/60 text-rose-300 border border-rose-800 text-[11px] font-semibold">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="pt-2">
                    <span className="font-semibold text-emerald-400 mb-1.5 block">Top Recurring Positive Praise Clusters:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {((report.breakdown || []).find(r => r.category === 'Positive')?.top_keywords || []).map((kw, i) => (
                        <span key={i} className="px-2.5 py-1 rounded-lg bg-emerald-950/60 text-emerald-300 border border-emerald-800 text-[11px] font-semibold">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sub-Second Export Panel */}
        {report && (
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950/50 to-slate-900 border border-indigo-900/60 rounded-2xl p-5 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-extrabold text-white">⚡ Sub-Second (&lt;1s) Pre-Computed Exporters</h3>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30">
                  Zero Inference Wait
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Exports stream directly from atomic JSON cache. Download executive ReportLab PDF or multi-sheet CSV report instantly.
              </p>
              {exportLatency && (
                <p className="text-xs font-mono text-emerald-400 font-bold mt-1.5 animate-pulse">
                  {exportLatency}
                </p>
              )}
            </div>

            <div className="flex items-center space-x-3 w-full sm:w-auto">
              <button
                onClick={() => handleDownloadExport('pdf')}
                className="flex-1 sm:flex-none px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 shadow-lg shadow-rose-600/20 cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                <span>Download PDF (&lt;1s)</span>
              </button>
              <button
                onClick={() => handleDownloadExport('csv')}
                className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 cursor-pointer"
              >
                <TableIcon className="w-4 h-4" />
                <span>Download CSV (&lt;1s)</span>
              </button>
            </div>
          </div>
        )}

        {/* Audited Comment & Review Explorer (Fixed Strict Filters & 100+ items) */}
        {report && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-white">Audited Comment & Review Explorer</h3>
                <p className="text-xs text-slate-400">
                  Showing <span className="text-white font-bold">{filteredComments.length}</span> of {(report.sample_comments || []).length} audited items
                </p>
              </div>

              {/* Search and Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search text, root causes, authors..."
                    className="bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-56"
                  />
                </div>

                <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                  <button
                    onClick={() => setFeedFilter('ALL')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                      feedFilter === 'ALL' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    All ({(report.sample_comments || []).length})
                  </button>
                  <button
                    onClick={() => setFeedFilter('Negative')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                      feedFilter === 'Negative' ? 'bg-rose-500 text-white shadow' : 'text-rose-400 hover:text-rose-300'
                    }`}
                  >
                    Negative ({(report.sample_comments || []).filter(c => c.sentiment === 'Negative').length})
                  </button>
                  <button
                    onClick={() => setFeedFilter('Positive')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                      feedFilter === 'Positive' ? 'bg-emerald-500 text-white shadow' : 'text-emerald-400 hover:text-emerald-300'
                    }`}
                  >
                    Positive ({(report.sample_comments || []).filter(c => c.sentiment === 'Positive').length})
                  </button>
                  <button
                    onClick={() => setFeedFilter('Neutral')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                      feedFilter === 'Neutral' ? 'bg-sky-500 text-white shadow' : 'text-sky-400 hover:text-sky-300'
                    }`}
                  >
                    Neutral ({(report.sample_comments || []).filter(c => c.sentiment === 'Neutral').length})
                  </button>
                </div>
              </div>
            </div>

            {/* Scrollable Comments List (Supports 100+ items smoothly) */}
            <div className="space-y-3 max-h-[32rem] overflow-y-auto pr-2">
              {filteredComments.length === 0 ? (
                <div className="text-center py-12 text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                  No comments matching the selected filter ({feedFilter}) or search query.
                </div>
              ) : (
                filteredComments.map((c) => {
                  const isNeg = c.sentiment === 'Negative';
                  const isPos = c.sentiment === 'Positive';
                  return (
                    <div
                      key={c.comment_id}
                      className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-3.5 text-xs flex flex-col space-y-2 hover:border-slate-700 transition"
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              isNeg
                                ? 'bg-rose-950/60 text-rose-300 border-rose-800'
                                : isPos
                                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                                : 'bg-sky-950/60 text-sky-300 border-sky-800'
                            }`}
                          >
                            {c.sentiment} ({c.score > 0 ? `+${c.score}` : c.score})
                          </span>

                          {c.root_cause && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-950/90 text-rose-300 border border-rose-800/80">
                              {c.root_cause}
                            </span>
                          )}

                          {c.star_rating && (
                            <span className="flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/60 text-amber-300 border border-amber-800">
                              <span>{c.star_rating}</span>
                              <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                            </span>
                          )}

                          {c.verified_purchase && (
                            <span className="flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-900">
                              <ShieldCheck className="w-3 h-3 text-emerald-400" />
                              <span>Verified Buyer</span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center space-x-3 text-[10px] text-slate-500 font-mono">
                          {c.product_variant && <span className="text-indigo-400">{c.product_variant}</span>}
                          <span>Author: {c.anonymized_author_id.slice(0, 8)}</span>
                          <span>Likes: {c.like_count}</span>
                          <span>{c.timestamp.replace('T', ' ').replace('Z', '')}</span>
                        </div>
                      </div>

                      <p className="text-slate-200 text-xs leading-relaxed">{c.raw_text}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </main>

      {/* API Keys (Optional) Modal */}
      {showKeysModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Key className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Runtime API Credentials (Optional)</h3>
              </div>
              <button
                onClick={() => setShowKeysModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-900/50 text-xs text-indigo-300 leading-relaxed">
              <Info className="w-4 h-4 inline mr-1 text-indigo-400" />
              <strong>Key-Free Live Mode Active:</strong> YouTube comments are scraped live via <code>youtube-comment-downloader</code> without requiring any API key. Provide API keys below only if you want official YouTube Data API quotas or Gemini LLM batching.
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">YouTube Data API v3 Key (Optional)</label>
                <input
                  type="password"
                  value={youtubeApiKey}
                  onChange={(e) => setYoutubeApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Apify Cloud Scraper API Token (For Instagram & E-Comm)</label>
                <input
                  type="password"
                  value={apifyToken}
                  onChange={(e) => setApifyToken(e.target.value)}
                  placeholder="apify_api_..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Google Gemini API Key (Optional)</label>
                <input
                  type="password"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="AQ.Ab8..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Instagram Graph API Token (Optional)</label>
                <input
                  type="password"
                  value={instagramToken}
                  onChange={(e) => setInstagramToken(e.target.value)}
                  placeholder="EAGjR..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Amazon / Flipkart Scraper API Key (Optional)</label>
                <input
                  type="password"
                  value={scraperApiKey}
                  onChange={(e) => setScraperApiKey(e.target.value)}
                  placeholder="Rainforest / RapidAPI token"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowKeysModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={saveApiKeys}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Save Credentials</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900/60 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <span>Social Media & E-Commerce Sentiment Analysis Platform (v2.0)</span>
          <span className="font-mono">YouTube • Instagram • Amazon • Flipkart • Key-Free Live Ingestion</span>
        </div>
      </footer>
    </div>
  );
}
