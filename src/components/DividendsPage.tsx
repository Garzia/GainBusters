import React, { useState, useMemo } from 'react';
import { 
  Coins, 
  TrendingUp, 
  Calendar, 
  Building2, 
  Filter, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  ArrowUpRight, 
  DollarSign,
  Receipt,
  Layers,
  X
} from 'lucide-react';
import { 
  DBState, 
  LanguagePhrases, 
  Transaction, 
  TransactionType 
} from '../types.ts';
import { 
  calculateDividendsOverview 
} from '../utils/finance.ts';
import { formatDateString } from '../utils.ts';
import { formatCurrency } from '../App.tsx';
import { QuantityDisplay } from './QuantityDisplay.tsx';

interface DividendsPageProps {
  db: DBState;
  selectedCurrency: string;
  convertValue: (amount: number, from: string, to: string, date: string) => number;
  t: LanguagePhrases;
  lang: string;
  onOpenNewDividend: (portfolioId?: string) => void;
  onEditTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
}

export const DividendsPage: React.FC<DividendsPageProps> = ({
  db,
  selectedCurrency,
  convertValue,
  t,
  lang,
  onOpenNewDividend,
  onEditTransaction,
  onDeleteTransaction
}) => {
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>('');
  const [searchSymbol, setSearchSymbol] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'symbol'>('date');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Compute overall and per-portfolio dividend statistics
  const overview = useMemo(() => {
    return calculateDividendsOverview(
      db.transactions,
      db.portfolios,
      db.accounts,
      convertValue,
      selectedCurrency
    );
  }, [db.transactions, db.portfolios, db.accounts, convertValue, selectedCurrency]);

  // All dividend transactions
  const allDividendTxs = useMemo(() => {
    return db.transactions.filter(tx => tx.type === TransactionType.DIVIDEND);
  }, [db.transactions]);

  // Filtered dividend transactions for historical payments table
  const filteredTxs = useMemo(() => {
    return allDividendTxs.filter(tx => {
      if (selectedPortfolioId && tx.portfolioId !== selectedPortfolioId) {
        return false;
      }
      if (searchSymbol && !tx.symbol.toUpperCase().includes(searchSymbol.toUpperCase().trim())) {
        return false;
      }
      if (startDate) {
        const txDate = tx.date.split('T')[0];
        if (txDate < startDate) return false;
      }
      if (endDate) {
        const txDate = tx.date.split('T')[0];
        if (txDate > endDate) return false;
      }
      return true;
    }).sort((a, b) => {
      if (sortBy === 'date') {
        const diff = new Date(b.date).getTime() - new Date(a.date).getTime();
        return sortAsc ? -diff : diff;
      }
      if (sortBy === 'amount') {
        const qtyA = a.qty > 0 ? a.qty : 1;
        const qtyB = b.qty > 0 ? b.qty : 1;
        const valA = convertValue(a.price * qtyA, a.currency || 'EUR', selectedCurrency, a.date.split('T')[0]);
        const valB = convertValue(b.price * qtyB, b.currency || 'EUR', selectedCurrency, b.date.split('T')[0]);
        return sortAsc ? valA - valB : valB - valA;
      }
      if (sortBy === 'symbol') {
        const diff = a.symbol.localeCompare(b.symbol);
        return sortAsc ? diff : -diff;
      }
      return 0;
    });
  }, [allDividendTxs, selectedPortfolioId, searchSymbol, startDate, endDate, sortBy, sortAsc, convertValue, selectedCurrency]);

  // Subtotal for currently filtered transactions
  const filteredSubtotal = useMemo(() => {
    let gross = 0;
    let withholding = 0;
    filteredTxs.forEach(tx => {
      const qty = tx.qty > 0 ? tx.qty : 1;
      const g = convertValue(tx.price * qty, tx.currency || 'EUR', selectedCurrency, tx.date.split('T')[0]);
      let w = 0;
      if (tx.commission && tx.commission > 0) {
        w = convertValue(tx.commission, tx.commissionCurrency || tx.currency || 'EUR', selectedCurrency, tx.date.split('T')[0]);
      }
      gross += g;
      withholding += w;
    });
    return { gross, withholding, net: gross - withholding };
  }, [filteredTxs, convertValue, selectedCurrency]);

  const hasActiveFilters = Boolean(selectedPortfolioId || searchSymbol || startDate || endDate);

  const clearFilters = () => {
    setSelectedPortfolioId('');
    setSearchSymbol('');
    setStartDate('');
    setEndDate('');
  };

  return (
    <div className="space-y-8 animate-fade-in text-slate-200">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Coins className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                {t.dividendsTitle}
              </h1>
              <p className="text-xs text-slate-400 font-sans mt-0.5">
                {t.dividendsDesc}
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => onOpenNewDividend()}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold font-sans shadow-lg shadow-cyan-950/30 transition-all duration-200 cursor-pointer transform hover:-translate-y-0.5"
        >
          <Plus className="w-4 h-4" />
          <span>{t.registerDividendBtn}</span>
        </button>
      </div>

      {/* Top Summary Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Gross Received */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4.5 space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>{t.totalDividendsReceived}</span>
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-cyan-300 font-mono tracking-tight">
            {formatCurrency(overview.totalGross, selectedCurrency)}
          </div>
          <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/60">
            <span>{t.netDividend}:</span>
            <span className="font-bold text-emerald-400 font-mono">
              {formatCurrency(overview.totalNet, selectedCurrency)}
            </span>
          </div>
        </div>

        {/* Payments Count */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4.5 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>{t.dividendPaymentsCount}</span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-white font-mono tracking-tight">
            {overview.paymentsCount}
          </div>
          <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/60">
            <span>{t.withholdingTax}:</span>
            <span className="font-bold text-rose-400 font-mono">
              {formatCurrency(overview.totalWithholding, selectedCurrency)}
            </span>
          </div>
        </div>

        {/* Top Dividend Payer Asset */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4.5 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>{t.topDividendPayerLabel}</span>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-300 font-mono tracking-tight truncate">
            {overview.topPayingAsset ? overview.topPayingAsset.symbol : '—'}
          </div>
          <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/60">
            <span>{t.grossDividend}:</span>
            <span className="font-bold text-slate-200 font-mono">
              {overview.topPayingAsset ? formatCurrency(overview.topPayingAsset.gross, selectedCurrency) : '—'}
            </span>
          </div>
        </div>

        {/* Latest Payment */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4.5 space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>{t.latestPaymentDate}</span>
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-base sm:text-lg font-bold text-white font-sans truncate">
            {overview.latestPayment ? formatDateString(overview.latestPayment.date, lang) : '—'}
          </div>
          <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/60">
            <span>{overview.latestPayment?.symbol || 'Ticker'}:</span>
            <span className="font-bold text-cyan-300 font-mono">
              {overview.latestPayment ? formatCurrency(overview.latestPayment.gross, selectedCurrency) : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Summary per Portfolio Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-extrabold text-white tracking-tight flex items-center gap-2">
              <Building2 className="w-4 h-4 text-cyan-400" />
              {t.dividendsPerPortfolio}
            </h2>
            <p className="text-xs text-slate-400">
              {overview.portfoliosCount} {t.allOption === 'Tutti' ? 'portafogli con incassi registrati' : 'portfolios with recorded payouts'}
            </p>
          </div>

          {selectedPortfolioId && (
            <button
              onClick={() => setSelectedPortfolioId('')}
              className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 font-bold bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>{t.allPortfoliosOption}</span>
            </button>
          )}
        </div>

        {overview.portfolioSummaries.length === 0 ? (
          <div className="p-8 border border-dashed border-slate-800 rounded-2xl text-center text-slate-500 text-xs font-mono">
            {t.noPortfoliosDefinedPlaceholder}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {overview.portfolioSummaries.map(pSummary => {
              const isSelected = selectedPortfolioId === pSummary.portfolioId;
              const hasDividends = pSummary.paymentsCount > 0;

              return (
                <div
                  key={pSummary.portfolioId}
                  onClick={() => {
                    setSelectedPortfolioId(isSelected ? '' : pSummary.portfolioId);
                  }}
                  className={`p-4.5 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-slate-900/90 border-cyan-500/60 shadow-[0_0_20px_rgba(6,182,212,0.15)] ring-1 ring-cyan-500/40'
                      : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/60'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Portfolio & Broker Title */}
                    <div className="flex items-start justify-between gap-2 border-b border-slate-800/60 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-white hover:text-cyan-400 transition-colors">
                            {pSummary.portfolioName}
                          </span>
                          {!pSummary.includeInDashboard && (
                            <span className="text-[9px] bg-rose-950/30 text-rose-400 px-1.5 py-0.2 rounded font-bold uppercase">
                              {t.allOption === 'Tutti' ? 'Escluso' : 'Excluded'}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400 font-sans">
                          {pSummary.accountName}
                        </span>
                      </div>
                      <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono font-bold uppercase">
                        {pSummary.currency}
                      </span>
                    </div>

                    {/* Total Dividends Amount */}
                    <div className="flex items-baseline justify-between pt-1">
                      <span className="text-xs text-slate-400">{t.grossDividend}:</span>
                      <span className={`text-lg font-black font-mono ${hasDividends ? 'text-cyan-300' : 'text-slate-500'}`}>
                        {formatCurrency(pSummary.totalGross, selectedCurrency)}
                      </span>
                    </div>

                    {/* Net and Withholding breakdown */}
                    <div className="grid grid-cols-2 gap-2 text-xs pt-1 text-slate-400">
                      <div>
                        <span className="block text-[10px] text-slate-500 uppercase tracking-wider">{t.netDividend}</span>
                        <span className="font-bold text-emerald-400 font-mono">
                          {formatCurrency(pSummary.totalNet, selectedCurrency)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="block text-[10px] text-slate-500 uppercase tracking-wider">{t.dividendPaymentsCount}</span>
                        <span className="font-bold text-slate-200 font-mono">
                          {pSummary.paymentsCount}
                        </span>
                      </div>
                    </div>

                    {/* Top paying assets in this portfolio */}
                    {pSummary.symbols.length > 0 && (
                      <div className="pt-2 border-t border-slate-800/60 space-y-1.5">
                        <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider block">
                          Asset ({pSummary.symbols.length})
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {pSummary.symbols.slice(0, 3).map(sym => (
                            <span
                              key={sym.symbol}
                              className="text-[10px] bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800 text-slate-300 font-mono flex items-center gap-1"
                            >
                              <strong className="text-white">{sym.symbol}</strong>
                              <span className="text-cyan-400 font-bold">{formatCurrency(sym.gross, selectedCurrency)}</span>
                            </span>
                          ))}
                          {pSummary.symbols.length > 3 && (
                            <span className="text-[10px] text-slate-500 px-1 py-0.5 font-mono">
                              +{pSummary.symbols.length - 3}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card bottom actions */}
                  <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs">
                    <span className="text-[10px] text-slate-500 font-mono">
                      {pSummary.latestPaymentDate 
                        ? `${t.latestPaymentDate}: ${formatDateString(pSummary.latestPaymentDate, lang)}` 
                        : (t.allOption === 'Tutti' ? 'Nessun accredito' : 'No payouts')}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenNewDividend(pSummary.portfolioId);
                      }}
                      className="text-[11px] text-cyan-400 hover:text-cyan-300 font-bold hover:underline flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>{t.registerDividendBtn}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Historical Payment Dates Table Section */}
      <div className="space-y-4 pt-2">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div>
            <h2 className="text-base font-extrabold text-white tracking-tight flex items-center gap-2">
              <Calendar className="w-4 h-4 text-cyan-400" />
              {t.historicalPaymentDates}
            </h2>
            <p className="text-xs text-slate-400">
              {filteredTxs.length} {t.allOption === 'Tutti' ? 'accrediti trovati' : 'payouts found'}
              {hasActiveFilters && (
                <span className="text-cyan-400 font-medium ml-1">
                  ({t.allOption === 'Tutti' ? 'filtri applicati' : 'filtered'})
                </span>
              )}
            </p>
          </div>

          {/* Quick Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-700/60 transition-colors self-start md:self-auto cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>{t.allOption === 'Tutti' ? 'Azzera Filtri' : 'Reset Filters'}</span>
            </button>
          )}
        </div>

        {/* Filters Bar */}
        <div className="bg-slate-950/60 p-4 border border-slate-800/80 rounded-2xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* Portfolio Filter */}
          <div className="space-y-1">
            <label className="text-slate-400 font-bold block font-mono uppercase text-[9px] tracking-wider">
              {t.allPortfoliosOption}
            </label>
            <select
              value={selectedPortfolioId}
              onChange={(e) => setSelectedPortfolioId(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-white rounded-xl px-3 py-2 w-full select-none outline-none font-medium text-xs font-sans focus:border-cyan-500/80 transition-colors"
            >
              <option value="">{t.allPortfoliosOption}</option>
              {db.portfolios.map(p => {
                const acc = db.accounts.find(a => a.id === p.accountId);
                return (
                  <option key={p.id} value={p.id}>
                    {p.name} ({acc?.name || 'Broker'})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Symbol Filter */}
          <div className="space-y-1">
            <label className="text-slate-400 font-bold block font-mono uppercase text-[9px] tracking-wider">
              {t.tickerLabel}
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchSymbol}
                onChange={(e) => setSearchSymbol(e.target.value)}
                placeholder="es. AAPL, VWCE.MI..."
                className="bg-slate-900 border border-slate-800 text-white rounded-xl px-3 py-2 pl-8 w-full outline-none font-medium text-xs font-mono uppercase placeholder:normal-case placeholder:font-sans focus:border-cyan-500/80 transition-colors"
              />
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            </div>
          </div>

          {/* From Date */}
          <div className="space-y-1">
            <label className="text-slate-400 font-bold block font-mono uppercase text-[9px] tracking-wider">
              {t.fromDateLabel}
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-white rounded-xl px-3 py-2 w-full outline-none text-xs font-mono focus:border-cyan-500/80 transition-colors"
            />
          </div>

          {/* To Date */}
          <div className="space-y-1">
            <label className="text-slate-400 font-bold block font-mono uppercase text-[9px] tracking-wider">
              {t.toDateLabel}
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-slate-900 border border-slate-800 text-white rounded-xl px-3 py-2 w-full outline-none text-xs font-mono focus:border-cyan-500/80 transition-colors"
            />
          </div>
        </div>

        {/* Small Historical Payments Table */}
        {filteredTxs.length === 0 ? (
          <div className="p-8 border border-dashed border-slate-800 rounded-2xl text-center space-y-3 bg-slate-950/20">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mx-auto border border-cyan-500/20">
              <Coins className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-white">
                {allDividendTxs.length === 0 ? t.noDividendsRecorded : t.noDividendsMatchingCriteria}
              </p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                {allDividendTxs.length === 0 
                  ? (t.allOption === 'Tutti' 
                      ? 'Registra i dividendi percepiti dalle tue azioni o ETF per monitorare la rendita passiva nel tempo.'
                      : 'Record dividends received from your stocks or ETFs to track your passive income stream over time.')
                  : (t.allOption === 'Tutti' ? 'Prova a modificare i filtri sopra impostati.' : 'Try adjusting your search criteria.')}
              </p>
            </div>
            {allDividendTxs.length === 0 && (
              <button
                onClick={() => onOpenNewDividend(selectedPortfolioId)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold font-sans transition-all duration-200 cursor-pointer shadow-md"
              >
                <Plus className="w-4 h-4" />
                <span>{t.registerDividendBtn}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-slate-950/40">
            <table className="w-full text-left border-collapse text-xs select-text">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 uppercase tracking-widest font-mono font-black text-[10px]">
                  <th 
                    className="py-3 px-4 cursor-pointer hover:text-white transition select-none"
                    onClick={() => {
                      if (sortBy === 'date') setSortAsc(!sortAsc);
                      else { setSortBy('date'); setSortAsc(false); }
                    }}
                  >
                    {t.paymentDate} {sortBy === 'date' ? (sortAsc ? '▲' : '▼') : ''}
                  </th>
                  <th className="py-3 px-4">
                    {t.allOption === 'Tutti' ? 'Portafoglio' : 'Portfolio'}
                  </th>
                  <th 
                    className="py-3 px-4 cursor-pointer hover:text-white transition select-none"
                    onClick={() => {
                      if (sortBy === 'symbol') setSortAsc(!sortAsc);
                      else { setSortBy('symbol'); setSortAsc(true); }
                    }}
                  >
                    {t.tickerLabel} {sortBy === 'symbol' ? (sortAsc ? '▲' : '▼') : ''}
                  </th>
                  <th className="py-3 px-4 text-right">
                    {t.qtyLabel}
                  </th>
                  <th className="py-3 px-4 text-right">
                    {t.dividendPerShareLabel}
                  </th>
                  <th 
                    className="py-3 px-4 text-right cursor-pointer hover:text-white transition select-none"
                    onClick={() => {
                      if (sortBy === 'amount') setSortAsc(!sortAsc);
                      else { setSortBy('amount'); setSortAsc(false); }
                    }}
                  >
                    {t.grossDividend} {sortBy === 'amount' ? (sortAsc ? '▲' : '▼') : ''}
                  </th>
                  <th className="py-3 px-4 text-right">
                    {t.withholdingTax}
                  </th>
                  <th className="py-3 px-4 text-right">
                    {t.netDividend}
                  </th>
                  <th className="py-3 px-4">
                    {t.notesLabel}
                  </th>
                  <th className="py-3 px-4 text-right">
                    {t.actionsLabel}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredTxs.map(tx => {
                  const port = db.portfolios.find(p => p.id === tx.portfolioId);
                  const acc = port ? db.accounts.find(a => a.id === port.accountId) : null;
                  const qty = tx.qty > 0 ? tx.qty : 1;
                  const grossVal = convertValue(tx.price * qty, tx.currency || 'EUR', selectedCurrency, tx.date.split('T')[0]);
                  let commVal = 0;
                  if (tx.commission && tx.commission > 0) {
                    commVal = convertValue(tx.commission, tx.commissionCurrency || tx.currency || 'EUR', selectedCurrency, tx.date.split('T')[0]);
                  }
                  const netVal = grossVal - commVal;

                  return (
                    <tr 
                      key={tx.id}
                      className="hover:bg-slate-900/40 transition-colors"
                    >
                      {/* Payment Date */}
                      <td className="py-2.5 px-4 font-mono text-slate-300 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          <span>{formatDateString(tx.date, lang)}</span>
                        </div>
                      </td>

                      {/* Portfolio */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-bold text-white">{port?.name || 'N/A'}</span>
                          {acc && (
                            <span className="text-[10px] text-slate-400">{acc.name}</span>
                          )}
                        </div>
                      </td>

                      {/* Symbol */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 font-black font-mono tracking-wider text-[11px]">
                          {tx.symbol}
                        </span>
                      </td>

                      {/* Quantity */}
                      <td className="py-2.5 px-4 text-right font-mono text-slate-300 font-bold">
                        <QuantityDisplay value={tx.qty} />
                      </td>

                      {/* Dividend per share */}
                      <td className="py-2.5 px-4 text-right font-mono text-slate-300 font-bold">
                        {formatCurrency(tx.price, tx.currency || selectedCurrency)}
                      </td>

                      {/* Gross Dividend */}
                      <td className="py-2.5 px-4 text-right font-mono font-black text-cyan-300 whitespace-nowrap">
                        <div>{formatCurrency(grossVal, selectedCurrency)}</div>
                        {tx.currency && tx.currency !== selectedCurrency && (
                          <span className="block text-[9px] text-slate-500 font-normal">
                            Orig: {formatCurrency(tx.price * qty, tx.currency)}
                          </span>
                        )}
                      </td>

                      {/* Withholding / Fees */}
                      <td className="py-2.5 px-4 text-right font-mono font-medium text-rose-400 whitespace-nowrap">
                        {commVal > 0 ? (
                          <span>-{formatCurrency(commVal, selectedCurrency)}</span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      {/* Net Dividend */}
                      <td className="py-2.5 px-4 text-right font-mono font-black text-emerald-400 whitespace-nowrap">
                        {formatCurrency(netVal, selectedCurrency)}
                      </td>

                      {/* Notes */}
                      <td className="py-2.5 px-4 text-slate-400 max-w-[200px] truncate" title={tx.notes}>
                        {tx.notes || <span className="text-slate-600 italic">—</span>}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => onEditTransaction(tx)}
                            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                            title={t.editAccount}
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDeleteTransaction(tx.id)}
                            className="p-1 rounded-lg hover:bg-rose-950/30 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                            title={t.deleteAccount}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Table Footer Totals */}
              <tfoot>
                <tr className="border-t-2 border-slate-800 bg-slate-900/70 font-mono font-bold text-xs">
                  <td colSpan={5} className="py-3 px-4 text-slate-400 uppercase tracking-wider text-[10px]">
                    {t.totalsLabel} ({filteredTxs.length} {filteredTxs.length === 1 ? 'pagamento' : 'pagamenti'})
                  </td>
                  <td className="py-3 px-4 text-right text-cyan-300 font-black">
                    {formatCurrency(filteredSubtotal.gross, selectedCurrency)}
                  </td>
                  <td className="py-3 px-4 text-right text-rose-400">
                    {filteredSubtotal.withholding > 0 ? `-${formatCurrency(filteredSubtotal.withholding, selectedCurrency)}` : '—'}
                  </td>
                  <td className="py-3 px-4 text-right text-emerald-400 font-black">
                    {formatCurrency(filteredSubtotal.net, selectedCurrency)}
                  </td>
                  <td colSpan={2} className="py-3 px-4"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
