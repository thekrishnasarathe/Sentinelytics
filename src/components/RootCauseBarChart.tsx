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

const BAR_COLORS = ['#F43F5E', '#FB7185', '#FDA4AF', '#FECDD3', '#E11D48'];

export const RootCauseBarChart: React.FC<RootCauseBarChartProps> = ({
  rootCauses,
  platform,
  selectedCause,
  onSelectCause,
}) => {
  const chartData = (rootCauses || []).map((item, idx) => ({
    category: item.category || 'Other',
    count: item.count ?? 0,
    percentage: item.percentage ?? 0,
    color: BAR_COLORS[idx % BAR_COLORS.length],
    samples: item.sample_comments || [],
  }));

  const totalNegativeInCauses = chartData.reduce((acc, curr) => acc + (curr.count || 0), 0);

  return (
    <div className="obsidian-card rounded-2xl p-5 shadow-2xl flex flex-col h-full transition-all">
      <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400" />
          <div>
            <h3 className="text-sm font-bold text-slate-100 tracking-tight">
              Tier-2 Root-Cause Breakdown
            </h3>
            <p className="text-[11px] text-slate-400">
              Domain-adaptive failure modes ({((platform || 'General')).toUpperCase()}) &bull; Click bar to filter
            </p>
          </div>
        </div>

        {selectedCause && (
          <button
            onClick={() => onSelectCause && onSelectCause(null)}
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 transition-all cursor-pointer"
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
              onClick={(e: any) => {
                if (e && e.activePayload && e.activePayload[0]) {
                  const clicked = e.activePayload[0].payload.category;
                  if (onSelectCause) {
                    onSelectCause(selectedCause === clicked ? null : clicked);
                  }
                }
              }}
            >
              <XAxis
                type="number"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                tickLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              />
              <YAxis
                type="category"
                dataKey="category"
                width={150}
                tick={{ fill: '#cbd5e1', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
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
                      <div className="bg-[#0C0E14] border border-white/10 p-3 rounded-xl shadow-2xl backdrop-blur-md">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: data.color }}
                          />
                          <span className="text-xs font-semibold text-slate-200">
                            {data.category}
                          </span>
                        </div>
                        <div className="text-xs font-bold text-white font-mono tabular-nums">
                          {data.count.toLocaleString()} occurrences{' '}
                          <span className="text-slate-400 font-normal">
                            ({data.percentage}%)
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1 italic">Click bar to isolate in stream</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="count" radius={[0, 6, 6, 0]} cursor="pointer">
                {chartData.map((entry, index) => {
                  const isSelected = selectedCause === entry.category;
                  return (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.color}
                      opacity={selectedCause && !isSelected ? 0.35 : 1}
                      stroke={isSelected ? '#FFFFFF' : 'none'}
                      strokeWidth={isSelected ? 1.5 : 0}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="pt-2 text-center text-[11px] text-slate-400 border-t border-white/5 mt-auto flex items-center justify-between">
        <span>Click any bar to filter comments</span>
        <span className="font-mono tabular-nums text-slate-300">
          {totalNegativeInCauses.toLocaleString()} total complaints
        </span>
      </div>
    </div>
  );
};

export default RootCauseBarChart;
