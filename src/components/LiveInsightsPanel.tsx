import React from 'react';
import {
  Sparkles,
  AlertTriangle,
  Lightbulb,
  Gauge,
  CheckCircle,
  HelpCircle,
} from 'lucide-react';

interface LiveInsightsPanelProps {
  executiveSummary?: string | null;
  painPoints?: string[] | null;
  recommendations?: string[] | null;
  overallConfidenceScore?: number | null;
  overallSubjectivityScore?: number | null;
  platform: string;
}

export const LiveInsightsPanel: React.FC<LiveInsightsPanelProps> = ({
  executiveSummary,
  painPoints,
  recommendations,
  overallConfidenceScore = 0.88,
  overallSubjectivityScore = 0.62,
  platform,
}) => {
  const confPct = Math.round((overallConfidenceScore || 0.88) * 100);
  const subjPct = Math.round((overallSubjectivityScore || 0.62) * 100);

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border border-indigo-500/30 rounded-2xl p-6 shadow-2xl backdrop-blur-md mb-8">
      {/* Top Banner Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shadow-inner">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-white tracking-tight">
                AI Executive Insights & Recommendations
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                2-Tier NLP Engine
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Automated synthesis for {platform.toUpperCase()} target
            </p>
          </div>
        </div>

        {/* Meters */}
        <div className="flex items-center gap-6 bg-slate-950/60 px-4 py-2 rounded-xl border border-slate-800">
          <div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1 gap-3">
              <span className="flex items-center gap-1 font-medium">
                <Gauge className="w-3 h-3 text-emerald-400" /> Confidence
              </span>
              <span className="text-emerald-400 font-bold">{confPct}%</span>
            </div>
            <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                style={{ width: `${confPct}%` }}
              />
            </div>
          </div>

          <div className="w-px h-8 bg-slate-800" />

          <div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1 gap-3">
              <span className="flex items-center gap-1 font-medium">
                <HelpCircle className="w-3 h-3 text-sky-400" /> Subjectivity
              </span>
              <span className="text-sky-400 font-bold">{subjPct}%</span>
            </div>
            <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-sky-500 rounded-full transition-all duration-700"
                style={{ width: `${subjPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Executive Summary Card */}
      {executiveSummary && (
        <div className="bg-slate-950/50 border border-slate-800/80 p-4 rounded-xl mb-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-indigo-400 mb-1.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
            Executive Summary
          </div>
          <p className="text-sm text-slate-200 leading-relaxed font-normal">
            {executiveSummary}
          </p>
        </div>
      )}

      {/* Grid: Pain Points vs Recommendations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Pain Points */}
        <div className="bg-rose-950/20 border border-rose-900/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <h4 className="text-sm font-bold text-rose-200">
              Key Customer Pain Points
            </h4>
          </div>
          <div className="space-y-2.5">
            {(painPoints && painPoints.length > 0
              ? painPoints
              : ['No critical friction points detected in sample.']
            ).map((point, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2.5 text-xs text-slate-300 leading-relaxed"
              >
                <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <span>{point}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Actionable Recommendations */}
        <div className="bg-emerald-950/20 border border-emerald-900/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-emerald-400" />
            <h4 className="text-sm font-bold text-emerald-200">
              Actionable Recommendations
            </h4>
          </div>
          <div className="space-y-2.5">
            {(recommendations && recommendations.length > 0
              ? recommendations
              : ['Continue tracking engagement and customer sentiment.']
            ).map((rec, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2.5 text-xs text-slate-300 leading-relaxed"
              >
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                  <CheckCircle className="w-3 h-3" />
                </span>
                <span>{rec}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

