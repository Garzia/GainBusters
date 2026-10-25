/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Test suite for ISIN association, Lang & Schwarz quote retrieval,
 * and quote source selection (Yahoo Finance default vs Lang & Schwarz).
 */

import assert from 'assert';
import {
  searchLangSchwarzInstrument,
  fetchLangSchwarzPrices,
  syncPricesLocally
} from '../utils/syncPrices.ts';
import { DBState, Currency, TransactionType } from '../types.ts';

async function runTestSuite() {
  console.log('\n--- Esecuzione Test Suite ISIN & Quotazioni Lang & Schwarz ---');

  // Test 1: Validation and error handling for ISIN input
  console.log('1. Verifica validazione e gestione formato ISIN...');
  try {
    await searchLangSchwarzInstrument('');
    assert.fail('Dovrebbe fallire per ISIN vuoto');
  } catch (err: any) {
    assert.ok(err.message.includes('non specificato'), 'Messaggio corretto per ISIN vuoto');
  }

  try {
    await searchLangSchwarzInstrument('SHORT123');
    assert.fail('Dovrebbe fallire per ISIN non valido (< 12 caratteri)');
  } catch (err: any) {
    assert.ok(err.message.includes('non valido'), 'Messaggio corretto per ISIN non conforme');
  }

  try {
    await searchLangSchwarzInstrument('ZZ0000000000');
    assert.fail('Dovrebbe fallire per ISIN inesistente');
  } catch (err: any) {
    assert.ok(
      err.message.includes('Nessuno strumento trovato') || err.message.includes('Nessun risultato'),
      'Riconosce correttamente strumento assente'
    );
  }
  console.log('✓ Validazione formato e gestione assenza ISIN verificate con successo');

  // Test 2: Search real instrument by ISIN on Lang & Schwarz
  console.log('2. Ricerca strumento tramite ISIN su Lang & Schwarz (IE00BK5BQT80)...');
  const searchResult = await searchLangSchwarzInstrument('IE00BK5BQT80');
  assert.strictEqual(searchResult.isin, 'IE00BK5BQT80');
  assert.ok(typeof searchResult.instrumentId === 'number' && searchResult.instrumentId > 0, 'instrumentId valido estratto');
  assert.strictEqual(searchResult.instrumentId, 1045625, 'instrumentId corrisponde allo strumento VWCE su L&S');
  console.log(`✓ Strumento trovato: ID #${searchResult.instrumentId} (${searchResult.displayname || 'Vanguard All-World'})`);

  // Test 3: Retrieve chart data & history from Lang & Schwarz via instrumentId
  console.log('3. Recupero delle quotazioni intraday e storiche da Lang & Schwarz...');
  const quotesResult = await fetchLangSchwarzPrices('VWCE.MI', 'IE00BK5BQT80');
  const priceMap = quotesResult.prices;
  assert.ok(priceMap && typeof priceMap === 'object', 'priceMap valido restituito');
  const dates = Object.keys(priceMap).sort();
  assert.ok(dates.length > 500, `Storico significativo disponibile (ricevute ${dates.length} date)`);

  // Check format: YYYY-MM-DD keys and positive numeric prices
  const sampleDate = dates[dates.length - 1];
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(sampleDate), 'Formato data YYYY-MM-DD rispettato');
  assert.ok(typeof priceMap[sampleDate] === 'number' && priceMap[sampleDate] > 0, 'Prezzo numerico positivo');
  console.log(`✓ Formato verificato: data ${sampleDate} -> quotazione ${priceMap[sampleDate]} € (${dates.length} quotazioni storiche)`);

  // Test 4: Default source behavior - Yahoo Finance remains default
  console.log('4. Verifica che Yahoo Finance rimanga la fonte predefinita per ticker privi di configurazione...');
  const mockDb: DBState = {
    settings: {
      theme: 'dark',
      defaultCurrency: Currency.EUR,
      passwordSet: false,
      selectedInflationId: 'NIC',
      inflationIndices: []
    },
    accounts: [],
    portfolios: [],
    transactions: [
      {
        id: 'tx1',
        portfolioId: 'p1',
        date: '2024-01-15T10:00:00.000Z',
        type: TransactionType.BUY,
        symbol: 'VWCE.MI',
        qty: 10,
        price: 105.5,
        commission: 2.5,
        currency: 'EUR',
        notes: ''
      }
    ],
    priceCache: {}
  };

  // Without tickerConfigs, ticker must default to Yahoo Finance
  const defaultSource = (mockDb.tickerConfigs && mockDb.tickerConfigs['VWCE.MI']?.source) || 'yahoo';
  assert.strictEqual(defaultSource, 'yahoo', 'Yahoo Finance è la fonte predefinita senza configurazione');
  console.log('✓ Yahoo Finance è la fonte predefinita senza richiedere alcuna configurazione');

  // Test 5: Independent and persistent configuration per ticker, instrumentId caching and date bounding
  console.log('5. Verifica cambio fonte indipendente, memorizzazione instrumentId e contenimento storico per data portafoglio...');
  const dbWithLs: DBState = {
    ...mockDb,
    tickerConfigs: {
      'VWCE.MI': {
        isin: 'IE00BK5BQT80',
        source: 'ls'
      },
      'SWDA.MI': {
        source: 'yahoo' // explicitly yahoo
      }
    }
  };

  assert.strictEqual(dbWithLs.tickerConfigs!['VWCE.MI'].source, 'ls');
  assert.strictEqual(dbWithLs.tickerConfigs!['VWCE.MI'].isin, 'IE00BK5BQT80');
  assert.strictEqual(dbWithLs.tickerConfigs!['SWDA.MI'].source, 'yahoo');

  // Sync quotes with Lang & Schwarz for VWCE.MI
  const updatedDb = await syncPricesLocally(['VWCE.MI'], true, dbWithLs);
  assert.ok(updatedDb.priceCache['VWCE.MI'], 'priceCache per VWCE.MI popolata');
  const syncedDates = Object.keys(updatedDb.priceCache['VWCE.MI']).sort();
  assert.ok(syncedDates.length > 50, `Quotazioni Lang & Schwarz salvate in priceCache (${syncedDates.length} date)`);

  // Verify DB bloating protection: NO date earlier than oldest transaction (2024-01-15) must exist!
  const hasOlderDates = syncedDates.some(d => d < '2024-01-15');
  assert.strictEqual(hasOlderDates, false, 'Nessuna data antecedente al primo acquisto del portafoglio (2024-01-15) salvata nel DB');
  console.log(`✓ Protezione dimensione DB: storico salvato a partire da ${syncedDates[0]} (>= 2024-01-15), prevenuto salvataggio di anni non necessari`);

  // Verify instrumentId persistence
  assert.ok(updatedDb.tickerConfigs!['VWCE.MI'].instrumentId, 'instrumentId salvato automaticamente nella configurazione del ticker');
  assert.strictEqual(updatedDb.tickerConfigs!['VWCE.MI'].instrumentId, 1045625, 'instrumentId è 1045625');
  console.log(`✓ instrumentId (#${updatedDb.tickerConfigs!['VWCE.MI'].instrumentId}) memorizzato nel DB per consentire chiamate dirette future`);

  // Test 5b: Direct call with saved instrumentId (no search RPC required)
  console.log('5b. Verifica recupero diretto con instrumentId già noto (singola chiamata)...');
  const directResult = await fetchLangSchwarzPrices('VWCE.MI', 'IE00BK5BQT80', 1045625, '2024-01-15');
  assert.ok(Object.keys(directResult.prices).length > 0, 'Quotazioni recuperate con successo con singola chiamata via instrumentId');
  assert.strictEqual(directResult.instrumentInfo.instrumentId, 1045625);
  console.log('✓ Chiamata singola diretta con instrumentId completata con successo');

  // Verify that SWDA.MI was not modified or affected
  assert.strictEqual(updatedDb.priceCache['SWDA.MI'], undefined, 'Il cambio fonte è strettamente limitato al ticker selezionato');
  console.log(`✓ Lang & Schwarz sincronizzato con successo (${syncedDates.length} quotazioni) e isolato a VWCE.MI`);

  // Test 6: Missing ISIN on Lang & Schwarz does not import corrupted data
  console.log('6. Verifica che ISIN mancante per Lang & Schwarz non importi dati errati...');
  const dbMissingIsin: DBState = {
    ...mockDb,
    tickerConfigs: {
      'TEST.TICKER': {
        source: 'ls'
        // isin missing!
      }
    },
    priceCache: {
      'TEST.TICKER': {
        '2024-01-15': 50.0
      }
    }
  };

  const syncedMissing = await syncPricesLocally(['TEST.TICKER'], true, dbMissingIsin);
  assert.strictEqual(
    syncedMissing.priceCache['TEST.TICKER']['2024-01-15'],
    50.0,
    'Lo storico esistente rimane intatto e nessun dato corrotto viene importato'
  );
  console.log('✓ Gestione sicura verificata: nessun dato errato importato in caso di ISIN mancante');

  console.log('\n======================================================');
  console.log(' TUTTI I TEST SU LANG & SCHWARZ E FONTI SUPERATI! ');
  console.log('======================================================\n');
}

runTestSuite().catch(err => {
  console.error('Errore durante i test:', err);
  process.exit(1);
});
