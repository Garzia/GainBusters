/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Layers,
  Plus,
  Trash2,
  Edit2,
  X,
  Check,
  Sparkles,
  AlertCircle,
  Info,
  Tag,
  Search,
  Globe,
  RefreshCw,
  CheckCircle2,
  Settings,
  Sliders,
  Calendar
} from 'lucide-react';
import { InstrumentGroup, LanguagePhrases, Transaction, TickerConfig, QuoteSource } from '../types.ts';
import { searchLangSchwarzInstrument, fetchLangSchwarzPrices } from '../utils/syncPrices.ts';
import { QuotesHistoryViewer } from './QuotesHistoryViewer.tsx';

interface InstrumentGroupsModalProps {
  isOpen: boolean;
  onClose: () => void;
  groups?: InstrumentGroup[];
  tickerConfigs?: { [symbol: string]: TickerConfig };
  priceCache?: { [ticker: string]: { [date: string]: number } };
  availableSymbols?: string[];
  allTransactions?: Transaction[];
  initialSelectedSymbol?: string;
  initialTab?: 'tickers' | 'groups' | 'quotes';
  onSaveGroup: (group: InstrumentGroup) => void;
  onDeleteGroup: (groupId: string) => void;
  onSaveTickerConfig?: (symbol: string, config: TickerConfig) => Promise<void>;
  onSyncTickerPrices?: (symbol: string) => Promise<void>;
  onUpdateQuote?: (symbol: string, date: string, price: number) => Promise<void> | void;
  onDeleteQuote?: (symbol: string, date: string) => Promise<void> | void;
  t: LanguagePhrases;
  lang?: string;
  currency?: string;
}

export const InstrumentGroupsModal: React.FC<InstrumentGroupsModalProps> = ({
  isOpen,
  onClose,
  groups = [],
  tickerConfigs = {},
  priceCache = {},
  availableSymbols: providedSymbols,
  allTransactions = [],
  initialSelectedSymbol,
  initialTab = 'tickers',
  onSaveGroup,
  onDeleteGroup,
  onSaveTickerConfig,
  onSyncTickerPrices,
  onUpdateQuote,
  onDeleteQuote,
  t,
  lang = 'it',
  currency = 'EUR'
}) => {
  // Modal active tab: 'tickers' (ISIN and Quote Source), 'quotes' (Historical inspector & manual edits) or 'groups' (Multi-Exchange grouping)
  const [activeTab, setActiveTab] = useState<'tickers' | 'groups' | 'quotes'>('tickers');

  // Multi-Exchange Groups states
  const [editingGroup, setEditingGroup] = useState<InstrumentGroup | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [customSymbolInput, setCustomSymbolInput] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [deleteConfirmGroupId, setDeleteConfirmGroupId] = useState<string | null>(null);

  // Ticker Configuration states
  const [tickerSearchTerm, setTickerSearchTerm] = useState('');
  const [selectedTickerSymbol, setSelectedTickerSymbol] = useState<string>('');
  const [editIsin, setEditIsin] = useState<string>('');
  const [editSource, setEditSource] = useState<QuoteSource>('yahoo');
  const [isManualAddingTicker, setIsManualAddingTicker] = useState(false);
  const [newManualTickerInput, setNewManualTickerInput] = useState('');
  const [tickerFeedback, setTickerFeedback] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isTestingOrSyncing, setIsTestingOrSyncing] = useState(false);
  const [isSavingTicker, setIsSavingTicker] = useState(false);

  const safeGroups = groups || [];

  // Union of all available tickers from transactions, groups, providedSymbols, and tickerConfigs
  const allSymbols = useMemo(() => {
    const symbolSet = new Set<string>();

    if (providedSymbols && Array.isArray(providedSymbols)) {
      providedSymbols.forEach(s => s && symbolSet.add(s.toUpperCase().trim()));
    }
    if (allTransactions && Array.isArray(allTransactions)) {
      allTransactions.forEach(tx => tx?.symbol && symbolSet.add(tx.symbol.toUpperCase().trim()));
    }
    if (safeGroups && Array.isArray(safeGroups)) {
      safeGroups.forEach(g => (g?.tickerSymbols || []).forEach(s => s && symbolSet.add(s.toUpperCase().trim())));
    }
    if (tickerConfigs && typeof tickerConfigs === 'object') {
      Object.keys(tickerConfigs).forEach(sym => sym && symbolSet.add(sym.toUpperCase().trim()));
    }

    return Array.from(symbolSet).filter(Boolean).sort();
  }, [providedSymbols, allTransactions, safeGroups, tickerConfigs]);

  // Helper for case-insensitive, trimmed ticker configuration lookup
  const getConfForSymbol = useCallback((sym: string | undefined): TickerConfig => {
    return (sym && tickerConfigs ? (tickerConfigs[sym] || tickerConfigs[sym.toUpperCase()]) : undefined) || {};
  }, [tickerConfigs]);

  // Sync initial selections whenever modal opens or tickerConfigs change
  useEffect(() => {
    if (isOpen) {
      if (initialTab) {
        setActiveTab(initialTab);
      }
      const targetSym = (initialSelectedSymbol || selectedTickerSymbol || (allSymbols.length > 0 ? allSymbols[0] : '')).toUpperCase().trim();
      if (targetSym) {
        setSelectedTickerSymbol(targetSym);
        const existingConf = getConfForSymbol(targetSym);
        setEditIsin(existingConf.isin || '');
        setEditSource(existingConf.source || 'yahoo');
      }
      setTickerFeedback(null);
    }
  }, [isOpen, initialTab, initialSelectedSymbol, tickerConfigs, getConfForSymbol]);

  // When a ticker is selected in the list, load its current configuration
  const handleSelectTicker = (symbol: string) => {
    const sym = symbol.toUpperCase().trim();
    setSelectedTickerSymbol(sym);
    const conf = getConfForSymbol(sym);
    setEditIsin(conf.isin || '');
    setEditSource(conf.source || 'yahoo');
    setTickerFeedback(null);
  };

  // Save ticker configuration
  const handleSaveTicker = async (targetSym?: string) => {
    const sym = (targetSym || selectedTickerSymbol).toUpperCase().trim();
    if (!sym) return;

    const cleanIsin = editIsin.trim().toUpperCase();

    // If Lang & Schwarz is selected, ISIN is strictly required and validated
    if (editSource === 'ls') {
      if (!cleanIsin) {
        setTickerFeedback({
          message: t.isinRequiredForLS || "L'ISIN è obbligatorio per utilizzare Lang & Schwarz come fonte di quotazione.",
          type: 'error'
        });
        return;
      }
      if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(cleanIsin)) {
        setTickerFeedback({
          message: `Formato ISIN non valido: "${cleanIsin}". Deve essere composto da 12 caratteri (es. IE00BK5BQT80).`,
          type: 'error'
        });
        return;
      }
    }

    setIsSavingTicker(true);
    setTickerFeedback(null);

    try {
      let resolvedInstrumentId: number | undefined = undefined;

      if (editSource === 'ls') {
        const existingConf = getConfForSymbol(sym);
        if (existingConf?.isin === cleanIsin && existingConf?.instrumentId) {
          resolvedInstrumentId = existingConf.instrumentId;
        } else {
          // Resolve instrumentId from L&S search once during configuration save
          const searchResult = await searchLangSchwarzInstrument(cleanIsin);
          resolvedInstrumentId = searchResult.instrumentId;
        }
      }

      const configToSave: TickerConfig = {
        isin: cleanIsin || undefined,
        source: editSource,
        instrumentId: editSource === 'ls' ? resolvedInstrumentId : undefined
      };

      if (onSaveTickerConfig) {
        await onSaveTickerConfig(sym, configToSave);
      }

      setTickerFeedback({
        message: `Configurazione salvata con successo per ${sym} (Fonte: ${editSource === 'ls' ? `Lang & Schwarz - ID #${resolvedInstrumentId}` : 'Yahoo Finance'}).`,
        type: 'success'
      });
    } catch (err: any) {
      setTickerFeedback({
        message: `Errore durante il salvataggio: ${err.message || 'Errore sconosciuto'}`,
        type: 'error'
      });
    } finally {
      setIsSavingTicker(false);
    }
  };

  // Test and fetch Lang & Schwarz quotes immediately
  const handleTestAndSync = async () => {
    const sym = selectedTickerSymbol.toUpperCase().trim();
    if (!sym) return;

    const cleanIsin = editIsin.trim().toUpperCase();

    if (editSource === 'ls') {
      if (!cleanIsin) {
        setTickerFeedback({
          message: t.isinRequiredForLS || "L'ISIN è obbligatorio per Lang & Schwarz.",
          type: 'error'
        });
        return;
      }
      if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(cleanIsin)) {
        setTickerFeedback({
          message: `Formato ISIN non valido: "${cleanIsin}". Deve contenere 12 caratteri.`,
          type: 'error'
        });
        return;
      }

      setIsTestingOrSyncing(true);
      setTickerFeedback({ message: `Ricerca strumento e storico per ISIN ${cleanIsin} su Lang & Schwarz...`, type: 'info' });

      try {
        const existingConf = getConfForSymbol(sym);
        const knownId = existingConf?.isin === cleanIsin ? existingConf?.instrumentId : undefined;
        const result = await fetchLangSchwarzPrices(sym, cleanIsin, knownId);
        const quotesCount = Object.keys(result.prices).length;
        const resolvedId = result.instrumentInfo.instrumentId;

        // Auto-save the validated configuration with its instrumentId
        if (onSaveTickerConfig) {
          await onSaveTickerConfig(sym, { isin: cleanIsin, source: 'ls', instrumentId: resolvedId });
        }

        if (onSyncTickerPrices) {
          await onSyncTickerPrices(sym);
        }

        setTickerFeedback({
          message: `Strumento identificato: ID #${resolvedId} (${result.instrumentInfo.displayname || sym}). Recuperate ${quotesCount} quotazioni con successo!`,
          type: 'success'
        });
      } catch (err: any) {
        setTickerFeedback({
          message: `Verifica fallita: ${err.message || 'Nessun dato recuperato'}. Le quotazioni esistenti sono state preservate.`,
          type: 'error'
        });
      } finally {
        setIsTestingOrSyncing(false);
      }
    } else {
      // Yahoo Finance sync
      setIsTestingOrSyncing(true);
      setTickerFeedback({ message: `Aggiornamento quotazioni per ${sym} da Yahoo Finance...`, type: 'info' });
      try {
        if (onSaveTickerConfig) {
          await onSaveTickerConfig(sym, { isin: cleanIsin || undefined, source: 'yahoo' });
        }
        if (onSyncTickerPrices) {
          await onSyncTickerPrices(sym);
        }
        setTickerFeedback({
          message: `Quotazioni di ${sym} aggiornate con successo da Yahoo Finance.`,
          type: 'success'
        });
      } catch (err: any) {
        setTickerFeedback({
          message: `Errore recupero quotazioni: ${err.message || err}`,
          type: 'error'
        });
      } finally {
        setIsTestingOrSyncing(false);
      }
    }
  };

  // Add custom ticker manually
  const handleAddManualTicker = () => {
    const cleanSym = newManualTickerInput.trim().toUpperCase();
    if (!cleanSym) return;

    if (!allSymbols.includes(cleanSym)) {
      allSymbols.push(cleanSym);
      allSymbols.sort();
    }
    setSelectedTickerSymbol(cleanSym);
    setEditIsin('');
    setEditSource('yahoo');
    setNewManualTickerInput('');
    setIsManualAddingTicker(false);
    setTickerFeedback({
      message: `Nuovo strumento "${cleanSym}" aggiunto. Configura l'ISIN o la fonte e salva.`,
      type: 'info'
    });
  };

  if (!isOpen) return null;

  // Multi-exchange Auto-detection logic: group symbols that share a base prefix
  const getAutoDetectableGroups = () => {
    const prefixMap: { [prefix: string]: string[] } = {};
    const existingGroupedSymbols = new Set(
      safeGroups.flatMap(g => (g?.tickerSymbols || []).map(s => (s || '').toUpperCase().trim())).filter(Boolean)
    );

    (allSymbols || []).forEach(sym => {
      const upper = (sym || '').toUpperCase().trim();
      if (!upper) return;
      const dotIndex = upper.indexOf('.');
      const prefix = dotIndex > 0 ? upper.substring(0, dotIndex) : upper;
      if (!prefixMap[prefix]) {
        prefixMap[prefix] = [];
      }
      if (!prefixMap[prefix].includes(upper)) {
        prefixMap[prefix].push(upper);
      }
    });

    const candidates: { prefix: string; symbols: string[]; defaultName: string }[] = [];
    Object.keys(prefixMap).forEach(prefix => {
      const syms = prefixMap[prefix];
      if (syms.length >= 2) {
        const hasUngrouped = syms.some(s => !existingGroupedSymbols.has(s));
        if (hasUngrouped) {
          candidates.push({
            prefix,
            symbols: syms,
            defaultName: `${prefix} (Multi-Borsa)`
          });
        }
      }
    });
    return candidates;
  };

  const detectedCandidates = getAutoDetectableGroups();

  const handleStartCreateGroup = () => {
    setEditingGroup(null);
    setIsCreatingNew(true);
    setGroupName('');
    setSelectedSymbols([]);
    setCustomSymbolInput('');
    setNotes('');
    setErrorMessage('');
  };

  const handleStartEditGroup = (g: InstrumentGroup) => {
    setEditingGroup(g);
    setIsCreatingNew(false);
    setGroupName(g.name);
    setSelectedSymbols([...g.tickerSymbols]);
    setCustomSymbolInput('');
    setNotes(g.notes || '');
    setErrorMessage('');
  };

  const handleCancelEditGroup = () => {
    setEditingGroup(null);
    setIsCreatingNew(false);
    setGroupName('');
    setSelectedSymbols([]);
    setCustomSymbolInput('');
    setNotes('');
    setErrorMessage('');
  };

  const handleToggleSymbolInGroup = (sym: string) => {
    const upper = sym.toUpperCase().trim();
    if (selectedSymbols.includes(upper)) {
      setSelectedSymbols(selectedSymbols.filter(s => s !== upper));
    } else {
      setSelectedSymbols([...selectedSymbols, upper]);
    }
  };

  const handleAddCustomSymbolToGroup = () => {
    const trimmed = customSymbolInput.toUpperCase().trim();
    if (!trimmed) return;
    if (!selectedSymbols.includes(trimmed)) {
      setSelectedSymbols([...selectedSymbols, trimmed]);
    }
    setCustomSymbolInput('');
  };

  const handleSaveGroup = () => {
    if (!groupName.trim()) {
      setErrorMessage('Inserisci un nome descrittivo per lo strumento aggregato.');
      return;
    }
    if (selectedSymbols.length === 0) {
      setErrorMessage('Seleziona almeno un ticker per questo raggruppamento.');
      return;
    }

    const groupToSave: InstrumentGroup = {
      id: editingGroup ? editingGroup.id : `grp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: groupName.trim(),
      tickerSymbols: selectedSymbols.map(s => s.toUpperCase().trim()),
      notes: notes.trim() ? notes.trim() : undefined
    };

    onSaveGroup(groupToSave);
    handleCancelEditGroup();
  };

  const handleApplyCandidate = (candidate: { prefix: string; symbols: string[]; defaultName: string }) => {
    const newGroup: InstrumentGroup = {
      id: `grp_${candidate.prefix.toLowerCase()}_${Date.now()}`,
      name: candidate.defaultName,
      tickerSymbols: candidate.symbols,
      notes: `Raggruppamento automatico per ticker base ${candidate.prefix}`
    };
    onSaveGroup(newGroup);
  };

  const handleApplyAllCandidates = () => {
    detectedCandidates.forEach(cand => {
      handleApplyCandidate(cand);
    });
  };

  const filteredSymbols = allSymbols.filter(sym => {
    if (!tickerSearchTerm.trim()) return true;
    const term = tickerSearchTerm.trim().toLowerCase();
    const conf = tickerConfigs[sym];
    const isin = (conf?.isin || '').toLowerCase();
    return sym.toLowerCase().includes(term) || isin.includes(term);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white tracking-wide">
                {t.instrumentManagementTitle || 'Gestione Strumenti & Quotazioni'}
              </h2>
              <p className="text-xs text-slate-400">
                {t.instrumentManagementDesc || 'Configura ISIN e fonte quotazioni (Yahoo Finance o Lang & Schwarz) per ciascun ticker, e organizza i raggruppamenti multi-borsa.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector Header */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6 shrink-0 gap-6 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('tickers')}
            className={`py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'tickers'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>{t.tabTickerConfig || 'Configurazione Ticker (ISIN & Fonti)'}</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300 font-mono font-bold">
              {allSymbols.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('quotes')}
            className={`py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'quotes'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>{t.tabQuotesHistory || 'Registro & Storico Quotazioni'}</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300 font-mono font-bold">
              {selectedTickerSymbol && priceCache[selectedTickerSymbol] ? Object.keys(priceCache[selectedTickerSymbol]).length : Object.keys(priceCache).length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('groups')}
            className={`py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'groups'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>{t.tabGroups || 'Raggruppamenti Multi-Borsa'}</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300 font-mono font-bold">
              {safeGroups.length}
            </span>
          </button>
        </div>

        {/* Modal Main Content Area */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
          {activeTab === 'tickers' ? (
            /* ================= TAB 1: TICKER CONFIGURATION (ISIN & QUOTE SOURCE) ================= */
            <div className="space-y-6">
              {/* Informational Guidance Callout */}
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start gap-3">
                <Info className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-300 space-y-1">
                  <p className="font-semibold text-white">
                    {t.defaultSourceNotice || 'Yahoo Finance è la fonte predefinita per tutti gli strumenti, senza alcuna configurazione richiesta.'}
                  </p>
                  <p className="text-slate-400 leading-relaxed">
                    Puoi associare facoltativamente un codice <strong>ISIN</strong> a ciascun ticker e scegliere <strong>Lang & Schwarz</strong> come fonte alternativa per quello specifico strumento. Il recupero avverrà tramite ricerca per ISIN ed estrazione del book storico e intraday.
                  </p>
                </div>
              </div>

              {/* Feedback Alert if present */}
              {tickerFeedback && (
                <div
                  className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 animate-fade-in ${
                    tickerFeedback.type === 'success'
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                      : tickerFeedback.type === 'error'
                      ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                      : 'bg-sky-950/40 border-sky-500/40 text-sky-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {tickerFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                    ) : tickerFeedback.type === 'error' ? (
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    ) : (
                      <RefreshCw className="w-4 h-4 shrink-0 text-sky-400 animate-spin" />
                    )}
                    <span className="font-medium">{tickerFeedback.message}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTickerFeedback(null)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Grid Layout: Left column = Ticker list; Right column = Configuration Editor */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                {/* Left: Ticker Selector List (5 cols) */}
                <div className="md:col-span-5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-300 uppercase font-mono tracking-wider">
                      {t.allConfiguredTickers || 'Elenco Ticker'} ({allSymbols.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsManualAddingTicker(!isManualAddingTicker)}
                      className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{t.addTickerManualBtn || 'Nuovo Ticker'}</span>
                    </button>
                  </div>

                  {/* Manual add ticker input if open */}
                  {isManualAddingTicker && (
                    <div className="p-3 bg-slate-950 rounded-xl border border-emerald-500/30 space-y-2 animate-fade-in">
                      <label className="text-[11px] text-slate-300 font-semibold block">Simbolo Ticker (es. VWCE.MI, SWDA.MI)</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newManualTickerInput}
                          onChange={(e) => setNewManualTickerInput(e.target.value.toUpperCase())}
                          placeholder="es. XEON.MI"
                          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg text-xs px-2.5 py-1.5 text-white font-mono uppercase focus:outline-none focus:border-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={handleAddManualTicker}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition cursor-pointer"
                        >
                          Aggiungi
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Search filter for tickers */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={tickerSearchTerm}
                      onChange={(e) => setTickerSearchTerm(e.target.value)}
                      placeholder="Cerca per ticker o ISIN..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/60 font-mono"
                    />
                  </div>

                  {/* Tickers List */}
                  <div className="max-h-[380px] overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                    {filteredSymbols.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500 italic bg-slate-950/40 rounded-xl border border-slate-800/60">
                        Nessun ticker trovato
                      </div>
                    ) : (
                      filteredSymbols.map((sym) => {
                        const conf = getConfForSymbol(sym);
                        const isSelected = selectedTickerSymbol === sym;
                        const isLS = conf.source === 'ls';

                        return (
                          <button
                            key={sym}
                            type="button"
                            onClick={() => handleSelectTicker(sym)}
                            className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                              isSelected
                                ? 'bg-emerald-500/10 border-emerald-500/40 text-white shadow-sm'
                                : 'bg-slate-950/60 border-slate-800/80 text-slate-300 hover:bg-slate-900 hover:border-slate-700'
                            }`}
                          >
                            <div className="min-w-0">
                              <span className="font-mono font-bold text-xs text-white block truncate">
                                {sym}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono block truncate">
                                {conf.isin ? `ISIN: ${conf.isin}${conf.instrumentId ? ` (ID #${conf.instrumentId})` : ''}` : 'ISIN non impostato'}
                              </span>
                            </div>

                            <span
                              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border shrink-0 ${
                                isLS
                                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                  : 'bg-slate-800 text-slate-400 border-slate-700/60'
                              }`}
                            >
                              {isLS ? 'Lang & Schwarz' : 'Yahoo'}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Right: Configuration Editor for Selected Ticker (7 cols) */}
                <div className="md:col-span-7 bg-slate-950/70 border border-slate-800 rounded-2xl p-5 space-y-5 flex flex-col justify-between">
                  {selectedTickerSymbol ? (
                    <div className="space-y-5">
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                        <div>
                          <span className="text-[10px] text-slate-500 font-mono tracking-wider uppercase font-bold">
                            Configurazione Strumento
                          </span>
                          <h3 className="text-base font-black text-white font-mono flex items-center gap-2">
                            <span>{selectedTickerSymbol}</span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold border ${
                                editSource === 'ls'
                                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              }`}
                            >
                              {editSource === 'ls' ? 'Fonte: Lang & Schwarz' : 'Fonte: Yahoo Finance (Default)'}
                            </span>
                          </h3>
                        </div>
                      </div>

                      {/* Field 1: ISIN Code */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-200 block">
                          {t.isinLabel || 'Codice ISIN (International Securities Identification Number)'}
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={editIsin}
                            onChange={(e) => setEditIsin(e.target.value.toUpperCase().trim())}
                            maxLength={12}
                            placeholder={t.isinPlaceholder || 'es. IE00BK5BQT80'}
                            className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 text-white text-xs px-3 py-2 rounded-xl outline-none font-mono tracking-wider uppercase font-bold"
                          />
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Identificativo univoco a 12 caratteri dello strumento finanziario (es. <code>IE00BK5BQT80</code> per Vanguard FTSE All-World).
                        </p>
                      </div>

                      {/* Field 2: Quote Source Selector */}
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-200 block">
                          {t.quoteSourceLabel || 'Fonte delle Quotazioni'}
                        </label>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {/* Option A: Yahoo Finance */}
                          <div
                            onClick={() => setEditSource('yahoo')}
                            className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                              editSource === 'yahoo'
                                ? 'bg-emerald-500/10 border-emerald-500/40 text-white ring-1 ring-emerald-500/30'
                                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold font-mono">Yahoo Finance</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-emerald-400 font-semibold uppercase">
                                Predefinita
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 leading-tight">
                              Standard globale con quotazioni storiche e valutarie. Nessun ISIN obbligatorio.
                            </p>
                          </div>

                          {/* Option B: Lang & Schwarz */}
                          <div
                            onClick={() => setEditSource('ls')}
                            className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                              editSource === 'ls'
                                ? 'bg-amber-500/10 border-amber-500/40 text-white ring-1 ring-amber-500/30'
                                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold font-mono text-amber-300">Lang & Schwarz</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-400 font-semibold border border-amber-500/20 uppercase">
                                L&S (RPC)
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 leading-tight">
                              Quotazioni in tempo reale e storico ufficiale tramite ricerca ISIN.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Detailed info if Lang & Schwarz selected */}
                      {editSource === 'ls' && (
                        <div className="p-3 bg-amber-950/20 border border-amber-500/20 rounded-xl space-y-1.5 text-xs text-amber-200/90 animate-fade-in">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-1.5 font-bold text-amber-300 text-xs">
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Recupero da Lang & Schwarz attivo per {selectedTickerSymbol}</span>
                            </div>
                            {getConfForSymbol(selectedTickerSymbol)?.instrumentId && (
                              <span className="text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">
                                InstrumentID salvato: #{getConfForSymbol(selectedTickerSymbol)?.instrumentId}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-amber-300/80 leading-relaxed">
                            {getConfForSymbol(selectedTickerSymbol)?.instrumentId
                              ? "L'identificativo instrumentId è salvato nel DB: il rinfresco delle quotazioni viene eseguito direttamente con una sola chiamata rapida per intraday e storico."
                              : "Al salvataggio o verifica, l'ISIN verrà cercato una sola volta per recuperare e memorizzare in modo permanente l'instrumentId nel database."}
                          </p>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex flex-wrap items-center justify-end gap-2.5 pt-4 border-t border-slate-800">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('quotes');
                          }}
                          className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-sky-400 hover:text-sky-300 border border-slate-800 hover:border-sky-500/40 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer mr-auto"
                          title="Visualizza e modifica puntualmente lo storico delle quotazioni salvate per questo ticker"
                        >
                          <Calendar className="w-3.5 h-3.5 text-sky-400" />
                          <span>Verifica Storico Prezzi</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleTestAndSync}
                          disabled={isTestingOrSyncing || isSavingTicker}
                          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          title="Verifica la connessione e aggiorna le quotazioni di questo ticker"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isTestingOrSyncing ? 'animate-spin text-emerald-400' : 'text-slate-400'}`} />
                          <span>{t.testAndFetchQuotes || 'Verifica e Aggiorna'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSaveTicker()}
                          disabled={isSavingTicker || isTestingOrSyncing}
                          className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-950/20 disabled:opacity-50"
                        >
                          <Check className="w-4 h-4" />
                          <span>{t.saveTickerConfig || 'Salva Configurazione'}</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-12 text-center text-slate-500 space-y-2 my-auto">
                      <Sliders className="w-8 h-8 mx-auto opacity-50" />
                      <p className="text-xs">Seleziona un ticker dall'elenco a sinistra per visualizzarne e modificarne la configurazione.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : activeTab === 'quotes' ? (
            /* ================= TAB 2: QUOTES HISTORY & MANUAL OVERRIDE (COGNITIVE ERGONOMICS) ================= */
            <QuotesHistoryViewer
              selectedSymbol={selectedTickerSymbol}
              onSelectSymbol={(sym) => setSelectedTickerSymbol(sym)}
              availableSymbols={allSymbols}
              tickerConfigs={tickerConfigs}
              priceCache={priceCache}
              onUpdateQuote={async (sym, date, price) => {
                if (onUpdateQuote) {
                  await onUpdateQuote(sym, date, price);
                }
              }}
              onDeleteQuote={async (sym, date) => {
                if (onDeleteQuote) {
                  await onDeleteQuote(sym, date);
                }
              }}
              onSyncTickerPrices={onSyncTickerPrices}
              onSwitchToTickerConfig={(sym) => {
                setSelectedTickerSymbol(sym);
                setActiveTab('tickers');
              }}
              t={t}
              lang={lang}
              currency={currency}
            />
          ) : (
            /* ================= TAB 3: MULTI-EXCHANGE GROUPS (ORIGINAL UNTOUCHED LOGIC) ================= */
            <div className="space-y-6">
              {/* Quick Auto-Detection Banner if candidates found */}
              {detectedCandidates.length > 0 && !isCreatingNew && !editingGroup && (
                <div className="p-4 rounded-xl bg-sky-950/40 border border-sky-800/60 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-sm font-semibold text-sky-200">
                          {t.autoDetectGroupsBtn || 'Strumenti Multi-Borsa Rilevati Automaticamente'}
                        </h3>
                        <p className="text-xs text-slate-300 mt-0.5">
                          {t.autoDetectGroupsDesc || 'Abbiamo individuato ticker che condividono la stessa radice scambiati su Borse differenti. Puoi creare i gruppi con un clic.'}
                        </p>
                      </div>
                    </div>
                    {detectedCandidates.length > 1 && (
                      <button
                        onClick={handleApplyAllCandidates}
                        className="px-3 py-1.5 text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors shrink-0 shadow-sm cursor-pointer"
                      >
                        Crea Tutti ({detectedCandidates.length})
                      </button>
                    )}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-2 pt-1">
                    {detectedCandidates.map(c => (
                      <div
                        key={c.prefix}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs"
                      >
                        <div>
                          <span className="font-bold text-white block">{c.defaultName}</span>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {c.symbols.map(s => (
                              <span key={s} className="px-1.5 py-0.5 rounded bg-sky-900/50 text-sky-300 font-mono text-[10px]">
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                        <button
                          onClick={() => handleApplyCandidate(c)}
                          className="px-2.5 py-1 bg-emerald-600/80 hover:bg-emerald-500 text-white rounded text-[11px] font-medium transition-colors ml-2 cursor-pointer"
                        >
                          Crea
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Form when Creating or Editing Group */}
              {(isCreatingNew || editingGroup) ? (
                <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Layers className="w-4 h-4 text-emerald-400" />
                      {isCreatingNew ? (t.newGroupTitle || 'Crea Strumento Aggregato') : (t.editGroupTitle || 'Modifica Strumento Aggregato')}
                    </h3>
                    <button
                      onClick={handleCancelEditGroup}
                      className="text-xs text-slate-400 hover:text-white cursor-pointer"
                    >
                      Annulla
                    </button>
                  </div>

                  {errorMessage && (
                    <div className="p-3 rounded-lg bg-red-950/50 border border-red-800/80 text-red-300 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  {/* Group Name */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300 block">
                      {t.groupNameLabel || 'Nome Strumento Aggregato (es. Vanguard FTSE All-World)'} <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={groupName}
                      onChange={(e) => {
                        setGroupName(e.target.value);
                        if (errorMessage) setErrorMessage('');
                      }}
                      placeholder="es. Vanguard FTSE All-World (VWCE)"
                      className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 text-white text-xs px-3 py-2 rounded-lg outline-none font-medium"
                    />
                  </div>

                  {/* Constituent Tickers Selection */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300 block">
                      {t.groupTickersLabel || 'Ticker Appartenenti allo Strumento'} <span className="text-red-400">*</span>
                    </label>
                    <p className="text-[11px] text-slate-400">
                      Seleziona i ticker registrati nel portafoglio oppure aggiungine altri manualmente:
                    </p>

                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-slate-900/60 rounded-lg border border-slate-800/80 custom-scrollbar">
                      {allSymbols.length === 0 ? (
                        <span className="text-xs text-slate-500 italic p-1">Nessun ticker trovato</span>
                      ) : (
                        allSymbols.map(sym => {
                          const upper = sym.toUpperCase();
                          const isSelected = selectedSymbols.includes(upper);
                          return (
                            <button
                              key={upper}
                              type="button"
                              onClick={() => handleToggleSymbolInGroup(upper)}
                              className={`px-2 py-1 rounded text-xs font-mono transition-all flex items-center gap-1 cursor-pointer ${
                                isSelected
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 font-bold'
                                  : 'bg-slate-800/80 text-slate-400 border border-slate-700/60 hover:text-white'
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3 text-emerald-400" />}
                              {upper}
                            </button>
                          );
                        })
                      )}
                    </div>

                    {/* Custom symbol input */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customSymbolInput}
                        onChange={(e) => setCustomSymbolInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomSymbolToGroup();
                          }
                        }}
                        placeholder="Aggiungi ticker personalizzato (es. VWCE.DE)"
                        className="flex-1 bg-slate-900 border border-slate-700 focus:border-emerald-500 text-white text-xs px-3 py-1.5 rounded-lg outline-none font-mono uppercase"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomSymbolToGroup}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
                      >
                        Aggiungi
                      </button>
                    </div>

                    {/* Selected Tickers Summary Pills */}
                    {selectedSymbols.length > 0 && (
                      <div className="pt-2">
                        <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                          Ticker inclusi in questo strumento ({selectedSymbols.length}):
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedSymbols.map(sym => (
                            <span
                              key={sym}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-mono"
                            >
                              {sym}
                              <button
                                type="button"
                                onClick={() => handleToggleSymbolInGroup(sym)}
                                className="text-emerald-400/70 hover:text-emerald-300 ml-0.5 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Notes or Description */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300 block">
                      {t.groupNotesLabel || 'Note o Dettagli Opzionali (es. ISIN, borse)'}
                    </label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="es. ISIN IE00BK5BQT80 - Borsa Italiana e Xetra"
                      className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 text-white text-xs px-3 py-2 rounded-lg outline-none font-medium"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={handleCancelEditGroup}
                      className="px-4 py-2 text-xs text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
                    >
                      Annulla
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveGroup}
                      className="px-5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow-md transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      Salva Strumento
                    </button>
                  </div>
                </div>
              ) : (
                /* Button to add new group */
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">
                    Strumenti aggregati configurati: <strong className="text-white">{safeGroups.length}</strong>
                  </span>
                  <button
                    onClick={handleStartCreateGroup}
                    className="px-3.5 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    {t.newGroupBtn || 'Nuovo Strumento Aggregato'}
                  </button>
                </div>
              )}

              {/* Existing Groups List */}
              <div className="space-y-3">
                {safeGroups.length === 0 ? (
                  <div className="p-8 text-center bg-slate-950/40 rounded-xl border border-slate-800/80 space-y-3">
                    <Layers className="w-8 h-8 text-slate-600 mx-auto" />
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      Nessun gruppo strumento configurato finora. Crea un gruppo manuale oppure utilizza il rilevamento automatico per unificare i ticker scambiati su borse diverse.
                    </p>
                    <button
                      onClick={handleStartCreateGroup}
                      className="px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors cursor-pointer"
                    >
                      Crea il tuo primo gruppo
                    </button>
                  </div>
                ) : (
                  safeGroups.map((group) => (
                    <div
                      key={group.id}
                      className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-slate-700/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white tracking-wide">
                            {group.name}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold uppercase">
                            {(group.tickerSymbols || []).length} Ticker
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1.5 items-center">
                          <Tag className="w-3 h-3 text-slate-500" />
                          {(group.tickerSymbols || []).map(s => (
                            <span
                              key={s}
                              className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-sky-400 font-mono text-xs font-semibold"
                            >
                              {s}
                            </span>
                          ))}
                        </div>

                        {group.notes && (
                          <p className="text-xs text-slate-400 italic">
                            {group.notes}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        {deleteConfirmGroupId === group.id ? (
                          <div className="flex items-center gap-1.5 bg-red-950/40 border border-red-800/80 rounded-lg p-1.5 animate-fade-in">
                            <span className="text-[11px] text-red-300 font-semibold px-1">
                              {t.confirmDeleteTitle || 'Eliminare?'}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteGroup(group.id);
                                setDeleteConfirmGroupId(null);
                              }}
                              className="px-2.5 py-1 rounded-md bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors cursor-pointer"
                            >
                              {t.delete || 'Elimina'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmGroupId(null)}
                              className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
                            >
                              {t.cancel || 'Annulla'}
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleStartEditGroup(group)}
                              className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-colors cursor-pointer"
                              title="Modifica Strumento"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmGroupId(group.id)}
                              className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-red-400 hover:text-red-300 hover:bg-red-950/30 hover:border-red-800 transition-colors cursor-pointer"
                              title="Rimuovi Strumento"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-1.5 text-[11px]">
            <Info className="w-3.5 h-3.5 text-slate-500" />
            <span>Configurazione salvata in modo persistente e indipendente per ciascun ticker.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors cursor-pointer"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};
