/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar,
  Search,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Copy,
  CheckCircle2,
  HelpCircle,
  FileSpreadsheet,
  Globe,
  Sliders,
  ArrowUpDown,
  Filter,
  Info
} from 'lucide-react';
import { LanguagePhrases, TickerConfig, QuoteSource } from '../types.ts';
import { formatDateString } from '../utils.ts';

export interface QuotesHistoryViewerProps {
  selectedSymbol: string;
  onSelectSymbol?: (symbol: string) => void;
  availableSymbols: string[];
  tickerConfigs?: { [symbol: string]: TickerConfig };
  priceCache?: { [ticker: string]: { [date: string]: number } };
  onUpdateQuote: (symbol: string, date: string, price: number) => Promise<void> | void;
  onDeleteQuote: (symbol: string, date: string) => Promise<void> | void;
  onSyncTickerPrices?: (symbol: string) => Promise<void> | void;
  onSwitchToTickerConfig?: (symbol: string) => void;
  t: LanguagePhrases;
  lang?: string;
  currency?: string;
}

export const QuotesHistoryViewer: React.FC<QuotesHistoryViewerProps> = ({
  selectedSymbol,
  onSelectSymbol,
  availableSymbols = [],
  tickerConfigs = {},
  priceCache = {},
  onUpdateQuote,
  onDeleteQuote,
  onSyncTickerPrices,
  onSwitchToTickerConfig,
  t,
  lang = 'it',
  currency = 'EUR'
}) => {
  // Current active symbol
  const activeSymbol = (selectedSymbol || (availableSymbols[0] || '')).toUpperCase().trim();

  // Search/filter states for the quotes list
  const [dateSearchTerm, setDateSearchTerm] = useState<string>('');
  const [timeframeFilter, setTimeframeFilter] = useState<'ALL' | '30D' | '90D' | 'THIS_YEAR' | 'PREV_YEAR'>('ALL');
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc'); // default: newest date first

  // Manual Add Quote Form States
  const [isAddFormOpen, setIsAddFormOpen] = useState<boolean>(false);
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [newQuoteDate, setNewQuoteDate] = useState<string>(todayStr);
  const [newQuotePrice, setNewQuotePrice] = useState<string>('');
  const [addWarningDismissed, setAddWarningDismissed] = useState<boolean>(false);
  const [addWarningDetails, setAddWarningDetails] = useState<{ message: string; diffPct: number } | null>(null);

  // Inline Edit Row States
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editPriceInput, setEditPriceInput] = useState<string>('');
  const [inlineWarningDetails, setInlineWarningDetails] = useState<{ date: string; message: string } | null>(null);

  // Inline Delete Confirmation State
  const [deleteConfirmDate, setDeleteConfirmDate] = useState<string | null>(null);

  // Visual Feedback Toast
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [copiedCsv, setCopiedCsv] = useState<boolean>(false);

  // Ticker search filter for the dropdown/selector
  const [tickerSelectorSearch, setTickerSelectorSearch] = useState<string>('');

  // Auto-hide feedback toast
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  // Extract raw prices object for active symbol
  const quotesMap = useMemo(() => {
    return priceCache[activeSymbol] || {};
  }, [priceCache, activeSymbol]);

  // Sorted list of all quote records with chronological order
  const allChronologicalQuotes = useMemo(() => {
    const dates = Object.keys(quotesMap).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
    dates.sort((a, b) => a.localeCompare(b));

    const records: Array<{
      date: string;
      price: number;
      prevPrice?: number;
      dailyChangeAbs?: number;
      dailyChangePct?: number;
      isOutlier?: boolean;
    }> = [];

    for (let i = 0; i < dates.length; i++) {
      const d = dates[i];
      const p = quotesMap[d];
      let prevP: number | undefined = undefined;
      let changeAbs: number | undefined = undefined;
      let changePct: number | undefined = undefined;
      let isOutlier = false;

      if (i > 0) {
        prevP = quotesMap[dates[i - 1]];
        if (prevP !== undefined && prevP > 0) {
          changeAbs = p - prevP;
          changePct = ((p - prevP) / prevP) * 100;
          if (Math.abs(changePct) >= 30) {
            isOutlier = true;
          }
        }
      }

      records.push({
        date: d,
        price: p,
        prevPrice: prevP,
        dailyChangeAbs: changeAbs,
        dailyChangePct: changePct,
        isOutlier
      });
    }

    return records;
  }, [quotesMap]);

  // Quick statistics for the selected ticker
  const stats = useMemo(() => {
    const totalCount = allChronologicalQuotes.length;
    if (totalCount === 0) {
      return {
        totalCount: 0,
        latestDate: null,
        latestPrice: null,
        firstDate: null,
        firstPrice: null,
        minPrice: null,
        maxPrice: null,
        latestChangePct: null
      };
    }

    const first = allChronologicalQuotes[0];
    const latest = allChronologicalQuotes[totalCount - 1];

    let min = Infinity;
    let max = -Infinity;

    allChronologicalQuotes.forEach(q => {
      if (q.price < min) min = q.price;
      if (q.price > max) max = q.price;
    });

    return {
      totalCount,
      latestDate: latest.date,
      latestPrice: latest.price,
      firstDate: first.date,
      firstPrice: first.price,
      minPrice: min === Infinity ? null : min,
      maxPrice: max === -Infinity ? null : max,
      latestChangePct: latest.dailyChangePct
    };
  }, [allChronologicalQuotes]);

  // Filtered quotes based on timeframe and date search
  const filteredQuotes = useMemo(() => {
    let list = [...allChronologicalQuotes];

    // Apply Timeframe Filter
    if (timeframeFilter === '30D') {
      const threshold = new Date();
      threshold.setDate(threshold.getDate() - 30);
      const thresholdStr = threshold.toISOString().split('T')[0];
      list = list.filter(q => q.date >= thresholdStr);
    } else if (timeframeFilter === '90D') {
      const threshold = new Date();
      threshold.setDate(threshold.getDate() - 90);
      const thresholdStr = threshold.toISOString().split('T')[0];
      list = list.filter(q => q.date >= thresholdStr);
    } else if (timeframeFilter === 'THIS_YEAR') {
      const currentYear = new Date().getFullYear().toString();
      list = list.filter(q => q.date.startsWith(currentYear));
    } else if (timeframeFilter === 'PREV_YEAR') {
      const prevYear = (new Date().getFullYear() - 1).toString();
      list = list.filter(q => q.date.startsWith(prevYear));
    }

    // Apply Search Term
    if (dateSearchTerm.trim()) {
      const term = dateSearchTerm.trim().toLowerCase();
      list = list.filter(q => q.date.includes(term));
    }

    // Sort order
    if (sortDirection === 'desc') {
      list.reverse();
    }

    return list;
  }, [allChronologicalQuotes, timeframeFilter, dateSearchTerm, sortDirection]);

  // Helper to find nearest quote for outlier/plausibility check
  const getNearestPrice = (dateStr: string): number | null => {
    if (allChronologicalQuotes.length === 0) return null;
    let closestDiff = Infinity;
    let closestPrice: number | null = null;
    const targetTime = new Date(dateStr).getTime();

    for (const q of allChronologicalQuotes) {
      if (q.date === dateStr) return q.price;
      const diff = Math.abs(new Date(q.date).getTime() - targetTime);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestPrice = q.price;
      }
    }
    return closestPrice;
  };

  // Handle saving new quote from the top drawer
  const handleSaveNewQuote = async (force: boolean = false) => {
    if (!newQuoteDate || !/^\d{4}-\d{2}-\d{2}$/.test(newQuoteDate)) {
      setFeedback({ message: 'Seleziona una data valida (formato AAAA-MM-GG).', type: 'error' });
      return;
    }

    const parsedPrice = parseFloat(newQuotePrice.replace(',', '.'));
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      setFeedback({ message: 'Inserisci una quotazione numerica maggiore di zero.', type: 'error' });
      return;
    }

    // Outlier sanity check
    const nearest = getNearestPrice(newQuoteDate);
    if (nearest && nearest > 0 && !force && !addWarningDismissed) {
      const diffPct = Math.abs((parsedPrice - nearest) / nearest) * 100;
      if (diffPct >= 50) {
        setAddWarningDetails({
          message: `La quotazione inserita (${parsedPrice.toFixed(4)} ${currency}) differisce del ${diffPct >= 100 ? `+${diffPct.toFixed(0)}%` : `${diffPct.toFixed(0)}%`} rispetto alla quotazione più vicina registrata (${nearest.toFixed(4)} ${currency}).`,
          diffPct
        });
        return;
      }
    }

    try {
      await onUpdateQuote(activeSymbol, newQuoteDate, parsedPrice);
      setFeedback({
        message: `Quotazione del ${newQuoteDate} salvata con successo (${parsedPrice.toFixed(4)} ${currency})!`,
        type: 'success'
      });
      setNewQuotePrice('');
      setAddWarningDetails(null);
      setAddWarningDismissed(false);
      setIsAddFormOpen(false);
    } catch (err: any) {
      setFeedback({ message: `Errore durante il salvataggio: ${err.message || 'Errore sconosciuto'}`, type: 'error' });
    }
  };

  // Handle saving inline edited row
  const handleSaveInlineEdit = async (date: string, force: boolean = false) => {
    const parsedPrice = parseFloat(editPriceInput.replace(',', '.'));
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      setFeedback({ message: 'Inserisci un valore valido maggiore di zero.', type: 'error' });
      return;
    }

    const currentPrice = quotesMap[date];
    if (currentPrice && currentPrice > 0 && !force) {
      const diffPct = Math.abs((parsedPrice - currentPrice) / currentPrice) * 100;
      if (diffPct >= 50) {
        setInlineWarningDetails({
          date,
          message: `Attenzione: variazione del ${diffPct >= 100 ? `+${diffPct.toFixed(0)}%` : `${diffPct.toFixed(0)}%`} rispetto al valore precedente (${currentPrice.toFixed(4)} → ${parsedPrice.toFixed(4)} ${currency}).`
        });
        return;
      }
    }

    try {
      await onUpdateQuote(activeSymbol, date, parsedPrice);
      setFeedback({
        message: `Quotazione del ${date} aggiornata a ${parsedPrice.toFixed(4)} ${currency}!`,
        type: 'success'
      });
      setEditingDate(null);
      setEditPriceInput('');
      setInlineWarningDetails(null);
    } catch (err: any) {
      setFeedback({ message: `Errore durante l'aggiornamento: ${err.message || 'Errore'}`, type: 'error' });
    }
  };

  // Handle deleting single quote
  const handleConfirmDelete = async (date: string) => {
    try {
      await onDeleteQuote(activeSymbol, date);
      setFeedback({
        message: `Quotazione del ${date} rimossa con successo.`,
        type: 'success'
      });
      setDeleteConfirmDate(null);
    } catch (err: any) {
      setFeedback({ message: `Errore durante l'eliminazione: ${err.message || 'Errore'}`, type: 'error' });
    }
  };

  // Trigger provider refresh
  const handleSyncProvider = async () => {
    if (!onSyncTickerPrices) return;
    setIsSyncing(true);
    setFeedback({ message: `Sincronizzazione quotazioni per ${activeSymbol} in corso...`, type: 'info' });
    try {
      await onSyncTickerPrices(activeSymbol);
      setFeedback({ message: `Quotazioni per ${activeSymbol} aggiornate con successo!`, type: 'success' });
    } catch (err: any) {
      setFeedback({ message: `Errore aggiornamento: ${err.message || 'Errore'}`, type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  // Export quotes to clipboard as CSV/TSV
  const handleCopyQuotesCSV = () => {
    if (allChronologicalQuotes.length === 0) return;
    const lines = ['Data,Quotazione,Valuta'];
    allChronologicalQuotes.forEach(q => {
      lines.push(`${q.date},${q.price},${currency}`);
    });
    const csvContent = lines.join('\n');
    navigator.clipboard.writeText(csvContent).then(() => {
      setCopiedCsv(true);
      setTimeout(() => setCopiedCsv(false), 3000);
      setFeedback({ message: `Storico di ${allChronologicalQuotes.length} quotazioni copiato negli appunti (CSV)!`, type: 'success' });
    });
  };

  // Format localized date with weekday for cognitive clarity
  const formatLocalizedDateWithWeekday = (dateStr: string) => {
    try {
      const [year, month, day] = dateStr.split('-').map(Number);
      const dateObj = new Date(year, month - 1, day);
      return dateObj.toLocaleDateString(lang === 'it' ? 'it-IT' : lang === 'es' ? 'es-ES' : lang === 'fr' ? 'fr-FR' : 'en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const tickerConfig = useMemo(() => {
    return (tickerConfigs && activeSymbol ? (tickerConfigs[activeSymbol] || tickerConfigs[activeSymbol.toUpperCase()]) : undefined) || {};
  }, [tickerConfigs, activeSymbol]);
  const currentSource: QuoteSource = tickerConfig.source || 'yahoo';

  // Filtered list of symbols for the picker
  const filteredSymbolsList = useMemo(() => {
    if (!tickerSelectorSearch.trim()) return availableSymbols;
    const term = tickerSelectorSearch.trim().toLowerCase();
    return availableSymbols.filter(s => {
      const sym = s.toLowerCase();
      const conf = (tickerConfigs ? (tickerConfigs[s] || tickerConfigs[s.toUpperCase()]) : undefined) || {};
      const isin = (conf.isin || '').toLowerCase();
      const instId = conf.instrumentId ? String(conf.instrumentId) : '';
      return sym.includes(term) || isin.includes(term) || instId.includes(term);
    });
  }, [availableSymbols, tickerSelectorSearch, tickerConfigs]);

  return (
    <div className="space-y-6">
      {/* Visual Feedback Toast */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-3 shadow-lg animate-fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
              : feedback.type === 'error'
              ? 'bg-rose-950/40 border-rose-500/30 text-rose-300'
              : 'bg-sky-950/40 border-sky-500/30 text-sky-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
            {feedback.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />}
            {feedback.type === 'info' && <Info className="w-4 h-4 text-sky-400 shrink-0" />}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* TOP ERGONOMIC BAR: Master Instrument Selector & Quick Actions */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Active Symbol Display & Fast Picker */}
          <div className="flex items-center gap-3 flex-wrap flex-1 min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl font-black font-mono text-sm">
                {activeSymbol.slice(0, 3)}
              </span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg font-black text-white tracking-tight">{activeSymbol}</span>
                  {tickerConfig.isin && (
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800 text-sky-400">
                      ISIN: {tickerConfig.isin}
                    </span>
                  )}
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg border ${
                      currentSource === 'ls'
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    }`}
                  >
                    {currentSource === 'ls' ? `Lang & Schwarz${tickerConfig.instrumentId ? ` (#${tickerConfig.instrumentId})` : ''}` : 'Yahoo Finance'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Verifica puntuale dello storico prezzi salvato nel database locale e modifica manuale
                </p>
              </div>
            </div>

            {/* Quick Symbol Switcher Dropdown */}
            {availableSymbols.length > 1 && onSelectSymbol && (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-[11px] text-slate-500 font-medium">Cambia strumento:</span>
                <select
                  value={activeSymbol}
                  onChange={(e) => onSelectSymbol(e.target.value)}
                  className="bg-slate-900 border border-slate-800 text-white text-xs font-bold py-1.5 px-3 rounded-xl focus:outline-none focus:border-emerald-500 cursor-pointer font-mono"
                >
                  {filteredSymbolsList.map((sym) => {
                    const c = tickerConfigs[sym];
                    return (
                      <option key={sym} value={sym}>
                        {sym} {c?.isin ? `(${c.isin})` : ''} - {c?.source === 'ls' ? 'L&S' : 'Yahoo'}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {onSwitchToTickerConfig && (
              <button
                type="button"
                onClick={() => onSwitchToTickerConfig(activeSymbol)}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white border border-slate-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                title="Configura ISIN o Fonte per questo strumento"
              >
                <Sliders className="w-3.5 h-3.5 text-slate-400" />
                <span>Configura</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleCopyQuotesCSV}
              disabled={allChronologicalQuotes.length === 0}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white border border-slate-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Copia storico in formato CSV negli appunti"
            >
              {copiedCsv ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />}
              <span>{copiedCsv ? 'Copiato!' : 'Esporta CSV'}</span>
            </button>

            {onSyncTickerPrices && (
              <button
                type="button"
                onClick={handleSyncProvider}
                disabled={isSyncing}
                className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Ricarica dal provider (Yahoo o Lang & Schwarz)"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>Rinfresca da Provider</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setIsAddFormOpen(!isAddFormOpen);
                setAddWarningDetails(null);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md ${
                isAddFormOpen
                  ? 'bg-slate-800 text-white border border-slate-700'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40'
              }`}
            >
              {isAddFormOpen ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              <span>{isAddFormOpen ? 'Chiudi Inserimento' : 'Aggiungi / Modifica Data'}</span>
            </button>
          </div>
        </div>

        {/* STATS STRIP: Overview of cached quotes */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 border-t border-slate-800/80">
          <div className="bg-slate-900/60 border border-slate-800/70 p-2.5 rounded-xl">
            <span className="text-[10px] text-slate-500 uppercase font-mono tracking-wider block">Ultima Quotazione</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-sm font-black text-white font-mono">
                {stats.latestPrice !== null ? `${stats.latestPrice.toFixed(4)} ${currency}` : '---'}
              </span>
              {stats.latestChangePct !== null && stats.latestChangePct !== undefined && (
                <span className={`text-[10px] font-bold font-mono ${stats.latestChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {stats.latestChangePct >= 0 ? '+' : ''}{stats.latestChangePct.toFixed(2)}%
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              {stats.latestDate ? formatDateString(stats.latestDate, lang) : 'Nessun dato'}
            </span>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/70 p-2.5 rounded-xl">
            <span className="text-[10px] text-slate-500 uppercase font-mono tracking-wider block">Date Registrate</span>
            <span className="text-sm font-black text-white font-mono block mt-0.5">
              {stats.totalCount} {stats.totalCount === 1 ? 'giorno' : 'giorni'}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              {stats.firstDate ? `dal ${formatDateString(stats.firstDate, lang)}` : 'Nessuno storico'}
            </span>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/70 p-2.5 rounded-xl">
            <span className="text-[10px] text-slate-500 uppercase font-mono tracking-wider block">Minimo Storico</span>
            <span className="text-sm font-black text-white font-mono block mt-0.5">
              {stats.minPrice !== null ? `${stats.minPrice.toFixed(4)} ${currency}` : '---'}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">Nel perimetro salvato</span>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/70 p-2.5 rounded-xl">
            <span className="text-[10px] text-slate-500 uppercase font-mono tracking-wider block">Massimo Storico</span>
            <span className="text-sm font-black text-white font-mono block mt-0.5">
              {stats.maxPrice !== null ? `${stats.maxPrice.toFixed(4)} ${currency}` : '---'}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">Nel perimetro salvato</span>
          </div>
        </div>
      </div>

      {/* DRAWER: ADD / OVERRIDE SINGLE QUOTE */}
      {isAddFormOpen && (
        <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-emerald-500/30 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4 animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
                <Edit2 className="w-4 h-4" />
              </span>
              <div>
                <h4 className="text-xs sm:text-sm font-black text-white">
                  Inserisci o Aggiorna Manualmente una Quotazione per {activeSymbol}
                </h4>
                <p className="text-[11px] text-slate-400">
                  Puoi aggiungere una data mancante oppure correggere una quotazione errata. L'aggiornamento viene salvato immediatamente nel database.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsAddFormOpen(false)}
              className="text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Outlier Typo Warning Banner */}
          {addWarningDetails && (
            <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs space-y-2 animate-fade-in">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-amber-200">Verifica di Plausibilità (Prevenzione Errori di Battitura)</p>
                  <p className="text-slate-300 leading-relaxed">{addWarningDetails.message}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1 justify-end">
                <button
                  type="button"
                  onClick={() => setAddWarningDetails(null)}
                  className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-bold rounded-lg border border-slate-700 transition cursor-pointer"
                >
                  Correggi Prezzo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddWarningDismissed(true);
                    handleSaveNewQuote(true);
                  }}
                  className="px-3.5 py-1 bg-amber-600 hover:bg-amber-500 text-white text-xs font-black rounded-lg transition shadow-sm cursor-pointer"
                >
                  Sì, Confermo e Salva
                </button>
              </div>
            </div>
          )}

          {/* Input Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                Data Quotazione (AAAA-MM-GG)
              </label>
              <div className="relative">
                <input
                  type="date"
                  max={todayStr}
                  value={newQuoteDate}
                  onChange={(e) => {
                    setNewQuoteDate(e.target.value);
                    setAddWarningDetails(null);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                Quotazione ({currency})
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min="0.000001"
                  placeholder="es. 124.50"
                  value={newQuotePrice}
                  onChange={(e) => {
                    setNewQuotePrice(e.target.value);
                    setAddWarningDetails(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveNewQuote();
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleSaveNewQuote()}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-950/30 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Salva Quotazione</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FILTER & TIMEFRAME TOOLBAR */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-950/40 p-3 rounded-2xl border border-slate-800/80">
        {/* Preset Timeframe Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-bold text-slate-500 mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3" />
            <span>Filtra:</span>
          </span>

          <button
            type="button"
            onClick={() => setTimeframeFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
              timeframeFilter === 'ALL'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-white bg-slate-900 border border-slate-800'
            }`}
          >
            Tutte ({allChronologicalQuotes.length})
          </button>

          <button
            type="button"
            onClick={() => setTimeframeFilter('30D')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
              timeframeFilter === '30D'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-white bg-slate-900 border border-slate-800'
            }`}
          >
            Ultimi 30 gg
          </button>

          <button
            type="button"
            onClick={() => setTimeframeFilter('90D')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
              timeframeFilter === '90D'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-white bg-slate-900 border border-slate-800'
            }`}
          >
            Ultimi 90 gg
          </button>

          <button
            type="button"
            onClick={() => setTimeframeFilter('THIS_YEAR')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
              timeframeFilter === 'THIS_YEAR'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-white bg-slate-900 border border-slate-800'
            }`}
          >
            {new Date().getFullYear()}
          </button>

          <button
            type="button"
            onClick={() => setTimeframeFilter('PREV_YEAR')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
              timeframeFilter === 'PREV_YEAR'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-white bg-slate-900 border border-slate-800'
            }`}
          >
            {new Date().getFullYear() - 1}
          </button>
        </div>

        {/* Date Search Term & Sort Direction */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-48">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cerca data (es. 2026-10)..."
              value={dateSearchTerm}
              onChange={(e) => setDateSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
            />
            {dateSearchTerm && (
              <button
                type="button"
                onClick={() => setDateSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc')}
            className="p-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition cursor-pointer shrink-0"
            title={sortDirection === 'desc' ? 'Ordina: Più recenti prima' : 'Ordina: Più vecchi prima'}
          >
            <ArrowUpDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* QUOTES DATA TABLE */}
      {filteredQuotes.length === 0 ? (
        <div className="text-center py-12 px-4 bg-slate-950/40 border border-slate-800/80 rounded-2xl space-y-3">
          <Calendar className="w-10 h-10 text-slate-600 mx-auto" />
          <h4 className="text-sm font-bold text-slate-300">
            Nessuna quotazione trovata per i criteri selezionati
          </h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            {allChronologicalQuotes.length === 0
              ? `Il database locale non contiene ancora quotazioni memorizzate per ${activeSymbol}. Usa il pulsante "Rinfresca da Provider" o aggiungile manualmente con "Aggiungi Data".`
              : 'Prova a modificare o azzerare i filtri temporali per visualizzare tutte le quotazioni salvate.'}
          </p>
          {allChronologicalQuotes.length === 0 && onSyncTickerPrices && (
            <button
              type="button"
              onClick={handleSyncProvider}
              disabled={isSyncing}
              className="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-md cursor-pointer"
            >
              Recupera Quotazioni Adesso
            </button>
          )}
        </div>
      ) : (
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
          <div className="max-h-[550px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-900/90 text-slate-400 uppercase font-mono text-[10px] tracking-wider sticky top-0 z-10 backdrop-blur-md border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-4 font-bold">Data</th>
                  <th className="py-2.5 px-4 font-bold text-right">Quotazione ({currency})</th>
                  <th className="py-2.5 px-4 font-bold text-right">Var. Giorno Prima</th>
                  <th className="py-2.5 px-4 font-bold text-center">Stato</th>
                  <th className="py-2.5 px-4 font-bold text-right w-24">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {filteredQuotes.map((q) => {
                  const isEditing = editingDate === q.date;
                  const isDeleting = deleteConfirmDate === q.date;
                  const hasInlineWarning = inlineWarningDetails?.date === q.date;

                  return (
                    <React.Fragment key={q.date}>
                      <tr
                        className={`hover:bg-slate-850/50 transition-colors ${
                          isEditing ? 'bg-slate-850/80' : isDeleting ? 'bg-rose-950/20' : ''
                        }`}
                      >
                        {/* Data Column */}
                        <td className="py-2.5 px-4">
                          <div className="flex flex-col">
                            <span className="font-bold text-white tracking-wide">{q.date}</span>
                            <span className="text-[10px] text-slate-500 font-sans">
                              {formatLocalizedDateWithWeekday(q.date)}
                            </span>
                          </div>
                        </td>

                        {/* Quotazione Column */}
                        <td className="py-2.5 px-4 text-right">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <input
                                type="number"
                                step="any"
                                min="0.000001"
                                autoFocus
                                value={editPriceInput}
                                onChange={(e) => {
                                  setEditPriceInput(e.target.value);
                                  setInlineWarningDetails(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleSaveInlineEdit(q.date);
                                  } else if (e.key === 'Escape') {
                                    setEditingDate(null);
                                    setInlineWarningDetails(null);
                                  }
                                }}
                                className="w-28 bg-slate-950 border border-emerald-500 rounded-lg px-2 py-1 text-xs text-white font-mono font-bold text-right focus:outline-none"
                              />
                            </div>
                          ) : (
                            <span className="font-bold text-slate-200 text-sm">
                              {q.price.toFixed(4)}
                            </span>
                          )}
                        </td>

                        {/* Daily Change Column */}
                        <td className="py-2.5 px-4 text-right">
                          {q.dailyChangePct !== undefined && q.dailyChangePct !== null ? (
                            <div className="flex items-center justify-end gap-1">
                              <span
                                className={`font-bold flex items-center gap-0.5 ${
                                  q.dailyChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {q.dailyChangePct >= 0 ? (
                                  <TrendingUp className="w-3 h-3 shrink-0" />
                                ) : (
                                  <TrendingDown className="w-3 h-3 shrink-0" />
                                )}
                                {q.dailyChangePct >= 0 ? '+' : ''}{q.dailyChangePct.toFixed(2)}%
                              </span>
                              {q.isOutlier && (
                                <span
                                  className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                  title="Forte variazione percentuale rispetto al giorno precedente: verifica che il dato sia corretto"
                                >
                                  ⚠️
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>

                        {/* Status Column */}
                        <td className="py-2.5 px-4 text-center">
                          {q.date === todayStr ? (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              Oggi (Intraday)
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-500 font-sans">
                              Chiusura
                            </span>
                          )}
                        </td>

                        {/* Actions Column */}
                        <td className="py-2.5 px-4 text-right">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => handleSaveInlineEdit(q.date)}
                                className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer"
                                title="Salva Modifica (Enter)"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingDate(null);
                                  setInlineWarningDetails(null);
                                }}
                                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                                title="Annulla (Esc)"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : isDeleting ? (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => handleConfirmDelete(q.date)}
                                className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold transition cursor-pointer"
                                title="Conferma eliminazione"
                              >
                                Elimina
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmDate(null)}
                                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 transition cursor-pointer"
                                title="Annulla"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingDate(q.date);
                                  setEditPriceInput(q.price.toString());
                                  setInlineWarningDetails(null);
                                  setDeleteConfirmDate(null);
                                }}
                                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                                title="Modifica quotazione"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteConfirmDate(q.date);
                                  setEditingDate(null);
                                }}
                                className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition cursor-pointer"
                                title="Rimuovi quotazione"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>

                      {/* Warning row if inline edit has outlier diff */}
                      {hasInlineWarning && (
                        <tr className="bg-amber-950/30 border-b border-amber-500/30">
                          <td colSpan={5} className="py-2 px-4 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-amber-300 font-sans font-medium">
                                ⚠️ {inlineWarningDetails?.message}
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleSaveInlineEdit(q.date, true)}
                                  className="px-2.5 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-black cursor-pointer"
                                >
                                  Conferma e Salva
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setInlineWarningDetails(null)}
                                  className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] cursor-pointer"
                                >
                                  Annulla
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table Footer Summary */}
          <div className="bg-slate-900/80 px-4 py-2.5 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>
              Mostrando <strong className="text-white font-mono">{filteredQuotes.length}</strong> di{' '}
              <strong className="text-white font-mono">{allChronologicalQuotes.length}</strong> quotazioni registrate per{' '}
              <strong className="text-white font-mono">{activeSymbol}</strong>
            </span>
            <span className="text-[11px] text-slate-500 hidden sm:inline">
              Fai clic su <Edit2 className="w-3 h-3 inline mx-0.5 text-slate-400" /> per modificare istantaneamente qualsiasi valore
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
