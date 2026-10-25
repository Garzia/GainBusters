import { DBState } from '../types';

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

const CRYPTO_LIST = new Set([
  'BTC', 'ETH', 'SOL', 'ADA', 'DOT', 'XRP', 'LTC', 'LINK', 'DOGE', 'SHIB', 
  'BNB', 'AVAX', 'MATIC', 'POL', 'UNI', 'ICP', 'XLM', 'ATOM', 'FIL', 'LDO', 'OP', 
  'ARB', 'GRT', 'AAVE', 'MKR', 'RNDR', 'RENDER', 'EGLD', 'THETA', 'FTM', 'ALGO', 'QNT', 
  'HBAR', 'SAND', 'MANA', 'FLOW', 'XTZ', 'AXS', 'EOS', 'NEO', 'IOTA', 'VET',
  'USDT', 'USDC', 'SUI', 'PEPE', 'NEAR', 'FET', 'TAO', 'KAS', 'INJ', 'STX', 
  'TIA', 'APT', 'SEI', 'RUNE', 'PENDLE', 'WIF', 'BONK', 'FLOKI'
]);

export function isCryptoTicker(symbol: string): boolean {
  const s = symbol.toUpperCase().trim().replace('=X', '').replace(/[\/-]/g, '');
  if (CRYPTO_LIST.has(s)) return true;
  for (const c of CRYPTO_LIST) {
    if (s.startsWith(c) || s.endsWith(c)) return true;
  }
  return false;
}

// Map any symbol/pair to the best Yahoo Finance ticker
function resolveYahooSymbol(symbol: string): { yahooSymbol: string; isInverted: boolean; isCrypto: boolean } {
  let sym = symbol.trim().toUpperCase();

  // If it's a forex / crypto pair with =X
  if (sym.includes('=X')) {
    const pair = sym.replace('=X', '');
    // Check if ends with EUR
    if (pair.endsWith('EUR')) {
      const base = pair.substring(0, pair.length - 3);
      if (CRYPTO_LIST.has(base)) {
        return { yahooSymbol: `${base}-EUR`, isInverted: false, isCrypto: true };
      }
    }
    // Check if ends with USD
    if (pair.endsWith('USD')) {
      const base = pair.substring(0, pair.length - 3);
      if (CRYPTO_LIST.has(base)) {
        return { yahooSymbol: `${base}-USD`, isInverted: false, isCrypto: true };
      }
    }
    // Check if starts with EUR
    if (pair.startsWith('EUR')) {
      const quote = pair.substring(3);
      if (CRYPTO_LIST.has(quote)) {
        return { yahooSymbol: `${quote}-EUR`, isInverted: true, isCrypto: true };
      }
    }
    // Check if starts with USD
    if (pair.startsWith('USD')) {
      const quote = pair.substring(3);
      if (CRYPTO_LIST.has(quote)) {
        return { yahooSymbol: `${quote}-USD`, isInverted: true, isCrypto: true };
      }
    }
    // Standard fiat pair: e.g. USDEUR=X
    return { yahooSymbol: sym, isInverted: false, isCrypto: false };
  }

  // Handle direct crypto ticker like BTC, ETH
  if (CRYPTO_LIST.has(sym)) {
    return { yahooSymbol: `${sym}-EUR`, isInverted: false, isCrypto: true };
  }

  // Handle BTCUSD, BTCEUR, BTC/USD, BTC/EUR, BTC-USD, BTC-EUR
  const cleaned = sym.replace(/[\/-]/g, '');
  if (cleaned.endsWith('EUR') && CRYPTO_LIST.has(cleaned.substring(0, cleaned.length - 3))) {
    return { yahooSymbol: `${cleaned.substring(0, cleaned.length - 3)}-EUR`, isInverted: false, isCrypto: true };
  }
  if (cleaned.endsWith('USD') && CRYPTO_LIST.has(cleaned.substring(0, cleaned.length - 3))) {
    return { yahooSymbol: `${cleaned.substring(0, cleaned.length - 3)}-USD`, isInverted: false, isCrypto: true };
  }

  return { yahooSymbol: sym, isInverted: false, isCrypto: isCryptoTicker(sym) };
}

// Fetch historical prices from Yahoo Finance
async function fetchYahooFinancePrices(symbol: string, startDateStr: string, endDateStr: string): Promise<{ [date: string]: number }> {
  const { yahooSymbol, isInverted, isCrypto } = resolveYahooSymbol(symbol);

  const startSec = Math.floor(new Date(startDateStr).getTime() / 1000);
  const endSec = Math.floor(new Date(endDateStr).getTime() / 1000) + 86400;

  // List of symbol variants to try (e.g. if European ETF without exchange suffix)
  const candidateSymbols = [yahooSymbol];
  const isBaseAlpha = /^[A-Z0-9]+$/.test(symbol.trim().toUpperCase());
  if (isBaseAlpha && !symbol.includes('.') && !symbol.includes('=X') && !isCrypto) {
    candidateSymbols.push(`${symbol.trim().toUpperCase()}.MI`);
    candidateSymbols.push(`${symbol.trim().toUpperCase()}.DE`);
  }

  let lastError: any = null;

  for (const candidate of candidateSymbols) {
    try {
      const proxyUrl = `/api/yahoo/${encodeURIComponent(candidate)}?period1=${startSec}&period2=${endSec}&interval=1d`;
      console.log(`[Yahoo Finance Request] Fetching data for ${symbol} as ${candidate}: ${proxyUrl}`);

      const res = await fetch(proxyUrl, { method: 'GET', headers: { 'Accept': 'application/json' } });
      if (!res.ok) {
        throw new Error(`Yahoo status ${res.status} for ${candidate}`);
      }
      const parsedData = await res.json();
      const chart = parsedData?.chart;
      const result = chart?.result?.[0];
      if (!result) {
        throw new Error(`Invalid Yahoo Finance chart response structure for ${candidate}`);
      }

      const timestamps: number[] = result.timestamp || [];
      const closeQuotes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];
      const priceMap: { [date: string]: number } = {};

      const meta = result.meta || {};
      const regularMarketPrice = meta.regularMarketPrice;
      const regularMarketTime = meta.regularMarketTime;

      let lastValidPrice = 0;
      for (let i = 0; i < timestamps.length; i++) {
        const ts = timestamps[i];
        let price = closeQuotes[i];
        const dateStr = new Date(ts * 1000).toISOString().split('T')[0];

        // If the last candle has a null close (common for European ETFs after close or on weekends),
        // fallback to meta.regularMarketPrice if valid
        if ((price === null || isNaN(price) || price <= 0) && i === timestamps.length - 1 && regularMarketPrice > 0) {
          price = regularMarketPrice;
        }

        if (price !== null && !isNaN(price) && price > 0) {
          if (isInverted && price > 0) price = 1 / price;
          priceMap[dateStr] = Number(price.toFixed(price < 1 ? 8 : 4));
          lastValidPrice = price;
        } else if (lastValidPrice > 0) {
          priceMap[dateStr] = Number(lastValidPrice.toFixed(lastValidPrice < 1 ? 8 : 4));
        }
      }

      // Ensure the latest regular market price is also attached to its session date
      if (regularMarketPrice > 0 && regularMarketTime) {
        const regDateStr = new Date(regularMarketTime * 1000).toISOString().split('T')[0];
        let regPrice = regularMarketPrice;
        if (isInverted && regPrice > 0) regPrice = 1 / regPrice;
        priceMap[regDateStr] = Number(regPrice.toFixed(regPrice < 1 ? 8 : 4));
      }

      if (Object.keys(priceMap).length > 0) {
        return priceMap;
      }
    } catch (err) {
      lastError = err;
      // Continue to next candidate symbol if available
    }
  }

  throw lastError || new Error(`No prices found for ${symbol}`);
}

// Fallback fetch from Binance for crypto
async function fetchBinanceCryptoPrices(symbol: string, startDateStr: string, endDateStr: string): Promise<{ [date: string]: number }> {
  const raw = symbol.trim().toUpperCase().replace('=X', '').replace(/[\/-]/g, '');
  let binancePair = raw;
  if (CRYPTO_LIST.has(raw)) {
    binancePair = `${raw}EUR`;
  }

  const startMs = new Date(startDateStr).getTime();
  const endMs = new Date(endDateStr).getTime() + 86400000;

  // Try via internal backend proxy first, then direct
  const fetchKlines = async (pair: string) => {
    try {
      const proxyUrl = `/api/crypto/${encodeURIComponent(pair)}?interval=1d&startTime=${startMs}&endTime=${endMs}&limit=1000`;
      const res = await fetch(proxyUrl);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) return data;
      }
    } catch (_) {}

    try {
      const directUrl = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(pair)}&interval=1d&startTime=${startMs}&endTime=${endMs}&limit=1000`;
      const res = await fetch(directUrl);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) return data;
      }
    } catch (_) {}

    return null;
  };

  let data = await fetchKlines(binancePair);
  if (data) {
    return parseBinanceData(data, 1.0);
  }

  // If EUR pair fails, try USDT pair
  if (binancePair.endsWith('EUR')) {
    const usdtPair = binancePair.replace('EUR', 'USDT');
    const usdtData = await fetchKlines(usdtPair);
    if (usdtData) {
      return parseBinanceData(usdtData, 0.92); // approximate USDT->EUR factor
    }
  } else if (!binancePair.endsWith('USDT') && !binancePair.endsWith('EUR')) {
    const usdtData = await fetchKlines(`${binancePair}USDT`);
    if (usdtData) {
      return parseBinanceData(usdtData, 0.92);
    }
  }

  throw new Error(`Binance fetch failed for ${symbol}`);
}

function parseBinanceData(data: any[], multiplier: number = 1.0): { [date: string]: number } {
  const priceMap: { [date: string]: number } = {};
  if (!Array.isArray(data)) return priceMap;
  for (const item of data) {
    const ts = item[0];
    const close = parseFloat(item[4]) * multiplier;
    const dateStr = new Date(ts).toISOString().split('T')[0];
    if (!isNaN(close) && close > 0) {
      priceMap[dateStr] = Number(close.toFixed(close < 1 ? 8 : 4));
    }
  }
  return priceMap;
}

async function fetchWithFallback(proxyPath: string, directUrl: string): Promise<Response> {
  if (typeof window !== 'undefined') {
    try {
      const res = await fetch(proxyPath, { headers: { 'Accept': 'application/json' } });
      if (res.ok) return res;
    } catch (_) {}
  }
  return await fetch(directUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json'
    }
  });
}

export interface LangSchwarzSearchResult {
  instrumentId: number;
  isin: string;
  displayname?: string;
  wkn?: string;
  categoryName?: string;
}

export async function searchLangSchwarzInstrument(isin: string): Promise<LangSchwarzSearchResult> {
  const cleanIsin = (isin || '').trim().toUpperCase();
  if (!cleanIsin) {
    throw new Error('ISIN non specificato.');
  }

  // Format validation for 12 alphanumeric characters
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(cleanIsin)) {
    throw new Error(`Formato ISIN non valido: "${cleanIsin}". Deve essere composto da 12 caratteri (es. IE00BK5BQT80).`);
  }

  const proxyUrl = `/api/ls/search?q=${encodeURIComponent(cleanIsin)}&localeId=1`;
  const directUrl = `https://www.ls-tc.de/_rpc/json/.lstc/instrument/search/main?q=${encodeURIComponent(cleanIsin)}&localeId=1`;

  let res: Response;
  try {
    res = await fetchWithFallback(proxyUrl, directUrl);
  } catch (err: any) {
    throw new Error(`Errore di rete durante la ricerca ISIN su Lang & Schwarz: ${err.message}`);
  }

  if (!res.ok) {
    throw new Error(`Lang & Schwarz ha risposto con codice HTTP ${res.status}`);
  }

  let data: any;
  try {
    data = await res.json();
  } catch (err: any) {
    throw new Error('Risposta JSON non valida ricevuta da Lang & Schwarz.');
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`Nessuno strumento trovato su Lang & Schwarz per l'ISIN ${cleanIsin}.`);
  }

  // Filter items matching the exact ISIN
  const exactMatches = data.filter((item: any) => (item.isin || '').trim().toUpperCase() === cleanIsin);

  if (exactMatches.length === 0) {
    throw new Error(`Nessun risultato corrisponde esattamente all'ISIN ${cleanIsin} tra gli strumenti restituiti da Lang & Schwarz.`);
  }

  // If there are multiple matches, prefer the one with a defined instrumentId or id
  let target = exactMatches[0];
  if (exactMatches.length > 1) {
    const withInstrumentId = exactMatches.filter((item: any) => (item.instrumentId || item.id));
    if (withInstrumentId.length > 0) {
      target = withInstrumentId[0];
    }
  }

  const rawInstrumentId = target.instrumentId || target.id;
  const instrumentId = Number(rawInstrumentId);
  if (!instrumentId || isNaN(instrumentId)) {
    throw new Error(`Impossibile estrarre un instrumentId valido per l'ISIN ${cleanIsin}.`);
  }

  return {
    instrumentId,
    isin: cleanIsin,
    displayname: target.displayname || target.name || target.title,
    wkn: target.wkn,
    categoryName: target.categoryName || target.categorySymbol
  };
}

export async function fetchLangSchwarzPrices(
  symbol: string,
  isin: string,
  instrumentId?: number,
  startDateStr?: string,
  endDateStr?: string
): Promise<{ prices: { [date: string]: number }; instrumentInfo: { instrumentId: number; isin: string; displayname?: string; wkn?: string; categoryName?: string } }> {
  const cleanIsin = (isin || '').trim().toUpperCase();
  let resolvedInstrumentId = instrumentId && !isNaN(Number(instrumentId)) && Number(instrumentId) > 0 ? Number(instrumentId) : undefined;
  let info: any = { instrumentId: resolvedInstrumentId, isin: cleanIsin };

  // Only perform search call if instrumentId is not yet known
  if (!resolvedInstrumentId) {
    const searchResult = await searchLangSchwarzInstrument(cleanIsin);
    resolvedInstrumentId = searchResult.instrumentId;
    info = searchResult;
  }

  // 2. Fetch chart data via single call to instrumentId
  const proxyUrl = `/api/ls/chart?instrumentId=${encodeURIComponent(resolvedInstrumentId)}&container=chart1&marketId=1&quotetype=bid&series=intraday%2Chistory%2Cflags&type=&localeId=1`;
  const directUrl = `https://www.ls-tc.de/_rpc/json/instrument/chart/dataForInstrument?container=chart1&instrumentId=${encodeURIComponent(resolvedInstrumentId)}&marketId=1&quotetype=bid&series=intraday%2Chistory%2Cflags&type=&localeId=1`;

  let res: Response;
  try {
    res = await fetchWithFallback(proxyUrl, directUrl);
  } catch (err: any) {
    throw new Error(`Errore di connessione a Lang & Schwarz per le quotazioni di ${symbol}: ${err.message}`);
  }

  if (!res.ok) {
    throw new Error(`Errore HTTP ${res.status} nel recupero quotazioni Lang & Schwarz per ${symbol}`);
  }

  let json: any;
  try {
    json = await res.json();
  } catch (err: any) {
    throw new Error(`Formato dati non valido ricevuto da Lang & Schwarz per ${symbol}`);
  }

  const series = json.series || {};
  const historyData = series.history?.data;
  const intradayData = series.intraday?.data;

  const priceMap: { [date: string]: number } = {};

  // Process historical series (daily quotes)
  // Strictly filter by startDateStr and endDateStr to avoid bloating the DB with irrelevant past years
  if (Array.isArray(historyData)) {
    for (const point of historyData) {
      if (Array.isArray(point) && point.length >= 2) {
        const ts = point[0];
        const val = point[1];
        if (typeof val === 'number' && !isNaN(val) && val > 0 && typeof ts === 'number') {
          const ptDate = new Date(ts);
          const dateStr = `${ptDate.getFullYear()}-${String(ptDate.getMonth() + 1).padStart(2, '0')}-${String(ptDate.getDate()).padStart(2, '0')}`;
          if (startDateStr && dateStr < startDateStr) continue;
          if (endDateStr && dateStr > endDateStr) continue;
          priceMap[dateStr] = Number(val.toFixed(val < 1 ? 8 : 4));
        }
      }
    }
  }

  // Process intraday series: ONLY for the current day (todayStr), and ONLY if available
  const targetTodayStr = endDateStr || new Date().toISOString().split('T')[0];
  if (Array.isArray(intradayData) && intradayData.length > 0) {
    for (let i = intradayData.length - 1; i >= 0; i--) {
      const point = intradayData[i];
      if (Array.isArray(point) && point.length >= 2) {
        const ts = point[0];
        const val = point[1];
        if (typeof val === 'number' && !isNaN(val) && val > 0 && typeof ts === 'number') {
          const ptDate = new Date(ts);
          const intraDateStr = `${ptDate.getFullYear()}-${String(ptDate.getMonth() + 1).padStart(2, '0')}-${String(ptDate.getDate()).padStart(2, '0')}`;
          
          // Only attach to today's date if the intraday sample actually belongs to today
          if (intraDateStr === targetTodayStr) {
            priceMap[targetTodayStr] = Number(val.toFixed(val < 1 ? 8 : 4));
            break;
          }
        }
      }
    }
  }

  if (Object.keys(priceMap).length === 0) {
    throw new Error(`Nessuna quotazione valida disponibile per ${symbol} (ISIN: ${cleanIsin}) da Lang & Schwarz.`);
  }

  return { prices: priceMap, instrumentInfo: { ...info, instrumentId: resolvedInstrumentId } };
}

export async function syncPricesLocally(
  symbols: string[],
  force: boolean,
  db: DBState
): Promise<DBState> {
  if (!Array.isArray(symbols) || symbols.length === 0) {
    return db;
  }

  // Deep copy price cache and ticker configs
  const newPriceCache = JSON.parse(JSON.stringify(db.priceCache || {}));
  let newTickerConfigs: { [sym: string]: any } | null = null;
  let updatedTickerConfigs = false;
  let updatedAnyCache = false;
  let hasAnySuccess = false;
  const todayStr = new Date().toISOString().split('T')[0];

  for (const symbol of symbols) {
    const symbolUpper = symbol.toUpperCase().trim();
    // Find matching transactions
    const symbolTransactions = db.transactions.filter(
      (t: any) => t.symbol.toUpperCase() === symbolUpper
    );

    let oldestDateStr = '';
    let firstTxPrice = 100;

    const isCurrencyPair = symbolUpper.includes('=X');
    const isCrypto = isCryptoTicker(symbolUpper);

    if (symbolTransactions.length > 0) {
      symbolTransactions.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      oldestDateStr = symbolTransactions[0].date.split('T')[0];
      firstTxPrice = symbolTransactions[0].price;
    } else {
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
        const pair = symbolUpper.replace('=X', '');
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
        firstTxPrice = fallbacks[pair] || 1.0;
      } else if (isCrypto) {
        const cryptoFallbacks: { [sym: string]: number } = {
          'BTC': 85000, 'ETH': 2500, 'SOL': 160, 'ADA': 0.70, 'XRP': 2.20,
          'DOT': 6.5, 'LINK': 18.0, 'AVAX': 28.0, 'USDT': 0.92, 'USDC': 0.92
        };
        firstTxPrice = cryptoFallbacks[symbolUpper] || 100;
      } else {
        firstTxPrice = 100;
      }
    }

    const allDates = getDatesBetween(oldestDateStr, todayStr);
    
    if (!newPriceCache[symbolUpper]) {
      newPriceCache[symbolUpper] = {};
    }

    // Clean up extraneous dates older than oldestDateStr or in future to prevent DB bloat
    Object.keys(newPriceCache[symbolUpper]).forEach(d => {
      if (d < oldestDateStr || d > todayStr) {
        delete newPriceCache[symbolUpper][d];
      }
    });

    if (force) {
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const oneMonthAgoStr = oneMonthAgo.toISOString().split('T')[0];
      
      Object.keys(newPriceCache[symbolUpper]).forEach(d => {
        if (d >= oneMonthAgoStr) {
          delete newPriceCache[symbolUpper][d];
        }
      });
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    const missingDates = allDates.filter(d => !newPriceCache[symbolUpper][d]);
    const shouldFetch = force || missingDates.length > 0 || !newPriceCache[symbolUpper][todayStr];

    if (shouldFetch) {
      let fetchStartDateStr = missingDates.length > 0 ? missingDates[0] : sevenDaysAgoStr;
      const fetchStartObj = new Date(fetchStartDateStr);
      fetchStartObj.setDate(fetchStartObj.getDate() - 7);
      const optimizedStartStr = fetchStartObj.toISOString().split('T')[0];
      const finalFetchStartStr = optimizedStartStr > oldestDateStr ? optimizedStartStr : oldestDateStr;

      let fetchedPrices: { [date: string]: number } = {};
      let fetchSuccessful = false;

      const tickerConfig = (db.tickerConfigs && db.tickerConfigs[symbolUpper]) || {};
      const quoteSource = tickerConfig.source || 'yahoo';
      const tickerIsin = (tickerConfig.isin || '').trim().toUpperCase();
      const savedInstrumentId = tickerConfig.instrumentId ? Number(tickerConfig.instrumentId) : undefined;

      if (quoteSource === 'ls') {
        if (!tickerIsin) {
          console.warn(`[Lang & Schwarz] Ticker ${symbolUpper} impostato su Lang & Schwarz ma senza ISIN configurato. Quotazioni non recuperate.`);
        } else {
          try {
            console.log(`[Lang & Schwarz Request] Recupero quotazioni per ${symbolUpper} (ISIN: ${tickerIsin}, InstrumentID: ${savedInstrumentId || 'non salvato'})`);
            // Start date is strictly bounded by oldestDateStr so historical data before portfolio inception is never saved
            const lsStart = finalFetchStartStr > oldestDateStr ? finalFetchStartStr : oldestDateStr;
            const lsResult = await fetchLangSchwarzPrices(
              symbolUpper,
              tickerIsin,
              savedInstrumentId,
              lsStart,
              todayStr
            );
            fetchedPrices = lsResult.prices;
            fetchSuccessful = Object.keys(fetchedPrices).length > 0;
            if (fetchSuccessful) {
              console.log(`[Lang & Schwarz] Recuperate con successo ${Object.keys(fetchedPrices).length} quotazioni per ${symbolUpper}`);
            }

            // If instrumentId was not previously stored in DB config, persist it
            if (!savedInstrumentId && lsResult.instrumentInfo.instrumentId) {
              if (!newTickerConfigs) {
                newTickerConfigs = JSON.parse(JSON.stringify(db.tickerConfigs || {}));
              }
              newTickerConfigs[symbolUpper] = {
                ...(newTickerConfigs[symbolUpper] || tickerConfig),
                isin: tickerIsin,
                source: 'ls',
                instrumentId: lsResult.instrumentInfo.instrumentId
              };
              updatedTickerConfigs = true;
            }
          } catch (lsErr: any) {
            console.warn(`[Lang & Schwarz] Recupero fallito per ${symbolUpper} (ISIN: ${tickerIsin}):`, lsErr.message || lsErr);
          }
        }
      } else {
        // 1. Default: Try Yahoo Finance
        try {
          fetchedPrices = await fetchYahooFinancePrices(symbolUpper, finalFetchStartStr, todayStr);
          fetchSuccessful = Object.keys(fetchedPrices).length > 0;
        } catch (yahooErr) {
          console.warn(`Yahoo Finance fetch failed for ${symbolUpper}. Trying fallback...`, yahooErr);
          // 2. If crypto, try Binance fallback
          if (isCrypto || isCryptoTicker(symbolUpper)) {
            try {
              fetchedPrices = await fetchBinanceCryptoPrices(symbolUpper, finalFetchStartStr, todayStr);
              fetchSuccessful = Object.keys(fetchedPrices).length > 0;
              console.log(`Binance fallback succeeded for ${symbolUpper} (${Object.keys(fetchedPrices).length} points)`);
            } catch (binanceErr) {
              console.warn(`Binance fallback also failed for ${symbolUpper}`, binanceErr);
            }
          }
        }
      }

      if (fetchSuccessful) {
        hasAnySuccess = true;
        updatedAnyCache = true;

        // Store authentic market closing prices from API strictly within portfolio validity range
        Object.keys(fetchedPrices).forEach(date => {
          if (fetchedPrices[date] > 0 && date >= oldestDateStr && date <= todayStr) {
            newPriceCache[symbolUpper][date] = fetchedPrices[date];
          }
        });

        // For non-crypto instruments (stocks, ETFs, bonds), remove any artificial weekend
        // entries that were cloned from preceding Fridays in previous syncs
        if (!isCrypto && !isCryptoTicker(symbolUpper)) {
          Object.keys(newPriceCache[symbolUpper]).forEach(d => {
            const dayOfWeek = new Date(d + 'T12:00:00Z').getUTCDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) {
              delete newPriceCache[symbolUpper][d];
            }
          });
        }
      } else {
        // If fetch failed completely and we have zero price points, seed with transaction price
        if (Object.keys(newPriceCache[symbolUpper]).length === 0) {
          newPriceCache[symbolUpper][todayStr] = firstTxPrice;
        }
      }
    }

      // Mirror aliases if crypto: e.g. BTC -> BTC-EUR, BTCEUR=X, BTCEUR, BTC/EUR, EURBTC=X, etc.
      let baseCrypto = symbolUpper.replace('=X', '').replace(/[\/-]/g, '');
      if (baseCrypto.endsWith('EUR')) {
        baseCrypto = baseCrypto.substring(0, baseCrypto.length - 3);
      } else if (baseCrypto.endsWith('USD')) {
        baseCrypto = baseCrypto.substring(0, baseCrypto.length - 3);
      }

      if (isCrypto || CRYPTO_LIST.has(symbolUpper) || CRYPTO_LIST.has(baseCrypto)) {
        const root = CRYPTO_LIST.has(baseCrypto) ? baseCrypto : (CRYPTO_LIST.has(symbolUpper) ? symbolUpper : baseCrypto);
        const aliases = [
          root,
          `${root}-EUR`,
          `${root}EUR=X`,
          `${root}EUR`,
          `${root}/EUR`,
          `${root}-USD`,
          `${root}USD=X`,
          `${root}USD`,
          `${root}/USD`
        ];

        aliases.forEach(alias => {
          if (!newPriceCache[alias]) newPriceCache[alias] = {};
          Object.keys(newPriceCache[symbolUpper]).forEach(dt => {
            newPriceCache[alias][dt] = newPriceCache[symbolUpper][dt];
          });
        });

        // Inverse fiat-to-crypto aliases: EURBTC=X, EUR-BTC, USDBTC=X, etc.
        const inverseAliases = [
          `EUR${root}=X`,
          `EUR-${root}`,
          `EUR/${root}`,
          `EUR${root}`,
          `USD${root}=X`,
          `USD-${root}`,
          `USD/${root}`,
          `USD${root}`
        ];

        inverseAliases.forEach(invAlias => {
          if (!newPriceCache[invAlias]) newPriceCache[invAlias] = {};
          Object.keys(newPriceCache[symbolUpper]).forEach(dt => {
            const val = newPriceCache[symbolUpper][dt];
            if (val > 0) {
              newPriceCache[invAlias][dt] = Number((1 / val).toFixed(12));
            }
          });
        });
      }
      
      updatedAnyCache = true;
    }

  // If no successful fetches occurred and we were syncing non-empty symbols, log info
  if (symbols.length > 0 && !hasAnySuccess && !updatedAnyCache) {
    console.info("Price sync finished with cached entries intact.");
  }

  if (updatedAnyCache || updatedTickerConfigs) {
    return {
      ...db,
      priceCache: newPriceCache,
      ...(updatedTickerConfigs && newTickerConfigs ? { tickerConfigs: newTickerConfigs } : {})
    };
  }

  return db;
}
