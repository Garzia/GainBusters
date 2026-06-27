/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { LanguagePhrases } from '../types.ts';
import { 
  Calculator, 
  TrendingUp, 
  Info, 
  Flame, 
  Percent, 
  Coins, 
  Calendar,
  Layers,
  Sparkles,
  RefreshCw,
  HelpCircle
} from 'lucide-react';

interface ToolsPageProps {
  t: LanguagePhrases;
  currencySymbol: string;
  totalNominalValue?: number;
  lang?: string;
}

type SubTab = 'pac' | 'cagr';

export default function ToolsPage({ t, currencySymbol, totalNominalValue = 0, lang = 'it' }: ToolsPageProps) {
  // We have exactly two subtabs now as per request: PAC & FIRE combined, and CAGR Calculator.
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('pac');

  // ================= STATE FOR COMPOUND/PAC INITIAL LOGIC =================
  const [initialCapital, setInitialCapital] = useState<number>(10000);
  const [pacAmount, setPacAmount] = useState<number>(300);
  const [pacFrequency, setPacFrequency] = useState<'twice_monthly' | 'monthly' | 'bimonthly' | 'quarterly' | 'quadrimonthly' | 'semiannually' | 'annually'>('monthly');
  const [annualReturn, setAnnualReturn] = useState<number>(7);
  const [years, setYears] = useState<number>(20);
  const [compoundingFreq, setCompoundingFreq] = useState<'none' | 'daily' | 'monthly' | 'quarterly' | 'semiannually' | 'annually'>('monthly');

  // Interactive SWR (Safe Withdrawal Rate) state integrated directly in the PAC flow
  const [swr, setSwr] = useState<number>(4.0);

  // Interactive chart stats
  const [hoveredPacIndex, setHoveredPacIndex] = useState<number | null>(null);

  // ================= STATE FOR CAGR CALCULATOR =================
  const [cagrMethod, setCagrMethod] = useState<'percentage' | 'capitals'>('percentage');
  const [cagrTotalReturn, setCagrTotalReturn] = useState<number>(150);
  const [cagrInitialCap, setCagrInitialCap] = useState<number>(10000);
  const [cagrFinalCap, setCagrFinalCap] = useState<number>(25000);
  const [cagrYears, setCagrYears] = useState<number>(5);

  // Fetch live global portfolio value (excluding selected values in main settings)
  const handleUseGlobalPortfolio = () => {
    if (totalNominalValue > 0) {
      setInitialCapital(Math.round(totalNominalValue));
    }
  };

  // Convert timeline in years to target month & year label
  const getTimelineTargetDateLabel = (numYears: number) => {
    const targetDate = new Date();
    targetDate.setFullYear(targetDate.getFullYear() + numYears);
    const mIndex = targetDate.getMonth() + 1; // 1 to 12
    const key = `month${mIndex}` as keyof typeof t;
    const monthStr = t[key] || '';
    return `${monthStr} ${targetDate.getFullYear()}`;
  };

  // ================= COMPUTE COMPOUND INTEREST + PAC =================
  const valuesByYear: { year: number; invested: number; interest: number; total: number }[] = [];
  
  let currentTotal = initialCapital;
  let totalInvested = initialCapital;
  let accruedInterestForPeriod = 0;
  let simpleInterestAccrued = 0;

  const r = annualReturn / 100;
  const totalMonths = years * 12;

  for (let m = 1; m <= totalMonths; m++) {
    const currentYearMonth = ((m - 1) % 12) + 1; // 1 to 12

    // 1. Calculate and accrue interest during this month (based on starts-of-period principal)
    let interestThisMonth = 0;
    if (compoundingFreq === 'none') {
      // Simple interest scales from totalInvested principal and does not compound
      interestThisMonth = totalInvested * (r / 12);
      simpleInterestAccrued += interestThisMonth;
    } else {
      // Compound interest scales from compounding principal
      if (compoundingFreq === 'daily') {
        // Precise daily compounding factor over a standard month: (1 + r / 365) ** (365 / 12) - 1
        interestThisMonth = currentTotal * (Math.pow(1 + r / 365, 365 / 12) - 1);
      } else {
        // Standard periodic interest accrual per month
        interestThisMonth = currentTotal * (r / 12);
      }
      accruedInterestForPeriod += interestThisMonth;
    }

    // 2. Compounding / Capitalization Event
    if (compoundingFreq !== 'none') {
      let isCompoundingMonth = false;
      if (compoundingFreq === 'daily' || compoundingFreq === 'monthly') {
        isCompoundingMonth = true;
      } else if (compoundingFreq === 'quarterly' && currentYearMonth % 3 === 0) {
        isCompoundingMonth = true;
      } else if (compoundingFreq === 'semiannually' && currentYearMonth % 6 === 0) {
        isCompoundingMonth = true;
      } else if (compoundingFreq === 'annually' && currentYearMonth === 12) {
        isCompoundingMonth = true;
      }

      if (isCompoundingMonth) {
        currentTotal += accruedInterestForPeriod;
        accruedInterestForPeriod = 0;
      }
    }

    // 3. New contribution PAC deposits (considered paid at the end of each period/month)
    let pacAmountThisMonth = 0;
    if (pacFrequency === 'twice_monthly') {
      pacAmountThisMonth = pacAmount * 2;
    } else if (pacFrequency === 'monthly') {
      pacAmountThisMonth = pacAmount;
    } else if (pacFrequency === 'bimonthly' && currentYearMonth % 2 === 0) {
      pacAmountThisMonth = pacAmount;
    } else if (pacFrequency === 'quarterly' && currentYearMonth % 3 === 0) {
      pacAmountThisMonth = pacAmount;
    } else if (pacFrequency === 'quadrimonthly' && currentYearMonth % 4 === 0) {
      pacAmountThisMonth = pacAmount;
    } else if (pacFrequency === 'semiannually' && currentYearMonth % 6 === 0) {
      pacAmountThisMonth = pacAmount;
    } else if (pacFrequency === 'annually' && currentYearMonth === 12) {
      pacAmountThisMonth = pacAmount;
    }

    totalInvested += pacAmountThisMonth;
    if (compoundingFreq !== 'none') {
      currentTotal += pacAmountThisMonth;
    }

    // 4. Record states at the end of each year
    if (m % 12 === 0) {
      const year = m / 12;
      if (compoundingFreq === 'none') {
        const total = totalInvested + simpleInterestAccrued;
        const interestEarned = Math.max(0, simpleInterestAccrued);
        valuesByYear.push({
          year,
          invested: Math.round(totalInvested),
          interest: Math.round(interestEarned),
          total: Math.round(total)
        });
      } else {
        const total = currentTotal + accruedInterestForPeriod;
        const interestEarned = Math.max(0, total - totalInvested);
        valuesByYear.push({
          year,
          invested: Math.round(totalInvested),
          interest: Math.round(interestEarned),
          total: Math.round(total)
        });
      }
    }
  }

  const finalPacState = valuesByYear[valuesByYear.length - 1] || { invested: 0, interest: 0, total: 0 };

  // ================= INTEGRATED FIRE SIMULATION BASED ON PAC VALUES =================
  // Retire today assumes Initial Capital + First PAC payment is invested today
  const capitalToday = initialCapital + pacAmount;
  const todayAnnualWithdrawal = capitalToday * (swr / 100);
  const todayMonthlyWithdrawal = todayAnnualWithdrawal / 12;

  // Retire in the future assuming final accumulated PAC amount
  const capitalFuture = finalPacState.total;
  const futureAnnualWithdrawal = capitalFuture * (swr / 100);
  const futureMonthlyWithdrawal = futureAnnualWithdrawal / 12;

  // ================= COMPUTE CAGR VALUE =================
  let calculatedCagr = 0;
  if (cagrMethod === 'percentage') {
    if (cagrYears > 0) {
      calculatedCagr = (Math.pow(1 + (cagrTotalReturn / 100), 1 / cagrYears) - 1) * 100;
    }
  } else {
    if (cagrInitialCap > 0 && cagrYears > 0) {
      calculatedCagr = (Math.pow(cagrFinalCap / cagrInitialCap, 1 / cagrYears) - 1) * 100;
    }
  }

  const formatC = (val: number) => {
    return `${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}${currencySymbol}`;
  };

  const formatCFraction = (val: number) => {
    return `${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currencySymbol}`;
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      {/* Page Title & Tab Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800/80 pb-4 gap-4">
        <div className="flex items-center gap-3">
          <Calculator className="w-8 h-8 text-emerald-500" />
          <div>
            <h1 className="text-2xl font-bold text-white">{t.toolsPageTitle}</h1>
            <p className="text-sm text-slate-400">{t.toolsPageDesc}</p>
          </div>
        </div>

        {/* Sub Navigation Tabs */}
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 self-start md:self-auto shrink-0">
          <button
            onClick={() => setActiveSubTab('pac')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeSubTab === 'pac'
                ? 'bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 font-bold'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/50 border border-transparent'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>{t.tabPacFire}</span>
          </button>
          <button
            onClick={() => setActiveSubTab('cagr')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeSubTab === 'cagr'
                ? 'bg-sky-500/15 border border-sky-500/25 text-sky-400 font-bold'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/50 border border-transparent'
            }`}
          >
            <Percent className="w-3.5 h-3.5" />
            <span>{t.tabCagr}</span>
          </button>
        </div>
      </div>

      {/* ======================= TAB 1: INTEGRATED PAC & FIRE SYSTEM ======================= */}
      {activeSubTab === 'pac' && (
        <div className="space-y-8 animate-fade-in">
          <div className="grid lg:grid-cols-12 gap-8">
            {/* Input Controls */}
            <div className="lg:col-span-12 xl:col-span-5 bg-slate-900/20 p-6 rounded-2xl border border-slate-800/80 space-y-6">
              <div>
                <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-800/60">
                  <Layers className="w-4 h-4 text-emerald-500" />
                  {t.configureAccumulationTitle}
                </h2>
              </div>

              {/* Initial Capital */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <label className="font-semibold text-slate-400 uppercase tracking-wider block">
                    {t.initialCapital}
                  </label>
                  {totalNominalValue > 0 && (
                    <button
                      onClick={handleUseGlobalPortfolio}
                      className="text-[11px] text-emerald-400 font-medium hover:underline flex items-center gap-1 hover:text-emerald-300 transition-colors"
                    >
                      <RefreshCw className="w-3 h-3 text-emerald-500 animate-spin-hover" />
                      {t.useGlobalPortfolioTooltip.replace('{val}', formatC(totalNominalValue))}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono">
                    {currencySymbol}
                  </span>
                  <input
                    type="number"
                    value={initialCapital}
                    onChange={(e) => setInitialCapital(Math.max(0, Number(e.target.value)))}
                    className="w-full pl-8 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500 transition-colors text-sm"
                  />
                </div>
              </div>

              {/* PAC contribution amount and frequency */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-800/40 pt-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                    {t.pacPeriodicDepositLabel}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono">
                      {currencySymbol}
                    </span>
                    <input
                      type="number"
                      value={pacAmount}
                      onChange={(e) => setPacAmount(Math.max(0, Number(e.target.value)))}
                      className="w-full pl-8 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500 transition-colors text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                    {t.depositFrequencyLabel}
                  </label>
                  <select
                    value={pacFrequency}
                    onChange={(e) => setPacFrequency(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 focus:outline-none focus:border-emerald-500 text-white text-xs py-2 px-2.5 rounded-lg font-mono font-bold h-9"
                  >
                    <option value="twice_monthly">{t.freqTwiceMonthly}</option>
                    <option value="monthly">{t.freqMonthly}</option>
                    <option value="bimonthly">{t.freqBimonthly}</option>
                    <option value="quarterly">{t.freqQuarterly}</option>
                    <option value="quadrimonthly">{t.freqQuadrimonthly}</option>
                    <option value="semiannually">{t.freqSemiannually}</option>
                    <option value="annually">{t.freqAnnually}</option>
                  </select>
                </div>
              </div>

              {/* Expected Return and Horizon Slider */}
              <div className="border-t border-slate-800/40 pt-4 space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                    {t.expectedReturnLabel}
                  </label>
                  <div className="relative">
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono">%</span>
                    <input
                      type="number"
                      step="0.1"
                      value={annualReturn}
                      onChange={(e) => setAnnualReturn(Math.max(0, Number(e.target.value)))}
                      className="w-full pr-8 pl-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500 transition-colors text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <div className="flex justify-between items-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    <span>{t.pacHorizonLabel}</span>
                    <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded font-mono text-[11px] flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {years} {years === 1 ? t.yearSingular : t.yearsPlural} ({getTimelineTargetDateLabel(years)})
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    value={years}
                    onChange={(e) => setYears(Number(e.target.value))}
                    className="w-full accent-emerald-500 h-1.5 cursor-pointer rounded-lg bg-slate-950"
                  />
                  <div className="flex justify-between text-[10px] text-slate-600 font-mono pt-0.5">
                    <span>1 {t.yearSingular}</span>
                    <span>25 {t.yearsPlural}</span>
                    <span>50 {t.yearsPlural}</span>
                  </div>
                </div>
              </div>

              {/* Compounding and SWR Setup combined in the sidebar input block */}
              <div className="border-t border-slate-800/40 pt-5 space-y-5">
                <div>
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 pb-2">
                    <Flame className="w-4 h-4 text-amber-500" />
                    {t.fireParamsTitle}
                  </h3>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    {t.fireParamsDesc}
                  </p>
                </div>

                {/* SWR Slider */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <label className="font-semibold text-slate-400 uppercase tracking-wider">
                      {t.safeWithdrawalRateLabel || 'Safe Withdrawal Rate (SWR)'}
                    </label>
                    <span className="text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded font-mono text-[11px]">
                      {swr.toFixed(1)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="2"
                    max="6.5"
                    step="0.1"
                    value={swr}
                    onChange={(e) => setSwr(Number(e.target.value))}
                    className="w-full accent-amber-500 h-1.5 cursor-pointer bg-slate-950 rounded-lg"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>2.0% ({t.conservativeLabel})</span>
                    <span className="text-amber-500/80">{t.swrStandardNotice}</span>
                    <span>6.5% ({t.aggressiveLabel})</span>
                  </div>
                </div>

                {/* Capitalization details */}
                <div className="space-y-2 border-t border-slate-800/40 pt-4">
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                    {t.freqCompoundingLabel}
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {(['daily', 'monthly', 'annually', 'none'] as const).map((mode) => {
                      const modeLabels: Record<string, string> = {
                        daily: t.compoundingDaily,
                        monthly: t.compoundingMonthly,
                        annually: t.compoundingAnnually,
                        none: t.compoundingSimple
                      };
                      return (
                        <button
                          key={mode}
                          onClick={() => setCompoundingFreq(mode)}
                          className={`py-1 text-[10px] font-semibold rounded-md border transition-all ${
                            compoundingFreq === mode
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-bold'
                              : 'bg-slate-950 border-slate-800/80 text-slate-500 hover:text-white'
                          }`}
                        >
                          {modeLabels[mode]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Results, Graph and real-time hover indicators */}
            <div className="lg:col-span-12 xl:col-span-7 flex flex-col space-y-6">
              {/* Primary PAC Metrics */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-900/30 p-4 rounded-xl border border-slate-800/80">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">{t.totalInvestedCard}</span>
                  <span className="text-lg md:text-xl font-bold text-slate-100 font-mono break-all leading-tight">
                    {formatC(finalPacState.invested)}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">({initialCapital > 0 ? t.withBaseLabel : t.onlyPacLabel})</span>
                </div>

                <div className="bg-slate-900/30 p-4 rounded-xl border border-slate-800/80">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">{t.interestsGeneratedCard}</span>
                  <span className="text-lg md:text-xl font-bold text-emerald-400 font-mono break-all leading-tight">
                    + {formatC(finalPacState.interest)}
                  </span>
                  <span className="text-[10px] text-emerald-600 font-semibold block mt-0.5">
                    {finalPacState.total > 0 ? `+${((finalPacState.interest / finalPacState.total) * 100).toFixed(1)}%` : '0%'} {t.totalLabel}
                  </span>
                </div>

                <div className="bg-slate-900/40 p-4 rounded-xl border border-emerald-500/20 ring-2 ring-emerald-500/5 bg-emerald-950/5">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block mb-1">{t.pacFinalValueCard}</span>
                  <span className="text-lg md:text-xl font-bold text-emerald-400 font-mono break-all leading-tight">
                    {formatC(finalPacState.total)}
                  </span>
                  <span className="text-[10px] text-emerald-500/80 font-semibold block mt-1">{t.multipleLabel} {finalPacState.invested > 0 ? (finalPacState.total / finalPacState.invested).toFixed(2) : '1.00'}x</span>
                </div>
              </div>

              {/* Enhanced Interactive SVG Bar Chart for PAC with Integrated FIRE SWR calculations */}
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800/90 space-y-4 relative overflow-hidden grow">
                <div className="absolute right-0 top-0 -translate-y-12 translate-x-12 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl"></div>
                
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-emerald-500" />
                      {t.pacProjectionGraphTitle}
                    </h3>
                    <p className="text-[10px] text-slate-500">{t.pacProjectionGraphDesc}</p>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/10 self-start sm:self-auto">
                    {t.hoverToCalculateSwrLabel.replace('{pct}', swr.toFixed(1))}
                  </span>
                </div>

                {/* SVG Renderer */}
                {(() => {
                  const maxVal = Math.max(...valuesByYear.map(v => v.total), 1);
                  const chartHeight = 240;
                  const chartWidth = 600;
                  const barSpacing = valuesByYear.length > 35 ? 1 : 3;
                  const barsCount = valuesByYear.length;
                  const leftMargin = 52;
                  const rightMargin = 15;
                  const barW = Math.max(3, Math.floor((chartWidth - leftMargin - rightMargin) / barsCount) - barSpacing);

                  return (
                    <div className="space-y-4">
                      <div className="overflow-x-auto select-none">
                        <svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="overflow-visible min-w-[450px]">
                          {/* Grid line dividers */}
                          {[0.25, 0.5, 0.75, 1].map((p, i) => (
                            <g key={i}>
                              <line
                                x1={leftMargin}
                                y1={chartHeight - 30 - p * (chartHeight - 55)}
                                x2={chartWidth - rightMargin}
                                y2={chartHeight - 30 - p * (chartHeight - 55)}
                                stroke="#1e293b"
                                strokeWidth="0.8"
                                strokeDasharray="3 3"
                              />
                              <text
                                x={leftMargin - 8}
                                y={chartHeight - 27 - p * (chartHeight - 55)}
                                fill="#475569"
                                fontSize="8"
                                fontFamily="monospace"
                                textAnchor="end"
                              >
                                {formatC(maxVal * p)}
                              </text>
                            </g>
                          ))}
                          <text x={leftMargin - 8} y={chartHeight - 27} fill="#475569" fontSize="8" fontFamily="monospace" textAnchor="end">0</text>
                          <line x1={leftMargin} y1={chartHeight - 30} x2={chartWidth - rightMargin} y2={chartHeight - 30} stroke="#334155" strokeWidth="1" />

                          {/* Render columns representing year steps */}
                          {valuesByYear.map((v, i) => {
                            const x = leftMargin + i * ((chartWidth - leftMargin - rightMargin) / barsCount);
                            const totalH = (v.total / maxVal) * (chartHeight - 55);
                            const investedH = (v.invested / maxVal) * (chartHeight - 55);
                            const interestH = Math.max(0, totalH - investedH);
                            const isHovered = hoveredPacIndex === i;

                            return (
                              <g 
                                key={i} 
                                onMouseEnter={() => setHoveredPacIndex(i)}
                                onMouseLeave={() => setHoveredPacIndex(null)}
                                className="cursor-pointer"
                              >
                                {/* Column trigger and background indicator on Hover */}
                                {isHovered && (
                                  <rect
                                    x={x - 2}
                                    y="10"
                                    width={barW + 4}
                                    height={chartHeight - 40}
                                    fill="rgba(245, 158, 11, 0.05)"
                                    rx="2.5"
                                  />
                                )}

                                {/* Underlay: Invested Cap */}
                                <rect
                                  x={x}
                                  y={chartHeight - 30 - investedH}
                                  width={barW}
                                  height={investedH}
                                  fill={isHovered ? '#475569' : '#334155'}
                                  className="transition-all duration-200"
                                  rx="1"
                                />

                                {/* Overlay: Accumulated Interest */}
                                {interestH > 0 && (
                                  <rect
                                    x={x}
                                    y={chartHeight - 30 - totalH}
                                    width={barW}
                                    height={interestH}
                                    fill={isHovered ? '#10b981' : '#059669'}
                                    className="transition-all duration-200"
                                    rx="1"
                                  />
                                )}

                                {/* Hitbox */}
                                <rect
                                  x={x - 2}
                                  y="5"
                                  width={barW + 4}
                                  height={chartHeight - 35}
                                  fill="transparent"
                                />

                                {/* Label at bottom */}
                                {((barsCount <= 15) || (barsCount <= 30 && v.year % 5 === 0) || (v.year % 10 === 0) || v.year === 1 || v.year === barsCount) && (
                                  <text
                                    x={x + barW / 2}
                                    y={chartHeight - 12}
                                    fill={isHovered ? '#f59e0b' : '#475569'}
                                    fontSize="8"
                                    fontWeight={isHovered ? 'bold' : 'normal'}
                                    fontFamily="monospace"
                                    textAnchor="middle"
                                  >
                                    {t.yearAbbreviation}{v.year}
                                  </text>
                                )}
                              </g>
                            );
                          })}
                        </svg>
                      </div>

                      {/* Legend labels */}
                      <div className="flex items-center gap-6 text-[11px] text-slate-500 justify-center pt-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 bg-slate-600 rounded"></div>
                          <span>{t.totalInvestedCard}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 bg-emerald-600 rounded text-xs"></div>
                          <span>{t.reinvestedInterestsLabel}</span>
                        </div>
                      </div>

                      {/* Dynamic SWR prelievo details based on Hover Index */}
                      <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/80 transition-all">
                        {hoveredPacIndex !== null ? (
                          <div className="grid sm:grid-cols-12 gap-4 items-center">
                            <div className="sm:col-span-5 border-r border-slate-800/80 pr-2">
                              <span className="text-xs font-bold text-emerald-400 block font-mono">{t.yearDetailLabel} {valuesByYear[hoveredPacIndex].year} ({getTimelineTargetDateLabel(valuesByYear[hoveredPacIndex].year)})</span>
                              <div className="text-[11px] text-slate-300 mt-0.5">
                                {t.accumulatedCapitalLabel} <strong className="text-white font-mono">{formatC(valuesByYear[hoveredPacIndex].total)}</strong>
                              </div>
                            </div>

                            {/* SWR streams on hover column */}
                            <div className="sm:col-span-7 flex flex-wrap gap-x-6 gap-y-2 justify-between">
                              <div className="min-w-[110px]">
                                <span className="text-[10px] text-amber-500 font-semibold block uppercase tracking-wider">{t.swrMonthlyWithdrawalLabel}</span>
                                <span className="text-base font-bold text-amber-400 font-mono">
                                  {formatCFraction((valuesByYear[hoveredPacIndex].total * (swr / 100)) / 12)}
                                </span>
                              </div>
                              <div className="min-w-[110px]">
                                <span className="text-[10px] text-amber-500/80 font-semibold block uppercase tracking-wider">{t.swrAnnualWithdrawalLabel}</span>
                                <span className="text-sm font-semibold text-slate-200 font-mono">
                                  {formatCFraction(valuesByYear[hoveredPacIndex].total * (swr / 100))}
                                </span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse shrink-0" />
                            <div className="text-xs text-slate-400 leading-normal">
                              {t.graphHoverInstructionDetail.replace('{val}', swr.toFixed(1))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                
              </div>
            </div>
          </div>

          {/* ======================= DETAILED INTEGRATED FIRE PROJECTION SECTION BELOW PAC ======================= */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 md:p-8 space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 -translate-y-16 translate-x-16 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl"></div>
            
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800/60">
              <Flame className="w-6 h-6 text-amber-500 animate-pulse" />
              <div>
                <h3 className="text-lg font-bold text-white">{t.sustainablePensionTitle}</h3>
                <p className="text-xs text-slate-400">{t.sustainablePensionDesc}</p>
              </div>
            </div>

            {/* Dynamic SWR text breakdown requested explicitly */}
            <div className="text-slate-300 text-sm md:text-base leading-relaxed max-w-4xl space-y-2">
              <p>
                {t.swrTemplateAssuming.replace('{swr}', swr.toFixed(2))}
              </p>
              <p>
                {t.swrTemplateRetireToday
                  .replace('{monthly}', formatCFraction(todayMonthlyWithdrawal))
                  .replace('{annual}', formatCFraction(todayAnnualWithdrawal))
                  .replace('{capital}', formatC(capitalToday))
                }
              </p>
              <p>
                {t.swrTemplateRetireTarget
                  .replace('{years}', `${years} ${years === 1 ? t.yearSingular : t.yearsPlural}`)
                  .replace('{targetDate}', getTimelineTargetDateLabel(years))
                  .replace('{monthly}', formatCFraction(futureMonthlyWithdrawal))
                  .replace('{annual}', formatCFraction(futureAnnualWithdrawal))
                  .replace('{capital}', formatC(capitalFuture))
                }
              </p>
            </div>

            {/* The side-by-side comparative boxes requested explicitly by the user */}
            <div className="grid md:grid-cols-2 gap-5 pt-3">
              {/* Box 1: Retirement Today */}
              <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800 space-y-3 relative overflow-hidden group hover:border-amber-500/25 transition-all">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">{t.initialStateLabel}</span>
                    <h4 className="text-sm font-bold text-white mt-0.5">{t.retireTodayLabel}</h4>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono bg-slate-900 border border-slate-800 rounded px-2 py-0.5">{t.year0Label}</span>
                </div>

                <div className="pt-2 grid grid-cols-2 gap-2 border-t border-slate-900">
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase font-semibold">{t.baseCapitalLabel}</span>
                    <span className="text-sm font-bold text-slate-300 font-mono">{formatC(capitalToday)}</span>
                    <span className="text-[10px] text-slate-500 block">{t.baseCapitalSublabel}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-amber-500 block uppercase font-semibold">{t.withdrawalSWRLabel}</span>
                    <span className="text-sm font-bold text-amber-400 font-mono">{swr.toFixed(1)}%</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100/10 space-y-1">
                  <div className="flex justify-between items-center text-xs text-slate-300">
                    <span>{t.freeMonthlyStreamLabel}</span>
                    <strong className="text-white font-mono text-sm">{formatCFraction(todayMonthlyWithdrawal)}</strong>
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-slate-400">
                    <span>{t.extendedAnnualStreamLabel}</span>
                    <span className="font-mono">{formatCFraction(todayAnnualWithdrawal)}</span>
                  </div>
                </div>
              </div>

              {/* Box 2: Projections to the target Horizon */}
              <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800 space-y-3 relative overflow-hidden group hover:border-emerald-500/25 transition-all ring-1 ring-emerald-500/5">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-bold text-emerald-500/80 uppercase tracking-widest block">{t.targetHorizonLabel}</span>
                    <h4 className="text-sm font-bold text-emerald-400 mt-0.5">{t.pacHorizonRetirementLabel}</h4>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/20 border border-emerald-500/10 rounded px-2 py-0.5">+{years} {years === 1 ? t.yearSingular : t.yearsPlural}</span>
                </div>

                <div className="pt-2 grid grid-cols-2 gap-2 border-t border-slate-900">
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase font-semibold">{t.finalMontantLabel}</span>
                    <span className="text-sm font-bold text-emerald-400 font-mono">{formatC(capitalFuture)}</span>
                    <span className="text-[10px] text-emerald-600 block">{t.investedAndInterestsLabel}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-amber-500 block uppercase font-semibold">{t.withdrawalSWRLabel}</span>
                    <span className="text-sm font-bold text-amber-400 font-mono">{swr.toFixed(1)}%</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100/10 space-y-1">
                  <div className="flex justify-between items-center text-xs text-emerald-400">
                    <span>{t.freeMonthlyStreamLabel}</span>
                    <strong className="text-emerald-400 font-mono text-sm">{formatCFraction(futureMonthlyWithdrawal)}</strong>
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-slate-400">
                    <span>{t.extendedAnnualStreamLabel}</span>
                    <span className="font-mono">{formatCFraction(futureAnnualWithdrawal)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Disclaimer text fully updated to replace the old text as requested */}
            <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800/80 text-xs text-slate-300 space-y-3 leading-relaxed">
              <div className="flex gap-2 items-center text-amber-400 font-semibold uppercase tracking-wider text-[11px] pb-1 border-b border-slate-800/60">
                <Info className="w-4.5 h-4.5 text-amber-500 shrink-0" />
                <span>{t.regimesTitle}</span>
              </div>
              <p>
                {t.regimesIntro}
              </p>
              <ul className="list-disc pl-5 space-y-2 text-slate-400">
                <li>
                  <strong>{t.simpleCompoundingLabel}:</strong> {t.simpleCompoundingDesc}
                </li>
                <li>
                  <strong>{t.compoundCompoundingLabel}:</strong> {t.compoundCompoundingDesc}
                </li>
              </ul>
              <p className="text-[11px] text-slate-500 italic pt-1">
                {t.pacTimingDisclaimer}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ======================= TAB 2: CAGR CALCULATOR ======================= */}
      {activeSubTab === 'cagr' && (
        <div className="grid lg:grid-cols-12 gap-8 animate-fade-in">
          {/* Controls Column */}
          <div className="lg:col-span-5 bg-slate-900/20 p-6 rounded-2xl border border-slate-800 space-y-6">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-800/60">
              <Percent className="w-4 h-4 text-sky-400" />
              {t.cagrParamsTitle}
            </h2>

            {/* Method selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                {t.inputMethodLabel}
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => setCagrMethod('percentage')}
                  className={`py-2 px-1 text-[11px] font-semibold rounded-lg border transition-all ${
                    cagrMethod === 'percentage'
                      ? 'bg-sky-500/10 border-sky-500/35 text-sky-400 font-bold'
                      : 'bg-slate-950 border-slate-800/80 text-slate-400 hover:text-white'
                  }`}
                >
                  {t.totalReturnPercentageLabel}
                </button>
                <button
                  onClick={() => setCagrMethod('capitals')}
                  className={`py-2 px-1 text-[11px] font-semibold rounded-lg border transition-all ${
                    cagrMethod === 'capitals'
                      ? 'bg-sky-500/10 border-sky-500/35 text-sky-400 font-bold'
                      : 'bg-slate-950 border-slate-800/80 text-slate-400 hover:text-white'
                  }`}
                >
                  {t.initialFinalCapitalsLabel}
                </button>
              </div>
            </div>

            {/* Dynamic Inputs */}
            {cagrMethod === 'percentage' ? (
              <div className="space-y-2 animate-fade-in">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  {t.totalReturnGeneratedLabel}
                </label>
                <div className="relative">
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono">%</span>
                  <input
                    type="number"
                    value={cagrTotalReturn}
                    onChange={(e) => setCagrTotalReturn(Number(e.target.value))}
                    className="w-full pr-8 pl-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-sky-500 text-sm transition-colors"
                  />
                </div>
                <span className="text-[10px] text-slate-500 block">{t.cagrExampleHint}</span>
              </div>
            ) : (
              <div className="space-y-4 animate-fade-in border-b border-t border-slate-800/50 py-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                    {t.initialCapital}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono">{currencySymbol}</span>
                    <input
                      type="number"
                      value={cagrInitialCap}
                      onChange={(e) => setCagrInitialCap(Math.max(1, Number(e.target.value)))}
                      className="w-full pl-8 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-sky-500 text-sm transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                    {t.finalCapitalAchievedLabel}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono">{currencySymbol}</span>
                    <input
                      type="number"
                      value={cagrFinalCap}
                      onChange={(e) => setCagrFinalCap(Math.max(0, Number(e.target.value)))}
                      className="w-full pl-8 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-sky-500 text-sm transition-colors"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Time Horizon in years slider */}
            <div className="space-y-2 border-t border-slate-800/50 pt-4">
              <div className="flex justify-between items-center text-xs">
                <label className="font-semibold text-slate-400 uppercase tracking-wider block">
                  {t.yearsLabel}
                </label>
                <span className="text-sky-400 font-bold bg-sky-500/10 px-2 py-0.5 rounded font-mono text-[11px] flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {cagrYears} {cagrYears === 1 ? t.yearSingular : t.yearsPlural} ({getTimelineTargetDateLabel(cagrYears)})
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="30"
                value={cagrYears}
                onChange={(e) => setCagrYears(Math.max(1, Number(e.target.value)))}
                className="w-full accent-sky-500 h-1.5 cursor-pointer bg-slate-950 rounded-lg"
              />
              <div className="flex justify-between text-[10px] text-slate-600 font-mono">
                <span>1 {t.yearSingular}</span>
                <span>15 {t.yearsPlural}</span>
                <span>30 {t.yearsPlural}</span>
              </div>
            </div>
          </div>

          {/* Explanation, math, and outputs */}
          <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
            {/* Main Yield Box */}
            <div className="bg-slate-900/30 p-6 rounded-2xl border border-slate-800 space-y-4 relative overflow-hidden flex flex-col justify-between h-full min-h-[220px]">
              <div className="absolute right-0 top-0 -translate-y-12 translate-x-12 w-32 h-32 bg-sky-500/5 rounded-full blur-2xl"></div>
              
              <div>
                <span className="text-xs font-bold text-sky-400 uppercase tracking-wider block mb-1">{t.cagrTitleCard}</span>
                <span className="text-[10px] text-slate-500 block leading-normal">
                  {t.cagrDescCard}
                </span>
              </div>

              <div className="py-2">
                <div className="text-4xl md:text-5xl font-black font-mono text-white tracking-tight flex items-baseline gap-1">
                  {calculatedCagr.toFixed(2)}%
                  <span className="text-xs text-sky-400 font-semibold uppercase tracking-wider font-sans">{t.perYearLabel}</span>
                </div>
                {cagrMethod === 'capitals' && cagrInitialCap > 0 && (
                  <div className="text-xs font-mono text-slate-400 mt-2">
                    {t.totalReturnCagrTemplate.replace('{val}', (((cagrFinalCap / cagrInitialCap) - 1) * 100).toFixed(1))}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-800/80 pt-3 text-[11px] text-slate-400 font-mono flex justify-between">
                <span>{t.fundamentalFormulaLabel}</span>
                <span className="text-sky-300 font-bold">[(Valore Final / Valore Iniziale) ^ (1 / n)] - 1</span>
              </div>
            </div>

            {/* Scientific Explanation Block - Expert Professional Financial view requested by user */}
            <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Info className="w-4.5 h-4.5 text-sky-400 shrink-0" />
                {t.cagrGuideTitle}
              </h3>
              
              <div className="text-xs text-slate-400 space-y-3 leading-relaxed font-sans">
                <p>
                  {t.cagrGuideIntro.split('CAGR (Compound Annual Growth Rate)')[0]}
                  <strong>CAGR (Compound Annual Growth Rate)</strong>
                  {t.cagrGuideIntro.split('CAGR (Compound Annual Growth Rate)')[1]}
                </p>
                <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-800/60 font-medium">
                  <span className="text-sky-300 block mb-1 font-bold">{t.cagrGuideCaseStudyTitle}</span>
                  {t.cagrGuideCaseStudyDesc}
                  <ul className="list-disc pl-4 mt-1.5 space-y-1 text-slate-300 font-mono text-[10px]">
                    <li><strong>{t.cagrGuideArithmeticMeanLabel}</strong> {t.cagrGuideArithmeticMeanDesc}</li>
                    <li><strong>{t.cagrGuideGeometricCagrLabel}</strong> {t.cagrGuideGeometricCagrDesc}</li>
                  </ul>
                </div>
                <p>
                  {t.cagrGuideOutro}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
