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
  return new Promise(async (resolve, reject) => {
    let adjustedSymbol = symbol.trim().toUpperCase();
    if (adjustedSymbol === 'BTC') adjustedSymbol = 'BTC-EUR';
    if (adjustedSymbol === 'ETH') adjustedSymbol = 'ETH-EUR';
    if (adjustedSymbol === 'BTCUSD') adjustedSymbol = 'BTC-USD';
    if (adjustedSymbol === 'BTCEUR') adjustedSymbol = 'BTC-EUR';

    const startSec = Math.floor(new Date(startDateStr).getTime() / 1000);
    // Include full current day
    const endSec = Math.floor(new Date(endDateStr).getTime() / 1000) + 86400;

    const proxyUrl = `/api/yahoo/${encodeURIComponent(adjustedSymbol)}?period1=${startSec}&period2=${endSec}&interval=1d`;
    console.log(`[Yahoo Finance Request] Fetching historical close and timestamp data for ${symbol} as ${adjustedSymbol}: ${proxyUrl}`);

    try {
      const res = await fetch(proxyUrl, { method: 'GET', headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const parsedData = await res.json();
      
      const chart = parsedData?.chart;
      const result = chart?.result?.[0];
      if (!result) {
        throw new Error(`Invalid Yahoo Finance chart response structure`);
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
}

export async function syncPricesLocally(
  symbols: string[],
  force: boolean,
  db: DBState
): Promise<DBState> {
  if (!Array.isArray(symbols) || symbols.length === 0) {
    return db;
  }

  // Create a deep copy of the price cache to update
  const newPriceCache = JSON.parse(JSON.stringify(db.priceCache || {}));
  let updatedAnyCache = false;
  const todayStr = new Date().toISOString().split('T')[0];

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
    
    if (!newPriceCache[symbol]) {
      newPriceCache[symbol] = {};
    }

    if (force) {
      // Clear only the last month of cache to force a refresh of recent data
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const oneMonthAgoStr = oneMonthAgo.toISOString().split('T')[0];
      
      Object.keys(newPriceCache[symbol]).forEach(d => {
        if (d >= oneMonthAgoStr) {
          delete newPriceCache[symbol][d];
        }
      });
    }

    const missingDates = allDates.filter(d => !newPriceCache[symbol][d]);

    if (missingDates.length > 0) {
      // Find the earliest missing date and go back a few days to catch Friday closes if missing on a Monday
      let fetchStartDateStr = missingDates[0];
      const fetchStartObj = new Date(fetchStartDateStr);
      fetchStartObj.setDate(fetchStartObj.getDate() - 7);
      const optimizedStartStr = fetchStartObj.toISOString().split('T')[0];
      // But don't go before the actual oldest transaction date
      const finalFetchStartStr = optimizedStartStr > oldestDateStr ? optimizedStartStr : oldestDateStr;

      console.log(`Syncing ${missingDates.length} missing dates for ${symbol}. Optimized fetch from ${finalFetchStartStr} to ${todayStr}`);
      
      let fetchedPrices: { [date: string]: number } = {};
      let fetchSuccessful = false;

      // 1. Try Yahoo Finance directly from client
      try {
        fetchedPrices = await fetchYahooFinancePrices(symbol, finalFetchStartStr, todayStr);
        fetchSuccessful = Object.keys(fetchedPrices).length > 0;
        console.log(`Successfully fetched ${Object.keys(fetchedPrices).length} prices from Yahoo Finance for ${symbol}`);
      } catch (err) {
        console.error(`Yahoo Finance fetch failed for ${symbol}. Using random walk simulation generator fallback.`, err);
      }

      // Populate database for all dates
      let currentPriceValue = firstTxPrice;
      const walk = generateRandomWalk(currentPriceValue, allDates.length, symbol);

      allDates.forEach((date, index) => {
        // If we fetched it from Yahoo, use that
        if (fetchSuccessful && fetchedPrices[date] !== undefined) {
          newPriceCache[symbol][date] = fetchedPrices[date];
          currentPriceValue = fetchedPrices[date];
        } else if (fetchSuccessful && date >= finalFetchStartStr) {
          // Carry forward close price on holidays / weekends ONLY for dates within our fetched range
          // For dates before our fetched range, we already have them in cache or they were handled
          if (!newPriceCache[symbol][date]) {
             newPriceCache[symbol][date] = currentPriceValue;
          } else {
             currentPriceValue = newPriceCache[symbol][date];
          }
        } else if (newPriceCache[symbol][date] !== undefined) {
          // Pre-existing value
          currentPriceValue = newPriceCache[symbol][date];
        } else {
          // Fallback to our aligned random walk
          // We align the random walk with any known transactions unit prices!
          const exactMatchTx = symbolTransactions.find(t => t.date.split('T')[0] === date);
          if (exactMatchTx) {
            newPriceCache[symbol][date] = exactMatchTx.price;
            currentPriceValue = exactMatchTx.price;
          } else {
            // Take the random walk offset
            const randomIncrement = walk[index] - walk[Math.max(0, index - 1)];
            currentPriceValue = Math.max(0.01, Number((currentPriceValue + randomIncrement).toFixed(4)));
            newPriceCache[symbol][date] = currentPriceValue;
          }
        }
      });
      
      updatedAnyCache = true;
    }
  }

  if (updatedAnyCache) {
    return {
      ...db,
      priceCache: newPriceCache
    };
  }

  return db;
}
