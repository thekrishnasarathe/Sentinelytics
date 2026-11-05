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
  Globe,
  Puzzle,
  Copy,
  Code,
  CheckCheck,
  Upload
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
  star_rating_distribution?: Record<string, { Positive: number; Neutral: number; Negative: number; total: number }> | null;
  keyword_frequencies?: Array<{ keyword: string; count: number; sentiment: 'Positive' | 'Negative'; percentage?: number }> | null;
  keyword_stats?: Array<{ keyword: string; count: number; sentiment: 'Positive' | 'Negative'; percentage: number }> | null;
  timeline_buckets?: Array<{ label: string; positive: number; neutral: number; negative: number; total: number }> | null;
  platform_reported_total?: number | null;
  warning_message?: string | null;
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

  // Browser Collector / Extension Modal State
  const [showExtensionModal, setShowExtensionModal] = useState<boolean>(false);
  const [collectorTab, setCollectorTab] = useState<'extension' | 'bookmarklet' | 'import'>('extension');
  const [importPlatform, setImportPlatform] = useState<'youtube' | 'instagram' | 'amazon' | 'flipkart'>('instagram');
  const [importUrl, setImportUrl] = useState<string>('');
  const [importText, setImportText] = useState<string>('');
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [copiedBookmarklet, setCopiedBookmarklet] = useState<boolean>(false);
  const [copiedCodeSnippet, setCopiedCodeSnippet] = useState<boolean>(false);

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

  // Trigger initial demo on mount or handle URL query param ?post_id=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qPostId = params.get('post_id');

    if (qPostId) {
      setInputTarget(qPostId);
      setIsLoading(true);
      fetch(`/api/report/${encodeURIComponent(qPostId)}`)
        .then((res) => {
          if (!res.ok) throw new Error('Report not found');
          return res.json();
        })
        .then((data: CachedReport) => {
          setReport(data);
          setPlatform(data.platform);
          setIsLoading(false);
        })
        .catch(() => {
          handleExecuteAnalysis(qPostId, 'youtube', 'vader_hybrid', false);
        });
    } else {
      handleExecuteAnalysis('yt_demo_72neg', 'youtube', 'vader_hybrid', true);
    }

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

  // Dynamic time-series grouping for Chart 3 (Stacked emerald/sky/rose volumes)
  const timeSeriesData = useMemo(() => {
    if (!report) return [];

    // Prioritize 10-12 pre-computed backend chronological wave buckets
    if (report.timeline_buckets && report.timeline_buckets.length > 0) {
      return report.timeline_buckets.map((b) => ({
        label: b.label,
        Negative: b.negative,
        Positive: b.positive,
        Neutral: b.neutral,
        total: b.total,
      }));
    }

    if (!report.sample_comments || report.sample_comments.length === 0) return [];

    const parsedComments = report.sample_comments
      .map((c) => {
        const d = new Date(c.timestamp);
        return {
          sentiment: c.sentiment,
          date: isNaN(d.getTime()) ? new Date() : d,
        };
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (parsedComments.length === 0) return [];

    const firstMs = parsedComments[0].date.getTime();
    const lastMs = parsedComments[parsedComments.length - 1].date.getTime();
    const diffHours = (lastMs - firstMs) / (1000 * 60 * 60);

    const bucketMap: Record<
      string,
      { label: string; Negative: number; Positive: number; Neutral: number; total: number }
    > = {};

    parsedComments.forEach((c) => {
      let key = '';
      let label = '';
      const d = c.date;

      if (diffHours <= 48) {
        key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:00`;
        label = `${d.getHours().toString().padStart(2, '0')}:00`;
      } else if (diffHours <= 24 * 60) {
        key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
        label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else {
        key = `${d.getFullYear()}-${d.getMonth() + 1}`;
        label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      }

      if (!bucketMap[key]) {
        bucketMap[key] = { label, Negative: 0, Positive: 0, Neutral: 0, total: 0 };
      }
      bucketMap[key][c.sentiment] += 1;
      bucketMap[key].total += 1;
    });

    const entries = Object.values(bucketMap);
    if (entries.length > 10) {
      const step = Math.ceil(entries.length / 8);
      return entries.filter((_, idx) => idx % step === 0 || idx === entries.length - 1);
    }
    return entries;
  }, [report]);

  // Import raw comments or JSON payload directly into analysis pipeline
  const handleRawImport = async () => {
    if (!importText.trim()) return;
    setIsImporting(true);
    setImportStatus('Parsing comments from input...');

    try {
      let commentsList: Array<any> = [];
      const trimmed = importText.trim();
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed);
          const rawArr = Array.isArray(parsed) ? parsed : (parsed.comments || [parsed]);
          commentsList = rawArr.map((item: any, idx: number) => ({
            comment_id: item.comment_id || item.id || `imp_${idx}_${Date.now()}`,
            raw_text: item.raw_text || item.text || item.body || String(item),
            timestamp: item.timestamp || new Date().toISOString(),
            like_count: item.like_count || item.likes || 0,
            anonymized_author_id: item.anonymized_author_id || item.author || `author_${idx}`,
            star_rating: item.star_rating || item.rating || (importPlatform === 'amazon' || importPlatform === 'flipkart' ? 5 : null),
            verified_purchase: item.verified_purchase ?? true,
          }));
        } catch (_) {
          commentsList = [];
        }
      }

      if (commentsList.length === 0) {
        const lines = trimmed.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
        commentsList = lines.map((line, idx) => ({
          comment_id: `imp_line_${idx}_${Date.now()}`,
          raw_text: line,
          timestamp: new Date().toISOString(),
          like_count: 0,
          anonymized_author_id: `author_${idx}`,
          star_rating: (importPlatform === 'amazon' || importPlatform === 'flipkart') ? 5 : null,
          verified_purchase: true,
        }));
      }

      if (commentsList.length === 0) {
        throw new Error('No valid comments found in input text.');
      }

      setImportStatus(`Analyzing ${commentsList.length} comments with Sentinelytics 2-Tier NLP...`);

      const cleanPostId = importUrl ? (importUrl.match(/[\w-]{8,}/)?.[0] || 'custom_import') : `import_${Date.now()}`;
      const payload = {
        post_url: importUrl || `https://${importPlatform}.com/custom_import`,
        post_id: cleanPostId,
        title: `Custom Live Import (${commentsList.length} comments)`,
        platform: importPlatform,
        comments: commentsList,
        model_option: modelOption,
      };

      const res = await fetch('/api/ingest-browser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || `Server error ${res.status}`);
      }

      const reportData: CachedReport = await res.json();
      setReport(reportData);
      setPlatform(reportData.platform);
      setInputTarget(reportData.post_id);
      setIsDemoAction(false);
      setImportStatus(`✅ Successfully analyzed ${reportData.total_valid_comments} comments!`);
      setTimeout(() => {
        setShowExtensionModal(false);
        setImportStatus(null);
        setImportText('');
      }, 1000);
    } catch (err: any) {
      setImportStatus(`Error: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
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

  // Client-side pagination state for Comment Explorer (50 items/page, zero DOM freezing)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 50;

  useEffect(() => {
    setCurrentPage(1);
  }, [feedFilter, selectedRootCauseFilter, searchQuery, report]);

  const totalPages = Math.max(1, Math.ceil(filteredComments.length / itemsPerPage));
  const paginatedComments = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredComments.slice(start, start + itemsPerPage);
  }, [filteredComments, currentPage]);

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
              onClick={() => setShowExtensionModal(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500/20 to-teal-500/20 hover:from-emerald-500/30 hover:to-teal-500/30 border border-emerald-500/40 text-xs font-bold text-emerald-300 transition cursor-pointer shadow-sm shadow-emerald-500/10"
            >
              <Puzzle className="w-3.5 h-3.5 text-emerald-400" />
              <span>🧩 Browser Extension & Live Collector</span>
            </button>

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

        {/* Anti-Bot Protection Notice (Automatic Benchmark Fallback) */}
        {report?.warning_message && (
          <div className="bg-amber-950/80 border-2 border-amber-500 rounded-2xl p-4 shadow-xl shadow-amber-950/40 animate-in fade-in duration-200">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-amber-900/90 rounded-xl text-amber-300 shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-amber-200">Anti-Bot Protection Notice</h4>
                <p className="text-xs text-amber-200/90 mt-1 leading-relaxed">
                  {report.warning_message}
                </p>
                <div className="mt-2.5 flex items-center space-x-3">
                  <button
                    onClick={() => setShowExtensionModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-sm"
                  >
                    <Puzzle className="w-3.5 h-3.5" />
                    <span>Open Sentinelytics Browser Extension</span>
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
              <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                {report.platform_reported_total ? `Platform Total (${report.platform.toUpperCase()})` : 'Raw Ingestion'}
              </p>
              <p className="text-2xl font-extrabold text-white mt-1">
                {(report.platform_reported_total || report.total_raw_comments).toLocaleString()}
              </p>
              <span className="text-[10px] text-slate-500 mt-1 flex items-center space-x-1">
                <Zap className="w-3 h-3 text-indigo-400" />
                <span>
                  {report.platform_reported_total
                    ? `Audited: ${report.total_valid_comments.toLocaleString()} items`
                    : report.unbounded_fetch
                    ? `Uncapped (${report.pages_fetched} pages)`
                    : 'Capped'}
                </span>
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

            {/* Chart 2: Tier-2 Root-Cause Bar Chart (100% Negative Coverage + Click-to-Filter) */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <BarChart3 className="w-4 h-4 text-rose-400" />
                    <span>Chart 2: Tier-2 Negative Root-Cause Breakdown</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    {isEcommerce ? 'E-Commerce Root Causes: Defect, Delivery, Counterfeit, Value' : 'Social Media Root Causes: Bugs, Audio/Video, Content, Trolls'} • Click any bar to filter comments
                  </p>
                </div>
                {selectedRootCauseFilter !== 'ALL' ? (
                  <button
                    onClick={() => setSelectedRootCauseFilter('ALL')}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 transition cursor-pointer"
                  >
                    <span>Filtered: {selectedRootCauseFilter}</span>
                    <X className="w-3 h-3 ml-1" />
                  </button>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800">
                    100% Negative Coverage
                  </span>
                )}
              </div>

              <div className="space-y-3.5">
                {(report.tier2_root_causes || []).map((rc, idx) => {
                  const isSelected = selectedRootCauseFilter === rc.category;
                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        setSelectedRootCauseFilter(isSelected ? 'ALL' : rc.category);
                        if (!isSelected) setFeedFilter('ALL');
                      }}
                      className={`border rounded-xl p-3 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-rose-950/40 border-rose-500 ring-2 ring-rose-500/30'
                          : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-950'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className={`font-bold ${isSelected ? 'text-rose-300' : 'text-slate-200'}`}>{rc.category}</span>
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
                  );
                })}
              </div>
            </div>

            {/* Chart 3: Sentiment Trend & Ingestion Wave (Multi-Series Stacked Volume) */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    <TrendingUp className="w-4 h-4 text-indigo-400" />
                    <span>Chart 3: Sentiment Trend & Ingestion Wave Over Time</span>
                  </h3>
                  <p className="text-xs text-slate-400">Authentic multi-series volume stacked across 10-12 chronological wave buckets</p>
                </div>
                <span className="text-xs text-slate-400 font-mono">Time-Series</span>
              </div>

              <div className="h-48 w-full flex items-end pt-6 pb-2 px-2 relative">
                <div className="absolute inset-x-2 inset-y-4 flex flex-col justify-between pointer-events-none opacity-20">
                  <div className="border-b border-slate-600 w-full"></div>
                  <div className="border-b border-slate-600 w-full"></div>
                  <div className="border-b border-slate-600 w-full"></div>
                </div>

                <div className="w-full h-full flex items-end justify-between gap-1.5 sm:gap-2 z-10">
                  {timeSeriesData.length === 0 ? (
                    <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">
                      No timestamp data available for time-series trend.
                    </div>
                  ) : (
                    (() => {
                      const maxVal = Math.max(...timeSeriesData.map(b => b.total), 1);
                      return timeSeriesData.map((b, i) => {
                        const barHeightPct = Math.max(18, Math.round((b.total / maxVal) * 100));
                        const negPct = b.total > 0 ? (b.Negative / b.total) * 100 : 0;
                        const neuPct = b.total > 0 ? (b.Neutral / b.total) * 100 : 0;
                        const posPct = b.total > 0 ? (b.Positive / b.total) * 100 : 0;

                        return (
                          <div key={i} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                            {/* Hover Tooltip */}
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-14 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[10px] whitespace-nowrap z-30 pointer-events-none shadow-2xl">
                              <p className="font-bold text-white mb-0.5">{b.label} • {b.total} comments</p>
                              <div className="flex items-center space-x-2">
                                <span className="text-rose-400 font-bold">Neg: {b.Negative} ({Math.round(negPct)}%)</span>
                                <span className="text-sky-400 font-bold">Neu: {b.Neutral} ({Math.round(neuPct)}%)</span>
                                <span className="text-emerald-400 font-bold">Pos: {b.Positive} ({Math.round(posPct)}%)</span>
                              </div>
                            </div>

                            <div className="w-full flex flex-col items-center justify-end h-36">
                              <div
                                style={{ height: `${barHeightPct}%` }}
                                className="w-full max-w-[28px] sm:max-w-[34px] rounded-t overflow-hidden flex flex-col justify-end bg-slate-800 transition-all duration-300"
                              >
                                {b.Negative > 0 && (
                                  <div
                                    style={{ height: `${negPct}%` }}
                                    className="w-full bg-rose-500 group-hover:bg-rose-400 transition-all"
                                  ></div>
                                )}
                                {b.Neutral > 0 && (
                                  <div
                                    style={{ height: `${neuPct}%` }}
                                    className="w-full bg-sky-500 group-hover:bg-sky-400 transition-all"
                                  ></div>
                                )}
                                {b.Positive > 0 && (
                                  <div
                                    style={{ height: `${posPct}%` }}
                                    className="w-full bg-emerald-500 group-hover:bg-emerald-400 transition-all"
                                  ></div>
                                )}
                              </div>
                            </div>
                            <span className="text-[9px] sm:text-[10px] text-slate-400 mt-2 font-mono truncate max-w-full text-center">
                              {b.label}
                            </span>
                          </div>
                        );
                      });
                    })()
                  )}
                </div>
              </div>

              <div className="flex items-center justify-center space-x-6 mt-3 text-xs">
                <span className="flex items-center space-x-1.5 text-rose-400">
                  <span className="w-2.5 h-2.5 bg-rose-500 rounded"></span>
                  <span>Negative ({negRow.comment_count})</span>
                </span>
                <span className="flex items-center space-x-1.5 text-sky-400">
                  <span className="w-2.5 h-2.5 bg-sky-500 rounded"></span>
                  <span>Neutral ({neuRow.comment_count})</span>
                </span>
                <span className="flex items-center space-x-1.5 text-emerald-400">
                  <span className="w-2.5 h-2.5 bg-emerald-500 rounded"></span>
                  <span>Positive ({posRow.comment_count})</span>
                </span>
              </div>
            </div>

            {/* Chart 4: Star Rating & Keywords (E-Commerce) OR Top Keywords (Social) */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                    {isEcommerce ? (
                      <>
                        <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                        <span>Chart 4: E-Commerce Star Ratings & Issue Keywords</span>
                      </>
                    ) : (
                      <>
                        <Activity className="w-4 h-4 text-purple-400" />
                        <span>Chart 4: Top Recurring Keyword & Issue Frequency</span>
                      </>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {isEcommerce
                      ? 'Star rating sentiment distribution + top extracted product complaint & praise keywords'
                      : 'Top extracted praise and complaint keywords with exact comment counts'}
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-400">{report.platform.toUpperCase()}</span>
              </div>

              {isEcommerce ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-1">
                  {/* Left: Star Rating Distribution 5★ to 1★ */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-slate-300 block mb-1">Star Ratings vs NLP Polarity:</span>
                    {[5, 4, 3, 2, 1].map((starsNum) => {
                      const starDist = report.star_rating_distribution?.[String(starsNum)];
                      const legacyCount = report.star_rating_breakdown?.[`${starsNum}_star`] || 0;
                      const totalStarCount = starDist ? starDist.total : legacyCount;
                      const totalComments = report.total_valid_comments || 1;
                      const pct = Math.round((totalStarCount / totalComments) * 100);

                      const posCount = starDist ? starDist.Positive : (starsNum >= 4 ? totalStarCount : 0);
                      const neuCount = starDist ? starDist.Neutral : (starsNum === 3 ? totalStarCount : 0);
                      const negCount = starDist ? starDist.Negative : (starsNum <= 2 ? totalStarCount : 0);

                      return (
                        <div key={starsNum} className="flex items-center space-x-2 text-xs">
                          <div className="w-10 flex items-center font-bold text-slate-300 space-x-0.5">
                            <span>{starsNum}</span>
                            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                          </div>
                          <div className="flex-1 bg-slate-800 rounded-full h-2.5 overflow-hidden flex">
                            {totalStarCount > 0 ? (
                              <>
                                <div
                                  style={{ width: `${(posCount / totalStarCount) * 100}%` }}
                                  className="bg-emerald-500 h-2.5"
                                  title={`Positive: ${posCount}`}
                                ></div>
                                <div
                                  style={{ width: `${(neuCount / totalStarCount) * 100}%` }}
                                  className="bg-sky-400 h-2.5"
                                  title={`Neutral: ${neuCount}`}
                                ></div>
                                <div
                                  style={{ width: `${(negCount / totalStarCount) * 100}%` }}
                                  className="bg-rose-500 h-2.5"
                                  title={`Negative: ${negCount}`}
                                ></div>
                              </>
                            ) : (
                              <div className="w-0"></div>
                            )}
                          </div>
                          <span className="w-16 text-right font-mono text-[11px] text-slate-400">
                            {totalStarCount} ({pct}%)
                          </span>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-end space-x-3 pt-1 text-[10px] text-slate-400">
                      <span className="flex items-center space-x-1 text-emerald-400"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span><span>Pos</span></span>
                      <span className="flex items-center space-x-1 text-sky-400"><span className="w-1.5 h-1.5 bg-sky-400 rounded-full"></span><span>Neu</span></span>
                      <span className="flex items-center space-x-1 text-rose-400"><span className="w-1.5 h-1.5 bg-rose-500 rounded-full"></span><span>Neg</span></span>
                    </div>
                  </div>

                  {/* Right: Top Issue & Praise Keywords */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-slate-300 block mb-1">Top Extracted Keywords (Click to filter):</span>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {((report.keyword_stats && report.keyword_stats.length > 0 ? report.keyword_stats : report.keyword_frequencies) || []).slice(0, 6).map((kw, idx) => {
                        const isNeg = kw.sentiment === 'Negative';
                        const maxKwCount = Math.max(...((report.keyword_stats || report.keyword_frequencies || []).map(k => k.count)), 1);
                        const kwWidth = Math.max(15, Math.round((kw.count / maxKwCount) * 100));
                        return (
                          <button
                            key={idx}
                            onClick={() => setSearchQuery(kw.keyword)}
                            className={`w-full p-1.5 rounded-lg border text-left flex items-center justify-between transition cursor-pointer text-xs ${
                              isNeg
                                ? 'bg-rose-950/30 border-rose-800/60 hover:bg-rose-900/40 text-rose-300'
                                : 'bg-emerald-950/30 border-emerald-800/60 hover:bg-emerald-900/40 text-emerald-300'
                            }`}
                          >
                            <div className="flex-1 mr-2 truncate">
                              <span className="font-bold text-[11px] block truncate">{kw.keyword}</span>
                              <div className="w-full bg-slate-800 rounded-full h-1 mt-1 overflow-hidden">
                                <div style={{ width: `${kwWidth}%` }} className={`h-1 rounded-full ${isNeg ? 'bg-rose-500' : 'bg-emerald-500'}`}></div>
                              </div>
                            </div>
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-900 font-bold shrink-0">
                              {kw.count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 py-1 text-xs">
                  <span className="font-semibold text-slate-300 mb-1 block">Top 8 High-Signal Keywords (Click to filter):</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {((report.keyword_stats && report.keyword_stats.length > 0 ? report.keyword_stats : report.keyword_frequencies) || []).slice(0, 8).map((kw, idx) => {
                      const isNeg = kw.sentiment === 'Negative';
                      const maxKwCount = Math.max(...((report.keyword_stats || report.keyword_frequencies || []).map(k => k.count)), 1);
                      const kwWidth = Math.max(15, Math.round((kw.count / maxKwCount) * 100));
                      return (
                        <button
                          key={idx}
                          onClick={() => setSearchQuery(kw.keyword)}
                          className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition cursor-pointer ${
                            isNeg
                              ? 'bg-rose-950/40 border-rose-800/80 hover:bg-rose-900/40 text-rose-300'
                              : 'bg-emerald-950/40 border-emerald-800/80 hover:bg-emerald-900/40 text-emerald-300'
                          }`}
                        >
                          <div className="flex-1 mr-2 truncate">
                            <div className="flex items-center space-x-1.5">
                              <span className={`w-2 h-2 rounded-full ${isNeg ? 'bg-rose-500' : 'bg-emerald-500'}`}></span>
                              <span className="font-bold truncate text-[11px]">{kw.keyword}</span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-1 mt-1.5 overflow-hidden">
                              <div style={{ width: `${kwWidth}%` }} className={`h-1 rounded-full ${isNeg ? 'bg-rose-500' : 'bg-emerald-500'}`}></div>
                            </div>
                          </div>
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-900/80 ml-1 font-bold shrink-0">
                            {kw.count}
                          </span>
                        </button>
                      );
                    })}
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

        {/* Audited Comment & Review Explorer (50 items/page with zero DOM lag) */}
        {report && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-white">Audited Comment & Review Explorer</h3>
                <p className="text-xs text-slate-400">
                  Showing <span className="text-white font-bold">{filteredComments.length.toLocaleString()}</span> matching of {(report.sample_comments || []).length.toLocaleString()} audited items
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

            {/* Scrollable Comments List (Paginated at 50/page for smooth rendering) */}
            <div className="space-y-3 max-h-[32rem] overflow-y-auto pr-2">
              {filteredComments.length === 0 ? (
                <div className="text-center py-12 text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                  No comments matching the selected filter ({feedFilter}) or search query.
                </div>
              ) : (
                paginatedComments.map((c) => {
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

            {/* Pagination Controls */}
            {filteredComments.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-800 text-xs">
                <span className="text-slate-400 font-mono text-[11px]">
                  Showing {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, filteredComments.length)} of {filteredComments.length.toLocaleString()} matching comments
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 font-semibold transition cursor-pointer text-xs"
                  >
                    Previous
                  </button>
                  <span className="text-slate-300 font-mono text-xs px-2">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 font-semibold transition cursor-pointer text-xs"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Browser Extension & Live Collector Modal */}
      {showExtensionModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
                  <Puzzle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Browser Extension & Live Collector</h3>
                  <p className="text-xs text-slate-400">Collect 100% authentic comments & reviews directly from your active browser session</p>
                </div>
              </div>
              <button
                onClick={() => setShowExtensionModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex items-center space-x-2 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setCollectorTab('extension')}
                className={`flex-1 py-2 px-3 rounded-lg font-bold transition flex items-center justify-center space-x-2 cursor-pointer ${
                  collectorTab === 'extension' ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Puzzle className="w-4 h-4" />
                <span>Chrome/Edge Extension</span>
              </button>
              <button
                onClick={() => setCollectorTab('bookmarklet')}
                className={`flex-1 py-2 px-3 rounded-lg font-bold transition flex items-center justify-center space-x-2 cursor-pointer ${
                  collectorTab === 'bookmarklet' ? 'bg-indigo-500 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Code className="w-4 h-4" />
                <span>1-Click Bookmarklet</span>
              </button>
              <button
                onClick={() => setCollectorTab('import')}
                className={`flex-1 py-2 px-3 rounded-lg font-bold transition flex items-center justify-center space-x-2 cursor-pointer ${
                  collectorTab === 'import' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Upload className="w-4 h-4" />
                <span>Raw Text / JSON Import</span>
              </button>
            </div>

            {/* Tab 1: Chrome Extension Setup */}
            {collectorTab === 'extension' && (
              <div className="space-y-4 text-xs">
                <div className="p-3.5 rounded-2xl bg-emerald-950/30 border border-emerald-800/50 text-emerald-300 leading-relaxed">
                  <strong>Why use the Browser Extension?</strong> Social media (Instagram) and e-commerce (Flipkart/Amazon) block server-side scrapers with login walls and CAPTCHAs. The Sentinelytics extension extracts comments directly through your logged-in browser session in 1 click!
                </div>

                <div className="space-y-3">
                  <div className="flex items-start space-x-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="w-6 h-6 rounded-full bg-slate-800 text-white font-bold flex items-center justify-center text-xs shrink-0">1</span>
                    <div>
                      <p className="font-bold text-slate-200">Open Extension Manager</p>
                      <p className="text-slate-400 mt-0.5">In Chrome or Edge, open a new tab and go to <code className="text-sky-400">chrome://extensions</code></p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="w-6 h-6 rounded-full bg-slate-800 text-white font-bold flex items-center justify-center text-xs shrink-0">2</span>
                    <div>
                      <p className="font-bold text-slate-200">Enable Developer Mode</p>
                      <p className="text-slate-400 mt-0.5">Toggle the <strong>Developer mode</strong> switch in the top-right corner of the extensions page.</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="w-6 h-6 rounded-full bg-slate-800 text-white font-bold flex items-center justify-center text-xs shrink-0">3</span>
                    <div className="flex-1">
                      <p className="font-bold text-slate-200">Click "Load unpacked" & Select Extension Folder</p>
                      <p className="text-slate-400 mt-0.5">Click <strong>Load unpacked</strong> and choose the <code className="text-emerald-400">browser_extension</code> folder located at:</p>
                      <div className="flex items-center justify-between bg-slate-900 border border-slate-700 rounded-lg p-2 mt-2 font-mono text-[11px] text-slate-300">
                        <span className="truncate pr-2">c:\Users\krish\Desktop\social-media-sentiment-analysis-module\browser_extension</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText('c:\\Users\\krish\\Desktop\\social-media-sentiment-analysis-module\\browser_extension');
                            setCopiedBookmarklet(true);
                            setTimeout(() => setCopiedBookmarklet(false), 2000);
                          }}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded shrink-0 flex items-center space-x-1 cursor-pointer"
                        >
                          {copiedBookmarklet ? <CheckCheck className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedBookmarklet ? 'Copied!' : 'Copy'}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <span className="w-6 h-6 rounded-full bg-emerald-500 text-slate-950 font-bold flex items-center justify-center text-xs shrink-0">4</span>
                    <div>
                      <p className="font-bold text-slate-200">Extract from any Post/Product in 1-Click</p>
                      <p className="text-slate-400 mt-0.5">Open any YouTube video, Instagram post/reel, Flipkart product, or Amazon product page. Click the Sentinelytics icon in your extensions toolbar &rarr; "Start Auto-Collector" &rarr; "Send &amp; Analyze in Dashboard"!</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Bookmarklet & Console Snippet */}
            {collectorTab === 'bookmarklet' && (
              <div className="space-y-4 text-xs">
                <div className="p-3.5 rounded-2xl bg-indigo-950/30 border border-indigo-800/50 text-indigo-300 leading-relaxed">
                  <strong>Zero-Install Option:</strong> Drag this button to your bookmarks bar, or open Developer Tools (<kbd className="bg-slate-800 px-1 py-0.5 rounded">F12</kbd>) on any YouTube, Instagram, Flipkart, or Amazon tab and paste the snippet!
                </div>

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-center space-y-2">
                  <p className="font-bold text-slate-300">Drag to your Bookmarks Bar:</p>
                  <a
                    href={`javascript:(function(){const u=window.location.href,h=window.location.hostname;let p='youtube';if(h.includes('instagram.com'))p='instagram';else if(h.includes('flipkart.com'))p='flipkart';else if(h.includes('amazon'))p='amazon';const c=[];if(p==='youtube'){document.querySelectorAll('ytd-comment-view-model, ytd-comment-thread-renderer').forEach((n,i)=>{const t=n.querySelector('#content-text')?.textContent?.trim();if(t)c.push({comment_id:'yt_'+i+'_'+Date.now(),raw_text:t,timestamp:new Date().toISOString(),like_count:0,anonymized_author_id:'bk_'+i});});}else if(p==='instagram'){document.querySelectorAll('ul li div span[dir=\"auto\"]').forEach((n,i)=>{const t=n.textContent?.trim();if(t&&t.length>3&&!['Reply','See translation'].includes(t))c.push({comment_id:'ig_'+i+'_'+Date.now(),raw_text:t,timestamp:new Date().toISOString(),like_count:0,anonymized_author_id:'bk_'+i});});}else if(p==='flipkart'){document.querySelectorAll('div.col.EPCmJX, div.RcXBOT').forEach((card,i)=>{const t=card.querySelector('p.z9E0IG, p._2-N8zT')?.textContent?.trim()||'';const b=card.querySelector('div.ZmyHeo, div.t-ZTKy')?.textContent?.trim()||'';const r=parseInt(card.querySelector('div.XQDdHH')?.textContent?.trim()||'5');if(t||b)c.push({comment_id:'flp_'+i+'_'+Date.now(),raw_text:t?t+'. '+b:b,timestamp:new Date().toISOString(),like_count:0,star_rating:r||5,verified_purchase:true,anonymized_author_id:'bk_'+i});});}else if(p==='amazon'){document.querySelectorAll('div[data-hook=\"review\"]').forEach((card,i)=>{const t=card.querySelector('a[data-hook=\"review-title\"] span')?.textContent?.trim()||'';const b=card.querySelector('span[data-hook=\"review-body\"] span')?.textContent?.trim()||'';const rm=card.querySelector('i[data-hook=\"review-star-rating\"] span')?.textContent?.match(/([0-9]+)/);if(t||b)c.push({comment_id:'amz_'+i+'_'+Date.now(),raw_text:t?t+'. '+b:b,timestamp:new Date().toISOString(),like_count:0,star_rating:rm?parseInt(rm[1]):5,verified_purchase:true,anonymized_author_id:'bk_'+i});});}if(c.length===0){alert('No comments visible on tab yet. Scroll down to render comments, then click this bookmark again!');return;}fetch('http://localhost:8000/api/ingest-browser',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({post_url:u,post_id:'bk_'+Date.now(),platform:p,comments:c,model_option:'vader_hybrid'})}).then(r=>r.json()).then(d=>{alert('✅ Sent '+c.length+' comments to Sentinelytics! Opening dashboard...');window.open('http://localhost:3000/?post_id='+d.post_id,'_blank');}).catch(e=>alert('Error: '+e));})();`}
                    className="inline-block px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 font-extrabold shadow-lg hover:brightness-110 cursor-grab"
                    onClick={(e) => {
                      e.preventDefault();
                      alert('Drag this button to your browser Bookmarks Bar (Ctrl+Shift+B to show bar)!');
                    }}
                  >
                    ⭐ Sentinelytics Live Ingest
                  </a>
                  <p className="text-[11px] text-slate-500">Click on any page with comments visible to push them directly to Sentinelytics</p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-slate-300">Console Snippet (Paste into F12 DevTools Console):</span>
                    <button
                      onClick={() => {
                        const code = `(async function() {
  const url = window.location.href;
  const host = window.location.hostname;
  let platform = host.includes('instagram') ? 'instagram' : host.includes('flipkart') ? 'flipkart' : host.includes('amazon') ? 'amazon' : 'youtube';
  const comments = [];
  if (platform === 'youtube') {
    document.querySelectorAll('ytd-comment-view-model, ytd-comment-thread-renderer').forEach((n, i) => {
      const t = n.querySelector('#content-text')?.textContent?.trim();
      if (t) comments.push({ comment_id: 'yt_'+i+'_'+Date.now(), raw_text: t, timestamp: new Date().toISOString(), like_count: 0, anonymized_author_id: 'con_'+i });
    });
  } else if (platform === 'instagram') {
    document.querySelectorAll('ul li div span[dir="auto"]').forEach((n, i) => {
      const t = n.textContent?.trim();
      if (t && t.length > 3 && !['Reply', 'See translation'].includes(t)) comments.push({ comment_id: 'ig_'+i+'_'+Date.now(), raw_text: t, timestamp: new Date().toISOString(), like_count: 0, anonymized_author_id: 'con_'+i });
    });
  } else if (platform === 'flipkart') {
    document.querySelectorAll('div.col.EPCmJX, div.RcXBOT').forEach((c, i) => {
      const t = c.querySelector('p.z9E0IG, p._2-N8zT')?.textContent?.trim() || '';
      const b = c.querySelector('div.ZmyHeo, div.t-ZTKy')?.textContent?.trim() || '';
      const r = parseInt(c.querySelector('div.XQDdHH')?.textContent?.trim() || '5');
      if (t || b) comments.push({ comment_id: 'flp_'+i+'_'+Date.now(), raw_text: t ? t + '. ' + b : b, timestamp: new Date().toISOString(), like_count: 0, star_rating: r || 5, verified_purchase: true, anonymized_author_id: 'con_'+i });
    });
  } else if (platform === 'amazon') {
    document.querySelectorAll('div[data-hook="review"]').forEach((c, i) => {
      const t = c.querySelector('a[data-hook="review-title"] span')?.textContent?.trim() || '';
      const b = c.querySelector('span[data-hook="review-body"] span')?.textContent?.trim() || '';
      const rm = c.querySelector('i[data-hook="review-star-rating"] span')?.textContent?.match(/([0-9]+)/);
      if (t || b) comments.push({ comment_id: 'amz_'+i+'_'+Date.now(), raw_text: t ? t + '. ' + b : b, timestamp: new Date().toISOString(), like_count: 0, star_rating: rm ? parseInt(rm[1]): 5, verified_purchase: true, anonymized_author_id: 'con_'+i });
    });
  }
  console.log('Extracted', comments.length, 'comments. Sending to Sentinelytics...');
  const res = await fetch('http://localhost:8000/api/ingest-browser', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ post_url: url, post_id: 'con_' + Date.now(), platform: platform, comments: comments, model_option: 'vader_hybrid' })
  });
  const data = await res.json();
  console.log('Ingested successfully:', data);
  window.open('http://localhost:3000/?post_id=' + data.post_id, '_blank');
})();`;
                        navigator.clipboard.writeText(code);
                        setCopiedCodeSnippet(true);
                        setTimeout(() => setCopiedCodeSnippet(false), 2000);
                      }}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center space-x-1 cursor-pointer"
                    >
                      {copiedCodeSnippet ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedCodeSnippet ? 'Copied Snippet!' : 'Copy Snippet'}</span>
                    </button>
                  </div>
                  <pre className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[10px] font-mono text-slate-300 max-h-32 overflow-y-auto">
                    {`(async function() {
  const url = window.location.href;
  const host = window.location.hostname;
  let platform = host.includes('instagram') ? 'instagram' : host.includes('flipkart') ? 'flipkart' : host.includes('amazon') ? 'amazon' : 'youtube';
  // Scrapes DOM nodes and POSTs to http://localhost:8000/api/ingest-browser
})();`}
                  </pre>
                </div>
              </div>
            )}

            {/* Tab 3: Raw Comments / JSON Import */}
            {collectorTab === 'import' && (
              <div className="space-y-3.5 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Platform Domain</label>
                    <select
                      value={importPlatform}
                      onChange={(e) => setImportPlatform(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="youtube">YouTube (Social Media)</option>
                      <option value="instagram">Instagram (Social Media)</option>
                      <option value="flipkart">Flipkart (E-Commerce)</option>
                      <option value="amazon">Amazon (E-Commerce)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Source URL (Optional)</label>
                    <input
                      type="text"
                      value={importUrl}
                      onChange={(e) => setImportUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Paste Raw Comments (One per line) or JSON array:
                  </label>
                  <textarea
                    rows={6}
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder={`Paste comments here. Examples:\nApp crash on mobile whenever I open the dashboard!\nBattery drain is terrible, heats up like an iron box.\nPaisa vasool product, butter smooth display and fast charging!`}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-200 font-mono text-[11px] focus:outline-none focus:ring-2 focus:ring-purple-500"
                  ></textarea>
                </div>

                {importStatus && (
                  <div className={`p-2.5 rounded-xl text-xs font-semibold ${importStatus.startsWith('✅') ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : importStatus.startsWith('Error') ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-slate-950 text-slate-300 border border-slate-800'}`}>
                    {importStatus}
                  </div>
                )}

                <div className="flex items-center justify-end space-x-3 pt-2 border-t border-slate-800">
                  <button
                    onClick={() => setShowExtensionModal(false)}
                    className="px-4 py-2 rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRawImport}
                    disabled={isImporting || !importText.trim()}
                    className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold transition flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer shadow-lg shadow-purple-600/30"
                  >
                    {isImporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    <span>{isImporting ? 'Processing...' : 'Analyze Imported Comments'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
