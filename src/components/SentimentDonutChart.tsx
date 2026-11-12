import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { AlertTriangle, ShieldCheck, Activity } from 'lucide-react';
import { SentimentBreakdownRow } from '../types';

interface SentimentDonutChartProps {
  breakdown: SentimentBreakdownRow[];
  totalValidComments: number;
  highNegativeAlert: boolean;
  onSelectCategory?: (category: 'Negative' | 'Positive' | 'Neutral') => void;
  activeCategory?: string | null;
}

const COLOR_MAP: Record<string, string> = {
  Positive: '#10B981', // Emerald
  Negative: '#F43F5E', // Rose
  Neutral: '#0EA5E9',  // Sky
};

export const SentimentDonutChart: React.FC<SentimentDonutChartProps> = ({
  breakdown,
  totalValidComments,
  highNegativeAlert,
  onSelectCategory,
  activeCategory,
}) => {
  const safeBreakdown = breakdown || [];
  const chartData = safeBreakdown.map((row) => ({
    name: row.category,
    value: row.comment_count ?? 0,
    percentage: row.percentage ?? 0,
    color: COLOR_MAP[row.category] || '#94a3b8',
  }));

  const posRow = safeBreakdown.find((r) => r.category === 'Positive');
  const negRow = safeBreakdown.find((r) => r.category === 'Negative');
  const netScore = posRow && negRow ? Math.round((posRow.percentage ?? 0) - (negRow.percentage ?? 0)) : 0;

  return (
    <div className="obsidian-card rounded-2xl p-5 shadow-2xl flex flex-col h-full transition-all">
      <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-bold text-slate-100 tracking-tight">Sentiment Breakdown</h3>
        </div>
        {highNegativeAlert ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5" /> High Negative Alert (&gt;70%)
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <ShieldCheck className="w-3.5 h-3.5" /> Healthy Distribution
          </span>
        )}
      </div>

      {/* Donut Chart Container with Center KPI */}
      <div className="relative w-full h-56 flex items-center justify-center my-auto">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-[#0C0E14] border border-white/10 px-3.5 py-2 rounded-xl shadow-2xl backdrop-blur-md">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: data.color }}
                        />
                        <span className="text-xs font-semibold text-slate-200">
                          {data.name}
                        </span>
                      </div>
                      <div className="text-xs font-bold text-white font-mono tabular-nums">
                        {data.value.toLocaleString()} comments{' '}
                        <span className="text-slate-400 font-normal">
                          ({data.percentage}%)
                        </span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={68}
              outerRadius={96}
              paddingAngle={4}
              dataKey="value"
              stroke="none"
              animationDuration={600}
              cursor="pointer"
              onClick={(e) => onSelectCategory && onSelectCategory(e.name as any)}
            >
              {chartData.map((entry, index) => {
                const isSelected = activeCategory === entry.name;
                return (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.color}
                    opacity={activeCategory && !isSelected ? 0.45 : 1}
                    stroke={isSelected ? '#ffffff' : 'none'}
                    strokeWidth={isSelected ? 2 : 0}
                  />
                );
              })}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Center Donut KPI */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Net Score
          </span>
          <span
            className={`text-2xl font-black font-mono tabular-nums ${
              netScore > 0
                ? 'text-emerald-400'
                : netScore < 0
                ? 'text-rose-400'
                : 'text-slate-300'
            }`}
          >
            {netScore > 0 ? `+${netScore}` : netScore}
          </span>
          <span className="text-[10px] text-slate-400 font-mono tabular-nums">
            {(totalValidComments ?? 0).toLocaleString()} items
          </span>
        </div>
      </div>

      {/* Legend & Stats Interactive Pills */}
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/5 mt-2">
        {chartData.map((item) => {
          const isSelected = activeCategory === item.name;
          return (
            <button
              key={item.name}
              onClick={() => onSelectCategory && onSelectCategory(item.name as any)}
              className={`flex flex-col items-center p-2 rounded-xl border transition-all cursor-pointer text-center ${
                isSelected
                  ? 'bg-indigo-600/20 border-indigo-500/50 shadow-sm'
                  : 'bg-white/3 border-white/5 hover:border-white/15'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-xs font-semibold text-slate-200">
                  {item.name}
                </span>
              </div>
              <span className="text-sm font-bold font-mono tabular-nums text-slate-100">
                {item.percentage}%
              </span>
              <span className="text-[10px] text-slate-400 font-mono tabular-nums">
                {item.value.toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SentimentDonutChart;
