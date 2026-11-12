import React, { useState, useEffect } from 'react';
import {
  History,
  Search,
  ExternalLink,
  Trash2,
  GitCompare,
  ArrowRight,
  AlertTriangle,
  RefreshCw,
  ShoppingBag,
  Youtube,
  Instagram,
  CheckSquare,
  Square,
} from 'lucide-react';
import { HistoryItem } from '../types';

interface HistoryViewProps {
  onLoadPost: (postId: string) => void;
  onComparePosts: (postIdA: string, postIdB: string) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  onLoadPost,
  onComparePosts,
}) => {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/history?limit=50');
      if (!res.ok) throw new Error('Failed to fetch historical runs');
      const data = await res.json();
      setHistory(data);
    } catch (err: any) {
      setError(err.message || 'Error loading history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleDelete = async (postId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/history/${postId}`, { method: 'DELETE' });
      setHistory((prev) => prev.filter((item) => item.post_id !== postId));
      setSelectedForCompare((prev) => prev.filter((id) => id !== postId));
    } catch (err) {
      console.error('Delete error', err);
    }
  };

  const toggleCompare = (postId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedForCompare((prev) => {
      if (prev.includes(postId)) {
        return prev.filter((id) => id !== postId);
      }
      if (prev.length >= 2) {
        return [prev[1], postId];
      }
      return [...prev, postId];
    });
  };

  const filteredHistory = history.filter((item) => {
    const q = searchQuery.toLowerCase();
    return (
      item.post_id.toLowerCase().includes(q) ||
      item.platform.toLowerCase().includes(q) ||
      (item.post_url && item.post_url.toLowerCase().includes(q))
    );
  });

  const getPlatformIcon = (plat: string) => {
    const p = plat.toLowerCase();
    if (p === 'youtube') return <Youtube className="w-4 h-4 text-red-500" />;
    if (p === 'instagram') return <Instagram className="w-4 h-4 text-pink-500" />;
    return <ShoppingBag className="w-4 h-4 text-amber-500" />;
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl backdrop-blur-md">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Analysis History Hub</h2>
            <p className="text-xs text-slate-400">
              Browse, reload, or compare pre-computed sentiment runs from SQLite
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {selectedForCompare.length === 2 && (
            <button
              onClick={() => onComparePosts(selectedForCompare[0], selectedForCompare[1])}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-2 shadow-lg shadow-indigo-500/20 transition-all animate-pulse"
            >
              <GitCompare className="w-4 h-4" /> Compare 2 Selected
            </button>
          )}

          <button
            onClick={fetchHistory}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700/80 transition-all"
            title="Refresh history"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative my-4">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter by Post ID, URL, or platform (youtube, instagram, amazon, flipkart, myntra...)"
          className="w-full bg-slate-950/70 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
        />
      </div>

      {/* History Items Table / List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-400 mb-3" />
          <p className="text-sm font-medium">Loading historical reports from database...</p>
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          {error}
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <History className="w-10 h-10 text-slate-600 mx-auto mb-2" />
          <p className="text-sm font-medium">No previous analysis runs found</p>
          <p className="text-xs text-slate-500 mt-1">
            Run an analysis from the Dashboard to save results to history
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                <th className="py-3 px-3 w-10">Compare</th>
                <th className="py-3 px-3">Target / Post ID</th>
                <th className="py-3 px-3">Platform</th>
                <th className="py-3 px-3">Total Comments</th>
                <th className="py-3 px-3">Sentiment Split</th>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredHistory.map((item) => {
                const isSelected = selectedForCompare.includes(item.post_id);
                return (
                  <tr
                    key={item.post_id}
                    onClick={() => onLoadPost(item.post_id)}
                    className={`hover:bg-slate-800/40 cursor-pointer transition-colors ${
                      isSelected ? 'bg-indigo-950/30' : ''
                    }`}
                  >
                    <td className="py-3 px-3" onClick={(e) => toggleCompare(item.post_id, e)}>
                      <button className="text-slate-400 hover:text-indigo-400">
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-indigo-400" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </td>

                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                        <span className="truncate max-w-[200px]">{item.post_id}</span>
                        {item.high_negative_alert && (
                          <span title="High Negative Alert (>70%)">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          </span>
                        )}
                      </div>
                      {item.post_url && (
                        <span className="text-[11px] text-slate-500 truncate max-w-[250px] block">
                          {item.post_url}
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700/60 font-medium capitalize text-slate-300">
                        {getPlatformIcon(item.platform)} {item.platform}
                      </span>
                    </td>

                    <td className="py-3 px-3 font-semibold text-slate-200">
                      {item.total_comments.toLocaleString()}
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-slate-800 rounded-full flex overflow-hidden">
                          <div
                            className="bg-emerald-500 h-full"
                            style={{ width: `${item.positive_pct}%` }}
                            title={`Positive: ${item.positive_pct}%`}
                          />
                          <div
                            className="bg-sky-500 h-full"
                            style={{ width: `${item.neutral_pct}%` }}
                            title={`Neutral: ${item.neutral_pct}%`}
                          />
                          <div
                            className="bg-rose-500 h-full"
                            style={{ width: `${item.negative_pct}%` }}
                            title={`Negative: ${item.negative_pct}%`}
                          />
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {item.positive_pct}% pos
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                      {item.generated_at}
                    </td>

                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onLoadPost(item.post_id);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold flex items-center gap-1 transition-all"
                        >
                          Load <ArrowRight className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => handleDelete(item.post_id, e)}
                          className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                          title="Delete from history"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default HistoryView;

