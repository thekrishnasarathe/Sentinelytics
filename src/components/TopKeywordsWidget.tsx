import React, { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { Sparkles, Star, Tag, Layers, X, Filter } from 'lucide-react';
import { KeywordFrequencyItem } from '../types';

interface TopKeywordsWidgetProps {
  keywordStats?: KeywordFrequencyItem[] | null;
  keywordFrequencies?: KeywordFrequencyItem[] | null;
  starDistribution?: Record<
    string,
    { Positive: number; Neutral: number; Negative: number; total: number }
  > | null;
  isEcommerce: boolean;
  onSelectKeyword?: (keyword: string | null) => void;
  onSelectStarRating?: (stars: number | null) => void;
  selectedKeyword?: string | null;
  selectedStarRating?: number | null;
}

export const TopKeywordsWidget: React.FC<TopKeywordsWidgetProps> = ({
  keywordStats,
  keywordFrequencies,
  starDistribution,
  isEcommerce,
  onSelectKeyword,
  onSelectStarRating,
  selectedKeyword,
  selectedStarRating,
}) => {
  const [activeTab, setActiveTab] = useState<'keywords' | 'ratings'>(
    isEcommerce && starDistribution ? 'ratings' : 'keywords'
  );

  const rawKeywords = keywordStats || keywordFrequencies || [];
  const keywords = Array.isArray(rawKeywords) ? rawKeywords : [];

  // Prepare Star Rating chart data
  const starData = starDistribution
    ? [5, 4, 3, 2, 1].map((r) => {
        const item = (starDistribution as any)[String(r)] || {
          Positive: 0,
          Neutral: 0,
          Negative: 0,
          total: 0,
        };
        return {
          rating: `${r} ★`,
          stars: r,
          Positive: item.Positive ?? 0,
          Neutral: item.Neutral ?? 0,
          Negative: item.Negative ?? 0,
          total: item.total ?? 0,
        };
      })
    : [];

  const handleStarBarClick = (data: any) => {
    if (!onSelectStarRating || !data) return;
    const clickedRating = data.stars || (data.activePayload && data.activePayload[0]?.payload?.stars);
    if (clickedRating) {
      if (selectedStarRating === clickedRating) {
        onSelectStarRating(null);
      } else {
        onSelectStarRating(clickedRating);
      }
    }
  };

  return (
    <div className="obsidian-card rounded-2xl p-5 shadow-2xl flex flex-col h-full transition-all">
      <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-3">
        <div className="flex items-center gap-2">
          {activeTab === 'ratings' ? (
            <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
          ) : (
            <Sparkles className="w-4 h-4 text-purple-400" />
          )}
          <div>
            <h3 className="text-sm font-bold text-slate-100 tracking-tight">
              {activeTab === 'ratings'
                ? 'Star Rating Distribution (1★–5★)'
                : 'Top Linguistic Keywords & Phrases'}
            </h3>
            <p className="text-[11px] text-slate-400">
              {activeTab === 'ratings'
                ? 'Review volume segmented by star rating (click bar to filter)'
                : 'Recurring issues & praise extracted dynamically (click chip to filter)'}
            </p>
          </div>
        </div>

        {/* Tab Switcher if e-commerce */}
        {isEcommerce && starDistribution && (
          <div className="flex items-center bg-white/5 p-0.5 rounded-lg border border-white/10 text-xs">
            <button
              onClick={() => setActiveTab('ratings')}
              className={`px-2.5 py-1 rounded-md transition-all font-medium flex items-center gap-1 cursor-pointer ${
                activeTab === 'ratings'
                  ? 'bg-amber-500/20 text-amber-300 font-semibold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Star className="w-3 h-3" /> Stars
            </button>
            <button
              onClick={() => setActiveTab('keywords')}
              className={`px-2.5 py-1 rounded-md transition-all font-medium flex items-center gap-1 cursor-pointer ${
                activeTab === 'keywords'
                  ? 'bg-purple-500/20 text-purple-300 font-semibold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Tag className="w-3 h-3" /> Keywords
            </button>
          </div>
        )}
      </div>

      {activeTab === 'ratings' && starData.length > 0 ? (
        <div className="w-full flex-1 min-h-[220px]">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={starData}
              layout="vertical"
              margin={{ top: 10, right: 24, left: 0, bottom: 5 }}
              onClick={handleStarBarClick}
            >
              <XAxis
                type="number"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              />
              <YAxis
                type="category"
                dataKey="rating"
                width={50}
                tick={{ fill: '#f59e0b', fontSize: 12, fontWeight: 600 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-[#0C0E14] border border-white/10 p-3 rounded-xl shadow-2xl backdrop-blur-md">
                        <div className="text-xs font-semibold text-amber-400 mb-1 flex items-center justify-between">
                          <span>{data.rating} Reviews</span>
                          <span className="font-mono tabular-nums text-slate-300 ml-2">
                            {data.total.toLocaleString()} total
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-[11px] pt-1 font-mono tabular-nums">
                          <span className="text-emerald-400">
                            +{data.Positive} Pos
                          </span>
                          <span className="text-sky-400">
                            ~{data.Neutral} Neu
                          </span>
                          <span className="text-rose-400">
                            -{data.Negative} Neg
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1 italic">Click bar to filter stream</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="Positive" stackId="a" fill="#10B981" cursor="pointer" />
              <Bar dataKey="Neutral" stackId="a" fill="#0EA5E9" cursor="pointer" />
              <Bar dataKey="Negative" stackId="a" fill="#F43F5E" radius={[0, 4, 4, 0]} cursor="pointer" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-center">
          {keywords.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400 text-center">
              <Layers className="w-8 h-8 text-slate-600 mb-2" />
              <p className="text-sm">No recurring keywords extracted</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 py-3 overflow-y-auto max-h-[220px]">
              {keywords.map((kw, idx) => {
                const isPos = kw.sentiment === 'Positive';
                const isSelected = selectedKeyword === kw.keyword;
                return (
                  <button
                    key={`${kw.keyword}-${idx}`}
                    onClick={() => {
                      if (onSelectKeyword) {
                        onSelectKeyword(isSelected ? null : kw.keyword);
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-400 shadow-md ring-2 ring-indigo-400/40'
                        : isPos
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20 hover:border-emerald-500/50 hover:bg-emerald-500/15'
                        : 'bg-rose-500/10 text-rose-300 border-rose-500/20 hover:border-rose-500/50 hover:bg-rose-500/15'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSelected ? 'bg-white' : isPos ? 'bg-emerald-400' : 'bg-rose-400'
                      }`}
                    />
                    <span>{kw.keyword}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold font-mono tabular-nums ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : isPos
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {kw.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="pt-2 text-center text-[11px] text-slate-400 border-t border-white/5 mt-auto flex items-center justify-between">
        <span>
          {activeTab === 'ratings'
            ? 'Segmented by star rating'
            : 'Extracted high-signal linguistic phrases'}
        </span>
        {(selectedKeyword || selectedStarRating) && (
          <span className="text-indigo-400 font-semibold">Active Filter Applied</span>
        )}
      </div>
    </div>
  );
};

export default TopKeywordsWidget;
