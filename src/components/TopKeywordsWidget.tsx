import React, { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts';
import { Sparkles, Star, Tag, Layers } from 'lucide-react';
import { KeywordFrequencyItem } from '../types';

interface TopKeywordsWidgetProps {
  keywordStats?: KeywordFrequencyItem[] | null;
  keywordFrequencies?: KeywordFrequencyItem[] | null;
  starDistribution?: Record<
    string,
    { Positive: number; Neutral: number; Negative: number; total: number }
  > | null;
  isEcommerce: boolean;
}

export const TopKeywordsWidget: React.FC<TopKeywordsWidgetProps> = ({
  keywordStats,
  keywordFrequencies,
  starDistribution,
  isEcommerce,
}) => {
  const [activeTab, setActiveTab] = useState<'keywords' | 'ratings'>(
    isEcommerce && starDistribution ? 'ratings' : 'keywords'
  );

  const keywords = keywordStats || keywordFrequencies || [];

  // Prepare Star Rating chart data
  const starData = starDistribution
    ? [5, 4, 3, 2, 1].map((r) => {
        const item = starDistribution[String(r)] || {
          Positive: 0,
          Neutral: 0,
          Negative: 0,
          total: 0,
        };
        return {
          rating: `${r} ★`,
          Positive: item.Positive,
          Neutral: item.Neutral,
          Negative: item.Negative,
          total: item.total,
        };
      })
    : [];

  return (
    <div className="bg-[#0f172a] border border-[#1e293b] rounded-2xl p-5 shadow-xl hover:border-slate-700/80 transition-all backdrop-blur-sm flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 border-b border-[#1e293b] mb-3">
        <div className="flex items-center gap-2">
          {activeTab === 'ratings' ? (
            <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
          ) : (
            <Sparkles className="w-5 h-5 text-purple-400" />
          )}
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              {activeTab === 'ratings'
                ? 'Star Rating Distribution (1★–5★)'
                : 'Top Linguistic Keywords & Phrases'}
            </h3>
            <p className="text-xs text-slate-400">
              {activeTab === 'ratings'
                ? 'Review volume segmented by star rating'
                : 'Recurring issues & praise extracted dynamically'}
            </p>
          </div>
        </div>

        {/* Tab Switcher if e-commerce */}
        {isEcommerce && starDistribution && (
          <div className="flex items-center bg-slate-800/60 p-0.5 rounded-lg border border-slate-700/60 text-xs">
            <button
              onClick={() => setActiveTab('ratings')}
              className={`px-2.5 py-1 rounded-md transition-all font-medium flex items-center gap-1 ${
                activeTab === 'ratings'
                  ? 'bg-amber-500/20 text-amber-300 font-semibold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Star className="w-3 h-3" /> Stars
            </button>
            <button
              onClick={() => setActiveTab('keywords')}
              className={`px-2.5 py-1 rounded-md transition-all font-medium flex items-center gap-1 ${
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
            >
              <XAxis
                type="number"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                axisLine={{ stroke: '#334155' }}
              />
              <YAxis
                type="category"
                dataKey="rating"
                width={50}
                tick={{ fill: '#f59e0b', fontSize: 12, fontWeight: 600 }}
                axisLine={{ stroke: '#334155' }}
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-slate-950/95 border border-slate-700/80 p-3 rounded-xl shadow-2xl backdrop-blur-md">
                        <div className="text-xs font-semibold text-amber-400 mb-1">
                          {data.rating} Reviews ({data.total.toLocaleString()} total)
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-[11px] pt-1">
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
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="Positive" stackId="a" fill="#10b981" />
              <Bar dataKey="Neutral" stackId="a" fill="#38bdf8" />
              <Bar dataKey="Negative" stackId="a" fill="#f43f5e" radius={[0, 4, 4, 0]} />
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
                return (
                  <div
                    key={`${kw.keyword}-${idx}`}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all hover:scale-105 cursor-default ${
                      isPos
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isPos ? 'bg-emerald-400' : 'bg-rose-400'
                      }`}
                    />
                    <span>{kw.keyword}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                        isPos
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {kw.count}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="pt-2 text-center text-[11px] text-slate-400 border-t border-slate-800/60 mt-auto">
        {activeTab === 'ratings'
          ? 'Stacked by sentiment polarity (Emerald: Positive, Rose: Negative)'
          : 'Extracted with high-signal linguistic keyword frequency count'}
      </div>
    </div>
  );
};

