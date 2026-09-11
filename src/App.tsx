/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { translations } from './locales/index.ts';
import { Currency, DBState, Account, Portfolio, Transaction, TransactionType, Transfer, InstrumentGroup } from './types.ts';
import { encryptData, decryptData } from './utils/crypto.ts';
import { saveFileHandleInIndexedDB, getFileHandleFromIndexedDB, clearFileHandleFromIndexedDB, getDatabaseStateFromIndexedDB } from './utils/indexedDB.ts';
import { storageService } from './services/storageService.ts';
import { syncPricesLocally, isCryptoTicker } from './utils/syncPrices.ts';
import MissionPage from './components/MissionPage.tsx';
import ToolsPage from './components/ToolsPage.tsx';
import OtherCostsPage from './components/OtherCostsPage.tsx';
import { DividendsPage } from './components/DividendsPage.tsx';
import { InflationPage } from './components/InflationPage.tsx';
import InteractiveChart, { DailyBalance } from './components/InteractiveChart.tsx';
import { PositionsTable } from './components/PositionsTable.tsx';
import { InstrumentGroupsModal } from './components/InstrumentGroupsModal.tsx';
import { TickerInput } from './components/TickerInput.tsx';
import { TransactionModal } from './components/TransactionModal.tsx';
import { TransferModal } from './components/TransferModal.tsx';
import { ModalPortal } from './components/ModalPortal.tsx';
import { TransfersTable, TransferRecord } from './components/TransfersTable.tsx';
import { formatDateString } from './utils.ts';
import {
  calculateHoldingsAndLots,
  calculateFinancialMetrics,
  calculateTransactionTableTotals,
  calculatePortfolioPerformance,
  executeTransferTransactionPair,
  getAvailableLotsForTransfer,
  getTransferEffectiveCapital,
  cleanFloatNoise,
  getDailyPricePairForSymbol,
  DailyPricePair,
  buildAggregatedPositions,
  matchesSymbol
} from './utils/finance.ts';
import { QuantityDisplay } from './components/QuantityDisplay.tsx';
import {
  Home,
  Briefcase,
  TrendingUp,
  Settings as SettingsIcon,
  Flame,
  Calculator,
  Lock,
  Globe,
  Plus,
  Trash2,
  Edit,
  DollarSign,
  Activity,
  User,
  LogOut,
  Calendar,
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  RefreshCw,
  Percent,
  Coins,
  ChevronDown,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Download,
  Upload,
  Database,
  AlertTriangle,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Layers,
  Sliders
} from 'lucide-react';

const defaultInitialDB: DBState = {
  settings: {
    theme: 'dark',
    defaultCurrency: Currency.EUR,
    passwordSet: false,
    selectedInflationId: 'NIC',
    inflationIndices: [
      {
        id: 'NIC',
        name: 'NIC',
        description: "Indice Nazionale dei prezzi al consumo per l'intera collettività",
        link: 'https://www.istat.it/it/archivio/prezzi-al-consumo',
        values: [
          { year: 2020, rate: 0 },
          { year: 2021, rate: 0 },
          { year: 2022, rate: 0 },
          { year: 2023, rate: 0 },
          { year: 2024, rate: 0 },
          { year: 2025, rate: 0 },
          { year: 2026, rate: 0 }
        ]
      },
      {
        id: 'FOI',
        name: 'FOI',
        description: 'Indice dei prezzi al consumo per le Famiglie di Operai e Impiegati',
        link: 'https://www.istat.it/it/archivio/prezzi-al-consumo',
        values: [
          { year: 2020, rate: 0 },
          { year: 2021, rate: 0 },
          { year: 2022, rate: 0 },
          { year: 2023, rate: 0 },
          { year: 2024, rate: 0 },
          { year: 2025, rate: 0 },
          { year: 2026, rate: 0 }
        ]
      },
      {
        id: 'IPCA',
        name: 'IPCA',
        description: "Indice dei prezzi al consumo Armonizzato per i paesi dell'Unione Europea",
        link: 'https://www.istat.it/it/archivio/prezzi-al-consumo',
        values: [
          { year: 2020, rate: 0 },
          { year: 2021, rate: 0 },
          { year: 2022, rate: 0 },
          { year: 2023, rate: 0 },
          { year: 2024, rate: 0 },
          { year: 2025, rate: 0 },
          { year: 2026, rate: 0 }
        ]
      }
    ]
  },
  accounts: [],
  portfolios: [],
  transactions: [],
  transfers: [],
  otherCosts: [],
  instrumentGroups: [],
  priceCache: {}
};

export function formatCurrency(value: number, currencyCode: string): string {
  try {
    const formatted = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
    return formatted;
  } catch (e) {
    return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencyCode}`;
  }
}

export function formatQuantity(qty: number | string | undefined | null): string {
  if (qty === undefined || qty === null || qty === '') return '0';
  const num = Number(qty);
  if (isNaN(num)) return '0';
  if (num % 1 === 0) return num.toString();
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 20,
    useGrouping: false
  });
}

export default function App() {
  const [lang, setLang] = useState<string>('it');
  const [storageMode, setStorageMode] = useState<'local' | 'browser'>('browser');
  const t = translations[lang];

  // Browser-based file handle and encryption states
  const [fileHandle, setFileHandle] = useState<any | null>(null);
  const [browserPassword, setBrowserPassword] = useState<string>('');
  const [hasPersistedHandle, setHasPersistedHandle] = useState<boolean>(false);
  const [persistedFileName, setPersistedFileName] = useState<string>('');
  const [browserSetupStep, setBrowserSetupStep] = useState<'info' | 'create_pass' | 'open_pass'>('info');
  const [pendingFileHandle, setPendingFileHandle] = useState<any | null>(null);

  // Auth States
  const [passwordSet, setPasswordSet] = useState<boolean | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');

  // Primary Database States
  const [db, setDb] = useState<DBState>({
    settings: {
      theme: 'dark',
      defaultCurrency: Currency.EUR,
      passwordSet: false,
      selectedInflationId: 'NIC',
      inflationIndices: []
    },
    accounts: [],
    portfolios: [],
    transactions: [],
    transfers: [],
    otherCosts: [],
    priceCache: {}
  });

  // Central persistence tracker to guarantee no unsaved changes are lost
  const lastPersistedDbJsonRef = useRef<string>('');
  const isInitialHydrationRef = useRef<boolean>(true);
  const dbRef = useRef<DBState>(db);
  useEffect(() => {
    dbRef.current = db;
  }, [db]);

  // Navigation state
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState<boolean>(true);

  // Interactive toggle states
  const [includeCommissions, setIncludeCommissions] = useState<boolean>(true);
  const [selectedCurrency, setSelectedCurrency] = useState<string>('EUR');
  const [activeBenchmark, setActiveBenchmark] = useState<string>('NONE');
  const [benchmarkSymbol, setBenchmarkSymbol] = useState<string>('SWDA.MI');
  const [inflationToggle, setInflationToggle] = useState<boolean>(false);
  const [dashFilter, setDashFilter] = useState<{ type: 'ALL' | 'ACCOUNT' | 'PORTFOLIO' | 'TICKER' | 'GROUP'; id: string }>({ type: 'ALL', id: '' });
  const [newCurrencyInput, setNewCurrencyInput] = useState<string>('');
  const [isGroupsModalOpen, setIsGroupsModalOpen] = useState<boolean>(false);
  const [isAggregatedView, setIsAggregatedView] = useState<boolean>(() => {
    return db.settings?.aggregateInstrumentsView !== undefined ? !!db.settings.aggregateInstrumentsView : true;
  });

  useEffect(() => {
    if (db.settings?.aggregateInstrumentsView !== undefined) {
      setIsAggregatedView(!!db.settings.aggregateInstrumentsView);
    }
  }, [db.settings?.aggregateInstrumentsView]);

  useEffect(() => {
    if (db.settings?.includeCommissions !== undefined) {
      setIncludeCommissions(db.settings.includeCommissions);
    }
  }, [db.settings?.includeCommissions]);

  // Sync operations loading state
  const [isSyncingPrices, setIsSyncingPrices] = useState<boolean>(false);

  // Managers modal states
  const [accountForm, setAccountForm] = useState<{ open: boolean; editId: string | null; name: string; currency: Currency | string; include: boolean }>({
    open: false, editId: null, name: '', currency: Currency.EUR, include: true
  });
  const [portfolioForm, setPortfolioForm] = useState<{ open: boolean; editId: string | null; accountId: string; name: string; include: boolean }>({
    open: false, editId: null, accountId: '', name: '', include: true
  });
  const [txForm, setTxForm] = useState<{ open: boolean; editId: string | null; portfolioId: string; date: string; type: TransactionType; symbol: string; qty: number | string; price: number | string; commission: number | string; currency: string; commissionCurrency: string; notes: string }>({
    open: false, editId: null, portfolioId: '', date: '', type: TransactionType.BUY, symbol: '', qty: '', price: '', commission: '', currency: 'EUR', commissionCurrency: 'EUR', notes: ''
  });
  const [transferForm, setTransferForm] = useState<{
    open: boolean;
    editTransferId?: string | null;
    sourcePortfolioId: string;
    destPortfolioId: string;
    symbol: string;
    qty: number | string;
    price: number | string;
    priceCurrency: string;
    sourceCommission: number | string;
    sourceCommissionCurrency: string;
    sourceCommissionPaymentMode?: 'EXTERNAL' | 'ASSET';
    destCommission: number | string;
    destCommissionCurrency: string;
    destCommissionPaymentMode?: 'EXTERNAL' | 'ASSET';
    date: string;
    criteria: 'FIFO' | 'LIFO';
    notes: string;
  }>({
    open: false,
    editTransferId: null,
    sourcePortfolioId: '',
    destPortfolioId: '',
    symbol: '',
    qty: '',
    price: '',
    priceCurrency: 'EUR',
    sourceCommission: '',
    sourceCommissionCurrency: 'EUR',
    sourceCommissionPaymentMode: 'EXTERNAL',
    destCommission: '',
    destCommissionCurrency: 'EUR',
    destCommissionPaymentMode: 'EXTERNAL',
    date: new Date().toISOString().substring(0, 16),
    criteria: 'FIFO',
    notes: ''
  });
  const [costForm, setCostForm] = useState<{
    open: boolean;
    editId: string | null;
    portfolioId: string;
    date: string;
    amount: number;
    currency: string;
    type: 'bollo' | 'custody' | 'tax' | 'other';
    notes: string;
  }>({
    open: false,
    editId: null,
    portfolioId: '',
    date: '',
    amount: 0,
    currency: 'EUR',
    type: 'bollo',
    notes: ''
  });

  // Column Resizing Preferences
  const defaultColumnWidths: { [col: string]: number } = {
    date: 110,
    portfolio: 140,
    type: 130,
    symbol: 110,
    qty: 120,
    price: 110,
    total: 110,
    currentValue: 130,
    commission: 110,
    notes: 160,
    actions: 90
  };

  const [columnWidths, setColumnWidths] = useState<{ [col: string]: number }>(() => {
    return db.settings?.columnWidths || defaultColumnWidths;
  });

  useEffect(() => {
    if (db.settings?.columnWidths) {
      setColumnWidths(db.settings.columnWidths);
    }
  }, [db.settings?.columnWidths]);

  const handleMouseDownResize = (colId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = columnWidths[colId] || defaultColumnWidths[colId] || 100;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(50, startWidth + (moveEvent.clientX - startX));
      setColumnWidths(prev => ({ ...prev, [colId]: newWidth }));
    };

    const onMouseUp = (upEvent: MouseEvent) => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      const finalWidth = Math.max(50, startWidth + (upEvent.clientX - startX));
      setColumnWidths(prev => {
        const updatedWidths = { ...prev, [colId]: finalWidth };
        const updatedDb = {
          ...db,
          settings: {
            ...db.settings,
            columnWidths: updatedWidths
          }
        };
        saveDatabaseState(updatedDb);
        return updatedWidths;
      });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const formatFullQuantity = (qty: number | string | undefined | null): string => {
    if (qty === undefined || qty === null || qty === '') return '0';
    const num = Number(qty);
    if (isNaN(num)) return '0';
    // Preserve all full decimal places without scientific notation or loss of precision
    const str = num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 20,
      useGrouping: false
    });
    return str;
  };

  // Transaction Table Filters & Sorting States
  const [txSortField, setTxSortField] = useState<string>('date');
  const [txSortAsc, setTxSortAsc] = useState<boolean>(false); // default descending (newest first)
  const [txFilterBrokerId, setTxFilterBrokerId] = useState<string>('');
  const [txFilterPortfolioId, setTxFilterPortfolioId] = useState<string>('');
  const [txFilterTypes, setTxFilterTypes] = useState<string[]>([]);
  const [txFilterTickers, setTxFilterTickers] = useState<string[]>([]);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState<boolean>(false);
  const [tickerDropdownOpen, setTickerDropdownOpen] = useState<boolean>(false);
  const [tickerSearchQuery, setTickerSearchQuery] = useState<string>('');
  const [columnDropdownOpen, setColumnDropdownOpen] = useState<boolean>(false);
  const [txVisibleColumns, setTxVisibleColumns] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('gainbusters_visible_cols');
      return saved ? JSON.parse(saved) : ['date', 'portfolio', 'type', 'symbol', 'qty', 'price', 'total', 'currentValue', 'commission', 'notes'];
    } catch (_) {
      return ['date', 'portfolio', 'type', 'symbol', 'qty', 'price', 'total', 'currentValue', 'commission', 'notes'];
    }
  });

  useEffect(() => {
    localStorage.setItem('gainbusters_visible_cols', JSON.stringify(txVisibleColumns));
  }, [txVisibleColumns]);
  const [txFilterDateStart, setTxFilterDateStart] = useState<string>('');
  const [txFilterDateEnd, setTxFilterDateEnd] = useState<string>('');
  const [txHighlightIds, setTxHighlightIds] = useState<string[]>([]);

  // Sincronizzazione feedback alert state
  const [syncFeedback, setSyncFeedback] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Form custom error checking
  const [formErr, setFormErr] = useState<string>('');

  // Legal disclaimer modal state
  const [showLegalDisclaimerModal, setShowLegalDisclaimerModal] = useState<boolean>(false);

  // Deletion confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    type: 'broker' | 'portfolio' | 'transaction' | 'cost' | 'transfer';
    id: string;
    message: string;
  }>({
    open: false,
    type: 'broker',
    id: '',
    message: ''
  });

  // Backup & Restore state
  const [pendingImport, setPendingImport] = useState<DBState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dynamic sticky sidebar detection
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [useStickySidebar, setUseStickySidebar] = useState<boolean>(false);

  // ================= REACT LIFE FLOWS =================

  useEffect(() => {
    const checkSticky = () => {
      if (window.innerWidth < 1024) {
        setUseStickySidebar(false);
        return;
      }
      if (sidebarRef.current) {
        const sidebarHeight = sidebarRef.current.getBoundingClientRect().height;
        // Available space is viewport minus 88px header offset and some bottom padding safety
        const availableHeight = window.innerHeight - 88 - 48;
        setUseStickySidebar(availableHeight >= sidebarHeight);
      }
    };

    // Initial check
    checkSticky();
    window.addEventListener('resize', checkSticky);

    let resizeObserver: ResizeObserver | null = null;
    if (sidebarRef.current && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        checkSticky();
      });
      resizeObserver.observe(sidebarRef.current);
    }

    return () => {
      window.removeEventListener('resize', checkSticky);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [isDesktopSidebarOpen, isAuthenticated, activeTab]);

  const checkStorageMode = async (): Promise<'local' | 'browser'> => {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = await res.json();
        const mode = data.storageMode === 'local' ? 'local' : 'browser';
        setStorageMode(mode);
        storageService.setStorageMode(mode);
        return mode;
      }
    } catch (err) {
      console.warn('Could not read config endpoint, defaulting storageMode to "browser"', err);
    }
    setStorageMode('browser');
    storageService.setStorageMode('browser');
    return 'browser';
  };

  useEffect(() => {
    // Determine language from browser if no saved user preference is found
    const supportedLangs = ['en', 'it', 'es', 'fr', 'zh', 'ar'];
    const browserLangSet = (navigator.language || (navigator as any).userLanguage || '').substring(0, 2).toLowerCase();
    
    // Check if there is a saved setting in localStorage first
    const savedLangPreference = localStorage.getItem('gainbusters_lang_preference');
    if (savedLangPreference && supportedLangs.includes(savedLangPreference)) {
      setLang(savedLangPreference);
    } else {
      const defaultLang = supportedLangs.includes(browserLangSet) ? browserLangSet : 'en';
      setLang(defaultLang);
      localStorage.setItem('gainbusters_lang_preference', defaultLang);
    }

    const initApp = async () => {
      const resolvedMode = await checkStorageMode();
      await checkAuthStatus(resolvedMode);
    };
    initApp();
  }, []);

  // Save language preference to localStorage when changed
  useEffect(() => {
    localStorage.setItem('gainbusters_lang_preference', lang);
  }, [lang]);

  // Sync state whenever authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchDB();
    }
  }, [isAuthenticated, storageMode]);

  // Load and apply theme class
  useEffect(() => {
    const root = window.document.documentElement;
    const applyTheme = () => {
      const currentTheme = db.settings?.theme || 'dark';
      if (currentTheme === 'dark' || (currentTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    applyTheme();

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => {
      if (db.settings?.theme === 'system') {
        applyTheme();
      }
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', listener);
    } else {
      mediaQuery.addListener(listener);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', listener);
      } else {
        mediaQuery.removeListener(listener);
      }
    };
  }, [db.settings.theme]);

  // Handle currency sync
  useEffect(() => {
    if (db.settings.defaultCurrency) {
      setSelectedCurrency(db.settings.defaultCurrency);
    }
  }, [db.settings.defaultCurrency]);

  // Trigger automatic download of prices when a valid benchmark symbol is selected/entered
  useEffect(() => {
    if (activeBenchmark === 'TICKER' && benchmarkSymbol && benchmarkSymbol.trim().length >= 3) {
      const delayDebounceFn = setTimeout(() => {
        triggerPriceSync(db);
      }, 800); // 800ms debounce to avoid spamming as user types
      return () => clearTimeout(delayDebounceFn);
    }
  }, [activeBenchmark, benchmarkSymbol]);

  const getCurrencySymbol = (code: string): string => {
    try {
      const parts = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: code.toUpperCase()
      }).formatToParts(0);
      const symbolPart = parts.find(p => p.type === 'currency');
      return symbolPart ? symbolPart.value : code;
    } catch (e) {
      return code;
    }
  };
  
  const currencySymbol = getCurrencySymbol(selectedCurrency);
  
  const activeCurrencies: string[] = db.settings.activeCurrencies || ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'BTC', 'ETH', 'SOL', 'USDT', 'USDC'];

  const getExchangeRate = (fromStr: string, toStr: string, dateStr: string): number => {
    const from = fromStr.toUpperCase();
    const to = toStr.toUpperCase();
    if (from === to) return 1.0;
    
    // Normalize date to YYYY-MM-DD
    const dStr = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;

    const lookupRate = (f: string, t: string): number | null => {
      const pairsToCheck = [
        { sym: `${f}${t}=X`, inverted: false },
        { sym: `${t}${f}=X`, inverted: true },
        { sym: `${f}-${t}`, inverted: false },
        { sym: `${t}-${f}`, inverted: true },
        { sym: `${f}/${t}`, inverted: false },
        { sym: `${t}/${f}`, inverted: true },
        { sym: `${f}${t}`, inverted: false },
        { sym: `${t}${f}`, inverted: true },
        { sym: f, inverted: false }, // direct crypto ticker e.g. BTC (denominated in EUR)
        { sym: t, inverted: true },  // direct crypto ticker e.g. BTC (when converting EUR -> BTC)
      ];

      // 1. Direct lookup for date
      for (const p of pairsToCheck) {
        if (db.priceCache[p.sym] && db.priceCache[p.sym][dStr] !== undefined) {
          const val = db.priceCache[p.sym][dStr];
          if (val > 0) return p.inverted ? 1 / val : val;
        }
      }

      // 2. Trailing historical fallback
      for (const p of pairsToCheck) {
        if (db.priceCache[p.sym]) {
          const dates = Object.keys(db.priceCache[p.sym]).sort();
          if (dates.length > 0) {
            const preceding = dates.filter(dt => dt <= dStr);
            const targetDt = preceding.length > 0 ? preceding[preceding.length - 1] : dates[dates.length - 1];
            const val = db.priceCache[p.sym][targetDt];
            if (val > 0) return p.inverted ? 1 / val : val;
          }
        }
      }

      return null;
    };

    const direct = lookupRate(from, to);
    if (direct !== null) return direct;

    // Triangular through EUR
    if (from !== 'EUR' && to !== 'EUR') {
      const rateToEur = lookupRate(from, 'EUR');
      const rateFromEur = lookupRate('EUR', to);
      if (rateToEur !== null && rateFromEur !== null) {
        return rateToEur * rateFromEur;
      }
    }

    const fallbacks: { [pair: string]: number } = {
      'USDEUR': 0.92, 'EURUSD': 1.09,
      'GBPEUR': 1.18, 'EURGBP': 0.85,
      'CHFEUR': 1.04, 'EURCHF': 0.96,
      'JPYEUR': 0.0059, 'EURJPY': 169.5,
      'CADEUR': 0.67, 'EURCAD': 1.49,
      'AUDEUR': 0.61, 'EURAUD': 1.64,
      'BTCEUR': 85000, 'BTCUSD': 92000,
      'ETHEUR': 2500, 'ETHUSD': 2700,
      'SOLEUR': 160, 'SOLUSD': 175,
      'USDTEUR': 0.92, 'USDCEUR': 0.92,
      'EURBTC': 1 / 85000, 'EURETH': 1 / 2500, 'EURSOL': 1 / 160
    };
    const code = `${from}${to}`;
    if (fallbacks[code] !== undefined) return fallbacks[code];
    const invCode = `${to}${from}`;
    if (fallbacks[invCode] !== undefined) return 1 / fallbacks[invCode];

    return 1.0;
  };

  const convertValue = (amount: number, from: string, to: string, date: string): number => {
    return amount * getExchangeRate(from, to, date);
  };

  const getTickerCurrency = (sym: string): string => {
    const txs = db.transactions.filter(t => t.symbol.toUpperCase() === sym.toUpperCase());
    if (txs.length > 0) {
      return txs[0].currency || db.settings.defaultCurrency || 'EUR';
    }
    return db.settings.defaultCurrency || 'EUR';
  };

  // API fetches
  const checkAuthStatus = async (resolvedMode?: 'local' | 'browser') => {
    const currentMode = resolvedMode || storageMode;
    storageService.setStorageMode(currentMode);

    if (currentMode === 'browser') {
      try {
        const handle = await getFileHandleFromIndexedDB();
        if (handle) {
          setHasPersistedHandle(true);
          setPersistedFileName(handle.name);
          setFileHandle(handle);
          storageService.setFileHandle(handle);
          setPasswordSet(true);
          setIsAuthenticated(false);
        } else {
          const idbSnap = await getDatabaseStateFromIndexedDB();
          const hasEncryptedIdb = !!(idbSnap && idbSnap.mode === 'browser' && idbSnap.encrypted);
          const hasFallbackEnc = !!localStorage.getItem('gainbusters_db_encrypted');
          setHasPersistedHandle(false);
          setPasswordSet(hasEncryptedIdb || hasFallbackEnc);
          setIsAuthenticated(false);
        }
      } catch (err) {
        console.error('Error reading browser persisted handle', err);
        setHasPersistedHandle(false);
        setPasswordSet(false);
        setIsAuthenticated(false);
      }
    } else {
      try {
        const savedToken = sessionStorage.getItem('gainbusters_local_token');
        if (savedToken) {
          storageService.setLocalAuthToken(savedToken);
        }
        const r = await fetch('/api/auth/status', { method: 'POST' });
        const data = await r.json();
        setPasswordSet(!!data.passwordSet);
        setIsAuthenticated(false);
      } catch (err) {
        console.error('Error checking auth', err);
      }
    }
  };

  const handleBrowserCreateNew = async () => {
    setAuthError('');
    if (passwordInput.trim().length < 4) {
      setAuthError('La password deve essere di almeno 4 caratteri.');
      return;
    }
    if (passwordInput !== confirmPasswordInput) {
      setAuthError('Le password non coincidono.');
      return;
    }

    try {
      if (typeof (window as any).showSaveFilePicker === 'undefined') {
        setAuthError("File System Access API non supportate in questo browser o ambiente iframe. Aprilo in una nuova scheda!");
        return;
      }
      
      const options = {
        suggestedName: 'gainbusters_db.json',
        types: [{
          description: 'Database Cifrato GainBusters (JSON)',
          accept: { 'application/json': ['.json'] }
        }]
      };
      
      const handle = await (window as any).showSaveFilePicker(options);
      
      // Purge any residual storage/caches first
      await storageService.purgeStorageCache();

      // Encrypt default initial database state with selected language
      const initialDbWithLang = {
        ...defaultInitialDB,
        settings: {
          ...defaultInitialDB.settings,
          lang: lang
        }
      };
      const encryptedText = await encryptData(initialDbWithLang, passwordInput);
      
      // Save content into local computer file
      const writable = await handle.createWritable();
      await writable.write(encryptedText);
      await writable.close();
      
      // Save file representation handle in IndexedDB
      await saveFileHandleInIndexedDB(handle);
      
      setFileHandle(handle);
      setBrowserPassword(passwordInput);
      storageService.setFileHandle(handle);
      storageService.setBrowserPassword(passwordInput);
      lastPersistedDbJsonRef.current = JSON.stringify(initialDbWithLang);
      isInitialHydrationRef.current = false;
      setDb(initialDbWithLang);
      await storageService.saveDatabaseState(initialDbWithLang);
      
      // Clean up States
      setHasPersistedHandle(true);
      setPersistedFileName(handle.name);
      setPasswordSet(true);
      setIsAuthenticated(true);
      
      setPasswordInput('');
      setConfirmPasswordInput('');
      setBrowserSetupStep('info');
    } catch (err: any) {
      console.error("Errore di creazione file locale:", err);
      if (err.name !== 'AbortError') {
        setAuthError('Errore durante la creazione del file: ' + err.message);
      }
    }
  };

  const handleBrowserSelectExistingFile = async () => {
    setAuthError('');
    try {
      if (typeof (window as any).showOpenFilePicker === 'undefined') {
        setAuthError("File System Access API non supportate in questo browser o ambiente iframe. Aprilo in una nuova scheda!");
        return;
      }
      
      const options = {
        types: [{
          description: 'Database Cifrato GainBusters (JSON)',
          accept: { 'application/json': ['.json'] }
        }],
        multiple: false
      };
      
      const [handle] = await (window as any).showOpenFilePicker(options);
      setPendingFileHandle(handle);
      setBrowserSetupStep('open_pass');
    } catch (err: any) {
      console.error("Errore apertura file:", err);
      if (err.name !== 'AbortError') {
        setAuthError('Errore durante la selezione del file: ' + err.message);
      }
    }
  };

  const handleBrowserUnlockPendingFile = async () => {
    setAuthError('');
    if (!passwordInput) {
      setAuthError("Inserisci la password dell'archivio selezionato.");
      return;
    }
    if (!pendingFileHandle) {
      setAuthError("Nessun file selezionato.");
      return;
    }

    try {
      if (typeof pendingFileHandle.queryPermission === 'function') {
        try {
          let perm = await pendingFileHandle.queryPermission({ mode: 'readwrite' });
          if (perm !== 'granted' && typeof pendingFileHandle.requestPermission === 'function') {
            await pendingFileHandle.requestPermission({ mode: 'readwrite' });
          }
        } catch (permErr) {
          console.warn('[Unlock Pending] File permission request error:', permErr);
        }
      }

      const file = await pendingFileHandle.getFile();
      const rawText = await file.text();
      if (!rawText || rawText.trim().length === 0) {
        setAuthError("Il file selezionato è vuoto.");
        return;
      }

      let parsedPayload: any;
      try {
        parsedPayload = JSON.parse(rawText);
      } catch (e) {
        setAuthError("Il file selezionato non è un formato JSON valido.");
        return;
      }

      let decryptedDb: any;
      if (parsedPayload.salt && parsedPayload.iv && parsedPayload.ciphertext) {
        // Strictly encrypted database file
        try {
          decryptedDb = await decryptData(rawText, passwordInput);
        } catch (decryptErr) {
          console.error("Decryption failed:", decryptErr);
          setAuthError("Password non corretta o archivio corrotto.");
          return;
        }
      } else if (parsedPayload.settings) {
        // Plain database file
        decryptedDb = parsedPayload;
      } else {
        setAuthError("Formato database GainBusters non riconosciuto.");
        return;
      }

      if (!decryptedDb || !decryptedDb.settings) {
        setAuthError("Contenuto del database non valido.");
        return;
      }
      
      // Setup file states
      let mergedSettings = { ...defaultInitialDB.settings, ...decryptedDb.settings };
      if (!mergedSettings.inflationIndices || mergedSettings.inflationIndices.length === 0) {
        mergedSettings.inflationIndices = defaultInitialDB.settings.inflationIndices;
      }
      const fullDb = { ...defaultInitialDB, ...decryptedDb, settings: mergedSettings };
      
      // Purge previous storage caches before switching to new file
      await storageService.purgeStorageCache();

      await saveFileHandleInIndexedDB(pendingFileHandle);
      
      setFileHandle(pendingFileHandle);
      setBrowserPassword(passwordInput);
      storageService.setFileHandle(pendingFileHandle);
      storageService.setBrowserPassword(passwordInput);
      lastPersistedDbJsonRef.current = JSON.stringify(fullDb);
      isInitialHydrationRef.current = false;
      setDb(fullDb);
      await storageService.saveDatabaseState(fullDb);
      if (fullDb.settings?.lang) {
        setLang(fullDb.settings.lang);
      }
      
      setHasPersistedHandle(true);
      setPersistedFileName(pendingFileHandle.name);
      setPasswordSet(true);
      setIsAuthenticated(true);
      
      setPendingFileHandle(null);
      setPasswordInput('');
      setBrowserSetupStep('info');
    } catch (err: any) {
      console.error("Errore decrittazione file:", err);
      setAuthError("Password non corretta o formato file corrotto.");
    }
  };

  const handleBrowserUnlockPersistedFile = async () => {
    setAuthError('');
    if (!passwordInput) {
      setAuthError('Inserisci la master password.');
      return;
    }

    try {
      if (fileHandle && typeof fileHandle.queryPermission === 'function') {
        try {
          let perm = await fileHandle.queryPermission({ mode: 'readwrite' });
          if (perm !== 'granted' && typeof fileHandle.requestPermission === 'function') {
            await fileHandle.requestPermission({ mode: 'readwrite' });
          }
        } catch (permErr) {
          console.warn('[Unlock] File permission request error:', permErr);
        }
      }

      storageService.setBrowserPassword(passwordInput);
      if (fileHandle) {
        storageService.setFileHandle(fileHandle);
      }

      const loadedDb = await storageService.loadDatabaseState(passwordInput);
      if (!loadedDb || !loadedDb.settings) {
        throw new Error("Password non corretta o archivio corrotto.");
      }

      let mergedSettings = { ...defaultInitialDB.settings, ...loadedDb.settings };
      if (!mergedSettings.inflationIndices || mergedSettings.inflationIndices.length === 0) {
        mergedSettings.inflationIndices = defaultInitialDB.settings.inflationIndices;
      }
      const fullDb = { ...defaultInitialDB, ...loadedDb, settings: mergedSettings };

      setBrowserPassword(passwordInput);
      lastPersistedDbJsonRef.current = JSON.stringify(fullDb);
      isInitialHydrationRef.current = false;
      setDb(fullDb);
      if (fullDb.settings?.lang) {
        setLang(fullDb.settings.lang);
      }
      setIsAuthenticated(true);
      setPasswordInput('');
    } catch (err: any) {
      console.error("Errore sblocco file persistente:", err);
      setAuthError("Sblocco fallito: password errata o archivio modificato esternamente.");
    }
  };

  const handleClearPersistedHandle = async () => {
    try {
      await storageService.purgeStorageCache();
      setFileHandle(null);
      setBrowserPassword('');
      setHasPersistedHandle(false);
      setPersistedFileName('');
      setPasswordSet(false);
      setIsAuthenticated(false);
      setBrowserSetupStep('info');
      setPendingFileHandle(null);
      setPasswordInput('');
      setConfirmPasswordInput('');
      setAuthError('');
      setDb(defaultInitialDB);
      lastPersistedDbJsonRef.current = JSON.stringify(defaultInitialDB);
    } catch (err) {
      console.error("Errore durante la rimozione dell'archivio:", err);
    }
  };

  const handleAuthSetup = async () => {
    setAuthError('');
    if (passwordInput.trim().length < 4) {
      setAuthError(t.passwordRules);
      return;
    }
    if (passwordInput !== confirmPasswordInput) {
      setAuthError(t.passwordMismatch);
      return;
    }
    
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          storageService.setLocalAuthToken(data.token);
          sessionStorage.setItem('gainbusters_local_token', data.token);
        }
        const initialDbWithLang = {
          ...db,
          settings: {
            ...db.settings,
            lang: lang
          }
        };
        lastPersistedDbJsonRef.current = JSON.stringify(initialDbWithLang);
        isInitialHydrationRef.current = false;
        setDb(initialDbWithLang);
        setIsAuthenticated(true);
        setPasswordSet(true);
        await saveDatabaseState(initialDbWithLang);
        setActiveTab('brokers'); // Auto-redirect to Broker & Portafoglio tab
      } else {
        const errData = await res.json();
        setAuthError(errData.error || 'Server error');
      }
    } catch (err) {
      setAuthError('Connection failed.');
    }
  };

  const handleLogin = async () => {
    setAuthError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          storageService.setLocalAuthToken(data.token);
          sessionStorage.setItem('gainbusters_local_token', data.token);
        }
        setIsAuthenticated(true);
        setPasswordInput('');
      } else {
        setAuthError(t.incorrectPassword);
      }
    } catch (err) {
      setAuthError('Connection failed.');
    }
  };

  const fetchDB = async () => {
    try {
      const loadedDb = await storageService.loadDatabaseState();
      if (loadedDb && loadedDb.settings) {
        const fullDb: DBState = {
          ...defaultInitialDB,
          ...loadedDb,
          settings: { ...defaultInitialDB.settings, ...loadedDb.settings },
          accounts: Array.isArray(loadedDb.accounts) ? loadedDb.accounts : [],
          portfolios: Array.isArray(loadedDb.portfolios) ? loadedDb.portfolios : [],
          transactions: Array.isArray(loadedDb.transactions) ? loadedDb.transactions : [],
          transfers: Array.isArray(loadedDb.transfers) ? loadedDb.transfers : [],
          otherCosts: Array.isArray(loadedDb.otherCosts) ? loadedDb.otherCosts : [],
          instrumentGroups: Array.isArray(loadedDb.instrumentGroups) ? loadedDb.instrumentGroups : [],
          priceCache: (loadedDb.priceCache && typeof loadedDb.priceCache === 'object') ? loadedDb.priceCache : {}
        };
        lastPersistedDbJsonRef.current = JSON.stringify(fullDb);
        isInitialHydrationRef.current = false;
        setDb(fullDb);
        triggerPriceSync(fullDb);
        if (fullDb.settings.lang) {
          setLang(fullDb.settings.lang);
        }
      } else if (db && db.settings) {
        lastPersistedDbJsonRef.current = JSON.stringify(db);
        isInitialHydrationRef.current = false;
        triggerPriceSync(db);
      }
    } catch (err: any) {
      console.error('Error retrieving database', err);
      if (err?.message === 'UNAUTHORIZED') {
        setIsAuthenticated(false);
      }
    }
  };

  const triggerPriceSync = async (stateObj: DBState, force: boolean = false) => {
    if (!storageService.hasActiveSession()) return;
    const activeSymbols = Array.from(new Set(stateObj.transactions.map(t => t.symbol.toUpperCase())));
    // Include benchmark symbol if preset
    if (activeBenchmark === 'TICKER' && benchmarkSymbol) {
      activeSymbols.push(benchmarkSymbol.toUpperCase());
    }

    // Auto-inject support for currency exchange pairs
    activeCurrencies.forEach((cur) => {
      const c = cur.toUpperCase();
      if (c !== 'EUR') {
        activeSymbols.push(`${c}EUR=X`);
        activeSymbols.push(`EUR${c}=X`);
      }
      const baseCur = (stateObj.settings.defaultCurrency || 'EUR').toUpperCase();
      if (baseCur !== 'EUR' && c !== baseCur) {
        activeSymbols.push(`${c}${baseCur}=X`);
        activeSymbols.push(`${baseCur}${c}=X`);
      }
    });

    if (activeSymbols.length === 0) return;

    setIsSyncingPrices(true);
    setSyncFeedback({ message: t.connectionToYahoo, type: 'info' });
    try {
      const updatedDb = await syncPricesLocally(activeSymbols, force, stateObj);
      if (!storageService.hasActiveSession()) return;
      const newPriceCache = updatedDb.priceCache || {};
      const current = dbRef.current || stateObj;
      const mergedDb: DBState = {
        ...current,
        priceCache: {
          ...(current.priceCache || {}),
          ...newPriceCache
        }
      };
      await saveDatabaseState(mergedDb);
      await storageService.flushPendingSaves();
      setSyncFeedback({ message: t.quotesUpdatedSuccess, type: 'success' });
      setTimeout(() => setSyncFeedback(null), 4000);
    } catch (err) {
      console.error('Price sync failed', err);
      setSyncFeedback({ message: t.quotesSyncConnectionFailed || 'Errore aggiornamento quotazioni.', type: 'error' });
      setTimeout(() => setSyncFeedback(null), 4000);
    } finally {
      setIsSyncingPrices(false);
    }
  };

  // Inflation multiplier logic was migrated below to getTimelineBalances for chronological sequential flow.

  // ================= GENERAL FINANCE CALCULATIONS =================

  // Account filter
  let activePortIds: string[] = [];
  let tickerFilterSymbol: string | null = null;
  let groupFilterSymbols: string[] | null = null;

  if (dashFilter.type === 'ALL') {
    const activeAccounts = db.accounts.filter(a => a.includeInDashboard);
    const activeAccountIds = activeAccounts.map(a => a.id);
    const activeDashboardPortfolios = db.portfolios.filter(p => p.includeInDashboard && activeAccountIds.includes(p.accountId));
    activePortIds = activeDashboardPortfolios.map(p => p.id);
  } else if (dashFilter.type === 'ACCOUNT') {
    activePortIds = db.portfolios.filter(p => p.accountId === dashFilter.id).map(p => p.id);
  } else if (dashFilter.type === 'PORTFOLIO') {
    activePortIds = [dashFilter.id];
  } else if (dashFilter.type === 'TICKER') {
    activePortIds = db.portfolios.map(p => p.id);
    tickerFilterSymbol = dashFilter.id.toUpperCase();
  } else if (dashFilter.type === 'GROUP') {
    activePortIds = db.portfolios.map(p => p.id);
    const grp = (db.instrumentGroups || []).find(g => g.id === dashFilter.id);
    if (grp) {
      groupFilterSymbols = grp.tickerSymbols.map(s => s.toUpperCase());
    }
  }

  const activeTargetSymbolFilter: string | string[] | null = groupFilterSymbols || tickerFilterSymbol;

  // Transactions list matching active settings
  let filteredTx = db.transactions.filter(t => activePortIds.includes(t.portfolioId));
  if (activeTargetSymbolFilter) {
    if (Array.isArray(activeTargetSymbolFilter)) {
      filteredTx = filteredTx.filter(t => activeTargetSymbolFilter.includes(t.symbol.toUpperCase()));
    } else {
      filteredTx = filteredTx.filter(t => t.symbol.toUpperCase() === activeTargetSymbolFilter);
    }
  }

  // Sort chronologically
  const activeTxSorted = [...filteredTx].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Other costs matching active settings (bolli, broker fees, taxes, etc.)
  const otherCostsList = db.otherCosts || [];
  const activeOtherCosts = otherCostsList.filter(c => activePortIds.includes(c.portfolioId));

  // ================= UTILITY FINANCE RESOLVERS =================

  const getPriceForDate = (sym: string, dString: string, pmcFallback: number): number => {
    const symbolCache = db.priceCache[sym.toUpperCase()];
    if (!symbolCache) return pmcFallback;

    // Direct match check
    if (symbolCache[dString] !== undefined && symbolCache[dString] !== null) {
      return symbolCache[dString];
    }

    // Try finding closest historical date <= dString
    const dates = Object.keys(symbolCache).filter(d => 
      symbolCache[d] !== undefined && 
      symbolCache[d] !== null && 
      d <= dString
    );

    if (dates.length === 0) {
      // Try absolute newest in cache to prevent reverting back to PMC during holiday/weekend
      const allDates = Object.keys(symbolCache).filter(d => symbolCache[d] !== undefined && symbolCache[d] !== null);
      if (allDates.length === 0) return pmcFallback;
      const sortedAll = allDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
      return symbolCache[sortedAll[0]];
    }

    const sortedDates = dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    return symbolCache[sortedDates[0]];
  };

  const getMonthlyInflationRate = (activeIndex: any, year: number, month: number): number => {
    if (!activeIndex || !activeIndex.values || activeIndex.values.length === 0) {
      return 0.0;
    }

    const indexValues = activeIndex.values;
    const mRateObj = indexValues.find((v: any) => v.year === year && v.month === month);
    if (mRateObj !== undefined) {
      return mRateObj.rate;
    }

    // Unset value -> default to 0% as per user request!
    // However, if there are absolutely NO monthly values defined in the entire index,
    // and instead it only contains default yearly values (like system defaults NIC, FOI, IPCA),
    // we fallback to the monthly pro-rata equivalent of the yearly rate.
    const hasAnyMonthlyValues = indexValues.some((v: any) => v.month !== undefined);
    if (!hasAnyMonthlyValues) {
      const yRateObj = indexValues.find((v: any) => v.year === year && v.month === undefined);
      if (yRateObj !== undefined) {
        return Math.pow(1 + yRateObj.rate, 1 / 12) - 1;
      }
    }

    return 0.0;
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const yesterdayObj = new Date();
  yesterdayObj.setDate(yesterdayObj.getDate() - 1);
  const yesterdayStr = yesterdayObj.toISOString().split('T')[0];

  const getDailyPricePair = (sym: string, fallbackPriceNative: number): DailyPricePair => {
    const isCrypto = isCryptoTicker(sym);
    return getDailyPricePairForSymbol(
      sym,
      db.priceCache,
      fallbackPriceNative,
      todayStr,
      yesterdayStr,
      isCrypto
    );
  };

  // CENTRALIZED ATOMIC FINANCIAL CALCULATION
  const financialMetrics = calculateFinancialMetrics(
    db.transactions,
    activePortIds,
    otherCostsList,
    includeCommissions,
    selectedCurrency,
    convertValue,
    getPriceForDate,
    getTickerCurrency,
    todayStr,
    yesterdayStr,
    activeTargetSymbolFilter,
    getDailyPricePair
  );

  const {
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
  } = financialMetrics;

  // MONEY WEIGHTED RETURN SOLVER (MWRR - IRR)
  const calculateMWRR = (): number => {
    if (activeTxSorted.length === 0 || totalNominalValue <= 0) return 0;
    
    const solverFlows: { years: number; amount: number }[] = [];
    const todayMillis = new Date().getTime();

    activeTxSorted.forEach((tx) => {
      const txDate = new Date(tx.date);
      const yearsAgo = (todayMillis - txDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
      
      const priceInDisplay = convertValue(tx.price, tx.currency || 'EUR', selectedCurrency, tx.date);
      const commInDisplay = convertValue(tx.commission || 0, tx.commissionCurrency || tx.currency || 'EUR', selectedCurrency, tx.date);

      const isIncoming = tx.type === TransactionType.BUY || tx.type === TransactionType.TRANSFER_IN;
      const cfAmount = isIncoming
        ? -(tx.qty * priceInDisplay + (includeCommissions ? commInDisplay : 0))
        : (tx.qty * priceInDisplay - (includeCommissions ? commInDisplay : 0));

      solverFlows.push({ years: yearsAgo, amount: cfAmount });
    });

    if (includeCommissions) {
      activeOtherCosts.forEach((c) => {
        const costDate = new Date(c.date);
        const yearsAgo = (todayMillis - costDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
        const amountInDisplay = convertValue(c.amount || 0, c.currency || 'EUR', selectedCurrency, c.date);
        solverFlows.push({ years: yearsAgo, amount: -amountInDisplay });
      });
    }

    const f = (r: number) => {
      let sum = totalNominalValue;
      for (const flow of solverFlows) {
        sum += flow.amount * Math.pow(1 + r, flow.years);
      }
      return sum;
    };

    // Bisection Solver
    let low = -0.99;
    let high = 2.5; // Up to 250% returns
    let f_low = f(low);
    let f_high = f(high);

    if (f_low * f_high > 0) {
      high = 6.0;
      f_high = f(high);
    }

    if (f_low * f_high > 0) return percentageReturn / 100; // Fallback to raw total return

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

  const mwrrReturn = calculateMWRR();

  // VOLATILITY & MAX DRAWDOWN CALCULATOR
  const getTimelineBalances = (): DailyBalance[] => {
    if (activeTxSorted.length === 0) return [];
    
    const timeline: DailyBalance[] = [];
    const oldestDateStr = activeTxSorted[0].date.split('T')[0];
    const dates: string[] = [];
    const endStr = new Date().toISOString().split('T')[0];

    // Perfect UTC-safe chronological day generator
    let temp = new Date(oldestDateStr + 'T00:00:00Z');
    const targetEnd = new Date(endStr + 'T00:00:00Z');

    while (temp <= targetEnd) {
      dates.push(temp.toISOString().split('T')[0]);
      temp.setUTCDate(temp.getUTCDate() + 1);
    }

    let runningInflationMultiplier = 1.0;
    let prevYear: number | null = null;
    let prevMonth: number | null = null;
    let cumulativeCommissions = 0;
    let cumulativeOtherCosts = 0;

    let prevDateString: string | null = null;
    let benchNAV = 100;

    const targetId = activeBenchmark;
    const isBenchPortfolio = activeBenchmark !== 'NONE' && activeBenchmark !== 'TICKER';

    dates.forEach((dateString) => {
      // 1. Accumulate chronological inflation step-by-step (past to present)
      const tDate = new Date(dateString + 'T00:00:00Z');
      const curYear = tDate.getUTCFullYear();
      const curMonth = tDate.getUTCMonth() + 1;

      if (prevYear !== null && prevMonth !== null && (curYear !== prevYear || curMonth !== prevMonth)) {
        const activeInf = db.settings.inflationIndices.find(idx => idx?.id === db.settings.selectedInflationId);
        const rate = getMonthlyInflationRate(activeInf, prevYear, prevMonth);
        runningInflationMultiplier *= (1 + rate);
      }
      
      prevYear = curYear;
      prevMonth = curMonth;

      // Calculate exact holdings on this day using our centralized lot calculator
      const { tickerHoldings: dayHoldings } = calculateHoldingsAndLots(
        db.transactions,
        activePortIds,
        convertValue,
        selectedCurrency,
        activeTargetSymbolFilter,
        dateString
      );

      // Valuate holdings on this day
      let dayNominalBasis = 0;
      let dayValue = 0;

      Object.keys(dayHoldings).forEach((sym) => {
        const h = dayHoldings[sym];
        if (h.sharesOwned <= 0) return;

        dayNominalBasis += h.totalCapitalInvested;

        const tickerCurrency = getTickerCurrency(sym);
        const fallbackPriceNative = convertValue(h.pmc, selectedCurrency, tickerCurrency, dateString);
        const dailyPrice = getPriceForDate(sym, dateString, fallbackPriceNative > 0 ? fallbackPriceNative : 100);
        const dailyPriceInDisplay = convertValue(dailyPrice, tickerCurrency, selectedCurrency, dateString);
        dayValue += (h.sharesOwned * dailyPriceInDisplay);
      });

      // Accumulate transactions commissions on this day
      const txsOnDay = activeTxSorted.filter(t => t.date.split('T')[0] === dateString);
      txsOnDay.forEach((tx) => {
        const commInDisplay = convertValue(tx.commission || 0, tx.commissionCurrency || tx.currency || 'EUR', selectedCurrency, dateString);
        cumulativeCommissions += commInDisplay;
      });

      // Cumulative other costs (taxes, fees, bolli) on this day chronologically
      const otherCostsOnDay = activeOtherCosts.filter(c => c.date.split('T')[0] === dateString);
      otherCostsOnDay.forEach((c) => {
        const costInDisplay = convertValue(c.amount || 0, c.currency || 'EUR', selectedCurrency, dateString);
        cumulativeOtherCosts += costInDisplay;
      });

      // Cumulative net capital invested up to dateString (Buys - Sells across active scope)
      let dayNetInvested = 0;
      activeTxSorted.forEach((tx) => {
        const txDate = tx.date.split('T')[0];
        if (txDate > dateString) return;
        if (activeTargetSymbolFilter && !matchesSymbol(tx.symbol, activeTargetSymbolFilter)) return;

        const valInDisplay = convertValue(
          tx.qty * tx.price,
          tx.currency || 'EUR',
          selectedCurrency,
          txDate
        );

        if (tx.type === TransactionType.BUY) {
          dayNetInvested += valInDisplay;
        } else if (tx.type === TransactionType.SELL) {
          dayNetInvested -= valInDisplay;
        } else if (tx.type === TransactionType.TRANSFER_IN) {
          const peerTx = db.transactions.find(t => t.id === tx.transferOutTransactionId);
          const isInternal = peerTx && activePortIds.includes(peerTx.portfolioId);
          if (!isInternal) {
            const transCap = getTransferEffectiveCapital(tx, db.transactions, selectedCurrency, convertValue);
            dayNetInvested += transCap;
          }
        } else if (tx.type === TransactionType.TRANSFER_OUT) {
          const peerTx = db.transactions.find(t => t.id === tx.transferInTransactionId);
          const isInternal = peerTx && activePortIds.includes(peerTx.portfolioId);
          if (!isInternal) {
            const transCap = getTransferEffectiveCapital(tx, db.transactions, selectedCurrency, convertValue);
            dayNetInvested -= transCap;
          }
        }
      });
      dayNetInvested = cleanFloatNoise(dayNetInvested);

      // If on this day no holdings remain in the active perimeter, invested capital is 0
      if (dayNominalBasis <= 1e-12) {
        dayNetInvested = 0;
      }

      // Adjust currentValue and realValueBased based on active includeCommissions setting
      const finalDayValue = dayValue - (includeCommissions ? (cumulativeCommissions + cumulativeOtherCosts) : 0);
      const realValInflatedDiscount = finalDayValue / runningInflationMultiplier;

      // Benchmark NAV tracking
      let benchClosingNormalized = undefined;
      if (isBenchPortfolio && prevDateString) {
        const { tickerHoldings: prevBenchHoldings } = calculateHoldingsAndLots(
          db.transactions,
          [targetId, 'p-' + targetId],
          convertValue,
          selectedCurrency,
          null,
          prevDateString
        );

        let prevHoldingsValuedAtToday = 0;
        let prevHoldingsValuedAtYesterday = 0;

        Object.keys(prevBenchHoldings).forEach((sym) => {
          const bh = prevBenchHoldings[sym];
          if (bh.sharesOwned <= 0) return;

          const tickerCurrency = getTickerCurrency(sym);
          const priceToday = getPriceForDate(sym, dateString, 100);
          const priceTodayInDisplay = convertValue(priceToday, tickerCurrency, selectedCurrency, dateString);

          const priceYesterday = getPriceForDate(sym, prevDateString!, 100);
          const priceYesterdayInDisplay = convertValue(priceYesterday, tickerCurrency, selectedCurrency, prevDateString!);

          prevHoldingsValuedAtToday += bh.sharesOwned * priceTodayInDisplay;
          prevHoldingsValuedAtYesterday += bh.sharesOwned * priceYesterdayInDisplay;
        });

        if (prevHoldingsValuedAtYesterday > 0) {
          const benchReturn = (prevHoldingsValuedAtToday - prevHoldingsValuedAtYesterday) / prevHoldingsValuedAtYesterday;
          benchNAV = benchNAV * (1 + benchReturn);
        }
        benchClosingNormalized = benchNAV;
      } else if (activeBenchmark === 'TICKER' && benchmarkSymbol) {
        const rawBenchPrice = getPriceForDate(benchmarkSymbol, dateString, 100);
        const benchCurr = benchmarkSymbol.toUpperCase().endsWith('.MI') ? 'EUR' : 'USD';
        benchClosingNormalized = convertValue(rawBenchPrice, benchCurr, selectedCurrency, dateString);
      }

      prevDateString = dateString;

      timeline.push({
        date: dateString,
        investedNominal: dayNetInvested,
        investedWithCommissions: dayNetInvested + (includeCommissions ? (cumulativeCommissions + cumulativeOtherCosts) : 0),
        currentValue: finalDayValue,
        realValueAdjusted: realValInflatedDiscount,
        benchmarkValue: benchClosingNormalized
      });
    });

    return timeline;
  };

  const dailyBalances = getTimelineBalances();

  // Calculating Volatility & Drawdown series
  const computeVolatilityAndDrawdownStats = () => {
    if (dailyBalances.length < 2) return { volatility: 0, maxDrawdown: 0 };

    let runningMax = -Infinity;
    let maxDrawdown = 0;
    const dailyReturns: number[] = [];

    dailyBalances.forEach((bal, i) => {
      // Volatility daily gains (exclude entries to suppress noise spikes)
      if (i > 0) {
        const prevBal = dailyBalances[i - 1].currentValue;
        if (prevBal > 100) {
          const investedDiffOnDay = (bal.investedNominal - dailyBalances[i - 1].investedNominal);
          // If transaction money injection, adjust return
          const rawReturn = (bal.currentValue - investedDiffOnDay - prevBal) / prevBal;
          dailyReturns.push(rawReturn);
        }
      }

      // Peak comparison for Max Drawdown
      const cur = bal.currentValue;
      if (cur > runningMax) {
        runningMax = cur;
      }
      if (runningMax > 0) {
        const dd = (runningMax - cur) / runningMax;
        if (dd > maxDrawdown) {
          maxDrawdown = dd;
        }
      }
    });

    // Standard deviation of daily returns
    let volatility = 0;
    if (dailyReturns.length > 2) {
      const avg = dailyReturns.reduce((sum, v) => sum + v, 0) / dailyReturns.length;
      const variance = dailyReturns.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / (dailyReturns.length - 1);
      // Annualize (daily stdDev * sqrt(252 trading days))
      volatility = Math.sqrt(variance) * Math.sqrt(252) * 100;
    }

    return {
      volatility: isNaN(volatility) ? 0 : volatility,
      maxDrawdown: maxDrawdown * 100
    };
  };

  const { volatility, maxDrawdown } = computeVolatilityAndDrawdownStats();

  const overallPortfolioPerformance = useMemo(() => {
    return calculatePortfolioPerformance(
      dailyBalances,
      db.transactions,
      activePortIds,
      activeOtherCosts,
      includeCommissions,
      selectedCurrency,
      convertValue,
      undefined,
      undefined,
      activeTargetSymbolFilter
    );
  }, [dailyBalances, db.transactions, activePortIds, activeOtherCosts, includeCommissions, selectedCurrency, convertValue, activeTargetSymbolFilter]);

  // Allocation matrix
  const getAssetAllocationMatrix = () => {
    if (totalNominalValue === 0) return [];

    if (isAggregatedView) {
      const aggPositions = buildAggregatedPositions(
        tickerMetrics,
        db.instrumentGroups || [],
        totalNominalValue,
        true
      );

      return aggPositions.map((pos) => {
        const dbTarget = db.settings?.targetWeights?.[pos.symbol]
          ?? db.settings?.targetWeights?.[pos.symbol.toUpperCase()]
          ?? (pos.groupId ? db.settings?.targetWeights?.[pos.groupId] : undefined);
        const targetPercent = dbTarget !== undefined 
          ? dbTarget 
          : (localStorage.getItem(`gainbusters_target_weight_${pos.symbol}`) ? Number(localStorage.getItem(`gainbusters_target_weight_${pos.symbol}`)) : 0);

        return {
          symbol: pos.symbol,
          value: pos.totalNominalValue,
          weight: pos.weight,
          target: targetPercent,
          isGroup: pos.isGroup,
          groupId: pos.groupId,
          constituentSymbols: pos.constituentSymbols,
          constituents: pos.constituents?.map(c => ({
            symbol: c.symbol,
            value: c.totalNominalValue,
            weight: c.weightInPortfolio,
            weightInGroup: c.weightInGroup
          }))
        };
      });
    }

    const allocations: any[] = [];
    Object.keys(tickerMetrics).forEach((sym) => {
      const met = tickerMetrics[sym];
      if (met.sharesOwned <= 0) return;

      const tickerCurrency = getTickerCurrency(sym);
      const priceMap = db.priceCache[sym] || {};
      const todayPrice = priceMap[todayStr] ?? getPriceForDate(sym, todayStr, convertValue(met.pmc, selectedCurrency, tickerCurrency, todayStr));
      const todayPriceInDisplay = convertValue(todayPrice, tickerCurrency, selectedCurrency, todayStr);
      const val = met.sharesOwned * todayPriceInDisplay;
      const weightPercent = (val / totalNominalValue) * 100;

      // Deduce target weight or default to even share splits
      const dbTarget = db.settings?.targetWeights?.[sym]
        ?? db.settings?.targetWeights?.[sym.toUpperCase()];
      const targetPercent = dbTarget !== undefined 
        ? dbTarget 
        : (localStorage.getItem(`gainbusters_target_weight_${sym}`) ? Number(localStorage.getItem(`gainbusters_target_weight_${sym}`)) : 0);

      allocations.push({
        symbol: sym,
        value: val,
        weight: weightPercent,
        target: targetPercent,
        isGroup: false
      });
    });

    return allocations;
  };

  const assetAllocation = getAssetAllocationMatrix();

  const handleUpdateTargetWeight = async (symbolOrKey: string, val: number) => {
    const currentDb = dbRef.current || db;
    const cleanVal = isNaN(val) ? 0 : Math.max(0, Math.min(100, val));
    const upperKey = (symbolOrKey || '').toUpperCase().trim();
    const updatedSettings = {
      ...currentDb.settings,
      targetWeights: {
        ...(currentDb.settings?.targetWeights || {}),
        [symbolOrKey]: cleanVal,
        [upperKey]: cleanVal
      }
    };
    const updatedDb = {
      ...currentDb,
      settings: updatedSettings
    };
    await saveDatabaseState(updatedDb);
  };

  const handleToggleAggregatedView = async () => {
    const nextVal = !isAggregatedView;
    setIsAggregatedView(nextVal);
    const currentDb = dbRef.current || db;
    const updatedDb = {
      ...currentDb,
      settings: {
        ...currentDb.settings,
        aggregateInstrumentsView: nextVal
      }
    };
    await saveDatabaseState(updatedDb);
  };

  const handleSaveInstrumentGroup = async (group: InstrumentGroup) => {
    const currentDb = dbRef.current || db;
    const existingGroups = currentDb.instrumentGroups || [];
    const idx = existingGroups.findIndex(g => g.id === group.id);
    let updatedGroups: InstrumentGroup[];
    if (idx >= 0) {
      updatedGroups = [...existingGroups];
      updatedGroups[idx] = group;
    } else {
      updatedGroups = [...existingGroups, group];
    }
    const updatedDb = {
      ...currentDb,
      instrumentGroups: updatedGroups
    };
    await saveDatabaseState(updatedDb);
  };

  const handleDeleteInstrumentGroup = async (groupId: string) => {
    const currentDb = dbRef.current || db;
    const updatedGroups = (currentDb.instrumentGroups || []).filter(g => g.id !== groupId);
    const updatedDb = {
      ...currentDb,
      instrumentGroups: updatedGroups
    };
    if (dashFilter.type === 'GROUP' && dashFilter.id === groupId) {
      setDashFilter({ type: 'ALL', id: '' });
    }
    await saveDatabaseState(updatedDb);
  };

  const handleToggleCommissions = async () => {
    const nextVal = !includeCommissions;
    setIncludeCommissions(nextVal);
    
    const currentDb = dbRef.current || db;
    const updatedSettings = {
      ...currentDb.settings,
      includeCommissions: nextVal
    };
    const updatedDb = {
      ...currentDb,
      settings: updatedSettings
    };
    await saveDatabaseState(updatedDb);
  };

  // ================= GENERAL MUTATORS & CENTRAL PERSISTENCE =================

  const saveDatabaseState = useCallback(async (newDb: DBState) => {
    try {
      dbRef.current = newDb;
      lastPersistedDbJsonRef.current = JSON.stringify(newDb);
      setDb(newDb);
      await storageService.saveDatabaseState(newDb);
    } catch (err) {
      console.error('[App] Failed to save database state:', err);
    }
  }, []);

  // Centralized safety net: guarantees that ANY modification to db state is automatically persisted perennially
  useEffect(() => {
    if (!isAuthenticated || isInitialHydrationRef.current) return;
    try {
      const currentJson = JSON.stringify(db);
      if (currentJson && currentJson !== lastPersistedDbJsonRef.current) {
        lastPersistedDbJsonRef.current = currentJson;
        const timer = setTimeout(() => {
          const fresh = dbRef.current || db;
          storageService.saveDatabaseState(fresh).catch(err => {
            console.error('[Central Persistence Safety Net] Auto-save error:', err);
          });
        }, 300);
        return () => clearTimeout(timer);
      }
    } catch (e) {
      console.warn('[Central Persistence Safety Net] State serialization check failed:', e);
    }
  }, [db, isAuthenticated]);

  // Accounts CRUD
  const saveAccountMutation = () => {
    if (!accountForm.name.trim()) return;
    const currentDb = dbRef.current || db;
    const newAccounts = [...currentDb.accounts];
    if (accountForm.editId) {
      const idx = newAccounts.findIndex(a => a.id === accountForm.editId);
      if (idx !== -1) {
        newAccounts[idx] = {
          ...newAccounts[idx],
          name: accountForm.name,
          currency: accountForm.currency,
          includeInDashboard: accountForm.include
        };
      }
    } else {
      newAccounts.push({
        id: 'acc-' + Math.random().toString(36).substring(2, 9),
        name: accountForm.name,
        currency: accountForm.currency,
        includeInDashboard: accountForm.include
      });
    }
    const updated = { ...currentDb, accounts: newAccounts };
    saveDatabaseState(updated);
    setAccountForm({ open: false, editId: null, name: '', currency: Currency.EUR, include: true });
  };

  const deleteAccountMutation = (id: string) => {
    const currentDb = dbRef.current || db;
    const freshAccounts = currentDb.accounts.filter(a => a.id !== id);
    // Cascade delete linked portfolios & transactions
    const linkedPorts = currentDb.portfolios.filter(p => p.accountId === id);
    const linkedPortIds = linkedPorts.map(p => p.id);
    const freshPortfolios = currentDb.portfolios.filter(p => p.accountId !== id);
    const freshTx = currentDb.transactions.filter(t => !linkedPortIds.includes(t.portfolioId));

    const updated = { ...currentDb, accounts: freshAccounts, portfolios: freshPortfolios, transactions: freshTx };
    saveDatabaseState(updated);
  };

  // Portfolios CRUD
  const savePortfolioMutation = () => {
    if (!portfolioForm.name.trim() || !portfolioForm.accountId) return;
    const currentDb = dbRef.current || db;
    const newPorts = [...currentDb.portfolios];
    if (portfolioForm.editId) {
      const idx = newPorts.findIndex(p => p.id === portfolioForm.editId);
      if (idx !== -1) {
        newPorts[idx] = {
          ...newPorts[idx],
          accountId: portfolioForm.accountId,
          name: portfolioForm.name,
          includeInDashboard: portfolioForm.include
        };
      }
    } else {
      newPorts.push({
        id: 'port-' + Math.random().toString(36).substring(2, 9),
        accountId: portfolioForm.accountId,
        name: portfolioForm.name,
        includeInDashboard: portfolioForm.include
      });
    }
    const updated = { ...currentDb, portfolios: newPorts };
    saveDatabaseState(updated);
    setPortfolioForm({ open: false, editId: null, accountId: '', name: '', include: true });
  };

  const deletePortfolioMutation = (id: string) => {
    const currentDb = dbRef.current || db;
    const freshPorts = currentDb.portfolios.filter(p => p.id !== id);
    const freshTx = currentDb.transactions.filter(t => t.portfolioId !== id);
    const updated = { ...currentDb, portfolios: freshPorts, transactions: freshTx };
    saveDatabaseState(updated);
  };

  const getLatestPriceInfo = (sym: string): { price: number; date: string } | null => {
    const symbolCache = db.priceCache[sym.toUpperCase()];
    if (!symbolCache) return null;
    const dates = Object.keys(symbolCache).filter(d => symbolCache[d] !== undefined && symbolCache[d] !== null);
    if (dates.length === 0) return null;
    
    // sort descending chronologically
    const sortedDates = dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    const newestDate = sortedDates[0];
    return {
      price: symbolCache[newestDate],
      date: newestDate
    };
  };

  const handleTxSort = (field: string) => {
    if (txSortField === field) {
      setTxSortAsc(!txSortAsc);
    } else {
      setTxSortField(field);
      setTxSortAsc(true);
    }
  };

  const getProcessedTransactions = () => {
    let list = [...db.transactions];

    // Filter by Broker/Account
    if (txFilterBrokerId) {
      const brokerPortfolios = db.portfolios.filter(p => p.accountId === txFilterBrokerId).map(p => p.id);
      list = list.filter(tx => brokerPortfolios.includes(tx.portfolioId));
    }

    // Filter by Portfolio
    if (txFilterPortfolioId) {
      list = list.filter(tx => tx.portfolioId === txFilterPortfolioId);
    }

    // Filter by Type
    if (txFilterTypes.length > 0) {
      list = list.filter(tx => txFilterTypes.includes(tx.type));
    }

    // Filter by Ticker
    if (txFilterTickers.length > 0) {
      list = list.filter(tx => txFilterTickers.includes(tx.symbol.toUpperCase()));
    }

    // Filter by Start Date
    if (txFilterDateStart) {
      const startSec = new Date(txFilterDateStart).getTime();
      list = list.filter(tx => new Date(tx.date.split('T')[0]).getTime() >= startSec);
    }

    // Filter by End Date
    if (txFilterDateEnd) {
      const endSec = new Date(txFilterDateEnd).getTime();
      list = list.filter(tx => new Date(tx.date.split('T')[0]).getTime() <= endSec);
    }

    // Sort column
    list.sort((a, b) => {
      let valA: any = a[txSortField as keyof Transaction] ?? '';
      let valB: any = b[txSortField as keyof Transaction] ?? '';

      if (txSortField === 'portfolio') {
        const portA = db.portfolios.find(p => p.id === a.portfolioId)?.name || '';
        const portB = db.portfolios.find(p => p.id === b.portfolioId)?.name || '';
        valA = portA;
        valB = portB;
      }

      if (txSortField === 'latestPrice') {
        const newestA = getLatestPriceInfo(a.symbol)?.price ?? 0;
        const newestB = getLatestPriceInfo(b.symbol)?.price ?? 0;
        valA = newestA;
        valB = newestB;
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        return txSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else if (typeof valA === 'number' && typeof valB === 'number') {
        return txSortAsc ? valA - valB : valB - valA;
      } else {
        const timeA = new Date(valA).getTime() || 0;
        const timeB = new Date(valB).getTime() || 0;
        return txSortAsc ? timeA - timeB : timeB - timeA;
      }
    });

    return list;
  };

  // Transactions CRUD
  const saveTransactionMutation = () => {
    setFormErr('');
    const txQty = Number(txForm.qty);
    const txPrice = Number(txForm.price);
    const isDividend = txForm.type === TransactionType.DIVIDEND;
    const finalQty = isDividend && (isNaN(txQty) || txQty <= 0) ? 1 : txQty;

    if (!txForm.portfolioId || !txForm.symbol.trim() || finalQty <= 0 || txPrice <= 0) {
      setFormErr(t.validationErrorAllFieldsRequired);
      return;
    }
    
    const currentDb = dbRef.current || db;
    let updatedTxList = [...currentDb.transactions];
    
    if (txForm.editId) {
      // Edit mode
      updatedTxList = currentDb.transactions.map((t) => {
        if (t.id === txForm.editId) {
          return {
            ...t,
            portfolioId: txForm.portfolioId,
            date: txForm.date || new Date().toISOString(),
            type: txForm.type,
            symbol: txForm.symbol.trim().toUpperCase(),
            qty: finalQty,
            price: Number(txForm.price),
            commission: Number(txForm.commission || 0),
            currency: txForm.currency,
            commissionCurrency: txForm.commissionCurrency,
            notes: txForm.notes
          };
        }
        return t;
      });
    } else {
      // Create mode
      const newTx: Transaction = {
        id: 'tx-' + Math.random().toString(36).substring(2, 9),
        portfolioId: txForm.portfolioId,
        date: txForm.date || new Date().toISOString(),
        type: txForm.type,
        symbol: txForm.symbol.trim().toUpperCase(),
        qty: finalQty,
        price: Number(txForm.price),
        commission: Number(txForm.commission || 0),
        currency: txForm.currency,
        commissionCurrency: txForm.commissionCurrency,
        notes: txForm.notes
      };
      updatedTxList.push(newTx);
    }

    const updated = { ...currentDb, transactions: updatedTxList };
    saveDatabaseState(updated);
    
    // Close & Trigger Prices Retrieval
    setTxForm({ open: false, editId: null, portfolioId: '', date: '', type: TransactionType.BUY, symbol: '', qty: 0, price: 0, commission: 0, currency: 'EUR', commissionCurrency: 'EUR', notes: '' });
    triggerPriceSync(updated);
  };

  const deleteTransactionMutation = (id: string) => {
    const currentDb = dbRef.current || db;
    const txToDelete = currentDb.transactions.find(t => t.id === id);
    let idsToDelete = [id];
    let transferIdsToDelete: string[] = [];

    if (txToDelete) {
      if (txToDelete.transferId) {
        transferIdsToDelete.push(txToDelete.transferId);
        currentDb.transactions.forEach(t => {
          if (t.transferId === txToDelete.transferId) {
            idsToDelete.push(t.id);
          }
        });
      }
      if (txToDelete.transferInTransactionId) idsToDelete.push(txToDelete.transferInTransactionId);
      if (txToDelete.transferOutTransactionId) idsToDelete.push(txToDelete.transferOutTransactionId);
    }

    const freshTx = currentDb.transactions.filter(t => !idsToDelete.includes(t.id));
    const freshTransfers = (currentDb.transfers || []).filter(tr =>
      !transferIdsToDelete.includes(tr.id) &&
      !idsToDelete.includes(tr.id) &&
      !idsToDelete.includes(tr.transferOutTransactionId || '') &&
      !idsToDelete.includes(tr.transferInTransactionId || '')
    );
    const updated = { ...currentDb, transactions: freshTx, transfers: freshTransfers };
    saveDatabaseState(updated);
  };

  const deleteTransferMutation = (transferId: string) => {
    const currentDb = dbRef.current || db;
    const transfer = (currentDb.transfers || []).find(t => t.id === transferId);
    let txOutId = transfer?.transferOutTransactionId;
    let txInId = transfer?.transferInTransactionId;

    if (!transfer) {
      const tx = currentDb.transactions.find(t => t.id === transferId);
      if (tx) {
        if (tx.type === TransactionType.TRANSFER_OUT) {
          txOutId = tx.id;
          txInId = tx.transferInTransactionId;
        } else if (tx.type === TransactionType.TRANSFER_IN) {
          txInId = tx.id;
          txOutId = tx.transferOutTransactionId;
        }
      }
    }

    const freshTransfers = (currentDb.transfers || []).filter(t => t.id !== transferId && (txOutId ? t.transferOutTransactionId !== txOutId : true));
    const freshTx = currentDb.transactions.filter(t =>
      (txOutId ? t.id !== txOutId : true) &&
      (txInId ? t.id !== txInId : true) &&
      t.transferId !== transferId
    );
    const updated = { ...currentDb, transactions: freshTx, transfers: freshTransfers };
    saveDatabaseState(updated);
  };

  const getAvailableLots = (symbol: string, portfolioId: string, excludeTransferId?: string | null) => {
    return getAvailableLotsForTransfer(db.transactions, symbol, portfolioId, excludeTransferId);
  };

  const getAvailableTickersForSource = (srcPortId: string): string[] => {
    if (!srcPortId) return [];
    const allSymbols = Array.from(new Set(db.transactions.map(tx => tx.symbol.toUpperCase()))) as string[];
    return allSymbols.filter(sym => {
      const lots = getAvailableLots(sym, srcPortId);
      const total = lots.reduce((s, l) => s + l.availableQty, 0);
      return total > 0;
    });
  };

  const getTypeBadgeClass = (type: TransactionType) => {
    switch (type) {
      case TransactionType.BUY:
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case TransactionType.SELL:
        return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
      case TransactionType.DIVIDEND:
        return 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20';
      case TransactionType.TRANSFER_IN:
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      case TransactionType.TRANSFER_OUT:
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      default:
        return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
    }
  };

  const getTypeLabel = (type: TransactionType) => {
    switch (type) {
      case TransactionType.BUY:
        return t.buyBtn || 'BUY';
      case TransactionType.SELL:
        return t.sellBtn || 'SELL';
      case TransactionType.DIVIDEND:
        return t.dividendLabel || 'DIVIDEND';
      case TransactionType.TRANSFER_IN:
        return t.transferInBadge || 'TRANSFER IN';
      case TransactionType.TRANSFER_OUT:
        return t.transferOutBadge || 'TRANSFER OUT';
      default:
        return type;
    }
  };

  const handleOpenNewDividend = (portfolioId?: string) => {
    const targetPortId = portfolioId || (db.portfolios[0]?.id || '');
    const prt = db.portfolios.find(p => p.id === targetPortId);
    const acc = prt ? db.accounts.find(a => a.id === prt.accountId) : null;
    const accCurr = acc?.currency || db.settings.defaultCurrency || 'EUR';
    setTxForm({
      open: true,
      editId: null,
      portfolioId: targetPortId,
      date: new Date().toISOString().substring(0, 16),
      type: TransactionType.DIVIDEND,
      symbol: '',
      qty: '1',
      price: '',
      commission: '',
      currency: accCurr,
      commissionCurrency: accCurr,
      notes: ''
    });
    setFormErr('');
  };

  const saveTransferMutation = () => {
    setFormErr('');
    const {
      editTransferId,
      sourcePortfolioId,
      destPortfolioId,
      symbol,
      qty,
      date,
      criteria,
      price,
      priceCurrency,
      sourceCommission,
      sourceCommissionCurrency,
      sourceCommissionPaymentMode,
      destCommission,
      destCommissionCurrency,
      destCommissionPaymentMode,
      notes
    } = transferForm;

    const parsedQty = Number(qty);
    const parsedPrice = price !== '' && price !== undefined ? Number(price) : undefined;
    const parsedSourceCommission = sourceCommission !== '' && sourceCommission !== undefined ? Number(sourceCommission) : 0;
    const parsedDestCommission = destCommission !== '' && destCommission !== undefined ? Number(destCommission) : 0;

    if (!sourcePortfolioId || !destPortfolioId || !symbol.trim() || parsedQty <= 0 || !date) {
      setFormErr(t.validationErrorAllFieldsRequired || 'Tutti i campi obbligatori devono essere compilati.');
      return;
    }

    if (sourcePortfolioId === destPortfolioId) {
      setFormErr(t.samePortfolioError || 'I portafogli di origine e destinazione devono essere diversi.');
      return;
    }

    const sourcePort = db.portfolios.find(p => p.id === sourcePortfolioId);
    const destPort = db.portfolios.find(p => p.id === destPortfolioId);
    const sourceAcc = sourcePort ? db.accounts.find(a => a.id === sourcePort.accountId) : null;
    const destAcc = destPort ? db.accounts.find(a => a.id === destPort.accountId) : null;
    const sourceCurr = sourceAcc?.currency || db.settings.defaultCurrency || 'EUR';
    const destCurr = destAcc?.currency || db.settings.defaultCurrency || 'EUR';

    try {
      const currentDb = dbRef.current || db;
      const { newTransactions, singleTransfer } = executeTransferTransactionPair({
        allTransactions: currentDb.transactions,
        editTransferId,
        sourcePortfolioId,
        destPortfolioId,
        symbol: symbol.toUpperCase().trim(),
        qty: parsedQty,
        date: date || new Date().toISOString(),
        criteria,
        price: parsedPrice,
        priceCurrency: priceCurrency || sourceCurr,
        sourceCommission: parsedSourceCommission,
        sourceCommissionCurrency: sourceCommissionCurrency || sourceCurr,
        sourceCommissionPaymentMode: sourceCommissionPaymentMode || 'EXTERNAL',
        destCommission: parsedDestCommission,
        destCommissionCurrency: destCommissionCurrency || destCurr,
        destCommissionPaymentMode: destCommissionPaymentMode || 'EXTERNAL',
        notes: notes || '',
        sourceCurr,
        destCurr
      });

      // Filter out old child transactions if editing
      const baseTxList = editTransferId
        ? currentDb.transactions.filter(t => t.transferId !== editTransferId && t.id !== editTransferId)
        : currentDb.transactions;
      const updatedTxList = [...baseTxList, ...newTransactions];

      // Update transfers array: exactly 1 Transfer record for this operation
      const baseTransferList = editTransferId
        ? (currentDb.transfers || []).filter(tr => tr.id !== editTransferId)
        : (currentDb.transfers || []);
      const updatedTransferList = [...baseTransferList, singleTransfer];

      const updated: DBState = { ...currentDb, transactions: updatedTxList, transfers: updatedTransferList };
      saveDatabaseState(updated);

      // Reset Form
      setTransferForm({
        open: false,
        editTransferId: null,
        sourcePortfolioId: '',
        destPortfolioId: '',
        symbol: '',
        qty: '',
        price: '',
        priceCurrency: 'EUR',
        sourceCommission: '',
        sourceCommissionCurrency: 'EUR',
        sourceCommissionPaymentMode: 'EXTERNAL',
        destCommission: '',
        destCommissionCurrency: 'EUR',
        destCommissionPaymentMode: 'EXTERNAL',
        criteria: 'FIFO',
        date: new Date().toISOString().slice(0, 16),
        notes: ''
      });
      triggerPriceSync(updated);
    } catch (err: any) {
      setFormErr(err.message || 'Errore durante il salvataggio del trasferimento.');
    }
  };

  const getTransferPeerInfo = (tx: Transaction) => {
    if (tx.type === TransactionType.TRANSFER_OUT && tx.transferInTransactionId) {
      const peer = db.transactions.find(t => t.id === tx.transferInTransactionId);
      const peerPort = peer ? db.portfolios.find(p => p.id === peer.portfolioId) : null;
      return peerPort ? `→ ${peerPort.name}` : '';
    }
    if (tx.type === TransactionType.TRANSFER_IN && tx.transferOutTransactionId) {
      const peer = db.transactions.find(t => t.id === tx.transferOutTransactionId);
      const peerPort = peer ? db.portfolios.find(p => p.id === peer.portfolioId) : null;
      return peerPort ? `← ${peerPort.name}` : '';
    }
    return null;
  };

  const allActiveLotsMap = useMemo(() => {
    const allPortIds = db.portfolios.map(p => p.id);
    const { activeLots } = calculateHoldingsAndLots(db.transactions, allPortIds, convertValue, selectedCurrency);
    const map = new Map<string, number>();
    activeLots.forEach(l => {
      map.set(l.id, l.remainingQty);
    });
    return map;
  }, [db.transactions, db.portfolios, convertValue, selectedCurrency]);

  const getLotStatus = (tx: Transaction) => {
    if (tx.type !== TransactionType.BUY && tx.type !== TransactionType.TRANSFER_IN) return null;
    const outgoingMatches = db.transactions.filter(out => out.parentTransactionId === tx.id && out.type === TransactionType.TRANSFER_OUT);
    const totalTransferred = outgoingMatches.reduce((sum, out) => sum + out.qty, 0);

    // If no outgoing transfers occurred from this lot, do not display transfer badge
    if (totalTransferred <= 1e-12) return null;

    // Remaining open shares for this lot in its portfolio (accounting for both sales and transfers)
    const remainingInPortfolio = allActiveLotsMap.get(tx.id) ?? 0;

    // If no shares of this lot remain open in the portfolio, all available shares were transferred
    if (remainingInPortfolio <= 1e-8) {
      return { status: 'FULLY_TRANSFERRED', depleted: totalTransferred, remaining: 0 };
    }
    return { status: 'PARTIALLY_TRANSFERRED', depleted: totalTransferred, remaining: remainingInPortfolio };
  };

  const getTransferRecords = (): TransferRecord[] => {
    const records: TransferRecord[] = [];

    // STRICTLY iterate over db.transfers: exactly one row per Transfer entity created by user
    (db.transfers || []).forEach((tr) => {
      const srcPort = db.portfolios.find(p => p.id === tr.sourcePortfolioId);
      const srcBroker = srcPort ? db.accounts.find(a => a.id === srcPort.accountId) : null;

      const dstPort = db.portfolios.find(p => p.id === tr.destPortfolioId);
      const dstBroker = dstPort ? db.accounts.find(a => a.id === dstPort.accountId) : null;

      // Find child transactions for this transfer entity
      const childOutTx = db.transactions.filter(t => t.transferId === tr.id && t.type === TransactionType.TRANSFER_OUT);
      const childInTx = db.transactions.filter(t => t.transferId === tr.id && t.type === TransactionType.TRANSFER_IN);
      const childCount = childOutTx.length > 0 ? childOutTx.length : (tr.childTransactionIds ? Math.floor(tr.childTransactionIds.length / 2) : 1);

      records.push({
        id: tr.id,
        date: tr.date,
        symbol: tr.symbol,
        qty: tr.qty,
        price: tr.price,
        priceCurrency: tr.priceCurrency || db.settings.defaultCurrency || 'EUR',
        sourcePortfolioId: tr.sourcePortfolioId,
        sourcePortfolioName: srcPort?.name || '---',
        sourceBrokerName: srcBroker?.name || '',
        destPortfolioId: tr.destPortfolioId,
        destPortfolioName: dstPort?.name || '---',
        destBrokerName: dstBroker?.name || '',
        sourceCommission: tr.sourceCommission || 0,
        sourceCommissionCurrency: tr.sourceCommissionCurrency || tr.priceCurrency || 'EUR',
        sourceCommissionPaymentMode: tr.sourceCommissionPaymentMode || 'EXTERNAL',
        destCommission: tr.destCommission || 0,
        destCommissionCurrency: tr.destCommissionCurrency || tr.priceCurrency || 'EUR',
        destCommissionPaymentMode: tr.destCommissionPaymentMode || 'EXTERNAL',
        criteria: tr.criteria || 'FIFO',
        notes: tr.notes || '',
        childCount: childCount > 0 ? childCount : 1,
        childLotsSummary: childOutTx.length > 1
          ? childOutTx.map(c => `${formatFullQuantity(c.qty)} (acq. ${formatDateString(c.originalBuyDate || c.date, lang)})`).join(', ')
          : undefined,
        txOutId: childOutTx[0]?.id || tr.transferOutTransactionId || '',
        txInId: childInTx[0]?.id || tr.transferInTransactionId || ''
      });
    });

    return records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  // Other Costs CRUD
  const saveCostMutation = () => {
    if (!costForm.amount || !costForm.portfolioId || !costForm.date) return;
    const currentDb = dbRef.current || db;
    const currentCosts = currentDb.otherCosts || [];
    let updatedCostsList = [...currentCosts];

    if (costForm.editId) {
      updatedCostsList = updatedCostsList.map((c) => {
        if (c.id === costForm.editId) {
          return {
            ...c,
            portfolioId: costForm.portfolioId,
            date: costForm.date,
            amount: Number(costForm.amount),
            currency: costForm.currency,
            type: costForm.type,
            notes: costForm.notes
          };
        }
        return c;
      });
    } else {
      const newCost = {
        id: 'cost-' + Math.random().toString(36).substring(2, 9),
        portfolioId: costForm.portfolioId,
        date: costForm.date,
        amount: Number(costForm.amount),
        currency: costForm.currency,
        type: costForm.type,
        notes: costForm.notes
      };
      updatedCostsList.push(newCost);
    }

    const updated = { ...currentDb, otherCosts: updatedCostsList };
    saveDatabaseState(updated);
    setCostForm({ open: false, editId: null, portfolioId: '', date: '', amount: 0, currency: 'EUR', type: 'bollo', notes: '' });
  };

  const deleteCostMutation = (id: string) => {
    const currentDb = dbRef.current || db;
    const currentCosts = currentDb.otherCosts || [];
    const freshCosts = currentCosts.filter(c => c.id !== id);
    const updated = { ...currentDb, otherCosts: freshCosts };
    saveDatabaseState(updated);
  };

  const requestDeleteCost = (id: string) => {
    setDeleteConfirm({
      open: true,
      type: 'cost',
      id,
      message: t.confirmDeleteCost
    });
  };

  const requestDeleteAccount = (id: string) => {
    setDeleteConfirm({
      open: true,
      type: 'broker',
      id,
      message: t.confirmDeleteBroker
    });
  };

  const requestDeletePortfolio = (id: string) => {
    setDeleteConfirm({
      open: true,
      type: 'portfolio',
      id,
      message: t.confirmDeletePortfolio
    });
  };

  const handleEditClick = (tx: Transaction) => {
    if (tx.type === TransactionType.TRANSFER_IN || tx.type === TransactionType.TRANSFER_OUT) {
      const parentTransfer = (db.transfers || []).find(tr => tr.id === tx.transferId);
      if (parentTransfer) {
        const srcMode = parentTransfer.sourceCommissionPaymentMode || 'EXTERNAL';
        const dstMode = parentTransfer.destCommissionPaymentMode || 'EXTERNAL';
        setTransferForm({
          open: true,
          editTransferId: parentTransfer.id,
          sourcePortfolioId: parentTransfer.sourcePortfolioId,
          destPortfolioId: parentTransfer.destPortfolioId,
          symbol: parentTransfer.symbol,
          qty: parentTransfer.qty.toString(),
          price: parentTransfer.price !== undefined ? parentTransfer.price.toString() : '',
          priceCurrency: parentTransfer.priceCurrency || 'EUR',
          sourceCommission: parentTransfer.sourceCommission !== undefined ? parentTransfer.sourceCommission.toString() : '',
          sourceCommissionCurrency: srcMode === 'ASSET' ? (parentTransfer.symbol || 'ASSET') : (parentTransfer.sourceCommissionCurrency || 'EUR'),
          sourceCommissionPaymentMode: srcMode,
          destCommission: parentTransfer.destCommission !== undefined ? parentTransfer.destCommission.toString() : '',
          destCommissionCurrency: dstMode === 'ASSET' ? (parentTransfer.symbol || 'ASSET') : (parentTransfer.destCommissionCurrency || 'EUR'),
          destCommissionPaymentMode: dstMode,
          date: parentTransfer.date.substring(0, 16),
          criteria: parentTransfer.criteria || 'FIFO',
          notes: parentTransfer.notes || ''
        });
        setFormErr('');
        return;
      }

      let txOut = tx;
      let txIn = tx;
      if (tx.type === TransactionType.TRANSFER_OUT) {
        const peer = db.transactions.find(t => t.id === tx.transferInTransactionId);
        if (peer) txIn = peer;
      } else {
        const peer = db.transactions.find(t => t.id === tx.transferOutTransactionId);
        if (peer) txOut = peer;
      }

      const sourcePort = db.portfolios.find(p => p.id === txOut.portfolioId);
      const sourceAcc = sourcePort ? db.accounts.find(a => a.id === sourcePort.accountId) : null;
      const destPort = db.portfolios.find(p => p.id === txIn.portfolioId);
      const destAcc = destPort ? db.accounts.find(a => a.id === destPort.accountId) : null;

      const sourceMode = txOut.commissionPaymentMode || (txOut.commissionCurrency && txOut.commissionCurrency.toUpperCase() === txOut.symbol.toUpperCase() ? 'ASSET' : 'EXTERNAL');
      const destMode = txIn.commissionPaymentMode || (txIn.commissionCurrency && txIn.commissionCurrency.toUpperCase() === txIn.symbol.toUpperCase() ? 'ASSET' : 'EXTERNAL');

      setTransferForm({
        open: true,
        editTransferId: txOut.transferId || txOut.id,
        sourcePortfolioId: txOut.portfolioId,
        destPortfolioId: txIn.portfolioId,
        symbol: txOut.symbol,
        qty: txOut.qty.toString(),
        price: txOut.price !== undefined ? txOut.price.toString() : '',
        priceCurrency: txOut.currency || sourceAcc?.currency || db.settings.defaultCurrency || 'EUR',
        sourceCommission: txOut.commission !== undefined ? txOut.commission.toString() : '',
        sourceCommissionCurrency: sourceMode === 'ASSET' ? txOut.symbol : (txOut.commissionCurrency || sourceAcc?.currency || db.settings.defaultCurrency || 'EUR'),
        sourceCommissionPaymentMode: sourceMode,
        destCommission: txIn.commission !== undefined ? txIn.commission.toString() : '',
        destCommissionCurrency: destMode === 'ASSET' ? txIn.symbol : (txIn.commissionCurrency || destAcc?.currency || db.settings.defaultCurrency || 'EUR'),
        destCommissionPaymentMode: destMode,
        date: txOut.date.substring(0, 16),
        criteria: txOut.transferCriteria || 'FIFO',
        notes: txOut.notes || ''
      });
      setFormErr('');
    } else {
      setTxForm({
        open: true,
        editId: tx.id,
        portfolioId: tx.portfolioId,
        date: tx.date.substring(0, 16),
        type: tx.type,
        symbol: tx.symbol,
        qty: tx.qty.toString(),
        price: tx.price.toString(),
        commission: tx.commission.toString(),
        currency: tx.currency || db.settings.defaultCurrency || 'EUR',
        commissionCurrency: tx.commissionCurrency || tx.currency || db.settings.defaultCurrency || 'EUR',
        notes: tx.notes || ''
      });
      setFormErr('');
    }
  };

  const handleImportTransfersList = (importedTransfers: Transfer[]) => {
    const currentTransfers = db.transfers || [];
    const currentTransactions = db.transactions || [];
    const newTransfers = [...currentTransfers];
    let newTransactions = [...currentTransactions];

    importedTransfers.forEach((tr) => {
      let existingTr = newTransfers.find(ex => ex.id === tr.id);
      if (!existingTr) {
        newTransfers.push(tr);
        existingTr = tr;
      }

      // Check if child transactions already exist for this transfer entity
      const hasChildTx = newTransactions.some(t => t.transferId === tr.id);
      if (!hasChildTx) {
        const srcMode = tr.sourceCommissionPaymentMode || 'EXTERNAL';
        const dstMode = tr.destCommissionPaymentMode || 'EXTERNAL';
        const txOutId = 'tx-' + Math.random().toString(36).substring(2, 9);
        const txInId = 'tx-' + Math.random().toString(36).substring(2, 9);

        const srcComm = tr.sourceCommission || 0;
        const dstComm = tr.destCommission || 0;
        const srcAssetFee = srcMode === 'ASSET' ? srcComm : 0;
        const dstAssetFee = dstMode === 'ASSET' ? dstComm : 0;
        const totalAssetFee = srcAssetFee + dstAssetFee;

        const qtyIn = Math.max(0, tr.qty - totalAssetFee);

        const txOut: Transaction = {
          id: txOutId,
          transferId: tr.id,
          portfolioId: tr.sourcePortfolioId,
          date: tr.date,
          type: TransactionType.TRANSFER_OUT,
          symbol: tr.symbol.toUpperCase().trim(),
          qty: tr.qty,
          price: tr.price || 0,
          commission: srcComm,
          commissionPaymentMode: srcMode,
          currency: tr.priceCurrency || 'EUR',
          commissionCurrency: srcMode === 'ASSET' ? tr.symbol.toUpperCase().trim() : (tr.sourceCommissionCurrency || 'EUR'),
          notes: tr.notes || '',
          transferInTransactionId: txInId,
          transferCriteria: tr.criteria || 'FIFO'
        };

        const txIn: Transaction = {
          id: txInId,
          transferId: tr.id,
          portfolioId: tr.destPortfolioId,
          date: tr.date,
          type: TransactionType.TRANSFER_IN,
          symbol: tr.symbol.toUpperCase().trim(),
          qty: qtyIn,
          price: tr.price || 0,
          commission: dstComm,
          commissionPaymentMode: dstMode,
          currency: tr.priceCurrency || 'EUR',
          commissionCurrency: dstMode === 'ASSET' ? tr.symbol.toUpperCase().trim() : (tr.destCommissionCurrency || 'EUR'),
          notes: tr.notes || '',
          transferOutTransactionId: txOutId,
          transferCriteria: tr.criteria || 'FIFO'
        };

        newTransactions.push(txOut, txIn);
      }
    });

    const updatedDb: DBState = {
      ...db,
      transfers: newTransfers,
      transactions: newTransactions
    };

    saveDatabaseState(updatedDb);
  };

  const handleViewConnectedClick = (tx: Transaction) => {
    const peerId = tx.type === TransactionType.TRANSFER_OUT ? tx.transferInTransactionId : tx.transferOutTransactionId;
    if (!peerId) return;

    const peerTx = db.transactions.find(t => t.id === peerId);
    if (!peerTx) return;

    // Reset filters that could hide peerTx
    if (txFilterBrokerId) {
      const peerPort = db.portfolios.find(p => p.id === peerTx.portfolioId);
      if (peerPort && peerPort.accountId !== txFilterBrokerId) {
        setTxFilterBrokerId('');
      }
    }
    if (txFilterPortfolioId && txFilterPortfolioId !== peerTx.portfolioId) {
      setTxFilterPortfolioId('');
    }
    if (txFilterTypes.length > 0 && !txFilterTypes.includes(peerTx.type)) {
      setTxFilterTypes([]);
    }
    if (txFilterTickers.length > 0 && !txFilterTickers.includes(peerTx.symbol.toUpperCase())) {
      setTxFilterTickers([peerTx.symbol.toUpperCase()]);
    }

    setTxHighlightIds([tx.id, peerId]);

    setTimeout(() => {
      const el = document.getElementById(`tx-row-${peerId}`) || document.getElementById(`tx-card-${peerId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);

    setTimeout(() => {
      setTxHighlightIds([]);
    }, 6000);
  };

  const handleOpenNewTransfer = (sourcePortfolioId?: string) => {
    const srcPortId = sourcePortfolioId || (db.portfolios[0]?.id || '');
    const availSymbols = getAvailableTickersForSource(srcPortId);
    const defaultSym = availSymbols[0] || '';
    const lots = getAvailableLots(defaultSym, srcPortId);
    const total = lots.reduce((sum, l) => sum + l.availableQty, 0);
    const srcPort = db.portfolios.find(p => p.id === srcPortId);
    const srcAcc = srcPort ? db.accounts.find(a => a.id === srcPort.accountId) : null;
    const srcCurr = srcAcc?.currency || db.settings.defaultCurrency || 'EUR';
    const destPort = db.portfolios.find(p => p.id !== srcPortId);
    const destAcc = destPort ? db.accounts.find(a => a.id === destPort.accountId) : null;
    const destCurr = destAcc?.currency || db.settings.defaultCurrency || 'EUR';

    setTransferForm({
      open: true,
      editTransferId: null,
      sourcePortfolioId: srcPortId,
      destPortfolioId: destPort?.id || '',
      symbol: defaultSym,
      qty: total > 0 ? total : '',
      price: '',
      priceCurrency: srcCurr,
      sourceCommission: '',
      sourceCommissionCurrency: srcCurr,
      sourceCommissionPaymentMode: 'EXTERNAL',
      destCommission: '',
      destCommissionCurrency: destCurr,
      destCommissionPaymentMode: 'EXTERNAL',
      date: new Date().toISOString().substring(0, 16),
      criteria: 'FIFO',
      notes: ''
    });
    setFormErr('');
  };

  const handleEditTransferRecord = (rec: TransferRecord) => {
    const tr = (db.transfers || []).find(t => t.id === rec.id);
    const symbol = tr?.symbol || rec.symbol;
    const qty = tr ? tr.qty.toString() : rec.qty.toString();
    const price = tr?.price !== undefined ? tr.price.toString() : (rec.price !== undefined ? rec.price.toString() : '');
    const priceCurrency = tr?.priceCurrency || rec.priceCurrency || 'EUR';
    const sourcePortfolioId = tr?.sourcePortfolioId || rec.sourcePortfolioId;
    const destPortfolioId = tr?.destPortfolioId || rec.destPortfolioId;
    const sourceCommission = tr?.sourceCommission !== undefined ? tr.sourceCommission.toString() : (rec.sourceCommission !== undefined ? rec.sourceCommission.toString() : '');
    const sourceCommissionCurrency = tr?.sourceCommissionCurrency || rec.sourceCommissionCurrency || 'EUR';
    const sourceCommissionPaymentMode = tr?.sourceCommissionPaymentMode || rec.sourceCommissionPaymentMode || 'EXTERNAL';
    const destCommission = tr?.destCommission !== undefined ? tr.destCommission.toString() : (rec.destCommission !== undefined ? rec.destCommission.toString() : '');
    const destCommissionCurrency = tr?.destCommissionCurrency || rec.destCommissionCurrency || 'EUR';
    const destCommissionPaymentMode = tr?.destCommissionPaymentMode || rec.destCommissionPaymentMode || 'EXTERNAL';
    const date = (tr?.date || rec.date).substring(0, 16);
    const criteria = tr?.criteria || rec.criteria || 'FIFO';
    const notes = tr?.notes || rec.notes || '';

    setTransferForm({
      open: true,
      editTransferId: rec.id,
      sourcePortfolioId,
      destPortfolioId,
      symbol,
      qty,
      price,
      priceCurrency,
      sourceCommission,
      sourceCommissionCurrency,
      sourceCommissionPaymentMode,
      destCommission,
      destCommissionCurrency,
      destCommissionPaymentMode,
      date,
      criteria,
      notes
    });
    setFormErr('');
  };

  const requestDeleteTransferRecord = (rec: TransferRecord) => {
    setDeleteConfirm({
      open: true,
      type: 'transfer',
      id: rec.id,
      message: t.confirmDeleteTransfer || 'Questo è un trasferimento di asset collegato. La sua eliminazione rimuoverà contemporaneamente sia l\'operazione in entrata che quella in uscita. Vuoi continuare?'
    });
  };

  const requestDeleteTransaction = (id: string) => {
    const tx = db.transactions.find(t => t.id === id);
    const isTransfer = tx && (tx.transferInTransactionId || tx.transferOutTransactionId || tx.type === 'TRANSFER_IN' || tx.type === 'TRANSFER_OUT' || tx.transferId);
    setDeleteConfirm({
      open: true,
      type: isTransfer && tx.transferId ? 'transfer' : 'transaction',
      id: isTransfer && tx.transferId ? tx.transferId : id,
      message: isTransfer ? (t.confirmDeleteTransfer || 'Questo è un trasferimento di asset collegato. La sua eliminazione rimuoverà contemporaneamente sia l\'operazione in entrata che quella in uscita. Vuoi continuare?') : t.confirmDeleteTransaction
    });
  };

  const handleConfirmDelete = () => {
    if (deleteConfirm.type === 'broker') {
      deleteAccountMutation(deleteConfirm.id);
    } else if (deleteConfirm.type === 'portfolio') {
      deletePortfolioMutation(deleteConfirm.id);
    } else if (deleteConfirm.type === 'transaction') {
      deleteTransactionMutation(deleteConfirm.id);
    } else if (deleteConfirm.type === 'cost') {
      deleteCostMutation(deleteConfirm.id);
    } else if (deleteConfirm.type === 'transfer') {
      deleteTransferMutation(deleteConfirm.id);
    }
    setDeleteConfirm({ open: false, type: 'broker', id: '', message: '' });
  };

  const renderDeletionConfirmModal = () => {
    if (!deleteConfirm.open) return null;
    return (
      <ModalPortal isOpen={deleteConfirm.open}>
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-hidden animate-fade-in"
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setDeleteConfirm({ ...deleteConfirm, open: false });
            }
          }}
        >
          <div className="max-w-md w-full bg-[#0d1527] border border-rose-500/30 rounded-2xl p-6 shadow-2xl relative overflow-hidden flex flex-col max-h-[calc(100vh-2rem)] my-auto">
            <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full blur-2xl pointer-events-none"></div>
            
            <div className="flex items-start gap-4 mb-5 overflow-y-auto custom-scrollbar pr-1 flex-1 min-h-0">
              <span className="p-3 bg-rose-500/10 rounded-xl text-rose-400 border border-rose-500/20 shrink-0">
                <Trash2 className="w-6 h-6 animate-pulse" />
              </span>
              <div className="flex-1">
                <h3 className="text-lg font-black text-white">{t.confirmDeleteTitle}</h3>
                <p className="text-sm text-slate-300 mt-2 font-medium leading-relaxed">{deleteConfirm.message}</p>
              </div>
            </div>
            
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800/80 shrink-0">
              <button
                type="button"
                onClick={() => setDeleteConfirm({ ...deleteConfirm, open: false })}
                className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl transition-all cursor-pointer"
              >
                {t.cancelBtn}
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-5 py-2 text-xs font-black text-white bg-rose-600 hover:bg-rose-500 active:bg-rose-700 rounded-xl transition-all shadow-[0_0_15px_rgba(239,68,68,0.2)] cursor-pointer"
              >
                {t.confirmBtn}
              </button>
            </div>
          </div>
        </div>
      </ModalPortal>
    );
  };

  // ================= RENDER BLOCKS =================

  const renderLegalDisclaimerModal = () => {
    if (!showLegalDisclaimerModal) return null;
    return (
      <ModalPortal isOpen={showLegalDisclaimerModal}>
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03050a]/90 backdrop-blur-lg overflow-hidden animate-fade-in"
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowLegalDisclaimerModal(false);
          }}
        >
          <div className="max-w-2xl w-full bg-[#0a0f1d] border border-rose-500/30 rounded-3xl p-6 sm:p-8 shadow-[0_0_50px_rgba(239,68,68,0.15)] relative overflow-hidden flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[90vh] my-auto">
            {/* Ambient decorative warning glows */}
            <div className="absolute top-0 right-1/4 w-60 h-60 bg-rose-500/5 rounded-full blur-[80px] pointer-events-none"></div>
            <div className="absolute bottom-0 left-1/4 w-60 h-60 bg-amber-500/5 rounded-full blur-[80px] pointer-events-none"></div>

            {/* Header with high prominence law scale / warning icon */}
            <div className="flex items-center gap-3.5 border-b border-slate-800/80 pb-4 mb-5 shrink-0">
              <span className="p-2.5 bg-rose-500/10 rounded-2xl text-rose-400 border border-rose-500/20 shadow-inner">
                <Scale className="w-6 h-6 animate-pulse" />
              </span>
              <div>
                <h2 className="font-extrabold text-sm sm:text-base text-white tracking-tight">{t.disclaimerTitle}</h2>
                <span className="text-[9px] font-mono font-black text-rose-400 uppercase tracking-widest block mt-0.5">jurisdictions: US, UK, IT, INT &bull; active protection</span>
              </div>
            </div>

            {/* Content containing legal terms */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-3 text-xs sm:text-sm text-slate-300 leading-relaxed custom-scrollbar pb-3">
              <div className="p-4 bg-rose-500/5 border border-rose-500/10 rounded-2xl font-semibold text-rose-300/95 flex gap-3">
                <ShieldAlert className="w-5 h-5 flex-shrink-0 text-rose-400 mt-0.5" />
                <p>{t.disclaimerText1}</p>
              </div>
              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl text-xs space-y-3 leading-relaxed text-slate-400 font-sans">
                <p>{t.disclaimerText2}</p>
                <div className="border-t border-slate-800/80 pt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[9px] text-slate-500">
                  <span>&bull; US Law Uniform Disclaimer (Securities Act)</span>
                  <span>&bull; UK Financial Services and Markets Act (FSMA) Sec. 21</span>
                  <span>&bull; Dir. 2014/65/UE Compliance (MiFID II Directive)</span>
                  <span>&bull; Art. 18-20/21-22 del T.U.F. Italiano</span>
                </div>
              </div>
            </div>

            {/* Confirm button */}
            <div className="pt-4 border-t border-slate-800/80 flex justify-end shrink-0">
              <button
                onClick={() => setShowLegalDisclaimerModal(false)}
                className="px-6 py-3 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 hover:shadow-[0_0_20px_rgba(239,68,68,0.3)] transition-all duration-300 text-slate-950 font-black rounded-xl text-[10px] sm:text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-lg outline-none"
              >
                <span>{t.disclaimerAcknowledge}</span>
              </button>
            </div>
          </div>
        </div>
      </ModalPortal>
    );
  };

  if (passwordSet === null) {
    return (
      <div className="min-h-screen bg-[#04060b] text-slate-100 flex items-center justify-center font-sans select-none relative overflow-hidden" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        {/* Ambient atmospheric lights */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-[120px] pointer-events-none"></div>
        
        <div className="text-center space-y-4 relative z-10">
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-md animate-pulse"></div>
            <RefreshCw className="w-12 h-12 text-emerald-400 animate-spin mx-auto relative z-10" />
          </div>
          <p className="text-slate-400 font-mono text-xs tracking-widest uppercase">Vault Sicuro GainBuster...</p>
        </div>
      </div>
    );
  }

  // Initial Lock Screen Registration
  if (!passwordSet) {
    if (storageMode === 'browser') {
      const isIframe = window.self !== window.top;
      return (
        <div className="min-h-screen bg-[#04060b] text-slate-100 flex items-center justify-center p-4 font-sans select-none relative overflow-hidden" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          {/* Subtle decorative elements for professional polish */}
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/5 rounded-full blur-[150px] pointer-events-none"></div>
          <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-500/5 rounded-full blur-[150px] pointer-events-none"></div>

          <div className="max-w-md w-full bg-slate-900/40 border border-slate-800/80 p-8 rounded-3xl space-y-6 shadow-2xl backdrop-blur-md relative z-10">
            <div className="absolute right-0 top-0 -translate-y-4 translate-x-4 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none"></div>
            
            {/* Global Language Selector */}
            <div className="flex justify-end items-center gap-1.5 pb-2 border-b border-slate-800/60">
              <span className="text-[10px] text-slate-500 font-mono font-bold uppercase">{t.activeLanguageLabel}</span>
              <select
                value={lang}
                onChange={(e) => {
                  setLang(e.target.value);
                }}
                className="bg-slate-950/80 text-white text-xs py-1 px-2.5 rounded-lg border border-slate-800 focus:outline-none focus:border-green-500 font-bold cursor-pointer font-sans"
              >
                <option value="en">🇺🇸 English</option>
                <option value="it">🇮🇹 Italiano</option>
                <option value="es">🇪🇸 Español</option>
                <option value="fr">🇫🇷 Français</option>
                <option value="zh">🇨🇳 中文</option>
                <option value="ar">🇸🇦 العربية</option>
              </select>
            </div>

            <div className="text-center space-y-2">
              <div className="flex justify-center mb-2">
                <img
                  src="/favicon.png"
                  alt="GainBusters Logo"
                  className="w-20 h-20 rounded-2xl shadow-xl border border-slate-800/80 object-cover transform hover:scale-105 transition-transform duration-300"
                  referrerPolicy="no-referrer"
                />
              </div>
              <h1 className="text-2xl font-black text-white tracking-tight">{t.appName}</h1>
              <span className="inline-block px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] uppercase font-mono tracking-widest rounded-full font-bold">
                {t.storageSubtitle}
              </span>
            </div>

            {isIframe && (
              <div className="p-3 bg-amber-950/20 border border-amber-500/20 rounded-xl text-amber-300 text-xs leading-relaxed space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <span className="text-amber-400">{t.iframeWarningTitle}</span>
                </div>
                <p>
                  {t.iframeWarningDesc}
                </p>
              </div>
            )}

            {browserSetupStep === 'info' && (
              <div className="space-y-4">
                <p className="text-xs text-slate-300 leading-relaxed text-center font-medium">
                  {t.filePrivacyInfo}
                </p>
                
                <div className="pt-2 space-y-3">
                  <button
                    onClick={() => {
                      setAuthError('');
                      setBrowserSetupStep('create_pass');
                    }}
                    className="w-full py-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-bold rounded-xl shadow-lg transition-all duration-300 cursor-pointer"
                  >
                    {t.createNewFile}
                  </button>
                  <button
                    onClick={handleBrowserSelectExistingFile}
                    className="w-full py-3 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-100 font-bold rounded-xl transition-all duration-300 cursor-pointer"
                  >
                    {t.openExistingFile}
                  </button>
                </div>
              </div>
            )}

            {browserSetupStep === 'create_pass' && (
              <div className="space-y-4">
                <div className="text-center">
                  <h2 className="text-sm font-bold text-emerald-400">{t.setMasterPassword}</h2>
                  <p className="text-[11px] text-slate-400 mt-1">{t.militaryEncryptionInfo}</p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 uppercase font-mono tracking-wider">{t.enterPassword}</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      className="w-full bg-slate-950/80 border border-slate-800 px-4 py-2.5 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 uppercase font-mono tracking-wider">{t.confirmPassword}</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={confirmPasswordInput}
                      onChange={(e) => setConfirmPasswordInput(e.target.value)}
                      className="w-full bg-slate-950/80 border border-slate-800 px-4 py-2.5 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono"
                    />
                  </div>
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    onClick={() => {
                      setAuthError('');
                      setBrowserSetupStep('info');
                    }}
                    className="flex-1 py-2.5 bg-slate-850/80 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold rounded-xl text-xs transition-all duration-300 cursor-pointer"
                  >
                    {t.cancel}
                  </button>
                  <button
                    onClick={handleBrowserCreateNew}
                    className="flex-2 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-bold rounded-xl text-xs transition-all duration-300 cursor-pointer"
                  >
                    {t.saveFileOnPc}
                  </button>
                </div>
              </div>
            )}

            {browserSetupStep === 'open_pass' && (
              <div className="space-y-4">
                <div className="text-center space-y-1.5">
                  <h2 className="text-sm font-bold text-emerald-400">{t.selectedDatabase}</h2>
                  <p className="text-xs text-slate-300 font-mono truncate bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800">
                    📄 {pendingFileHandle?.name}
                  </p>
                  <p className="text-[11px] text-slate-400">{t.enterPasswordToLoad}</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 uppercase font-mono tracking-wider">{t.enterPassword}</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleBrowserUnlockPendingFile()}
                    className="w-full bg-slate-950/80 border border-slate-800 px-4 py-2.5 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono"
                  />
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    onClick={() => {
                      setAuthError('');
                      setPendingFileHandle(null);
                      setBrowserSetupStep('info');
                    }}
                    className="flex-1 py-2.5 bg-slate-850/80 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold rounded-xl text-xs transition-all duration-300 cursor-pointer"
                  >
                    {t.back}
                  </button>
                  <button
                    onClick={handleBrowserUnlockPendingFile}
                    className="flex-2 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-bold rounded-xl text-xs transition-all duration-300 cursor-pointer"
                  >
                    {t.decryptAndEnter}
                  </button>
                </div>
              </div>
            )}

            {authError && (
              <div className="p-3 bg-red-950/20 border border-red-500/20 rounded-xl text-red-400 text-xs flex gap-2 items-center leading-relaxed">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{authError}</span>
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[#04060b] text-slate-100 flex items-center justify-center p-4 font-sans select-none relative overflow-hidden" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        {/* Subtle decorative elements for professional polish */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/5 rounded-full blur-[150px] pointer-events-none"></div>
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-500/5 rounded-full blur-[150px] pointer-events-none"></div>

        <div className="max-w-md w-full bg-slate-900/40 border border-slate-800/80 p-8 rounded-3xl space-y-6 shadow-2xl backdrop-blur-md relative z-10">
          <div className="absolute right-0 top-0 -translate-y-4 translate-x-4 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none"></div>
          
          {/* Global Language Selector */}
          <div className="flex justify-end items-center gap-1.5 pb-2 border-b border-slate-800/60">
            <span className="text-[10px] text-slate-500 font-mono font-bold uppercase">{t.activeLanguageLabel}</span>
            <select
              value={lang}
              onChange={(e) => {
                setLang(e.target.value);
              }}
              className="bg-slate-950/80 text-white text-xs py-1 px-2.5 rounded-lg border border-slate-800 focus:outline-none focus:border-green-500 font-bold cursor-pointer font-sans"
            >
              <option value="en">🇺🇸 English</option>
              <option value="it">🇮🇹 Italiano</option>
              <option value="es">🇪🇸 Español</option>
              <option value="fr">🇫🇷 Français</option>
              <option value="zh">🇨🇳 中文</option>
              <option value="ar">🇸🇦 العربية</option>
            </select>
          </div>

          <div className="text-center space-y-2">
            <div className="flex justify-center mb-2">
              <img
                src="/favicon.png"
                alt="GainBusters Logo"
                className="w-20 h-20 rounded-2xl shadow-xl border border-slate-800/80 object-cover transform hover:scale-105 transition-transform duration-300"
                referrerPolicy="no-referrer"
              />
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">{t.appName} 👻</h1>
            <p className="text-sm text-slate-400 font-medium">{t.setupPassword}</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 uppercase font-mono tracking-wider">{t.enterPassword}</label>
              <input
                type="password"
                placeholder="••••••••"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 px-4 py-2.5 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/80 font-mono transition-all duration-300 animate-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 uppercase font-mono tracking-wider">{t.confirmPassword}</label>
              <input
                type="password"
                placeholder="••••••••"
                value={confirmPasswordInput}
                onChange={(e) => setConfirmPasswordInput(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 px-4 py-2.5 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/80 font-mono transition-all duration-300 animate-none"
              />
            </div>

            {authError && (
              <div className="p-3 bg-red-950/30 border border-red-500/20 rounded-xl text-red-400 text-xs flex gap-2 items-center leading-relaxed">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{authError}</span>
              </div>
            )}

            <button
              onClick={handleAuthSetup}
              className="w-full py-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-950/50 transition-all duration-300 transform hover:-translate-y-0.5 outline-none cursor-pointer"
            >
              {t.submit}
            </button>
          </div>

          <p className="text-[10px] text-slate-500 text-center leading-relaxed font-mono select-all">
            {t.passwordRules}
          </p>

          <div className="border-t border-slate-800/80 pt-4 text-center">
            <button
              type="button"
              onClick={() => setShowLegalDisclaimerModal(true)}
              className="text-[10px] text-rose-400 hover:text-rose-305 font-bold underline transition duration-300 cursor-pointer outline-none flex items-center justify-center gap-1.5 mx-auto"
            >
              <Scale className="w-3.5 h-3.5" />
              <span>{t.disclaimerTitle}</span>
            </button>
          </div>
        </div>
        {renderLegalDisclaimerModal()}
      </div>
    );
  }

  // Active password shield lock screen
  if (!isAuthenticated) {
    if (storageMode === 'browser') {
      return (
        <div className="min-h-screen bg-[#04060b] text-slate-100 flex items-center justify-center p-4 font-sans select-none relative overflow-hidden" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          {/* Subtle decorative elements for professional polish */}
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/5 rounded-full blur-[150px] pointer-events-none"></div>
          <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-500/5 rounded-full blur-[150px] pointer-events-none"></div>

          <div className="max-w-md w-full bg-slate-900/40 border border-slate-800/80 p-8 rounded-3xl space-y-6 shadow-2xl backdrop-blur-md relative z-10">
            <div className="absolute right-0 top-0 -translate-y-4 translate-x-4 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none"></div>

            {/* Global Language Selector */}
            <div className="flex justify-end items-center gap-1.5 pb-2 border-b border-slate-800/60">
              <span className="text-[10px] text-slate-500 font-mono font-bold uppercase">{t.activeLanguageLabel}</span>
              <select
                value={lang}
                onChange={(e) => {
                  setLang(e.target.value);
                }}
                className="bg-slate-950/80 text-white text-xs py-1 px-2.5 rounded-lg border border-slate-800 focus:outline-none focus:border-green-500 font-bold cursor-pointer font-sans"
              >
                <option value="en">🇺🇸 English</option>
                <option value="it">🇮🇹 Italiano</option>
                <option value="es">🇪🇸 Español</option>
                <option value="fr">🇫🇷 Français</option>
                <option value="zh">🇨🇳 中文</option>
                <option value="ar">🇸🇦 العربية</option>
              </select>
            </div>

            <div className="text-center space-y-2">
              <div className="flex justify-center mb-2">
                <img
                  src="/favicon.png"
                  alt="GainBusters Logo"
                  className="w-20 h-20 rounded-2xl shadow-xl border border-slate-800/80 object-cover transform hover:scale-105 transition-transform duration-300"
                  referrerPolicy="no-referrer"
                />
              </div>
              <h1 className="text-2xl font-black text-white tracking-tight">{t.appName}</h1>
              <p className="text-xs text-slate-400 font-mono tracking-wider uppercase font-semibold">{t.vaultSetupActive}</p>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1.5">
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block">{t.connectedFile}</span>
                <span className="text-xs text-emerald-400 font-bold font-mono block truncate">📁 {persistedFileName || 'gainbusters_db.json'}</span>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400 uppercase font-mono tracking-wider">Master Password</span>
                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleBrowserUnlockPersistedFile()}
                  className="w-full bg-slate-950/80 border border-slate-800 px-4 py-3 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/80 font-mono text-center tracking-widest text-xl transition-all duration-300 animate-none"
                />
              </div>

              {authError && (
                <div className="p-3 bg-red-950/20 border border-red-500/20 rounded-xl text-red-400 text-xs text-center flex justify-center gap-1.5 items-center leading-relaxed">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <button
                onClick={handleBrowserUnlockPersistedFile}
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-bold rounded-xl shadow-lg transition-all duration-300 transform hover:-translate-y-0.5 outline-none cursor-pointer"
              >
                {t.unlockAndAuthorize}
              </button>

              <div className="pt-2 border-t border-slate-800/80 flex flex-col items-center gap-3">
                <button
                  onClick={handleClearPersistedHandle}
                  className="text-xs text-slate-500 hover:text-red-400 font-mono transition-colors duration-300 cursor-pointer"
                >
                  {t.useAnotherFile}
                </button>
                <button
                  type="button"
                  onClick={() => setShowLegalDisclaimerModal(true)}
                  className="text-[10px] text-rose-400 hover:text-rose-305 font-bold underline transition duration-300 cursor-pointer outline-none flex items-center gap-1 mt-1"
                >
                  <Scale className="w-3.5 h-3.5" />
                  <span>{t.disclaimerTitle}</span>
                </button>
              </div>
            </div>
          </div>
          {renderLegalDisclaimerModal()}
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[#04060b] text-slate-100 flex items-center justify-center p-4 font-sans select-none relative overflow-hidden" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        {/* Subtle decorative elements for professional polish */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/5 rounded-full blur-[150px] pointer-events-none"></div>
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-500/5 rounded-full blur-[150px] pointer-events-none"></div>

        <div className="max-w-md w-full bg-slate-900/40 border border-slate-800/80 p-8 rounded-3xl space-y-6 shadow-2xl backdrop-blur-md relative z-10">
          <div className="absolute right-0 top-0 -translate-y-4 translate-x-4 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none"></div>

          {/* Global Language Selector */}
          <div className="flex justify-end items-center gap-1.5 pb-2 border-b border-slate-800/60">
            <span className="text-[10px] text-slate-500 font-mono font-bold uppercase">{t.activeLanguageLabel}</span>
            <select
              value={lang}
              onChange={(e) => {
                setLang(e.target.value);
              }}
              className="bg-slate-950/80 text-white text-xs py-1 px-2.5 rounded-lg border border-slate-800 focus:outline-none focus:border-green-500 font-bold cursor-pointer font-sans"
            >
              <option value="en">🇺🇸 English</option>
              <option value="it">🇮🇹 Italiano</option>
              <option value="es">🇪🇸 Español</option>
              <option value="fr">🇫🇷 Français</option>
              <option value="zh">🇨🇳 中文</option>
              <option value="ar">🇸🇦 العربية</option>
            </select>
          </div>

          <div className="text-center space-y-2">
            <div className="flex justify-center mb-2">
              <img
                src="/favicon.png"
                alt="GainBusters Logo"
                className="w-20 h-20 rounded-2xl shadow-xl border border-slate-800/80 object-cover transform hover:scale-105 transition-transform duration-300"
                referrerPolicy="no-referrer"
              />
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">{t.appName}</h1>
            <p className="text-xs text-slate-400 font-mono tracking-wider uppercase font-semibold">{t.appSlogan}</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs text-slate-400 uppercase font-mono tracking-wider">{t.enterPassword}</label>
                <Lock className="w-3.5 h-3.5 text-slate-500" />
              </div>
              <input
                type="password"
                placeholder="••••••"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className="w-full bg-slate-950/80 border border-slate-800 px-4 py-3 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/80 font-mono text-center tracking-widest text-xl transition-all duration-300 animate-none"
              />
            </div>

            {authError && (
              <div className="p-3 bg-red-950/20 border border-red-500/20 rounded-xl text-red-400 text-xs text-center flex justify-center gap-1.5 items-center leading-relaxed">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <button
              onClick={handleLogin}
              className="w-full py-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-950/50 transition-all duration-300 transform hover:-translate-y-0.5 outline-none cursor-pointer"
            >
              {t.submit}
            </button>

            <div className="border-t border-slate-800/80 pt-4 text-center">
              <button
                type="button"
                onClick={() => setShowLegalDisclaimerModal(true)}
                className="text-[10px] text-rose-400 hover:text-rose-303 font-bold underline transition duration-300 cursor-pointer outline-none flex items-center justify-center gap-1.5 mx-auto"
              >
                <Scale className="w-3.5 h-3.5" />
                <span>{t.disclaimerTitle}</span>
              </button>
            </div>
          </div>
        </div>
        {renderLegalDisclaimerModal()}
      </div>
    );
  }

  // ================= BACKUP & RESTORE =================
  const handleExportDatabase = () => {
    const dataStr = JSON.stringify(db, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `gainbusters_backup_${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const result = event.target?.result;
        if (typeof result === 'string') {
          const parsed = JSON.parse(result);
          // Basic validation
          if (parsed && (parsed.settings || parsed.accounts || parsed.portfolios || parsed.transactions || parsed.transfers || parsed.otherCosts)) {
            setPendingImport(parsed);
          } else {
            alert(t.invalidBackupFile);
          }
        }
      } catch (err) {
        alert(t.invalidJsonFile);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleLogout = async () => {
    try {
      const currentDb = dbRef.current || db;
      await storageService.saveDatabaseState(currentDb);
      await storageService.flushPendingSaves();
    } catch (e) {
      console.warn('[Logout] Flush error:', e);
    }
    setIsAuthenticated(false);
    setPasswordInput('');
    sessionStorage.removeItem('gainbusters_local_token');
    storageService.clearSession();
    await checkAuthStatus();
  };

  const executeOverwrite = async () => {
    if (!pendingImport) return;

    const currentDb = dbRef.current || db;
    const mergedSettings = {
      ...currentDb.settings,
      ...(pendingImport.settings || {}),
      passwordHash: currentDb.settings?.passwordHash,
      passwordSet: currentDb.settings?.passwordSet ?? true,
      inflationIndices: (pendingImport.settings?.inflationIndices && pendingImport.settings.inflationIndices.length > 0)
        ? pendingImport.settings.inflationIndices
        : (currentDb.settings?.inflationIndices || defaultInitialDB.settings.inflationIndices)
    };

    const newDb: DBState = {
      settings: mergedSettings,
      accounts: Array.isArray(pendingImport.accounts) ? pendingImport.accounts : [],
      portfolios: Array.isArray(pendingImport.portfolios) ? pendingImport.portfolios : [],
      transactions: Array.isArray(pendingImport.transactions) ? pendingImport.transactions : [],
      transfers: Array.isArray(pendingImport.transfers) ? pendingImport.transfers : [],
      otherCosts: Array.isArray(pendingImport.otherCosts) ? pendingImport.otherCosts : [],
      instrumentGroups: Array.isArray(pendingImport.instrumentGroups) ? pendingImport.instrumentGroups : [],
      priceCache: (pendingImport.priceCache && typeof pendingImport.priceCache === 'object') ? pendingImport.priceCache : {}
    };

    await saveDatabaseState(newDb);
    await storageService.flushPendingSaves();
    setPendingImport(null);
    triggerPriceSync(newDb);
  };

  const executeMerge = async () => {
    if (!pendingImport) return;

    const currentDb = dbRef.current || db;
    const newDb: DBState = {
      ...currentDb,
      settings: {
        ...currentDb.settings,
        ...(pendingImport.settings || {}),
        passwordHash: currentDb.settings?.passwordHash,
        passwordSet: currentDb.settings?.passwordSet ?? true,
        targetWeights: {
          ...(currentDb.settings?.targetWeights || {}),
          ...(pendingImport.settings?.targetWeights || {})
        },
        inflationIndices: (pendingImport.settings?.inflationIndices && pendingImport.settings.inflationIndices.length > 0)
          ? pendingImport.settings.inflationIndices
          : (currentDb.settings?.inflationIndices || defaultInitialDB.settings.inflationIndices)
      },
      portfolios: [...currentDb.portfolios],
      accounts: [...currentDb.accounts],
      transactions: [...currentDb.transactions],
      transfers: [...(currentDb.transfers || [])],
      otherCosts: [...(currentDb.otherCosts || [])],
      instrumentGroups: [...(currentDb.instrumentGroups || [])],
      priceCache: JSON.parse(JSON.stringify(currentDb.priceCache || {}))
    };

    if (pendingImport.portfolios) {
      pendingImport.portfolios.forEach((p: Portfolio) => {
        if (!newDb.portfolios.find(ex => ex.id === p.id)) newDb.portfolios.push(p);
      });
    }

    if (pendingImport.accounts) {
      pendingImport.accounts.forEach((a: Account) => {
        if (!newDb.accounts.find(ex => ex.id === a.id)) newDb.accounts.push(a);
      });
    }

    if (pendingImport.transactions) {
      pendingImport.transactions.forEach((tx: Transaction) => {
        if (!newDb.transactions.find(ex => ex.id === tx.id)) newDb.transactions.push(tx);
      });
    }

    if (pendingImport.transfers) {
      pendingImport.transfers.forEach((tr: Transfer) => {
        if (!newDb.transfers!.find(ex => ex.id === tr.id)) newDb.transfers!.push(tr);
      });
    }

    if (pendingImport.otherCosts) {
      pendingImport.otherCosts.forEach((c: any) => {
        if (!newDb.otherCosts!.find(ex => ex.id === c.id)) newDb.otherCosts!.push(c);
      });
    }

    if (pendingImport.instrumentGroups) {
      pendingImport.instrumentGroups.forEach((g: InstrumentGroup) => {
        const existingIdx = newDb.instrumentGroups!.findIndex(ex => ex.id === g.id);
        if (existingIdx >= 0) {
          newDb.instrumentGroups![existingIdx] = g;
        } else {
          newDb.instrumentGroups!.push(g);
        }
      });
    }

    if (pendingImport.priceCache) {
      Object.keys(pendingImport.priceCache).forEach(symbol => {
        if (!newDb.priceCache[symbol]) {
          newDb.priceCache[symbol] = pendingImport.priceCache[symbol];
        } else {
          Object.keys(pendingImport.priceCache[symbol]).forEach(date => {
            if (!newDb.priceCache[symbol][date]) {
              newDb.priceCache[symbol][date] = pendingImport.priceCache[symbol][date];
            }
          });
        }
      });
    }

    await saveDatabaseState(newDb);
    await storageService.flushPendingSaves();
    setPendingImport(null);
    triggerPriceSync(newDb);
  };

  return (
    <div className="min-h-screen bg-[#04060b] text-slate-100 flex flex-col font-sans select-none relative overflow-x-clip" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Dynamic atmospheric subtle lighting */}
      <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[150px] pointer-events-none"></div>
      
      {/* Top Navbar Header */}
      <header className="border-b border-slate-800/80 bg-[#070b16]/70 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto px-4 md:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <img
              src="/favicon.png"
              alt="GainBusters Emblem"
              className="w-8 h-8 md:w-10 md:h-10 rounded-xl object-cover border border-emerald-500/10 shadow hidden sm:block"
              referrerPolicy="no-referrer"
            />
            <div>
              <span className="font-extrabold text-white text-base md:text-lg tracking-tight block">
                {t.appName}
              </span>
              <span className="text-[10px] text-slate-400 font-mono uppercase tracking-widest block font-bold hidden sm:block">
                {t.cacciatoreDiRenditaLabel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            {/* Force Sync manually button */}
            <button
              onClick={() => triggerPriceSync(db, true)}
              disabled={isSyncingPrices}
              className={`text-xs font-bold font-sans py-1.5 md:py-1 px-2 md:px-3 rounded-xl border flex items-center gap-1.5 transition-all duration-300 ${
                isSyncingPrices 
                  ? 'bg-slate-900 border-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/15 cursor-pointer shadow-sm hover:border-emerald-500/30'
              }`}
              title={t.refreshPricesTooltip}
            >
              <RefreshCw className={`w-4 h-4 md:w-3.5 md:h-3.5 ${isSyncingPrices ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">{t.refreshPricesLabel}</span>
            </button>

            {/* Syncing activity indicator */}
            {isSyncingPrices && (
              <span className="hidden md:flex text-xs text-slate-500 font-mono items-center gap-1.5 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-green-500" />
                <span>Syncing...</span>
              </span>
            )}

            <select
              value={selectedCurrency}
              onChange={(e) => setSelectedCurrency(e.target.value)}
              className="bg-slate-950 text-white text-xs py-1.5 px-2 rounded border border-slate-800 focus:outline-none focus:border-green-500 font-mono cursor-pointer"
            >
              {Array.from(new Set([db.settings.defaultCurrency || 'EUR', ...activeCurrencies])).map(cur => (
                <option key={cur} value={cur}>{cur} ({getCurrencySymbol(cur)})</option>
              ))}
            </select>

            <button
              onClick={handleLogout}
              className="text-slate-400 hover:text-white transition p-2 hover:bg-slate-900 rounded hidden sm:block"
              title={t.logout}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 w-full mx-auto px-4 md:px-6 py-6 flex flex-col lg:flex-row gap-8 relative">
        
        {/* Navigation Sidebar */}
        <nav className={`
          fixed inset-y-0 start-0 z-50 lg:z-20 w-64
          ${isDesktopSidebarOpen ? 'lg:w-64' : 'lg:w-[72px]'}
          transition-all duration-300 ease-in-out
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full lg:translate-x-0 lg:rtl:translate-x-0'}
          bg-[#070b16] lg:bg-transparent border-r border-slate-800/80 lg:border-none
          p-4 lg:p-0 shrink-0
          ${useStickySidebar ? 'lg:sticky lg:top-[88px] lg:self-start' : 'lg:static'}
        `}>
          <div ref={sidebarRef} className="bg-slate-900/20 lg:border border-slate-800/60 rounded-2xl p-3 space-y-1 lg:backdrop-blur-md h-full lg:h-auto flex flex-col">
            <div className="flex justify-between items-center px-2 lg:px-3 mb-2">
              {(isDesktopSidebarOpen || isMobileMenuOpen) && (
                <span className="text-[10px] text-slate-500 font-mono tracking-widest uppercase font-black truncate">
                  {t.navigationSidebarTitle}
                </span>
              )}
              {/* Desktop toggle button */}
              <button 
                onClick={() => setIsDesktopSidebarOpen(!isDesktopSidebarOpen)}
                className="hidden lg:block p-1 text-slate-500 hover:text-white rounded hover:bg-slate-800/60 transition ml-auto"
              >
                {isDesktopSidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              </button>
              {/* Mobile close button */}
              <button 
                onClick={() => setIsMobileMenuOpen(false)}
                className="lg:hidden p-1 -mr-1 text-slate-500 hover:text-white rounded hover:bg-slate-800/60 transition ml-auto"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1 flex-1">
              {[
                { id: 'dashboard', label: t.dashboard, icon: Home },
                { id: 'brokers', label: t.accountsPortfolios, icon: Briefcase },
                { id: 'dividends', label: t.dividendsTab || 'Dividendi', icon: DollarSign },
                { id: 'otherCosts', label: t.otherCostsTab, icon: Percent },                
                { id: 'inflation', label: t.inflationTitle, icon: TrendingUp },
                { id: 'tools', label: t.tools, icon: Calculator },
                { id: 'mission', label: t.mission, icon: Coins },
                { id: 'settings', label: t.settings, icon: SettingsIcon },
              ].map((item) => {
                const IconComponent = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center ${isDesktopSidebarOpen || isMobileMenuOpen ? 'gap-3 px-3.5' : 'justify-center px-2'} py-2.5 rounded-xl text-left text-sm font-semibold transition-all duration-300 outline-none ${
                      isActive
                        ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.08)]'
                        : 'text-slate-400 hover:text-white hover:bg-slate-900/50 border border-transparent'
                    }`}
                    title={(!isDesktopSidebarOpen && !isMobileMenuOpen) ? item.label : undefined}
                  >
                    <IconComponent className={`w-4 h-4 transition-colors duration-300 shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-500'}`} />
                    {(isDesktopSidebarOpen || isMobileMenuOpen) && (
                      <span className="truncate">{item.label}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Mobile logout button */}
            {isMobileMenuOpen && (
              <div className="mt-auto pt-4 border-t border-slate-800/80 lg:hidden">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left text-sm font-semibold transition-all duration-300 text-rose-400 hover:text-rose-300 hover:bg-rose-950/30"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  <span>{t.logout}</span>
                </button>
              </div>
            )}
          </div>
        </nav>

        {/* Mobile menu overlay */}
        {isMobileMenuOpen && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          ></div>
        )}

        {/* Content Body */}
        <main className="flex-1 w-full min-w-0 space-y-8">

          {syncFeedback && (
            <div className={`p-4 rounded-2xl border flex items-center justify-between text-xs font-mono font-bold transition-all duration-300 animate-fade-in ${
              syncFeedback.type === 'success'
                ? 'bg-emerald-950/45 border-emerald-500/20 text-emerald-400'
                : syncFeedback.type === 'error'
                  ? 'bg-rose-950/45 border-rose-500/20 text-rose-400'
                  : 'bg-sky-950/45 border-sky-500/20 text-sky-400'
            }`}>
              <div className="flex items-center gap-2.5">
                {syncFeedback.type === 'info' && <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />}
                {syncFeedback.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                {syncFeedback.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400" />}
                <span>{syncFeedback.message}</span>
              </div>
              <button 
                onClick={() => setSyncFeedback(null)} 
                className="text-slate-400 hover:text-white transition-colors text-sm px-2 cursor-pointer font-bold"
              >
                ×
              </button>
            </div>
          )}

          {/* TAB 1: DASHBOARD HOME */}
          {activeTab === 'dashboard' && (
            <div className="space-y-8 animate-fade-in">
              {/* Dashboard Driller Filter Panel */}
              <div className="bg-slate-900/60 p-5 rounded-3xl border border-slate-800/80 backdrop-blur-md space-y-4 shadow-xl">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                      <Activity className="w-5 h-5 animate-pulse" />
                    </span>
                    <div>
                      <h4 className="font-mono text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.analysisPerimeterLabel}</h4>
                      <div className="text-white text-sm font-black tracking-tight flex items-center gap-2">
                        <span>{t.currentViewLabel}</span>
                        <span className="text-emerald-400 font-extrabold px-2.5 py-0.5 bg-emerald-950/40 border border-emerald-500/20 rounded-xl text-xs uppercase font-mono">
                          {dashFilter.type === 'ALL' && t.overallPortfolioLabel}
                          {dashFilter.type === 'ACCOUNT' && `${t.brokerLabel}: ${db.accounts.find(a => a.id === dashFilter.id)?.name || dashFilter.id}`}
                          {dashFilter.type === 'PORTFOLIO' && `${t.portfolioLabel}: ${db.portfolios.find(p => p.id === dashFilter.id)?.name || dashFilter.id}`}
                          {dashFilter.type === 'TICKER' && `${t.instrumentLabel}: ${dashFilter.id}`}
                          {dashFilter.type === 'GROUP' && `${t.groupLabel || 'Gruppo'}: ${(db.instrumentGroups || []).find(g => g.id === dashFilter.id)?.name || dashFilter.id}`}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setDashFilter({ type: 'ALL', id: '' })}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl border cursor-pointer transition-all duration-300 ${
                        dashFilter.type === 'ALL'
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-950/40'
                          : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-white'
                      }`}
                    >
                      {t.globalLabel}
                    </button>
                    <button
                      onClick={() => {
                        const firstAcc = db.accounts[0];
                        setDashFilter({ type: 'ACCOUNT', id: firstAcc ? firstAcc.id : '' });
                      }}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl border cursor-pointer transition-all duration-300 ${
                        dashFilter.type === 'ACCOUNT'
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-950/40'
                          : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-white'
                      }`}
                    >
                      {t.brokerOnlyLabel}
                    </button>
                    <button
                      onClick={() => {
                        const firstPort = db.portfolios[0];
                        setDashFilter({ type: 'PORTFOLIO', id: firstPort ? firstPort.id : '' });
                      }}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl border cursor-pointer transition-all duration-300 ${
                        dashFilter.type === 'PORTFOLIO'
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-950/40'
                          : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-white'
                      }`}
                    >
                      {t.portfolioOnlyLabel}
                    </button>
                    <button
                      onClick={() => {
                        const tickers = Array.from(new Set(db.transactions.map(t => t.symbol.toUpperCase())));
                        setDashFilter({ type: 'TICKER', id: tickers[0] || '' });
                      }}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl border cursor-pointer transition-all duration-300 ${
                        dashFilter.type === 'TICKER'
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-950/40'
                          : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-white'
                      }`}
                    >
                      {t.tickerOnlyLabel}
                    </button>

                    {(db.instrumentGroups || []).length > 0 && (
                      <button
                        onClick={() => {
                          const firstGroup = (db.instrumentGroups || [])[0];
                          setDashFilter({ type: 'GROUP', id: firstGroup ? firstGroup.id : '' });
                        }}
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl border cursor-pointer transition-all duration-300 flex items-center gap-1.5 ${
                          dashFilter.type === 'GROUP'
                            ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-950/40'
                            : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-white'
                        }`}
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>{t.groupLabel || 'Gruppo'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Sub choices dropdown depending on visual state */}
                {dashFilter.type === 'ACCOUNT' && (
                  <div className="pt-3 border-t border-slate-800/40 animate-fade-in flex flex-col sm:flex-row sm:items-center gap-3">
                    <span className="text-xs text-slate-400 font-bold sm:w-44">{t.selectBrokerLabel}</span>
                    <select
                      value={dashFilter.id}
                      onChange={(e) => setDashFilter({ type: 'ACCOUNT', id: e.target.value })}
                      className="bg-slate-950/80 text-white border border-slate-800 text-xs px-3 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 w-full sm:max-w-md font-semibold"
                    >
                      {db.accounts.length === 0 ? (
                        <option value="">{t.noBrokerRegisteredLabel}</option>
                      ) : (
                        db.accounts.map(acc => (
                          <option key={acc.id} value={acc.id} className="bg-slate-950 text-white">
                            {acc.name.toUpperCase()} ({acc.currency})
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                )}

                {dashFilter.type === 'PORTFOLIO' && (
                  <div className="pt-3 border-t border-slate-800/40 animate-fade-in flex flex-col sm:flex-row sm:items-center gap-3">
                    <span className="text-xs text-slate-400 font-bold sm:w-44">{t.selectPortfolioLabel}</span>
                    <select
                      value={dashFilter.id}
                      onChange={(e) => setDashFilter({ type: 'PORTFOLIO', id: e.target.value })}
                      className="bg-slate-950/80 text-white border border-slate-800 text-xs px-3 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 w-full sm:max-w-md font-semibold"
                    >
                      {db.portfolios.length === 0 ? (
                        <option value="">{t.noPortfolioRegisteredLabel}</option>
                      ) : (
                        db.portfolios.map(port => {
                          const acc = db.accounts.find(a => a.id === port.accountId);
                          return (
                            <option key={port.id} value={port.id} className="bg-slate-950 text-white">
                              {port.name.toUpperCase()} ({t.bankLabel}: {acc ? acc.name : 'Unknown'})
                            </option>
                          );
                        })
                      )}
                    </select>
                  </div>
                )}

                {dashFilter.type === 'TICKER' && (
                  <div className="pt-3 border-t border-slate-800/40 animate-fade-in flex flex-col sm:flex-row sm:items-center gap-3">
                    <span className="text-xs text-slate-400 font-bold sm:w-44">{t.selectAssetTickerLabel}</span>
                    <select
                      value={dashFilter.id}
                      onChange={(e) => setDashFilter({ type: 'TICKER', id: e.target.value })}
                      className="bg-slate-950/80 text-white border border-slate-800 text-xs px-3 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 w-full sm:max-w-md font-mono font-bold"
                    >
                      {Array.from(new Set(db.transactions.map(t => t.symbol.toUpperCase()))).length === 0 ? (
                        <option value="">{t.noAssetsInArchiveLabel}</option>
                      ) : (
                        Array.from(new Set(db.transactions.map(t => t.symbol.toUpperCase()))).sort().map(sym => (
                          <option key={sym} value={sym} className="bg-slate-950 text-white font-mono font-bold">
                            {sym}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                )}

                {dashFilter.type === 'GROUP' && (
                  <div className="pt-3 border-t border-slate-800/40 animate-fade-in flex flex-col sm:flex-row sm:items-center gap-3">
                    <span className="text-xs text-slate-400 font-bold sm:w-44">{t.selectGroupLabel || 'Seleziona Gruppo'}</span>
                    <select
                      value={dashFilter.id}
                      onChange={(e) => setDashFilter({ type: 'GROUP', id: e.target.value })}
                      className="bg-slate-950/80 text-white border border-slate-800 text-xs px-3 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 w-full sm:max-w-md font-bold"
                    >
                      {(db.instrumentGroups || []).length === 0 ? (
                        <option value="">{t.noGroupsConfigured || 'Nessun gruppo configurato'}</option>
                      ) : (
                        (db.instrumentGroups || []).map(grp => (
                          <option key={grp.id} value={grp.id} className="bg-slate-950 text-white">
                            {grp.name} ({grp.tickerSymbols.join(', ')})
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                )}
              </div>

              {/* Financial Dashboard Bento Cardboard */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                
                {/* Total Capital Invested */}
                <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-800/80 space-y-1.5 hover:border-emerald-500/10 hover:shadow-lg transition-all duration-350">
                  <div className="flex justify-between items-center text-slate-400 text-xs font-semibold">
                    <span>{t.totalInvested}</span>
                    <Coins className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className="text-lg md:text-xl font-black text-white font-mono break-words select-text pt-1">
                    {formatCurrency(totalCapitalInvested, selectedCurrency)}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono tracking-wider uppercase font-extrabold pb-1">
                    {t.excludingCommissionsLabel}
                  </div>
                </div>

                {/* Current Value */}
                <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-800/80 space-y-1.5 hover:border-emerald-500/10 hover:shadow-lg transition-all duration-350">
                  <div className="flex justify-between items-center text-slate-400 text-xs font-semibold">
                    <span>{t.totalValue}</span>
                    <TrendingUp className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className="text-lg md:text-xl font-black text-white font-mono break-words select-text pt-1">
                    {formatCurrency(currentValAdjusted, selectedCurrency)}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono tracking-wider uppercase font-bold pb-1">
                    {includeCommissions ? t.commissionsAdjustedLabel : t.marketValuationLabel}
                  </div>
                </div>

                {/* Total Commissions */}
                <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-800/80 space-y-1.5 hover:border-emerald-500/10 hover:shadow-lg transition-all duration-350">
                  <div className="flex justify-between items-center text-slate-400 text-xs font-semibold">
                    <span>{t.overallCommissionsLabel}</span>
                    <Percent className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className="text-lg md:text-xl font-black text-rose-400 font-mono break-words select-text pt-1">
                    {formatCurrency(totalCommissionsPaid + totalOtherCostsPaid, selectedCurrency)}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono tracking-wider uppercase font-bold pb-1">
                    {t.declaredBrokerFeesLabel}
                  </div>
                </div>

                {/* Absolute Net gains */}
                <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-800/80 space-y-1.5 hover:border-emerald-500/10 hover:shadow-lg transition-all duration-350">
                  <div className="flex justify-between items-center text-slate-400 text-xs font-semibold">
                    <span>{t.netGain}</span>
                    <Activity className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className={`text-lg md:text-xl font-black font-mono break-words select-text pt-1 ${absoluteGain >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                    {absoluteGain >= 0 ? '+' : ''}{formatCurrency(absoluteGain, selectedCurrency)}
                  </div>
                  <div className={`text-[10px] font-bold font-mono tracking-wider uppercase ${absoluteGain >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {absoluteGain >= 0 ? '▲' : '▼'} {percentageReturn.toFixed(2)}% ROI
                  </div>
                </div>

                {/* Daily return change */}
                <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-800/80 space-y-1.5 hover:border-emerald-500/10 hover:shadow-lg transition-all duration-350">
                  <div className="flex justify-between items-center text-slate-400 text-xs font-semibold">
                    <span>{t.dailyChange}</span>
                    <RefreshCw className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className={`text-lg md:text-xl font-black font-mono break-words select-text pt-1 ${dailyChangeAbsolute >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                    {dailyChangeAbsolute >= 0 ? '+' : ''}{formatCurrency(dailyChangeAbsolute, selectedCurrency)}
                  </div>
                  <div className={`text-[10px] font-bold font-mono tracking-wider uppercase ${dailyChangeAbsolute >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {dailyChangeAbsolute >= 0 ? '▲' : '▼'} {dailyGainPercentage >= 0 ? '+' : ''}{dailyGainPercentage.toFixed(2)}% {t.yesterdayLabel}
                  </div>
                </div>
              </div>

              {/* Extra Professional Key-Performance Indicators */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-900/20 p-4 rounded-2xl border border-slate-800/60 flex flex-col justify-between gap-1 text-xs hover:border-emerald-500/10 transition-all duration-300">
                  <span className="text-slate-400 uppercase tracking-widest font-mono font-black text-[10px]">{t.twrrReturn || 'TWRR Return'}</span>
                  <span className={`font-bold font-mono text-sm ${overallPortfolioPerformance.twrrPercentage >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                    {overallPortfolioPerformance.twrrPercentage >= 0 ? '+' : ''}{overallPortfolioPerformance.twrrPercentage.toFixed(2)}%
                  </span>
                </div>

                <div className="bg-slate-900/20 p-4 rounded-2xl border border-slate-800/60 flex flex-col justify-between gap-1 text-xs hover:border-emerald-500/10 transition-all duration-300">
                  <span className="text-slate-400 uppercase tracking-widest font-mono font-black text-[10px]">{t.annualizedReturn || 'MWRR (Annualized)'}</span>
                  <span className={`font-bold font-mono text-sm ${overallPortfolioPerformance.mwrrAnnualized >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                    {overallPortfolioPerformance.mwrrAnnualized >= 0 ? '+' : ''}{overallPortfolioPerformance.mwrrAnnualized.toFixed(2)}%
                  </span>
                </div>

                <div className="bg-slate-900/20 p-4 rounded-2xl border border-slate-800/60 flex flex-col justify-between gap-1 text-xs hover:border-emerald-500/10 transition-all duration-300">
                  <span className="text-slate-400 uppercase tracking-widest font-mono font-black text-[10px]">{t.volatility}</span>
                  <span className="font-bold font-mono text-amber-500 text-sm">{overallPortfolioPerformance.volatility.toFixed(1)}%</span>
                </div>

                <div className="bg-slate-900/20 p-4 rounded-2xl border border-slate-800/60 flex flex-col justify-between gap-1 text-xs hover:border-emerald-500/10 transition-all duration-300">
                  <span className="text-slate-400 uppercase tracking-widest font-mono font-black text-[10px]">{t.maxDrawdown}</span>
                  <span className="font-bold font-mono text-rose-500 text-sm">-{overallPortfolioPerformance.maxDrawdown.toFixed(1)}%</span>
                </div>
              </div>

              {/* Commissions switch bar - Cognitive Ergonomics Redesign */}
              <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800/80 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl border transition-all ${
                    includeCommissions
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-slate-900/80 border-slate-800 text-slate-500'
                  }`}>
                    <Coins className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-200">
                        {t.commissionLabel || 'Commissioni Broker'}
                      </span>
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wide uppercase border transition-all ${
                        includeCommissions
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                          : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${includeCommissions ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                        {includeCommissions ? t.includeCommissions : t.excludeCommissions}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {t.calculateCommPerformanceDesc}
                    </p>
                  </div>
                </div>

                {/* Segmented Control with clear binary choice and zero ambiguity */}
                <div 
                  className="bg-slate-900/90 p-1 rounded-xl border border-slate-800 flex items-center shrink-0 self-stretch md:self-auto justify-end shadow-inner"
                  role="group"
                  aria-label={t.commissionLabel || 'Calcolo Commissioni'}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (includeCommissions) handleToggleCommissions();
                    }}
                    className={`flex-1 md:flex-none py-1.5 px-3 text-xs font-bold rounded-lg transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer select-none ${
                      !includeCommissions
                        ? 'bg-slate-800 text-white shadow-sm border border-slate-700/80'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                    }`}
                    aria-pressed={!includeCommissions}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${!includeCommissions ? 'bg-amber-400' : 'bg-transparent'}`} />
                    <span>{t.excludeCommissions}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (!includeCommissions) handleToggleCommissions();
                    }}
                    className={`flex-1 md:flex-none py-1.5 px-3 text-xs font-bold rounded-lg transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer select-none ${
                      includeCommissions
                        ? 'bg-emerald-500 text-slate-950 shadow-md font-black border border-emerald-400'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                    }`}
                    aria-pressed={includeCommissions}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${includeCommissions ? 'bg-slate-950' : 'bg-transparent'}`} />
                    <span>{t.includeCommissions}</span>
                  </button>
                </div>
              </div>

              {/* Render Core Chart Board */}
              <InteractiveChart
                t={t}
                lang={lang}
                currencySymbol={currencySymbol}
                dailyBalances={dailyBalances}
                includeCommissions={includeCommissions}
                benchmarkSymbol={benchmarkSymbol}
                setBenchmarkSymbol={setBenchmarkSymbol}
                availableBenchmarkOptions={db.portfolios.map(p => ({ id: p.id, name: p.name }))}
                activeBenchmark={activeBenchmark}
                setActiveBenchmark={setActiveBenchmark}
                inflationToggle={inflationToggle}
                setInflationToggle={setInflationToggle}
                assetAllocation={assetAllocation}
                onUpdateTargetWeight={handleUpdateTargetWeight}
                onSelectTicker={(sym) => {
                  setDashFilter({ type: 'TICKER', id: sym });
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                activeTxSorted={activeTxSorted}
                activeOtherCosts={activeOtherCosts}
                allTransactions={db.transactions}
                activePortIds={activePortIds}
                targetSymbol={activeTargetSymbolFilter}
                convertValue={convertValue}
                selectedCurrency={selectedCurrency}
                inflationIndices={db.settings.inflationIndices}
                selectedInflationId={db.settings.selectedInflationId || 'NIC'}
                onSelectInflationId={(id) => {
                  const newDb = { ...db, settings: { ...db.settings, selectedInflationId: id } };
                  saveDatabaseState(newDb);
                }}
                isAggregatedView={isAggregatedView}
                onToggleAggregatedView={handleToggleAggregatedView}
                onOpenGroupsManager={() => setIsGroupsModalOpen(true)}
                onSelectGroup={(groupId) => {
                  setDashFilter({ type: 'GROUP', id: groupId });
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                instrumentGroupsCount={(db.instrumentGroups || []).length}
                positionsTableNode={
                  <PositionsTable
                    t={t}
                    lang={lang}
                    tickerMetrics={tickerMetrics}
                    totalPortfolioNominalValue={totalNominalValue}
                    selectedCurrency={selectedCurrency}
                    convertValue={convertValue}
                    portfolios={db.portfolios}
                    onSelectTicker={(sym) => {
                      setDashFilter({ type: 'TICKER', id: sym });
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    formatCurrency={formatCurrency}
                    instrumentGroups={db.instrumentGroups || []}
                    isAggregatedView={isAggregatedView}
                    onToggleAggregatedView={handleToggleAggregatedView}
                    onOpenGroupsManager={() => setIsGroupsModalOpen(true)}
                    onSelectGroup={(groupId) => {
                      setDashFilter({ type: 'GROUP', id: groupId });
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  />
                }
              />
            </div>
          )}

          {/* TAB 2: BROKERS & PORTFOLIOS MANAGER */}
          {activeTab === 'brokers' && (
            <div className="space-y-8 animate-fade-in text-slate-100">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <h1 className="text-2xl font-black text-white tracking-tight">{t.configureBrokersAssetsTitle}</h1>
                  <p className="text-sm text-slate-400">{t.configureBrokersAssetsDesc}</p>
                </div>
                
                <div className="flex gap-2">
                  <button
                    onClick={() => setAccountForm({ open: true, editId: null, name: '', currency: Currency.EUR, include: true })}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all duration-300 transform hover:-translate-y-0.5 cursor-pointer shadow-lg shadow-emerald-950/20"
                  >
                    <Plus className="w-4 h-4" /> {t.addAccount}
                  </button>
                  {db.accounts.length > 0 && (
                    <button
                      onClick={() => setPortfolioForm({ open: true, editId: null, accountId: db.accounts[0].id, name: '', include: true })}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all duration-300 transform hover:-translate-y-0.5 cursor-pointer border border-slate-700/50"
                    >
                      <Plus className="w-4 h-4" /> {t.addPortfolio}
                    </button>
                  )}
                </div>
              </div>

              {/* Account management modal if open */}
              {accountForm.open && (
                <ModalPortal isOpen={accountForm.open}>
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-hidden animate-fade-in"
                    dir={lang === 'ar' ? 'rtl' : 'ltr'}
                    onClick={(e) => {
                      if (e.target === e.currentTarget) {
                        setAccountForm({ open: false, editId: null, name: '', currency: Currency.EUR, include: true });
                      }
                    }}
                  >
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xl max-w-lg w-full max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col relative overflow-hidden my-auto">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
                        <div className="flex items-center gap-2">
                          <Briefcase className="w-5 h-5 text-emerald-400" />
                          <h3 className="font-extrabold text-base text-white">
                            {accountForm.editId ? t.editAccount : t.addAccount}
                          </h3>
                        </div>
                        <button
                          onClick={() => setAccountForm({ open: false, editId: null, name: '', currency: Currency.EUR, include: true })}
                          className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                          aria-label="Close"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="overflow-y-auto py-3 pr-1 space-y-4 custom-scrollbar flex-1 min-h-0">
                        <div className="space-y-1.5">
                          <label className="text-xs text-slate-400 block font-semibold">{t.accountName}</label>
                          <input
                            type="text"
                            value={accountForm.name}
                            onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                            className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/80 px-3 py-2 text-white rounded-xl text-xs w-full transition-all duration-305"
                            placeholder={t.allOption === 'Tutti' ? 'es. Fineco, Webank, Trade Republic' : t.allOption === 'Todos' ? 'ej. Fineco, Trade Republic, DeGiro' : t.allOption === 'Tous' ? 'ex. BoursoBank, Trade Republic, Interactive Brokers' : t.allOption === '全部' ? '例：华泰证券、富途证券、盈透证券' : t.allOption === 'الكل' ? 'مثال: بينانس، وسيط تفاعلي، هيرميس' : 'e.g. Fineco, Interactive Brokers, Trade Republic'}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs text-slate-400 block font-semibold">{t.brokerAccountCurrencyLabel}</label>
                          <select
                            value={accountForm.currency}
                            onChange={(e) => setAccountForm({ ...accountForm, currency: e.target.value })}
                            className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/80 px-3 py-2 text-white rounded-xl text-xs w-full transition-all duration-305 font-mono"
                          >
                            {activeCurrencies.map(cur => (
                              <option key={cur} value={cur}>{cur} ({getCurrencySymbol(cur)})</option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1.5 pt-1">
                          <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-300 py-1 group">
                            <input
                              type="checkbox"
                              checked={accountForm.include}
                              onChange={(e) => setAccountForm({ ...accountForm, include: e.target.checked })}
                              className="w-4 h-4 rounded border-slate-800 text-emerald-500 focus:ring-emerald-500/20 focus:ring-offset-slate-900 bg-slate-950 cursor-pointer accent-emerald-500"
                            />
                            <span className="group-hover:text-emerald-400 transition-colors duration-250">{t.includeDashboard}</span>
                          </label>
                        </div>
                      </div>

                      <div className="flex gap-2 justify-end text-xs pt-3 border-t border-slate-800 shrink-0">
                        <button
                          onClick={() => setAccountForm({ open: false, editId: null, name: '', currency: Currency.EUR, include: true })}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl font-bold transition-colors duration-300 cursor-pointer"
                        >
                          {t.cancel}
                        </button>
                        <button
                          onClick={saveAccountMutation}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-xl font-bold transition-all duration-300 cursor-pointer shadow-lg shadow-emerald-950/20"
                        >
                          {t.save}
                        </button>
                      </div>
                    </div>
                  </div>
                </ModalPortal>
              )}

              {/* Portfolio management modal if open */}
              {portfolioForm.open && (
                <ModalPortal isOpen={portfolioForm.open}>
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-hidden animate-fade-in"
                    dir={lang === 'ar' ? 'rtl' : 'ltr'}
                    onClick={(e) => {
                      if (e.target === e.currentTarget) {
                        setPortfolioForm({ open: false, editId: null, accountId: '', name: '', include: true });
                      }
                    }}
                  >
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xl max-w-lg w-full max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col relative overflow-hidden my-auto">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
                        <div className="flex items-center gap-2">
                          <Briefcase className="w-5 h-5 text-emerald-400" />
                          <h3 className="font-extrabold text-base text-white">
                            {portfolioForm.editId ? t.editPortfolio : t.addPortfolio}
                          </h3>
                        </div>
                        <button
                          onClick={() => setPortfolioForm({ open: false, editId: null, accountId: '', name: '', include: true })}
                          className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                          aria-label="Close"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="overflow-y-auto py-3 pr-1 space-y-4 custom-scrollbar flex-1 min-h-0">
                        <div className="space-y-1.5">
                          <label className="text-xs text-slate-400 block font-semibold">{t.associateToAccountLabel}</label>
                          <select
                            value={portfolioForm.accountId}
                            onChange={(e) => setPortfolioForm({ ...portfolioForm, accountId: e.target.value })}
                            className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/80 px-3 py-2 text-white rounded-xl text-xs w-full transition-all duration-305 font-medium"
                          >
                            {db.accounts.map(a => (
                              <option key={a.id} value={a.id} className="text-slate-950 bg-white">{a.name}</option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs text-slate-400 block font-semibold">{t.portfolioName}</label>
                          <input
                            type="text"
                            value={portfolioForm.name}
                            onChange={(e) => setPortfolioForm({ ...portfolioForm, name: e.target.value })}
                            className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/80 px-3 py-2 text-white rounded-xl text-xs w-full transition-all duration-305"
                            placeholder={t.allOption === 'Tutti' ? 'es. Portafoglio Pigro / PAC ETF VWCE' : t.allOption === 'Todos' ? 'ej. Cartera Perezosa / PAC ETF VWCE' : t.allOption === 'Tous' ? 'ex. Portefeuille Paresseux / Plan d\'Épargne ETF VWCE' : t.allOption === '全部' ? '例：极简懒人组合 / VWCE 定投计划' : t.allOption === 'الكل' ? 'مثال: المحفظة الكسولة / خطة ادخار صناديق الاستثمار' : 'e.g. Lazy Portfolio / ETF VWCE Savings Plan'}
                          />
                        </div>

                        <div className="space-y-1.5 pt-1">
                          <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-300 py-1 group">
                            <input
                              type="checkbox"
                              checked={portfolioForm.include}
                              onChange={(e) => setPortfolioForm({ ...portfolioForm, include: e.target.checked })}
                              className="w-4 h-4 rounded border-slate-800 text-emerald-500 focus:ring-emerald-500/20 focus:ring-offset-slate-900 bg-slate-950 cursor-pointer accent-emerald-500"
                            />
                            <span className="group-hover:text-emerald-400 transition-colors duration-250">{t.includeDashboard}</span>
                          </label>
                        </div>
                      </div>

                      <div className="flex gap-2 justify-end text-xs pt-3 border-t border-slate-800 shrink-0">
                        <button
                          onClick={() => setPortfolioForm({ open: false, editId: null, accountId: '', name: '', include: true })}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl font-bold transition-colors duration-300 cursor-pointer"
                        >
                          {t.cancel}
                        </button>
                        <button
                          onClick={savePortfolioMutation}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-xl font-bold transition-all duration-300 cursor-pointer shadow-lg shadow-emerald-950/20"
                        >
                          {t.save}
                        </button>
                      </div>
                    </div>
                  </div>
                </ModalPortal>
              )}

              {/* Grid panel listing Accounts containing Portfolios */}
              {db.accounts.length === 0 ? (
                <div className="h-44 border border-dashed border-slate-800/80 flex flex-col items-center justify-center p-6 text-slate-500 rounded-2xl italic text-sm font-mono text-center bg-slate-900/10">
                  <span>{t.noBrokersRegisteredPlaceholder}</span>
                  <button
                    onClick={() => setAccountForm({ open: true, editId: null, name: '', currency: Currency.EUR, include: true })}
                    className="mt-3 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <span dangerouslySetInnerHTML={{ __html: t.createFirstAccountLink }} />
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {db.accounts.map((acc) => {
                    const portfolios = db.portfolios.filter(p => p.accountId === acc.id);
                    return (
                      <div key={acc.id} className="bg-slate-900/40 p-6 rounded-2xl border border-slate-800/80 space-y-4 hover:shadow-xl hover:border-slate-800 transition-all duration-300">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                          <div className="flex items-center gap-2.5">
                            <span 
                              onClick={() => {
                                setDashFilter({ type: 'ACCOUNT', id: acc.id });
                                setActiveTab('dashboard');
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className="text-base font-black text-white uppercase tracking-tight hover:text-emerald-400 cursor-pointer transition-colors"
                              title={t.clickToAnalyzeBrokerTooltip}
                            >
                              {acc.name}
                            </span>
                            <span className="text-[10px] bg-slate-850 border border-slate-800 text-emerald-400 px-2 py-0.5 rounded-lg font-mono uppercase font-bold">{acc.currency}</span>
                            {!acc.includeInDashboard && (
                              <span className="text-[10px] bg-rose-950/30 text-rose-400 px-2 py-0.5 rounded-lg border border-rose-500/10 font-bold tracking-wide uppercase">{t.excludedFromHomeLabel}</span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setAccountForm({ open: true, editId: acc.id, name: acc.name, currency: acc.currency, include: acc.includeInDashboard })}
                              className="text-slate-400 hover:text-white transition p-1 hover:bg-slate-800/60 rounded-lg cursor-pointer"
                              title={t.editAccount}
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => requestDeleteAccount(acc.id)}
                              className="text-slate-400 hover:text-rose-400 transition p-1 hover:bg-rose-950/20 rounded-lg cursor-pointer"
                              title={t.deleteAccount}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* List Portfolios related */}
                        {portfolios.length === 0 ? (
                          <div className="text-slate-600 text-xs italic font-mono pl-2 py-2">
                            {t.noPortfoliosDefinedPlaceholder}
                          </div>
                        ) : (
                          <div className="grid md:grid-cols-2 gap-4">
                            {portfolios.map((port) => {
                              const pTx = db.transactions.filter(t => t.portfolioId === port.id);
                              return (
                                <div key={port.id} className="bg-slate-950/80 p-4 rounded-xl border border-slate-800/60 space-y-3 shadow-inner hover:border-slate-700 transition duration-200">
                                  <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                      <span 
                                        onClick={() => {
                                          setDashFilter({ type: 'PORTFOLIO', id: port.id });
                                          setActiveTab('dashboard');
                                          window.scrollTo({ top: 0, behavior: 'smooth' });
                                        }}
                                        className="text-sm font-bold text-white tracking-tight hover:text-emerald-400 cursor-pointer transition-colors"
                                        title={t.clickToAnalyzeBrokerTooltip}
                                      >
                                        {port.name}
                                      </span>
                                      {!port.includeInDashboard && (
                                        <span className="text-[9px] bg-rose-950/30 text-rose-400 px-1.5 py-0.5 rounded-lg font-bold tracking-wide uppercase">{t.allOption === 'Tutti' ? 'Escluso' : t.allOption === 'Todos' ? 'Excluido' : t.allOption === 'Tous' ? 'Exclu' : t.allOption === '全部' ? '已排除' : t.allOption === 'الكل' ? 'مستثنى' : 'Excluded'}</span>
                                      )}
                                    </div>
                                    <div className="flex gap-1.5">
                                      <button
                                        onClick={() => setPortfolioForm({ open: true, editId: port.id, accountId: acc.id, name: port.name, include: port.includeInDashboard })}
                                        className="text-slate-500 hover:text-slate-300 p-1 rounded hover:bg-slate-900 transition-colors cursor-pointer"
                                      >
                                        <Edit className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => requestDeletePortfolio(port.id)}
                                        className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-rose-950/20 transition-colors font-bold cursor-pointer"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>

                                  <div className="flex justify-between items-center text-xs text-slate-400 font-mono pt-1">
                                    <span>{t.operationsCountLabel} <strong className="text-slate-200">{pTx.length}</strong></span>
                                    <div className="flex items-center gap-3">
                                      <button
                                        onClick={() => handleOpenNewTransfer(port.id)}
                                        className="text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1 font-bold transition-all duration-300 cursor-pointer"
                                      >
                                        <RefreshCw className="w-3 h-3" /> {t.transferBtn}
                                      </button>
                                      <button
                                        onClick={() => {
                                          const prt = db.portfolios.find(p => p.id === port.id);
                                          const acc = prt ? db.accounts.find(a => a.id === prt.accountId) : null;
                                          const accCurr = acc?.currency || db.settings.defaultCurrency || 'EUR';
                                          setTxForm({
                                            open: true,
                                            editId: null,
                                            portfolioId: port.id,
                                            date: new Date().toISOString().substring(0,16),
                                            type: TransactionType.BUY,
                                            symbol: '',
                                            qty: '',
                                            price: '',
                                            commission: '',
                                            currency: accCurr,
                                            commissionCurrency: accCurr,
                                            notes: ''
                                          });
                                          setFormErr('');
                                        }}
                                        className="text-emerald-400 hover:text-emerald-300 hover:underline flex items-center gap-0.5 font-bold transition-all duration-300 cursor-pointer"
                                      >
                                        <Plus className="w-3.5 h-3.5" /> {t.addTransaction}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Dedicated Transfers Registry Table */}
              <TransfersTable
                transfers={getTransferRecords()}
                onNewTransfer={() => handleOpenNewTransfer()}
                onEdit={handleEditTransferRecord}
                onDelete={requestDeleteTransferRecord}
                t={t}
                formatDateString={formatDateString}
                formatFullQuantity={formatFullQuantity}
                formatCurrency={formatCurrency}
                lang={lang}
                onImportTransfers={handleImportTransfersList}
                dbTransfersRaw={db.transfers}
              />

              {/* Master Register listing all historical Transactions */}
              <div className="bg-slate-900/40 p-6 rounded-2xl border border-slate-800/80 space-y-4 shadow-sm">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-slate-800/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <h3 className="font-extrabold text-sm text-white tracking-wide uppercase font-mono">{t.historicalTransactionsRegistryTitle}</h3>
                    {(txFilterBrokerId || txFilterPortfolioId || txFilterDateStart || txFilterDateEnd || txFilterTypes.length > 0 || txFilterTickers.length > 0) && (
                      <button
                        onClick={() => {
                          setTxFilterBrokerId('');
                          setTxFilterPortfolioId('');
                          setTxFilterTypes([]);
                          setTxFilterTickers([]);
                          setTxFilterDateStart('');
                          setTxFilterDateEnd('');
                        }}
                        className="text-[10px] text-rose-400 hover:text-rose-300 font-extrabold cursor-pointer transition font-mono uppercase shrink-0 border border-rose-950/40 bg-rose-950/20 px-2 py-0.5 rounded-lg"
                      >
                        {t.resetFiltersBtn}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3 self-end md:self-auto relative">
                    <button
                      type="button"
                      onClick={() => {
                        setColumnDropdownOpen(!columnDropdownOpen);
                        setTypeDropdownOpen(false);
                        setTickerDropdownOpen(false);
                      }}
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 font-extrabold cursor-pointer transition font-mono uppercase border border-emerald-950/45 bg-emerald-950/20 px-2.5 py-1 rounded-lg flex items-center gap-1.5 focus:outline-none"
                    >
                      <span>{t.columnsLabel}</span>
                      <span className="text-[8px]">▼</span>
                    </button>

                    {columnDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setColumnDropdownOpen(false)}></div>
                        <div 
                          onClick={(e) => e.stopPropagation()} 
                          className="absolute right-0 top-8 w-56 max-w-[calc(100vw-2rem)] bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl z-50 p-2.5 space-y-1 text-xs max-h-80 overflow-y-auto"
                        >
                          {[
                            { id: 'date', label: t.dateLabel || 'Data' },
                            { id: 'portfolio', label: t.allOption === 'Tutti' ? 'Portafoglio' : 'Portfolio' },
                            { id: 'type', label: t.allOption === 'Tutti' ? 'Tipo' : 'Type' },
                            { id: 'symbol', label: t.tickerLabel || 'Ticker' },
                            { id: 'qty', label: t.qtyLabel || 'Quantità' },
                            { id: 'price', label: t.priceLabel || 'Prezzo' },
                            { id: 'total', label: t.allOption === 'Tutti' ? 'Totale' : 'Total' },
                            { id: 'currentValue', label: t.allOption === 'Tutti' ? 'Valore Attuale' : 'Current Value' },
                            { id: 'commission', label: t.commissionLabel || 'Commissioni' },
                            { id: 'notes', label: t.notesLabel || 'Note' }
                          ].map((col) => {
                            const isChecked = txVisibleColumns.includes(col.id);
                            return (
                              <div
                                key={col.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isChecked) {
                                    if (txVisibleColumns.length > 1) {
                                      setTxVisibleColumns(txVisibleColumns.filter(x => x !== col.id));
                                    }
                                  } else {
                                    setTxVisibleColumns([...txVisibleColumns, col.id]);
                                  }
                                }}
                                className="flex items-center gap-2 px-2.5 py-2 hover:bg-slate-800 rounded-lg cursor-pointer transition text-slate-300 hover:text-white select-none font-sans font-bold active:bg-slate-700"
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  readOnly
                                  className="accent-emerald-500 rounded text-emerald-500 focus:ring-0 focus:ring-offset-0 pointer-events-none"
                                />
                                <span className="capitalize">{col.label}</span>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}

                    <span className="text-[10px] text-slate-500 font-mono">
                      {t.foundXOfYLabel.replace('{count}', String(getProcessedTransactions().length)).replace('{total}', String(db.transactions.length))}
                    </span>
                  </div>
                </div>

                {/* Filters dashboard */}
                {db.transactions.length > 0 && (
                  <div className="bg-slate-950/50 p-4 border border-slate-800/80 rounded-xl grid grid-cols-2 md:grid-cols-6 gap-3.5 text-xs">
                    <div className="space-y-1">
                      <label className="text-slate-500 font-bold block font-mono uppercase text-[9px] tracking-wider">Broker</label>
                      <select
                        value={txFilterBrokerId}
                        onChange={(e) => {
                          setTxFilterBrokerId(e.target.value);
                          setTxFilterPortfolioId('');
                        }}
                        className="bg-slate-900 border border-slate-800 text-white rounded px-2 py-1.5 w-full select-none outline-none font-medium text-xs font-sans"
                      >
                        <option value="">{t.allOption}</option>
                        {db.accounts.map(acc => (
                          <option key={acc.id} value={acc.id}>{acc.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-slate-500 font-bold block font-mono uppercase text-[9px] tracking-wider">{t.allOption === 'Tutti' ? 'Portafoglio' : t.allOption === 'Todos' ? 'Cartera' : t.allOption === 'Tous' ? 'Portefeuille' : t.allOption === '全部' ? '投资组合' : t.allOption === 'الكل' ? 'المحفظة' : 'Portfolio'}</label>
                      <select
                        value={txFilterPortfolioId}
                        onChange={(e) => setTxFilterPortfolioId(e.target.value)}
                        className="bg-slate-900 border border-slate-800 text-white rounded px-2 py-1.5 w-full select-none outline-none font-medium text-xs font-sans"
                      >
                        <option value="">{t.allOption}</option>
                        {db.portfolios
                          .filter(p => !txFilterBrokerId || p.accountId === txFilterBrokerId)
                          .map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))
                        }
                      </select>
                    </div>

                    {/* Tipo Multiselect */}
                    <div className="space-y-1 relative">
                      <label className="text-slate-500 font-bold block font-mono uppercase text-[9px] tracking-wider">
                        {t.allOption === 'Tutti' ? 'Tipo' : 'Type'}
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setTypeDropdownOpen(!typeDropdownOpen);
                          setTickerDropdownOpen(false);
                          setColumnDropdownOpen(false);
                        }}
                        className="bg-slate-900 border border-slate-800 text-white rounded px-3 py-1.5 w-full text-left font-medium text-xs font-sans flex items-center justify-between cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500/35"
                      >
                        <span className="truncate">
                          {txFilterTypes.length === 0
                            ? t.allOption
                            : txFilterTypes.map(typ => getTypeLabel(typ)).join(', ')}
                        </span>
                        <span className="text-[10px] text-slate-500">▼</span>
                      </button>

                      {typeDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setTypeDropdownOpen(false)}></div>
                          <div className="absolute left-0 mt-1 w-full bg-slate-900 border border-slate-800 rounded-lg shadow-xl z-20 p-2 space-y-1 max-h-60 overflow-y-auto">
                            {[TransactionType.BUY, TransactionType.SELL, TransactionType.DIVIDEND, TransactionType.TRANSFER_IN, TransactionType.TRANSFER_OUT].map((typ) => {
                              const isChecked = txFilterTypes.includes(typ);
                              return (
                                <label
                                  key={typ}
                                  className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-800 rounded cursor-pointer transition text-xs font-bold text-slate-300 hover:text-white select-none"
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {
                                      if (isChecked) {
                                        setTxFilterTypes(txFilterTypes.filter(x => x !== typ));
                                      } else {
                                        setTxFilterTypes([...txFilterTypes, typ]);
                                      }
                                    }}
                                    className="accent-emerald-500 rounded text-emerald-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                                  />
                                  <span>{getTypeLabel(typ)}</span>
                                </label>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Ticker Multiselect */}
                    <div className="space-y-1 relative">
                      <label className="text-slate-500 font-bold block font-mono uppercase text-[9px] tracking-wider">
                        {t.tickerLabel}
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setTickerDropdownOpen(!tickerDropdownOpen);
                          setTypeDropdownOpen(false);
                          setColumnDropdownOpen(false);
                        }}
                        className="bg-slate-900 border border-slate-800 text-white rounded px-3 py-1.5 w-full text-left font-medium text-xs font-sans flex items-center justify-between cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500/35"
                      >
                        <span className="truncate">
                          {txFilterTickers.length === 0
                            ? t.allOption
                            : txFilterTickers.join(', ')}
                        </span>
                        <span className="text-[10px] text-slate-500">▼</span>
                      </button>

                      {tickerDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setTickerDropdownOpen(false)}></div>
                          <div className="absolute left-0 mt-1 w-64 bg-slate-900 border border-slate-800 rounded-lg shadow-xl z-20 p-2 space-y-2 max-h-60 overflow-y-auto">
                            <input
                              type="text"
                              value={tickerSearchQuery}
                              onChange={(e) => setTickerSearchQuery(e.target.value)}
                              placeholder={t.allOption === 'Tutti' ? 'Cerca...' : 'Search...'}
                              className="w-full bg-slate-950 border border-slate-800 text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-emerald-500/50"
                            />
                            <div className="space-y-1 max-h-40 overflow-y-auto">
                              {Array.from<string>(new Set(db.transactions.map(t => t.symbol.toUpperCase()))).sort()
                                .filter((ticker: string) => ticker.includes(tickerSearchQuery.toUpperCase()))
                                .map((ticker: string) => {
                                  const isChecked = txFilterTickers.includes(ticker);
                                  return (
                                    <label
                                      key={ticker}
                                      className="flex items-center gap-2 px-2 py-1 hover:bg-slate-800 rounded cursor-pointer transition text-xs font-bold font-mono text-slate-300 hover:text-white select-none"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => {
                                          if (isChecked) {
                                            setTxFilterTickers(txFilterTickers.filter(x => x !== ticker));
                                          } else {
                                            setTxFilterTickers([...txFilterTickers, ticker]);
                                          }
                                        }}
                                        className="accent-emerald-500 rounded text-emerald-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                                      />
                                      <span>{ticker}</span>
                                    </label>
                                  );
                                })}
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-slate-500 font-bold block font-mono uppercase text-[9px] tracking-wider">{t.fromDateLabel}</label>
                      <input
                        type="date"
                        value={txFilterDateStart}
                        onChange={(e) => setTxFilterDateStart(e.target.value)}
                        className="bg-slate-900 border border-slate-800 text-white rounded px-2 py-1 w-full text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-slate-500 font-bold block font-mono uppercase text-[9px] tracking-wider">{t.toDateLabel}</label>
                      <input
                        type="date"
                        value={txFilterDateEnd}
                        onChange={(e) => setTxFilterDateEnd(e.target.value)}
                        className="bg-slate-900 border border-slate-800 text-white rounded px-2 py-1 w-full text-xs"
                      />
                    </div>
                  </div>
                )}
                
                {getProcessedTransactions().length === 0 ? (
                  <div className="h-28 border border-dashed border-slate-800 flex items-center justify-center p-4 text-slate-500 rounded-2xl italic text-xs font-mono bg-slate-950/20">
                    {t.noTransactionsMatchingCriteriaLabel}
                  </div>
                ) : (
                  <>
                  <div className="hidden lg:block overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950/40">
                    <table className="w-full text-left border-collapse text-xs select-text">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/40 text-slate-400 uppercase tracking-widest font-mono font-black text-[10px]">
                          {txVisibleColumns.includes('date') && (
                            <th 
                              style={{ width: columnWidths['date'] ? `${columnWidths['date']}px` : undefined, minWidth: '80px' }}
                              className="relative py-3 px-4 cursor-pointer select-none hover:text-white transition group" 
                              onClick={() => handleTxSort('date')}
                            >
                              <div className="flex items-center justify-between">
                                <span>{t.dateLabel} {txSortField === 'date' ? (txSortAsc ? '▲' : '▼') : ''}</span>
                              </div>
                              <div
                                onMouseDown={(e) => handleMouseDownResize('date', e)}
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-emerald-500/50 transition-colors"
                              />
                            </th>
                          )}
                          {txVisibleColumns.includes('portfolio') && (
                            <th 
                              style={{ width: columnWidths['portfolio'] ? `${columnWidths['portfolio']}px` : undefined, minWidth: '90px' }}
                              className="relative py-3 px-4 cursor-pointer select-none hover:text-white transition group" 
                              onClick={() => handleTxSort('portfolio')}
                            >
                              <div className="flex items-center justify-between">
                                <span>{t.allOption === 'Tutti' ? 'Portafoglio' : t.allOption === 'Todos' ? 'Cartera' : t.allOption === 'Tous' ? 'Portefeuille' : t.allOption === '全部' ? '投资组合' : t.allOption === 'الكل' ? 'المحفظة' : 'Portfolio'} {txSortField === 'portfolio' ? (txSortAsc ? '▲' : '▼') : ''}</span>
                              </div>
                              <div
                                onMouseDown={(e) => handleMouseDownResize('portfolio', e)}
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-emerald-500/50 transition-colors"
                              />
                            </th>
                          )}
                          {txVisibleColumns.includes('type') && (
                            <th 
                              style={{ width: columnWidths['type'] ? `${columnWidths['type']}px` : undefined, minWidth: '90px' }}
                              className="relative py-3 px-4 cursor-pointer select-none hover:text-white transition group" 
                              onClick={() => handleTxSort('type')}
                            >
                              <div className="flex items-center justify-between">
                                <span>{t.allOption === 'Tutti' ? 'Tipo' : t.allOption === 'Todos' ? 'Tipo' : t.allOption === 'Tous' ? 'Type' : t.allOption === '全部' ? '交易类型' : t.allOption === 'الكل' ? 'النوع' : 'Type'} {txSortField === 'type' ? (txSortAsc ? '▲' : '▼') : ''}</span>
                              </div>
                              <div
                                onMouseDown={(e) => handleMouseDownResize('type', e)}
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-emerald-500/50 transition-colors"
                              />
                            </th>
                          )}
                          {txVisibleColumns.includes('symbol') && (
                            <th 
                              style={{ width: columnWidths['symbol'] ? `${columnWidths['symbol']}px` : undefined, minWidth: '80px' }}
                              className="relative py-3 px-4 cursor-pointer select-none hover:text-white transition group" 
                              onClick={() => handleTxSort('symbol')}
                            >
                              <div className="flex items-center justify-between">
                                <span>{t.tickerLabel} {txSortField === 'symbol' ? (txSortAsc ? '▲' : '▼') : ''}</span>
                              </div>
                              <div
                                onMouseDown={(e) => handleMouseDownResize('symbol', e)}
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-emerald-500/50 transition-colors"
                              />
                            </th>
                          )}
                          {txVisibleColumns.includes('qty') && (
                            <th 
                              style={{ width: columnWidths['qty'] ? `${columnWidths['qty']}px` : undefined, minWidth: '80px' }}
                              className="relative py-3 px-4 cursor-pointer select-none hover:text-white transition group" 
                              onClick={() => handleTxSort('qty')}
                            >
                              <div className="flex items-center justify-between">
                                <span>{t.qtyLabel} {txSortField === 'qty' ? (txSortAsc ? '▲' : '▼') : ''}</span>
                              </div>
                              <div
                                onMouseDown={(e) => handleMouseDownResize('qty', e)}
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-emerald-500/50 transition-colors"
                              />
                            </th>
                          )}
                          {txVisibleColumns.includes('price') && (
                            <th 
                              style={{ width: columnWidths['price'] ? `${columnWidths['price']}px` : undefined, minWidth: '80px' }}
                              className="relative py-3 px-4 cursor-pointer select-none hover:text-white transition group" 
                              onClick={() => handleTxSort('price')}
                            >
                              <div className="flex items-center justify-between">
                                <span>{t.priceLabel} {txSortField === 'price' ? (txSortAsc ? '▲' : '▼') : ''}</span>
                              </div>
                              <div
                                onMouseDown={(e) => handleMouseDownResize('price', e)}
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-emerald-500/50 transition-colors"
                              />
                            </th>
                          )}
                          {txVisibleColumns.includes('total') && (
                            <th 
                              style={{ width: columnWidths['total'] ? `${columnWidths['total']}px` : undefined, minWidth: '80px' }}
                              className="relative py-3 px-4 select-none text-slate-400 group"
                            >
                              <div className="flex items-center justify-between">
                                <span>{t.allOption === 'Tutti' ? 'Totale' : 'Total'}</span>
                              </div>
                              <div
                                onMouseDown={(e) => handleMouseDownResize('total', e)}
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-emerald-500/50 transition-colors"
                              />
                            </th>
                          )}
                          {txVisibleColumns.includes('currentValue') && (
                            <th 
                              style={{ width: columnWidths['currentValue'] ? `${columnWidths['currentValue']}px` : undefined, minWidth: '90px' }}
                              className="relative py-3 px-4 cursor-pointer select-none hover:text-white transition group" 
                              onClick={() => handleTxSort('latestPrice')}
                            >
                              <div className="flex items-center justify-between">
                                <span>{t.allOption === 'Tutti' ? 'Valore Attuale' : t.allOption === 'Todos' ? 'Valor Actual' : t.allOption === 'Tous' ? 'Valeur Actuelle' : t.allOption === '全部' ? '最新价值' : t.allOption === 'الكل' ? 'القيمة الحالية' : 'Current Value'} {txSortField === 'latestPrice' ? (txSortAsc ? '▲' : '▼') : ''}</span>
                              </div>
                              <div
                                onMouseDown={(e) => handleMouseDownResize('currentValue', e)}
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-emerald-500/50 transition-colors"
                              />
                            </th>
                          )}
                          {txVisibleColumns.includes('commission') && (
                            <th 
                              style={{ width: columnWidths['commission'] ? `${columnWidths['commission']}px` : undefined, minWidth: '80px' }}
                              className="relative py-3 px-4 cursor-pointer select-none hover:text-white transition group" 
                              onClick={() => handleTxSort('commission')}
                            >
                              <div className="flex items-center justify-between">
                                <span>{t.commissionLabel} {txSortField === 'commission' ? (txSortAsc ? '▲' : '▼') : ''}</span>
                              </div>
                              <div
                                onMouseDown={(e) => handleMouseDownResize('commission', e)}
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-emerald-500/50 transition-colors"
                              />
                            </th>
                          )}
                          {txVisibleColumns.includes('notes') && (
                            <th 
                              style={{ width: columnWidths['notes'] ? `${columnWidths['notes']}px` : undefined, minWidth: '100px' }}
                              className="relative py-3 px-4 font-semibold text-slate-400 select-none group"
                            >
                              <div className="flex items-center justify-between">
                                <span>{t.notesLabel}</span>
                              </div>
                              <div
                                onMouseDown={(e) => handleMouseDownResize('notes', e)}
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-emerald-500/50 transition-colors"
                              />
                            </th>
                          )}
                          <th 
                            style={{ width: columnWidths['actions'] ? `${columnWidths['actions']}px` : undefined, minWidth: '70px' }}
                            className="py-3 px-4 text-slate-400 text-center select-none"
                          >
                            {t.allOption === 'Tutti' ? 'Azioni' : t.allOption === 'Todos' ? 'Acciones' : t.allOption === 'Tous' ? 'Actions' : t.allOption === '全部' ? '操作' : t.allOption === 'الكل' ? 'الإجراءات' : 'Actions'}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {getProcessedTransactions().map((tx) => {
                          const port = db.portfolios.find(p => p.id === tx.portfolioId);
                          const isBuy = tx.type === TransactionType.BUY;
                          const latestPriceObj = getLatestPriceInfo(tx.symbol);
                          const lotStatus = getLotStatus(tx);
                          return (
                            <tr 
                              key={tx.id} 
                              id={`tx-row-${tx.id}`}
                              className={`transition duration-300 font-mono group ${txHighlightIds.includes(tx.id) ? 'bg-amber-500/20 border-y border-amber-500/40 scale-[1.01] shadow-[0_0_15px_rgba(245,158,11,0.15)] ring-1 ring-amber-500/30' : 'hover:bg-slate-900/35'}`}
                            >
                              {txVisibleColumns.includes('date') && (
                                <td className="py-2.5 px-4 text-slate-400">{formatDateString(tx.date, lang, true)}</td>
                              )}
                              {txVisibleColumns.includes('portfolio') && (
                                <td className="py-2.5 px-4 text-white font-bold">{port?.name || 'Incompleto'}</td>
                              )}
                              {txVisibleColumns.includes('type') && (
                                <td className="py-2.5 px-4">
                                  <div className="flex flex-col gap-1 items-start">
                                    <span className={`px-2 py-0.5 rounded-lg font-black text-[9px] uppercase tracking-wider ${getTypeBadgeClass(tx.type)}`}>
                                      {getTypeLabel(tx.type)}
                                    </span>
                                    {getTransferPeerInfo(tx) && (
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-[10px] text-amber-400 font-bold bg-amber-500/5 px-1.5 py-0.2 rounded border border-amber-500/10">
                                          {getTransferPeerInfo(tx)}
                                        </span>
                                        <button
                                          onClick={() => handleViewConnectedClick(tx)}
                                          className="text-[9px] text-slate-500 hover:text-white underline cursor-pointer font-bold whitespace-nowrap transition-colors"
                                          title={t.viewConnectedTx}
                                        >
                                          {t.viewConnectedTx}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              )}
                              {txVisibleColumns.includes('symbol') && (
                                <td className="py-2.5 px-4 text-white font-black uppercase tracking-wider">
                                  <div className="flex flex-col gap-1 items-start">
                                    <span>{tx.symbol}</span>
                                    {/* Lot status if applicable */}
                                    {lotStatus && lotStatus.status === 'PARTIALLY_TRANSFERRED' && (
                                      <span 
                                        className="text-[8px] text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 whitespace-nowrap cursor-help" 
                                        title={t.lotDetailTooltip?.replace('{orig}', formatFullQuantity(tx.qty)).replace('{trans}', formatFullQuantity(lotStatus.depleted)).replace('{res}', formatFullQuantity(lotStatus.remaining))}
                                      >
                                        {t.lotBadgePartial}
                                      </span>
                                    )}
                                    {lotStatus && lotStatus.status === 'FULLY_TRANSFERRED' && (
                                      <span 
                                        className="text-[8px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 whitespace-nowrap cursor-help"
                                        title={t.lotDetailTooltip?.replace('{orig}', formatFullQuantity(tx.qty)).replace('{trans}', formatFullQuantity(lotStatus.depleted)).replace('{res}', formatFullQuantity(lotStatus.remaining))}
                                      >
                                        {t.lotBadgeFully}
                                      </span>
                                    )}
                                  </div>
                                </td>
                              )}
                              {txVisibleColumns.includes('qty') && (
                                <td className="py-2.5 px-4 text-slate-300 font-bold font-mono">
                                  <QuantityDisplay value={tx.qty} />
                                </td>
                              )}
                              {txVisibleColumns.includes('price') && (
                                <td className="py-2.5 px-4 text-slate-300 font-bold">
                                  {formatCurrency(convertValue(tx.price, tx.currency || 'EUR', selectedCurrency, tx.date), selectedCurrency)}
                                  {tx.currency && tx.currency !== selectedCurrency && (
                                    <span className="block text-[10px] text-slate-500 font-normal">Orig: {formatCurrency(tx.price, tx.currency)}</span>
                                  )}
                                </td>
                              )}
                              {txVisibleColumns.includes('total') && (
                                <td className="py-2.5 px-4 text-slate-300 font-bold">
                                  {formatCurrency(convertValue(tx.price * tx.qty, tx.currency || 'EUR', selectedCurrency, tx.date), selectedCurrency)}
                                  {tx.currency && tx.currency !== selectedCurrency && (
                                    <span className="block text-[10px] text-slate-500 font-normal">Orig: {formatCurrency(tx.price * tx.qty, tx.currency)}</span>
                                  )}
                                </td>
                              )}
                              {txVisibleColumns.includes('currentValue') && (
                                <td className="py-2.5 px-4">
                                  {latestPriceObj ? (
                                    <div className="flex flex-col">
                                      <span className="text-emerald-400 font-black">
                                        {formatCurrency(convertValue(tx.qty * latestPriceObj.price, tx.currency || 'EUR', selectedCurrency, todayStr), selectedCurrency)}
                                      </span>
                                      <span className="text-[9px] text-slate-400 font-bold">
                                        Un: {formatCurrency(convertValue(latestPriceObj.price, tx.currency || 'EUR', selectedCurrency, todayStr), selectedCurrency)}
                                      </span>
                                      <span className="text-[8px] text-slate-500 whitespace-nowrap">{t.readOnLabel}: {formatDateString(latestPriceObj.date, lang)}</span>
                                    </div>
                                  ) : (
                                    <span className="text-slate-500 italic">No cache</span>
                                  )}
                                </td>
                              )}
                              {txVisibleColumns.includes('commission') && (
                                <td className="py-2.5 px-4 font-mono">
                                  {tx.commission > 0 ? (() => {
                                    const isAssetComm = tx.commissionPaymentMode === 'ASSET' || 
                                      (tx.commissionCurrency && tx.commissionCurrency.toUpperCase() === tx.symbol.toUpperCase());
                                    
                                    if (isAssetComm) {
                                      const assetSym = tx.commissionCurrency || tx.symbol;
                                      const unitPriceInDisplay = tx.price
                                        ? convertValue(tx.price, tx.currency || 'EUR', selectedCurrency, tx.date.split('T')[0])
                                        : (latestPriceObj ? convertValue(latestPriceObj.price, tx.currency || 'EUR', selectedCurrency, todayStr) : 0);
                                      const equivFiat = cleanFloatNoise(tx.commission * unitPriceInDisplay);

                                      return (
                                        <div className="flex flex-col">
                                          <span className="font-bold text-rose-400">
                                            <QuantityDisplay value={tx.commission} assetSymbol={assetSym} />
                                          </span>
                                          {unitPriceInDisplay > 0 && (
                                            <span
                                              className="text-[10px] text-slate-400 font-normal whitespace-nowrap"
                                              title={`Tasso di cambio applicato: 1 ${assetSym} = ${formatCurrency(unitPriceInDisplay, selectedCurrency)} (Data: ${formatDateString(tx.date, lang)})`}
                                            >
                                              ≈ {formatCurrency(equivFiat, selectedCurrency)} <span className="text-slate-500 font-sans">(@ {formatCurrency(unitPriceInDisplay, selectedCurrency)})</span>
                                            </span>
                                          )}
                                        </div>
                                      );
                                    }

                                    const commInDisplay = convertValue(
                                      tx.commission,
                                      tx.commissionCurrency || tx.currency || 'EUR',
                                      selectedCurrency,
                                      tx.date.split('T')[0]
                                    );
                                    const origCurr = tx.commissionCurrency || tx.currency || 'EUR';

                                    return (
                                      <div className="flex flex-col">
                                        <span className="font-bold text-rose-400">
                                          {formatCurrency(commInDisplay, selectedCurrency)}
                                        </span>
                                        {origCurr !== selectedCurrency && (
                                          <span
                                            className="text-[9px] text-slate-500 font-normal whitespace-nowrap"
                                            title={`Tasso di cambio: 1 ${origCurr} = ${formatCurrency(convertValue(1, origCurr, selectedCurrency, tx.date.split('T')[0]), selectedCurrency)}`}
                                          >
                                            Orig: {formatCurrency(tx.commission, origCurr)}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })() : (
                                    <span className="text-slate-600">-</span>
                                  )}
                                </td>
                              )}
                              {txVisibleColumns.includes('notes') && (
                                <td className="py-2.5 px-4 text-slate-400 select-all italic font-sans max-w-xs truncate">{tx.notes}</td>
                              )}
                              <td className="py-2.5 px-4 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => handleEditClick(tx)}
                                    className="text-slate-500 hover:text-emerald-400 p-1 rounded hover:bg-emerald-950/20 transition-colors duration-250 cursor-pointer"
                                    title="Modifica Transazione"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => requestDeleteTransaction(tx.id)}
                                    className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-rose-950/20 transition-colors duration-250 cursor-pointer"
                                    title={t.deleteTransaction}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="border-t border-slate-700 bg-slate-900/60 font-mono text-[10px] font-black uppercase tracking-wider">
                        {(() => {
                          const tableTotals = calculateTransactionTableTotals(
                            getProcessedTransactions(),
                            convertValue,
                            selectedCurrency
                          );
                          return (
                            <tr>
                              <td colSpan={['date', 'portfolio', 'type', 'symbol'].filter(id => txVisibleColumns.includes(id)).length} className="py-3 px-4 text-right text-slate-400 tracking-widest">{t.totalsLabel}:</td>
                              {txVisibleColumns.includes('qty') && (
                                <td className="py-3 px-4 text-slate-300 font-bold font-mono">
                                  <QuantityDisplay value={tableTotals.totalQty} />
                                </td>
                              )}
                              {txVisibleColumns.includes('price') && (
                                <td className="py-3 px-4 text-white"></td>
                              )}
                              {txVisibleColumns.includes('total') && (
                                <td className="py-3 px-4 text-slate-300">
                                  {formatCurrency(
                                    tableTotals.totalAmount,
                                    selectedCurrency
                                  )}
                                </td>
                              )}
                              {txVisibleColumns.includes('currentValue') && (
                                <td className="py-3 px-4 text-white"></td>
                              )}
                              {txVisibleColumns.includes('commission') && (
                                <td className="py-3 px-4 text-rose-400">
                                  {tableTotals.totalCommissions > 0 ? (
                                    <div className="flex flex-col">
                                      <span className="font-bold font-mono text-xs" title="Totale complessivo commissioni (fiat + controvalore in asset al cambio della transazione)">
                                        {formatCurrency(tableTotals.totalCommissions, selectedCurrency)}
                                      </span>
                                      {tableTotals.assetCommissions.length > 0 && (
                                        <div className="text-[9px] text-slate-400 font-normal space-y-0.5 mt-0.5 lowercase">
                                          {tableTotals.fiatCommissions > 0 && (
                                            <div>fiat: {formatCurrency(tableTotals.fiatCommissions, selectedCurrency)}</div>
                                          )}
                                          {tableTotals.assetCommissions.map(ac => (
                                            <div
                                              key={ac.symbol}
                                              className="whitespace-nowrap font-mono"
                                              title={`Controvalore: ${formatCurrency(ac.fiatValue, selectedCurrency)} (Cambio medio: 1 ${ac.symbol} = ${formatCurrency(ac.impliedRate, selectedCurrency)})`}
                                            >
                                              + <QuantityDisplay value={ac.qty} assetSymbol={ac.symbol} />
                                              <span className="text-slate-500 ml-1">(≈ {formatCurrency(ac.fiatValue, selectedCurrency)})</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-slate-600">-</span>
                                  )}
                                </td>
                              )}
                              {txVisibleColumns.includes('notes') && (
                                <td className="py-3 px-4 text-white"></td>
                              )}
                              <td className="py-3 px-4"></td>
                            </tr>
                          );
                        })()}
                      </tfoot>
                    </table>
                  </div>
                  
                  {/* Mobile Cards View */}
                  <div className="lg:hidden space-y-4">
                    {getProcessedTransactions().map((tx) => {
                      const port = db.portfolios.find(p => p.id === tx.portfolioId);
                      const isBuy = tx.type === TransactionType.BUY;
                      const latestPriceObj = getLatestPriceInfo(tx.symbol);
                      const lotStatus = getLotStatus(tx);
                      return (
                        <div 
                          key={tx.id} 
                          id={`tx-card-${tx.id}`}
                          className={`border p-4 rounded-xl space-y-3 transition duration-300 ${txHighlightIds.includes(tx.id) ? 'bg-amber-500/20 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)] scale-[1.01] ring-1 ring-amber-500/30' : 'bg-slate-900/40 border-slate-800/80'}`}
                        >
                          <div className="flex justify-between items-start border-b border-slate-800/60 pb-3">
                            <div>
                              <div className="flex flex-col gap-1 items-start mb-1.5">
                                <div className="flex items-center gap-2">
                                  {txVisibleColumns.includes('type') && (
                                    <span className={`px-2 py-0.5 rounded-lg font-black text-[9px] uppercase tracking-wider ${getTypeBadgeClass(tx.type)}`}>
                                      {getTypeLabel(tx.type)}
                                    </span>
                                  )}
                                  {txVisibleColumns.includes('symbol') && (
                                    <span className="text-white font-black uppercase tracking-wider">{tx.symbol}</span>
                                  )}
                                </div>
                                {getTransferPeerInfo(tx) && (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[10px] text-amber-400 font-bold bg-amber-500/5 px-1.5 py-0.2 rounded border border-amber-500/10">
                                      {getTransferPeerInfo(tx)}
                                    </span>
                                    <button
                                      onClick={() => handleViewConnectedClick(tx)}
                                      className="text-[9px] text-slate-500 hover:text-white underline cursor-pointer font-bold transition-colors"
                                      title={t.viewConnectedTx}
                                    >
                                      {t.viewConnectedTx}
                                    </button>
                                  </div>
                                )}
                                {/* Lot status if applicable */}
                                {lotStatus && lotStatus.status === 'PARTIALLY_TRANSFERRED' && (
                                  <span 
                                    className="text-[8px] text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 whitespace-nowrap cursor-help" 
                                    title={t.lotDetailTooltip?.replace('{orig}', formatFullQuantity(tx.qty)).replace('{trans}', formatFullQuantity(lotStatus.depleted)).replace('{res}', formatFullQuantity(lotStatus.remaining))}
                                  >
                                    {t.lotBadgePartial}
                                  </span>
                                )}
                                {lotStatus && lotStatus.status === 'FULLY_TRANSFERRED' && (
                                  <span 
                                    className="text-[8px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 whitespace-nowrap cursor-help"
                                    title={t.lotDetailTooltip?.replace('{orig}', formatFullQuantity(tx.qty)).replace('{trans}', formatFullQuantity(lotStatus.depleted)).replace('{res}', formatFullQuantity(lotStatus.remaining))}
                                  >
                                    {t.lotBadgeFully}
                                  </span>
                                )}
                              </div>
                              {txVisibleColumns.includes('date') && (
                                <div className="text-xs text-slate-400">{formatDateString(tx.date, lang, true)}</div>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => { handleEditClick(tx); }} className="p-1.5 bg-slate-800 text-slate-300 rounded hover:bg-emerald-600 hover:text-white transition">
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => requestDeleteTransaction(tx.id)} className="p-1.5 bg-slate-800 text-slate-300 rounded hover:bg-rose-600 hover:text-white transition">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
                            {txVisibleColumns.includes('portfolio') && (
                              <div>
                                <span className="block text-[10px] text-slate-500 uppercase tracking-widest">{t.allOption === 'Tutti' ? 'Portafoglio' : t.allOption === 'Todos' ? 'Cartera' : t.allOption === 'Tous' ? 'Portefeuille' : t.allOption === '全部' ? '投资组合' : t.allOption === 'الكل' ? 'المحفظة' : 'Portfolio'}</span>
                                <span className="text-white font-bold">{port?.name || (t.allOption === 'Tutti' ? 'Incompleto' : 'Incomplete')}</span>
                              </div>
                            )}
                            {txVisibleColumns.includes('qty') && (
                              <div>
                                <span className="block text-[10px] text-slate-500 uppercase tracking-widest">{t.qtyLabel}</span>
                                <QuantityDisplay value={tx.qty} className="text-slate-300 font-bold font-mono" />
                              </div>
                            )}
                            {txVisibleColumns.includes('price') && (
                              <div>
                                <span className="block text-[10px] text-slate-500 uppercase tracking-widest">{t.priceLabel}</span>
                                <span className="text-slate-300 font-bold">{formatCurrency(convertValue(tx.price, tx.currency || 'EUR', selectedCurrency, tx.date), selectedCurrency)}</span>
                              </div>
                            )}
                            {txVisibleColumns.includes('total') && (
                              <div>
                                <span className="block text-[10px] text-slate-500 uppercase tracking-widest">{t.allOption === 'Tutti' ? 'Totale' : 'Total'}</span>
                                <span className="text-slate-300 font-bold">{formatCurrency(convertValue(tx.price * tx.qty, tx.currency || 'EUR', selectedCurrency, tx.date), selectedCurrency)}</span>
                              </div>
                            )}
                            {txVisibleColumns.includes('currentValue') && latestPriceObj && (
                              <div className="col-span-2 pt-2 mt-1 border-t border-slate-800/40 flex items-center justify-between">
                                <div>
                                  <span className="block text-[10px] text-slate-500 uppercase tracking-widest">{t.allOption === 'Tutti' ? 'Valore Attuale' : t.allOption === 'Todos' ? 'Valor Actual' : t.allOption === 'Tous' ? 'Valeur Actuelle' : t.allOption === '全部' ? '最新价值' : t.allOption === 'الكل' ? 'القيمة الحالية' : 'Current Value'}</span>
                                  <span className="text-emerald-400 font-black">{formatCurrency(convertValue(tx.qty * latestPriceObj.price, tx.currency || 'EUR', selectedCurrency, todayStr), selectedCurrency)}</span>
                                </div>
                                <span className="text-[9px] text-slate-400">({formatCurrency(latestPriceObj.price, tx.currency || 'EUR')})</span>
                              </div>
                            )}
                            {txVisibleColumns.includes('commission') && tx.commission > 0 && (() => {
                              const isAssetComm = tx.commissionPaymentMode === 'ASSET' || 
                                (tx.commissionCurrency && tx.commissionCurrency.toUpperCase() === tx.symbol.toUpperCase());
                              
                              if (isAssetComm) {
                                const assetSym = tx.commissionCurrency || tx.symbol;
                                const unitPriceInDisplay = tx.price
                                  ? convertValue(tx.price, tx.currency || 'EUR', selectedCurrency, tx.date.split('T')[0])
                                  : (latestPriceObj ? convertValue(latestPriceObj.price, tx.currency || 'EUR', selectedCurrency, todayStr) : 0);
                                const equivFiat = cleanFloatNoise(tx.commission * unitPriceInDisplay);

                                return (
                                  <div className="col-span-2 pt-1 border-t border-slate-800/40 flex items-center justify-between">
                                    <span className="block text-[10px] text-slate-500 uppercase tracking-widest">{t.commissionLabel}</span>
                                    <div className="text-right font-mono">
                                      <span className="text-rose-400 font-bold block">
                                        <QuantityDisplay value={tx.commission} assetSymbol={assetSym} />
                                      </span>
                                      {unitPriceInDisplay > 0 && (
                                        <span className="text-[9px] text-slate-400 block font-sans">
                                          ≈ {formatCurrency(equivFiat, selectedCurrency)} <span className="text-slate-500">(@ {formatCurrency(unitPriceInDisplay, selectedCurrency)})</span>
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              }

                              const commInDisplay = convertValue(
                                tx.commission,
                                tx.commissionCurrency || tx.currency || 'EUR',
                                selectedCurrency,
                                tx.date.split('T')[0]
                              );
                              return (
                                <div className="col-span-2 pt-1 border-t border-slate-800/40 flex items-center justify-between">
                                  <span className="block text-[10px] text-slate-500 uppercase tracking-widest">{t.commissionLabel}</span>
                                  <span className="text-rose-400 font-mono font-bold">{formatCurrency(commInDisplay, selectedCurrency)}</span>
                                </div>
                              );
                            })()}
                            {txVisibleColumns.includes('notes') && tx.notes && (
                              <div className="col-span-2 pt-1 mt-1 border-t border-slate-800/40 text-[10px] text-slate-500 italic">
                                {tx.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Mobile Totals Footer Card */}
                    {getProcessedTransactions().length > 0 && (
                      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2.5 shadow-xl text-xs font-mono">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <span className="font-extrabold text-white uppercase tracking-wider flex items-center gap-1.5 font-sans text-sm">
                            <span className="text-emerald-400 font-mono">Σ</span> {t.allOption === 'Tutti' ? 'TOTALI REGISTRO' : 'REGISTRY TOTALS'}
                          </span>
                          <span className="text-xs text-slate-400 font-mono font-bold bg-slate-800/80 px-2 py-0.5 rounded">
                            {getProcessedTransactions().length} {t.allOption === 'Tutti' ? 'registrazioni' : 'records'}
                          </span>
                        </div>
                        {(() => {
                          const tableTotals = calculateTransactionTableTotals(
                            getProcessedTransactions(),
                            convertValue,
                            selectedCurrency
                          );
                          return (
                            <div className="grid grid-cols-2 gap-3 text-slate-300 pt-1">
                              <div>
                                <span className="block text-[10px] text-slate-500 uppercase tracking-widest font-sans font-bold">{t.qtyLabel || 'Quantità Netta'}</span>
                                <QuantityDisplay value={tableTotals.totalQty} className="font-bold text-white font-mono text-sm" />
                              </div>
                              <div>
                                <span className="block text-[10px] text-slate-500 uppercase tracking-widest font-sans font-bold">{t.allOption === 'Tutti' ? 'Importo Totale' : 'Total Amount'}</span>
                                <span className="font-bold text-emerald-400 font-mono text-sm">{formatCurrency(tableTotals.totalAmount, selectedCurrency)}</span>
                              </div>
                              <div className="col-span-2 pt-2 border-t border-slate-800/60 flex flex-col gap-1">
                                <div className="flex justify-between items-center">
                                  <span className="text-[10px] text-slate-500 uppercase tracking-widest font-sans font-bold">{t.commissionLabel || 'Commissioni'}</span>
                                  <span className="font-bold text-rose-400 font-mono text-sm">{formatCurrency(tableTotals.totalCommissions, selectedCurrency)}</span>
                                </div>
                                {tableTotals.assetCommissions.length > 0 && (
                                  <div className="text-[9px] text-slate-400 font-normal space-y-0.5 pt-0.5 text-right font-mono">
                                    {tableTotals.fiatCommissions > 0 && (
                                      <div>Fiat: {formatCurrency(tableTotals.fiatCommissions, selectedCurrency)}</div>
                                    )}
                                    {tableTotals.assetCommissions.map(ac => (
                                      <div key={ac.symbol} className="whitespace-nowrap">
                                        + <QuantityDisplay value={ac.qty} assetSymbol={ac.symbol} /> (≈ {formatCurrency(ac.fiatValue, selectedCurrency)})
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* TAB: DIVIDENDS OVERVIEW & HISTORICAL PAYMENTS */}
          {activeTab === 'dividends' && (
            <DividendsPage
              db={db}
              selectedCurrency={selectedCurrency}
              convertValue={convertValue}
              t={t}
              lang={lang}
              onOpenNewDividend={handleOpenNewDividend}
              onEditTransaction={handleEditClick}
              onDeleteTransaction={requestDeleteTransaction}
            />
          )}

          {/* TAB: OTHER COSTS (FEES & TAXES) */}
          {activeTab === 'otherCosts' && (
            <OtherCostsPage
              t={t}
              db={db}
              selectedCurrency={selectedCurrency}
              convertValue={convertValue}
              costForm={costForm}
              setCostForm={setCostForm}
              saveCostMutation={saveCostMutation}
              requestDeleteCost={requestDeleteCost}
              lang={lang}
            />
          )}

          {/* TAB 4: CALCULATING INTEREST COMPOUND / PAC UTILITIES */}
          {activeTab === 'tools' && (
            <ToolsPage
              t={t}
              currencySymbol={currencySymbol}
              totalNominalValue={totalNominalValue}
              lang={lang}
            />
          )}

          {/* TAB 5: MISSION STATEMENTS (PHILOSOPHY DESCRIPTION) */}
          {activeTab === 'mission' && (
            <MissionPage
              t={t}
            />
          )}

          {/* TAB: INDICI INFLAZIONE */}
          {activeTab === 'inflation' && (
            <InflationPage
              db={db}
              saveDatabaseState={saveDatabaseState}
              currencySymbol={currencySymbol}
              t={t}
            />
          )}

          {/* TAB 6: SETTINGS & SYNOLOGY DOCKER INSTRUCTIONS */}
          {activeTab === 'settings' && (
            <div className="space-y-8 animate-fade-in text-slate-100">
              <div className="border-b border-slate-800 pb-4">
                <h1 id="settings-title" className="text-2xl font-black text-white tracking-tight">{t.setupCenterTitle}</h1>
                <p className="text-sm text-slate-400">{t.setupCenterDesc}</p>
              </div>

              {/* User settings controllers */}
              <div id="settings-card" className="max-w-2xl mx-auto bg-slate-900/40 p-6 rounded-2xl border border-slate-800/80 backdrop-blur-md">
                <div className="space-y-5">
                  <h3 className="font-extrabold text-sm text-white tracking-wider uppercase font-mono border-b border-slate-800 pb-2">{t.appSettingsTitle}</h3>
                  
                  <div className="space-y-2">
                    <label className="text-xs text-slate-400 block font-semibold">{t.themeLabel}</label>
                    <div className="grid grid-cols-3 gap-2">
                      {['light', 'dark', 'system'].map((th) => {
                        const isSel = db.settings.theme === th;
                        return (
                          <button
                            key={th}
                            id={`theme-btn-${th}`}
                            onClick={() => {
                              const newDb = { ...db, settings: { ...db.settings, theme: th as any } };
                              saveDatabaseState(newDb);
                            }}
                            className={`py-2 px-2 text-xs font-bold rounded-xl border uppercase transition-all duration-300 cursor-pointer ${
                              isSel
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/15'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            {th}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-4 border-t border-slate-800/80 pt-4">
                    <div className="space-y-2">
                      <label className="text-xs text-slate-400 block font-semibold">{t.defaultCurrencyLabel}</label>
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                        {activeCurrencies.map((cur) => {
                          const isSel = (db.settings.defaultCurrency || 'EUR') === cur;
                          return (
                            <button
                              key={cur}
                              id={`base-currency-${cur}`}
                              type="button"
                              onClick={() => {
                                const newDb = { ...db, settings: { ...db.settings, defaultCurrency: cur } };
                                saveDatabaseState(newDb);
                              }}
                              className={`py-2 px-1 text-xs font-extrabold rounded-xl border uppercase transition-all duration-300 cursor-pointer ${
                                isSel
                                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/15'
                                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                              }`}
                            >
                              {cur}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs text-slate-400 block font-semibold">{t.activeCurrenciesLabel}</label>
                      <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/60 space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {activeCurrencies.map((cur) => {
                            const isBase = (db.settings.defaultCurrency || 'EUR') === cur;
                            return (
                              <div
                                key={cur}
                                className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 pl-2.5 pr-1.5 py-1 rounded-lg text-xs"
                              >
                                <span className="font-mono font-black text-slate-200">{cur} ({getCurrencySymbol(cur)})</span>
                                {!isBase && activeCurrencies.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updatedList = activeCurrencies.filter(c => c !== cur);
                                      const newDb = { ...db, settings: { ...db.settings, activeCurrencies: updatedList } };
                                      saveDatabaseState(newDb);
                                    }}
                                    className="text-slate-500 hover:text-rose-500 font-extrabold p-0.5 rounded cursor-pointer"
                                    title="Rimuovi valuta"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder={t.addCurrencyPlaceholder}
                            value={newCurrencyInput}
                            onChange={(e) => setNewCurrencyInput(e.target.value.toUpperCase())}
                            maxLength={3}
                            className="bg-slate-900 border border-slate-800 rounded-lg text-xs px-2.5 py-1.5 focus:outline-none focus:border-green-500 font-mono text-white flex-1 placeholder:text-slate-600"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const cleanInput = newCurrencyInput.trim().toUpperCase();
                              if (cleanInput.length === 3 && !activeCurrencies.includes(cleanInput)) {
                                const updatedList = [...activeCurrencies, cleanInput];
                                const newDb = { ...db, settings: { ...db.settings, activeCurrencies: updatedList } };
                                saveDatabaseState(newDb);
                                setNewCurrencyInput('');
                                triggerPriceSync(newDb); // auto Sync rates immediately!
                              }
                            }}
                            className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-3 py-1 rounded-lg text-xs font-bold font-sans transition cursor-pointer"
                          >
                            {t.addBtn}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 pt-3 border-t border-slate-800/80">
                    <div className="text-white text-xs font-semibold">{t.activeLanguageLabel || 'Lingua attiva (Language):'}</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[
                        { code: 'en', label: '🇺🇸 English' },
                        { code: 'it', label: '🇮🇹 Italiano' },
                        { code: 'es', label: '🇪🇸 Español' },
                        { code: 'fr', label: '🇫🇷 Français' },
                        { code: 'zh', label: '🇨🇳 中文' },
                        { code: 'ar', label: '🇸🇦 العربية' }
                      ].map((item) => {
                        const isSel = lang === item.code;
                        return (
                          <button
                            key={item.code}
                            id={`lang-select-btn-${item.code}`}
                            onClick={() => {
                              setLang(item.code);
                              const newDb = { ...db, settings: { ...db.settings, lang: item.code } };
                              saveDatabaseState(newDb);
                            }}
                            className={`text-xs font-bold px-3 py-2 border rounded-xl transition-all duration-300 cursor-pointer text-center ${
                              isSel
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/15'
                                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                            }`}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Instrument Groups Management */}
                  <div className="space-y-3 pt-3 border-t border-slate-800/80">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-white text-xs font-semibold flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{t.instrumentGroupsManagerTitle || 'Raggruppamento Strumenti'}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {t.instrumentGroupsManagerDesc || 'Raggruppa manualmente ticker multipli dello stesso strumento (es. VWCE.MI e VWCE.DE)'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsGroupsModalOpen(true)}
                        className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/30 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>{t.manageGroups || 'Gestisci'} ({(db.instrumentGroups || []).length})</span>
                      </button>
                    </div>

                    {(db.instrumentGroups || []).length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {(db.instrumentGroups || []).map(g => (
                          <div key={g.id} className="px-2.5 py-1 bg-slate-950/80 border border-slate-800 rounded-lg text-xs flex items-center gap-1.5 font-mono">
                            <span className="font-bold text-slate-200">{g.name}</span>
                            <span className="text-[10px] text-slate-500">({g.tickerSymbols.join(', ')})</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Storage & Database Engine Info */}
              <div id="storage-engine-card" className="max-w-2xl mx-auto bg-slate-900/40 p-6 rounded-2xl border border-slate-800/80 backdrop-blur-md">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-emerald-400" />
                      <h3 className="font-extrabold text-sm text-white tracking-wider uppercase font-mono">
                        Archiviazione & Sicurezza Database
                      </h3>
                    </div>
                    <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-full bg-slate-950 border border-slate-800 text-emerald-400">
                      {storageMode === 'browser' ? 'Browser Mode (Client File)' : 'Local Server (Docker)'}
                    </span>
                  </div>

                  <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
                    {storageMode === 'browser' ? (
                      <>
                        <p>
                          I tuoi dati sono salvati in un archivio cifrato con algoritmo <strong>AES-GCM-256</strong> direttamente sul tuo dispositivo. Nessun dato lascia la memoria del browser.
                        </p>
                        {persistedFileName && (
                          <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Database className="w-4 h-4 text-sky-400" />
                              <span className="font-mono text-xs text-slate-200 font-bold">{persistedFileName}</span>
                            </div>
                            <button
                              onClick={handleClearPersistedHandle}
                              className="text-xs font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 px-3 py-1.5 rounded-lg border border-rose-500/20 transition cursor-pointer"
                            >
                              Disconnetti / Cambia Archivio
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <p>
                          Il database è memorizzato sul server locale o contenitore Docker (<code>./data/db.json</code>). Tutte le operazioni di scrittura e lettura sono autenticate con token firmati.
                        </p>
                        <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Database className="w-4 h-4 text-emerald-400" />
                            <span className="font-mono text-xs text-slate-200">Server Backend: <strong>./data/db.json</strong></span>
                          </div>
                          <span className="text-[11px] font-mono text-emerald-400 font-bold">Attivo e Protetto</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Backup & Restore Card */}
              <div id="settings-backup-card" className="max-w-2xl mx-auto bg-slate-900/40 p-6 rounded-2xl border border-slate-800/80 backdrop-blur-md">
                <div className="space-y-5">
                  <h3 className="font-extrabold text-sm text-white tracking-wider uppercase font-mono border-b border-slate-800 pb-2 flex items-center gap-2">
                    <Database className="w-4 h-4 text-emerald-400" />
                    {t.backupRestoreTitle}
                  </h3>
                  
                  <div className="text-xs text-slate-400 leading-relaxed font-sans mb-4">
                    {t.backupRestoreDesc}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4">
                    <button
                      onClick={handleExportDatabase}
                      className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all border border-slate-700 cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-emerald-400" />
                      <span>{t.exportDatabaseBtn}</span>
                    </button>
                    
                    <div className="flex-1 relative">
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleFileSelect}
                        ref={fileInputRef}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        title={t.importDatabaseBtn}
                      />
                      <button className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all border border-slate-700 pointer-events-none">
                        <Upload className="w-4 h-4 text-sky-400" />
                        <span>{t.importDatabaseBtn}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pending Import Modal */}
              {pendingImport && (
                <ModalPortal isOpen={!!pendingImport}>
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 overflow-hidden animate-fade-in"
                    onClick={(e) => {
                      if (e.target === e.currentTarget) setPendingImport(null);
                    }}
                  >
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-6 shadow-2xl max-h-[calc(100vh-2rem)] flex flex-col my-auto overflow-hidden">
                      <div className="flex items-center gap-3 border-b border-slate-800 pb-4 shrink-0">
                        <div className="p-2 bg-sky-500/10 text-sky-400 rounded-lg">
                          <Database className="w-6 h-6" />
                        </div>
                        <h2 className="text-xl font-black text-white">{t.importOptionsTitle}</h2>
                      </div>

                      <div className="space-y-4 overflow-y-auto custom-scrollbar pr-1 flex-1 min-h-0">
                        <div className="bg-rose-950/20 border border-rose-500/20 p-4 rounded-xl">
                          <h4 className="flex items-center gap-2 font-bold text-rose-400 mb-2 text-sm">
                            <AlertTriangle className="w-4 h-4" />
                            {t.overwriteDatabaseTitle}
                          </h4>
                          <p className="text-xs text-slate-300">
                            {t.overwriteDatabaseDesc}
                          </p>
                          <button
                            onClick={executeOverwrite}
                            className="mt-3 w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-2 rounded-lg text-sm transition-colors cursor-pointer"
                          >
                            {t.overwriteBtn}
                          </button>
                        </div>

                        <div className="bg-emerald-950/20 border border-emerald-500/20 p-4 rounded-xl">
                          <h4 className="flex items-center gap-2 font-bold text-emerald-400 mb-2 text-sm">
                            <Database className="w-4 h-4" />
                            {t.mergeDataTitle}
                          </h4>
                          <p className="text-xs text-slate-300">
                            {t.mergeDataDesc}
                          </p>
                          <button
                            onClick={executeMerge}
                            className="mt-3 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-lg text-sm transition-colors cursor-pointer"
                          >
                            {t.mergeBtn}
                          </button>
                        </div>
                      </div>

                      <div className="pt-2 shrink-0 border-t border-slate-800">
                        <button
                          onClick={() => setPendingImport(null)}
                          className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
                        >
                          {t.cancel}
                        </button>
                      </div>
                    </div>
                  </div>
                </ModalPortal>
              )}

              {/* Comprehensive Legal Disclaimer & Financial Information Advisory Card */}
              <div id="settings-disclaimer-card" className="max-w-2xl mx-auto bg-rose-950/10 p-6 rounded-2xl border border-rose-500/25 backdrop-blur-md space-y-4">
                <div className="flex items-center gap-2.5 border-b border-rose-500/25 pb-3">
                  <span className="p-1.5 bg-rose-500/10 rounded-xl text-rose-400 border border-rose-500/20">
                    <Scale className="w-5 h-5 animate-pulse" />
                  </span>
                  <h3 className="font-extrabold text-sm text-rose-400 tracking-wider uppercase font-mono">{t.disclaimerTitle}</h3>
                </div>
                <div className="space-y-3 text-xs text-slate-300 leading-relaxed font-sans">
                  <p className="font-bold text-rose-300">{t.disclaimerText1}</p>
                  <p className="text-slate-400">{t.disclaimerText2}</p>
                </div>
                <div className="text-[9px] text-slate-500 font-mono pt-3 border-t border-slate-800/80 flex flex-wrap gap-x-4 gap-y-1">
                  <span>JURISDICTIONS: US, UK, IT, INT</span>
                  <span>SECURITY REGULATORY DISCLOSURE STATEMENTS</span>
                </div>
              </div>

            </div>
          )}

        </main>
      </div>

      {/* Footer footer */}
      <footer className="border-t border-slate-800/60 bg-[#070c17]/60 backdrop-blur-md py-6 text-xs text-slate-500 font-mono mt-auto relative">
        <div className="mx-auto px-4 md:px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-center md:text-left">
            <p className="font-sans text-slate-400 font-semibold">&copy; {new Date().getFullYear()} {t.appName} &bull; Self-hosted Private Portfolio Manager &bull; v1.0.0</p>
            <p className="text-[10px] text-slate-500 font-mono mt-1">Powered by <a href="https://www.garzia.it/" target="_blank" className="hover:text-emerald-400 underline transition duration-300">Francesco Garzia</a></p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={() => setShowLegalDisclaimerModal(true)}
              className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 hover:border-rose-500/30 rounded-xl text-xs font-bold transition duration-300 flex items-center gap-1.5 cursor-pointer shadow-sm shadow-rose-950/20 outline-none"
            >
              <Scale className="w-3.5 h-3.5" />
              <span>{t.disclaimerTitle}</span>
            </button>
          </div>
        </div>
      </footer>

      {/* Interactive Regulatory & Legal Disclaimer Modal */}
      {renderLegalDisclaimerModal()}

      {/* Safety Deletion Confirmation Modal */}
      {renderDeletionConfirmModal()}

      {/* Global Modals for Transaction and Transfer */}
      <TransactionModal
        isOpen={txForm.open}
        onClose={() => setTxForm({ open: false, editId: null, portfolioId: '', date: '', type: TransactionType.BUY, symbol: '', qty: '', price: '', commission: '', currency: 'EUR', commissionCurrency: 'EUR', notes: '' })}
        txForm={txForm}
        setTxForm={setTxForm}
        onSave={saveTransactionMutation}
        formErr={formErr}
        db={db}
        t={t}
        activeCurrencies={activeCurrencies}
        lang={lang}
      />

      <TransferModal
        isOpen={transferForm.open}
        onClose={() => setTransferForm({ open: false, editTransferId: null, sourcePortfolioId: '', destPortfolioId: '', symbol: '', qty: '', price: '', priceCurrency: 'EUR', sourceCommission: '', sourceCommissionCurrency: 'EUR', sourceCommissionPaymentMode: 'EXTERNAL', destCommission: '', destCommissionCurrency: 'EUR', destCommissionPaymentMode: 'EXTERNAL', date: new Date().toISOString().substring(0, 16), criteria: 'FIFO', notes: '' })}
        transferForm={transferForm}
        setTransferForm={setTransferForm}
        onSave={saveTransferMutation}
        formErr={formErr}
        db={db}
        t={t}
        activeCurrencies={activeCurrencies}
        getAvailableTickersForSource={getAvailableTickersForSource}
        getAvailableLots={getAvailableLots}
        formatFullQuantity={formatFullQuantity}
        lang={lang}
      />

      <InstrumentGroupsModal
        isOpen={isGroupsModalOpen}
        onClose={() => setIsGroupsModalOpen(false)}
        t={t}
        lang={lang}
        groups={db.instrumentGroups || []}
        allTransactions={db.transactions}
        onSaveGroup={handleSaveInstrumentGroup}
        onDeleteGroup={handleDeleteInstrumentGroup}
      />
    </div>
  );
}
