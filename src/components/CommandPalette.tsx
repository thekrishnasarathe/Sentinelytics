import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Layers,
  Filter,
  FileText,
  FileSpreadsheet,
  GitCompare,
  History,
  Key,
  ShieldCheck,
  AlertTriangle,
  Star,
  Zap,
  X,
  ArrowRight,
  Sparkles,
  Command,
  SlidersHorizontal,
  Activity,
  CheckCircle2,
  PieChart as PieChartIcon,
} from 'lucide-react';

export interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  category: 'Presets' | 'Filters' | 'Views' | 'Exports' | 'Settings';
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  badge?: string;
  badgeColor?: string;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPreset: (presetId: string) => void;
  onFilterSentiment?: (sentiment: 'Negative' | 'Positive' | 'Neutral' | null) => void;
  onFilterSarcasm?: (onlySarcastic: boolean) => void;
  onFilterStars?: (stars: number | null) => void;
  onClearFilters?: () => void;
  onExportPdf?: () => void;
  onExportCsv?: () => void;
  onOpenView?: (view: 'dashboard' | 'comparison' | 'history') => void;
  onOpenDrawer?: () => void;
  onOpenKeysModal?: () => void;
  onOpenExtensionModal?: () => void;
  activeFilterCount?: number;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectPreset,
  onFilterSentiment,
  onFilterSarcasm,
  onFilterStars,
  onClearFilters,
  onExportPdf,
  onExportCsv,
  onOpenView,
  onOpenDrawer,
  onOpenKeysModal,
  onOpenExtensionModal,
  activeFilterCount = 0,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Define full command roster
  const commands: CommandItem[] = useMemo(() => [
    // Presets
    {
      id: 'preset-yt',
      title: 'YouTube Flagged Upload',
      subtitle: '1,045 Comments • Critical 72% Negative Alert Active',
      category: 'Presets',
      icon: Layers,
      shortcut: 'P1',
      badge: 'YouTube',
      badgeColor: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      action: () => { onSelectPreset('yt_demo_72neg'); onClose(); },
    },
    {
      id: 'preset-ig',
      title: 'Instagram Creator Reel',
      subtitle: 'Graph Ingestion • Creator Engagement Benchmark',
      category: 'Presets',
      icon: Layers,
      shortcut: 'P2',
      badge: 'Instagram',
      badgeColor: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      action: () => { onSelectPreset('ig_demo_creator_reel'); onClose(); },
    },
    {
      id: 'preset-amz',
      title: 'Amazon Smartphone Reviews',
      subtitle: '1,250 Reviews • ASIN: B09X6GMNP7 • 1★-5★ Hinglish',
      category: 'Presets',
      icon: Layers,
      shortcut: 'P3',
      badge: 'Amazon',
      badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      action: () => { onSelectPreset('amz_smartphone_reviews'); onClose(); },
    },
    {
      id: 'preset-flp',
      title: 'Flipkart Electronics Sale',
      subtitle: '1,250 Reviews • FSN: MOBGH73XHZ6QG9FZ • 76% Neg Alert',
      category: 'Presets',
      icon: Layers,
      shortcut: 'P4',
      badge: 'Flipkart',
      badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      action: () => { onSelectPreset('flp_electronics_sale'); onClose(); },
    },

    // Quick Filters
    {
      id: 'filter-neg',
      title: 'Filter: Negative Comments Only',
      subtitle: 'Isolate critical complaints, hardware defects & negative sentiment',
      category: 'Filters',
      icon: AlertTriangle,
      badge: 'Negative',
      badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
      action: () => { onFilterSentiment?.('Negative'); onClose(); },
    },
    {
      id: 'filter-sarcasm',
      title: 'Filter: Sarcasm & Polarity Clashes Only',
      subtitle: 'Isolate text-emoji conflict comments detected by DeepMoji override engine',
      category: 'Filters',
      icon: Sparkles,
      badge: 'Sarcasm Rule',
      badgeColor: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      action: () => { onFilterSarcasm?.(true); onClose(); },
    },
    {
      id: 'filter-stars-5',
      title: 'Filter: 5-Star Verified Buyers',
      subtitle: 'Show only top-rated authentic purchase reviews',
      category: 'Filters',
      icon: Star,
      badge: '5 ★',
      badgeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      action: () => { onFilterStars?.(5); onClose(); },
    },
    {
      id: 'filter-pos',
      title: 'Filter: Positive Comments Only',
      subtitle: 'View praise, satisfaction highlights & promoter reviews',
      category: 'Filters',
      icon: CheckCircle2,
      badge: 'Positive',
      badgeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      action: () => { onFilterSentiment?.('Positive'); onClose(); },
    },
    {
      id: 'filter-clear',
      title: 'Clear All Active Filters',
      subtitle: `Reset all filters back to full dataset (${activeFilterCount} currently active)`,
      category: 'Filters',
      icon: X,
      badge: 'Reset',
      badgeColor: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
      action: () => { onClearFilters?.(); onClose(); },
    },

    // Views & Navigation
    {
      id: 'view-dashboard',
      title: 'Open Analysis Dashboard',
      subtitle: 'Primary sentiment overview, charts, root causes & comment explorer',
      category: 'Views',
      icon: PieChartIcon,
      shortcut: 'G D',
      action: () => { onOpenView?.('dashboard'); onClose(); },
    },
    {
      id: 'view-comparison',
      title: 'Open Multi-Comparison View',
      subtitle: 'Side-by-side benchmark differential comparison for 2 posts/products',
      category: 'Views',
      icon: GitCompare,
      shortcut: 'G C',
      action: () => { onOpenView?.('comparison'); onClose(); },
    },
    {
      id: 'view-history',
      title: 'Open SQLite History Hub',
      subtitle: 'Audit trail of past runs, indexed cache and comparative timeline',
      category: 'Views',
      icon: History,
      shortcut: 'G H',
      action: () => { onOpenView?.('history'); onClose(); },
    },
    {
      id: 'view-drawer',
      title: 'Open Forensic Inspector Drawer',
      subtitle: 'Examine raw JSON payloads, sentiment tokens & emoji conflict matrix',
      category: 'Views',
      icon: SlidersHorizontal,
      shortcut: 'I',
      action: () => { onOpenDrawer?.(); onClose(); },
    },

    // Exports
    {
      id: 'export-pdf',
      title: 'Export Executive PDF Report',
      subtitle: 'Pre-computed publication-grade PDF report (<15ms latency)',
      category: 'Exports',
      icon: FileText,
      shortcut: '⌘P',
      badge: '<15ms',
      badgeColor: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
      action: () => { onExportPdf?.(); onClose(); },
    },
    {
      id: 'export-csv',
      title: 'Export Multi-Table CSV',
      subtitle: 'Normalized comment table with timestamps, sentiment scores & root causes (<2ms)',
      category: 'Exports',
      icon: FileSpreadsheet,
      shortcut: '⌘E',
      badge: '<2ms',
      badgeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      action: () => { onExportCsv?.(); onClose(); },
    },

    // Settings
    {
      id: 'settings-extension',
      title: 'Browser Extension & Ingestion Guide',
      subtitle: 'Chrome extension setup, DOM live collector & bookmarklet injector',
      category: 'Settings',
      icon: ShieldCheck,
      action: () => { onOpenExtensionModal?.(); onClose(); },
    },
    {
      id: 'settings-keys',
      title: 'Configure API Keys',
      subtitle: 'Manage optional YouTube, Gemini, RapidAPI, Apify & Instagram tokens',
      category: 'Settings',
      icon: Key,
      action: () => { onOpenKeysModal?.(); onClose(); },
    },
  ], [
    onSelectPreset,
    onFilterSentiment,
    onFilterSarcasm,
    onFilterStars,
    onClearFilters,
    onExportPdf,
    onExportCsv,
    onOpenView,
    onOpenDrawer,
    onOpenKeysModal,
    onOpenExtensionModal,
    activeFilterCount,
    onClose,
  ]);

  // Filter commands by search query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    const lower = query.toLowerCase().trim();
    return commands.filter(
      (c) =>
        c.title.toLowerCase().includes(lower) ||
        (c.subtitle && c.subtitle.toLowerCase().includes(lower)) ||
        c.category.toLowerCase().includes(lower) ||
        (c.badge && c.badge.toLowerCase().includes(lower))
    );
  }, [commands, query]);

  // Auto focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Reset selected index when filtered list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands]);

  // Keyboard navigation within palette
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredCommands.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % Math.max(1, filteredCommands.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, filteredCommands, onClose]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/75 backdrop-blur-md transition-all animate-in fade-in duration-150">
      <div 
        className="fixed inset-0" 
        onClick={onClose} 
        aria-hidden="true" 
      />

      <div className="relative w-full max-w-2xl bg-[#101218] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[75vh] z-10 obsidian-card">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-white/5 bg-[#0C0E14]">
          <Search className="w-4 h-4 text-slate-400 mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands, presets, filters, or views... (↑ ↓ to navigate, ↵ to select)"
            className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none font-sans"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded-md text-slate-400 hover:text-white transition mr-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-mono font-semibold text-slate-400 bg-white/5 border border-white/10 rounded">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div ref={listRef} className="overflow-y-auto p-2 divide-y divide-white/5 space-y-1">
          {filteredCommands.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              <p>No matching commands found for &ldquo;{query}&rdquo;</p>
              <p className="mt-1 text-[11px] text-slate-600">Try searching for &ldquo;Negative&rdquo;, &ldquo;Sarcasm&rdquo;, &ldquo;PDF&rdquo;, or &ldquo;Amazon&rdquo;</p>
            </div>
          ) : (
            filteredCommands.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  data-index={idx}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`group flex items-center justify-between p-2.5 rounded-xl text-left cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-indigo-600/15 border border-indigo-500/40 text-white shadow-sm'
                      : 'hover:bg-white/5 text-slate-300 border border-transparent'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
                    <div
                      className={`p-2 rounded-lg shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                          : 'bg-white/5 text-slate-400 border border-white/5'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-semibold tracking-tight text-slate-100 truncate">
                          {item.title}
                        </span>
                        {item.badge && (
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-medium border ${
                              item.badgeColor || 'bg-white/5 text-slate-400 border-white/10'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </div>
                      {item.subtitle && (
                        <p className="text-[11px] text-slate-400 truncate mt-0.5 font-sans">
                          {item.subtitle}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0 ml-3">
                    {item.shortcut && (
                      <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-white/5 border border-white/10 rounded">
                        {item.shortcut}
                      </kbd>
                    )}
                    <ArrowRight
                      className={`w-3.5 h-3.5 transition-transform ${
                        isSelected ? 'text-indigo-400 translate-x-0.5' : 'text-slate-600'
                      }`}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Navigation Hints */}
        <div className="px-4 py-2 border-t border-white/5 bg-[#0C0E14] flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1">
              <kbd className="font-mono text-[10px] bg-white/5 px-1 rounded border border-white/10">↑</kbd>
              <kbd className="font-mono text-[10px] bg-white/5 px-1 rounded border border-white/10">↓</kbd>
              <span>to navigate</span>
            </span>
            <span className="flex items-center space-x-1">
              <kbd className="font-mono text-[10px] bg-white/5 px-1 rounded border border-white/10">↵</kbd>
              <span>to select</span>
            </span>
            <span className="flex items-center space-x-1">
              <kbd className="font-mono text-[10px] bg-white/5 px-1 rounded border border-white/10">ESC</kbd>
              <span>to close</span>
            </span>
          </div>
          <div className="flex items-center space-x-1 font-mono text-[10px] text-indigo-400">
            <span>Sentinelytics Telemetry</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;

