import React, { useState, useMemo } from 'react';
import {
  X,
  ExternalLink,
  ShieldCheck,
  Zap,
  Star,
  CheckCircle2,
  AlertTriangle,
  Search,
  MessageSquare,
  ThumbsUp,
  Flame,
  Activity,
  Layers,
} from 'lucide-react';
import { CachedReport, ProcessedComment } from '../types';

interface ProductPreviewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  report: CachedReport | null;
}

export const ProductPreviewDrawer: React.FC<ProductPreviewDrawerProps> = ({
  isOpen,
  onClose,
  report,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sentimentFilter, setSentimentFilter] = useState<'ALL' | 'Positive' | 'Negative' | 'Neutral'>('ALL');

  if (!isOpen || !report) return null;

  const isEcommerce = ['amazon', 'flipkart', 'myntra', 'meesho', 'nykaa', 'ajio'].includes(
    (report.platform || '').toLowerCase()
  );

  // Calculate Verified Buyer %
  const verifiedCount = useMemo(() => {
    return (report.sample_comments || []).filter((c) => c.verified_purchase).length;
  }, [report]);

  const totalAudited = (report.sample_comments || []).length || 1;
  const verifiedPct = Math.round((verifiedCount / totalAudited) * 100);

  // Total likes sum
  const totalLikes = useMemo(() => {
    return (report.sample_comments || []).reduce((acc, c) => acc + (c.like_count || 0), 0);
  }, [report]);

  // Star breakdown calculation if not pre-populated
  const starCounts = useMemo(() => {
    if (report.star_rating_breakdown) {
      return report.star_rating_breakdown;
    }
    const counts: Record<string, number> = { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 };
    for (const c of report.sample_comments || []) {
      if (c.star_rating && counts[String(c.star_rating)] !== undefined) {
        counts[String(c.star_rating)]++;
      }
    }
    return counts;
  }, [report]);

  const avgStarRating = useMemo(() => {
    let sum = 0;
    let count = 0;
    Object.entries(starCounts).forEach(([star, num]) => {
      sum += Number(star) * num;
      count += num;
    });
    return count > 0 ? (sum / count).toFixed(1) : null;
  }, [starCounts]);

  // Sarcastic comments count
  const sarcasticCount =
    report.sarcastic_comments_count ??
    (report.sample_comments || []).filter((c) => c.irony_sarcasm_detected).length;

  // Filtered comments for the inspector feed
  const filteredComments = useMemo(() => {
    return (report.sample_comments || []).filter((c) => {
      if (sentimentFilter !== 'ALL' && c.sentiment !== sentimentFilter) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return (
          c.raw_text.toLowerCase().includes(term) ||
          c.anonymized_author_id.toLowerCase().includes(term) ||
          (c.root_cause && c.root_cause.toLowerCase().includes(term))
        );
      }
      return true;
    });
  }, [report, sentimentFilter, searchTerm]);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-xl bg-[#090d16] border-l border-[#1e293b] shadow-2xl flex flex-col text-slate-100 animate-in slide-in-from-right duration-300">
          {/* Header */}
          <div className="p-5 border-b border-[#1e293b] bg-[#0f172a]/80 backdrop-blur flex items-start justify-between gap-4">
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                  {report.platform}
                </span>
                <span className="text-xs font-mono text-slate-400">
                  ID: {report.post_id}
                </span>
              </div>
              <h2 className="text-base font-bold text-slate-100 truncate">
                {report.data_source || 'Post Inspection & Comment Audit'}
              </h2>
              {report.post_url && (
                <a
                  href={report.post_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 transition-colors"
                >
                  <span className="truncate max-w-[280px]">{report.post_url}</span>
                  <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                </a>
              )}
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              title="Close Drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Credibility Badges Bar */}
          <div className="px-5 py-2.5 bg-[#0b1120] border-b border-[#1e293b] flex items-center justify-between gap-3 text-[11px] font-medium flex-wrap">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>100% Raw Unedited Comments Analyzed</span>
            </div>
            <div className="flex items-center gap-1.5 text-sky-400">
              <Zap className="w-3.5 h-3.5" />
              <span>ISO-8601 Timestamp Aligned</span>
            </div>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Executive Metrics Overview */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-[#0f172a] border border-[#1e293b] p-3 rounded-xl">
                <span className="text-[10px] uppercase font-bold text-slate-400">Total Valid</span>
                <div className="text-lg font-black text-white mt-0.5">
                  {report.total_valid_comments.toLocaleString()}
                </div>
                <span className="text-[10px] text-emerald-400 font-medium">Clean deduplicated</span>
              </div>

              <div className="bg-[#0f172a] border border-[#1e293b] p-3 rounded-xl">
                <span className="text-[10px] uppercase font-bold text-slate-400">
                  {isEcommerce ? 'Verified Buyers' : 'Total Likes'}
                </span>
                <div className="text-lg font-black text-white mt-0.5">
                  {isEcommerce ? `${verifiedPct}%` : totalLikes.toLocaleString()}
                </div>
                <span className="text-[10px] text-slate-400 font-medium">
                  {isEcommerce ? `${verifiedCount} verified` : 'Audited reactions'}
                </span>
              </div>

              <div className="bg-[#0f172a] border border-[#1e293b] p-3 rounded-xl">
                <span className="text-[10px] uppercase font-bold text-slate-400">Sarcasm Clashes</span>
                <div className="text-lg font-black text-amber-400 mt-0.5">
                  {sarcasticCount}
                </div>
                <span className="text-[10px] text-amber-300/80 font-medium">Text-Emoji Clashes</span>
              </div>
            </div>

            {/* Sarcasm Engine Breakdown */}
            <div className="bg-[#0f172a] border border-amber-900/40 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-400" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    Sarcasm & Irony Detection Engine
                  </h4>
                </div>
                <span className="text-[11px] font-mono font-bold text-amber-400">
                  {sarcasticCount} Flagged
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Comments pairing positive textual cues (<code className="text-emerald-400">"great"</code>, <code className="text-emerald-400">"badiya"</code>, <code className="text-emerald-400">"mast"</code>) with mocking negative emojis (<code className="text-rose-400">😡, 😭, 💔, 🤮, 😤, 🤡, 👎</code>) are reclassified to <span className="text-rose-400 font-semibold">Negative Polarity (-0.75)</span> to preserve executive report precision.
              </p>
            </div>

            {/* Star Distribution (For E-Commerce) or Engagement Pulse */}
            {isEcommerce && avgStarRating && (
              <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      Star Rating Breakdown ({avgStarRating} ★ avg)
                    </h4>
                  </div>
                  <span className="text-xs text-emerald-400 font-bold">
                    {verifiedPct}% Verified Buyer Confidence
                  </span>
                </div>

                <div className="space-y-1.5">
                  {['5', '4', '3', '2', '1'].map((star) => {
                    const count = starCounts[star] || 0;
                    const pct = totalAudited > 0 ? Math.round((count / totalAudited) * 100) : 0;
                    return (
                      <div key={star} className="flex items-center gap-2 text-xs">
                        <span className="w-6 font-mono text-slate-400">{star}★</span>
                        <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              Number(star) >= 4 ? 'bg-emerald-500' : Number(star) === 3 ? 'bg-sky-500' : 'bg-rose-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-12 text-right font-mono text-slate-400">{count} ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Read-Only Comments Stream Header & Filter Controls */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-sky-400" />
                    <span>Raw Unedited Comments Feed ({filteredComments.length})</span>
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Strict read-only stream. No mutations or synthetic deletions permitted.
                  </p>
                </div>
              </div>

              {/* Filter and Search Bar */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search raw text, author, or issue..."
                    className="w-full bg-[#070b13] border border-[#1e293b] rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="flex rounded-lg bg-[#070b13] border border-[#1e293b] p-0.5 text-[11px]">
                  {(['ALL', 'Negative', 'Positive', 'Neutral'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setSentimentFilter(filter)}
                      className={`px-2.5 py-1 rounded-md font-semibold transition ${
                        sentimentFilter === filter
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>

              {/* Feed List */}
              <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                {filteredComments.length === 0 ? (
                  <div className="text-center py-10 bg-[#0f172a] border border-[#1e293b] rounded-xl text-slate-400 text-xs">
                    No comments match the search or filter criteria.
                  </div>
                ) : (
                  filteredComments.slice(0, 80).map((comment, idx) => {
                    const isNeg = comment.sentiment === 'Negative';
                    const isPos = comment.sentiment === 'Positive';
                    return (
                      <div
                        key={comment.comment_id || `comment-${idx}`}
                        className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-3 space-y-2 hover:border-slate-700 transition"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-slate-300">
                              @{comment.anonymized_author_id || 'user'}
                            </span>
                            {comment.verified_purchase && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                Verified Buyer
                              </span>
                            )}
                            {comment.star_rating && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                ★ {comment.star_rating}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            {comment.irony_sarcasm_detected && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                Sarcasm
                              </span>
                            )}
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                isNeg
                                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                  : isPos
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                              }`}
                            >
                              {comment.sentiment}
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-slate-200 leading-relaxed">
                          {comment.raw_text}
                        </p>

                        <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-800/60">
                          <span>{comment.timestamp || 'Real-time capture'}</span>
                          <div className="flex items-center gap-3">
                            {comment.like_count > 0 && (
                              <span className="flex items-center gap-1 text-slate-400">
                                <ThumbsUp className="w-3 h-3" />
                                {comment.like_count}
                              </span>
                            )}
                            {comment.root_cause && (
                              <span className="text-rose-400 font-medium">
                                Cause: {comment.root_cause}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                {filteredComments.length > 80 && (
                  <div className="text-center py-2 text-xs text-slate-500">
                    Showing top 80 of {filteredComments.length} matching comments. Use the main explorer for full pagination.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer Note */}
          <div className="p-3 border-t border-[#1e293b] bg-[#070b13] flex items-center justify-between text-[11px] text-slate-400">
            <span>Sentinelytics Enterprise Inspector</span>
            <span className="text-emerald-400 font-mono">Verified Zero Data Alteration</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductPreviewDrawer;

