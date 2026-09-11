/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { LanguagePhrases, Portfolio, InstrumentGroup } from '../types.ts';
import { TickerMetric, PortfolioLot, buildAggregatedPositions, AggregatedTickerPosition } from '../utils/finance.ts';
import { formatDateString } from '../utils.ts';
import { QuantityDisplay } from './QuantityDisplay';
import { formatFullQuantity } from '../utils/formatters';
import {
  Search,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  HelpCircle,
  Briefcase,
  Layers,
  TrendingUp,
  TrendingDown,
  Sparkles,
  PieChart,
  Tag,
  Plus
} from 'lucide-react';

interface PositionsTableProps {
  t: LanguagePhrases;
  lang: string;
  tickerMetrics: { [symbol: string]: TickerMetric };
  totalPortfolioNominalValue: number;
  selectedCurrency: string;
  convertValue: (amount: number, from: string, to: string, date: string) => number;
  portfolios: Portfolio[];
  onSelectTicker?: (symbol: string) => void;
  formatCurrency: (val: number, curr?: string) => string;
  instrumentGroups?: InstrumentGroup[];
  isAggregatedView?: boolean;
  onToggleAggregatedView?: () => void;
  onOpenGroupsManager?: () => void;
  onSelectGroup?: (groupId: string) => void;
}

type SortField = 'symbol' | 'sharesOwned' | 'pmc' | 'todayPriceInDisplay' | 'totalNominalValue' | 'gainAbsolute' | 'gainPercentage' | 'weight';
type SortOrder = 'asc' | 'desc';

export const PositionsTable: React.FC<PositionsTableProps> = ({
  t,
  lang,
  tickerMetrics,
  totalPortfolioNominalValue,
  selectedCurrency,
  convertValue,
  portfolios,
  onSelectTicker,
  formatCurrency,
  instrumentGroups = [],
  isAggregatedView = false,
  onToggleAggregatedView,
  onOpenGroupsManager,
  onSelectGroup
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('totalNominalValue');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [expandedTickers, setExpandedTickers] = useState<{ [symbol: string]: boolean }>({});
  const [showPmcTooltip, setShowPmcTooltip] = useState(false);

  // Helper mapping portfolio ID to Portfolio Name
  const getPortfolioName = (pId: string): string => {
    const p = portfolios.find(item => item.id === pId);
    return p ? p.name : pId;
  };

  // Convert raw metrics into array of positions with sharesOwned > 0 (aggregated or per-ticker)
  const openPositions: AggregatedTickerPosition[] = useMemo(() => {
    return buildAggregatedPositions(
      tickerMetrics,
      instrumentGroups,
      totalPortfolioNominalValue,
      isAggregatedView
    );
  }, [tickerMetrics, instrumentGroups, totalPortfolioNominalValue, isAggregatedView]);

  // Filter positions by search term (matching symbol, group name, or constituent tickers)
  const filteredPositions = useMemo(() => {
    if (!searchTerm.trim()) return openPositions;
    const term = searchTerm.trim().toLowerCase();
    return openPositions.filter(pos => {
      if (pos.symbol.toLowerCase().includes(term)) return true;
      if (pos.groupName && pos.groupName.toLowerCase().includes(term)) return true;
      if (pos.constituentSymbols && pos.constituentSymbols.some(s => s.toLowerCase().includes(term))) return true;
      return false;
    });
  }, [openPositions, searchTerm]);

  // Sort positions
  const sortedPositions = useMemo(() => {
    return [...filteredPositions].sort((a, b) => {
      let valA: any = a[sortField as keyof typeof a];
      let valB: any = b[sortField as keyof typeof b];

      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = (valB as string).toLowerCase();
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      valA = Number(valA || 0);
      valB = Number(valB || 0);
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });
  }, [filteredPositions, sortField, sortOrder]);

  // Calculate total metrics for summary footer
  const summaryTotals = useMemo(() => {
    return sortedPositions.reduce(
      (acc, pos) => {
        acc.totalInvested += pos.totalCapitalInvested;
        acc.totalNominal += pos.totalNominalValue;
        acc.totalGainAbs += pos.gainAbsolute;
        acc.totalCommissions += pos.totalCommissionsPaid;
        return acc;
      },
      { totalInvested: 0, totalNominal: 0, totalGainAbs: 0, totalCommissions: 0 }
    );
  }, [sortedPositions]);

  const summaryGainPct = summaryTotals.totalInvested > 0
    ? (summaryTotals.totalGainAbs / summaryTotals.totalInvested) * 100
    : 0;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const toggleExpand = (symbol: string) => {
    setExpandedTickers(prev => ({ ...prev, [symbol]: !prev[symbol] }));
  };

  // Generate color avatar badge based on symbol name
  const getBadgeColor = (sym: string) => {
    const colors = [
      'from-emerald-500/20 to-teal-500/20 text-emerald-400 border-emerald-500/30',
      'from-blue-500/20 to-indigo-500/20 text-blue-400 border-blue-500/30',
      'from-purple-500/20 to-violet-500/20 text-purple-400 border-purple-500/30',
      'from-amber-500/20 to-yellow-500/20 text-amber-400 border-amber-500/30',
      'from-cyan-500/20 to-sky-500/20 text-cyan-400 border-cyan-500/30',
      'from-rose-500/20 to-pink-500/20 text-rose-400 border-rose-500/30'
    ];
    let hash = 0;
    for (let i = 0; i < sym.length; i++) {
      hash = sym.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 space-y-5 backdrop-blur-md hover:border-emerald-500/20 transition-all duration-300">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
                {t.positionsSectionTitle}
                <span className="text-xs font-mono font-bold bg-slate-800 text-emerald-400 px-2 py-0.5 rounded-full border border-slate-700">
                  {openPositions.length}
                </span>
              </h3>
            </div>
          </div>
          <p className="text-xs text-slate-400 pl-11">
            {t.positionsSectionDesc}
          </p>
        </div>

        {/* Search, Mode Toggle & Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Aggregated Mode Toggle Button */}
          {onToggleAggregatedView && (
            <button
              type="button"
              onClick={onToggleAggregatedView}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer select-none ${
                isAggregatedView
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                  : 'bg-slate-950/80 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-900'
              }`}
              title={isAggregatedView ? 'Visualizzazione aggregata attiva: clicca per visualizzare i singoli ticker' : 'Visualizza i ticker raggruppati per strumento aggregato'}
            >
              <Layers className={`w-3.5 h-3.5 ${isAggregatedView ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span>{isAggregatedView ? (t.aggregatedModeShort || 'Strumenti Aggregati') : (t.standardModeShort || 'Singoli Ticker')}</span>
            </button>
          )}

          {/* Manage Groups Button */}
          {onOpenGroupsManager && (
            <button
              type="button"
              onClick={onOpenGroupsManager}
              className="px-2.5 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-900 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-medium"
              title="Crea, modifica o elimina raggruppamenti di ticker multi-borsa"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">{t.manageGroupsBtn || 'Gestisci Gruppi'}</span>
              {instrumentGroups && instrumentGroups.length > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-slate-800 text-emerald-400 font-mono font-bold border border-slate-700">
                  {instrumentGroups.length}
                </span>
              )}
            </button>
          )}

          <div className="relative min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder={t.searchPositionsPlaceholder}
              className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/80 pl-9 pr-3 py-1.5 rounded-xl text-xs text-white w-full transition-all duration-300 placeholder:text-slate-500"
            />
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPmcTooltip(!showPmcTooltip)}
              className="p-1.5 rounded-xl bg-slate-800/80 border border-slate-700/80 text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer flex items-center gap-1 text-xs"
              title={t.infoPmc}
            >
              <HelpCircle className="w-4 h-4 text-emerald-400" />
              <span className="font-mono text-[11px] font-bold text-slate-300 hidden sm:inline">{t.infoPmc}</span>
            </button>

            {showPmcTooltip && (
              <div className="absolute right-0 top-10 z-30 w-72 p-3 bg-slate-950 border border-emerald-500/30 rounded-xl shadow-2xl text-xs text-slate-300 space-y-1.5 backdrop-blur-xl animate-fade-in">
                <div className="flex items-center gap-1.5 font-bold text-emerald-400 border-b border-slate-800 pb-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{t.pmcFullTitle}</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-400">
                  {t.pmcTooltip}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Positions Table */}
      {sortedPositions.length === 0 ? (
        <div className="py-12 text-center text-slate-500 space-y-3 bg-slate-950/30 rounded-xl border border-slate-800/40">
          <Layers className="w-10 h-10 mx-auto text-slate-600 opacity-60 animate-bounce" />
          <p className="text-xs font-semibold text-slate-400">{t.noPositionsFound}</p>
        </div>
      ) : (
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase tracking-wider">
                <th
                  onClick={() => handleSort('symbol')}
                  className="py-3 px-3 cursor-pointer hover:text-emerald-400 transition-colors select-none"
                >
                  <div className="flex items-center gap-1">
                    <span>{t.colTicker}</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-600" />
                  </div>
                </th>

                <th
                  onClick={() => handleSort('sharesOwned')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-emerald-400 transition-colors select-none"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>{t.colQuantity}</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-600" />
                  </div>
                </th>

                <th
                  onClick={() => handleSort('pmc')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-emerald-400 transition-colors select-none"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>{t.colPmc}</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-600" />
                  </div>
                </th>

                <th
                  onClick={() => handleSort('todayPriceInDisplay')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-emerald-400 transition-colors select-none"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>{t.colCurrentPrice}</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-600" />
                  </div>
                </th>

                <th
                  onClick={() => handleSort('totalNominalValue')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-emerald-400 transition-colors select-none"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>{t.colMarketValue}</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-600" />
                  </div>
                </th>

                <th
                  onClick={() => handleSort('gainAbsolute')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-emerald-400 transition-colors select-none"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>{t.colProfitLossAbs}</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-600" />
                  </div>
                </th>

                <th
                  onClick={() => handleSort('weight')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-emerald-400 transition-colors select-none hidden md:table-cell"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>{t.colPortfolioWeight}</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-600" />
                  </div>
                </th>

                <th className="py-3 px-3 text-center w-12"></th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/60 font-mono">
              {sortedPositions.map((pos) => {
                const isExpanded = !!expandedTickers[pos.symbol];
                const badgeStyle = getBadgeColor(pos.symbol);

                return (
                  <React.Fragment key={pos.symbol}>
                    <tr
                      className={`hover:bg-slate-800/30 transition-all duration-200 group ${
                        isExpanded ? 'bg-slate-850/50' : ''
                      }`}
                    >
                      {/* Ticker / Symbol */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => {
                              if (pos.isGroup && pos.groupId && onSelectGroup) {
                                onSelectGroup(pos.groupId);
                              } else if (onSelectTicker) {
                                onSelectTicker(pos.symbol);
                              }
                            }}
                            className={`w-8 h-8 rounded-xl ${
                              pos.isGroup
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : `bg-gradient-to-br ${badgeStyle} border`
                            } font-black text-xs flex items-center justify-center shrink-0 cursor-pointer shadow-sm group-hover:scale-105 transition-transform`}
                            title={pos.isGroup ? `Filtra per gruppo ${pos.symbol}` : `Filtra grafico per ${pos.symbol}`}
                          >
                            {pos.isGroup ? <Layers className="w-4 h-4" /> : pos.symbol.substring(0, 3)}
                          </button>
                          <div>
                            <div className="font-bold text-white group-hover:text-emerald-400 transition-colors flex items-center gap-1.5 flex-wrap">
                              <span>{pos.symbol}</span>
                              {pos.isGroup && (
                                <span className="text-[9px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.2 rounded font-semibold uppercase tracking-wider">
                                  {t.aggregatedBadge || 'Aggregato'}
                                </span>
                              )}
                            </div>
                            {pos.isGroup ? (
                              <div className="text-[10px] text-slate-400 flex items-center gap-1 flex-wrap mt-0.5">
                                <span className="text-slate-500">{pos.constituents?.length || pos.constituentSymbols?.length} Ticker:</span>
                                {pos.constituentSymbols?.map(sym => (
                                  <span key={sym} className="px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800 text-sky-400 font-mono text-[9px] font-semibold">
                                    {sym}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <div className="text-[10px] text-slate-500 flex items-center gap-1">
                                <span>{pos.activeLots.length} {t.openLotsTitle}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Quantity */}
                      <td className="py-3 px-3 text-right font-bold text-slate-200">
                        <QuantityDisplay value={pos.sharesOwned} />
                      </td>

                      {/* PMC (Average Cost) */}
                      <td className="py-3 px-3 text-right font-bold text-amber-400/90">
                        {formatCurrency(pos.pmc, selectedCurrency)}
                      </td>

                      {/* Current Unit Price with Daily Change */}
                      <td className="py-3 px-3 text-right text-slate-300">
                        <div>{formatCurrency(pos.todayPriceInDisplay, selectedCurrency)}</div>
                        <div className={`text-[10px] font-bold tracking-tight ${pos.dailyChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {pos.dailyChangePct >= 0 ? '▲ +' : '▼ '}{pos.dailyChangePct.toFixed(2)}%
                        </div>
                      </td>

                      {/* Current Market Value */}
                      <td className="py-3 px-3 text-right font-black text-white">
                        {formatCurrency(pos.totalNominalValue, selectedCurrency)}
                      </td>

                      {/* P/L Absolute & Percentage */}
                      <td className="py-3 px-3 text-right">
                        <div className={`font-black ${pos.gainAbsolute >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                          {pos.gainAbsolute >= 0 ? '+' : ''}{formatCurrency(pos.gainAbsolute, selectedCurrency)}
                        </div>
                        <div className={`text-[10px] font-bold ${pos.gainAbsolute >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {pos.gainAbsolute >= 0 ? '▲' : '▼'} {pos.gainPercentage >= 0 ? '+' : ''}{pos.gainPercentage.toFixed(2)}%
                        </div>
                      </td>

                      {/* Portfolio Weight % */}
                      <td className="py-3 px-3 text-right hidden md:table-cell">
                        <div className="flex items-center justify-end gap-2">
                          <span className="font-bold text-slate-300">{pos.weight.toFixed(1)}%</span>
                          <div className="w-12 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-emerald-500 h-1.5 rounded-full"
                              style={{ width: `${Math.min(100, Math.max(2, pos.weight))}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Expand Button */}
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => toggleExpand(pos.symbol)}
                          className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer"
                          title={isExpanded ? t.collapseLotDetails : t.expandLotDetails}
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </td>
                    </tr>

                    {/* Expanded Lot Details Accordion Row */}
                    {isExpanded && (
                      <tr className="bg-slate-950/60 border-y border-slate-800/80 animate-fade-in">
                        <td colSpan={8} className="p-4">
                          <div className="space-y-4">
                            {/* If it's an Aggregated Group: show Constituent Tickers Breakdown */}
                            {pos.isGroup && pos.constituents && pos.constituents.length > 0 && (
                              <div className="bg-slate-900/80 border border-slate-800/90 rounded-xl p-4 space-y-3">
                                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                                  <h4 className="font-black text-xs text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <PieChart className="w-3.5 h-3.5" />
                                    {t.groupConstituentsTitle || 'Dettaglio Ticker nel Gruppo'} ({pos.constituents.length})
                                  </h4>
                                  <span className="text-[11px] text-slate-400 font-mono">
                                    {t.aggregateTotalWeight || 'Peso Totale nel Gruppo'}: <strong className="text-white">100%</strong>
                                  </span>
                                </div>

                                <div className="overflow-x-auto">
                                  <table className="w-full text-left text-[11px] font-mono">
                                    <thead>
                                      <tr className="text-slate-500 border-b border-slate-800/60 pb-1">
                                        <th className="py-1.5 px-2">{t.colTicker}</th>
                                        <th className="py-1.5 px-2 text-right">{t.colQuantity}</th>
                                        <th className="py-1.5 px-2 text-right">{t.colPmc}</th>
                                        <th className="py-1.5 px-2 text-right">{t.colCurrentPrice}</th>
                                        <th className="py-1.5 px-2 text-right">{t.colMarketValue}</th>
                                        <th className="py-1.5 px-2 text-right">{t.colProfitLossAbs}</th>
                                        <th className="py-1.5 px-2 text-right">{t.weightInGroup || 'Peso nel Gruppo'}</th>
                                        <th className="py-1.5 px-2 text-right">{t.colPortfolioWeight}</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/40">
                                      {pos.constituents.map(c => (
                                        <tr key={c.symbol} className="hover:bg-slate-800/30 transition-colors">
                                          <td className="py-2 px-2">
                                            <button
                                              type="button"
                                              onClick={() => onSelectTicker && onSelectTicker(c.symbol)}
                                              className="font-bold text-sky-400 hover:text-sky-300 hover:underline flex items-center gap-1 cursor-pointer"
                                              title={`Isola ${c.symbol} nel grafico`}
                                            >
                                              <span>{c.symbol}</span>
                                            </button>
                                          </td>
                                          <td className="py-2 px-2 text-right text-slate-200 font-bold">
                                            <QuantityDisplay value={c.sharesOwned} />
                                          </td>
                                          <td className="py-2 px-2 text-right text-amber-400 font-bold">
                                            {formatCurrency(c.pmc, selectedCurrency)}
                                          </td>
                                          <td className="py-2 px-2 text-right text-slate-300">
                                            <div>{formatCurrency(c.todayPriceInDisplay, selectedCurrency)}</div>
                                            <div className={`text-[9px] font-bold ${c.dailyChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                              {c.dailyChangePct >= 0 ? '▲ +' : '▼ '}{c.dailyChangePct.toFixed(2)}%
                                            </div>
                                          </td>
                                          <td className="py-2 px-2 text-right text-white font-bold">
                                            {formatCurrency(c.totalNominalValue, selectedCurrency)}
                                          </td>
                                          <td className="py-2 px-2 text-right">
                                            <div className={`font-bold ${c.gainAbsolute >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                                              {c.gainAbsolute >= 0 ? '+' : ''}{formatCurrency(c.gainAbsolute, selectedCurrency)}
                                            </div>
                                            <div className={`text-[9px] font-bold ${c.gainPercentage >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                                              ({c.gainPercentage >= 0 ? '+' : ''}{c.gainPercentage.toFixed(1)}%)
                                            </div>
                                          </td>
                                          <td className="py-2 px-2 text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                              <span className="font-bold text-sky-300">{c.weightInGroup.toFixed(1)}%</span>
                                              <div className="w-10 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                                <div
                                                  className="bg-sky-500 h-1.5 rounded-full"
                                                  style={{ width: `${Math.min(100, Math.max(2, c.weightInGroup))}%` }}
                                                />
                                              </div>
                                            </div>
                                          </td>
                                          <td className="py-2 px-2 text-right text-slate-400 font-semibold">
                                            {c.weightInPortfolio.toFixed(1)}%
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            {/* Open Lots Table */}
                            <div className="space-y-3 bg-slate-900/60 border border-slate-800/90 rounded-xl p-4">
                              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                                <h4 className="font-black text-xs text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                                  <Layers className="w-3.5 h-3.5" />
                                  {pos.isGroup ? `${t.openLotsTitle} - ${pos.symbol} (${pos.activeLots.length})` : `${t.openLotsTitle} - ${pos.symbol}`}
                                </h4>
                                <span className="text-[11px] text-slate-400 font-mono">
                                  PMC Totale: <strong className="text-amber-400">{formatCurrency(pos.pmc, selectedCurrency)}</strong>
                                </span>
                              </div>

                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-[11px] font-mono">
                                  <thead>
                                    <tr className="text-slate-500 border-b border-slate-800/60 pb-1">
                                      <th className="py-1.5 px-2">{t.lotOriginalDate}</th>
                                      {pos.isGroup && <th className="py-1.5 px-2">{t.colTicker}</th>}
                                      <th className="py-1.5 px-2">{t.lotPortfolio}</th>
                                      <th className="py-1.5 px-2 text-right">{t.lotRemainingQty}</th>
                                      <th className="py-1.5 px-2 text-right">{t.lotPurchasePrice}</th>
                                      <th className="py-1.5 px-2 text-right">{t.lotTotalInvested}</th>
                                      <th className="py-1.5 px-2 text-right">{t.lotCurrentValue}</th>
                                      <th className="py-1.5 px-2 text-right">{t.lotGainLoss}</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-800/40">
                                    {pos.activeLots.map((lot, idx) => {
                                      const lotBuyInDisplay = convertValue(
                                        lot.buyPrice,
                                        lot.currency || 'EUR',
                                        selectedCurrency,
                                        lot.originalDate.split('T')[0]
                                      );
                                      const lotInvested = convertValue(
                                        lot.remainingQty * lot.buyPrice,
                                        lot.currency || 'EUR',
                                        selectedCurrency,
                                        lot.originalDate.split('T')[0]
                                      );
                                      const lotCurrentVal = lot.remainingQty * (pos.isGroup && lot.symbol && tickerMetrics[lot.symbol] ? tickerMetrics[lot.symbol].todayPriceInDisplay : pos.todayPriceInDisplay);
                                      const lotGainAbs = lotCurrentVal - lotInvested;
                                      const lotGainPct = lotInvested > 0 ? (lotGainAbs / lotInvested) * 100 : 0;
                                      const isTransfer = !!(lot.transferId || lot.parentTransactionId);
                                      const isPartial = lot.qty > 0 && Math.abs(lot.qty - lot.remainingQty) > 1e-12;
                                      const originalInvested = convertValue(
                                        lot.qty * lot.buyPrice,
                                        lot.currency || 'EUR',
                                        selectedCurrency,
                                        lot.originalDate.split('T')[0]
                                      );

                                      return (
                                        <tr key={lot.id + '-' + idx} className="hover:bg-slate-800/20">
                                          <td className="py-2 px-2 text-slate-300">
                                            <div className="font-bold text-slate-200">
                                              {formatDateString(lot.originalDate, lang)}
                                            </div>
                                            {isPartial && (
                                              <span className="text-[10px] text-amber-400 block font-normal">
                                                Residuo lotto BUY del {formatDateString(lot.originalDate, lang)}
                                              </span>
                                            )}
                                          </td>
                                          {pos.isGroup && (
                                            <td className="py-2 px-2">
                                              <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-sky-400 font-mono text-[10px] font-bold">
                                                {lot.symbol}
                                              </span>
                                            </td>
                                          )}
                                          <td className="py-2 px-2 text-slate-300 flex items-center gap-1.5 flex-wrap">
                                            <span>{getPortfolioName(lot.portfolioId)}</span>
                                            {isTransfer && (
                                              <span className="text-[9px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.2 rounded font-bold">
                                                TRASFERITO
                                              </span>
                                            )}
                                            {isPartial ? (
                                              <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded font-bold" title="Lotto parzialmente scaricato da successive vendite">
                                                LOTTO SCARICATO
                                              </span>
                                            ) : (
                                              <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.2 rounded font-bold">
                                                INTERO
                                              </span>
                                            )}
                                          </td>
                                          <td className="py-2 px-2 text-right text-slate-200">
                                            <div className="font-bold">
                                              <QuantityDisplay value={lot.remainingQty} />
                                            </div>
                                            {isPartial && (
                                              <span className="text-[10px] text-slate-400 font-mono block font-normal mt-0.5" title="Quantità acquistata nella transazione BUY originale (immutabile)">
                                                Quantità acquistata nel BUY originale: {formatFullQuantity(lot.qty)}
                                              </span>
                                            )}
                                          </td>
                                          <td className="py-2 px-2 text-right text-amber-400">
                                            <div className="font-bold">
                                              {formatCurrency(lotBuyInDisplay, selectedCurrency)}
                                            </div>
                                            {lot.currency && lot.currency !== selectedCurrency && (
                                              <span className="text-[9px] text-slate-500 block">
                                                ({lot.buyPrice.toFixed(2)} {lot.currency})
                                              </span>
                                            )}
                                          </td>
                                          <td className="py-2 px-2 text-right text-slate-300">
                                            <div className="font-bold text-slate-200">
                                              {formatCurrency(lotInvested, selectedCurrency)}
                                            </div>
                                            {isPartial && (
                                              <span className="text-[10px] text-slate-400 font-mono block font-normal mt-0.5" title="Costo della transazione BUY originale (immutabile)">
                                                Costo nel BUY originale: {formatCurrency(originalInvested, selectedCurrency)}
                                              </span>
                                            )}
                                          </td>
                                          <td className="py-2 px-2 text-right text-white font-bold">
                                            {formatCurrency(lotCurrentVal, selectedCurrency)}
                                          </td>
                                          <td className="py-2 px-2 text-right">
                                            <span className={`font-bold ${lotGainAbs >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                                              {lotGainAbs >= 0 ? '+' : ''}{formatCurrency(lotGainAbs, selectedCurrency)} ({lotGainPct >= 0 ? '+' : ''}{lotGainPct.toFixed(1)}%)
                                            </span>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                  <tfoot>
                                    <tr className="border-t border-slate-800 text-slate-300 text-xs font-semibold bg-slate-900/40">
                                      <td colSpan={pos.isGroup ? 3 : 2} className="py-2 px-2 font-bold text-slate-400">
                                        Totale Carico Storico Lotti Aperti ({pos.activeLots.length})
                                      </td>
                                      <td className="py-2 px-2 text-right font-bold text-slate-200">
                                        <QuantityDisplay value={pos.sharesOwned} />
                                      </td>
                                      <td className="py-2 px-2 text-right text-amber-400 font-bold">
                                        PMC {formatCurrency(pos.pmc, selectedCurrency)}
                                      </td>
                                      <td className="py-2 px-2 text-right font-bold text-slate-200">
                                        {formatCurrency(pos.openLotsCostBasis ?? pos.totalCapitalInvested, selectedCurrency)}
                                      </td>
                                      <td className="py-2 px-2 text-right font-bold text-white">
                                        {formatCurrency(pos.totalNominalValue, selectedCurrency)}
                                      </td>
                                      <td className="py-2 px-2 text-right">
                                        <span className={`font-bold ${pos.gainAbsolute >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                                          {pos.gainAbsolute >= 0 ? '+' : ''}{formatCurrency(pos.gainAbsolute, selectedCurrency)} ({pos.gainPercentage >= 0 ? '+' : ''}{pos.gainPercentage.toFixed(1)}%)
                                        </span>
                                      </td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>

            {/* Table Summary Footer */}
            <tfoot className="border-t-2 border-slate-700/80 bg-slate-950/80 font-mono text-xs">
              <tr>
                <td className="py-3 px-3 font-black text-white uppercase tracking-wider">
                  {t.totalPositionsSummary} ({sortedPositions.length})
                </td>
                <td className="py-3 px-3 text-right text-slate-400">--</td>
                <td className="py-3 px-3 text-right text-slate-400">--</td>
                <td className="py-3 px-3 text-right text-slate-400">--</td>
                <td className="py-3 px-3 text-right font-black text-white">
                  {formatCurrency(summaryTotals.totalNominal, selectedCurrency)}
                </td>
                <td className="py-3 px-3 text-right">
                  <div className={`font-black ${summaryTotals.totalGainAbs >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                    {summaryTotals.totalGainAbs >= 0 ? '+' : ''}{formatCurrency(summaryTotals.totalGainAbs, selectedCurrency)}
                  </div>
                  <div className={`text-[10px] font-bold ${summaryTotals.totalGainAbs >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {summaryGainPct >= 0 ? '+' : ''}{summaryGainPct.toFixed(2)}%
                  </div>
                </td>
                <td className="py-3 px-3 text-right font-bold text-slate-300 hidden md:table-cell">
                  100.0%
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};
