/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { translations } from './locales/index.ts';
import { Currency, DBState, Account, Portfolio, Transaction, TransactionType } from './types.ts';
import { encryptData, decryptData } from './utils/crypto.ts';
import { saveFileHandleInIndexedDB, getFileHandleFromIndexedDB, clearFileHandleFromIndexedDB } from './utils/indexedDB.ts';
import MissionPage from './components/MissionPage.tsx';
import ToolsPage from './components/ToolsPage.tsx';
import { InflationPage } from './components/InflationPage.tsx';
import InteractiveChart, { DailyBalance } from './components/InteractiveChart.tsx';
import { TickerInput } from './components/TickerInput.tsx';
import { formatDateString } from './utils.ts';
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
  ShieldAlert
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
    priceCache: {}
  });

  // Navigation state
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  // Interactive toggle states
  const [includeCommissions, setIncludeCommissions] = useState<boolean>(true);
  const [selectedCurrency, setSelectedCurrency] = useState<string>('EUR');
  const [activeBenchmark, setActiveBenchmark] = useState<string>('NONE');
  const [benchmarkSymbol, setBenchmarkSymbol] = useState<string>('SWDA.MI');
  const [inflationToggle, setInflationToggle] = useState<boolean>(false);
  const [dashFilter, setDashFilter] = useState<{ type: 'ALL' | 'ACCOUNT' | 'PORTFOLIO' | 'TICKER'; id: string }>({ type: 'ALL', id: '' });
  const [newCurrencyInput, setNewCurrencyInput] = useState<string>('');

  // Sync operations loading state
  const [isSyncingPrices, setIsSyncingPrices] = useState<boolean>(false);

  // Managers modal states
  const [accountForm, setAccountForm] = useState<{ open: boolean; editId: string | null; name: string; currency: Currency | string; include: boolean }>({
    open: false, editId: null, name: '', currency: Currency.EUR, include: true
  });
  const [portfolioForm, setPortfolioForm] = useState<{ open: boolean; editId: string | null; accountId: string; name: string; include: boolean }>({
    open: false, editId: null, accountId: '', name: '', include: true
  });
  const [txForm, setTxForm] = useState<{ open: boolean; editId: string | null; portfolioId: string; date: string; type: TransactionType; symbol: string; qty: number; price: number; commission: number; currency: string; commissionCurrency: string; notes: string }>({
    open: false, editId: null, portfolioId: '', date: '', type: TransactionType.BUY, symbol: '', qty: 0, price: 0, commission: 0, currency: 'EUR', commissionCurrency: 'EUR', notes: ''
  });

  // Transaction Table Filters & Sorting States
  const [txSortField, setTxSortField] = useState<string>('date');
  const [txSortAsc, setTxSortAsc] = useState<boolean>(false); // default descending (newest first)
  const [txFilterBrokerId, setTxFilterBrokerId] = useState<string>('');
  const [txFilterPortfolioId, setTxFilterPortfolioId] = useState<string>('');
  const [txFilterType, setTxFilterType] = useState<string>('');
  const [txFilterTicker, setTxFilterTicker] = useState<string>('');
  const [txFilterDateStart, setTxFilterDateStart] = useState<string>('');
  const [txFilterDateEnd, setTxFilterDateEnd] = useState<string>('');

  // Sincronizzazione feedback alert state
  const [syncFeedback, setSyncFeedback] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Form custom error checking
  const [formErr, setFormErr] = useState<string>('');

  // Legal disclaimer modal state
  const [showLegalDisclaimerModal, setShowLegalDisclaimerModal] = useState<boolean>(false);

  // ================= REACT LIFE FLOWS =================

  const checkStorageMode = async (): Promise<'local' | 'browser'> => {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = await res.json();
        const mode = data.storageMode === 'local' ? 'local' : 'browser';
        setStorageMode(mode);
        return mode;
      }
    } catch (err) {
      console.warn('Could not read config endpoint, defaulting storageMode to "browser"', err);
    }
    setStorageMode('browser');
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
  
  const activeCurrencies: string[] = db.settings.activeCurrencies || ['EUR', 'USD', 'GBP', 'CHF', 'JPY'];

  const getExchangeRate = (fromStr: string, toStr: string, dateStr: string): number => {
    const from = fromStr.toUpperCase();
    const to = toStr.toUpperCase();
    if (from === to) return 1.0;
    
    // Normalize date to YYYY-MM-DD
    const dStr = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;

    const lookupRate = (f: string, t: string): number | null => {
      const symbolDirect = `${f}${t}=X`;
      const symbolInverse = `${t}${f}=X`;

      // 1. Direct lookup
      if (db.priceCache[symbolDirect] && db.priceCache[symbolDirect][dStr] !== undefined) {
        return db.priceCache[symbolDirect][dStr];
      }
      // 2. Inverse lookup
      if (db.priceCache[symbolInverse] && db.priceCache[symbolInverse][dStr] !== undefined && db.priceCache[symbolInverse][dStr] > 0) {
        return 1 / db.priceCache[symbolInverse][dStr];
      }

      // 3. Trailing historical fallback
      if (db.priceCache[symbolDirect]) {
        const dates = Object.keys(db.priceCache[symbolDirect]).sort();
        if (dates.length > 0) {
          const preceding = dates.filter(dt => dt <= dStr);
          const targetDt = preceding.length > 0 ? preceding[preceding.length - 1] : dates[0];
          return db.priceCache[symbolDirect][targetDt];
        }
      }
      if (db.priceCache[symbolInverse]) {
        const dates = Object.keys(db.priceCache[symbolInverse]).sort();
        if (dates.length > 0) {
          const preceding = dates.filter(dt => dt <= dStr);
          const targetDt = preceding.length > 0 ? preceding[preceding.length - 1] : dates[0];
          if (db.priceCache[symbolInverse][targetDt] > 0) {
            return 1 / db.priceCache[symbolInverse][targetDt];
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
      'AUDEUR': 0.61, 'EURAUD': 1.64
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
    if (currentMode === 'browser') {
      try {
        const handle = await getFileHandleFromIndexedDB();
        if (handle) {
          setHasPersistedHandle(true);
          setPersistedFileName(handle.name);
          setFileHandle(handle);
          setPasswordSet(true);
          setIsAuthenticated(false);
        } else {
          setHasPersistedHandle(false);
          setPasswordSet(false);
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
        const r = await fetch('/api/auth/status', { method: 'POST' });
        const data = await r.json();
        setPasswordSet(data.passwordSet);
        if (!data.passwordSet) {
          // If password is not set, allow into system so they can register
          setIsAuthenticated(false);
        }
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
      setDb(initialDbWithLang);
      
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
      const file = await pendingFileHandle.getFile();
      const encryptedText = await file.text();
      
      // Try decrypting with entered password
      const decryptedDb = await decryptData(encryptedText, passwordInput);
      if (!decryptedDb || !decryptedDb.settings) {
        throw new Error("Contenuto cifrato non valido.");
      }
      
      // Setup file states
      let mergedSettings = { ...defaultInitialDB.settings, ...decryptedDb.settings };
      if (!mergedSettings.inflationIndices || mergedSettings.inflationIndices.length === 0) {
        mergedSettings.inflationIndices = defaultInitialDB.settings.inflationIndices;
      }
      const fullDb = { ...defaultInitialDB, ...decryptedDb, settings: mergedSettings };
      
      await saveFileHandleInIndexedDB(pendingFileHandle);
      
      setFileHandle(pendingFileHandle);
      setBrowserPassword(passwordInput);
      setDb(fullDb);
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
    if (!fileHandle) {
      setAuthError('Nessun file database registrato.');
      return;
    }

    try {
      // 1) Verify and request permission from browser
      let permissionState = await fileHandle.queryPermission({ mode: 'readwrite' });
      if (permissionState !== 'granted') {
        permissionState = await fileHandle.requestPermission({ mode: 'readwrite' });
      }
      
      if (permissionState !== 'granted') {
        setAuthError("Permesso di lettura/scrittura sul file negato dal browser.");
        return;
      }
      
      // 2) Read current file contents
      const file = await fileHandle.getFile();
      const encryptedText = await file.text();
      
      // 3) Try decrypting with the password
      const decryptedDb = await decryptData(encryptedText, passwordInput);
      if (!decryptedDb || !decryptedDb.settings) {
        throw new Error("Contenuto non valido.");
      }
      
      // 4) Clean and merge states
      let mergedSettings = { ...defaultInitialDB.settings, ...decryptedDb.settings };
      if (!mergedSettings.inflationIndices || mergedSettings.inflationIndices.length === 0) {
        mergedSettings.inflationIndices = defaultInitialDB.settings.inflationIndices;
      }
      const fullDb = { ...defaultInitialDB, ...decryptedDb, settings: mergedSettings };
      
      setBrowserPassword(passwordInput);
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
      await clearFileHandleFromIndexedDB();
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
        const initialDbWithLang = {
          ...db,
          settings: {
            ...db.settings,
            lang: lang
          }
        };
        setDb(initialDbWithLang);
        setIsAuthenticated(true);
        setPasswordSet(true);
        saveDatabaseState(initialDbWithLang);
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
        setIsAuthenticated(true);
      } else {
        setAuthError(t.incorrectPassword);
      }
    } catch (err) {
      setAuthError('Connection failed.');
    }
  };

  const fetchDB = async () => {
    if (storageMode === 'browser') {
      if (db && db.settings) {
        triggerPriceSync(db);
      }
      return;
    }

    try {
      const r = await fetch('/api/db');
      if (r.ok) {
        const fullState = await r.json();
        setDb(fullState);
        triggerPriceSync(fullState);
        if (fullState.settings?.lang) {
          setLang(fullState.settings.lang);
        }
      }
    } catch (err) {
      console.error('Error retrieving database', err);
    }
  };

  const triggerPriceSync = async (stateObj: DBState, force: boolean = false) => {
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
      const r = await fetch('/api/prices/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: activeSymbols, force })
      });
      if (r.ok) {
        const syncRes = await r.json();
        setDb(prev => ({ ...prev, priceCache: syncRes.priceCache }));
        setSyncFeedback({ message: t.quotesUpdatedSuccess, type: 'success' });
        setTimeout(() => setSyncFeedback(null), 4000);
      } else {
        setSyncFeedback({ message: t.quotesSyncError, type: 'error' });
        setTimeout(() => setSyncFeedback(null), 5000);
      }
    } catch (err) {
      console.error('Price sync failed', err);
      setSyncFeedback({ message: t.quotesSyncConnectionFailed, type: 'error' });
      setTimeout(() => setSyncFeedback(null), 5000);
    } finally {
      setIsSyncingPrices(false);
    }
  };

  // Inflation multiplier logic was migrated below to getTimelineBalances for chronological sequential flow.

  // ================= GENERAL FINANCE CALCULATIONS =================

  // Account filter
  let activePortIds: string[] = [];
  let tickerFilterSymbol: string | null = null;

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
  }

  // Transactions list matching active settings
  let filteredTx = db.transactions.filter(t => activePortIds.includes(t.portfolioId));
  if (tickerFilterSymbol) {
    filteredTx = filteredTx.filter(t => t.symbol.toUpperCase() === tickerFilterSymbol);
  }

  // Sort chronologically
  const activeTxSorted = [...filteredTx].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Current owned share metrics
  const tickerMetrics: {
    [sym: string]: {
      sharesOwned: number;
      totalBuyCash: number;
      totalBuyShareCount: number;
      totalCommissionsPaid: number;
      pmc: number;
      avgCommissionShare: number;
    }
  } = {};

  activeTxSorted.forEach((t) => {
    const sym = t.symbol.toUpperCase();
    if (!tickerMetrics[sym]) {
      tickerMetrics[sym] = { sharesOwned: 0, totalBuyCash: 0, totalBuyShareCount: 0, totalCommissionsPaid: 0, pmc: 0, avgCommissionShare: 0 };
    }
    const met = tickerMetrics[sym];
    if (t.type === TransactionType.BUY) {
      met.sharesOwned += t.qty;
      const cashInDisplay = convertValue(t.qty * t.price, t.currency || 'EUR', selectedCurrency, t.date);
      const commInDisplay = convertValue(t.commission || 0, t.commissionCurrency || t.currency || 'EUR', selectedCurrency, t.date);
      met.totalBuyCash += cashInDisplay;
      met.totalBuyShareCount += t.qty;
      met.totalCommissionsPaid += commInDisplay;
    } else {
      met.sharesOwned = Math.max(0, met.sharesOwned - t.qty);
      // For average cost calculation, sells do not affect the original average purchase cost!
    }
  });

  // Calculate final PMCs
  Object.keys(tickerMetrics).forEach((sym) => {
    const met = tickerMetrics[sym];
    if (met.totalBuyShareCount > 0) {
      met.pmc = met.totalBuyCash / met.totalBuyShareCount;
      met.avgCommissionShare = met.totalCommissionsPaid / met.totalBuyShareCount;
    }
  });

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

  // Compute stats aggregates
  let totalCapitalInvested = 0; // standard unadjusted capital out of pocket (current assets * PMC)
  let totalCapsWithCommissions = 0; // current assets * (PMC + commission per share)
  let totalNominalValue = 0; // current active shares valued at today's price in cache
  let yesterdayNominalValue = 0; // valued at yesterday's price to calculate daily variance

  const todayStr = new Date().toISOString().split('T')[0];
  const yesterdayObj = new Date();
  yesterdayObj.setDate(yesterdayObj.getDate() - 1);
  const yesterdayStr = yesterdayObj.toISOString().split('T')[0];

  Object.keys(tickerMetrics).forEach((sym) => {
    const met = tickerMetrics[sym];
    if (met.sharesOwned <= 0) return;

    const tickerCurrency = getTickerCurrency(sym);
    // met.pmc is already in selectedCurrency because totalBuyCash was converted to selectedCurrency on transactions dates
    const todayPrice = getPriceForDate(sym, todayStr, convertValue(met.pmc, selectedCurrency, tickerCurrency, todayStr));
    const yesterdayPrice = getPriceForDate(sym, yesterdayStr, todayPrice);

    const baseCost = met.sharesOwned * met.pmc;
    const commCost = baseCost + (met.sharesOwned * met.avgCommissionShare);

    totalCapitalInvested += baseCost;
    totalCapsWithCommissions += commCost;

    const todayPriceInDisplay = convertValue(todayPrice, tickerCurrency, selectedCurrency, todayStr);
    const yesterdayPriceInDisplay = convertValue(yesterdayPrice, tickerCurrency, selectedCurrency, yesterdayStr);

    totalNominalValue += (met.sharesOwned * todayPriceInDisplay);
    yesterdayNominalValue += (met.sharesOwned * yesterdayPriceInDisplay);
  });

  const totalCommissionsPaid = activeTxSorted.reduce((sum, tx) => sum + convertValue(tx.commission || 0, tx.commissionCurrency || tx.currency || 'EUR', selectedCurrency, tx.date), 0);
  const currentValAdjusted = totalNominalValue - (includeCommissions ? totalCommissionsPaid : 0);

  const costBasis = includeCommissions ? totalCapsWithCommissions : totalCapitalInvested;
  const absoluteGain = currentValAdjusted - totalCapitalInvested; // Net gain: Current Adjusted - Truly Invested
  const percentageReturn = totalCapitalInvested > 0 ? (absoluteGain / totalCapitalInvested) * 100 : 0;

  const dailyChangeAbsolute = totalNominalValue - yesterdayNominalValue;
  const dailyGainPercentage = yesterdayNominalValue > 0 ? (dailyChangeAbsolute / yesterdayNominalValue) * 100 : 0;

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

      const cfAmount = tx.type === TransactionType.BUY
        ? -(tx.qty * priceInDisplay + (includeCommissions ? commInDisplay : 0))
        : (tx.qty * priceInDisplay - (includeCommissions ? commInDisplay : 0));

      solverFlows.push({ years: yearsAgo, amount: cfAmount });
    });

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

    // Historical tracking parameters
    const ongoingHoldings: { [sym: string]: number } = {};
    const ongoingCommissionsPaid: { [sym: string]: number } = {};
    
    // Track PMC dynamically
    const ongoingBuyCashSpent: { [sym: string]: number } = {};
    const ongoingBuyShareWeights: { [sym: string]: number } = {};

    let runningInflationMultiplier = 1.0;
    let prevYear: number | null = null;
    let prevMonth: number | null = null;
    let cumulativeCommissions = 0;

    dates.forEach((dateString) => {
      // 1. Accumulate chronological inflation step-by-step (past to present)
      const tDate = new Date(dateString + 'T00:00:00Z');
      const curYear = tDate.getUTCFullYear();
      const curMonth = tDate.getUTCMonth() + 1;

      if (prevYear !== null && prevMonth !== null && (curYear !== prevYear || curMonth !== prevMonth)) {
        // We just transitioned to a new month. Apply the completed month's inflation rate chronological forward!
        const activeInf = db.settings.inflationIndices.find(idx => idx?.id === db.settings.selectedInflationId);
        const rate = getMonthlyInflationRate(activeInf, prevYear, prevMonth);
        runningInflationMultiplier *= (1 + rate);
      }
      
      prevYear = curYear;
      prevMonth = curMonth;

      // Aggregate transactions on this day
      const txsOnDay = activeTxSorted.filter(t => t.date.split('T')[0] === dateString);
      
      txsOnDay.forEach((tx) => {
        const sym = tx.symbol.toUpperCase();
        if (!ongoingHoldings[sym]) {
          ongoingHoldings[sym] = 0;
          ongoingCommissionsPaid[sym] = 0;
          ongoingBuyCashSpent[sym] = 0;
          ongoingBuyShareWeights[sym] = 0;
        }

        const commInDisplay = convertValue(tx.commission || 0, tx.commissionCurrency || tx.currency || 'EUR', selectedCurrency, dateString);

        if (tx.type === TransactionType.BUY) {
          ongoingHoldings[sym] += tx.qty;
          ongoingCommissionsPaid[sym] += commInDisplay;
          const cashInDisplay = convertValue(tx.qty * tx.price, tx.currency || 'EUR', selectedCurrency, dateString);
          ongoingBuyCashSpent[sym] += cashInDisplay;
          ongoingBuyShareWeights[sym] += tx.qty;
        } else {
          ongoingHoldings[sym] = Math.max(0, ongoingHoldings[sym] - tx.qty);
        }
        cumulativeCommissions += commInDisplay;
      });

      // Valuate holdings on this day
      let dayNominalBasis = 0;
      let dayCapsWithComms = 0;
      let dayValue = 0;

      Object.keys(ongoingHoldings).forEach((sym) => {
        const qty = ongoingHoldings[sym];
        if (qty <= 0) return;

        const tickerCurrency = getTickerCurrency(sym);

        const currentPMC = ongoingBuyShareWeights[sym] > 0 
          ? ongoingBuyCashSpent[sym] / ongoingBuyShareWeights[sym] 
          : 0;
        const currentAvgComm = ongoingBuyShareWeights[sym] > 0
          ? ongoingCommissionsPaid[sym] / ongoingBuyShareWeights[sym]
          : 0;

        const basePMCValue = qty * currentPMC;
        const baseCommValue = basePMCValue + (qty * currentAvgComm);

        dayNominalBasis += basePMCValue;
        dayCapsWithComms += baseCommValue;

        const currentPMCNative = convertValue(currentPMC, selectedCurrency, tickerCurrency, dateString);
        const dailyPrice = getPriceForDate(sym, dateString, currentPMCNative);
        const dailyPriceInDisplay = convertValue(dailyPrice, tickerCurrency, selectedCurrency, dateString);
        dayValue += (qty * dailyPriceInDisplay);
      });

      // Adjust currentValue and realValueBased based on active includeCommissions setting!
      const finalDayValue = dayValue - (includeCommissions ? cumulativeCommissions : 0);
      const realValInflatedDiscount = finalDayValue / runningInflationMultiplier;

      // Benchmark normalized retrieval
      let benchClosingNormalized = undefined;
      if (activeBenchmark === 'TICKER' && benchmarkSymbol) {
        const rawBenchPrice = getPriceForDate(benchmarkSymbol, dateString, 100);
        const benchCurr = benchmarkSymbol.toUpperCase().endsWith('.MI') ? 'EUR' : 'USD';
        benchClosingNormalized = convertValue(rawBenchPrice, benchCurr, selectedCurrency, dateString);
      } else if (activeBenchmark !== 'NONE') {
        // Find benchmark value based on another specific portfolio or account
        const targetId = activeBenchmark;
        const bTx = db.transactions.filter(t => t.portfolioId === targetId || t.portfolioId === 'p-' + targetId);
        // Solve basic weight
        let bQtySum = 0;
        bTx.forEach(t => {
          if (t.date.split('T')[0] <= dateString) {
            bQtySum += t.type === TransactionType.BUY ? t.qty : -t.qty;
          }
        });
        const matchSymbol = bTx[0]?.symbol || '';
        const matchPrice = getPriceForDate(matchSymbol, dateString, 100);
        const matchCurrency = bTx[0]?.currency || 'EUR';
        const matchPriceInDisplay = convertValue(matchPrice, matchCurrency, selectedCurrency, dateString);
        benchClosingNormalized = Math.max(0, bQtySum * matchPriceInDisplay);
      }

      timeline.push({
        date: dateString,
        investedNominal: dayNominalBasis,
        investedWithCommissions: dayCapsWithComms,
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

  // Allocation matrix
  const getAssetAllocationMatrix = () => {
    const allocations: { symbol: string; value: number; weight: number; target: number }[] = [];
    if (totalNominalValue === 0) return [];

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
      const activeTargetsString = localStorage.getItem(`gainbusters_target_weight_${sym}`);
      const targetPercent = activeTargetsString ? Number(activeTargetsString) : 0;

      allocations.push({
        symbol: sym,
        value: val,
        weight: weightPercent,
        target: targetPercent
      });
    });

    return allocations;
  };

  const assetAllocation = getAssetAllocationMatrix();

  const handleUpdateTargetWeight = (symbol: string, val: number) => {
    localStorage.setItem(`gainbusters_target_weight_${symbol.toUpperCase()}`, String(val));
    fetchDB(); // refresh calculation
  };

  // ================= GENERAL MUTATORS =================

  const saveDatabaseState = async (newDb: DBState) => {
    setDb(newDb);
    if (storageMode === 'browser') {
      if (fileHandle) {
        try {
          const encryptedText = await encryptData(newDb, browserPassword);
          const writable = await fileHandle.createWritable();
          await writable.write(encryptedText);
          await writable.close();
          console.log('Background auto-save to PC file succeeded!');
        } catch (err) {
          console.error('Auto-save to PC file failed, falling back to localStorage', err);
          try {
            localStorage.setItem('gainbusters_db', JSON.stringify(newDb));
          } catch (_) {}
        }
      } else {
        try {
          localStorage.setItem('gainbusters_db', JSON.stringify(newDb));
        } catch (_) {}
      }
    } else {
      // Write accounts / portfolios / transactions / settings respectively
      try {
        await fetch('/api/db/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newDb.settings)
        });
        await fetch('/api/db/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accounts: newDb.accounts })
        });
        await fetch('/api/db/portfolios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ portfolios: newDb.portfolios })
        });
        await fetch('/api/db/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transactions: newDb.transactions })
        });
      } catch (err) {
        console.error('State mutation persistence failed on local backend', err);
      }
    }
  };

  // Accounts CRUD
  const saveAccountMutation = () => {
    if (!accountForm.name.trim()) return;
    const newAccounts = [...db.accounts];
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
    const updated = { ...db, accounts: newAccounts };
    saveDatabaseState(updated);
    setAccountForm({ open: false, editId: null, name: '', currency: Currency.EUR, include: true });
  };

  const deleteAccountMutation = (id: string) => {
    const freshAccounts = db.accounts.filter(a => a.id !== id);
    // Cascade delete linked portfolios & transactions
    const linkedPorts = db.portfolios.filter(p => p.accountId === id);
    const linkedPortIds = linkedPorts.map(p => p.id);
    const freshPortfolios = db.portfolios.filter(p => p.accountId !== id);
    const freshTx = db.transactions.filter(t => !linkedPortIds.includes(t.portfolioId));

    const updated = { ...db, accounts: freshAccounts, portfolios: freshPortfolios, transactions: freshTx };
    saveDatabaseState(updated);
  };

  // Portfolios CRUD
  const savePortfolioMutation = () => {
    if (!portfolioForm.name.trim() || !portfolioForm.accountId) return;
    const newPorts = [...db.portfolios];
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
    const updated = { ...db, portfolios: newPorts };
    saveDatabaseState(updated);
    setPortfolioForm({ open: false, editId: null, accountId: '', name: '', include: true });
  };

  const deletePortfolioMutation = (id: string) => {
    const freshPorts = db.portfolios.filter(p => p.id !== id);
    const freshTx = db.transactions.filter(t => t.portfolioId !== id);
    const updated = { ...db, portfolios: freshPorts, transactions: freshTx };
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
    if (txFilterType) {
      list = list.filter(tx => tx.type === txFilterType);
    }

    // Filter by Ticker
    if (txFilterTicker) {
      list = list.filter(tx => tx.symbol.toUpperCase().includes(txFilterTicker.toUpperCase().trim()));
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
    if (!txForm.portfolioId || !txForm.symbol.trim() || txForm.qty <= 0 || txForm.price <= 0) {
      setFormErr(t.validationErrorAllFieldsRequired);
      return;
    }
    
    let updatedTxList = [...db.transactions];
    
    if (txForm.editId) {
      // Edit mode
      updatedTxList = db.transactions.map((t) => {
        if (t.id === txForm.editId) {
          return {
            ...t,
            portfolioId: txForm.portfolioId,
            date: txForm.date || new Date().toISOString(),
            type: txForm.type,
            symbol: txForm.symbol.trim().toUpperCase(),
            qty: Number(txForm.qty),
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
        qty: Number(txForm.qty),
        price: Number(txForm.price),
        commission: Number(txForm.commission || 0),
        currency: txForm.currency,
        commissionCurrency: txForm.commissionCurrency,
        notes: txForm.notes
      };
      updatedTxList.push(newTx);
    }

    const updated = { ...db, transactions: updatedTxList };
    saveDatabaseState(updated);
    
    // Close & Trigger Prices Retrieval
    setTxForm({ open: false, editId: null, portfolioId: '', date: '', type: TransactionType.BUY, symbol: '', qty: 0, price: 0, commission: 0, currency: 'EUR', commissionCurrency: 'EUR', notes: '' });
    triggerPriceSync(updated);
  };

  const deleteTransactionMutation = (id: string) => {
    const freshTx = db.transactions.filter(t => t.id !== id);
    const updated = { ...db, transactions: freshTx };
    saveDatabaseState(updated);
  };

  // ================= RENDER BLOCKS =================

  const renderLegalDisclaimerModal = () => {
    if (!showLegalDisclaimerModal) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#03050a]/90 backdrop-blur-lg animate-fade-in" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="max-w-2xl w-full bg-[#0a0f1d] border border-rose-500/30 rounded-3xl p-6 sm:p-8 shadow-[0_0_50px_rgba(239,68,68,0.15)] relative overflow-hidden flex flex-col max-h-[90vh]">
          {/* Ambient decorative warning glows */}
          <div className="absolute top-0 right-1/4 w-60 h-60 bg-rose-500/5 rounded-full blur-[80px] pointer-events-none"></div>
          <div className="absolute bottom-0 left-1/4 w-60 h-60 bg-amber-500/5 rounded-full blur-[80px] pointer-events-none"></div>

          {/* Header with high prominence law scale / warning icon */}
          <div className="flex items-center gap-3.5 border-b border-slate-800/80 pb-4 mb-5">
            <span className="p-2.5 bg-rose-500/10 rounded-2xl text-rose-400 border border-rose-500/20 shadow-inner">
              <Scale className="w-6 h-6 animate-pulse" />
            </span>
            <div>
              <h2 className="font-extrabold text-sm sm:text-base text-white tracking-tight">{t.disclaimerTitle}</h2>
              <span className="text-[9px] font-mono font-black text-rose-400 uppercase tracking-widest block mt-0.5">jurisdictions: US, UK, IT, INT &bull; active protection</span>
            </div>
          </div>

          {/* Content containing legal terms */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-3 text-xs sm:text-sm text-slate-300 leading-relaxed custom-scrollbar pb-3">
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
          <div className="pt-4 border-t border-slate-800/80 flex justify-end">
            <button
              onClick={() => setShowLegalDisclaimerModal(false)}
              className="px-6 py-3 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 hover:shadow-[0_0_20px_rgba(239,68,68,0.3)] transition-all duration-300 text-slate-950 font-black rounded-xl text-[10px] sm:text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-lg outline-none"
            >
              <span>{t.disclaimerAcknowledge}</span>
            </button>
          </div>
        </div>
      </div>
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
                  src="/src/assets/images/gainbusters_logo_1779817742514.png"
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
                src="/src/assets/images/gainbusters_logo_1779817742514.png"
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
                  src="/src/assets/images/gainbusters_logo_1779817742514.png"
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
                src="/src/assets/images/gainbusters_logo_1779817742514.png"
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

  return (
    <div className="min-h-screen bg-[#04060b] text-slate-100 flex flex-col font-sans select-none relative overflow-hidden" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Dynamic atmospheric subtle lighting */}
      <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[150px] pointer-events-none"></div>
      
      {/* Top Navbar Header */}
      <header className="border-b border-slate-800/80 bg-[#070b16]/70 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src="/src/assets/images/gainbusters_logo_1779817742514.png"
              alt="GainBusters Emblem"
              className="w-10 h-10 rounded-xl object-cover border border-emerald-500/10 shadow"
              referrerPolicy="no-referrer"
            />
            <div>
              <span className="font-extrabold text-white text-lg tracking-tight block">
                {t.appName}
              </span>
              <span className="text-[10px] text-slate-400 font-mono uppercase tracking-widest block font-bold">
                {t.cacciatoreDiRenditaLabel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Force Sync manually button */}
            <button
              onClick={() => triggerPriceSync(db, true)}
              disabled={isSyncingPrices}
              className={`text-xs font-bold font-sans py-1 px-3 rounded-xl border flex items-center gap-1.5 transition-all duration-300 ${
                isSyncingPrices 
                  ? 'bg-slate-900 border-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/15 cursor-pointer shadow-sm hover:border-emerald-500/30'
              }`}
              title={t.refreshPricesTooltip}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingPrices ? 'animate-spin' : ''}`} />
              <span>{t.refreshPricesLabel}</span>
            </button>

            {/* Syncing activity indicator */}
            {isSyncingPrices && (
              <span className="text-xs text-slate-500 font-mono flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-green-500" />
                <span>Syncing...</span>
              </span>
            )}

            <select
              value={selectedCurrency}
              onChange={(e) => setSelectedCurrency(e.target.value)}
              className="bg-slate-950 text-white text-xs py-1.5 px-2.5 rounded border border-slate-800 focus:outline-none focus:border-green-500 font-mono cursor-pointer"
            >
              {Array.from(new Set([db.settings.defaultCurrency || 'EUR', ...activeCurrencies])).map(cur => (
                <option key={cur} value={cur}>{cur} ({getCurrencySymbol(cur)})</option>
              ))}
            </select>

            <button
              onClick={() => {
                setIsAuthenticated(false);
                setPasswordInput('');
              }}
              className="text-slate-400 hover:text-white transition p-2 hover:bg-slate-900 rounded"
              title="Esci"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 py-6 grid lg:grid-cols-12 gap-8 relative z-10">
        
        {/* Navigation Sidebar */}
        <nav className="lg:col-span-3 space-y-2">
          <div className="bg-slate-900/20 border border-slate-800/60 rounded-2xl p-3 space-y-1 backdrop-blur-md">
            <span className="text-[10px] text-slate-500 font-mono tracking-widest uppercase block px-3 mb-2 font-black">
              {t.navigationSidebarTitle}
            </span>
            {[
              { id: 'dashboard', label: t.dashboard, icon: Home },
              { id: 'brokers', label: t.accountsPortfolios, icon: Briefcase },
              { id: 'tools', label: t.tools, icon: Calculator },
              { id: 'mission', label: t.mission, icon: Coins },
              { id: 'inflation', label: t.inflationTitle, icon: TrendingUp },
              { id: 'settings', label: t.settings, icon: SettingsIcon },
            ].map((item) => {
              const IconComponent = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left text-sm font-semibold transition-all duration-300 transform hover:-translate-y-0.5 outline-none ${
                    isActive
                      ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.08)]'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900/50 border border-transparent'
                  }`}
                >
                  <IconComponent className={`w-4 h-4 transition-colors duration-300 ${isActive ? 'text-emerald-400' : 'text-slate-500'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Content Body */}
        <main className="lg:col-span-9 space-y-8">

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
                    {formatCurrency(totalCommissionsPaid, selectedCurrency)}
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
                    {dailyChangeAbsolute >= 0 ? '▲' : '▼'} {dailyGainPercentage.toFixed(2)}% {t.yesterdayLabel}
                  </div>
                </div>
              </div>

              {/* Extra Professional Key-Performance Indicators */}
              <div className="grid md:grid-cols-3 gap-4">
                <div className="bg-slate-900/20 p-4 rounded-2xl border border-slate-800/60 flex items-center justify-between text-xs hover:border-emerald-500/10 transition-all duration-300">
                  <span className="text-slate-400 uppercase tracking-widest font-mono font-black text-[10px]">{t.annualizedReturn}</span>
                  <span className="font-bold font-mono text-emerald-400 text-sm">{mwrrReturn.toFixed(2)}%</span>
                </div>

                <div className="bg-slate-900/20 p-4 rounded-2xl border border-slate-800/60 flex items-center justify-between text-xs hover:border-emerald-500/10 transition-all duration-300">
                  <span className="text-slate-400 uppercase tracking-widest font-mono font-black text-[10px]">{t.volatility}</span>
                  <span className="font-bold font-mono text-amber-500 text-sm">{volatility.toFixed(1)}%</span>
                </div>

                <div className="bg-slate-900/20 p-4 rounded-2xl border border-slate-800/60 flex items-center justify-between text-xs hover:border-emerald-500/10 transition-all duration-300">
                  <span className="text-slate-400 uppercase tracking-widest font-mono font-black text-[10px]">{t.maxDrawdown}</span>
                  <span className="font-bold font-mono text-rose-500 text-sm">-{maxDrawdown.toFixed(1)}%</span>
                </div>
              </div>

              {/* Commissions switch bar */}
              <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800/80 flex flex-wrap justify-between items-center gap-4 backdrop-blur-md">
                <span className="text-xs text-slate-400 font-mono">
                  {t.calculateCommPerformanceDesc}
                </span>
                <button
                  type="button"
                  onClick={() => setIncludeCommissions(!includeCommissions)}
                  className={`py-1.5 px-3.5 text-xs font-bold rounded-xl border transition-all duration-300 cursor-pointer ${
                    includeCommissions
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-850'
                  }`}
                >
                  {includeCommissions ? t.includeCommissions : t.excludeCommissions}
                </button>
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
                inflationIndices={db.settings.inflationIndices}
                selectedInflationId={db.settings.selectedInflationId || 'NIC'}
                onSelectInflationId={(id) => {
                  const newDb = { ...db, settings: { ...db.settings, selectedInflationId: id } };
                  saveDatabaseState(newDb);
                }}
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

              {/* Account management modals form if open */}
              {accountForm.open && (
                <div className="bg-slate-900/40 border border-slate-800/80 p-6 rounded-2xl space-y-4 backdrop-blur-md">
                  <h3 className="font-bold text-sm text-white tracking-wide border-b border-slate-800 pb-2 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                    {accountForm.editId ? t.editAccount : t.addAccount}
                  </h3>
                  <div className="grid md:grid-cols-3 gap-4">
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

                    <div className="space-y-1.5 flex items-end">
                      <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-300 py-2.5 group">
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

                  <div className="flex gap-2 justify-end text-xs pt-2">
                    <button
                      onClick={() => setAccountForm({ open: false, editId: null, name: '', currency: Currency.EUR, include: true })}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl font-bold transition-colors duration-300 cursor-pointer"
                    >
                      {t.cancel}
                    </button>
                    <button
                      onClick={saveAccountMutation}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl font-bold transition-all duration-300 cursor-pointer shadow-lg shadow-emerald-950/20"
                    >
                      {t.save}
                    </button>
                  </div>
                </div>
              )}

              {/* Portfolio management modals form if open */}
              {portfolioForm.open && (
                <div className="bg-slate-900/40 border border-slate-800/80 p-6 rounded-2xl space-y-4 backdrop-blur-md">
                  <h3 className="font-bold text-sm text-white tracking-wide border-b border-slate-800 pb-2 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                    {portfolioForm.editId ? t.editPortfolio : t.addPortfolio}
                  </h3>
                  <div className="grid md:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 block font-semibold">{t.associateToAccountLabel}</label>
                      <select
                        value={portfolioForm.accountId}
                        onChange={(e) => setPortfolioForm({ ...portfolioForm, accountId: e.target.value })}
                        className="bg-slate-100/10 text-white bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/80 px-3 py-2 rounded-xl text-xs w-full transition-all duration-305 font-medium"
                      >
                        {db.accounts.map(a => (
                          <option key={a.id} value={a.id} className="text-slate-950 bg-white">{a.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-xs text-slate-400 block font-semibold">{t.portfolioName}</label>
                      <input
                        type="text"
                        value={portfolioForm.name}
                        onChange={(e) => setPortfolioForm({ ...portfolioForm, name: e.target.value })}
                        className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/80 px-3 py-2 text-white rounded-xl text-xs w-full transition-all duration-305"
                        placeholder={t.allOption === 'Tutti' ? 'es. Portafoglio Pigro / PAC ETF VWCE' : t.allOption === 'Todos' ? 'ej. Cartera Perezosa / PAC ETF VWCE' : t.allOption === 'Tous' ? 'ex. Portefeuille Paresseux / Plan d\'Épargne ETF VWCE' : t.allOption === '全部' ? '例：极简懒人组合 / VWCE 定投计划' : t.allOption === 'الكل' ? 'مثال: المحفظة الكسولة / خطة ادخار صناديق الاستثمار' : 'e.g. Lazy Portfolio / ETF VWCE Savings Plan'}
                      />
                    </div>

                    <div className="space-y-1.5 flex items-end">
                      <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-300 py-2.5 group">
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

                  <div className="flex gap-2 justify-end text-xs pt-2">
                    <button
                      onClick={() => setPortfolioForm({ open: false, editId: null, accountId: '', name: '', include: true })}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl font-bold transition-colors duration-300 cursor-pointer"
                    >
                      {t.cancel}
                    </button>
                    <button
                      onClick={savePortfolioMutation}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl font-bold transition-all duration-300 cursor-pointer shadow-lg shadow-emerald-950/20"
                    >
                      {t.save}
                    </button>
                  </div>
                </div>
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
                              onClick={() => deleteAccountMutation(acc.id)}
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
                                        onClick={() => deletePortfolioMutation(port.id)}
                                        className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-rose-950/20 transition-colors font-bold cursor-pointer"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>

                                  <div className="flex justify-between items-center text-xs text-slate-400 font-mono pt-1">
                                    <span>{t.operationsCountLabel} <strong className="text-slate-200">{pTx.length}</strong></span>
                                    <button
                                      onClick={() => {
                                        const prt = db.portfolios.find(p => p.id === port.id);
                                        const acc = prt ? db.accounts.find(a => a.id === prt.accountId) : null;
                                        const accCurr = acc?.currency || db.settings.defaultCurrency || 'EUR';
                                        setTxForm({
                                          open: true,
                                          portfolioId: port.id,
                                          date: new Date().toISOString().substring(0,16),
                                          type: TransactionType.BUY,
                                          symbol: '',
                                          qty: 0,
                                          price: 0,
                                          commission: 0,
                                          currency: accCurr,
                                          commissionCurrency: accCurr,
                                          notes: ''
                                        });
                                      }}
                                      className="text-emerald-400 hover:text-emerald-300 hover:underline flex items-center gap-0.5 font-bold transition-all duration-300 cursor-pointer"
                                    >
                                      <Plus className="w-3.5 h-3.5" /> {t.addTransaction}
                                    </button>
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
                        {/* Add/Edit Transaction Forms block if open */}
              {txForm.open && (
                <div className="bg-slate-900/40 border border-slate-800/80 p-6 rounded-2xl space-y-4 backdrop-blur-md">
                  <h3 className="font-bold text-sm text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                    <Coins className="w-4 h-4 text-emerald-400" />
                    {txForm.editId ? `${t.allOption === 'Tutti' ? 'Modifica Operazione' : t.allOption === 'Todos' ? 'Modificar Operación' : t.allOption === 'Tous' ? 'Modifier la Transaction' : t.allOption === '全部' ? '修改交易记录' : 'Edit Transaction'} ${txForm.symbol}` : t.registerNewTransactionTitle}
                  </h3>

                  <div className="grid md:grid-cols-4 gap-4 text-xs">
                    {/* Portfolio Selector Dropdown */}
                    <div className="space-y-1.5">
                      <label className="text-slate-400 font-semibold">{t.belongingPortfolioLabel}</label>
                      <select
                        value={txForm.portfolioId}
                        onChange={(e) => {
                          const portId = e.target.value;
                          const selectedP = db.portfolios.find(p => p.id === portId);
                          const selectedAcc = selectedP ? db.accounts.find(a => a.id === selectedP.accountId) : null;
                          const brokerCurr = selectedAcc?.currency || db.settings.defaultCurrency || 'EUR';
                          setTxForm({
                            ...txForm,
                            portfolioId: portId,
                            currency: brokerCurr,
                            commissionCurrency: brokerCurr
                          });
                        }}
                        className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/80 px-3 py-2 text-white rounded-xl w-full font-sans font-bold transition-all duration-300"
                      >
                        <option value="">{t.selectPortfolioOptionPlaceholder}</option>
                        {db.portfolios.map((p) => {
                          const acc = db.accounts.find(a => a.id === p.accountId);
                          return (
                            <option key={p.id} value={p.id}>
                              {p.name} ({acc?.name || t.withoutBrokerOption})
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-slate-400 font-semibold">{t.dateLabel}</label>
                      <input
                        type="datetime-local"
                        value={txForm.date}
                        onChange={(e) => setTxForm({ ...txForm, date: e.target.value })}
                        className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/80 px-3 py-2 text-white rounded-xl w-full font-mono transition-all duration-300"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-slate-400 font-semibold">{t.transactionTypeLabel}</label>
                      <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 border border-slate-800 rounded-xl">
                        <button
                          onClick={() => setTxForm({ ...txForm, type: TransactionType.BUY })}
                          className={`py-1.5 rounded-lg font-bold text-xs transition duration-300 cursor-pointer ${
                            txForm.type === TransactionType.BUY ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {t.buyBtn}
                        </button>
                        <button
                          onClick={() => setTxForm({ ...txForm, type: TransactionType.SELL })}
                          className={`py-1.5 rounded-lg font-bold text-xs transition duration-300 cursor-pointer ${
                            txForm.type === TransactionType.SELL ? 'bg-rose-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {t.sellBtn}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-slate-400 font-semibold">{t.tickerLabel}</label>
                      <TickerInput
                        value={txForm.symbol}
                        onChange={(val) => setTxForm({ ...txForm, symbol: val.toUpperCase() })}
                        placeholder={t.allOption === 'Tutti' ? 'VWCE.MI o VAGF.MI o BTC' : t.allOption === 'Todos' ? 'VWCE.MI o VAGF.MI o BTC' : t.allOption === 'Tous' ? 'VWCE.MI ou VAGF.MI ou BTC' : t.allOption === '全部' ? '例如：VWCE.MI 或 VAGF.MI 或 BTC' : t.allOption === 'الكل' ? 'مثال: VWCE.MI أو VAGF.MI أو BTC' : 'VWCE.MI or VAGF.MI or BTC'}
                        className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/80 px-3 py-2 text-white rounded-xl w-full font-mono uppercase transition-all duration-300"
                        portfolioSymbols={Array.from(new Set(db.transactions.map(t => t.symbol)))}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-slate-400 font-semibold">{t.qtyLabel}</label>
                      <input
                        type="number"
                        step="any"
                        value={txForm.qty || ''}
                        onChange={(e) => setTxForm({ ...txForm, qty: Number(e.target.value) })}
                        className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/80 px-3 py-2 text-white rounded-xl w-full font-mono transition-all duration-300"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2 space-y-1.5">
                        <label className="text-slate-400 font-semibold">{t.priceLabel}</label>
                        <input
                          type="number"
                          step="any"
                          value={txForm.price || ''}
                          onChange={(e) => setTxForm({ ...txForm, price: Number(e.target.value) })}
                          className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/80 px-3 py-2 text-white rounded-xl w-full font-mono transition-all duration-300"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-slate-400 font-semibold">{t.currencyLabel}</label>
                        <select
                          value={txForm.currency}
                          onChange={(e) => setTxForm({ ...txForm, currency: e.target.value })}
                          className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/80 px-2.5 py-2 text-white rounded-xl w-full font-mono transition-all duration-305 text-xs select-none"
                        >
                          {activeCurrencies.map(cur => (
                            <option key={cur} value={cur}>{cur}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2 space-y-1.5">
                        <label className="text-slate-400 font-semibold">{t.commissionLabel}</label>
                        <input
                          type="number"
                          step="any"
                          value={txForm.commission || ''}
                          onChange={(e) => setTxForm({ ...txForm, commission: Number(e.target.value) })}
                          className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/80 px-3 py-2 text-white rounded-xl w-full font-mono transition-all duration-300"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-slate-400 font-semibold">{t.commissionCurrencyLabel}</label>
                        <select
                          value={txForm.commissionCurrency}
                          onChange={(e) => setTxForm({ ...txForm, commissionCurrency: e.target.value })}
                          className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/80 px-2.5 py-2 text-white rounded-xl w-full font-mono transition-all duration-305 text-xs select-none"
                        >
                          {activeCurrencies.map(cur => (
                            <option key={cur} value={cur}>{cur}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-slate-400 font-semibold">{t.notesLabel}</label>
                      <input
                        type="text"
                        value={txForm.notes}
                        onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })}
                        placeholder={t.notesPlaceholder}
                        className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/80 px-3 py-2 text-white rounded-xl w-full transition-all duration-300"
                      />
                    </div>
                  </div>

                  {formErr && (
                    <div className="bg-rose-950/20 text-rose-400 p-3 text-xs rounded-xl border border-rose-500/15 font-mono select-text">
                      {formErr}
                    </div>
                  )}

                  <div className="flex gap-2 justify-end text-xs pt-2">
                    <button
                      onClick={() => setTxForm({ open: false, editId: null, portfolioId: '', date: '', type: TransactionType.BUY, symbol: '', qty: 0, price: 0, commission: 0, notes: '' })}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl font-bold transition-all duration-300 cursor-pointer"
                    >
                      {t.cancel}
                    </button>
                    <button
                      onClick={saveTransactionMutation}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl font-bold font-sans transition-all duration-300 transform hover:-translate-y-0.5 cursor-pointer shadow-lg shadow-emerald-950/20"
                    >
                      {t.saveTransactionBtn}
                    </button>
                  </div>
                </div>
              )}

              {/* Master Register listing all historical Transactions */}
              <div className="bg-slate-900/40 p-6 rounded-2xl border border-slate-800/80 space-y-4 shadow-sm">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-slate-800/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <h3 className="font-extrabold text-sm text-white tracking-wide uppercase font-mono">{t.historicalTransactionsRegistryTitle}</h3>
                    {(txFilterBrokerId || txFilterPortfolioId || txFilterType || txFilterTicker || txFilterDateStart || txFilterDateEnd) && (
                      <button
                        onClick={() => {
                          setTxFilterBrokerId('');
                          setTxFilterPortfolioId('');
                          setTxFilterType('');
                          setTxFilterTicker('');
                          setTxFilterDateStart('');
                          setTxFilterDateEnd('');
                        }}
                        className="text-[10px] text-rose-400 hover:text-rose-300 font-extrabold cursor-pointer transition font-mono uppercase shrink-0 border border-rose-950/40 bg-rose-950/20 px-2 py-0.5 rounded-lg"
                      >
                        {t.resetFiltersBtn}
                      </button>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {t.foundXOfYLabel.replace('{count}', String(getProcessedTransactions().length)).replace('{total}', String(db.transactions.length))}
                  </span>
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

                    <div className="space-y-1">
                      <label className="text-slate-500 font-bold block font-mono uppercase text-[9px] tracking-wider">{t.allOption === 'Tutti' ? 'Tipo' : t.allOption === 'Todos' ? 'Tipo' : t.allOption === 'Tous' ? 'Type' : t.allOption === '全部' ? '交易类型' : t.allOption === 'الكل' ? 'النوع' : 'Type'}</label>
                      <select
                        value={txFilterType}
                        onChange={(e) => setTxFilterType(e.target.value)}
                        className="bg-slate-900 border border-slate-800 text-white rounded px-2 py-1.5 w-full select-none outline-none font-medium text-xs font-sans"
                      >
                        <option value="">{t.allOption}</option>
                        <option value={TransactionType.BUY}>{t.buyOption}</option>
                        <option value={TransactionType.SELL}>{t.sellOption}</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-slate-500 font-bold block font-mono uppercase text-[9px] tracking-wider">{t.tickerLabel}</label>
                      <input
                        type="text"
                        placeholder={t.allOption === 'Tutti' ? 'Es. SWDA' : t.allOption === 'Todos' ? 'Ej. SWDA' : t.allOption === 'Tous' ? 'Ex. SWDA' : t.allOption === '全部' ? '例如：SWDA' : t.allOption === 'الكل' ? 'مثال: SWDA' : 'e.g. SWDA'}
                        value={txFilterTicker}
                        onChange={(e) => setTxFilterTicker(e.target.value)}
                        className="bg-slate-900 border border-slate-800 text-white rounded px-2 py-1.5 w-full uppercase font-mono text-xs"
                      />
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
                  <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950/40">
                    <table className="w-full text-left border-collapse text-xs select-text">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/40 text-slate-400 uppercase tracking-widest font-mono font-black text-[10px]">
                          <th className="py-3 px-4 cursor-pointer select-none hover:text-white transition" onClick={() => handleTxSort('date')}>
                            {t.dateLabel} {txSortField === 'date' ? (txSortAsc ? '▲' : '▼') : ''}
                          </th>
                          <th className="py-3 px-4 cursor-pointer select-none hover:text-white transition" onClick={() => handleTxSort('portfolio')}>
                            {t.allOption === 'Tutti' ? 'Portafoglio' : t.allOption === 'Todos' ? 'Cartera' : t.allOption === 'Tous' ? 'Portefeuille' : t.allOption === '全部' ? '投资组合' : t.allOption === 'الكل' ? 'المحفظة' : 'Portfolio'} {txSortField === 'portfolio' ? (txSortAsc ? '▲' : '▼') : ''}
                          </th>
                          <th className="py-3 px-4 cursor-pointer select-none hover:text-white transition" onClick={() => handleTxSort('type')}>
                            {t.allOption === 'Tutti' ? 'Tipo' : t.allOption === 'Todos' ? 'Tipo' : t.allOption === 'Tous' ? 'Type' : t.allOption === '全部' ? '交易类型' : t.allOption === 'الكل' ? 'النوع' : 'Type'} {txSortField === 'type' ? (txSortAsc ? '▲' : '▼') : ''}
                          </th>
                          <th className="py-3 px-4 cursor-pointer select-none hover:text-white transition" onClick={() => handleTxSort('symbol')}>
                            {t.tickerLabel} {txSortField === 'symbol' ? (txSortAsc ? '▲' : '▼') : ''}
                          </th>
                          <th className="py-3 px-4 cursor-pointer select-none hover:text-white transition" onClick={() => handleTxSort('qty')}>
                            {t.qtyLabel} {txSortField === 'qty' ? (txSortAsc ? '▲' : '▼') : ''}
                          </th>
                          <th className="py-3 px-4 cursor-pointer select-none hover:text-white transition" onClick={() => handleTxSort('price')}>
                            {t.priceLabel} {txSortField === 'price' ? (txSortAsc ? '▲' : '▼') : ''}
                          </th>
                          <th className="py-3 px-4 cursor-pointer select-none hover:text-white transition" onClick={() => handleTxSort('latestPrice')}>
                            {t.allOption === 'Tutti' ? 'Valore Attuale' : t.allOption === 'Todos' ? 'Valor Actual' : t.allOption === 'Tous' ? 'Valeur Actuelle' : t.allOption === '全部' ? '最新价值' : t.allOption === 'الكل' ? 'القيمة الحالية' : 'Current Value'} {txSortField === 'latestPrice' ? (txSortAsc ? '▲' : '▼') : ''}
                          </th>
                          <th className="py-3 px-4 cursor-pointer select-none hover:text-white transition" onClick={() => handleTxSort('commission')}>
                            {t.commissionLabel} {txSortField === 'commission' ? (txSortAsc ? '▲' : '▼') : ''}
                          </th>
                          <th className="py-3 px-4 font-semibold text-slate-400 select-none">{t.notesLabel}</th>
                          <th className="py-3 px-4 text-slate-400 text-center select-none">{t.allOption === 'Tutti' ? 'Azioni' : t.allOption === 'Todos' ? 'Acciones' : t.allOption === 'Tous' ? 'Actions' : t.allOption === '全部' ? '操作' : t.allOption === 'الكل' ? 'الإجراءات' : 'Actions'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {getProcessedTransactions().map((tx) => {
                          const port = db.portfolios.find(p => p.id === tx.portfolioId);
                          const isBuy = tx.type === TransactionType.BUY;
                          const latestPriceObj = getLatestPriceInfo(tx.symbol);
                          return (
                            <tr key={tx.id} className="hover:bg-slate-900/35 transition font-mono group">
                              <td className="py-2.5 px-4 text-slate-400">{formatDateString(tx.date, lang, true)}</td>
                              <td className="py-2.5 px-4 text-white font-bold">{port?.name || 'Incompleto'}</td>
                              <td className="py-2.5 px-4">
                                <span className={`px-2 py-0.5 rounded-lg font-black text-[9px] uppercase tracking-wider ${
                                  isBuy ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                }`}>
                                  {tx.type}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-white font-black uppercase tracking-wider">{tx.symbol}</td>
                              <td className="py-2.5 px-4 text-slate-300 font-bold">{tx.qty.toLocaleString()}</td>
                              <td className="py-2.5 px-4 text-slate-300 font-bold">
                                {formatCurrency(convertValue(tx.price, tx.currency || 'EUR', selectedCurrency, tx.date), selectedCurrency)}
                                {tx.currency && tx.currency !== selectedCurrency && (
                                  <span className="block text-[10px] text-slate-500 font-normal">Orig: {formatCurrency(tx.price, tx.currency)}</span>
                                )}
                              </td>
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
                              <td className="py-2.5 px-4">
                                {tx.commission > 0 ? (
                                  <div className="flex flex-col">
                                    <span className="font-bold text-rose-400">
                                      {formatCurrency(convertValue(tx.commission, tx.commissionCurrency || tx.currency || 'EUR', selectedCurrency, tx.date), selectedCurrency)}
                                    </span>
                                    {(tx.commissionCurrency || tx.currency) && (tx.commissionCurrency || tx.currency) !== selectedCurrency && (
                                      <span className="text-[9px] text-slate-500 font-normal">
                                        Orig: {formatCurrency(tx.commission, tx.commissionCurrency || tx.currency || 'EUR')}
                                      </span>
                                    )}
                                  </div>
                                ) : '-'}
                              </td>
                              <td className="py-2.5 px-4 text-slate-400 select-all italic font-sans max-w-xs truncate">{tx.notes}</td>
                              <td className="py-2.5 px-4 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => setTxForm({
                                      open: true,
                                      editId: tx.id,
                                      portfolioId: tx.portfolioId,
                                      date: tx.date.substring(0, 16),
                                      type: tx.type,
                                      symbol: tx.symbol,
                                      qty: tx.qty,
                                      price: tx.price,
                                      commission: tx.commission,
                                      currency: tx.currency || db.settings.defaultCurrency || 'EUR',
                                      commissionCurrency: tx.commissionCurrency || tx.currency || db.settings.defaultCurrency || 'EUR',
                                      notes: tx.notes || ''
                                    })}
                                    className="text-slate-500 hover:text-emerald-400 p-1 rounded hover:bg-emerald-950/20 transition-colors duration-250 cursor-pointer"
                                    title="Modifica Transazione"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => deleteTransactionMutation(tx.id)}
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
                    </table>
                  </div>
                )}
              </div>
            </div>
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
                </div>
              </div>

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
        <div className="max-w-7xl mx-auto px-4 md:px-6 flex flex-col md:flex-row items-center justify-between gap-4">
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
    </div>
  );
}
