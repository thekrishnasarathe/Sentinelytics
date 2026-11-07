import React, { useState, useEffect } from 'react';
import {
  GitCompare,
  Trophy,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  ShoppingBag,
  Youtube,
  Instagram,
  CheckCircle,
} from 'lucide-react';
import { CompareResponse, CachedReport } from '../types';
import { SentimentDonutChart } from './SentimentDonutChart';
import { RootCauseBarChart } from './RootCauseBarChart';

interface MultiComparisonViewProps {
  initialPostA?: string;
  initialPostB?: string;
  onBackToDashboard: (postId?: string) => void;
}

export const MultiComparisonView: React.FC<MultiComparisonViewProps> = ({
  initialPostA = 'yt_demo_72neg',
  initialPostB = 'amz_smartphone_reviews',
  onBackToDashboard,
}) => {
  const [postA, setPostA] = useState<string>(initialPostA);
  const [postB, setPostB] = useState<string>(initialPostB);
  const [loading, setLoading] = useState<boolean>(false);
  const [comparison, setComparison] = useState<CompareResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runComparison = async (idA: string, idB: string) => {
    if (!idA.trim() || !idB.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id_a: idA.trim(), post_id_b: idB.trim() }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Comparison failed');
      }
      const data: CompareResponse = await res.json();
      setComparison(data);
    } catch (err: any) {
      setError(err.message || 'Error comparing targets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialPostA && initialPostB) {
      runComparison(initialPostA, initialPostB);
    }
  }, [initialPostA, initialPostB]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runComparison(postA, postB);
  };

  const getPosPct = (rep: CachedReport) =>
    rep.breakdown.find((r) => r.category === 'Positive')?.percentage || 0;
  const getNegPct = (rep: CachedReport) =>
    rep.breakdown.find((r) => r.category === 'Negative')?.percentage || 0;

  return (
    <div className="space-y-6">
      {/* Comparison Input Panel */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-800 mb-5">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
            <GitCompare className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Multi-Target Comparison Engine</h2>
            <p className="text-xs text-slate-400">
              Benchmark sentiment, failure modes, and customer satisfaction between any 2 posts or products
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-5">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Target A (URL, ASIN, or ID)
            </label>
            <input
              type="text"
              value={postA}
              onChange={(e) => setPostA(e.target.value)}
              placeholder="e.g. yt_demo_72neg or YouTube / Amazon URL"
              className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="md:col-span-2 flex items-center justify-center py-2 text-slate-500 font-bold text-xs">
            VS
          </div>

          <div className="md:col-span-5">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Target B (URL, ASIN, or ID)
            </label>
            <input
              type="text"
              value={postB}
              onChange={(e) => setPostB(e.target.value)}
              placeholder="e.g. amz_smartphone_reviews or Flipkart URL"
              className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="md:col-span-12 flex justify-end mt-2">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-sm flex items-center gap-2 shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Comparing...
                </>
              ) : (
                <>
                  <GitCompare className="w-4 h-4" /> Compare Targets
                </>
              )}
            </button>
          </div>
        </form>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            {error}
          </div>
        )}
      </div>

      {/* Comparison Results */}
      {comparison && (
        <div className="space-y-6">
          {/* Winner Banner */}
          <div className="bg-gradient-to-r from-amber-500/15 via-indigo-500/15 to-purple-500/15 border border-amber-500/30 rounded-2xl p-5 backdrop-blur-md flex flex-wrap items-center justify-between gap-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-inner">
                <Trophy className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                  Sentiment Winner
                </span>
                <h3 className="text-lg font-extrabold text-white">
                  Target '{comparison.winner}' achieved higher customer sentiment
                </h3>
                <p className="text-xs text-slate-300">
                  Delta: Positive sentiment difference of{' '}
                  <span className="text-emerald-400 font-bold">
                    {Math.abs(comparison.delta_positive_pct)}%
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => onBackToDashboard(comparison.winner)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all"
              >
                Inspect Winner in Dashboard <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Side by Side Comparison Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Target A Card */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    Target A
                  </span>
                  <h4 className="text-base font-bold text-white mt-1">
                    {comparison.report_a.post_id}
                  </h4>
                  <p className="text-xs text-slate-400 capitalize">
                    Platform: {comparison.report_a.platform} •{' '}
                    {comparison.report_a.total_valid_comments.toLocaleString()} comments
                  </p>
                </div>
                {comparison.winner === comparison.report_a.post_id && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/30">
                    <Trophy className="w-3.5 h-3.5" /> Winner
                  </span>
                )}
              </div>

              <div className="h-64">
                <SentimentDonutChart
                  breakdown={comparison.report_a.breakdown}
                  totalValidComments={comparison.report_a.total_valid_comments}
                  highNegativeAlert={comparison.report_a.high_negative_alert}
                />
              </div>

              <div className="h-72">
                <RootCauseBarChart
                  rootCauses={comparison.report_a.tier2_root_causes}
                  platform={comparison.report_a.platform}
                />
              </div>
            </div>

            {/* Target B Card */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    Target B
                  </span>
                  <h4 className="text-base font-bold text-white mt-1">
                    {comparison.report_b.post_id}
                  </h4>
                  <p className="text-xs text-slate-400 capitalize">
                    Platform: {comparison.report_b.platform} •{' '}
                    {comparison.report_b.total_valid_comments.toLocaleString()} comments
                  </p>
                </div>
                {comparison.winner === comparison.report_b.post_id && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/30">
                    <Trophy className="w-3.5 h-3.5" /> Winner
                  </span>
                )}
              </div>

              <div className="h-64">
                <SentimentDonutChart
                  breakdown={comparison.report_b.breakdown}
                  totalValidComments={comparison.report_b.total_valid_comments}
                  highNegativeAlert={comparison.report_b.high_negative_alert}
                />
              </div>

              <div className="h-72">
                <RootCauseBarChart
                  rootCauses={comparison.report_b.tier2_root_causes}
                  platform={comparison.report_b.platform}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

