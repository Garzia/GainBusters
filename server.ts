/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import crypto from 'crypto';
import https from 'https';

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

app.use(express.json());

// Determine storage mode option
const STORAGE_MODE = process.env.STORAGE_MODE || 'browser';

// Ensure data directory exists only if STORAGE_MODE is local
if (STORAGE_MODE === 'local' && !fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial DB state template
const initialDB = {
  settings: {
    theme: 'system',
    defaultCurrency: 'EUR',
    passwordHash: '',
    passwordSet: false,
    selectedInflationId: 'NIC',
    inflationIndices: [
      {
        id: 'NIC',
        name: 'NIC',
        description: 'Indice Nazionale dei prezzi al consumo per l\'intera collettività',
        link: 'https://www.istat.it/it/archivio/prezzi-al-consumo',
        values: [
          { year: 2020, rate: 0.002 },
          { year: 2021, rate: 0.019 },
          { year: 2022, rate: 0.081 },
          { year: 2023, rate: 0.057 },
          { year: 2024, rate: 0.008 },
          { year: 2025, rate: 0.012 },
          { year: 2026, rate: 0.015 }
        ]
      },
      {
        id: 'FOI',
        name: 'FOI',
        description: 'Indice dei prezzi al consumo per le Famiglie di Operai e Impiegati',
        link: 'https://www.istat.it/it/archivio/prezzi-al-consumo',
        values: [
          { year: 2020, rate: 0.001 },
          { year: 2021, rate: 0.019 },
          { year: 2022, rate: 0.081 },
          { year: 2023, rate: 0.054 },
          { year: 2024, rate: 0.008 },
          { year: 2025, rate: 0.011 },
          { year: 2026, rate: 0.014 }
        ]
      },
      {
        id: 'IPCA',
        name: 'IPCA',
        description: 'Indice dei prezzi al consumo Armonizzato per i paesi dell\'Unione Europea',
        link: 'https://www.istat.it/it/archivio/prezzi-al-consumo',
        values: [
          { year: 2020, rate: 0.002 },
          { year: 2021, rate: 0.019 },
          { year: 2022, rate: 0.087 },
          { year: 2023, rate: 0.059 },
          { year: 2024, rate: 0.009 },
          { year: 2025, rate: 0.013 },
          { year: 2026, rate: 0.016 }
        ]
      }
    ]
  },
  accounts: [],
  portfolios: [],
  transactions: [],
  priceCache: {}
};

// In-memory fallback if not in local storage mode
let memoryDB = JSON.parse(JSON.stringify(initialDB));

// Help helper to read database safely
function readDB() {
  if (STORAGE_MODE !== 'local') {
    return memoryDB;
  }
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(initialDB, null, 2), 'utf-8');
      return initialDB;
    }
    const content = fs.readFileSync(DB_FILE, 'utf-8');
    const data = JSON.parse(content);
    
    // Ensure default inflation indices are configured if empty or missing
    let mergedSettings = { ...initialDB.settings, ...data.settings };
    if (!mergedSettings.inflationIndices || mergedSettings.inflationIndices.length === 0) {
      mergedSettings.inflationIndices = initialDB.settings.inflationIndices;
    }

    return { ...initialDB, ...data, settings: mergedSettings };
  } catch (error) {
    console.error('Error reading index database:', error);
    return initialDB;
  }
}

// Helper to write database safely/atomically
function writeDB(data: any) {
  if (STORAGE_MODE !== 'local') {
    memoryDB = data;
    return;
  }
  try {
    const tempFile = DB_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
  } catch (error) {
    console.error('Error writing index database:', error);
  }
}

// Utility for hashing secure password
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// ================= APP CONFIG ENDPOINTS =================

app.get('/api/config', (req, res) => {
  res.json({
    storageMode: STORAGE_MODE
  });
});

// ================= AUTH ENDPOINTS =================

app.post('/api/auth/status', (req, res) => {
  const db = readDB();
  res.json({ passwordSet: db.settings.passwordSet });
});

app.post('/api/auth/setup', (req, res) => {
  const { password } = req.body;
  if (!password || password.trim().length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters long.' });
  }
  const db = readDB();
  if (db.settings.passwordSet) {
    return res.status(400).json({ error: 'Password is already set.' });
  }
  db.settings.passwordHash = hashPassword(password);
  db.settings.passwordSet = true;
  writeDB(db);
  res.json({ success: true });
});

app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  const db = readDB();
  if (!db.settings.passwordSet) {
    return res.status(400).json({ error: 'System not set up yet.' });
  }
  const hash = hashPassword(password || '');
  if (hash === db.settings.passwordHash) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Incorrect password.' });
  }
});

// ================= PERSISTENT DB OPERATIONS =================

app.get('/api/db', (req, res) => {
  const db = readDB();
  // Strip the password hash before sending to client for security
  const cleanDb = {
    ...db,
    settings: {
      ...db.settings,
      passwordHash: undefined
    }
  };
  res.json(cleanDb);
});

app.post('/api/db/settings', (req, res) => {
  const { theme, defaultCurrency, selectedInflationId, inflationIndices, activeCurrencies } = req.body;
  const db = readDB();
  if (theme) db.settings.theme = theme;
  if (defaultCurrency) db.settings.defaultCurrency = defaultCurrency;
  if (selectedInflationId) db.settings.selectedInflationId = selectedInflationId;
  if (inflationIndices) db.settings.inflationIndices = inflationIndices;
  if (activeCurrencies) db.settings.activeCurrencies = activeCurrencies;
  writeDB(db);
  res.json({ success: true });
});

app.post('/api/db/accounts', (req, res) => {
  const { accounts } = req.body;
  if (!Array.isArray(accounts)) {
    return res.status(400).json({ error: 'Invalid accounts list.' });
  }
  const db = readDB();
  db.accounts = accounts;
  writeDB(db);
  res.json({ success: true });
});

app.post('/api/db/portfolios', (req, res) => {
  const { portfolios } = req.body;
  if (!Array.isArray(portfolios)) {
    return res.status(400).json({ error: 'Invalid portfolios list.' });
  }
  const db = readDB();
  db.portfolios = portfolios;
  writeDB(db);
  res.json({ success: true });
});

app.post('/api/db/transactions', (req, res) => {
  const { transactions } = req.body;
  if (!Array.isArray(transactions)) {
    return res.status(400).json({ error: 'Invalid transactions list.' });
  }
  const db = readDB();
  db.transactions = transactions;
  writeDB(db);
  res.json({ success: true });
});

// ================= STOCK PRICE SYNC & TRACKING ENGINE =================

// Helper to calculate date range array
function getDatesBetween(startDateStr: string, endDateStr: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const current = new Date(start);

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// Generate continuous price charts matching user transactions & historical randomness
function generateRandomWalk(
  startPrice: number,
  length: number,
  symbol: string
): number[] {
  // Determine asset characteristics based on symbols
  const isBond = symbol.toUpperCase().includes('VAGF') || symbol.toUpperCase().includes('AGG') || symbol.toUpperCase().includes('BOND');
  const isBitcoin = symbol.toUpperCase().includes('BTC') || symbol.toUpperCase().includes('ETH') || symbol.toUpperCase().includes('CRYPTO');
  const isCurrency = symbol.toUpperCase().includes('=X');
  
  // Annual stats
  const drift = isBond ? 0.025 : isBitcoin ? 0.45 : isCurrency ? 0.0 : 0.082; // average annual returns
  const vol = isBond ? 0.04 : isBitcoin ? 0.65 : isCurrency ? 0.02 : 0.155; // volatility
  
  const dt = 1 / 365;
  const prices: number[] = [startPrice];
  
  for (let i = 1; i < length; i++) {
    const prev = prices[i - 1];
    // Geometric Brownian Motion formula
    const rand = Math.sin(i * 0.4) * 0.5 + (Math.random() - 0.5) * 1.5; // deterministic + random mix for elegant wavy curves
    const change = prev * (drift * dt + vol * Math.sqrt(dt) * rand);
    let nextPrice = prev + change;
    if (nextPrice <= 0.01) nextPrice = 0.01;
    prices.push(Number(nextPrice.toFixed(4)));
  }
  return prices;
}

function fetchYahooFinancePrices(symbol: string, startDateStr: string, endDateStr: string): Promise<{ [date: string]: number }> {
  return new Promise((resolve, reject) => {
    let adjustedSymbol = symbol.trim().toUpperCase();
    if (adjustedSymbol === 'BTC') adjustedSymbol = 'BTC-EUR';
    if (adjustedSymbol === 'ETH') adjustedSymbol = 'ETH-EUR';
    if (adjustedSymbol === 'BTCUSD') adjustedSymbol = 'BTC-USD';
    if (adjustedSymbol === 'BTCEUR') adjustedSymbol = 'BTC-EUR';

    const startSec = Math.floor(new Date(startDateStr).getTime() / 1000);
    // Include full current day
    const endSec = Math.floor(new Date(endDateStr).getTime() / 1000) + 86400;

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(adjustedSymbol)}?period1=${startSec}&period2=${endSec}&interval=1d`;
    console.log(`[Yahoo Finance Request] Fetching historical close and timestamp data for ${symbol} as ${adjustedSymbol}: ${url}`);

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };

    https.get(url, options, (res) => {
      let dataStr = '';
      res.on('data', (chunk) => {
        dataStr += chunk;
      });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Yahoo Finance server returned status ${res.statusCode}`));
          return;
        }
        try {
          const parsed = JSON.parse(dataStr);
          const chart = parsed?.chart;
          const result = chart?.result?.[0];
          if (!result) {
            reject(new Error(`Invalid Yahoo Finance chart response structure`));
            return;
          }

          const timestamps: number[] = result.timestamp || [];
          const closeQuotes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];
          const priceMap: { [date: string]: number } = {};

          let lastValidPrice = 0;
          for (let i = 0; i < timestamps.length; i++) {
            const ts = timestamps[i];
            const price = closeQuotes[i];
            const dateStr = new Date(ts * 1000).toISOString().split('T')[0];

            if (price !== null && !isNaN(price) && price > 0) {
              priceMap[dateStr] = Number(price.toFixed(4));
              lastValidPrice = price;
            } else if (lastValidPrice > 0) {
              priceMap[dateStr] = Number(lastValidPrice.toFixed(4));
            }
          }
          resolve(priceMap);
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

app.post('/api/prices/sync', async (req, res) => {
  const { symbols, force } = req.body;
  if (!Array.isArray(symbols) || symbols.length === 0) {
    return res.json({ success: true, message: 'No symbols to sync.' });
  }

  const db = readDB();
  const todayStr = new Date().toISOString().split('T')[0];
  let updatedAnyCache = false;

  for (const symbol of symbols) {
    // Find the oldest transaction of this symbol to start tracking from
    const symbolTransactions = db.transactions.filter(
      (t: any) => t.symbol.toUpperCase() === symbol.toUpperCase()
    );

    let oldestDateStr = '';
    let firstTxPrice = 100;

    const isCurrencyPair = symbol.toUpperCase().includes('=X');

    if (symbolTransactions.length > 0) {
      // Sort to find the oldest
      symbolTransactions.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      oldestDateStr = symbolTransactions[0].date.split('T')[0];
      firstTxPrice = symbolTransactions[0].price;
    } else {
      // Benchmark index or other general symbol
      const allTx = db.transactions;
      if (allTx && allTx.length > 0) {
        const sortedAll = [...allTx].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
        oldestDateStr = sortedAll[0].date.split('T')[0];
      } else {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        oldestDateStr = oneYearAgo.toISOString().split('T')[0];
      }
      
      if (isCurrencyPair) {
        const pair = symbol.toUpperCase().replace('=X', '');
        const fallbacks: { [pair: string]: number } = {
          'USDEUR': 0.92, 'EURUSD': 1.09,
          'GBPEUR': 1.18, 'EURGBP': 0.85,
          'CHFEUR': 1.04, 'EURCHF': 0.96,
          'JPYEUR': 0.0059, 'EURJPY': 169.5,
          'CADEUR': 0.67, 'EURCAD': 1.49,
          'AUDEUR': 0.61, 'EURAUD': 1.64
        };
        firstTxPrice = fallbacks[pair] || 1.0;
      } else {
        firstTxPrice = 100;
      }
    }

    const allDates = getDatesBetween(oldestDateStr, todayStr);
    
    if (!db.priceCache[symbol] || force) {
      db.priceCache[symbol] = {};
    }

    const missingDates = allDates.filter(d => !db.priceCache[symbol][d]);

    if (missingDates.length > 0) {
      console.log(`Syncing ${missingDates.length} missing dates for ${symbol} starting from ${oldestDateStr}`);
      
      let fetchedPrices: { [date: string]: number } = {};
      let fetchSuccessful = false;

      // 1. Try Yahoo Finance
      try {
        fetchedPrices = await fetchYahooFinancePrices(symbol, oldestDateStr, todayStr);
        fetchSuccessful = Object.keys(fetchedPrices).length > 2;
        console.log(`Successfully fetched ${Object.keys(fetchedPrices).length} prices from Yahoo Finance for ${symbol}`);
      } catch (err) {
        console.error(`Yahoo Finance fetch failed for ${symbol}. Using random walk simulation generator fallback.`, err);
      }

      // Populate database for all dates
      let currentPriceValue = firstTxPrice;
      const walk = generateRandomWalk(currentPriceValue, allDates.length, symbol);

      allDates.forEach((date, index) => {
        // If we fetched it from Yahoo / Gemini, use that
        if (fetchSuccessful && fetchedPrices[date] !== undefined) {
          db.priceCache[symbol][date] = fetchedPrices[date];
          currentPriceValue = fetchedPrices[date];
        } else if (fetchSuccessful) {
          // Carry forward close price on holidays / weekends
          db.priceCache[symbol][date] = currentPriceValue;
        } else if (db.priceCache[symbol][date] !== undefined) {
          // Pre-existing value
          currentPriceValue = db.priceCache[symbol][date];
        } else {
          // Fallback to our aligned random walk
          // We align the random walk with any known transactions unit prices!
          const exactMatchTx = symbolTransactions.find(t => t.date.split('T')[0] === date);
          if (exactMatchTx) {
            db.priceCache[symbol][date] = exactMatchTx.price;
            currentPriceValue = exactMatchTx.price;
          } else {
            // Take the random walk offset
            const randomIncrement = walk[index] - walk[Math.max(0, index - 1)];
            currentPriceValue = Math.max(0.01, Number((currentPriceValue + randomIncrement).toFixed(4)));
            db.priceCache[symbol][date] = currentPriceValue;
          }
        }
      });
      
      updatedAnyCache = true;
    }
  }

  if (updatedAnyCache) {
    writeDB(db);
  }

  res.json({ success: true, priceCache: readDB().priceCache });
});

// Serve Vite dynamic assets or index page based on environment
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GainBusters Express backend listening on http://localhost:${PORT}`);
  });
}

startServer();
