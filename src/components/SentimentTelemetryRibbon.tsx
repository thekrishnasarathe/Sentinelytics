import React from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  TrendingUp,
  SlidersHorizontal,
  ChevronRight,
  Filter,
  X,
} from 'lucide-react';

interface SentimentTelemetryRibbonProps {
  negCount: number;
  negPct: number;
  posCount: number;
  posPct: number;
  neuCount: number;
  neuPct: number;
  totalComments: number;
  avgScore: number;
  sarcasmCount: number;
  activeSentiment: 'Negative' | 'Positive' | 'Neutral' | null;
  onSelectSentiment: (sentiment: 'Negative' | 'Positive' | 'Neutral' | null) => void;
  onlySarcastic: boolean;
  onToggleSarcasm: (active: boolean) => void;
  onScrollToExplorer?: () => void;
}

export const SentimentTelemetryRibbon: React.FC<SentimentTelemetryRibbonProps> = ({
  negCount,
  negPct,
  posCount,
  posPct,
  neuCount,
  neuPct,
  totalComments,
  avgScore,
  sarcasmCount,
  activeSentiment,
  onSelectSentiment,
  onlySarcastic,
  onToggleSarcasm,
  onScrollToExplorer,
}) => {
  const handleSegmentClick = (sentiment: 'Negative' | 'Positive' | 'Neutral') => {
    if (activeSentiment === sentiment) {
      onSelectSentiment(null);
    } else {
      onSelectSentiment(sentiment);
    }
    if (onScrollToExplorer) onScrollToExplorer();
  };

  const handleSarcasmClick = () => {
    onToggleSarcasm(!onlySarcastic);
    if (onScrollToExplorer) onScrollToExplorer();
  };

  const safeScore = Number(avgScore ?? 0);
  const scoreFormatted = safeScore >= 0 ? `+${safeScore.toFixed(2)}` : safeScore.toFixed(2);
  const scoreColor =
    safeScore > 0.05
      ? 'text-emerald-400'
      : safeScore < -0.05
      ? 'text-rose-400'
      : 'text-sky-400';

  const safeNegCount = negCount ?? 0;
  const safeNeuCount = neuCount ?? 0;
  const safePosCount = posCount ?? 0;
  const safeNegPct = negPct ?? 0;
  const safeNeuPct = neuPct ?? 0;
  const safePosPct = posPct ?? 0;

  return (
    <div className="obsidian-card rounded-2xl p-4 sm:p-5 shadow-2xl transition-all">
      {/* Top Meta Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/5 mb-3.5">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/25 text-indigo-400">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Full-Width Proportional Sentiment Telemetry
              </h3>
              <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-400 bg-white/5 border border-white/10">
                100% Ingested Coverage
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Interactive stacked distribution &bull; Click any segment or sarcasm pill to filter comment stream
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 self-end sm:self-auto">
          {/* Average Polarity Metric */}
          <div className="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-white/5 border border-white/10">
            <span className="text-[11px] text-slate-400 font-medium">Compound Polarity:</span>
            <span className={`text-xs font-bold font-mono tabular-nums ${scoreColor}`}>
              {scoreFormatted}
            </span>
          </div>

          {/* Interactive Sarcasm Clash Pill */}
          <button
            onClick={handleSarcasmClick}
            className={`group flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              onlySarcastic
                ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/25 ring-2 ring-amber-400'
                : sarcasmCount > 0
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25'
                : 'bg-white/5 text-slate-400 border border-white/10 opacity-60'
            }`}
            title="Toggle Sarcasm & Polarity Conflict Filter"
          >
            <Sparkles className={`w-3.5 h-3.5 ${onlySarcastic ? 'text-slate-950' : 'text-amber-400'}`} />
            <span>
              {onlySarcastic ? 'Showing Sarcasm Clashes Only' : `Sarcasm Clashes: ${sarcasmCount}`}
            </span>
            {onlySarcastic ? (
              <X className="w-3.5 h-3.5 ml-1 text-slate-950" />
            ) : (
              <span className="text-[10px] font-mono opacity-70">DeepMoji</span>
            )}
          </button>
        </div>
      </div>

      {/* Proportional Multi-Segment Ribbon Bar */}
      <div className="space-y-2">
        <div className="w-full h-5 rounded-xl bg-black/40 overflow-hidden flex p-0.5 border border-white/10 shadow-inner">
          {/* Negative Segment */}
          {safeNegPct > 0 && (
            <button
              onClick={() => handleSegmentClick('Negative')}
              style={{ width: `${Math.max(2, safeNegPct)}%` }}
              className={`h-full transition-all relative group cursor-pointer first:rounded-l-lg ${
                safePosPct === 0 && safeNeuPct === 0 ? 'rounded-r-lg' : ''
              } ${
                activeSentiment === 'Negative'
                  ? 'bg-rose-500 ring-2 ring-white shadow-lg'
                  : 'bg-rose-500 hover:bg-rose-400'
              }`}
              title={`Negative Sentiment: ${safeNegCount.toLocaleString()} items (${safeNegPct}%)`}
            />
          )}

          {/* Neutral Segment */}
          {safeNeuPct > 0 && (
            <button
              onClick={() => handleSegmentClick('Neutral')}
              style={{ width: `${Math.max(2, safeNeuPct)}%` }}
              className={`h-full transition-all relative group cursor-pointer ${
                safeNegPct === 0 ? 'first:rounded-l-lg' : ''
              } ${safePosPct === 0 ? 'last:rounded-r-lg' : ''} ${
                activeSentiment === 'Neutral'
                  ? 'bg-sky-500 ring-2 ring-white shadow-lg'
                  : 'bg-sky-500 hover:bg-sky-400'
              }`}
              title={`Neutral Sentiment: ${safeNeuCount.toLocaleString()} items (${safeNeuPct}%)`}
            />
          )}

          {/* Positive Segment */}
          {safePosPct > 0 && (
            <button
              onClick={() => handleSegmentClick('Positive')}
              style={{ width: `${Math.max(2, safePosPct)}%` }}
              className={`h-full transition-all relative group cursor-pointer last:rounded-r-lg ${
                safeNegPct === 0 && safeNeuPct === 0 ? 'first:rounded-l-lg' : ''
              } ${
                activeSentiment === 'Positive'
                  ? 'bg-emerald-500 ring-2 ring-white shadow-lg'
                  : 'bg-emerald-500 hover:bg-emerald-400'
              }`}
              title={`Positive Sentiment: ${safePosCount.toLocaleString()} items (${safePosPct}%)`}
            />
          )}
        </div>

        {/* Segment Labels & Click Triggers */}
        <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
          {/* Negative Button */}
          <button
            onClick={() => handleSegmentClick('Negative')}
            className={`flex items-center justify-between p-2 rounded-xl border transition-all text-left cursor-pointer ${
              activeSentiment === 'Negative'
                ? 'bg-rose-500/20 border-rose-500/60 ring-1 ring-rose-500/50'
                : 'bg-white/3 border-white/5 hover:border-white/15'
            }`}
          >
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
              <div>
                <span className="font-semibold text-slate-200 block text-[11px]">Negative Polarity</span>
                <span className="text-[10px] text-slate-400 font-mono tabular-nums">
                  {safeNegCount.toLocaleString()} items
                </span>
              </div>
            </div>
            <span className="font-mono font-bold text-rose-400 text-xs tabular-nums">
              {safeNegPct}%
            </span>
          </button>

          {/* Neutral Button */}
          <button
            onClick={() => handleSegmentClick('Neutral')}
            className={`flex items-center justify-between p-2 rounded-xl border transition-all text-left cursor-pointer ${
              activeSentiment === 'Neutral'
                ? 'bg-sky-500/20 border-sky-500/60 ring-1 ring-sky-500/50'
                : 'bg-white/3 border-white/5 hover:border-white/15'
            }`}
          >
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500 shrink-0" />
              <div>
                <span className="font-semibold text-slate-200 block text-[11px]">Neutral Inquiries</span>
                <span className="text-[10px] text-slate-400 font-mono tabular-nums">
                  {safeNeuCount.toLocaleString()} items
                </span>
              </div>
            </div>
            <span className="font-mono font-bold text-sky-400 text-xs tabular-nums">
              {safeNeuPct}%
            </span>
          </button>

          {/* Positive Button */}
          <button
            onClick={() => handleSegmentClick('Positive')}
            className={`flex items-center justify-between p-2 rounded-xl border transition-all text-left cursor-pointer ${
              activeSentiment === 'Positive'
                ? 'bg-emerald-500/20 border-emerald-500/60 ring-1 ring-emerald-500/50'
                : 'bg-white/3 border-white/5 hover:border-white/15'
            }`}
          >
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
              <div>
                <span className="font-semibold text-slate-200 block text-[11px]">Positive Praise</span>
                <span className="text-[10px] text-slate-400 font-mono tabular-nums">
                  {safePosCount.toLocaleString()} items
                </span>
              </div>
            </div>
            <span className="font-mono font-bold text-emerald-400 text-xs tabular-nums">
              {safePosPct}%
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default SentimentTelemetryRibbon;

