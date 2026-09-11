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

// Increase payload limits to prevent PayloadTooLargeError (HTTP 413) for large price caches and full backups
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Storage mode determination:
// - Explicit env variable STORAGE_MODE ('local' or 'browser') takes priority
// - Vercel serverless environment (process.env.VERCEL is set) defaults to 'browser'
// - Docker / self-hosted Node server defaults to 'local'
const isVercel = !!process.env.VERCEL || !!process.env.VERCEL_ENV;
const STORAGE_MODE: 'local' | 'browser' = (
  process.env.STORAGE_MODE === 'browser' || process.env.STORAGE_MODE === 'local'
    ? (process.env.STORAGE_MODE as 'local' | 'browser')
    : (isVercel ? 'browser' : 'local')
);

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    console.warn('Could not create data directory:', e);
  }
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
  transfers: [],
  otherCosts: [],
  instrumentGroups: [],
  priceCache: {}
};

// In-memory fallback if not in local storage mode
let memoryDB = JSON.parse(JSON.stringify(initialDB));

// Helper to read database safely from disk or memory
function readDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      const data = JSON.parse(content);
      
      // Ensure default inflation indices are configured if empty or missing
      let mergedSettings = { ...initialDB.settings, ...data.settings };
      if (!mergedSettings.inflationIndices || mergedSettings.inflationIndices.length === 0) {
        mergedSettings.inflationIndices = initialDB.settings.inflationIndices;
      }
      // If a password hash is present, passwordSet is guaranteed to be true
      if (mergedSettings.passwordHash && typeof mergedSettings.passwordHash === 'string' && mergedSettings.passwordHash.length > 0) {
        mergedSettings.passwordSet = true;
      }

      const result = {
        ...initialDB,
        ...data,
        settings: mergedSettings,
        accounts: Array.isArray(data.accounts) ? data.accounts : [],
        portfolios: Array.isArray(data.portfolios) ? data.portfolios : [],
        transactions: Array.isArray(data.transactions) ? data.transactions : [],
        transfers: Array.isArray(data.transfers) ? data.transfers : [],
        otherCosts: Array.isArray(data.otherCosts) ? data.otherCosts : [],
        instrumentGroups: Array.isArray(data.instrumentGroups) ? data.instrumentGroups : [],
        priceCache: (data.priceCache && typeof data.priceCache === 'object') ? data.priceCache : {}
      };
      memoryDB = result;
      return result;
    }
  } catch (error) {
    console.error('Error reading index database from disk, using fallback:', error);
  }
  return memoryDB;
}

// Helper to write database safely/atomically to disk
function writeDB(data: any) {
  memoryDB = data;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tempFile = DB_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    try {
      fs.renameSync(tempFile, DB_FILE);
    } catch (renameErr) {
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
      try { fs.unlinkSync(tempFile); } catch (_) {}
    }
  } catch (error) {
    console.error('Error writing database to disk:', error);
  }
}

// Utility for hashing secure password
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Secret for signing session tokens in local server mode
const SESSION_SECRET = process.env.SESSION_SECRET || 'gainbusters_session_secret_key_v1';
function generateSessionToken(passwordHash: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(passwordHash).digest('hex');
}

function verifyAuth(req: express.Request, db: any): boolean {
  if (!db.settings?.passwordSet) return true;
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim() || (req.headers['x-auth-token'] as string);
  if (!token) return false;
  const expected = generateSessionToken(db.settings.passwordHash || '');
  return token === expected;
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
  res.json({
    passwordSet: !!db.settings.passwordSet,
    storageMode: STORAGE_MODE
  });
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
  const hash = hashPassword(password);
  db.settings.passwordHash = hash;
  db.settings.passwordSet = true;
  writeDB(db);
  const token = generateSessionToken(hash);
  res.json({ success: true, token });
});

app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  const db = readDB();
  if (!db.settings.passwordSet) {
    return res.status(400).json({ error: 'System not set up yet.' });
  }
  const hash = hashPassword(password || '');
  if (hash === db.settings.passwordHash) {
    const token = generateSessionToken(db.settings.passwordHash);
    res.json({ success: true, token });
  } else {
    res.status(401).json({ error: 'Incorrect password.' });
  }
});

// ================= PERSISTENT DB OPERATIONS =================

app.get('/api/db', (req, res) => {
  const db = readDB();
  if (!verifyAuth(req, db)) {
    return res.status(401).json({ error: 'Unauthorized: invalid or missing authentication token.' });
  }
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

app.post('/api/db', (req, res) => {
  const db = readDB();
  if (!verifyAuth(req, db)) {
    return res.status(401).json({ error: 'Unauthorized: invalid or missing authentication token.' });
  }
  const newDb = req.body;
  if (!newDb || typeof newDb !== 'object') {
    return res.status(400).json({ error: 'Invalid database payload.' });
  }
  const currentDb = db;
  const passwordHash = currentDb.settings?.passwordHash;
  const mergedSettings = {
    ...currentDb.settings,
    ...(newDb.settings || {}),
    passwordHash: passwordHash || currentDb.settings?.passwordHash
  };
  if (currentDb.settings?.passwordSet || (mergedSettings.passwordHash && typeof mergedSettings.passwordHash === 'string' && mergedSettings.passwordHash.length > 0)) {
    mergedSettings.passwordSet = true;
  }
  const fullDb = {
    settings: mergedSettings,
    accounts: Array.isArray(newDb.accounts) ? newDb.accounts : (currentDb.accounts || []),
    portfolios: Array.isArray(newDb.portfolios) ? newDb.portfolios : (currentDb.portfolios || []),
    transactions: Array.isArray(newDb.transactions) ? newDb.transactions : (currentDb.transactions || []),
    transfers: Array.isArray(newDb.transfers) ? newDb.transfers : (currentDb.transfers || []),
    otherCosts: Array.isArray(newDb.otherCosts) ? newDb.otherCosts : (currentDb.otherCosts || []),
    instrumentGroups: Array.isArray(newDb.instrumentGroups) ? newDb.instrumentGroups : (currentDb.instrumentGroups || []),
    priceCache: (newDb.priceCache && typeof newDb.priceCache === 'object') ? newDb.priceCache : (currentDb.priceCache || {})
  };
  writeDB(fullDb);
  res.json({ success: true });
});

app.post('/api/db/settings', (req, res) => {
  const { theme, defaultCurrency, selectedInflationId, inflationIndices, activeCurrencies, targetWeights, aggregateInstrumentsView } = req.body;
  const db = readDB();
  if (theme !== undefined) db.settings.theme = theme;
  if (defaultCurrency !== undefined) db.settings.defaultCurrency = defaultCurrency;
  if (selectedInflationId !== undefined) db.settings.selectedInflationId = selectedInflationId;
  if (inflationIndices !== undefined) db.settings.inflationIndices = inflationIndices;
  if (activeCurrencies !== undefined) db.settings.activeCurrencies = activeCurrencies;
  if (targetWeights !== undefined) db.settings.targetWeights = targetWeights;
  if (aggregateInstrumentsView !== undefined) db.settings.aggregateInstrumentsView = aggregateInstrumentsView;
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

app.post('/api/db/transfers', (req, res) => {
  const { transfers } = req.body;
  if (!Array.isArray(transfers)) {
    return res.status(400).json({ error: 'Invalid transfers list.' });
  }
  const db = readDB();
  db.transfers = transfers;
  writeDB(db);
  res.json({ success: true });
});

app.post('/api/db/otherCosts', (req, res) => {
  const { otherCosts } = req.body;
  if (!Array.isArray(otherCosts)) {
    return res.status(400).json({ error: 'Invalid otherCosts list.' });
  }
  const db = readDB();
  db.otherCosts = otherCosts;
  writeDB(db);
  res.json({ success: true });
});

app.post('/api/db/instrumentGroups', (req, res) => {
  const { instrumentGroups } = req.body;
  if (!Array.isArray(instrumentGroups)) {
    return res.status(400).json({ error: 'Invalid instrumentGroups list.' });
  }
  const db = readDB();
  db.instrumentGroups = instrumentGroups;
  writeDB(db);
  res.json({ success: true });
});

// ================= STOCK & CRYPTO PRICE SYNC & TRACKING ENGINE =================

// Proxy Yahoo Finance requests from the client to bypass CORS
app.get('/api/yahoo/:symbol', (req, res) => {
  const symbol = req.params.symbol;
  const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${queryString}`;

  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json'
    }
  };

  https.get(url, options, (yahooRes) => {
    res.status(yahooRes.statusCode || 200);
    // Copy relevant headers
    if (yahooRes.headers['content-type']) {
      res.setHeader('Content-Type', yahooRes.headers['content-type']);
    }
    yahooRes.pipe(res);
  }).on('error', (err) => {
    res.status(500).json({ error: err.message });
  });
});

// Proxy Binance crypto price requests to bypass CORS
app.get('/api/crypto/:pair', (req, res) => {
  const pair = req.params.pair;
  const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
  const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(pair)}&${queryString}`;

  const options = {
    headers: {
      'User-Agent': 'GainBusters/1.0',
      'Accept': 'application/json'
    }
  };

  https.get(url, options, (binanceRes) => {
    res.status(binanceRes.statusCode || 200);
    if (binanceRes.headers['content-type']) {
      res.setHeader('Content-Type', binanceRes.headers['content-type']);
    }
    binanceRes.pipe(res);
  }).on('error', (err) => {
    res.status(500).json({ error: err.message });
  });
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

if (!process.env.VERCEL) {
  startServer();
}

export default app;
