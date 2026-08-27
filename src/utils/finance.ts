/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Transaction, TransactionType, OtherCost } from '../types';

export interface PortfolioLot {
  id: string;
  symbol: string;
  portfolioId: string;
  originalDate: string;
  date: string;
  qty: number;
  remainingQty: number;
  buyPrice: number; // Unit purchase price in original currency
  currency: string;
  commission: number;
  commissionCurrency: string;
  transferId?: string;
  parentTransactionId?: string;
}

export interface TickerMetric {
  sharesOwned: number;
  totalCapitalInvested: number; // in selected display currency
  pmc: number; // in selected display currency (totalCapitalInvested / sharesOwned)
  totalCommissionsPaid: number;
  avgCommissionShare: number;
  todayPriceInDisplay: number;
  yesterdayPriceInDisplay: number;
  totalNominalValue: number;
  yesterdayNominalValue: number;
  gainAbsolute: number;
  gainPercentage: number;
  activeLots: PortfolioLot[];
}

export interface FinancialMetricsResult {
  tickerMetrics: { [symbol: string]: TickerMetric };
  totalCapitalInvested: number;
  totalNominalValue: number;
  yesterdayNominalValue: number;
  totalCommissionsPaid: number;
  totalOtherCostsPaid: number;
  costBasis: number;
  currentValAdjusted: number;
  absoluteGain: number;
  percentageReturn: number;
  dailyChangeAbsolute: number;
  dailyGainPercentage: number;
}

/**
 * Calculates current active lots and holdings chronologically across all portfolios.
 * Maintains cost basis continuity across multiple transfers (FIFO/LIFO).
 */
export function calculateHoldingsAndLots(
  allTransactions: Transaction[],
  activePortIds: string[],
  convertValue: (amount: number, from: string, to: string, date: string) => number,
  selectedCurrency: string,
  targetSymbol?: string | null,
  asOfDate?: string
): {
  activeLots: PortfolioLot[];
  tickerHoldings: {
    [sym: string]: {
      sharesOwned: number;
      totalCapitalInvested: number;
      pmc: number;
      lots: PortfolioLot[];
    };
  };
} {
  // Sort ALL transactions chronologically
  const sortedTx = [...allTransactions]
    .filter(t => (asOfDate ? t.date.split('T')[0] <= asOfDate : true))
    .sort((a, b) => {
      const timeDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (timeDiff !== 0) return timeDiff;
      // If same timestamp, process BUY & TRANSFER_IN before TRANSFER_OUT & SELL
      const isAIn = a.type === TransactionType.BUY || a.type === TransactionType.TRANSFER_IN;
      const isBIn = b.type === TransactionType.BUY || b.type === TransactionType.TRANSFER_IN;
      if (isAIn && !isBIn) return -1;
      if (!isAIn && isBIn) return 1;
      return 0;
    });

  const lotsByPortfolio: { [portfolioId: string]: PortfolioLot[] } = {};

  sortedTx.forEach((tx) => {
    const pId = tx.portfolioId;
    const sym = tx.symbol.toUpperCase().trim();
    if (!lotsByPortfolio[pId]) {
      lotsByPortfolio[pId] = [];
    }

    if (tx.type === TransactionType.BUY) {
      lotsByPortfolio[pId].push({
        id: tx.id,
        symbol: sym,
        portfolioId: pId,
        originalDate: tx.date,
        date: tx.date,
        qty: tx.qty,
        remainingQty: tx.qty,
        buyPrice: tx.price,
        currency: tx.currency || 'EUR',
        commission: tx.commission || 0,
        commissionCurrency: tx.commissionCurrency || tx.currency || 'EUR',
        transferId: tx.transferId,
        parentTransactionId: tx.parentTransactionId
      });
    } else if (tx.type === TransactionType.TRANSFER_IN) {
      // Preserve original acquisition cost basis and date
      const origPrice = tx.originalBuyPrice !== undefined && tx.originalBuyPrice !== null ? tx.originalBuyPrice : tx.price;
      const origDate = tx.originalBuyDate || tx.date;

      lotsByPortfolio[pId].push({
        id: tx.id,
        symbol: sym,
        portfolioId: pId,
        originalDate: origDate,
        date: tx.date,
        qty: tx.qty,
        remainingQty: tx.qty,
        buyPrice: origPrice,
        currency: tx.currency || 'EUR',
        commission: tx.commission || 0,
        commissionCurrency: tx.commissionCurrency || tx.currency || 'EUR',
        transferId: tx.transferId,
        parentTransactionId: tx.parentTransactionId || tx.transferOutTransactionId
      });
    } else if (tx.type === TransactionType.TRANSFER_OUT || tx.type === TransactionType.SELL) {
      let remainingToDeplete = tx.qty;

      // If a specific parent lot is referenced (e.g. transfer of specific lot), deplete from it first
      if (tx.parentTransactionId) {
        const parentLot = lotsByPortfolio[pId].find(
          l => l.id === tx.parentTransactionId && l.symbol === sym && l.remainingQty > 1e-8
        );
        if (parentLot) {
          const drain = Math.min(parentLot.remainingQty, remainingToDeplete);
          parentLot.remainingQty -= drain;
          remainingToDeplete -= drain;
        }
      }

      // Then deplete remaining from other active lots in this portfolio
      if (remainingToDeplete > 1e-8) {
        const availableLots = lotsByPortfolio[pId].filter(
          l => l.symbol === sym && l.remainingQty > 1e-8
        );

        // FIFO or LIFO criteria
        if (tx.transferCriteria === 'LIFO') {
          availableLots.sort((a, b) => new Date(b.originalDate).getTime() - new Date(a.originalDate).getTime());
        } else {
          availableLots.sort((a, b) => new Date(a.originalDate).getTime() - new Date(b.originalDate).getTime());
        }

        for (const lot of availableLots) {
          if (remainingToDeplete <= 1e-8) break;
          const drain = Math.min(lot.remainingQty, remainingToDeplete);
          lot.remainingQty -= drain;
          remainingToDeplete -= drain;
        }
      }
    }
  });

  // Filter lots belonging to activePortIds
  const activeLots: PortfolioLot[] = [];
  Object.keys(lotsByPortfolio).forEach((pId) => {
    if (!activePortIds.includes(pId)) return;
    lotsByPortfolio[pId].forEach((lot) => {
      if (lot.remainingQty > 1e-8) {
        if (!targetSymbol || lot.symbol === targetSymbol.toUpperCase().trim()) {
          activeLots.push(lot);
        }
      }
    });
  });

  const tickerHoldings: {
    [sym: string]: {
      sharesOwned: number;
      totalCapitalInvested: number;
      pmc: number;
      lots: PortfolioLot[];
    };
  } = {};

  activeLots.forEach((lot) => {
    const sym = lot.symbol;
    if (!tickerHoldings[sym]) {
      tickerHoldings[sym] = {
        sharesOwned: 0,
        totalCapitalInvested: 0,
        pmc: 0,
        lots: []
      };
    }
    const h = tickerHoldings[sym];
    h.sharesOwned += lot.remainingQty;
    const investedPortion = convertValue(
      lot.remainingQty * lot.buyPrice,
      lot.currency,
      selectedCurrency,
      lot.originalDate.split('T')[0]
    );
    h.totalCapitalInvested += investedPortion;
    h.lots.push(lot);
  });

  Object.keys(tickerHoldings).forEach((sym) => {
    const h = tickerHoldings[sym];
    h.pmc = h.sharesOwned > 0 ? h.totalCapitalInvested / h.sharesOwned : 0;
  });

  return { activeLots, tickerHoldings };
}

/**
 * Calculates complete financial metrics for the active dashboard/portfolio view.
 */
export function calculateFinancialMetrics(
  allTransactions: Transaction[],
  activePortIds: string[],
  otherCosts: OtherCost[],
  includeCommissions: boolean,
  selectedCurrency: string,
  convertValue: (amount: number, from: string, to: string, date: string) => number,
  getPriceForDate: (sym: string, date: string, fallback: number) => number,
  getTickerCurrency: (sym: string) => string,
  todayStr: string,
  yesterdayStr: string,
  targetSymbol?: string | null
): FinancialMetricsResult {
  const { tickerHoldings } = calculateHoldingsAndLots(
    allTransactions,
    activePortIds,
    convertValue,
    selectedCurrency,
    targetSymbol
  );

  // Active transactions and other costs for commissions
  const activeTx = allTransactions.filter(
    t => activePortIds.includes(t.portfolioId) && (!targetSymbol || t.symbol.toUpperCase() === targetSymbol.toUpperCase())
  );
  const activeCosts = otherCosts.filter(c => activePortIds.includes(c.portfolioId));

  const totalCommissionsPaid = activeTx.reduce(
    (sum, tx) => sum + convertValue(tx.commission || 0, tx.commissionCurrency || tx.currency || 'EUR', selectedCurrency, tx.date.split('T')[0]),
    0
  );
  const totalOtherCostsPaid = activeCosts.reduce(
    (sum, c) => sum + convertValue(c.amount || 0, c.currency || 'EUR', selectedCurrency, c.date.split('T')[0]),
    0
  );

  const tickerMetrics: { [symbol: string]: TickerMetric } = {};
  let totalCapitalInvested = 0;
  let totalNominalValue = 0;
  let yesterdayNominalValue = 0;

  // Also collect all symbols from active transactions to ensure symbols with 0 shares can still report commissions
  const allSymbols = new Set<string>([
    ...Object.keys(tickerHoldings),
    ...activeTx.map(t => t.symbol.toUpperCase().trim())
  ]);

  allSymbols.forEach((sym) => {
    const holding = tickerHoldings[sym] || {
      sharesOwned: 0,
      totalCapitalInvested: 0,
      pmc: 0,
      lots: []
    };

    const symTx = activeTx.filter(t => t.symbol.toUpperCase().trim() === sym);
    const symComms = symTx.reduce(
      (sum, tx) => sum + convertValue(tx.commission || 0, tx.commissionCurrency || tx.currency || 'EUR', selectedCurrency, tx.date.split('T')[0]),
      0
    );

    const tickerCurrency = getTickerCurrency(sym);
    const fallbackPriceNative = convertValue(holding.pmc, selectedCurrency, tickerCurrency, todayStr);
    const todayPrice = getPriceForDate(sym, todayStr, fallbackPriceNative > 0 ? fallbackPriceNative : 100);
    const yesterdayPrice = getPriceForDate(sym, yesterdayStr, todayPrice);

    const todayPriceInDisplay = convertValue(todayPrice, tickerCurrency, selectedCurrency, todayStr);
    const yesterdayPriceInDisplay = convertValue(yesterdayPrice, tickerCurrency, selectedCurrency, yesterdayStr);

    const symTotalNominalValue = holding.sharesOwned * todayPriceInDisplay;
    const symYesterdayNominalValue = holding.sharesOwned * yesterdayPriceInDisplay;

    const gainAbs = symTotalNominalValue - holding.totalCapitalInvested;
    const gainPct = holding.totalCapitalInvested > 0 ? (gainAbs / holding.totalCapitalInvested) * 100 : 0;

    tickerMetrics[sym] = {
      sharesOwned: holding.sharesOwned,
      totalCapitalInvested: holding.totalCapitalInvested,
      pmc: holding.pmc,
      totalCommissionsPaid: symComms,
      avgCommissionShare: holding.sharesOwned > 0 ? symComms / holding.sharesOwned : 0,
      todayPriceInDisplay,
      yesterdayPriceInDisplay,
      totalNominalValue: symTotalNominalValue,
      yesterdayNominalValue: symYesterdayNominalValue,
      gainAbsolute: gainAbs,
      gainPercentage: gainPct,
      activeLots: holding.lots
    };

    totalCapitalInvested += holding.totalCapitalInvested;
    totalNominalValue += symTotalNominalValue;
    yesterdayNominalValue += symYesterdayNominalValue;
  });

  const totalFeeAndCostImpact = includeCommissions ? (totalCommissionsPaid + totalOtherCostsPaid) : 0;
  const currentValAdjusted = totalNominalValue - totalFeeAndCostImpact;
  const costBasis = totalCapitalInvested + totalFeeAndCostImpact;
  const absoluteGain = currentValAdjusted - totalCapitalInvested;
  const percentageReturn = totalCapitalInvested > 0 ? (absoluteGain / totalCapitalInvested) * 100 : 0;

  const dailyChangeAbsolute = totalNominalValue - yesterdayNominalValue;
  const dailyGainPercentage = yesterdayNominalValue > 0 ? (dailyChangeAbsolute / yesterdayNominalValue) * 100 : 0;

  return {
    tickerMetrics,
    totalCapitalInvested,
    totalNominalValue,
    yesterdayNominalValue,
    totalCommissionsPaid,
    totalOtherCostsPaid,
    costBasis,
    currentValAdjusted,
    absoluteGain,
    percentageReturn,
    dailyChangeAbsolute,
    dailyGainPercentage
  };
}

/**
 * Calculates accurate aggregated totals for the Transactions Table footer.
 * Net totals naturally cancel out internal transfers (TRANSFER_OUT + TRANSFER_IN = 0)
 * when viewing combined portfolios, while properly displaying portfolio flows when filtered.
 */
export function calculateTransactionTableTotals(
  transactions: Transaction[],
  convertValue: (amount: number, from: string, to: string, date: string) => number,
  selectedCurrency: string
): {
  totalQty: number;
  totalAmount: number;
  totalCommissions: number;
  buyCount: number;
  sellCount: number;
  transferCount: number;
} {
  let totalQty = 0;
  let totalAmount = 0;
  let totalCommissions = 0;
  let buyCount = 0;
  let sellCount = 0;
  let transferCount = 0;

  transactions.forEach((tx) => {
    const isIncoming = tx.type === TransactionType.BUY || tx.type === TransactionType.TRANSFER_IN;
    const sign = isIncoming ? 1 : -1;

    totalQty += sign * tx.qty;

    const rowValInDisplay = convertValue(
      tx.price * tx.qty,
      tx.currency || 'EUR',
      selectedCurrency,
      tx.date.split('T')[0]
    );
    totalAmount += sign * rowValInDisplay;

    const commInDisplay = convertValue(
      tx.commission || 0,
      tx.commissionCurrency || tx.currency || 'EUR',
      selectedCurrency,
      tx.date.split('T')[0]
    );
    totalCommissions += commInDisplay;

    if (tx.type === TransactionType.BUY) buyCount++;
    else if (tx.type === TransactionType.SELL) sellCount++;
    else if (tx.type === TransactionType.TRANSFER_IN || tx.type === TransactionType.TRANSFER_OUT) transferCount++;
  });

  return {
    totalQty,
    totalAmount,
    totalCommissions,
    buyCount,
    sellCount,
    transferCount
  };
}

export interface PortfolioPerformanceResult {
  twrrPercentage: number;       // Cumulative TWRR for the period (%)
  twrrAnnualized: number;       // Annualized TWRR / CAGR (%)
  mwrrAnnualized: number;       // Annualized MWRR / IRR (%)
  mwrrPeriod: number;           // Period MWRR (%)
  volatility: number;           // Annualized Volatility (%)
  maxDrawdown: number;          // Max Drawdown (%)
  periodInitialValue: number;   // Portfolio market value at start
  periodFinalValue: number;     // Portfolio market value at end
  periodInvested: number;       // Total gross external capital invested in period
  periodSells: number;          // Total gross external capital withdrawn in period
  periodNetContributions: number; // Net capital contributed in period
  periodCommissions: number;    // Total commissions and other fees in period
  periodNetGain: number;        // Absolute net profit in period
  totalDays: number;            // Total calendar days analyzed
}

/**
 * Standardized, mathematically precise calculations for TWRR, MWRR (IRR), Volatility,
 * Max Drawdown and period flows across single or multiple portfolios.
 * Correctly cancels out internal transfers between active portfolios while treating external
 * transfers as capital inflows/outflows.
 */
export function calculatePortfolioPerformance(
  dailyBalances: {
    date: string;
    investedNominal: number;
    investedWithCommissions: number;
    currentValue: number;
    realValueAdjusted: number;
  }[],
  allTransactions: Transaction[],
  activePortIds: string[],
  otherCosts: OtherCost[],
  includeCommissions: boolean,
  selectedCurrency: string,
  convertValue: (amount: number, from: string, to: string, date: string) => number,
  startDate?: string,
  endDate?: string,
  targetSymbol?: string | null
): PortfolioPerformanceResult {
  const emptyResult: PortfolioPerformanceResult = {
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

  if (!dailyBalances || dailyBalances.length === 0) {
    return emptyResult;
  }

  // 1. Slice daily balances to the evaluated date window
  let filteredBalances = [...dailyBalances];
  if (startDate) {
    filteredBalances = filteredBalances.filter(b => b.date >= startDate);
  }
  if (endDate) {
    filteredBalances = filteredBalances.filter(b => b.date <= endDate);
  }

  if (filteredBalances.length === 0) {
    return emptyResult;
  }

  const firstDate = filteredBalances[0].date;
  const lastDate = filteredBalances[filteredBalances.length - 1].date;

  const firstIndexInDaily = dailyBalances.findIndex(b => b.date === firstDate);
  const periodInitialValue = firstIndexInDaily > 0 ? dailyBalances[firstIndexInDaily - 1].currentValue : 0;
  const periodFinalValue = filteredBalances[filteredBalances.length - 1].currentValue;

  const firstMillis = new Date(firstDate + 'T00:00:00Z').getTime();
  const lastMillis = new Date(lastDate + 'T00:00:00Z').getTime();
  const totalDays = Math.max(1, Math.round((lastMillis - firstMillis) / (1000 * 60 * 60 * 24)) + 1);
  const totalYears = (lastMillis - firstMillis) / (1000 * 60 * 60 * 24 * 365.25);

  // 2. Identify all external cash flows within the evaluated date range
  let periodInvested = 0;
  let periodSells = 0;
  let periodTxCommissions = 0;

  interface CashFlowEvent {
    date: string;
    amount: number; // positive = inflow into portfolio (deposit), negative = outflow (withdrawal)
  }
  const cashFlows: CashFlowEvent[] = [];

  const relevantTx = allTransactions.filter((tx) => {
    const txDateStr = tx.date.split('T')[0];
    if (txDateStr < firstDate || txDateStr > lastDate) return false;
    if (!activePortIds.includes(tx.portfolioId)) return false;
    if (targetSymbol && tx.symbol.toUpperCase().trim() !== targetSymbol.toUpperCase().trim()) return false;
    return true;
  });

  relevantTx.forEach((tx) => {
    const txDateStr = tx.date.split('T')[0];
    const priceInDisplay = convertValue(tx.price, tx.currency || 'EUR', selectedCurrency, txDateStr);
    const commInDisplay = convertValue(
      tx.commission || 0,
      tx.commissionCurrency || tx.currency || 'EUR',
      selectedCurrency,
      txDateStr
    );
    periodTxCommissions += commInDisplay;

    if (tx.type === TransactionType.BUY) {
      const grossAmount = tx.qty * priceInDisplay;
      periodInvested += grossAmount;
      const netFlow = grossAmount + (includeCommissions ? commInDisplay : 0);
      cashFlows.push({ date: txDateStr, amount: netFlow });
    } else if (tx.type === TransactionType.SELL) {
      const grossAmount = tx.qty * priceInDisplay;
      periodSells += grossAmount;
      const netFlow = -(grossAmount - (includeCommissions ? commInDisplay : 0));
      cashFlows.push({ date: txDateStr, amount: netFlow });
    } else if (tx.type === TransactionType.TRANSFER_IN) {
      // Check if source portfolio is also in activePortIds
      const isInternal = tx.transferOutTransactionId
        ? allTransactions.some(t => t.id === tx.transferOutTransactionId && activePortIds.includes(t.portfolioId))
        : false;

      if (!isInternal) {
        // External transfer into the active perimeter
        const grossAmount = tx.qty * priceInDisplay;
        periodInvested += grossAmount;
        const netFlow = grossAmount + (includeCommissions ? commInDisplay : 0);
        cashFlows.push({ date: txDateStr, amount: netFlow });
      } else {
        // Internal transfer: no net capital flow, but fee if applicable
        if (includeCommissions && commInDisplay > 0) {
          cashFlows.push({ date: txDateStr, amount: commInDisplay });
        }
      }
    } else if (tx.type === TransactionType.TRANSFER_OUT) {
      // Check if target portfolio is also in activePortIds
      const isInternal = tx.transferInTransactionId
        ? allTransactions.some(t => t.id === tx.transferInTransactionId && activePortIds.includes(t.portfolioId))
        : false;

      if (!isInternal) {
        // External transfer out of the active perimeter
        const grossAmount = tx.qty * priceInDisplay;
        periodSells += grossAmount;
        const netFlow = -(grossAmount - (includeCommissions ? commInDisplay : 0));
        cashFlows.push({ date: txDateStr, amount: netFlow });
      } else {
        if (includeCommissions && commInDisplay > 0) {
          cashFlows.push({ date: txDateStr, amount: commInDisplay });
        }
      }
    }
  });

  // Include other costs (taxes, stamp duty, admin fees)
  let periodOtherCosts = 0;
  otherCosts.forEach((c) => {
    const costDateStr = c.date.split('T')[0];
    if (costDateStr < firstDate || costDateStr > lastDate) return;
    if (!activePortIds.includes(c.portfolioId)) return;

    const amtInDisplay = convertValue(c.amount || 0, c.currency || 'EUR', selectedCurrency, costDateStr);
    periodOtherCosts += amtInDisplay;
    if (includeCommissions && amtInDisplay > 0) {
      cashFlows.push({ date: costDateStr, amount: amtInDisplay });
    }
  });

  const periodCommissions = periodTxCommissions + periodOtherCosts;
  const periodNetContributions = periodInvested - periodSells;
  const periodNetGain = periodFinalValue - periodInitialValue - periodNetContributions;

  // Group external cash flows by day for daily TWRR
  const dailyCashFlowsMap: { [date: string]: number } = {};
  cashFlows.forEach((cf) => {
    dailyCashFlowsMap[cf.date] = (dailyCashFlowsMap[cf.date] || 0) + cf.amount;
  });

  // 3. Calculate True Daily Time-Weighted Rate of Return (TWRR)
  let cumTWRR = 1.0;
  for (let i = 0; i < filteredBalances.length; i++) {
    const currDate = filteredBalances[i].date;
    const currVal = filteredBalances[i].currentValue;
    const prevVal = i > 0 ? filteredBalances[i - 1].currentValue : periodInitialValue;
    const cfToday = dailyCashFlowsMap[currDate] || 0;

    if (i === 0 && periodInitialValue <= 1e-6) {
      // Inception day: starting from zero balance
      if (cfToday > 1e-6) {
        const dayReturn = (currVal - cfToday) / cfToday;
        if (!isNaN(dayReturn) && isFinite(dayReturn) && dayReturn > -0.999) {
          cumTWRR *= (1 + dayReturn);
        }
      }
    } else {
      const denominator = prevVal + (cfToday > 0 ? cfToday : 0);
      const numerator = currVal - (cfToday < 0 ? cfToday : 0);

      if (denominator > 1e-6) {
        const dayReturn = (numerator - denominator) / denominator;
        if (!isNaN(dayReturn) && isFinite(dayReturn) && dayReturn > -0.999) {
          cumTWRR *= (1 + dayReturn);
        }
      }
    }
  }

  const twrrPercentage = (cumTWRR - 1) * 100;
  let twrrAnnualized = twrrPercentage;
  if (totalDays >= 365 && cumTWRR > 0) {
    twrrAnnualized = (Math.pow(cumTWRR, 365.25 / totalDays) - 1) * 100;
  }

  // 4. Calculate Money-Weighted Rate of Return (MWRR / IRR)
  const solverFlows: { years: number; amount: number }[] = [];
  if (periodInitialValue > 0) {
    solverFlows.push({ years: totalYears, amount: -periodInitialValue });
  }

  cashFlows.forEach((cf) => {
    const cfMillis = new Date(cf.date + 'T00:00:00Z').getTime();
    const yearsAgo = (lastMillis - cfMillis) / (1000 * 60 * 60 * 24 * 365.25);
    solverFlows.push({ years: Math.max(0, yearsAgo), amount: -cf.amount });
  });

  const fIrr = (r: number) => {
    let sum = periodFinalValue;
    for (const flow of solverFlows) {
      sum += flow.amount * Math.pow(1 + r, flow.years);
    }
    return sum;
  };

  let low = -0.999;
  let high = 5.0;
  let f_low = fIrr(low);
  let f_high = fIrr(high);

  if (f_low * f_high > 0) {
    high = 15.0;
    f_high = fIrr(high);
  }

  let solvedRate = 0;
  if (f_low * f_high <= 0) {
    for (let i = 0; i < 50; i++) {
      const mid = (low + high) / 2;
      const f_mid = fIrr(mid);
      if (Math.abs(f_mid) < 0.0001) {
        solvedRate = mid;
        break;
      }
      if (f_low * f_mid < 0) {
        high = mid;
        f_high = f_mid;
      } else {
        low = mid;
        f_low = f_mid;
      }
      solvedRate = mid;
    }
  } else {
    // Modified Dietz fallback for non-converging or extreme patterns
    const weightSum = solverFlows.reduce((sum, fl) => sum + (-fl.amount) * (totalYears > 0 ? fl.years / totalYears : 1), 0);
    const denominator = periodInitialValue + weightSum;
    const simpleReturn = denominator > 0 ? (periodNetGain / denominator) : 0;
    if (totalYears >= 1 && 1 + simpleReturn > 0) {
      solvedRate = Math.pow(1 + simpleReturn, 1 / totalYears) - 1;
    } else {
      solvedRate = simpleReturn;
    }
  }

  const mwrrAnnualized = solvedRate * 100;
  let mwrrPeriod = mwrrAnnualized;
  if (totalYears > 0 && totalYears !== 1 && 1 + solvedRate > 0) {
    mwrrPeriod = (Math.pow(1 + solvedRate, totalYears) - 1) * 100;
  }

  // 5. Volatility (Annualized standard deviation of daily percentage changes)
  let periodVolatility = 0;
  if (filteredBalances.length >= 3) {
    const dailyReturns: number[] = [];
    for (let i = 1; i < filteredBalances.length; i++) {
      const prev = filteredBalances[i - 1].currentValue;
      const curr = filteredBalances[i].currentValue;
      const cf = dailyCashFlowsMap[filteredBalances[i].date] || 0;
      const adjustedPrev = prev + (cf > 0 ? cf : 0);
      if (adjustedPrev > 1e-6) {
        const ret = (curr - (cf < 0 ? cf : 0) - adjustedPrev) / adjustedPrev;
        if (!isNaN(ret) && isFinite(ret)) {
          dailyReturns.push(ret);
        }
      }
    }
    if (dailyReturns.length >= 2) {
      const mean = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
      const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (dailyReturns.length - 1);
      const dailyStdDev = Math.sqrt(variance);
      periodVolatility = dailyStdDev * Math.sqrt(252) * 100;
    }
  }

  // 6. Maximum Drawdown (Peak to trough percentage drop)
  let peak = -Infinity;
  let maxDD = 0;
  filteredBalances.forEach((b) => {
    if (b.currentValue > peak) {
      peak = b.currentValue;
    }
    const dd = peak > 0 ? (peak - b.currentValue) / peak : 0;
    if (dd > maxDD) {
      maxDD = dd;
    }
  });

  return {
    twrrPercentage,
    twrrAnnualized,
    mwrrAnnualized,
    mwrrPeriod,
    volatility: periodVolatility,
    maxDrawdown: maxDD * 100,
    periodInitialValue,
    periodFinalValue,
    periodInvested,
    periodSells,
    periodNetContributions,
    periodCommissions,
    periodNetGain,
    totalDays
  };
}
