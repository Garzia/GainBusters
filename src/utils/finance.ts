/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Transaction, TransactionType, OtherCost, Transfer } from '../types';

export interface PortfolioLot {
  id: string;
  symbol: string;
  portfolioId: string;
  originalDate: string;
  date: string;
  qty: number; // Quantità acquistata nel BUY originale (immutabile)
  remainingQty: number; // Quantità residua aperta dopo scarichi
  buyPrice: number; // Prezzo unitario di acquisto nel BUY originale (immutabile)
  currency: string;
  commission: number;
  commissionCurrency: string;
  transferId?: string;
  parentTransactionId?: string;
  originalQty?: number;
  depletedQty?: number;
  originalCost?: number;
  historicalCostRemaining?: number;
}

export interface TickerMetric {
  sharesOwned: number;
  openLotsCostBasis: number; // Carico storico delle quote aperte (somma remainingQty * buyPrice)
  totalCapitalInvested: number; // Carico storico quote aperte (mantenuto per compatibilità)
  netContributedCapital: number; // Capitale netto contribuito per questo strumento (BUY - SELL)
  grossBuys: number; // Somma acquisti lordi
  grossSells: number; // Somma vendite lorde
  pmc: number; // Prezzo Medio di Carico = openLotsCostBasis / sharesOwned
  totalCommissionsPaid: number;
  avgCommissionShare: number;
  todayPriceInDisplay: number;
  yesterdayPriceInDisplay: number;
  totalNominalValue: number;
  yesterdayNominalValue: number;
  gainAbsolute: number; // P/L non realizzato = totalNominalValue - openLotsCostBasis
  gainPercentage: number;
  realizedGainLoss: number; // P/L realizzato da vendite storiche
  activeLots: PortfolioLot[];
}

export interface FinancialMetricsResult {
  tickerMetrics: { [symbol: string]: TickerMetric };
  // A. CAPITALE NETTO CONTRIBUITO (BUY - SELL)
  totalCapitalInvested: number;
  netContributedCapital: number;
  grossBuys: number;
  grossSells: number;

  // B. CARICO STORICO APERTO DEI LOTTI
  activeLotCapital: number;
  openLotsCostBasis: number;

  // C. VALORE DI MERCATO
  totalNominalValue: number;
  yesterdayNominalValue: number;

  // D. P&L
  unrealizedGainLoss: number;
  realizedGainLoss: number;
  absoluteGain: number;
  percentageReturn: number;

  // E. COSTI E RENDIMENTO
  totalCommissionsPaid: number;
  totalOtherCostsPaid: number;
  costBasis: number;
  currentValAdjusted: number;
  dailyChangeAbsolute: number;
  dailyGainPercentage: number;
}

/**
 * Calculates current active lots and holdings chronologically across all portfolios.
 * Maintains cost basis continuity across multiple transfers (FIFO/LIFO).
 */
/**
 * Cleans binary floating-point representation artifacts (e.g. 0.9999849999999999 -> 0.999985)
 * while preserving all true precision up to 14 significant digits without arbitrary rounding.
 */
export function cleanFloatNoise(val: number): number {
  if (!isFinite(val) || Math.abs(val) < 1e-12) return 0;
  // If extremely close to an integer, round to integer (e.g. 100.000000000725 -> 100)
  const roundedInt = Math.round(val);
  if (Math.abs(val - roundedInt) < 1e-8) {
    return roundedInt;
  }
  // Check common currency and unit decimals (2, 4, 6, 8, 10)
  for (const dec of [2, 4, 6, 8, 10]) {
    const factor = Math.pow(10, dec);
    const rounded = Math.round(val * factor) / factor;
    if (Math.abs(val - rounded) < 1e-9) {
      return rounded;
    }
  }
  return val;
}

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
      openLotsCostBasis?: number;
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
      const txQty = Number(tx.qty);
      const txPrice = Number(tx.price);
      lotsByPortfolio[pId].push({
        id: tx.id,
        symbol: sym,
        portfolioId: pId,
        originalDate: tx.date,
        date: tx.date,
        qty: txQty,
        remainingQty: txQty,
        buyPrice: txPrice,
        currency: tx.currency || 'EUR',
        commission: Number(tx.commission || 0),
        commissionCurrency: tx.commissionCurrency || tx.currency || 'EUR',
        transferId: tx.transferId,
        parentTransactionId: tx.parentTransactionId
      });
    } else if (tx.type === TransactionType.TRANSFER_IN) {
      // Preserve original acquisition cost basis and date
      let origPrice = tx.originalBuyPrice !== undefined && tx.originalBuyPrice !== null && tx.originalBuyPrice > 0
        ? Number(tx.originalBuyPrice)
        : Number(tx.price);
      let origDate = tx.originalBuyDate || tx.date;
      let origCurrency = tx.currency || 'EUR';

      if ((!origPrice || origPrice === 0) && tx.transferOutTransactionId) {
        const outTx = allTransactions.find(t => t.id === tx.transferOutTransactionId);
        if (outTx) {
          if (outTx.originalBuyPrice && outTx.originalBuyPrice > 0) origPrice = Number(outTx.originalBuyPrice);
          else if (outTx.price && outTx.price > 0) origPrice = Number(outTx.price);
          if (outTx.originalBuyDate) origDate = outTx.originalBuyDate;
          if (outTx.currency) origCurrency = outTx.currency;
        }
      }

      const txQty = Number(tx.qty);
      lotsByPortfolio[pId].push({
        id: tx.id,
        symbol: sym,
        portfolioId: pId,
        originalDate: origDate,
        date: tx.date,
        qty: txQty,
        remainingQty: txQty,
        buyPrice: origPrice,
        currency: origCurrency,
        commission: Number(tx.commission || 0),
        commissionCurrency: tx.commissionCurrency || origCurrency,
        transferId: tx.transferId,
        parentTransactionId: tx.parentTransactionId || tx.transferOutTransactionId
      });
    } else if (tx.type === TransactionType.TRANSFER_OUT || tx.type === TransactionType.SELL) {
      let remainingToDeplete = Number(tx.qty);

      // If a specific parent lot is referenced (e.g. transfer of specific lot), deplete from it first
      if (tx.parentTransactionId) {
        const parentLot = lotsByPortfolio[pId].find(
          l => l.id === tx.parentTransactionId && l.symbol === sym && l.remainingQty > 1e-12
        );
        if (parentLot) {
          const drain = cleanFloatNoise(Math.min(parentLot.remainingQty, remainingToDeplete));
          parentLot.remainingQty = cleanFloatNoise(parentLot.remainingQty - drain);
          remainingToDeplete = cleanFloatNoise(remainingToDeplete - drain);
          if (parentLot.remainingQty < 1e-12) {
            parentLot.remainingQty = 0;
          }
        }
      }

      // Then deplete remaining from other active lots in this portfolio
      if (remainingToDeplete > 1e-12) {
        const availableLots = lotsByPortfolio[pId].filter(
          l => l.symbol === sym && l.remainingQty > 1e-12
        );

        // FIFO or LIFO criteria
        if (tx.transferCriteria === 'LIFO') {
          availableLots.sort((a, b) => new Date(b.originalDate).getTime() - new Date(a.originalDate).getTime());
        } else {
          availableLots.sort((a, b) => new Date(a.originalDate).getTime() - new Date(b.originalDate).getTime());
        }

        for (const lot of availableLots) {
          if (remainingToDeplete <= 1e-12) break;
          const drain = cleanFloatNoise(Math.min(lot.remainingQty, remainingToDeplete));
          lot.remainingQty = cleanFloatNoise(lot.remainingQty - drain);
          remainingToDeplete = cleanFloatNoise(remainingToDeplete - drain);
          if (lot.remainingQty < 1e-12) {
            lot.remainingQty = 0;
          }
        }
      }
    }
  });

  // Filter lots belonging to activePortIds
  const activeLots: PortfolioLot[] = [];
  Object.keys(lotsByPortfolio).forEach((pId) => {
    if (!activePortIds.includes(pId)) return;
    lotsByPortfolio[pId].forEach((lot) => {
      if (lot.remainingQty > 1e-12) {
        if (!targetSymbol || lot.symbol === targetSymbol.toUpperCase().trim()) {
          // Explicit immutable / derived properties
          lot.remainingQty = cleanFloatNoise(lot.remainingQty);
          lot.originalQty = lot.qty;
          lot.depletedQty = cleanFloatNoise(lot.qty - lot.remainingQty);
          lot.originalCost = cleanFloatNoise(lot.qty * lot.buyPrice);
          lot.historicalCostRemaining = cleanFloatNoise(lot.remainingQty * lot.buyPrice);
          activeLots.push(lot);
        }
      }
    });
  });

  const tickerHoldings: {
    [sym: string]: {
      sharesOwned: number;
      openLotsCostBasis: number;
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
        openLotsCostBasis: 0,
        totalCapitalInvested: 0,
        pmc: 0,
        lots: []
      };
    }
    const h = tickerHoldings[sym];
    h.sharesOwned = cleanFloatNoise(h.sharesOwned + lot.remainingQty);
    const investedPortion = convertValue(
      lot.remainingQty * lot.buyPrice,
      lot.currency,
      selectedCurrency,
      lot.originalDate.split('T')[0]
    );
    h.openLotsCostBasis = cleanFloatNoise(h.openLotsCostBasis + investedPortion);
    h.totalCapitalInvested = h.openLotsCostBasis;
    h.lots.push(lot);
  });

  Object.keys(tickerHoldings).forEach((sym) => {
    const h = tickerHoldings[sym];
    h.pmc = h.sharesOwned > 0 ? cleanFloatNoise(h.openLotsCostBasis / h.sharesOwned) : 0;
  });

  return { activeLots, tickerHoldings };
}

/**
 * Calculates the effective net capital transferred by a TRANSFER_OUT or TRANSFER_IN transaction.
 * Ensures that:
 * - When a lot that has undergone sales is transferred out, the remaining net contributed capital
 *   associated with that lot is transferred, avoiding "orphan" capital/residual losses left behind.
 * - Outgoing capital from source exactly matches incoming capital to destination.
 * - A portfolio/broker where all assets have been transferred out reaches 0.00 € invested capital.
 */
export function getTransferEffectiveCapital(
  tx: Transaction,
  allTransactions: Transaction[],
  selectedCurrency: string,
  convertValue: (amount: number, from: string, to: string, date: string) => number
): number {
  if (tx.type !== TransactionType.TRANSFER_OUT && tx.type !== TransactionType.TRANSFER_IN) {
    return 0;
  }

  // If this is TRANSFER_IN, check its matched TRANSFER_OUT to preserve identical capital
  if (tx.type === TransactionType.TRANSFER_IN) {
    const outTx = tx.transferOutTransactionId
      ? allTransactions.find(t => t.id === tx.transferOutTransactionId)
      : allTransactions.find(t => t.type === TransactionType.TRANSFER_OUT && t.transferId === tx.transferId);
    if (outTx) {
      return getTransferEffectiveCapital(outTx, allTransactions, selectedCurrency, convertValue);
    }
  }

  // For TRANSFER_OUT:
  // Find parent transaction if present
  const parentId = tx.parentTransactionId;
  const parentTx = parentId ? allTransactions.find(t => t.id === parentId) : null;

  if (!parentTx) {
    // Fallback if no parent transaction: standard qty * price
    return convertValue(
      tx.qty * tx.price,
      tx.currency || 'EUR',
      selectedCurrency,
      tx.date.split('T')[0]
    );
  }

  // Parent cost basis in display currency at parent transaction date
  const parentGrossCost = convertValue(
    parentTx.qty * parentTx.price,
    parentTx.currency || 'EUR',
    selectedCurrency,
    parentTx.date.split('T')[0]
  );

  // Find transactions in the parent portfolio for this symbol chronologically up to tx
  const portfolioTxs = allTransactions
    .filter(t => t.portfolioId === parentTx.portfolioId && t.symbol.toUpperCase().trim() === parentTx.symbol.toUpperCase().trim())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Simulate depletion of the parent lot up to this transfer
  let remQty = parentTx.qty;
  let remNetCapital = parentGrossCost;

  for (const t of portfolioTxs) {
    if (t.date < parentTx.date) continue; // Transactions before the parent lot's inception cannot deplete it
    if (t.date > tx.date) break;
    if (t.id === tx.id) break; // stop at current transfer

    if (t.type === TransactionType.SELL) {
      const isDirectParent = t.parentTransactionId === parentTx.id;
      if (isDirectParent || (!t.parentTransactionId && remQty > 1e-12)) {
        const soldFromThis = cleanFloatNoise(Math.min(remQty, t.qty));
        if (soldFromThis > 1e-12) {
          const saleVal = convertValue(
            t.qty * t.price,
            t.currency || 'EUR',
            selectedCurrency,
            t.date.split('T')[0]
          );
          const proportionalRevenue = (saleVal / t.qty) * soldFromThis;
          remQty = cleanFloatNoise(remQty - soldFromThis);
          remNetCapital = cleanFloatNoise(remNetCapital - proportionalRevenue);
        }
      }
    } else if (t.type === TransactionType.TRANSFER_OUT) {
      if (t.parentTransactionId === parentTx.id && remQty > 1e-12) {
        const transferredFromThis = cleanFloatNoise(Math.min(remQty, t.qty));
        if (transferredFromThis > 1e-12) {
          const transRatio = transferredFromThis / remQty;
          const transferredCapital = cleanFloatNoise(remNetCapital * transRatio);
          remQty = cleanFloatNoise(remQty - transferredFromThis);
          remNetCapital = cleanFloatNoise(remNetCapital - transferredCapital);
        }
      }
    }
  }

  // If no quantity was tracked as remaining, fallback
  if (remQty <= 1e-12) {
    return convertValue(
      tx.qty * tx.price,
      tx.currency || 'EUR',
      selectedCurrency,
      tx.date.split('T')[0]
    );
  }

  // If transferring the entire remaining quantity of the lot (within epsilon)
  if (tx.qty >= remQty - 1e-8) {
    return Math.max(0, cleanFloatNoise(remNetCapital));
  }

  // Otherwise transferring a fraction of the remaining lot
  const fraction = tx.qty / remQty;
  return Math.max(0, cleanFloatNoise(remNetCapital * fraction));
}

export interface InvestedCapitalBreakdown {
  activeInvestedCapital: number;
  openLotsCostBasis: number;
  grossBuys: number;
  grossSells: number;
  netContributedCapital: number;
  totalCapitalInvested: number;
  totalCommissionsPaid: number;
  totalOtherCostsPaid: number;
  costBasisWithFees: number;
}

/**
 * Centralized, deterministic single source of truth for Invested Capital.
 * Uses exact accounting rules:
 * - Internal transfers (TRANSFER_OUT + TRANSFER_IN) net to 0 at global scope.
 * - ASSET commissions reduce asset quantity without generating new capital or fake buys.
 */
export function calculateInvestedCapital(
  allTransactions: Transaction[],
  activePortIds: string[],
  otherCosts: OtherCost[],
  includeCommissions: boolean,
  selectedCurrency: string,
  convertValue: (amount: number, from: string, to: string, date: string) => number,
  targetSymbol?: string | null,
  asOfDate?: string
): InvestedCapitalBreakdown {
  const txFiltered = asOfDate
    ? allTransactions.filter(t => t.date.split('T')[0] <= asOfDate)
    : allTransactions;

  const { tickerHoldings } = calculateHoldingsAndLots(
    txFiltered,
    activePortIds,
    convertValue,
    selectedCurrency,
    targetSymbol
  );

  let activeInvestedCapital = 0;
  Object.keys(tickerHoldings).forEach((sym) => {
    activeInvestedCapital += tickerHoldings[sym].totalCapitalInvested;
  });

  const activeTx = txFiltered.filter(
    t => activePortIds.includes(t.portfolioId) && (!targetSymbol || t.symbol.toUpperCase() === targetSymbol.toUpperCase())
  );

  let totalCommissionsPaid = 0;
  activeTx.forEach((tx) => {
    if (tx.commission && tx.commission > 0 && tx.commissionPaymentMode !== 'ASSET') {
      const commInDisplay = convertValue(
        tx.commission,
        tx.commissionCurrency || tx.currency || 'EUR',
        selectedCurrency,
        tx.date.split('T')[0]
      );
      totalCommissionsPaid += commInDisplay;
    }
  });

  const activeCosts = otherCosts.filter(
    c => activePortIds.includes(c.portfolioId) && (!asOfDate || c.date.split('T')[0] <= asOfDate)
  );
  let totalOtherCostsPaid = 0;
  activeCosts.forEach((c) => {
    if (c.amount && c.amount > 0) {
      totalOtherCostsPaid += convertValue(
        c.amount,
        c.currency || 'EUR',
        selectedCurrency,
        c.date.split('T')[0]
      );
    }
  });

  let grossBuys = 0;
  let grossSells = 0;

  activeTx.forEach((tx) => {
    const valInDisplay = convertValue(
      tx.qty * tx.price,
      tx.currency || 'EUR',
      selectedCurrency,
      tx.date.split('T')[0]
    );

    if (tx.type === TransactionType.BUY) {
      grossBuys += valInDisplay;
    } else if (tx.type === TransactionType.SELL) {
      grossSells += valInDisplay;
    } else if (tx.type === TransactionType.TRANSFER_IN) {
      const peerTx = allTransactions.find(t => t.id === tx.transferOutTransactionId);
      const isInternal = peerTx && activePortIds.includes(peerTx.portfolioId);
      if (!isInternal) {
        const transCap = getTransferEffectiveCapital(tx, allTransactions, selectedCurrency, convertValue);
        grossBuys += transCap;
      }
    } else if (tx.type === TransactionType.TRANSFER_OUT) {
      const peerTx = allTransactions.find(t => t.id === tx.transferInTransactionId);
      const isInternal = peerTx && activePortIds.includes(peerTx.portfolioId);
      if (!isInternal) {
        const transCap = getTransferEffectiveCapital(tx, allTransactions, selectedCurrency, convertValue);
        grossSells += transCap;
      }
    }
  });

  const netContributedCapital = cleanFloatNoise(grossBuys - grossSells);
  const totalCapitalInvested = activeInvestedCapital === 0 ? 0 : netContributedCapital;
  const costBasisWithFees = activeInvestedCapital + (includeCommissions ? (totalCommissionsPaid + totalOtherCostsPaid) : 0);

  return {
    activeInvestedCapital,
    openLotsCostBasis: activeInvestedCapital,
    grossBuys: cleanFloatNoise(grossBuys),
    grossSells: cleanFloatNoise(grossSells),
    netContributedCapital: cleanFloatNoise(netContributedCapital),
    totalCapitalInvested: cleanFloatNoise(totalCapitalInvested),
    totalCommissionsPaid,
    totalOtherCostsPaid,
    costBasisWithFees
  };
}

export interface DailyPricePair {
  todayPrice: number;
  yesterdayPrice: number;
  todayDate: string;
  yesterdayDate: string;
  isMarketClosedToday: boolean;
}

export function getDailyPricePairForSymbol(
  sym: string,
  priceCache: { [symbol: string]: { [date: string]: number } } | undefined,
  fallbackPrice: number,
  todayStr: string,
  yesterdayStr: string,
  isCrypto: boolean
): DailyPricePair {
  const symbolUpper = sym.toUpperCase().trim();
  const cache = priceCache?.[symbolUpper];

  if (!cache) {
    const p = fallbackPrice > 0 ? fallbackPrice : 100;
    return {
      todayPrice: p,
      yesterdayPrice: p,
      todayDate: todayStr,
      yesterdayDate: yesterdayStr,
      isMarketClosedToday: false
    };
  }

  // Gather valid positive entries <= todayStr
  const validDates = Object.keys(cache).filter(
    d => cache[d] !== undefined && cache[d] !== null && cache[d] > 0 && d <= todayStr
  );

  if (validDates.length === 0) {
    const p = fallbackPrice > 0 ? fallbackPrice : 100;
    return {
      todayPrice: p,
      yesterdayPrice: p,
      todayDate: todayStr,
      yesterdayDate: yesterdayStr,
      isMarketClosedToday: false
    };
  }

  // Chronological sort descending (most recent date first)
  validDates.sort((a, b) => b.localeCompare(a));

  // If not crypto (stocks, ETFs, bonds), purge artificial weekend clones (Saturday/Sunday identical to preceding Friday)
  let cleanDates: string[] = [];
  if (!isCrypto) {
    for (let i = 0; i < validDates.length; i++) {
      const d = validDates[i];
      const dayOfWeek = new Date(d + 'T12:00:00Z').getUTCDay();
      // 0 = Sunday, 6 = Saturday
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        // Look for the next date (which is chronologically prior)
        const priorTradingDay = validDates.slice(i + 1).find(pd => {
          const pdDay = new Date(pd + 'T12:00:00Z').getUTCDay();
          return pdDay !== 0 && pdDay !== 6;
        });
        if (priorTradingDay && Math.abs(cache[d] - cache[priorTradingDay]) < 1e-6) {
          // Cloned weekend entry, skip!
          continue;
        }
      }
      cleanDates.push(d);
    }
  } else {
    cleanDates = [...validDates];
  }

  if (cleanDates.length === 0) {
    cleanDates = [...validDates];
  }

  const latestDate = cleanDates[0];
  const latestPrice = cache[latestDate];

  if (cleanDates.length === 1) {
    return {
      todayPrice: latestPrice,
      yesterdayPrice: fallbackPrice > 0 ? fallbackPrice : latestPrice,
      todayDate: latestDate,
      yesterdayDate: latestDate,
      isMarketClosedToday: latestDate < todayStr
    };
  }

  // Find previous trading session
  let priorDate = cleanDates[1];
  let priorPrice = cache[priorDate];

  // In case cleanDates[1] has an identical cloned price from an older sync, search backwards up to 5 sessions
  if (Math.abs(latestPrice - priorPrice) < 1e-8 && cleanDates.length > 2) {
    for (let j = 2; j < Math.min(cleanDates.length, 7); j++) {
      const candidateDate = cleanDates[j];
      const candidatePrice = cache[candidateDate];
      if (Math.abs(latestPrice - candidatePrice) > 1e-8) {
        priorDate = candidateDate;
        priorPrice = candidatePrice;
        break;
      }
    }
  }

  return {
    todayPrice: latestPrice,
    yesterdayPrice: priorPrice,
    todayDate: latestDate,
    yesterdayDate: priorDate,
    isMarketClosedToday: latestDate < todayStr
  };
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
  targetSymbol?: string | null,
  getDailyPricePair?: (sym: string, fallbackPriceNative: number) => DailyPricePair
): FinancialMetricsResult {
  const { tickerHoldings } = calculateHoldingsAndLots(
    allTransactions,
    activePortIds,
    convertValue,
    selectedCurrency,
    targetSymbol
  );

  const activeTx = allTransactions.filter(
    t => activePortIds.includes(t.portfolioId) && (!targetSymbol || t.symbol.toUpperCase() === targetSymbol.toUpperCase())
  );
  const activeCosts = otherCosts.filter(c => activePortIds.includes(c.portfolioId));

  const totalCommissionsPaid = activeTx.reduce(
    (sum, tx) => {
      if (tx.commissionPaymentMode === 'ASSET') return sum;
      return sum + convertValue(tx.commission || 0, tx.commissionCurrency || tx.currency || 'EUR', selectedCurrency, tx.date.split('T')[0]);
    },
    0
  );
  const totalOtherCostsPaid = activeCosts.reduce(
    (sum, c) => sum + convertValue(c.amount || 0, c.currency || 'EUR', selectedCurrency, c.date.split('T')[0]),
    0
  );

  const tickerMetrics: { [symbol: string]: TickerMetric } = {};
  let totalActiveLotCost = 0;
  let totalNominalValue = 0;
  let yesterdayNominalValue = 0;

  const allSymbols = new Set<string>([
    ...Object.keys(tickerHoldings),
    ...activeTx.map(t => t.symbol.toUpperCase().trim())
  ]);

  allSymbols.forEach((sym) => {
    const holding = tickerHoldings[sym] || {
      sharesOwned: 0,
      openLotsCostBasis: 0,
      totalCapitalInvested: 0,
      pmc: 0,
      lots: []
    };

    const symTx = activeTx.filter(t => t.symbol.toUpperCase().trim() === sym);
    const symComms = symTx.reduce(
      (sum, tx) => {
        if (tx.commissionPaymentMode === 'ASSET') return sum;
        return sum + convertValue(tx.commission || 0, tx.commissionCurrency || tx.currency || 'EUR', selectedCurrency, tx.date.split('T')[0]);
      },
      0
    );

    const tickerCurrency = getTickerCurrency(sym);
    const fallbackPriceNative = convertValue(holding.pmc, selectedCurrency, tickerCurrency, todayStr);

    const pricePair = getDailyPricePair
      ? getDailyPricePair(sym, fallbackPriceNative > 0 ? fallbackPriceNative : 100)
      : {
          todayPrice: getPriceForDate(sym, todayStr, fallbackPriceNative > 0 ? fallbackPriceNative : 100),
          yesterdayPrice: getPriceForDate(sym, yesterdayStr, fallbackPriceNative > 0 ? fallbackPriceNative : 100),
          todayDate: todayStr,
          yesterdayDate: yesterdayStr,
          isMarketClosedToday: false
        };

    const todayPrice = pricePair.todayPrice;
    const yesterdayPrice = pricePair.yesterdayPrice;

    const todayPriceInDisplay = convertValue(todayPrice, tickerCurrency, selectedCurrency, pricePair.todayDate || todayStr);
    const yesterdayPriceInDisplay = convertValue(yesterdayPrice, tickerCurrency, selectedCurrency, pricePair.yesterdayDate || yesterdayStr);

    const symTotalNominalValue = holding.sharesOwned * todayPriceInDisplay;
    const symYesterdayNominalValue = holding.sharesOwned * yesterdayPriceInDisplay;

    const gainAbs = symTotalNominalValue - holding.totalCapitalInvested;
    const gainPct = holding.totalCapitalInvested > 0 ? (gainAbs / holding.totalCapitalInvested) * 100 : 0;

    const symBuys = symTx.filter(t => t.type === TransactionType.BUY).reduce(
      (sum, tx) => sum + convertValue(tx.qty * tx.price, tx.currency || 'EUR', selectedCurrency, tx.date.split('T')[0]),
      0
    );
    const symSells = symTx.filter(t => t.type === TransactionType.SELL).reduce(
      (sum, tx) => sum + convertValue(tx.qty * tx.price, tx.currency || 'EUR', selectedCurrency, tx.date.split('T')[0]),
      0
    );
    const symNetContributed = cleanFloatNoise(symBuys - symSells);
    const symOpenLotsCost = holding.openLotsCostBasis !== undefined ? holding.openLotsCostBasis : holding.totalCapitalInvested;
    const symRealized = cleanFloatNoise(symNetContributed - symOpenLotsCost);

    tickerMetrics[sym] = {
      sharesOwned: holding.sharesOwned,
      openLotsCostBasis: symOpenLotsCost,
      totalCapitalInvested: symOpenLotsCost,
      netContributedCapital: symNetContributed,
      grossBuys: cleanFloatNoise(symBuys),
      grossSells: cleanFloatNoise(symSells),
      pmc: holding.pmc,
      totalCommissionsPaid: symComms,
      avgCommissionShare: holding.sharesOwned > 0 ? symComms / holding.sharesOwned : 0,
      todayPriceInDisplay,
      yesterdayPriceInDisplay,
      totalNominalValue: symTotalNominalValue,
      yesterdayNominalValue: symYesterdayNominalValue,
      gainAbsolute: gainAbs,
      gainPercentage: gainPct,
      realizedGainLoss: symRealized,
      activeLots: holding.lots
    };

    totalActiveLotCost = cleanFloatNoise(totalActiveLotCost + holding.totalCapitalInvested);
    totalNominalValue = cleanFloatNoise(totalNominalValue + symTotalNominalValue);
    yesterdayNominalValue = cleanFloatNoise(yesterdayNominalValue + symYesterdayNominalValue);
  });

  // Calculate net contributed capital across all active transactions (Gross Buys - Gross Sells)
  // Perfectly aligns with the Transaction History ledger totals.
  let grossBuys = 0;
  let grossSells = 0;

  activeTx.forEach((tx) => {
    if (targetSymbol && tx.symbol.toUpperCase().trim() !== targetSymbol.toUpperCase().trim()) {
      return;
    }

    const valInDisplay = convertValue(
      tx.qty * tx.price,
      tx.currency || 'EUR',
      selectedCurrency,
      tx.date.split('T')[0]
    );

    if (tx.type === TransactionType.BUY) {
      grossBuys += valInDisplay;
    } else if (tx.type === TransactionType.SELL) {
      grossSells += valInDisplay;
    } else if (tx.type === TransactionType.TRANSFER_IN) {
      const peerTx = allTransactions.find(t => t.id === tx.transferOutTransactionId);
      const isInternal = peerTx && activePortIds.includes(peerTx.portfolioId);
      if (!isInternal) {
        const transCap = getTransferEffectiveCapital(tx, allTransactions, selectedCurrency, convertValue);
        grossBuys += transCap;
      }
    } else if (tx.type === TransactionType.TRANSFER_OUT) {
      const peerTx = allTransactions.find(t => t.id === tx.transferInTransactionId);
      const isInternal = peerTx && activePortIds.includes(peerTx.portfolioId);
      if (!isInternal) {
        const transCap = getTransferEffectiveCapital(tx, allTransactions, selectedCurrency, convertValue);
        grossSells += transCap;
      }
    }
  });

  const netContributedCapital = cleanFloatNoise(grossBuys - grossSells);
  const activeLotCapital = cleanFloatNoise(totalActiveLotCost);
  // If no open positions remain in the active perimeter (all transferred or sold), total invested capital is 0
  const totalCapitalInvested = activeLotCapital === 0 ? 0 : netContributedCapital;
  const realizedGainLoss = cleanFloatNoise(netContributedCapital - activeLotCapital);

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
    netContributedCapital,
    grossBuys: cleanFloatNoise(grossBuys),
    grossSells: cleanFloatNoise(grossSells),
    activeLotCapital,
    openLotsCostBasis: activeLotCapital,
    unrealizedGainLoss: cleanFloatNoise(totalNominalValue - activeLotCapital),
    realizedGainLoss,
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
export interface AssetCommissionSummary {
  symbol: string;
  qty: number;
  fiatValue: number;
  impliedRate: number;
}

export interface TransactionTableTotals {
  totalQty: number;
  totalAmount: number;
  totalCommissions: number;
  fiatCommissions: number;
  assetCommissions: AssetCommissionSummary[];
  totalAssetCommissionsFiat: number;
  buyCount: number;
  sellCount: number;
  transferCount: number;
}

export function calculateTransactionTableTotals(
  transactions: Transaction[],
  convertValue: (amount: number, from: string, to: string, date: string) => number,
  selectedCurrency: string
): TransactionTableTotals {
  let totalQty = 0;
  let totalAmount = 0;
  let totalCommissions = 0;
  let fiatCommissions = 0;
  let totalAssetCommissionsFiat = 0;
  let buyCount = 0;
  let sellCount = 0;
  let transferCount = 0;

  const assetCommissionsMap: Record<string, { qty: number; fiatValue: number }> = {};

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

    if (tx.commission && tx.commission > 0) {
      if (tx.commissionPaymentMode === 'ASSET') {
        const assetSym = (tx.commissionCurrency || tx.symbol || 'ASSET').toUpperCase().trim();
        const unitPriceInDisplay = tx.price
          ? convertValue(tx.price, tx.currency || 'EUR', selectedCurrency, tx.date.split('T')[0])
          : 0;
        const fiatVal = cleanFloatNoise(tx.commission * unitPriceInDisplay);

        if (!assetCommissionsMap[assetSym]) {
          assetCommissionsMap[assetSym] = { qty: 0, fiatValue: 0 };
        }
        assetCommissionsMap[assetSym].qty = cleanFloatNoise(assetCommissionsMap[assetSym].qty + tx.commission);
        assetCommissionsMap[assetSym].fiatValue = cleanFloatNoise(assetCommissionsMap[assetSym].fiatValue + fiatVal);

        totalAssetCommissionsFiat = cleanFloatNoise(totalAssetCommissionsFiat + fiatVal);
        totalCommissions = cleanFloatNoise(totalCommissions + fiatVal);
      } else {
        const commInDisplay = convertValue(
          tx.commission,
          tx.commissionCurrency || tx.currency || 'EUR',
          selectedCurrency,
          tx.date.split('T')[0]
        );
        fiatCommissions = cleanFloatNoise(fiatCommissions + commInDisplay);
        totalCommissions = cleanFloatNoise(totalCommissions + commInDisplay);
      }
    }

    if (tx.type === TransactionType.BUY) buyCount++;
    else if (tx.type === TransactionType.SELL) sellCount++;
    else if (tx.type === TransactionType.TRANSFER_IN || tx.type === TransactionType.TRANSFER_OUT) transferCount++;
  });

  const assetCommissions: AssetCommissionSummary[] = Object.keys(assetCommissionsMap).map(sym => {
    const item = assetCommissionsMap[sym];
    return {
      symbol: sym,
      qty: item.qty,
      fiatValue: item.fiatValue,
      impliedRate: item.qty > 0 ? cleanFloatNoise(item.fiatValue / item.qty) : 0
    };
  });

  return {
    totalQty: cleanFloatNoise(totalQty),
    totalAmount: cleanFloatNoise(totalAmount),
    totalCommissions: cleanFloatNoise(totalCommissions),
    fiatCommissions: cleanFloatNoise(fiatCommissions),
    assetCommissions,
    totalAssetCommissionsFiat: cleanFloatNoise(totalAssetCommissionsFiat),
    buyCount,
    sellCount,
    transferCount
  };
}

export interface AvailableLotForTransfer {
  id: string;
  date: string;
  originalBuyDate: string;
  price: number;
  qty: number;
  availableQty: number;
  currency: string;
}

/**
 * Calculates currently available lots in a specific portfolio for transfer or consumption,
 * accurately matching parent transactions, incoming and outgoing transactions.
 */
export function getAvailableLotsForTransfer(
  allTransactions: Transaction[],
  symbol: string,
  portfolioId: string,
  excludeTransferId?: string | null
): AvailableLotForTransfer[] {
  const validTx = excludeTransferId
    ? allTransactions.filter(t => t.transferId !== excludeTransferId && t.id !== excludeTransferId)
    : allTransactions;

  // 1. Get all incoming transactions for this symbol and portfolio
  const incoming = validTx
    .filter(
      tx =>
        tx.portfolioId === portfolioId &&
        tx.symbol.toUpperCase().trim() === symbol.toUpperCase().trim() &&
        (tx.type === TransactionType.BUY || tx.type === TransactionType.TRANSFER_IN)
    )
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map(tx => ({
      id: tx.id,
      date: tx.date,
      price: tx.type === TransactionType.TRANSFER_IN ? (tx.originalBuyPrice ?? tx.price) : tx.price,
      originalBuyDate: tx.type === TransactionType.TRANSFER_IN ? (tx.originalBuyDate ?? tx.date) : tx.date,
      qty: tx.qty,
      availableQty: tx.qty,
      currency: tx.currency || 'EUR'
    }));

  // 2. Get all outgoing transactions for this symbol and portfolio
  const outgoing = validTx
    .filter(
      tx =>
        tx.portfolioId === portfolioId &&
        tx.symbol.toUpperCase().trim() === symbol.toUpperCase().trim() &&
        (tx.type === TransactionType.SELL || tx.type === TransactionType.TRANSFER_OUT)
    )
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // 3. Deplete incoming lots using exact parent references first, then criteria or FIFO
  outgoing.forEach(out => {
    let outQty = out.qty;

    if (out.parentTransactionId) {
      const parentLot = incoming.find(l => l.id === out.parentTransactionId && l.availableQty > 1e-14);
      if (parentLot) {
        const drain = Math.min(parentLot.availableQty, outQty);
        parentLot.availableQty = cleanFloatNoise(parentLot.availableQty - drain);
        outQty = cleanFloatNoise(outQty - drain);
        if (parentLot.availableQty < 1e-14) {
          parentLot.availableQty = 0;
        }
      }
    }

    if (outQty > 1e-14) {
      const lotsToDeplete = incoming.filter(l => l.availableQty > 1e-14);
      if (out.transferCriteria === 'LIFO') {
        lotsToDeplete.sort((a, b) => new Date(b.originalBuyDate).getTime() - new Date(a.originalBuyDate).getTime());
      } else {
        lotsToDeplete.sort((a, b) => new Date(a.originalBuyDate).getTime() - new Date(b.originalBuyDate).getTime());
      }

      for (const lot of lotsToDeplete) {
        if (outQty <= 1e-14) break;
        const drain = Math.min(lot.availableQty, outQty);
        lot.availableQty = cleanFloatNoise(lot.availableQty - drain);
        outQty = cleanFloatNoise(outQty - drain);
        if (lot.availableQty < 1e-14) {
          lot.availableQty = 0;
        }
      }
    }
  });

  return incoming.filter(lot => lot.availableQty > 1e-14);
}

export interface TransferExecutionInput {
  allTransactions: Transaction[];
  editTransferId?: string | null;
  sourcePortfolioId: string;
  destPortfolioId: string;
  symbol: string;
  qty: number;
  date: string;
  criteria: 'FIFO' | 'LIFO';
  price?: number;
  priceCurrency?: string;
  sourceCommission?: number;
  sourceCommissionCurrency?: string;
  sourceCommissionPaymentMode?: 'EXTERNAL' | 'ASSET';
  destCommission?: number;
  destCommissionCurrency?: string;
  destCommissionPaymentMode?: 'EXTERNAL' | 'ASSET';
  notes?: string;
  sourceCurr?: string;
  destCurr?: string;
}

/**
 * Executes transfer operations strictly enforcing the non-spreading rule:
 * - Asset commissions are absorbed sequentially by lots according to transfer criteria (FIFO/LIFO).
 * - External (fiat) commissions are recorded on the primary transfer chunk without fractional splitting.
 * - Outgoing quantity matches gross pulled quantity; incoming matches net received quantity.
 * - Original purchase price and date of each lot are strictly preserved.
 */
export function executeTransferTransactionPair(input: TransferExecutionInput): {
  newTransactions: Transaction[];
  singleTransfer: Transfer;
} {
  const {
    allTransactions,
    editTransferId,
    sourcePortfolioId,
    destPortfolioId,
    symbol,
    qty,
    date,
    criteria,
    price,
    priceCurrency,
    sourceCommission = 0,
    sourceCommissionCurrency,
    sourceCommissionPaymentMode = 'EXTERNAL',
    destCommission = 0,
    destCommissionCurrency,
    destCommissionPaymentMode = 'EXTERNAL',
    notes = '',
    sourceCurr = 'EUR',
    destCurr = 'EUR'
  } = input;

  const sym = symbol.toUpperCase().trim();
  const availableLots = getAvailableLotsForTransfer(allTransactions, sym, sourcePortfolioId, editTransferId);
  const totalAvailable = availableLots.reduce((sum, l) => sum + l.availableQty, 0);

  if (qty > totalAvailable + 1e-12) {
    throw new Error('Quantità richiesta superiore alle quote disponibili.');
  }

  // Sort lots according to chosen criteria (FIFO: oldest first; LIFO: newest first)
  const sortedLots = [...availableLots].sort((a, b) => {
    const timeA = new Date(a.originalBuyDate || a.date).getTime();
    const timeB = new Date(b.originalBuyDate || b.date).getTime();
    return criteria === 'FIFO' ? timeA - timeB : timeB - timeA;
  });

  const transferId = editTransferId || ('tr-' + Math.random().toString(36).substring(2, 9));
  let remainingToTransfer = qty;

  const totalSourceAssetFee = sourceCommissionPaymentMode === 'ASSET' ? sourceCommission : 0;
  const totalDestAssetFee = destCommissionPaymentMode === 'ASSET' ? destCommission : 0;
  let remainingSourceAssetFee = totalSourceAssetFee;
  let remainingDestAssetFee = totalDestAssetFee;

  const newTransactions: Transaction[] = [];

  for (let i = 0; i < sortedLots.length; i++) {
    if (remainingToTransfer <= 1e-14) break;
    const lot = sortedLots[i];
    const lotQtyToTake = Math.min(lot.availableQty, remainingToTransfer);
    remainingToTransfer = cleanFloatNoise(remainingToTransfer - lotQtyToTake);

    // Sequential absorption of asset commission by lots (NO PROPORTIONAL SPREADING)
    const sourceFeeAbsorbedByLot = Math.min(lotQtyToTake, remainingSourceAssetFee);
    remainingSourceAssetFee = cleanFloatNoise(remainingSourceAssetFee - sourceFeeAbsorbedByLot);

    const availableAfterSourceFee = Math.max(0, lotQtyToTake - sourceFeeAbsorbedByLot);
    const destFeeAbsorbedByLot = Math.min(availableAfterSourceFee, remainingDestAssetFee);
    remainingDestAssetFee = cleanFloatNoise(remainingDestAssetFee - destFeeAbsorbedByLot);

    const lotQtyReceived = cleanFloatNoise(lotQtyToTake - sourceFeeAbsorbedByLot - destFeeAbsorbedByLot);

    const txOutId = 'tx-' + Math.random().toString(36).substring(2, 9);
    const txInId = 'tx-' + Math.random().toString(36).substring(2, 9);

    // Fiat commissions are assigned directly to the primary chunk once (never fractionally split)
    const chunkSourceComm = sourceCommissionPaymentMode === 'ASSET'
      ? sourceFeeAbsorbedByLot
      : (i === 0 ? sourceCommission : 0);

    const chunkDestComm = destCommissionPaymentMode === 'ASSET'
      ? destFeeAbsorbedByLot
      : (i === 0 ? destCommission : 0);

    const txOut: Transaction = {
      id: txOutId,
      transferId,
      portfolioId: sourcePortfolioId,
      date: date || new Date().toISOString(),
      type: TransactionType.TRANSFER_OUT,
      symbol: sym,
      qty: lotQtyToTake,
      price: Number(price && price > 0 ? price : lot.price),
      commission: chunkSourceComm,
      commissionPaymentMode: sourceCommissionPaymentMode,
      currency: priceCurrency || lot.currency || sourceCurr,
      commissionCurrency: sourceCommissionPaymentMode === 'ASSET' ? sym : (sourceCommissionCurrency || sourceCurr),
      notes,
      parentTransactionId: lot.id,
      transferInTransactionId: txInId,
      originalBuyPrice: lot.price,
      originalBuyDate: lot.originalBuyDate,
      transferCriteria: criteria
    };

    if (lotQtyReceived > 1e-14 || (chunkDestComm > 0 && destCommissionPaymentMode === 'EXTERNAL')) {
      const txIn: Transaction = {
        id: txInId,
        transferId,
        portfolioId: destPortfolioId,
        date: date || new Date().toISOString(),
        type: TransactionType.TRANSFER_IN,
        symbol: sym,
        qty: Math.max(0, lotQtyReceived),
        price: Number(price && price > 0 ? price : lot.price),
        commission: chunkDestComm,
        commissionPaymentMode: destCommissionPaymentMode,
        currency: priceCurrency || lot.currency || destCurr,
        commissionCurrency: destCommissionPaymentMode === 'ASSET' ? sym : (destCommissionCurrency || destCurr),
        notes,
        parentTransactionId: lot.id,
        transferOutTransactionId: txOutId,
        originalBuyPrice: lot.price,
        originalBuyDate: lot.originalBuyDate,
        transferCriteria: criteria
      };
      newTransactions.push(txIn);
    }

    newTransactions.push(txOut);
  }

  const singleTransfer: Transfer = {
    id: transferId,
    date: date || new Date().toISOString(),
    symbol: sym,
    qty,
    price: price && price > 0 ? price : undefined,
    priceCurrency: priceCurrency || sourceCurr,
    sourcePortfolioId,
    destPortfolioId,
    sourceCommission,
    sourceCommissionCurrency: sourceCommissionCurrency || sourceCurr,
    sourceCommissionPaymentMode,
    destCommission,
    destCommissionCurrency: destCommissionCurrency || destCurr,
    destCommissionPaymentMode,
    criteria,
    notes,
    childTransactionIds: newTransactions.map(t => t.id)
  };

  return { newTransactions, singleTransfer };
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
  periodNetCapital: number;     // Lot-based net invested capital at end of period (consistent with Dashboard)
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
    periodNetCapital: 0,
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
        const grossAmount = getTransferEffectiveCapital(tx, allTransactions, selectedCurrency, convertValue);
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
        const grossAmount = getTransferEffectiveCapital(tx, allTransactions, selectedCurrency, convertValue);
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

  const lastBal = filteredBalances.length > 0 ? filteredBalances[filteredBalances.length - 1] : null;
  const periodNetCapital = lastBal
    ? (includeCommissions ? lastBal.investedWithCommissions : lastBal.investedNominal)
    : 0;

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
    periodNetCapital,
    periodCommissions,
    periodNetGain,
    totalDays
  };
}
