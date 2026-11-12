import React from 'react';
import {
  Filter,
  X,
  Download,
  AlertTriangle,
  CheckCircle2,
  Star,
  Sparkles,
  Search,
  ShieldCheck,
  Tag,
} from 'lucide-react';
import { ProcessedComment } from '../types';

export interface ActiveFilterBarProps {
  sentiment?: 'Negative' | 'Positive' | 'Neutral' | null;
  activeSentiment?: 'Negative' | 'Positive' | 'Neutral' | null;
  onClearSentiment?: () => void;
  rootCause?: string | null;
  activeRootCause?: string | null;
  onClearRootCause?: () => void;
  starRating?: number | null;
  activeStarRating?: number | null;
  onClearStarRating?: () => void;
  onlySarcastic?: boolean;
  onClearSarcastic?: () => void;
  onToggleSarcasm?: () => void;
  keyword?: string | null;
  selectedKeyword?: string | null;
  onClearKeyword?: () => void;
  searchQuery?: string;
  onClearSearchQuery?: () => void;
  onClearSearch?: () => void;
  onlyVerified?: boolean;
  onClearVerified?: () => void;
  onToggleVerified?: () => void;
  onClearAll?: () => void;
  onResetAllFilters?: () => void;
  filteredCount: number;
  totalCount?: number;
  totalComments?: number;
  filteredComments?: ProcessedComment[];
  filteredItems?: ProcessedComment[];
  platformName?: string;
}

export const ActiveFilterBar: React.FC<ActiveFilterBarProps> = (props) => {
  const sentiment = props.sentiment ?? props.activeSentiment ?? null;
  const onClearSentiment = props.onClearSentiment ?? (() => {});
  const rootCause = props.rootCause ?? props.activeRootCause ?? null;
  const onClearRootCause = props.onClearRootCause ?? (() => {});
  const starRating = props.starRating ?? props.activeStarRating ?? null;
  const onClearStarRating = props.onClearStarRating ?? (() => {});
  const onlySarcastic = props.onlySarcastic ?? false;
  const onClearSarcastic = props.onClearSarcastic ?? props.onToggleSarcasm ?? (() => {});
  const keyword = props.keyword ?? props.selectedKeyword ?? null;
  const onClearKeyword = props.onClearKeyword ?? (() => {});
  const searchQuery = props.searchQuery ?? '';
  const onClearSearchQuery = props.onClearSearchQuery ?? props.onClearSearch ?? (() => {});
  const onlyVerified = props.onlyVerified ?? false;
  const onClearVerified = props.onClearVerified ?? props.onToggleVerified ?? (() => {});
  const onClearAll = props.onClearAll ?? props.onResetAllFilters ?? (() => {});
  const filteredCount = props.filteredCount ?? 0;
  const totalCount = props.totalCount ?? props.totalComments ?? 0;
  const filteredComments = props.filteredComments ?? props.filteredItems ?? [];
  const platformName = props.platformName ?? 'dataset';
  const hasActiveFilters = Boolean(
    sentiment ||
    rootCause ||
    starRating !== null ||
    onlySarcastic ||
    keyword ||
    searchQuery.trim() ||
    onlyVerified
  );

  if (!hasActiveFilters) return null;

  // Instant Client-Side Filtered CSV Exporter (<2ms)
  const handleDownloadFilteredCsv = () => {
    if (!filteredComments || filteredComments.length === 0) return;

    const headers = [
      'comment_id',
      'author',
      'sentiment',
      'score',
      'root_cause',
      'star_rating',
      'verified_purchase',
      'is_sarcastic',
      'like_count',
      'timestamp',
      'raw_text',
    ];

    const rows = filteredComments.map((c) => {
      const escape = (val: any) => {
        const str = String(val ?? '');
        return `"${str.replace(/"/g, '""')}"`;
      };
      return [
        escape(c.comment_id),
        escape((c as any).author || c.anonymized_author_id),
        escape(c.sentiment),
        c.score ?? 0,
        escape(c.root_cause || ''),
        c.star_rating ?? '',
        c.verified_purchase ? 'TRUE' : 'FALSE',
        c.irony_sarcasm_detected || (c as any).is_sarcastic ? 'TRUE' : 'FALSE',
        c.like_count ?? 0,
        escape(c.timestamp),
        escape(c.raw_text),
      ].join(',');
    });

    const csvContent = headers.join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `filtered_${platformName}_comments_${filteredCount}items_${Date.now()}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-[#0D1017] border border-indigo-500/30 shadow-md mb-4 animate-in fade-in slide-in-from-top-1 duration-150">
      <div className="flex items-center flex-wrap gap-2 min-w-0">
        <span className="flex items-center space-x-1.5 text-xs font-semibold text-slate-400 mr-1">
          <Filter className="w-3.5 h-3.5 text-indigo-400" />
          <span>Active Filters:</span>
        </span>

        {/* Sentiment Chip */}
        {sentiment && (
          <span
            className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
              sentiment === 'Negative'
                ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                : sentiment === 'Positive'
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
            }`}
          >
            <span>Polarity: {sentiment}</span>
            <button
              onClick={onClearSentiment}
              className="p-0.5 hover:text-white transition rounded"
              title="Remove filter"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        )}

        {/* Root Cause Chip */}
        {rootCause && (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
            <AlertTriangle className="w-3 h-3 text-rose-400" />
            <span className="truncate max-w-[140px]">{rootCause}</span>
            <button
              onClick={onClearRootCause}
              className="p-0.5 hover:text-white transition rounded"
              title="Remove filter"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        )}

        {/* Star Rating Chip */}
        {starRating !== null && (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
            <span>{starRating} ★ Rating</span>
            <button
              onClick={onClearStarRating}
              className="p-0.5 hover:text-white transition rounded"
              title="Remove filter"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        )}

        {/* Sarcasm Conflict Chip */}
        {onlySarcastic && (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Sarcasm Clashes Only</span>
            <button
              onClick={onClearSarcastic}
              className="p-0.5 hover:text-white transition rounded"
              title="Remove filter"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        )}

        {/* Keyword Chip */}
        {keyword && (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">
            <Tag className="w-3 h-3 text-purple-400" />
            <span className="truncate max-w-[120px]">&ldquo;{keyword}&rdquo;</span>
            <button
              onClick={onClearKeyword}
              className="p-0.5 hover:text-white transition rounded"
              title="Remove filter"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        )}

        {/* Search Query Chip */}
        {searchQuery.trim() && (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
            <Search className="w-3 h-3 text-indigo-400" />
            <span className="truncate max-w-[120px]">&ldquo;{searchQuery}&rdquo;</span>
            <button
              onClick={onClearSearchQuery}
              className="p-0.5 hover:text-white transition rounded"
              title="Remove filter"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        )}

        {/* Verified Purchase Chip */}
        {onlyVerified && (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            <span>Verified Buyers Only</span>
            <button
              onClick={onClearVerified}
              className="p-0.5 hover:text-white transition rounded"
              title="Remove filter"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        )}

        {/* Clear All Button */}
        <button
          onClick={onClearAll}
          className="text-[11px] font-semibold text-slate-400 hover:text-rose-400 underline underline-offset-2 ml-1 transition cursor-pointer"
        >
          Reset All
        </button>
      </div>

      {/* Right Controls: Count & Instant CSV Export */}
      <div className="flex items-center space-x-3 shrink-0 self-end sm:self-auto">
        <span className="text-xs text-slate-400 font-mono tabular-nums">
          <strong className="text-white">{filteredCount.toLocaleString()}</strong> of{' '}
          {totalCount.toLocaleString()} matches
        </span>

        <button
          onClick={handleDownloadFilteredCsv}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-xs font-bold text-indigo-300 transition cursor-pointer shadow-sm hover:border-indigo-400"
          title="Export matching filtered comments to CSV instantly"
        >
          <Download className="w-3.5 h-3.5 text-indigo-400" />
          <span>Export Filtered CSV</span>
        </button>
      </div>
    </div>
  );
};

export default ActiveFilterBar;

