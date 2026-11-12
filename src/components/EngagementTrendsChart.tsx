import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { TrendingUp, Clock } from 'lucide-react';
import { TimelineBucket } from '../types';

export interface EngagementTrendsChartProps {
  buckets?: any[] | null;
}

export const EngagementTrendsChart: React.FC<EngagementTrendsChartProps> = ({
  buckets,
}) => {
  const chartData = (buckets || []).map((b: any) => ({
    name: b.label || b.name || '',
    Positive: b.positive ?? b.Positive ?? 0,
    Neutral: b.neutral ?? b.Neutral ?? 0,
    Negative: b.negative ?? b.Negative ?? 0,
    total: b.total ?? 0,
  }));

  const hasData = chartData.length > 0;

  return (
    <div className="obsidian-card rounded-2xl p-5 shadow-2xl flex flex-col h-full transition-all">
      <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-sky-400" />
          <div>
            <h3 className="text-sm font-bold text-slate-100 tracking-tight">
              Engagement Volume & Polarity Trend
            </h3>
            <p className="text-[11px] text-slate-400">
              Chronological wave intervals across extracted dataset
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-white/5 px-2.5 py-1 rounded-lg border border-white/10 font-mono tabular-nums">
          <Clock className="w-3.5 h-3.5 text-indigo-400" />
          <span>{chartData.length} Wave Buckets</span>
        </div>
      </div>

      {!hasData ? (
        <div className="flex flex-col items-center justify-center flex-1 py-12 text-center text-slate-400">
          <TrendingUp className="w-8 h-8 text-slate-600 mb-2" />
          <p className="text-sm font-medium">No timeline wave data available</p>
        </div>
      ) : (
        <div className="w-full flex-1 min-h-[220px]">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 15, left: -10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorPositive" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="colorNeutral" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0EA5E9" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#0EA5E9" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="colorNegative" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#F43F5E" stopOpacity={0.0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="name"
                tick={{ fill: '#94a3b8', fontSize: 10 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              />
              <YAxis
                tick={{ fill: '#94a3b8', fontSize: 10 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-[#0C0E14] border border-white/10 p-3 rounded-xl shadow-2xl backdrop-blur-md">
                        <div className="text-xs font-semibold text-slate-200 mb-1">
                          Wave: {data.name}
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-[11px] font-mono tabular-nums">
                          <span className="text-emerald-400">+{data.Positive} Pos</span>
                          <span className="text-sky-400">~{data.Neutral} Neu</span>
                          <span className="text-rose-400">-{data.Negative} Neg</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="Positive"
                stroke="#10B981"
                fillOpacity={1}
                fill="url(#colorPositive)"
              />
              <Area
                type="monotone"
                dataKey="Neutral"
                stroke="#0EA5E9"
                fillOpacity={1}
                fill="url(#colorNeutral)"
              />
              <Area
                type="monotone"
                dataKey="Negative"
                stroke="#F43F5E"
                fillOpacity={1}
                fill="url(#colorNegative)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="pt-2 text-center text-[11px] text-slate-400 border-t border-white/5 mt-auto flex items-center justify-between">
        <span>Timeline distribution wave</span>
        <span className="font-mono text-slate-300">Normalized ISO Intervals</span>
      </div>
    </div>
  );
};

export default EngagementTrendsChart;
