import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from 'recharts';
import { AlertCircle, Filter, X } from 'lucide-react';
import { Tier2RootCauseBreakdown } from '../types';

interface RootCauseBarChartProps {
  rootCauses: Tier2RootCauseBreakdown[];
  platform: string;
  selectedCause?: string | null;
  onSelectCause?: (cause: string | null) => void;
}

const BAR_COLORS = ['#f43f5e', '#fb7185', '#fda4af', '#fecdd3', '#e11d48'];

export const RootCauseBarChart: React.FC<RootCauseBarChartProps> = ({
  rootCauses,
  platform,
  selectedCause,
  onSelectCause,
}) => {
  const chartData = (rootCauses || []).map((item, idx) => ({
    category: item.category,
    count: item.count,
    percentage: item.percentage,
    color: BAR_COLORS[idx % BAR_COLORS.length],
    samples: item.sample_comments || [],
  }));

  const totalNegativeInCauses = chartData.reduce((acc, curr) => acc + curr.count, 0);

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-sm flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-rose-400" />
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              Tier-2 Root-Cause Breakdown
            </h3>
            <p className="text-xs text-slate-400">
              Domain-adaptive failure modes ({platform})
            </p>
          </div>
        </div>

        {selectedCause && (
          <button
            onClick={() => onSelectCause && onSelectCause(null)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 transition-all"
            title="Clear filter"
          >
            <Filter className="w-3 h-3" />
            Filtered: {selectedCause.slice(0, 16)}...
            <X className="w-3 h-3 ml-1" />
          </button>
        )}
      </div>

      {totalNegativeInCauses === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 py-12 text-center text-slate-400">
          <AlertCircle className="w-8 h-8 text-slate-600 mb-2" />
          <p className="text-sm font-medium">No negative friction points detected</p>
          <p className="text-xs text-slate-400 mt-1">100% positive and neutral community feedback</p>
        </div>
      ) : (
        <div className="w-full flex-1 min-h-[220px]">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              layout="vertical"
              data={chartData}
              margin={{ top: 10, right: 24, left: 10, bottom: 5 }}
            >
              <XAxis
                type="number"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                axisLine={{ stroke: '#334155' }}
                tickLine={{ stroke: '#334155' }}
              />
              <YAxis
                type="category"
                dataKey="category"
                width={150}
                tick={{ fill: '#cbd5e1', fontSize: 11 }}
                axisLine={{ stroke: '#334155' }}
                tickLine={false}
                tickFormatter={(val: string) =>
                  val.length > 20 ? `${val.slice(0, 19)}…` : val
                }
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-slate-950/95 border border-slate-700/80 p-3 rounded-xl shadow-2xl backdrop-blur-md max-w-xs">
                        <div className="text-xs font-semibold text-rose-400 mb-1">
                          {data.category}
                        </div>
                        <div className="text-sm font-bold text-white mb-2">
                          {data.count.toLocaleString()} comments ({data.percentage}%)
                        </div>
                        {data.samples && data.samples.length > 0 && (
                          <div className="text-[11px] text-slate-300 italic border-t border-slate-800 pt-1.5 line-clamp-2">
                            "{data.samples[0]}"
                          </div>
                        )}
                        <div className="mt-2 text-[10px] text-indigo-400 font-medium">
                          Click bar to filter feed
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar
                dataKey="count"
                radius={[0, 6, 6, 0]}
                cursor="pointer"
                onClick={(entry: any) => {
                  if (onSelectCause) {
                    onSelectCause(
                      selectedCause === entry.category ? null : entry.category
                    );
                  }
                }}
              >
                {chartData.map((entry) => (
                  <Cell
                    key={entry.category}
                    fill={entry.color}
                    opacity={
                      selectedCause
                        ? selectedCause === entry.category
                          ? 1
                          : 0.35
                        : 0.9
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Footer Instructions */}
      <div className="pt-2 text-center text-[11px] text-slate-400 border-t border-slate-800/60 mt-1">
        Click on any bar to filter the comment inspection feed by root cause
      </div>
    </div>
  );
};

