/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { LanguagePhrases, Currency } from '../types.ts';
import { LineChart, Calendar, RefreshCw, BarChart2, CheckCircle2, AlertTriangle, Activity, TrendingUp, TrendingDown, Percent } from 'lucide-react';
import { TickerInput } from './TickerInput.tsx';
import { formatDateString } from '../utils.ts';

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
  inflationIndices?: any[];
  selectedInflationId?: string;
  onSelectInflationId?: (id: string) => void;
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
  inflationIndices = [],
  selectedInflationId = '',
  onSelectInflationId
}: InteractiveChartProps) {
  const [timeframe, setTimeframe] = useState<string>('ALL');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

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
    
    // We assuming benchmark is represented proportionally
    // Let's modify bench tracking so it starts alongside currentValue
    return filteredBalances.map((b, i) => {
      let benchProcessed: number | undefined = undefined;
      // If we have bench info
      if (b.benchmarkValue && filteredBalances[0].benchmarkValue) {
        const benchRatio = b.benchmarkValue / filteredBalances[0].benchmarkValue;
        benchProcessed = baseValue * benchRatio;
      }
      return {
        ...b,
        benchNormalized: benchProcessed
      };
    });
  };

  const renderBalances = prepareRenderBalances();

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

  // Find transactions that fall within the selected period's start and end dates
  const periodTransactions = activeTxSorted.filter(tx => {
    if (renderBalances.length === 0) return false;
    const firstDateStr = renderBalances[0].date;
    const lastDateStr = renderBalances[renderBalances.length - 1].date;
    const txDateStr = tx.date.split('T')[0];
    return txDateStr >= firstDateStr && txDateStr <= lastDateStr;
  });

  const periodInitialValue = renderBalances.length > 0 ? renderBalances[0].currentValue : 0;
  const periodFinalValue = renderBalances.length > 0 ? renderBalances[renderBalances.length - 1].currentValue : 0;

  const periodInvested = periodTransactions
    .filter(tx => tx.type === 'BUY')
    .reduce((sum, tx) => sum + (tx.qty * tx.price), 0);

  const periodCommissions = periodTransactions
    .reduce((sum, tx) => sum + (tx.commission || 0), 0);

  const periodSells = periodTransactions
    .filter(tx => tx.type === 'SELL')
    .reduce((sum, tx) => sum + (tx.qty * tx.price), 0);
  
  const netContributions = periodInvested - periodSells;
  const periodNetGain = periodFinalValue - periodInitialValue - netContributions;

  // Maximum Drawdown del Periodo
  const getPeriodDrawdown = () => {
    if (renderBalances.length === 0) return 0;
    let peak = -Infinity;
    let maxDD = 0;
    renderBalances.forEach(b => {
      if (b.currentValue > peak) {
        peak = b.currentValue;
      }
      const dd = peak > 0 ? (peak - b.currentValue) / peak : 0;
      if (dd > maxDD) {
        maxDD = dd;
      }
    });
    return maxDD * 100;
  };
  const periodMaxDrawdown = getPeriodDrawdown();

  // Volatilità del Periodo
  const getPeriodVolatility = () => {
    if (renderBalances.length < 3) return 0;
    const dailyReturns: number[] = [];
    for (let i = 1; i < renderBalances.length; i++) {
      const prev = renderBalances[i-1].currentValue;
      const curr = renderBalances[i].currentValue;
      if (prev > 0) {
        dailyReturns.push((curr - prev) / prev);
      }
    }
    if (dailyReturns.length < 2) return 0;
    const mean = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (dailyReturns.length - 1);
    const dailyStdDev = Math.sqrt(variance);
    // Annualize std dev
    return dailyStdDev * Math.sqrt(252) * 100;
  };
  const periodVolatility = getPeriodVolatility();

  // MWRR del Periodo (IRR)
  const getPeriodMWRR = (): number => {
    if (renderBalances.length < 2 || periodTransactions.length === 0 || periodFinalValue <= 0) return 0;
    
    const solverFlows: { years: number; amount: number }[] = [];
    const firstDate = new Date(renderBalances[0].date);
    const lastDate = new Date(renderBalances[renderBalances.length - 1].date);
    const lastMillis = lastDate.getTime();

    solverFlows.push({
      years: (lastMillis - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 365),
      amount: -periodInitialValue
    });

    periodTransactions.forEach((tx) => {
      const txDate = new Date(tx.date);
      const yearsAgo = (lastMillis - txDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
      
      const cfAmount = tx.type === 'BUY'
        ? -(tx.qty * tx.price + (includeCommissions ? tx.commission : 0))
        : (tx.qty * tx.price - (includeCommissions ? tx.commission : 0));

      solverFlows.push({ years: yearsAgo, amount: cfAmount });
    });

    const f = (r: number) => {
      let sum = periodFinalValue;
      for (const flow of solverFlows) {
        sum += flow.amount * Math.pow(1 + r, flow.years);
      }
      return sum;
    };

    let low = -0.99;
    let high = 2.5;
    let f_low = f(low);
    let f_high = f(high);

    if (f_low * f_high > 0) {
      high = 6.0;
      f_high = f(high);
    }

    if (f_low * f_high > 0) {
      const divider = periodInitialValue + netContributions;
      return divider > 0 ? ((periodFinalValue - divider) / divider) * 100 : 0;
    }

    let mid = 0;
    for (let i = 0; i < 40; i++) {
      mid = (low + high) / 2;
      const f_mid = f(mid);
      if (Math.abs(f_mid) < 0.0001) break;
      if (f_low * f_mid < 0) {
        high = mid;
        f_high = f_mid;
      } else {
        low = mid;
        f_low = f_mid;
      }
    }
    return mid * 100;
  };
  const periodMWRR = getPeriodMWRR();

  // TWRR del Periodo
  const getPeriodTWRR = (): number => {
    if (renderBalances.length < 2) return 0;
    let productTerm = 1;
    for (let i = 1; i < renderBalances.length; i++) {
      const prev = renderBalances[i - 1].currentValue;
      const curr = renderBalances[i].currentValue;
      
      const prevInv = renderBalances[i - 1].investedNominal;
      const currInv = renderBalances[i].investedNominal;
      const contribution = currInv - prevInv;

      const denominator = prev + (contribution > 0 ? contribution : 0);
      const numerator = curr - (contribution < 0 ? contribution : 0);
      
      if (denominator > 0) {
        const dailyReturn = (numerator - denominator) / denominator;
        productTerm *= (1 + dailyReturn);
      }
    }
    return (productTerm - 1) * 100;
  };
  const periodTWRR = getPeriodTWRR();

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
          <div className="flex items-center gap-2">
            <LineChart className="w-5 h-5 text-green-500" />
            <h2 className="text-lg font-bold text-white">{t.historicalCapitalTrend}</h2>
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
                  <span className="text-white font-semibold">{formatDateString(activeHoverData.date, lang)}</span>
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

            <div className="overflow-x-auto w-full">
              <svg
                width="100%"
                height={chartHeight}
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="overflow-visible select-none"
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
              <div className="bg-slate-900/10 p-3 h-24 flex flex-col justify-between rounded-xl border border-slate-800/60 hover:border-slate-700/60 transition duration-200">
                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide font-mono">{t.twrrPeriodLabel}</span>
                <span className={`text-base font-black font-mono ${periodTWRR >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {periodTWRR >= 0 ? '+' : ''}{periodTWRR.toFixed(2)}%
                </span>
                <span className="text-[8px] text-slate-500 leading-tight">{t.twrrDesc}</span>
              </div>

              {/* Tile 2: MWRR */}
              <div className="bg-slate-900/10 p-3 h-24 flex flex-col justify-between rounded-xl border border-slate-800/60 hover:border-slate-700/60 transition duration-200">
                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide font-mono">{t.mwrrPeriodLabel}</span>
                <span className={`text-base font-black font-mono ${periodMWRR >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {periodMWRR >= 0 ? '+' : ''}{periodMWRR.toFixed(2)}%
                </span>
                <span className="text-[8px] text-slate-500 leading-tight">{t.mwrrDesc}</span>
              </div>

              {/* Tile 3: Volatilita */}
              <div className="bg-slate-900/10 p-3 h-24 flex flex-col justify-between rounded-xl border border-slate-800/60 hover:border-slate-700/60 transition duration-200">
                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide font-mono">{t.volatilityYearLabel}</span>
                <span className="text-base font-black font-mono text-white">
                  {periodVolatility.toFixed(1)}%
                </span>
                <span className="text-[8px] text-slate-500 leading-tight font-mono">{t.volatilityDesc}</span>
              </div>

              {/* Tile 4: Max Drawdown */}
              <div className="bg-slate-900/10 p-3 h-24 flex flex-col justify-between rounded-xl border border-slate-800/60 hover:border-slate-700/60 transition duration-200">
                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide font-mono">{t.maxDrawdownLabel}</span>
                <span className="text-base font-black font-mono text-rose-400">
                  -{periodMaxDrawdown.toFixed(1)}%
                </span>
                <span className="text-[8px] text-slate-500 leading-tight">{t.maxDrawdownDesc}</span>
              </div>

              {/* Tile 5: Investito nel Periodo */}
              <div className="bg-slate-900/10 p-3 h-24 flex flex-col justify-between rounded-xl border border-slate-800/60 hover:border-slate-700/60 transition duration-200">
                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide font-mono">{t.netCapitalInvestedLabel}</span>
                <span className="text-sm font-bold font-mono text-slate-200 truncate">
                  {periodInvested.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currencySymbol}
                </span>
                <span className="text-[8px] text-slate-500 leading-tight">{t.capitalInvestedDesc}</span>
              </div>

              {/* Tile 6: Commissioni nel Periodo */}
              <div className="bg-slate-900/10 p-3 h-24 flex flex-col justify-between rounded-xl border border-slate-800/60 hover:border-slate-700/60 transition duration-200">
                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide font-mono">{t.overallCommissionsLabel}</span>
                <span className="text-sm font-bold font-mono text-rose-400 truncate">
                  {periodCommissions.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currencySymbol}
                </span>
                <span className="text-[8px] text-slate-500 leading-tight">{t.totalCommissionsDesc}</span>
              </div>

              {/* Tile 7: Valore Finale del Periodo */}
              <div className="bg-slate-900/10 p-3 h-24 flex flex-col justify-between rounded-xl border border-slate-800/60 hover:border-slate-700/60 transition duration-200">
                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide font-mono">{t.finalPeriodValueLabel}</span>
                <span className="text-sm font-bold font-mono text-emerald-400 truncate">
                  {periodFinalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currencySymbol}
                </span>
                <span className="text-[8px] text-slate-500 leading-tight">{t.finalValueDesc}</span>
              </div>

              {/* Tile 8: Guadagno Netto nel Periodo */}
              <div className="bg-slate-900/10 p-3 h-24 flex flex-col justify-between rounded-xl border border-slate-800/60 hover:border-slate-700/60 transition duration-200">
                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide font-mono">{t.netPeriodGainLabel}</span>
                <span className={`text-sm font-bold font-mono truncate ${periodNetGain >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {periodNetGain >= 0 ? '+' : ''}{periodNetGain.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currencySymbol}
                </span>
                <span className="text-[8px] text-slate-500 leading-tight">{t.netGainDesc}</span>
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
