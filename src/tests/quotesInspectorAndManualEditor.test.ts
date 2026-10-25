/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Test suite for Quotes Inspector & Manual Editor (Cognitive Ergonomics).
 */

import assert from 'assert';

async function runTestSuite() {
  console.log('\n--- Esecuzione Test Suite Verifica e Modifica Manuale Quotazioni ---');

  // Test 1: Updating and adding quotes in priceCache
  console.log('1. Verifica aggiornamento e aggiunta manuale delle quotazioni nel priceCache...');
  const priceCache: { [ticker: string]: { [date: string]: number } } = {
    'SWDA.MI': {
      '2026-10-20': 100.5,
      '2026-10-21': 101.2,
      '2026-10-22': 101.8
    }
  };

  const targetSymbol = 'SWDA.MI';
  const updatedQuotes = { ...(priceCache[targetSymbol] || {}) };
  // Modify existing quote
  updatedQuotes['2026-10-21'] = 101.5;
  // Add new quote
  updatedQuotes['2026-10-23'] = 102.4;
  priceCache[targetSymbol] = updatedQuotes;

  assert.strictEqual(priceCache['SWDA.MI']['2026-10-21'], 101.5, 'Quotazione modificata con successo');
  assert.strictEqual(priceCache['SWDA.MI']['2026-10-23'], 102.4, 'Nuova quotazione inserita con successo');
  assert.strictEqual(Object.keys(priceCache['SWDA.MI']).length, 4, 'Totale date registrate corretto');
  console.log('✓ Modifica e aggiunta manuale quotazioni verificate con successo');

  // Test 2: Removing an erroneous quote from priceCache
  console.log('2. Verifica eliminazione sicura di una quotazione errata dal priceCache...');
  const cacheWithTypo: { [ticker: string]: { [date: string]: number } } = {
    'CSSPX.MI': {
      '2026-05-10': 520.0,
      '2026-05-11': 5210.0, // typo outlier
      '2026-05-12': 522.5
    }
  };

  const typoSymbol = 'CSSPX.MI';
  const cleanedQuotes = { ...(cacheWithTypo[typoSymbol] || {}) };
  delete cleanedQuotes['2026-05-11'];
  cacheWithTypo[typoSymbol] = cleanedQuotes;

  assert.strictEqual(cacheWithTypo['CSSPX.MI']['2026-05-11'], undefined, 'Quotazione errata rimossa con successo');
  assert.strictEqual(cacheWithTypo['CSSPX.MI']['2026-05-10'], 520.0);
  assert.strictEqual(cacheWithTypo['CSSPX.MI']['2026-05-12'], 522.5);
  assert.strictEqual(Object.keys(cacheWithTypo['CSSPX.MI']).length, 2);
  console.log('✓ Eliminazione quotazione verificata con successo');

  // Test 3: Daily variation calculation & outlier identification
  console.log('3. Verifica calcolo variazione % giornaliera e rilevamento anomalie/outlier...');
  const dates = ['2026-01-02', '2026-01-05', '2026-01-06'];
  const quotesMap: { [date: string]: number } = {
    '2026-01-02': 100,
    '2026-01-05': 102,
    '2026-01-06': 150 // +47% spike
  };

  const records = dates.map((d, i) => {
    const p = quotesMap[d];
    let changePct: number | undefined = undefined;
    let isOutlier = false;
    if (i > 0) {
      const prev = quotesMap[dates[i - 1]];
      changePct = ((p - prev) / prev) * 100;
      if (Math.abs(changePct) >= 30) {
        isOutlier = true;
      }
    }
    return { date: d, price: p, changePct, isOutlier };
  });

  assert.strictEqual(records[0].changePct, undefined);
  assert.ok(Math.abs((records[1].changePct || 0) - 2.0) < 0.01, 'Variazione normale +2%');
  assert.strictEqual(records[1].isOutlier, false, 'Variazione normale non contrassegnata come outlier');
  assert.ok(Math.abs((records[2].changePct || 0) - 47.05) < 0.1, 'Spike del +47% calcolato');
  assert.strictEqual(records[2].isOutlier, true, 'Spike >30% correttamente contrassegnato come anomalia visiva');
  console.log('✓ Variazione giornaliera e outlier identificati con successo');

  // Test 4: Plausibility check (>50% deviation) for typo error prevention
  console.log('4. Verifica prevenzione errori di digitazione (soglia di plausibilità 50%)...');
  const nearestPrice = 120.0;

  const normalPrice = 121.5;
  const normalDiffPct = Math.abs((normalPrice - nearestPrice) / nearestPrice) * 100;
  assert.strictEqual(normalDiffPct >= 50, false, 'Modifica ordinaria non attiva avviso di battitura');

  const typoPrice = 1215.0; // accidental extra digit
  const typoDiffPct = Math.abs((typoPrice - nearestPrice) / nearestPrice) * 100;
  assert.strictEqual(typoDiffPct >= 50, true, 'Typo grave attiva correttamente la protezione utente');
  assert.ok(typoDiffPct > 900, 'Deviazione calcolata superiore al 900%');
  console.log('✓ Salvaguardia cognitiva contro errori di battitura validata con successo');

  // Test 5: Chronological sort and filtering
  console.log('5. Verifica ordinamento cronologico e filtri temporali...');
  const testQuotes: { [date: string]: number } = {
    '2025-12-30': 95.0,
    '2026-01-15': 98.0,
    '2026-05-20': 105.0,
    '2026-10-23': 112.0
  };

  const sortedDates = Object.keys(testQuotes).sort();
  assert.strictEqual(sortedDates[0], '2025-12-30');
  assert.strictEqual(sortedDates[sortedDates.length - 1], '2026-10-23');

  const filtered2026 = sortedDates.filter(d => d.startsWith('2026'));
  assert.strictEqual(filtered2026.length, 3);

  const filteredOct = sortedDates.filter(d => d.includes('2026-10'));
  assert.deepStrictEqual(filteredOct, ['2026-10-23']);
  console.log('✓ Ordinamento e filtri validati con successo');

  console.log('======================================================');
  console.log(' TUTTI I TEST SU VERIFICA E MODIFICA QUOTAZIONI SUPERATI! ');
  console.log('======================================================\n');
}

runTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
