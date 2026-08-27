/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { LanguagePhrases, Currency, Transaction } from '../types.ts';
import { LineChart, Calendar, RefreshCw, BarChart2, CheckCircle2, AlertTriangle, Activity, TrendingUp, TrendingDown, Percent } from 'lucide-react';
import { TickerInput } from './TickerInput.tsx';
import { formatDateString } from '../utils.ts';
import { calculatePortfolioPerformance } from '../utils/finance.ts';

export interface DailyBalance {
  date: string; // YYYY-MM-DD
  investedNominal: number;
  investedWithCommissions: number;
  currentValue: number;
  realValueAdjusted: number; // Adjusted for inflation relative to today
  benchmarkValue?: number; // Normalized benchmark starting at same initial portfolio value!
}

interface InteractiveChartProps {
  t: LanguagePhrases;
  lang: string;
  currencySymbol: string;
  dailyBalances: DailyBalance[];
  includeCommissions: boolean;
  benchmarkSymbol: string;
  setBenchmarkSymbol: (sym: string) => void;
  availableBenchmarkOptions: { id: string; name: string }[];
  activeBenchmark: string;
  setActiveBenchmark: (id: string) => void;
  inflationToggle: boolean;
  setInflationToggle: (v: boolean) => void;
  assetAllocation: { symbol: string; value: number; weight: number; target: number }[];
  onUpdateTargetWeight: (symbol: string, val: number) => void;
  onSelectTicker?: (sym: string) => void;
  activeTxSorted?: any[];
  activeOtherCosts?: any[];
  allTransactions?: Transaction[];
  activePortIds?: string[];
  targetSymbol?: string | null;
  convertValue?: (val: number, from: string, to: string, date: string) => number;
  selectedCurrency?: string;
  inflationIndices?: any[];
  selectedInflationId?: string;
  onSelectInflationId?: (id: string) => void;
  positionsTableNode?: React.ReactNode;
}

export default function InteractiveChart({
  t,
  lang,
  currencySymbol,
  dailyBalances,
  includeCommissions,
  benchmarkSymbol,
  setBenchmarkSymbol,
  availableBenchmarkOptions,
  activeBenchmark,
  setActiveBenchmark,
  inflationToggle,
  setInflationToggle,
  assetAllocation,
  onUpdateTargetWeight,
  onSelectTicker,
  activeTxSorted = [],
  activeOtherCosts = [],
  allTransactions = [],
  activePortIds = [],
  targetSymbol = null,
  convertValue,
  selectedCurrency,
  inflationIndices = [],
  selectedInflationId = '',
  onSelectInflationId,
  positionsTableNode
}: InteractiveChartProps) {
  const [timeframe, setTimeframe] = useState<string>('ALL');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const getDaysBetween = (startStr: string, endStr: string) => {
    if (!startStr || !endStr) return 0;
    const s = new Date(startStr);
    const e = new Date(endStr);
    const diffTime = Math.abs(e.getTime() - s.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive of start and end day
  };

  // Parse custom dates and apply timeframe filtering
  const today = new Date();
  
  const getFilteredBalances = () => {
    if (dailyBalances.length === 0) return [];
    
    let filtered = [...dailyBalances];
    let startLimit = new Date(1970, 0, 1);

    if (timeframe === '1D') {
      startLimit = new Date();
      startLimit.setDate(today.getDate() - 1);
    } else if (timeframe === '1W') {
      startLimit = new Date();
      startLimit.setDate(today.getDate() - 7);
    } else if (timeframe === '1M') {
      startLimit = new Date();
      startLimit.setMonth(today.getMonth() - 1);
    } else if (timeframe === '3M') {
      startLimit = new Date();
      startLimit.setMonth(today.getMonth() - 3);
    } else if (timeframe === '6M') {
      startLimit = new Date();
      startLimit.setMonth(today.getMonth() - 6);
    } else if (timeframe === '1Y') {
      startLimit = new Date();
      startLimit.setFullYear(today.getFullYear() - 1);
    } else if (timeframe === 'YTD') {
      startLimit = new Date(today.getFullYear(), 0, 1);
    } else if (timeframe === '3Y') {
      startLimit = new Date();
      startLimit.setFullYear(today.getFullYear() - 3);
    } else if (timeframe === '5Y') {
      startLimit = new Date();
      startLimit.setFullYear(today.getFullYear() - 5);
    } else if (timeframe === 'CUSTOM') {
      if (customStartDate) {
        startLimit = new Date(customStartDate);
      }
      let endLimit = new Date();
      if (customEndDate) {
        endLimit = new Date(customEndDate);
      }
      filtered = filtered.filter((b) => {
        const d = new Date(b.date);
        return d >= startLimit && d <= endLimit;
      });
      return filtered;
    }

    if (timeframe !== 'ALL') {
      filtered = filtered.filter((b) => new Date(b.date) >= startLimit);
    }
    return filtered;
  };

  const filteredBalances = getFilteredBalances();

  // Normalize Benchmark starting at the first filtered balance amount of capital invested!
  const prepareRenderBalances = () => {
    if (filteredBalances.length === 0) return [];
    
    // Always use the selected inflation multiplier base value representation or plain nominal
    const baseValue = inflationToggle 
      ? filteredBalances[0].realValueAdjusted 
      : filteredBalances[0].currentValue;
    
    // Track synthetic benchmark portfolio with cash flows (Direct Alpha / PME style)
    let benchShares = 0;
    const firstBenchVal = filteredBalances[0].benchmarkValue;
    if (firstBenchVal && firstBenchVal > 0) {
      benchShares = baseValue / firstBenchVal;
    }

    return filteredBalances.map((b, i) => {
      let benchProcessed: number | undefined = undefined;
      
      if (b.benchmarkValue && b.benchmarkValue > 0) {
        if (i > 0) {
          const prevB = filteredBalances[i - 1];
          // Get the net cash flow of our main portfolio on this day (adapt to includeCommissions)
          const currentInvested = includeCommissions ? b.investedWithCommissions : b.investedNominal;
          const prevInvested = includeCommissions ? prevB.investedWithCommissions : prevB.investedNominal;
          const cashFlow = currentInvested - prevInvested;
          
          // Buy or sell benchmark shares using this cash flow at today's benchmark price
          benchShares += cashFlow / b.benchmarkValue;
        }
        benchProcessed = benchShares * b.benchmarkValue;
      }
      
      return {
        ...b,
        benchNormalized: benchProcessed
      };
    });
  };

  const renderBalances = prepareRenderBalances();

  const totalDays = renderBalances.length > 0 
    ? getDaysBetween(renderBalances[0].date, renderBalances[renderBalances.length - 1].date)
    : 0;

  const getPeriodDaysLabel = () => {
    switch (lang) {
      case 'it': return `${totalDays} giorni`;
      case 'es': return `${totalDays} días`;
      case 'fr': return `${totalDays} jours`;
      case 'zh': return `${totalDays} 天`;
      case 'ar': return `${totalDays} يوم`;
      default: return `${totalDays} days`;
    }
  };

  // Find max and min values to scale the chart correctly
  const getChartScale = () => {
    if (renderBalances.length === 0) return { min: 0, max: 100 };
    
    let vals: number[] = [];
    renderBalances.forEach((b) => {
      if (typeof b.currentValue === 'number' && !isNaN(b.currentValue)) {
        vals.push(b.currentValue);
      }
      // Invested should always be drawing base Nominal as per user instruction
      if (typeof b.investedNominal === 'number' && !isNaN(b.investedNominal)) {
        vals.push(b.investedNominal);
      }
      if (inflationToggle && typeof b.realValueAdjusted === 'number' && !isNaN(b.realValueAdjusted)) {
        vals.push(b.realValueAdjusted);
      }
      if (b.benchNormalized !== undefined && typeof b.benchNormalized === 'number' && !isNaN(b.benchNormalized)) {
        vals.push(b.benchNormalized);
      }
    });

    vals = vals.filter(v => typeof v === 'number' && !isNaN(v) && isFinite(v));
    if (vals.length === 0) return { min: 0, max: 100 };

    const rawMax = Math.max(...vals);
    const rawMin = Math.min(...vals);
    let diff = rawMax - rawMin;
    if (diff === 0) diff = rawMax * 0.1 || 10;

    let max = rawMax + diff * 0.05;
    let min = rawMin - diff * 0.05;

    if (isNaN(max) || !isFinite(max)) max = 100;
    if (isNaN(min) || !isFinite(min)) min = 0;

    return { min: Math.max(0, min), max };
  };

  const { min, max } = getChartScale();
  const rangeY = max - min;

  const chartHeight = 280;
  const chartWidth = 700;

  // Compute centralized, mathematically exact performance metrics for the selected period
  const periodPerf = useMemo(() => {
    if (renderBalances.length === 0) {
      return {
        twrrPercentage: 0,
        twrrAnnualized: 0,
        mwrrAnnualized: 0,
        mwrrPeriod: 0,
        volatility: 0,
        maxDrawdown: 0,
        periodInitialValue: 0,
        periodFinalValue: 0,
        periodInvested: 0,
        periodSells: 0,
        periodNetContributions: 0,
        periodCommissions: 0,
        periodNetGain: 0,
        totalDays: 0
      };
    }

    const firstDateStr = renderBalances[0].date;
    const lastDateStr = renderBalances[renderBalances.length - 1].date;

    return calculatePortfolioPerformance(
      dailyBalances,
      allTransactions && allTransactions.length > 0 ? allTransactions : activeTxSorted,
      activePortIds && activePortIds.length > 0
        ? activePortIds
        : Array.from(new Set((allTransactions || activeTxSorted).map(t => t.portfolioId))),
      activeOtherCosts,
      includeCommissions,
      selectedCurrency || 'EUR',
      convertValue || ((val) => val),
      firstDateStr,
      lastDateStr,
      targetSymbol
    );
  }, [
    dailyBalances,
    renderBalances,
    allTransactions,
    activeTxSorted,
    activePortIds,
    activeOtherCosts,
    includeCommissions,
    selectedCurrency,
    convertValue,
    targetSymbol
  ]);

  const periodInitialValue = periodPerf.periodInitialValue;
  const periodFinalValue = periodPerf.periodFinalValue;
  const periodInvested = periodPerf.periodInvested;
  const periodCommissions = periodPerf.periodCommissions;
  const periodNetGain = periodPerf.periodNetGain;
  const periodMaxDrawdown = periodPerf.maxDrawdown;
  const periodVolatility = periodPerf.volatility;
  const periodTWRR = periodPerf.twrrPercentage;
  const periodMWRR = timeframe === 'ALL' || periodPerf.totalDays >= 365 ? periodPerf.mwrrAnnualized : periodPerf.mwrrPeriod;


  // Render SVG chart path helper
  const getSvgCoordinates = (attribute: 'currentValue' | 'invested' | 'benchNormalized' | 'realValueAdjusted') => {
    if (renderBalances.length === 0) return '';
    let points = '';
    const denominator = rangeY <= 0 ? 1 : rangeY;
    renderBalances.forEach((b, i) => {
      const x = 60 + i * ((chartWidth - 80) / Math.max(1, renderBalances.length - 1));
      
      let val = 0;
      if (attribute === 'invested') {
        // As per user request, gray 'Investito' line must never include commissions!
        val = b.investedNominal;
      } else if (attribute === 'currentValue') {
        val = b.currentValue;
      } else if (attribute === 'realValueAdjusted') {
        val = b.realValueAdjusted;
      } else if (attribute === 'benchNormalized') {
        val = b.benchNormalized || 0;
      }

      if (isNaN(val) || !isFinite(val)) {
        val = 0;
      }

      const y = chartHeight - 30 - ((val - min) / denominator) * (chartHeight - 60);
      if (!isNaN(x) && isFinite(x) && !isNaN(y) && isFinite(y)) {
        if (points === '') {
          points += `M ${x.toFixed(1)},${y.toFixed(1)}`;
        } else {
          points += ` L ${x.toFixed(1)},${y.toFixed(1)}`;
        }
      }
    });
    return points.trim();
  };

  const mainPath = getSvgCoordinates('currentValue'); // Always nominal/commission-exclusive or inclusive based only on the active toggle!
  const investedPath = getSvgCoordinates('invested'); // Always nominal without commissions
  const realValPath = getSvgCoordinates('realValueAdjusted'); // Amber real value net of active inflation
  const benchPath = activeBenchmark !== 'NONE' ? getSvgCoordinates('benchNormalized') : '';

  // Current state overview on hover
  const activeHoverData = hoverIndex !== null && renderBalances[hoverIndex] 
    ? renderBalances[hoverIndex] 
    : renderBalances[renderBalances.length - 1] || null;

  // Settle Allocations & Rebalancing
  const sumTargetWeights = assetAllocation.reduce((sum, a) => sum + a.target, 0);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Chart container card */}
      <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <LineChart className="w-5 h-5 text-green-500" />
              <h2 className="text-lg font-bold text-white">{t.historicalCapitalTrend}</h2>
            </div>
            {renderBalances.length > 0 && (
              <span className="text-xs text-slate-400 font-mono">
                {`${t.analyzedPeriod}: ${getPeriodDaysLabel()} (${formatDateString(renderBalances[0].date, lang)} - ${formatDateString(renderBalances[renderBalances.length - 1].date, lang)})`}
              </span>
            )}
          </div>

          {/* Timeframe selector bar */}
          <div className="flex flex-wrap gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-mono">
            {['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y', 'ALL', 'CUSTOM'].map((tString) => (
              <button
                key={tString}
                onClick={() => setTimeframe(tString)}
                className={`py-1 px-2.5 rounded-md font-semibold transition ${
                  timeframe === tString
                    ? 'bg-slate-800 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tString}
              </button>
            ))}
          </div>
        </div>

        {/* Custom date range fields if CUSTOM selected */}
        {timeframe === 'CUSTOM' && (
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-wrap gap-4 items-center">
            <Calendar className="w-4 h-4 text-slate-400" />
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">{t.fromLabel}</span>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-white focus:outline-none focus:border-green-500"
              />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">{t.toLabel}</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-white focus:outline-none focus:border-green-500"
              />
            </div>
          </div>
        )}

        {/* Interactive SVG Chart Canvas */}
        {renderBalances.length > 0 ? (
          <div className="relative">
            {/* Tooltip detail block on the top right corner */}
            {activeHoverData && (
              <div className="bg-slate-950/90 border border-slate-800 p-3 rounded-lg flex flex-wrap gap-4 text-xs font-mono justify-between mb-2">
                <div>
                  <span className="text-slate-500">{t.dateColonLabel} </span>
                  <span className="text-white font-semibold">
                    {hoverIndex !== null 
                      ? formatDateString(activeHoverData.date, lang)
                      : `${formatDateString(renderBalances[0].date, lang)} - ${formatDateString(activeHoverData.date, lang)}`}
                  </span>
                  {hoverIndex === null && (
                    <span className="text-slate-400 text-[10px] ml-2 font-semibold">
                      ({getPeriodDaysLabel()})
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-slate-500">{t.nominalCapitalLabel} </span>
                  <span className="text-emerald-400 font-bold">
                    {activeHoverData.currentValue.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currencySymbol}
                  </span>
                </div>
                {inflationToggle && (
                  <div>
                    <span className="text-slate-500">{t.realValueAdjustedLabel} </span>
                    <span className="text-amber-500 font-bold">
                      {activeHoverData.realValueAdjusted.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currencySymbol}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-slate-500">{t.investedCapitalLabel} </span>
                  <span className="text-slate-400 font-semibold">
                    {activeHoverData.investedNominal.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currencySymbol}
                  </span>
                </div>
                {activeBenchmark !== 'NONE' && activeHoverData.benchNormalized && (
                  <div>
                    <span className="text-sky-500 font-bold">{t.benchmarkLabel} ({activeBenchmark === 'TICKER' ? benchmarkSymbol : activeBenchmark}): </span>
                    <span className="text-sky-400 font-semibold">
                      {activeHoverData.benchNormalized.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currencySymbol}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="w-full">
              <svg
                width="100%"
                height="100%"
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="overflow-visible select-none min-h-[250px] sm:min-h-[350px]"
                onMouseMove={(e) => {
                  const svgRect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - svgRect.left;
                  const ratio = (x - 60) / (svgRect.width * (chartWidth - 80) / chartWidth);
                  const index = Math.min(
                    renderBalances.length - 1,
                    Math.max(0, Math.round(ratio * (renderBalances.length - 1)))
                  );
                  setHoverIndex(index);
                }}
                onMouseLeave={() => setHoverIndex(null)}
              >
                {/* Horizontal Guideline Grids */}
                {[0.2, 0.4, 0.6, 0.8, 1.0].map((p, i) => (
                  <line
                    key={i}
                    x1="60"
                    y1={chartHeight - 30 - p * (chartHeight - 60)}
                    x2={chartWidth - 20}
                    y2={chartHeight - 30 - p * (chartHeight - 60)}
                    stroke="#1e293b"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                ))}

                {/* Benchmark Plot path */}
                {benchPath && (
                  <path
                    d={benchPath}
                    fill="none"
                    stroke="#0284c7"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                    className="opacity-70"
                  />
                )}

                {/* Capital Invested Path (Slate-500 Line) */}
                {investedPath && (
                   <path
                     d={investedPath}
                     fill="none"
                     stroke="#475569"
                     strokeWidth="2"
                   />
                )}

                {/* Real Value Path (Amber-500 Line for inflation tracking) */}
                {inflationToggle && realValPath && (
                  <path
                    d={realValPath}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="2.5"
                    strokeDasharray="4 2"
                    className="opacity-90"
                  />
                )}

                {/* Current Value path (Emerald-500 Bold Line representing Nominal) */}
                {mainPath && (
                  <path
                    d={mainPath}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                )}

                {/* Hover line indicator & focal circles */}
                {hoverIndex !== null && renderBalances[hoverIndex] && (() => {
                  const x = 60 + hoverIndex * ((chartWidth - 80) / Math.max(1, renderBalances.length - 1));
                  const bVal = renderBalances[hoverIndex].currentValue;
                  const iVal = renderBalances[hoverIndex].investedNominal;
                  const rVal = renderBalances[hoverIndex].realValueAdjusted;

                  const yMain = chartHeight - 30 - ((bVal - min) / rangeY) * (chartHeight - 60);
                  const yInvested = chartHeight - 30 - ((iVal - min) / rangeY) * (chartHeight - 60);
                  const yReal = chartHeight - 30 - ((rVal - min) / rangeY) * (chartHeight - 60);

                  return (
                    <g>
                      <line
                        x1={x}
                        y1="10"
                        x2={x}
                        y2={chartHeight - 30}
                        stroke="#94a3b8"
                        strokeWidth="1.5"
                        strokeDasharray="2 2"
                      />
                      {/* Circle on main nominal path */}
                      <circle
                        cx={x}
                        cy={yMain}
                        r="6"
                        fill="#10b981"
                        stroke="#ffffff"
                        strokeWidth="1.5"
                      />
                      {/* Circle on real path if inflation is turned on */}
                      {inflationToggle && (
                        <circle
                          cx={x}
                          cy={yReal}
                          r="5"
                          fill="#f59e0b"
                          stroke="#ffffff"
                          strokeWidth="1.5"
                        />
                      )}
                      {/* Circle on invested path */}
                      <circle
                        cx={x}
                        cy={yInvested}
                        r="5"
                        fill="#475569"
                        stroke="#ffffff"
                        strokeWidth="1.5"
                      />
                    </g>
                  );
                })()}

                {/* Chart Axis labels */}
                <text x="60" y={chartHeight - 10} fill="#475569" fontSize="9" fontFamily="monospace">
                  {formatDateString(renderBalances[0].date, lang)}
                </text>
                <text x={chartWidth - 20} y={chartHeight - 10} fill="#475569" fontSize="9" fontFamily="monospace" textAnchor="end">
                  {formatDateString(renderBalances[renderBalances.length - 1].date, lang)}
                </text>

                {/* Y-axis Scales values */}
                <text x="5" y="15" fill="#475569" fontSize="9" fontFamily="monospace">
                  {Math.round(max).toLocaleString()}{currencySymbol}
                </text>
                <text x="5" y={chartHeight - 30} fill="#475569" fontSize="9" fontFamily="monospace">
                  {Math.round(min).toLocaleString()}{currencySymbol}
                </text>
              </svg>
            </div>

            {/* Bottom Legend */}
            <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400 mt-2 font-mono">
              <div className="flex items-center gap-2">
                <div className="w-4 h-1 bg-green-500 rounded"></div>
                <span>{t.currentNominalValueLabel}</span>
              </div>
              {inflationToggle && (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-1 bg-amber-500 border-t border-dashed rounded"></div>
                  <span>{t.realValueAdjustedNetInflationLabel}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="w-4 h-1 bg-slate-500 rounded"></div>
                <span>{t.capitalInvestedNoCommissionsLabel}</span>
              </div>
              {activeBenchmark !== 'NONE' && (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-1 bg-sky-500 border-t border-dashed rounded"></div>
                  <span>{t.benchmarkLabel} ({activeBenchmark === 'TICKER' ? benchmarkSymbol : activeBenchmark})</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center text-slate-500 text-sm italic font-mono border border-dashed border-slate-800 rounded-2xl text-center px-4">
            {t.noTransactionDataForChartLabel}
          </div>
        )}

        {/* Rapporto Performance di Periodo */}
        {renderBalances.length > 0 && (
          <div className="bg-slate-950/80 p-5 rounded-2xl border border-slate-850 space-y-4">
            <div className="border-b border-slate-800 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest font-mono flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                {t.perfReportTitle} ({timeframe === 'CUSTOM' ? t.customValuation : timeframe})
              </h3>
              <span className="text-[10px] text-slate-500 font-mono font-bold uppercase select-none">
                {t.controlledBySelectedPeriodLabel}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Tile 1: TWRR */}
              <div className="bg-slate-900/10 p-3 h-full min-h-[7rem] sm:min-h-[6.5rem] flex flex-col rounded-xl border border-slate-800/60 hover:border-slate-700/60 transition duration-200">
                <span className="text-[9px] sm:text-[10px] text-slate-400 font-extrabold uppercase tracking-wide font-mono line-clamp-1 mb-1" title={t.twrrPeriodLabel}>{t.twrrPeriodLabel}</span>
                <div className="flex-1 flex items-center min-w-0">
                  <span className={`text-xs sm:text-sm md:text-base font-black font-mono shrink-0 ${periodTWRR >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {periodTWRR >= 0 ? '+' : ''}{periodTWRR.toFixed(2)}%
                  </span>
                </div>
                <span className="text-[8px] text-slate-500 leading-tight mt-1 line-clamp-2 shrink-0" title={t.twrrDesc}>{t.twrrDesc}</span>
              </div>

              {/* Tile 2: MWRR */}
              <div className="bg-slate-900/10 p-3 h-full min-h-[7rem] sm:min-h-[6.5rem] flex flex-col rounded-xl border border-slate-800/60 hover:border-slate-700/60 transition duration-200">
                <span className="text-[9px] sm:text-[10px] text-slate-400 font-extrabold uppercase tracking-wide font-mono line-clamp-1 mb-1" title={t.mwrrPeriodLabel}>{t.mwrrPeriodLabel}</span>
                <div className="flex-1 flex items-center min-w-0">
                  <span className={`text-xs sm:text-sm md:text-base font-black font-mono shrink-0 ${periodMWRR >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {periodMWRR >= 0 ? '+' : ''}{periodMWRR.toFixed(2)}%
                  </span>
                </div>
                <span className="text-[8px] text-slate-500 leading-tight mt-1 line-clamp-2 shrink-0" title={t.mwrrDesc}>{t.mwrrDesc}</span>
              </div>

              {/* Tile 3: Volatilita */}
              <div className="bg-slate-900/10 p-3 h-full min-h-[7rem] sm:min-h-[6.5rem] flex flex-col rounded-xl border border-slate-800/60 hover:border-slate-700/60 transition duration-200">
                <span className="text-[9px] sm:text-[10px] text-slate-400 font-extrabold uppercase tracking-wide font-mono line-clamp-1 mb-1" title={t.volatilityYearLabel}>{t.volatilityYearLabel}</span>
                <div className="flex-1 flex items-center min-w-0">
                  <span className="text-xs sm:text-sm md:text-base font-black font-mono text-white shrink-0">
                    {periodVolatility.toFixed(1)}%
                  </span>
                </div>
                <span className="text-[8px] text-slate-500 leading-tight mt-1 line-clamp-2 shrink-0" title={t.volatilityDesc}>{t.volatilityDesc}</span>
              </div>

              {/* Tile 4: Max Drawdown */}
              <div className="bg-slate-900/10 p-3 h-full min-h-[7rem] sm:min-h-[6.5rem] flex flex-col rounded-xl border border-slate-800/60 hover:border-slate-700/60 transition duration-200">
                <span className="text-[9px] sm:text-[10px] text-slate-400 font-extrabold uppercase tracking-wide font-mono line-clamp-1 mb-1" title={t.maxDrawdownLabel}>{t.maxDrawdownLabel}</span>
                <div className="flex-1 flex items-center min-w-0">
                  <span className="text-xs sm:text-sm md:text-base font-black font-mono text-rose-400 shrink-0">
                    -{periodMaxDrawdown.toFixed(1)}%
                  </span>
                </div>
                <span className="text-[8px] text-slate-500 leading-tight mt-1 line-clamp-2 shrink-0" title={t.maxDrawdownDesc}>{t.maxDrawdownDesc}</span>
              </div>

              {/* Tile 5: Investito nel Periodo */}
              <div className="bg-slate-900/10 p-3 h-full min-h-[7rem] sm:min-h-[6.5rem] flex flex-col rounded-xl border border-slate-800/60 hover:border-slate-700/60 transition duration-200">
                <span className="text-[9px] sm:text-[10px] text-slate-400 font-extrabold uppercase tracking-wide font-mono line-clamp-1 mb-1" title={t.netCapitalInvestedLabel}>{t.netCapitalInvestedLabel}</span>
                <div className="flex-1 flex items-center min-w-0 overflow-hidden">
                  <span className="text-xs sm:text-sm md:text-sm font-bold font-mono text-slate-200 break-all shrink-0">
                    {periodInvested.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currencySymbol}
                  </span>
                </div>
                <span className="text-[8px] text-slate-500 leading-tight mt-1 line-clamp-2 shrink-0" title={t.capitalInvestedDesc}>{t.capitalInvestedDesc}</span>
              </div>

              {/* Tile 6: Commissioni nel Periodo */}
              <div className="bg-slate-900/10 p-3 h-full min-h-[7rem] sm:min-h-[6.5rem] flex flex-col rounded-xl border border-slate-800/60 hover:border-slate-700/60 transition duration-200">
                <span className="text-[9px] sm:text-[10px] text-slate-400 font-extrabold uppercase tracking-wide font-mono line-clamp-1 mb-1" title={t.overallCommissionsLabel}>{t.overallCommissionsLabel}</span>
                <div className="flex-1 flex items-center min-w-0 overflow-hidden">
                  <span className="text-xs sm:text-sm md:text-sm font-bold font-mono text-rose-400 break-all shrink-0">
                    {periodCommissions.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currencySymbol}
                  </span>
                </div>
                <span className="text-[8px] text-slate-500 leading-tight mt-1 line-clamp-2 shrink-0" title={t.totalCommissionsDesc}>{t.totalCommissionsDesc}</span>
              </div>

              {/* Tile 7: Valore Finale del Periodo */}
              <div className="bg-slate-900/10 p-3 h-full min-h-[7rem] sm:min-h-[6.5rem] flex flex-col rounded-xl border border-slate-800/60 hover:border-slate-700/60 transition duration-200">
                <span className="text-[9px] sm:text-[10px] text-slate-400 font-extrabold uppercase tracking-wide font-mono line-clamp-1 mb-1" title={t.finalPeriodValueLabel}>{t.finalPeriodValueLabel}</span>
                <div className="flex-1 flex items-center min-w-0 overflow-hidden">
                  <span className="text-xs sm:text-sm md:text-sm font-bold font-mono text-emerald-400 break-all shrink-0">
                    {periodFinalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currencySymbol}
                  </span>
                </div>
                <span className="text-[8px] text-slate-500 leading-tight mt-1 line-clamp-2 shrink-0" title={t.finalValueDesc}>{t.finalValueDesc}</span>
              </div>

              {/* Tile 8: Guadagno Netto nel Periodo */}
              <div className="bg-slate-900/10 p-3 h-full min-h-[7rem] sm:min-h-[6.5rem] flex flex-col rounded-xl border border-slate-800/60 hover:border-slate-700/60 transition duration-200">
                <span className="text-[9px] sm:text-[10px] text-slate-400 font-extrabold uppercase tracking-wide font-mono line-clamp-1 mb-1" title={t.netPeriodGainLabel}>{t.netPeriodGainLabel}</span>
                <div className="flex-1 flex items-center min-w-0 overflow-hidden">
                  <span className={`text-xs sm:text-sm md:text-sm font-bold font-mono break-all shrink-0 ${periodNetGain >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {periodNetGain >= 0 ? '+' : ''}{periodNetGain.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currencySymbol}
                  </span>
                </div>
                <span className="text-[8px] text-slate-500 leading-tight mt-1 line-clamp-2 shrink-0" title={t.netGainDesc}>{t.netGainDesc}</span>
              </div>
            </div>
          </div>
        )}

        {/* Benchmarks & advanced controllers */}
        <div className="grid md:grid-cols-2 gap-6 bg-slate-950 p-5 rounded-xl border border-slate-800">
          {/* Benchmark setup */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
              <BarChart2 className="w-4 h-4 text-sky-400" />
              {t.benchmarkOptionsTitle}
            </h3>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setActiveBenchmark('NONE')}
                  className={`py-1.5 px-3 text-xs font-semibold rounded border transition ${
                    activeBenchmark === 'NONE'
                      ? 'bg-sky-500/10 border-sky-500 text-sky-400'
                      : 'bg-slate-900 border-slate-800 text-slate-500'
                  }`}
                >
                  {t.noBenchmark}
                </button>
                <button
                  onClick={() => setActiveBenchmark('TICKER')}
                  className={`py-1.5 px-3 text-xs font-semibold rounded border transition ${
                    activeBenchmark === 'TICKER'
                      ? 'bg-sky-500/10 border-sky-500 text-sky-400'
                      : 'bg-slate-900 border-slate-800 text-slate-500'
                  }`}
                >
                  {t.tickerDCAOption}
                </button>
              </div>

              {activeBenchmark === 'TICKER' && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex gap-2">
                    <TickerInput
                      value={benchmarkSymbol}
                      onChange={(val) => setBenchmarkSymbol(val.toUpperCase())}
                      placeholder={t.tickerPlaceholder}
                      className="bg-slate-900 text-white text-xs py-1.5 px-2.5 rounded border border-slate-800 focus:outline-none focus:border-sky-500 font-mono flex-1 uppercase w-full"
                      portfolioSymbols={assetAllocation.map(a => a.symbol)}
                    />
                  </div>
                  <div className="text-[10px] text-sky-400 font-bold font-mono">
                    {t.autoDownloadNotice}
                  </div>
                </div>
              )}

              {/* Account/Portfolio list as benchmarks */}
              {availableBenchmarkOptions.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 font-semibold block">{t.compareWithBrokerLabel}</label>
                  <select
                    value={activeBenchmark}
                    onChange={(e) => setActiveBenchmark(e.target.value)}
                    className="bg-slate-900 text-white text-xs py-1.5 px-2 rounded border border-slate-800 focus:outline-none w-full"
                  >
                    <option value="NONE">{t.selectPortfolioAccountPlaceholder}</option>
                    {availableBenchmarkOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Inflation indexation setting */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4 text-green-400" />
              {t.realInflationLookTitle}
            </h3>

            <div className="space-y-3 text-xs text-slate-400">
              <div className="flex items-center justify-between">
                <span>{t.realInflationSubtitle}</span>
                <button
                  type="button"
                  onClick={() => setInflationToggle(!inflationToggle)}
                  className={`w-10 h-6 rounded-full p-1 transition-colors duration-200 outline-none focus:outline-none flex ${
                    inflationToggle ? 'bg-green-500 justify-end' : 'bg-slate-800 justify-start'
                  }`}
                >
                  <span className="w-4 h-4 rounded-full bg-white shadow-md block"></span>
                </button>
              </div>
              <p className="text-[10px] leading-relaxed select-text">
                {t.realInflationToggleDesc}
              </p>
              
              {/* Inflation Index Selector inside controls box inside chart */}
              {inflationToggle && inflationIndices.length > 0 && onSelectInflationId && (
                <div className="space-y-1 pt-2 border-t border-slate-900">
                  <label className="text-[9px] text-slate-500 font-black uppercase tracking-wider block">{t.activeInflationIndexLabel}</label>
                  <select
                    value={selectedInflationId}
                    onChange={(e) => onSelectInflationId(e.target.value)}
                    className="bg-slate-900 text-white text-xs py-1.5 px-2 rounded border border-slate-800 focus:outline-none focus:border-green-500 w-full font-bold font-sans"
                  >
                    {inflationIndices.map((inf) => (
                      <option key={inf.id} value={inf.id} className="bg-slate-950 text-white font-medium">
                        {inf.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {positionsTableNode}

      {/* Tickers breakdown and weight rebalancing */}
      <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 space-y-4">
        <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-green-500" />
            <h3 className="text-lg font-bold text-white">{t.assetsAndRebalancingTitle}</h3>
          </div>
          {sumTargetWeights !== 100 && sumTargetWeights > 0 && (
            <span className="text-xs text-orange-400 font-mono flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> {t.targetWeightingSumNotice.replace('{sum}', sumTargetWeights.toString())}
            </span>
          )}
          {sumTargetWeights === 100 && (
            <span className="text-xs text-green-400 font-mono flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> {t.targetOk}
            </span>
          )}
        </div>

        {assetAllocation.length > 0 ? (
          <div className="space-y-6">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {assetAllocation.map((asset) => {
                const diff = asset.weight - asset.target;
                const rebalanceAction = diff > 3 
                  ? t.statusSellMore 
                  : diff < -3 
                    ? t.statusBuyMore 
                    : t.statusInTarget;

                return (
                  <div key={asset.symbol} className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <span 
                          onClick={() => onSelectTicker?.(asset.symbol)}
                          className={`text-sm font-bold text-white block uppercase tracking-wider ${onSelectTicker ? 'cursor-pointer hover:text-emerald-400 transition-colors duration-200' : ''}`}
                          title={t.clickAnalyzeTickerTooltip}
                        >
                          {asset.symbol}
                        </span>
                        <span className="text-xs text-slate-500 font-mono">Valore: {asset.value.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currencySymbol}</span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                        rebalanceAction === t.statusInTarget 
                          ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
                          : rebalanceAction === t.statusBuyMore
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-red-500/10 text-red-500 border border-red-500/20'
                      }`}>
                        {rebalanceAction}
                      </span>
                    </div>

                    {/* Weights visual row */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-slate-400">{t.currentWeightLabel} <strong className="text-white">{asset.weight.toFixed(1)}%</strong></span>
                        <span className="text-slate-400">{t.targetPercentLabel}</span>
                      </div>
                      
                      <div className="flex gap-2 items-center">
                        <div className="flex-1 h-2.5 bg-slate-900 rounded-full overflow-hidden relative border border-slate-800">
                          {/* target bracket bar */}
                          <div
                            className="absolute h-full bg-slate-800 border-r-2 border-slate-500"
                            style={{ width: `${asset.target}%` }}
                          ></div>
                          {/* current weight bar */}
                          <div
                            className="absolute h-full bg-green-500/80 rounded-full"
                            style={{ width: `${asset.weight}%` }}
                          ></div>
                        </div>

                        {/* Editable Target Weight input field */}
                        <div className="w-16">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={asset.target || 0}
                            onChange={(e) => onUpdateTargetWeight(asset.symbol, Math.min(100, Math.max(0, Number(e.target.value))))}
                            className="bg-slate-900 border border-slate-800 text-white rounded text-center text-xs py-0.5 w-full font-mono outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Visual total composition bar showing color distribution */}
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-400 block font-mono">{t.visualPortfolioBreakdownLabel}</span>
              <div className="h-6 w-full rounded-lg bg-slate-950 border border-slate-800 flex overflow-hidden">
                {assetAllocation.map((asset, index) => {
                  const colors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#f43f5e'];
                  const color = colors[index % colors.length];
                  if (asset.weight <= 0) return null;
                  return (
                    <div
                      key={asset.symbol}
                      className="h-full border-r border-slate-950 flex items-center justify-center cursor-help text-[10px] font-bold text-white font-mono truncate"
                      style={{ width: `${asset.weight}%`, backgroundColor: color }}
                      title={`${asset.symbol}: ${asset.weight.toFixed(1)}%`}
                    >
                      {asset.weight > 6 ? asset.symbol : ''}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-slate-500 text-xs italic font-mono p-4 text-center border border-dashed border-slate-800 rounded-lg">
            {t.noAssetsInPortfolio}
          </div>
        )}
      </div>
    </div>
  );
}
