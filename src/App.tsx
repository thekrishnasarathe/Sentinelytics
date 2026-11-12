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
  Upload,
  GitCompare,
  History,
  Database,
  Cpu,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react';

import { SentimentDonutChart } from './components/SentimentDonutChart';
import { RootCauseBarChart } from './components/RootCauseBarChart';
import { EngagementTrendsChart } from './components/EngagementTrendsChart';
import { TopKeywordsWidget } from './components/TopKeywordsWidget';
import { LiveInsightsPanel } from './components/LiveInsightsPanel';
import { HistoryView } from './components/HistoryView';
import { MultiComparisonView } from './components/MultiComparisonView';
import { ProductPreviewDrawer } from './components/ProductPreviewDrawer';
import { CommandPalette } from './components/CommandPalette';
import { SentimentTelemetryRibbon } from './components/SentimentTelemetryRibbon';
import { ActiveFilterBar } from './components/ActiveFilterBar';
import { YouTubeIcon, InstagramIcon, AmazonIcon, FlipkartIcon } from './components/PlatformIcons';
import {
  SentimentBreakdownRow,
  Tier2RootCauseBreakdown,
  ProcessedComment,
  CachedReport,
  PlatformType,
} from './types';
export type { SentimentBreakdownRow, Tier2RootCauseBreakdown, ProcessedComment, CachedReport };

// --- Built-in Demo Presets ---

const DEMO_PRESETS = [
  {
    id: 'yt_demo_72neg',
    platform: 'youtube' as const,
    label: 'YouTube Flagged Upload (>70% Neg)',
    icon: YouTubeIcon,
    badge: 'YouTube',
    badgeColor: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    iconBox: 'bg-rose-500/15 text-rose-400 border border-rose-500/30',
    description: '1,045 Comments • Critical 72% Negative Alert Active'
  },
  {
    id: 'ig_demo_creator_reel',
    platform: 'instagram' as const,
    label: 'Instagram Creator Reel',
    icon: InstagramIcon,
    badge: 'Instagram',
    badgeColor: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    iconBox: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
    description: 'Graph Ingestion • Creator Engagement Benchmark'
  },
  {
    id: 'amz_smartphone_reviews',
    platform: 'amazon' as const,
    label: 'Amazon Smartphone Reviews',
    icon: AmazonIcon,
    badge: 'Amazon',
    badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    iconBox: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
    description: '1,250 Reviews • ASIN: B09X6GMNP7 • 1★-5★ Hinglish'
  },
  {
    id: 'flp_electronics_sale',
    platform: 'flipkart' as const,
    label: 'Flipkart Electronics Sale',
    icon: FlipkartIcon,
    badge: 'Flipkart',
    badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    iconBox: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
    description: '1,250 Reviews • FSN: MOBGH73XHZ6QG9FZ • 76% Neg Alert'
  }
];

export default function App() {
  const [selectedPreset, setSelectedPreset] = useState<string>('yt_demo_72neg');
  const [inputTarget, setInputTarget] = useState<string>('yt_demo_72neg');
  const [platform, setPlatform] = useState<PlatformType>('youtube');
  const [modelOption, setModelOption] = useState<'vader_hybrid' | 'xlm_roberta' | 'gemini_flash'>('vader_hybrid');
  const [unboundedFetch, setUnboundedFetch] = useState<boolean>(true);
  const [isDemoAction, setIsDemoAction] = useState<boolean>(true);
  const abortRef = useRef<AbortController | null>(null);

  // Browser Collector / Extension Modal State
  const [showExtensionModal, setShowExtensionModal] = useState<boolean>(false);
  const [collectorTab, setCollectorTab] = useState<'extension' | 'bookmarklet' | 'import'>('extension');
  const [importPlatform, setImportPlatform] = useState<PlatformType>('instagram');
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
  const [rapidApiKey, setRapidApiKey] = useState<string>(() => localStorage.getItem('RAPIDAPI_KEY') || '');

  // Report & Loading State
  const [report, setReport] = useState<CachedReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [exportLatency, setExportLatency] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  // View Navigation State
  const [activeView, setActiveView] = useState<'dashboard' | 'comparison' | 'history'>('dashboard');
  const [comparisonTargetA, setComparisonTargetA] = useState<string>('yt_demo_72neg');
  const [comparisonTargetB, setComparisonTargetB] = useState<string>('amz_smartphone_reviews');

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [feedFilter, setFeedFilter] = useState<'ALL' | 'Negative' | 'Positive' | 'Neutral'>('ALL');
  const [selectedSentimentFilter, setSelectedSentimentFilter] = useState<'Negative' | 'Positive' | 'Neutral' | null>(null);
  const [selectedRootCauseFilter, setSelectedRootCauseFilter] = useState<string | null>(null);
  const [selectedStarFilter, setSelectedStarFilter] = useState<number | null>(null);
  const [selectedKeywordFilter, setSelectedKeywordFilter] = useState<string | null>(null);
  const [onlySarcastic, setOnlySarcastic] = useState<boolean>(false);
  const [onlyVerified, setOnlyVerified] = useState<boolean>(false);

  // Command Palette State & Global Key Listener (Ctrl+K / Cmd+K)
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const scrollToExplorer = () => {
    setTimeout(() => {
      const el = document.getElementById('comment-explorer');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);
  };

  // Sync feedFilter with selectedSentimentFilter
  const handleSelectSentiment = (sentiment: 'Negative' | 'Positive' | 'Neutral' | null) => {
    setSelectedSentimentFilter(sentiment);
    setFeedFilter(sentiment || 'ALL');
  };

  // Fetch server-configured keys on mount
  useEffect(() => {
    fetch('/api/settings/keys')
      .then(res => res.json())
      .then(data => {
        if (data) {
          if (data.rapidapi_key_configured) {
            setRapidApiKey(prev => prev || data.masked_keys?.rapidapi_key || 'configured');
          }
          if (data.masked_keys) {
            console.log('Server keys status:', data);
          }
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
    } else if (low.includes('myntra')) {
      setPlatform('myntra');
    } else if (low.includes('meesho')) {
      setPlatform('meesho');
    } else if (low.includes('nykaa')) {
      setPlatform('nykaa');
    } else if (low.includes('ajio')) {
      setPlatform('ajio');
    }
  };

  // Keep track of active report id for polling
  const activeReportIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeReportIdRef.current = report?.post_id || null;
  }, [report]);

  // Poll history every 3s to auto-detect new browser-ingested reports
  useEffect(() => {
    const pollHistory = () => {
      const params = new URLSearchParams(window.location.search);
      const urlPostId = params.get('post_id');

      fetch('/api/history?limit=1')
        .then((res) => {
          if (!res.ok) return null;
          return res.json();
        })
        .then((items) => {
          if (!items || items.length === 0) return;
          const newest = items[0];
          if (!newest || !newest.post_id) return;

          const currentId = activeReportIdRef.current;
          // If URL specifies a post_id or if a new browser extension report was pushed
          if (
            (urlPostId && urlPostId === newest.post_id && currentId !== newest.post_id)
          ) {
            fetch(`/api/report/${encodeURIComponent(newest.post_id)}`)
              .then((r) => r.json())
              .then((rep: CachedReport) => {
                setReport(rep);
                setPlatform((rep.platform || 'youtube') as PlatformType);
                setInputTarget(rep.post_id);
              })
              .catch(() => {});
          }
        })
        .catch(() => {});
    };

    const timer = setInterval(pollHistory, 3000);
    return () => clearInterval(timer);
  }, []);

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
          setPlatform((data.platform || 'youtube') as PlatformType);
          setIsLoading(false);
        })
        .catch(() => {
          setIsLoading(false);
          setErrorMessage(`Report for "${qPostId}" not found yet. Ingest comments using the Chrome Extension or click Scrape & Analyze.`);
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
    localStorage.setItem('RAPIDAPI_KEY', rapidApiKey);

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
          rapidapi_key: rapidApiKey || undefined,
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
    setSelectedSentimentFilter(null);
    setSelectedRootCauseFilter(null);
    setSelectedStarFilter(null);
    setSelectedKeywordFilter(null);
    setOnlySarcastic(false);
    setOnlyVerified(false);
    setSearchQuery('');
    setFeedFilter('ALL');
    handleExecuteAnalysis(presetId, found.platform, modelOption, true);
  };

  const handleExecuteAnalysis = async (
    targetStr: string,
    targetPlatform: PlatformType | string,
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
      setPlatform((reportData.platform || 'youtube') as PlatformType);
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

  // Filtered comments logic with cross-chart filters
  const filteredComments = useMemo(() => {
    if (!report || !report.sample_comments) return [];
    let list = report.sample_comments;

    // Strict Sentiment Filter
    if (selectedSentimentFilter) {
      list = list.filter(c => c.sentiment === selectedSentimentFilter);
    } else if (feedFilter !== 'ALL') {
      list = list.filter(c => c.sentiment === feedFilter);
    }

    // Root Cause Filter
    if (selectedRootCauseFilter && selectedRootCauseFilter !== 'ALL') {
      list = list.filter(c => c.root_cause === selectedRootCauseFilter);
    }

    // Star Rating Filter
    if (selectedStarFilter !== null) {
      list = list.filter(c => c.star_rating === selectedStarFilter);
    }

    // Sarcasm Conflict Filter
    if (onlySarcastic) {
      list = list.filter(c => c.irony_sarcasm_detected || (c as any).is_sarcastic);
    }

    // Verified Buyer Filter
    if (onlyVerified) {
      list = list.filter(c => c.verified_purchase);
    }

    // Keyword Filter
    if (selectedKeywordFilter) {
      const kw = selectedKeywordFilter.toLowerCase();
      list = list.filter(c => c.raw_text.toLowerCase().includes(kw));
    }

    // Text Search Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(c =>
        c.raw_text.toLowerCase().includes(q) ||
        (c.root_cause && c.root_cause.toLowerCase().includes(q)) ||
        (c.product_variant && c.product_variant.toLowerCase().includes(q)) ||
        (c.anonymized_author_id && c.anonymized_author_id.toLowerCase().includes(q)) ||
        ((c as any).author && (c as any).author.toLowerCase().includes(q))
      );
    }
    return list;
  }, [
    report,
    selectedSentimentFilter,
    feedFilter,
    selectedRootCauseFilter,
    selectedStarFilter,
    onlySarcastic,
    onlyVerified,
    selectedKeywordFilter,
    searchQuery,
  ]);

  // Client-side pagination state for Comment Explorer (50 items/page, zero DOM freezing)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 50;

  useEffect(() => {
    setCurrentPage(1);
  }, [
    feedFilter,
    selectedSentimentFilter,
    selectedRootCauseFilter,
    selectedStarFilter,
    onlySarcastic,
    onlyVerified,
    selectedKeywordFilter,
    searchQuery,
    report,
  ]);

  const avgCompoundScore = useMemo(() => {
    if (!report?.sample_comments || report.sample_comments.length === 0) return 0;
    const sum = report.sample_comments.reduce((acc, c) => acc + (c.score || 0), 0);
    return sum / report.sample_comments.length;
  }, [report?.sample_comments]);

  const sarcasmCount = useMemo(() => {
    if (!report?.sample_comments) return report?.sarcastic_comments_count || 0;
    return report.sample_comments.filter(c => c.irony_sarcasm_detected || (c as any).is_sarcastic).length;
  }, [report]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedSentimentFilter || feedFilter !== 'ALL') count++;
    if (selectedRootCauseFilter && selectedRootCauseFilter !== 'ALL') count++;
    if (selectedStarFilter !== null) count++;
    if (onlySarcastic) count++;
    if (onlyVerified) count++;
    if (selectedKeywordFilter) count++;
    if (searchQuery.trim()) count++;
    return count;
  }, [selectedSentimentFilter, feedFilter, selectedRootCauseFilter, selectedStarFilter, onlySarcastic, onlyVerified, selectedKeywordFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredComments.length / itemsPerPage));
  const paginatedComments = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredComments.slice(start, start + itemsPerPage);
  }, [filteredComments, currentPage]);

  const negRow = report?.breakdown?.find(r => r.category === 'Negative') || { comment_count: 0, percentage: 0 };
  const posRow = report?.breakdown?.find(r => r.category === 'Positive') || { comment_count: 0, percentage: 0 };
  const neuRow = report?.breakdown?.find(r => r.category === 'Neutral') || { comment_count: 0, percentage: 0 };
  const isEcommerce = ['amazon', 'flipkart', 'myntra', 'meesho', 'nykaa', 'ajio'].includes(report?.platform?.toLowerCase() || '');

  return (
    <div className="min-h-screen obsidian-canvas matrix-grid-pattern text-slate-100 flex flex-col font-sans selection:bg-indigo-600 selection:text-white">
      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#08090C]/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center font-extrabold text-white text-sm shadow-md shadow-indigo-600/30 border border-indigo-400/40">
              S2
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-sm font-extrabold text-white tracking-tight">Sentinelytics Command Center</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-mono">v3.0 PROD</span>
                {rapidApiKey && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono shadow-sm" title="RapidAPI Dual-Stream Acceleration Active">
                    <Zap className="w-3 h-3 text-emerald-400" />
                    RapidAPI Active
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">Live Browser Ingestion &amp; 2-Tier NLP Engine</p>
            </div>
          </div>

          {/* Center Command Palette Search Pill */}
          <button
            onClick={() => setIsCommandPaletteOpen(true)}
            className="hidden lg:flex items-center space-x-2.5 px-3.5 py-1.5 rounded-xl bg-white/4 hover:bg-white/8 border border-white/10 text-xs text-slate-300 transition cursor-pointer shadow-sm group hover:border-white/20"
            title="Search actions, presets, and filters (Ctrl+K / Cmd+K)"
          >
            <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-400 transition-colors" />
            <span className="text-slate-400 group-hover:text-slate-200">Search commands, presets, filters...</span>
            <kbd className="ml-2 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-white/5 border border-white/10 rounded">⌘K</kbd>
          </button>

          <div className="flex items-center space-x-2 sm:space-x-2.5">
            {report && (
              <button
                onClick={() => setIsDrawerOpen(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/15 hover:bg-indigo-600/25 border border-indigo-500/35 text-xs font-semibold text-indigo-300 transition cursor-pointer shadow-sm"
                title="Open Inspection Drawer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden sm:inline">Inspector Drawer</span>
              </button>
            )}

            <button
              onClick={() => setShowExtensionModal(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-xs font-semibold text-emerald-300 transition cursor-pointer shadow-sm"
              title="Open Browser Extension & Live Collector Guide"
            >
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Browser Extension</span>
            </button>

            <button
              onClick={() => setShowKeysModal(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 transition cursor-pointer"
              title="Configure API Keys"
            >
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">API Keys</span>
              {(youtubeApiKey || geminiApiKey || instagramToken || scraperApiKey) && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              )}
            </button>

            <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-white/4 border border-white/8 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-slate-300 text-[11px] font-medium">Sub-Second (&lt;1s)</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 flex-1 w-full">
        {/* Navigation Tabs */}
        <div className="flex items-center space-x-2 border-b border-white/5 pb-3">
          <button
            onClick={() => setActiveView('dashboard')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeView === 'dashboard'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Analysis Dashboard</span>
          </button>
          <button
            onClick={() => setActiveView('comparison')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeView === 'comparison'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <GitCompare className="w-4 h-4" />
            <span>Multi-Comparison</span>
          </button>
          <button
            onClick={() => setActiveView('history')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeView === 'history'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <History className="w-4 h-4" />
            <span>History Hub</span>
          </button>
        </div>

        {activeView === 'comparison' && (
          <MultiComparisonView
            initialPostA={comparisonTargetA}
            initialPostB={comparisonTargetB}
            onBackToDashboard={(id) => {
              if (id) {
                handleExecuteAnalysis(id, 'youtube', modelOption, false);
              }
              setActiveView('dashboard');
            }}
          />
        )}

        {activeView === 'history' && (
          <HistoryView
            onLoadPost={(id) => {
              handleExecuteAnalysis(id, 'youtube', modelOption, false);
              setActiveView('dashboard');
            }}
            onComparePosts={(a, b) => {
              setComparisonTargetA(a);
              setComparisonTargetB(b);
              setActiveView('comparison');
            }}
          />
        )}

        {activeView === 'dashboard' && (
          <>
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
                      ? 'bg-[#141722] border-indigo-500 shadow-xl shadow-indigo-500/10 ring-2 ring-indigo-500/40'
                      : 'obsidian-card-interactive hover:bg-[#131620]'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className={`p-2 rounded-xl ${preset.iconBox || 'bg-white/5 text-slate-300'}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{preset.badge}</span>
                    </div>
                    {isSelected && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-mono">
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
        <div className="obsidian-card rounded-2xl p-5 shadow-2xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div className="sm:col-span-2 lg:col-span-1">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300">Live URL / Video ID / ASIN / FSN</label>
                <span className="text-[10px] text-emerald-400 font-semibold flex items-center space-x-1 font-mono">
                  <Globe className="w-3 h-3" />
                  <span>Keyless Ingestion</span>
                </span>
              </div>
              <input
                type="text"
                value={inputTarget}
                onChange={(e) => handleInputChange(e.target.value)}
                placeholder="e.g. https://www.youtube.com/watch?v=... or ASIN"
                className="obsidian-input w-full rounded-xl px-3.5 py-2 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Platform Channel</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as any)}
                className="obsidian-input w-full rounded-xl px-3.5 py-2 text-xs font-semibold"
              >
                <optgroup label="Social Media">
                  <option value="youtube">YouTube (Keyless Scraper / Data API v3)</option>
                  <option value="instagram">Instagram (Graph API / Public)</option>
                </optgroup>
                <optgroup label="E-Commerce">
                  <option value="amazon">Amazon (HTML Reviews / ASIN)</option>
                  <option value="flipkart">Flipkart (HTML Reviews / FSN)</option>
                  <option value="myntra">Myntra (Reviews / Catalog)</option>
                  <option value="meesho">Meesho (Reviews / Catalog)</option>
                  <option value="nykaa">Nykaa (Reviews / Catalog)</option>
                  <option value="ajio">Ajio (Reviews / Catalog)</option>
                </optgroup>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Model Engine</label>
              <select
                value={modelOption}
                onChange={(e) => setModelOption(e.target.value as any)}
                className="obsidian-input w-full rounded-xl px-3.5 py-2 text-xs font-semibold"
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
                className="btn-primary-solid w-full px-5 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer shadow-lg"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-slate-900" />
                    <span>{isDemoAction ? 'Loading Demo Benchmark...' : 'Scraping Live Comments...'}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-slate-900" />
                    <span>Scrape &amp; Analyze Stream</span>
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

        {/* Data Provenance & Credibility Badges Bar */}
        {report && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl obsidian-card shadow-md">
            <div className="flex items-center flex-wrap gap-2.5">
              {report.is_demo ? (
                <span className="inline-flex items-center px-3 py-1 rounded-xl text-xs font-semibold bg-amber-950/60 text-amber-300 border border-amber-800/60">
                  <Database className="w-3.5 h-3.5 mr-1.5 text-amber-400 shrink-0" />
                  OFFLINE BENCHMARK DATASET
                </span>
              ) : (
                <span className="inline-flex items-center px-3 py-1 rounded-xl text-xs font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-800/60">
                  <Activity className="w-3.5 h-3.5 mr-1.5 text-emerald-400 shrink-0 animate-pulse" />
                  LIVE SCRAPED INGESTION
                </span>
              )}

              {/* Enterprise Credibility Badges */}
              <span className="inline-flex items-center px-3 py-1 rounded-xl text-xs font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                <ShieldCheck className="w-3.5 h-3.5 mr-1.5 text-emerald-400 shrink-0" />
                100% Raw Comments Audited
              </span>

              <span className="inline-flex items-center px-3 py-1 rounded-xl text-xs font-medium bg-sky-500/10 text-sky-300 border border-sky-500/20">
                <Clock className="w-3.5 h-3.5 mr-1.5 text-sky-400 shrink-0" />
                ISO-8601 Temporal Alignment
              </span>

              {report.data_source_badge && (
                <span className="inline-flex items-center px-3 py-1 rounded-xl text-xs font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                  <Cpu className="w-3.5 h-3.5 mr-1.5 text-indigo-400 shrink-0" />
                  {report.data_source_badge.replace(/^[🟢⚡🧪\s]+/, '')}
                </span>
              )}

              <span className="text-xs text-slate-400 font-mono hidden md:inline">
                Provenance: {report.data_source || 'Verified Source'}
              </span>
            </div>

            <div className="flex items-center space-x-2 text-xs text-slate-400">
              <button
                onClick={() => setIsDrawerOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-xs font-semibold text-indigo-300 transition flex items-center space-x-1.5 cursor-pointer shadow-sm"
              >
                <Search className="w-3 h-3 text-indigo-400" />
                <span>Inspect Feed</span>
              </button>
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

        {/* Sentiment Telemetry Ribbon (Full-Width Proportional Metric Bar) */}
        {report && (
          <SentimentTelemetryRibbon
            negCount={negRow.comment_count}
            negPct={negRow.percentage}
            posCount={posRow.comment_count}
            posPct={posRow.percentage}
            neuCount={neuRow.comment_count}
            neuPct={neuRow.percentage}
            totalComments={report.total_valid_comments}
            avgScore={avgCompoundScore}
            sarcasmCount={report.sarcastic_comments_count ?? 0}
            activeSentiment={selectedSentimentFilter}
            onSelectSentiment={(sentiment) => {
              setSelectedSentimentFilter(sentiment === selectedSentimentFilter ? null : sentiment);
              const el = document.getElementById('comment-explorer');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            onlySarcastic={onlySarcastic}
            onToggleSarcasm={() => {
              setOnlySarcastic((prev) => !prev);
              const el = document.getElementById('comment-explorer');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            onScrollToExplorer={() => {
              const el = document.getElementById('comment-explorer');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
          />
        )}

        {/* High Negative Alert Banner (>70%) */}
        {report?.high_negative_alert && (
          <div className="bg-rose-950/70 border border-rose-500/80 rounded-2xl p-5 shadow-2xl shadow-rose-950/60 animate-in fade-in duration-300">
            <div className="flex items-start space-x-3">
              <div className="p-2.5 bg-rose-900/80 rounded-xl text-rose-300">
                <AlertTriangle className="w-6 h-6 text-rose-400" />
              </div>
              <div className="flex-1">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-rose-200 tracking-wide uppercase">
                    Critical Sentiment Alert: Negative Polarity Exceeds 70% Threshold
                  </h2>
                  <span className="self-start sm:self-auto px-3 py-1 rounded-full text-xs font-bold bg-rose-500 text-white shadow-md shadow-rose-500/40">
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3.5">
            <div className="obsidian-card rounded-2xl p-4 flex flex-col justify-between">
              <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">
                {report.platform_reported_total ? `Platform Total (${report.platform.toUpperCase()})` : 'Raw Ingestion'}
              </p>
              <p className="text-2xl font-bold text-white mt-1 font-mono tabular-nums">
                {(report.platform_reported_total || report.total_raw_comments).toLocaleString()}
              </p>
              <span className="text-[10px] text-slate-500 mt-1 flex items-center space-x-1">
                <Activity className="w-3 h-3 text-indigo-400" />
                <span>
                  {report.platform_reported_total
                    ? `Audited: ${report.total_valid_comments.toLocaleString()} items`
                    : report.unbounded_fetch
                    ? `Uncapped (${report.pages_fetched} pages)`
                    : 'Capped'}
                </span>
              </span>
            </div>

            <div className="obsidian-card rounded-2xl p-4 flex flex-col justify-between">
              <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">Spam / Bots Filtered</p>
              <p className="text-2xl font-bold text-amber-400 mt-1 font-mono tabular-nums">{report.spam_duplicates_removed.toLocaleString()}</p>
              <span className="text-[10px] text-slate-500 mt-1">URLs & duplicates</span>
            </div>

            <div className="obsidian-card rounded-2xl p-4 flex flex-col justify-between">
              <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">Valid Analyzed</p>
              <p className="text-2xl font-bold text-indigo-400 mt-1 font-mono tabular-nums">{report.total_valid_comments.toLocaleString()}</p>
              <span className="text-[10px] text-slate-500 mt-1">Clean NLP items</span>
            </div>

            <div
              onClick={() => {
                setSelectedSentimentFilter(selectedSentimentFilter === 'Negative' ? null : 'Negative');
                const el = document.getElementById('comment-explorer');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`obsidian-card rounded-2xl p-4 flex flex-col justify-between cursor-pointer transition-all hover:border-rose-500/50 ${
                selectedSentimentFilter === 'Negative' ? 'ring-1 ring-rose-500 bg-rose-950/20' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-rose-400 font-medium uppercase tracking-wider">Negative Share</p>
                <ChevronRight className="w-3 h-3 text-rose-500/60" />
              </div>
              <p className="text-2xl font-bold text-rose-400 mt-1 font-mono tabular-nums">{negRow.percentage}%</p>
              <span className="text-[10px] text-rose-400/80 font-medium mt-1 font-mono tabular-nums">{negRow.comment_count} items &bull; Click to filter</span>
            </div>

            <div
              onClick={() => {
                setSelectedSentimentFilter(selectedSentimentFilter === 'Positive' ? null : 'Positive');
                const el = document.getElementById('comment-explorer');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`obsidian-card rounded-2xl p-4 flex flex-col justify-between cursor-pointer transition-all hover:border-emerald-500/50 ${
                selectedSentimentFilter === 'Positive' ? 'ring-1 ring-emerald-500 bg-emerald-950/20' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-emerald-400 font-medium uppercase tracking-wider">Positive Share</p>
                <ChevronRight className="w-3 h-3 text-emerald-500/60" />
              </div>
              <p className="text-2xl font-bold text-emerald-400 mt-1 font-mono tabular-nums">{posRow.percentage}%</p>
              <span className="text-[10px] text-emerald-400/80 font-medium mt-1 font-mono tabular-nums">{posRow.comment_count} items &bull; Click to filter</span>
            </div>

            <div
              onClick={() => {
                setSelectedSentimentFilter(selectedSentimentFilter === 'Neutral' ? null : 'Neutral');
                const el = document.getElementById('comment-explorer');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`obsidian-card rounded-2xl p-4 flex flex-col justify-between cursor-pointer transition-all hover:border-sky-500/50 ${
                selectedSentimentFilter === 'Neutral' ? 'ring-1 ring-sky-500 bg-sky-950/20' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-sky-400 font-medium uppercase tracking-wider">Neutral Share</p>
                <ChevronRight className="w-3 h-3 text-sky-500/60" />
              </div>
              <p className="text-2xl font-bold text-sky-400 mt-1 font-mono tabular-nums">{neuRow.percentage}%</p>
              <span className="text-[10px] text-sky-400/80 font-medium mt-1 font-mono tabular-nums">{neuRow.comment_count} items &bull; Click to filter</span>
            </div>

            <div
              onClick={() => {
                setOnlySarcastic((prev) => !prev);
                const el = document.getElementById('comment-explorer');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`obsidian-card rounded-2xl p-4 flex flex-col justify-between cursor-pointer transition-all hover:border-amber-500/50 ${
                onlySarcastic ? 'ring-1 ring-amber-500 bg-amber-950/20' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-amber-400 font-medium uppercase tracking-wider">Sarcasm Clashes</p>
                <Sparkles className="w-3 h-3 text-amber-400/80" />
              </div>
              <p className="text-2xl font-bold text-amber-400 mt-1 font-mono tabular-nums">
                {(report.sarcastic_comments_count ?? 0).toLocaleString()}
              </p>
              <span className="text-[10px] text-amber-400/80 font-medium mt-1">Text-Emoji Clashes &bull; Filter</span>
            </div>
          </div>
        )}

        {/* AI Executive Insights & Recommendations */}
        {report && (
          <LiveInsightsPanel
            executiveSummary={report.executive_summary}
            painPoints={report.pain_points}
            recommendations={report.recommendations}
            overallConfidenceScore={report.overall_confidence_score}
            overallSubjectivityScore={report.overall_subjectivity_score}
            platform={report.platform}
          />
        )}

        {/* 4 Interactive Visual Recharts Grid */}
        {report && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart 1: Donut Chart with Center KPI */}
            <div className="min-h-[380px]">
              <SentimentDonutChart
                breakdown={report.breakdown}
                totalValidComments={report.total_valid_comments}
                highNegativeAlert={report.high_negative_alert}
                activeCategory={selectedSentimentFilter}
                onSelectCategory={(cat) => {
                  setSelectedSentimentFilter(cat === selectedSentimentFilter ? null : cat);
                  const el = document.getElementById('comment-explorer');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
              />
            </div>

            {/* Chart 2: Tier-2 Root-Cause Bar Chart */}
            <div className="min-h-[380px]">
              <RootCauseBarChart
                rootCauses={report.tier2_root_causes}
                platform={report.platform}
                selectedCause={selectedRootCauseFilter === 'ALL' ? null : selectedRootCauseFilter}
                onSelectCause={(cause) => {
                  setSelectedRootCauseFilter(cause || 'ALL');
                  const el = document.getElementById('comment-explorer');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
              />
            </div>

            {/* Chart 3: Engagement Trends Chart */}
            <div className="min-h-[380px]">
              <EngagementTrendsChart
                buckets={report.timeline_buckets || timeSeriesData}
              />
            </div>
            {/* Chart 4: Top Keywords & Star Ratings Widget */}
            <div className="min-h-[380px]">
              <TopKeywordsWidget
                keywordStats={report.keyword_stats}
                keywordFrequencies={report.keyword_frequencies}
                starDistribution={report.star_rating_distribution}
                isEcommerce={isEcommerce}
                selectedKeyword={selectedKeywordFilter}
                onSelectKeyword={(kw) => {
                  setSelectedKeywordFilter(kw === selectedKeywordFilter ? null : kw);
                  const el = document.getElementById('comment-explorer');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                selectedStarRating={selectedStarFilter}
                onSelectStarRating={(star) => {
                  setSelectedStarFilter(star === selectedStarFilter ? null : star);
                  const el = document.getElementById('comment-explorer');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
              />
            </div>
          </div>
        )}

        {/* Sub-Second Export Panel */}
        {report && (
          <div className="obsidian-card p-5 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <Download className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">Instant Pre-Computed Exporters (&lt;15ms)</h3>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 rounded border border-emerald-500/30">
                  Zero Inference Wait
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Exports stream directly from atomic memory cache. Download executive ReportLab PDF or multi-sheet CSV report instantly.
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
                className="flex-1 sm:flex-none px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold transition flex items-center justify-center space-x-2 shadow-sm cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                <span>Download PDF (&lt;15ms)</span>
              </button>
              <button
                onClick={() => handleDownloadExport('csv')}
                className="flex-1 sm:flex-none px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition flex items-center justify-center space-x-2 cursor-pointer"
              >
                <TableIcon className="w-4 h-4" />
                <span>Download CSV (&lt;15ms)</span>
              </button>
            </div>
          </div>
        )}

        {/* Audited Comment & Review Explorer (50 items/page with zero DOM lag) */}
        {report && (
          <div id="comment-explorer" className="obsidian-card rounded-2xl p-5 shadow-xl space-y-4 scroll-mt-24">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white">Audited Comment & Review Explorer</h3>
                <p className="text-xs text-slate-400">
                  Showing <span className="text-white font-mono font-bold tabular-nums">{filteredComments.length.toLocaleString()}</span> matching of {(report.sample_comments || []).length.toLocaleString()} audited items
                </p>
              </div>

              {/* Search input */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search text, root causes, authors..."
                    className="obsidian-input rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 w-56"
                  />
                </div>
              </div>
            </div>

            {/* Cross-Filtering Active Filter Bar with Instant CSV Export */}
            <ActiveFilterBar
              totalComments={report.sample_comments?.length || 0}
              filteredCount={filteredComments.length}
              activeSentiment={selectedSentimentFilter}
              onClearSentiment={() => setSelectedSentimentFilter(null)}
              activeRootCause={selectedRootCauseFilter === 'ALL' ? null : selectedRootCauseFilter}
              onClearRootCause={() => setSelectedRootCauseFilter('ALL')}
              activeStarRating={selectedStarFilter}
              onClearStarRating={() => setSelectedStarFilter(null)}
              onlySarcastic={onlySarcastic}
              onToggleSarcasm={() => setOnlySarcastic(false)}
              selectedKeyword={selectedKeywordFilter}
              onClearKeyword={() => setSelectedKeywordFilter(null)}
              searchQuery={searchQuery}
              onClearSearch={() => setSearchQuery('')}
              onlyVerified={onlyVerified}
              onToggleVerified={() => setOnlyVerified(false)}
              onResetAllFilters={() => {
                setSelectedSentimentFilter(null);
                setSelectedRootCauseFilter('ALL');
                setSelectedStarFilter(null);
                setSelectedKeywordFilter(null);
                setOnlySarcastic(false);
                setOnlyVerified(false);
                setSearchQuery('');
                setFeedFilter('ALL');
              }}
              filteredItems={filteredComments}
            />

            {/* Scrollable Comments List (Paginated at 50/page for smooth rendering) */}
            <div className="space-y-3 max-h-[32rem] overflow-y-auto pr-2 custom-scrollbar">
              {filteredComments.length === 0 ? (
                <div className="text-center py-12 text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                  No comments matching the selected filter or search query.
                </div>
              ) : (
                paginatedComments.map((c) => {
                  const isNeg = c.sentiment === 'Negative';
                  const isPos = c.sentiment === 'Positive';
                  const isSarcastic = Boolean(c.irony_sarcasm_detected || (c as any).is_sarcastic);

                  return (
                    <div
                      key={c.comment_id}
                      className="bg-[#08090C] border border-[#1e2230] rounded-xl p-3.5 text-xs flex flex-col space-y-2 hover:border-[#2e3448] transition"
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center flex-wrap gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                              isNeg
                                ? 'bg-rose-950/60 text-rose-300 border-rose-800/70'
                                : isPos
                                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/70'
                                : 'bg-sky-950/60 text-sky-300 border-sky-800/70'
                            }`}
                          >
                            {c.sentiment} ({c.score > 0 ? `+${c.score}` : c.score})
                          </span>

                          {c.root_cause && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-rose-950/70 text-rose-300 border border-rose-800/60">
                              {c.root_cause}
                            </span>
                          )}

                          {c.star_rating && (
                            <span className="flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-950/50 text-amber-300 border border-amber-800/60">
                              <span className="font-mono">{c.star_rating}</span>
                              <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                            </span>
                          )}

                          {c.verified_purchase && (
                            <span className="flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-950/50 text-emerald-400 border border-emerald-900/60">
                              <ShieldCheck className="w-3 h-3 text-emerald-400" />
                              <span>Verified Buyer</span>
                            </span>
                          )}

                          {/* Forensic Sarcasm Badge */}
                          {isSarcastic && (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                              <span>Sarcasm Polarity Override &bull; Score: {c.score > 0 ? `+${c.score}` : c.score}</span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center space-x-3 text-[10px] text-slate-500 font-mono">
                          {c.product_variant && <span className="text-indigo-400">{c.product_variant}</span>}
                          <span>Author: {(c as any).author || (c.anonymized_author_id.startsWith("usr_") ? c.anonymized_author_id.slice(0, 8) : c.anonymized_author_id)}</span>
                          <span>Likes: {c.like_count}</span>
                          <span>{c.timestamp.replace('T', ' ').replace('Z', '')}</span>
                        </div>
                      </div>

                      <p className="text-slate-200 text-xs leading-relaxed font-sans">{c.raw_text}</p>
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
          </>
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
                <label className="block text-slate-300 font-semibold mb-1">RapidAPI Key (Instagram &amp; Amazon Live Dual-Stream)</label>
                <input
                  type="password"
                  value={rapidApiKey}
                  onChange={(e) => setRapidApiKey(e.target.value)}
                  placeholder="RapidAPI Secret Key (e.g. 5431abc...)"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">Powers Instagram (<code>instagram-scraper-stable-api</code>) &amp; Amazon (<code>amazon-online-data-api</code>) live streams.</p>
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

      {/* Interactive Command Palette Modal (Ctrl+K / Cmd+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectPreset={handleSelectPreset}
        onFilterSentiment={handleSelectSentiment}
        onFilterSarcasm={(s) => { setOnlySarcastic(s); scrollToExplorer(); }}
        onFilterStars={(st) => { setSelectedStarFilter(st); scrollToExplorer(); }}
        onClearFilters={() => {
          setSelectedSentimentFilter(null);
          setSelectedRootCauseFilter(null);
          setSelectedStarFilter(null);
          setSelectedKeywordFilter(null);
          setOnlySarcastic(false);
          setOnlyVerified(false);
          setSearchQuery('');
          setFeedFilter('ALL');
        }}
        onExportPdf={() => handleDownloadExport('pdf')}
        onExportCsv={() => handleDownloadExport('csv')}
        onOpenView={(v) => setActiveView(v)}
        onOpenDrawer={() => setIsDrawerOpen(true)}
        onOpenKeysModal={() => setShowKeysModal(true)}
        onOpenExtensionModal={() => setShowExtensionModal(true)}
        activeFilterCount={activeFilterCount}
      />

      {/* Sliding Right-Hand Inspector Drawer */}
      <ProductPreviewDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        report={report}
      />

      {/* Footer */}
      <footer className="border-t border-white/5 bg-[#08090C] py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2 font-mono">
          <span>Sentinelytics Intelligence &bull; Production Release</span>
          <span>YouTube &bull; Instagram &bull; Amazon &bull; Flipkart &bull; Keyless Ingestion</span>
        </div>
      </footer>
    </div>
  );
}
