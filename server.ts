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
