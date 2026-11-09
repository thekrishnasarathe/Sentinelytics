import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { AlertTriangle, ShieldCheck, Activity } from 'lucide-react';
import { SentimentBreakdownRow } from '../types';

interface SentimentDonutChartProps {
  breakdown: SentimentBreakdownRow[];
  totalValidComments: number;
  highNegativeAlert: boolean;
}

const COLOR_MAP: Record<string, string> = {
  Positive: '#10b981', // Emerald
  Negative: '#f43f5e', // Rose
  Neutral: '#38bdf8',  // Sky
};

export const SentimentDonutChart: React.FC<SentimentDonutChartProps> = ({
  breakdown,
  totalValidComments,
  highNegativeAlert,
}) => {
  const chartData = (breakdown || []).map((row) => ({
    name: row.category,
    value: row.comment_count,
    percentage: row.percentage,
    color: COLOR_MAP[row.category] || '#94a3b8',
  }));

  const posRow = breakdown.find((r) => r.category === 'Positive');
  const negRow = breakdown.find((r) => r.category === 'Negative');
  const netScore = posRow && negRow ? Math.round(posRow.percentage - negRow.percentage) : 0;

  return (
    <div className="bg-[#0f172a] border border-[#1e293b] rounded-2xl p-5 shadow-xl hover:border-slate-700/80 transition-all backdrop-blur-sm flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 border-b border-[#1e293b] mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-indigo-400" />
          <h3 className="text-base font-semibold text-slate-100">Sentiment Breakdown</h3>
        </div>
        {highNegativeAlert ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5" /> High Negative Alert (&gt;70%)
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
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
                    <div className="bg-slate-950/95 border border-slate-700/80 px-3.5 py-2.5 rounded-xl shadow-2xl backdrop-blur-md">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: data.color }}
                        />
                        <span className="text-xs font-semibold text-slate-200">
                          {data.name}
                        </span>
                      </div>
                      <div className="text-sm font-bold text-white">
                        {data.value.toLocaleString()} comments{' '}
                        <span className="text-xs text-slate-400 font-normal">
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
              animationDuration={800}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Center Donut KPI */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            Net Score
          </span>
          <span
            className={`text-2xl font-extrabold ${
              netScore > 0
                ? 'text-emerald-400'
                : netScore < 0
                ? 'text-rose-400'
                : 'text-slate-300'
            }`}
          >
            {netScore > 0 ? `+${netScore}` : netScore}
          </span>
          <span className="text-[11px] text-slate-400">
            {totalValidComments.toLocaleString()} valid
          </span>
        </div>
      </div>

      {/* Legend & Stats Pills */}
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[#1e293b] mt-2">
        {chartData.map((item) => (
          <div
            key={item.name}
            className="flex flex-col items-center p-2 rounded-xl bg-[#0b1120] border border-[#1e293b]"
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-xs font-medium text-slate-300">
                {item.name}
              </span>
            </div>
            <span className="text-sm font-bold text-slate-100">
              {item.percentage}%
            </span>
            <span className="text-[10px] text-slate-400">
              {item.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

