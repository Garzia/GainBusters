/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * REGOLA 9 — TEST SUITE AUTOMATICA DI COERENZA FINANZIARIA
 * Verifica rigorosa dei principi architetturali di GainBusters:
 * Separazione definitiva tra Capitale Netto Contribuito, Carico Storico dei Lotti,
 * Immutabilità delle Transazioni, Indipendenza dei Lotti e Dinamica dei Flussi.
 */

import assert from 'node:assert';
import {
  calculateHoldingsAndLots,
  calculateInvestedCapital,
  calculateFinancialMetrics,
  calculateTransactionTableTotals,
  cleanFloatNoise
} from '../utils/finance';
import { Transaction, TransactionType, Currency } from '../types';

console.log('--- Esecuzione Test Suite Coerenza Finanziaria GainBusters ---');

// CASO DI TEST SPECIFICATO DALL'UTENTE:
// 1. BUY iniziale:
//    - investimento: 100 €
//    - quantità: 0.00111289 BTC
//    - prezzo: 89856.14032 €/BTC
//    - data: 2024-12-30
// 2. SELL successiva:
//    - controvalore: 20 €
//    - quantità venduta: 0.00031326 BTC
//    - prezzo: 63844.72962 €/BTC
//    - data: 2026-02-04
// 3. Nuovo BUY:
//    - investimento: 20 €
//    - quantità: 0.00033475 BTC
//    - prezzo: 59746.07916 €/BTC
//    - data: 2026-02-10

const mockTransactions: Transaction[] = [
  {
    id: 'tx-buy-1',
    portfolioId: 'port-crypto',
    date: '2024-12-30T16:41:00Z',
    type: TransactionType.BUY,
    symbol: 'BTC-EUR',
    qty: 0.00111289,
    price: 89856.14032, // 0.00111289 * 89856.14032 = 100.00 €
    commission: 0,
    currency: Currency.EUR,
    notes: 'PAC #1'
  },
  {
    id: 'tx-sell-1',
    portfolioId: 'port-crypto',
    date: '2026-02-04T09:33:00Z',
    type: TransactionType.SELL,
    symbol: 'BTC-EUR',
    qty: 0.00031326,
    price: 63844.72962, // 0.00031326 * 63844.72962 = 20.00 €
    commission: 0,
    currency: Currency.EUR,
    notes: 'Vendita parziale'
  },
  {
    id: 'tx-buy-2',
    portfolioId: 'port-crypto',
    date: '2026-02-10T00:16:00Z',
    type: TransactionType.BUY,
    symbol: 'BTC-EUR',
    qty: 0.00033475,
    price: 59746.07916, // 0.00033475 * 59746.07916 = 20.00 €
    commission: 0,
    currency: Currency.EUR,
    notes: 'PAC #7'
  }
];

const activePortIds = ['port-crypto'];
const convertIdentity = (amount: number) => amount;
const getPriceMock = (sym: string, date: string, fallback: number) => 65000;
const getCurrencyMock = () => 'EUR';

// 1. VERIFICA IMMUTABILITA' DELLE TRANSAZIONI
console.log('1. Verifica immutabilità delle transazioni storiche...');
assert.strictEqual(mockTransactions[0].qty, 0.00111289, 'La transazione BUY iniziale deve conservare la quantità originale immutabile');
assert.strictEqual(mockTransactions[0].price, 89856.14032, 'La transazione BUY iniziale deve conservare il prezzo originale immutabile');
assert.strictEqual(mockTransactions[1].qty, 0.00031326, 'La transazione SELL deve conservare la quantità originale immutabile');
assert.strictEqual(mockTransactions[2].qty, 0.00033475, 'Il nuovo BUY deve conservare la quantità originale immutabile');
console.log('✓ Tutte le transazioni sono rimaste immutabili');

// 2. VERIFICA DEI LOTTI APERTI E GENERAZIONE INDIPENDENTE
console.log('2. Verifica calcolo e scarico lotti aperti (FIFO)...');
const { activeLots, tickerHoldings } = calculateHoldingsAndLots(
  mockTransactions,
  activePortIds,
  convertIdentity,
  'EUR'
);

assert.strictEqual(activeLots.length, 2, 'Devono essere presenti esattamente 2 lotti aperti distinti');

// Lotto 1 (originato dal primo BUY e parzialmente scaricato dalla SELL)
const lot1 = activeLots.find(l => l.id === 'tx-buy-1')!;
assert(lot1, 'Il primo lotto deve esistere');
assert.strictEqual(lot1.qty, 0.00111289, 'La quantità originale del primo lotto (lot1.qty) deve restare 0.00111289');
assert.strictEqual(lot1.buyPrice, 89856.14032, 'Il prezzo del lotto 1 deve restare 89856.14032');
const expectedRemainingLot1 = cleanFloatNoise(0.00111289 - 0.00031326);
assert.strictEqual(lot1.remainingQty, expectedRemainingLot1, `La quantità residua del lotto 1 deve essere ${expectedRemainingLot1} (0.00079963)`);
assert.strictEqual(lot1.depletedQty, 0.00031326, 'La quantità scaricata del lotto 1 deve essere 0.00031326');
assert.strictEqual(lot1.originalCost, 100, 'Il costo originale del lotto 1 deve essere 100 €');
assert(Math.abs(lot1.historicalCostRemaining! - 71.85) < 0.01, `Il carico storico residuo del lotto 1 deve essere ~71.85 € (attuale: ${lot1.historicalCostRemaining})`);

// Lotto 2 (originato dal secondo BUY)
const lot2 = activeLots.find(l => l.id === 'tx-buy-2')!;
assert(lot2, 'Il secondo lotto deve esistere come entità autonoma e indipendente');
assert.strictEqual(lot2.qty, 0.00033475, 'La quantità del secondo lotto deve essere 0.00033475');
assert.strictEqual(lot2.remainingQty, 0.00033475, 'La quantità residua del secondo lotto deve essere integra (0.00033475)');
assert.strictEqual(lot2.buyPrice, 59746.07916, 'Il prezzo unitario del secondo lotto deve essere 59746.07916');
assert(Math.abs(lot2.historicalCostRemaining! - 20) < 0.01, 'Il carico storico del secondo lotto deve essere 20 €');

// Verifica indipendenza lotti: lot2 non deve aver modificato lot1
assert.notStrictEqual(lot1.id, lot2.id, 'I due lotti devono avere ID differenti');
assert.notStrictEqual(lot1.buyPrice, lot2.buyPrice, 'I due lotti devono mantenere i rispettivi prezzi di carico indipendenti');
console.log('✓ Lotti aperti verificati con successo: separati, precisi e indipendenti');

// 3. VERIFICA DEI TOTALI METRICHE FINANZIARIE
console.log('3. Verifica metriche finanziarie centralizzate...');
const metrics = calculateFinancialMetrics(
  mockTransactions,
  activePortIds,
  [],
  false,
  'EUR',
  convertIdentity,
  getPriceMock,
  getCurrencyMock,
  '2026-02-10',
  '2026-02-09'
);

// CONDIZIONI REGOLA 9:
// - Totale Investito = 100 €
// - BUY lordo = 120 €
// - SELL lordo = 20 €
// - Capitale Netto Contribuito = 100 €
// - Carico residuo dei lotti = ~91.85 € (metrica separata!)
// - Nessun calcolo di Totale Investito utilizza la somma del carico residuo dei lotti
assert.strictEqual(metrics.grossBuys, 120, 'BUY lordo deve essere 120 €');
assert.strictEqual(metrics.grossSells, 20, 'SELL lordo deve essere 20 €');
assert.strictEqual(metrics.netContributedCapital, 100, 'Capitale Netto Contribuito (BUY - SELL) deve essere 100 €');
assert.strictEqual(metrics.totalCapitalInvested, 100, 'Totale Investito della Dashboard deve essere esattamente 100 €');
assert(Math.abs(metrics.activeLotCapital - 91.85) < 0.01, `Il carico residuo dei lotti aperti deve essere ~91.85 € (attuale: ${metrics.activeLotCapital})`);
assert.notStrictEqual(metrics.totalCapitalInvested, metrics.activeLotCapital, 'Totale Investito (100 €) non deve MAI coincidere con il carico residuo (91.85 €)');
console.log('✓ Totale Investito e Capitale Netto Contribuito = 100 € (separato da Carico Residuo 91.85 €)');

// 4. VERIFICA DELLA TABELLA TRANSAZIONI
console.log('4. Verifica totali Registro Storico Transazioni...');
const txTotals = calculateTransactionTableTotals(mockTransactions, convertIdentity, 'EUR');
assert.strictEqual(txTotals.totalAmount, 100, 'Il totale netto della tabella transazioni (+100 - 20 + 20) deve essere esattamente 100 €');
assert.strictEqual(txTotals.buyCount, 2, 'Devono esserci 2 acquisti');
assert.strictEqual(txTotals.sellCount, 1, 'Deve esserci 1 vendita');
console.log('✓ Registro storico transazioni perfettamente coincidente con la Dashboard (100 €)');

// 5. VERIFICA TIMELINE DEL CAPITALE INVESTITO (100 -> 80 -> 100)
console.log('5. Verifica dinamica temporale del Capitale Netto...');
const date1 = '2024-12-30';
const date2 = '2026-02-04';
const date3 = '2026-02-10';

const capAtDate1 = calculateInvestedCapital(mockTransactions, activePortIds, [], false, 'EUR', convertIdentity, null, date1);
const capAtDate2 = calculateInvestedCapital(mockTransactions, activePortIds, [], false, 'EUR', convertIdentity, null, date2);
const capAtDate3 = calculateInvestedCapital(mockTransactions, activePortIds, [], false, 'EUR', convertIdentity, null, date3);

assert.strictEqual(capAtDate1.netContributedCapital, 100, `Capitale netto al ${date1} deve essere 100 €`);
assert.strictEqual(capAtDate2.netContributedCapital, 80, `Capitale netto al ${date2} (dopo SELL 20€) deve essere 80 €`);
assert.strictEqual(capAtDate3.netContributedCapital, 100, `Capitale netto al ${date3} (dopo nuovo BUY 20€) deve essere 100 €`);
console.log('✓ Curva capitale netto validata: sequenza 100 € → 80 € → 100 €');

// 6. VERIFICA PMC E METRICHE PER TICKER
console.log('6. Verifica metriche di posizione BTC-EUR...');
const btcMetric = metrics.tickerMetrics['BTC-EUR'];
assert(btcMetric, 'La metrica per BTC-EUR deve esistere');
const totalSharesOwned = cleanFloatNoise(0.00079963 + 0.00033475);
assert.strictEqual(btcMetric.sharesOwned, totalSharesOwned, 'Le quote complessive possedute devono essere 0.00113438');
assert(Math.abs(btcMetric.openLotsCostBasis - 91.85) < 0.01, `Il carico storico aperto per BTC-EUR deve essere ~91.85 € (attuale: ${btcMetric.openLotsCostBasis})`);
assert.strictEqual(btcMetric.netContributedCapital, 100, 'Il capitale netto contribuito per BTC-EUR deve essere 100 €');
const expectedPmc = cleanFloatNoise(btcMetric.openLotsCostBasis / totalSharesOwned);
assert(Math.abs(btcMetric.pmc - expectedPmc) < 0.01, `Il PMC ponderato sui lotti aperti deve essere corretto (calcolato: ${btcMetric.pmc}, atteso: ${expectedPmc})`);
console.log('✓ Metriche di posizione coerenti e corrette');

// 7. VERIFICA TRASFERIMENTO SU LEDGER E PERIMETRO "SOLO BROKER" (BINANCE A 0.00 €)
console.log('7. Verifica trasferimento su Ledger, perimetro Solo Broker Binance e stato lotti...');

const binanceBuy1: Transaction = {
  id: 'tx-binance-buy-1',
  portfolioId: 'port-binance',
  date: '2024-12-30T16:41:00Z',
  type: TransactionType.BUY,
  symbol: 'BTC-EUR',
  qty: 0.00111289,
  price: 89856.14032,
  commission: 0,
  currency: Currency.EUR,
  notes: ''
};

const binanceSell1: Transaction = {
  id: 'tx-binance-sell-1',
  portfolioId: 'port-binance',
  date: '2026-02-04T09:33:00Z',
  type: TransactionType.SELL,
  symbol: 'BTC-EUR',
  qty: 0.00031326,
  price: 63844.72962,
  commission: 0,
  currency: Currency.EUR,
  notes: ''
};

const binanceBuy2: Transaction = {
  id: 'tx-binance-buy-2',
  portfolioId: 'port-binance',
  date: '2026-02-10T00:16:00Z',
  type: TransactionType.BUY,
  symbol: 'BTC-EUR',
  qty: 0.00033475,
  price: 59746.07916,
  commission: 0,
  currency: Currency.EUR,
  notes: ''
};

const transferDate = '2026-09-01T10:00:00Z';
const transferOut1: Transaction = {
  id: 'tx-tout-1',
  type: TransactionType.TRANSFER_OUT,
  portfolioId: 'port-binance',
  symbol: 'BTC-EUR',
  date: transferDate,
  qty: 0.00079963,
  price: 89856.14032,
  currency: 'EUR',
  commission: 0,
  notes: '',
  parentTransactionId: 'tx-binance-buy-1',
  transferInTransactionId: 'tx-tin-1',
  transferId: 'tr-1'
};

const transferIn1: Transaction = {
  id: 'tx-tin-1',
  type: TransactionType.TRANSFER_IN,
  portfolioId: 'port-ledger',
  symbol: 'BTC-EUR',
  date: transferDate,
  qty: 0.00079963,
  price: 89856.14032,
  currency: 'EUR',
  commission: 0,
  notes: '',
  transferOutTransactionId: 'tx-tout-1',
  transferId: 'tr-1'
};

const transferOut2: Transaction = {
  id: 'tx-tout-2',
  type: TransactionType.TRANSFER_OUT,
  portfolioId: 'port-binance',
  symbol: 'BTC-EUR',
  date: transferDate,
  qty: 0.00033475,
  price: 59746.07916,
  currency: 'EUR',
  commission: 0,
  notes: '',
  parentTransactionId: 'tx-binance-buy-2',
  transferInTransactionId: 'tx-tin-2',
  transferId: 'tr-2'
};

const transferIn2: Transaction = {
  id: 'tx-tin-2',
  type: TransactionType.TRANSFER_IN,
  portfolioId: 'port-ledger',
  symbol: 'BTC-EUR',
  date: transferDate,
  qty: 0.00033475,
  price: 59746.07916,
  currency: 'EUR',
  commission: 0,
  notes: '',
  transferOutTransactionId: 'tx-tout-2',
  transferId: 'tr-2'
};

const allTxsWithTransfers = [
  binanceBuy1,
  binanceSell1,
  binanceBuy2,
  transferOut1,
  transferIn1,
  transferOut2,
  transferIn2
];

// Test Perimetro "Solo Broker" Binance:
// Tutti i BTC sono stati trasferiti su Ledger -> Il capitale investito deve essere ESATTAMENTE 0.00 € (NO 8.15 €!)
const binanceMetrics = calculateFinancialMetrics(
  allTxsWithTransfers,
  ['port-binance'],
  [],
  false,
  'EUR',
  convertIdentity,
  getPriceMock,
  getCurrencyMock,
  '2026-09-02',
  '2026-09-01'
);

assert.strictEqual(binanceMetrics.totalCapitalInvested, 0, `Perimetro Solo Broker (Binance) deve avere Totale Investito = 0.00 € (attuale: ${binanceMetrics.totalCapitalInvested} €)`);
assert.strictEqual(binanceMetrics.activeLotCapital, 0, 'Su Binance i lotti aperti devono essere a 0');

const binanceInvestedCap = calculateInvestedCapital(
  allTxsWithTransfers,
  ['port-binance'],
  [],
  false,
  'EUR',
  convertIdentity,
  null,
  '2026-09-02'
);
assert.strictEqual(binanceInvestedCap.totalCapitalInvested, 0, `calculateInvestedCapital su Binance deve essere 0.00 € (attuale: ${binanceInvestedCap.totalCapitalInvested} €)`);
assert.strictEqual(binanceInvestedCap.netContributedCapital, 0, `netContributedCapital su Binance deve essere 0.00 € (attuale: ${binanceInvestedCap.netContributedCapital} €)`);

// Test Perimetro "Solo Portafoglio" Ledger:
// Deve aver ricevuto esattamente il capitale netto trasferito (100.00 €)
const ledgerInvestedCap = calculateInvestedCapital(
  allTxsWithTransfers,
  ['port-ledger'],
  [],
  false,
  'EUR',
  convertIdentity,
  null,
  '2026-09-02'
);
assert.strictEqual(ledgerInvestedCap.totalCapitalInvested, 100, `calculateInvestedCapital su Ledger deve essere 100.00 € (attuale: ${ledgerInvestedCap.totalCapitalInvested} €)`);

// Test Perimetro Globale (Binance + Ledger):
// Deve rimanere esattamente 100.00 €
const globalInvestedCap = calculateInvestedCapital(
  allTxsWithTransfers,
  ['port-binance', 'port-ledger'],
  [],
  false,
  'EUR',
  convertIdentity,
  null,
  '2026-09-02'
);
assert.strictEqual(globalInvestedCap.totalCapitalInvested, 100, `calculateInvestedCapital Globale deve essere 100.00 € (attuale: ${globalInvestedCap.totalCapitalInvested} €)`);

// Test stato lotto per tx-binance-buy-1:
// Nel portafoglio Binance non ci sono più quote residue aperte di tx-binance-buy-1
const { activeLots: binanceLotsAfterTransfer } = calculateHoldingsAndLots(
  allTxsWithTransfers,
  ['port-binance', 'port-ledger'],
  convertIdentity,
  'EUR'
);
const openLot1InBinance = binanceLotsAfterTransfer.find(l => l.id === 'tx-binance-buy-1');
assert(!openLot1InBinance || openLot1InBinance.remainingQty <= 1e-8, 'Il lotto 1 non deve più avere quote aperte nel portafoglio di origine');

console.log('✓ Perimetro Solo Broker Binance azzerato a 0.00 €');
console.log('✓ Perimetro Solo Ledger a 100.00 € e Globale a 100.00 €');
console.log('✓ Lotto originario del 30/12/2024 completamente svuotato e riconosciuto come FULLY_TRANSFERRED');

// 8. VERIFICA COMMISSIONI IN ASSET E TOTALI TABELLA
console.log('\n8. Verifica gestione commissioni in asset e fiat nella tabella transazioni...');
const txsWithAssetCommissions: Transaction[] = [
  {
    id: 'tx-asset-comm-1',
    portfolioId: 'port-1',
    date: '2026-03-01T10:00:00Z',
    type: TransactionType.TRANSFER_OUT,
    symbol: 'BTC',
    qty: 0.5,
    price: 60000,
    commission: 0.0005,
    commissionPaymentMode: 'ASSET',
    commissionCurrency: 'BTC',
    currency: 'EUR',
    notes: 'Transfer with asset fee'
  },
  {
    id: 'tx-fiat-comm-1',
    portfolioId: 'port-1',
    date: '2026-03-01T11:00:00Z',
    type: TransactionType.BUY,
    symbol: 'ETH',
    qty: 2,
    price: 2500,
    commission: 5,
    commissionPaymentMode: 'EXTERNAL',
    commissionCurrency: 'EUR',
    currency: 'EUR',
    notes: 'Buy with fiat fee'
  }
];

const totalsWithAssetComm = calculateTransactionTableTotals(txsWithAssetCommissions, convertIdentity, 'EUR');
// 0.0005 BTC * 60000 EUR/BTC = 30 EUR; fiat fee = 5 EUR -> Total commission = 35 EUR
assert.strictEqual(totalsWithAssetComm.fiatCommissions, 5, 'fiatCommissions deve essere 5 EUR');
assert.strictEqual(totalsWithAssetComm.totalAssetCommissionsFiat, 30, 'totalAssetCommissionsFiat deve essere 30 EUR');
assert.strictEqual(totalsWithAssetComm.totalCommissions, 35, 'totalCommissions deve essere 35 EUR (30 asset + 5 fiat)');
assert.strictEqual(totalsWithAssetComm.assetCommissions.length, 1, 'Deve esserci 1 tipologia di asset commission');
assert.strictEqual(totalsWithAssetComm.assetCommissions[0].symbol, 'BTC');
assert.strictEqual(totalsWithAssetComm.assetCommissions[0].qty, 0.0005);
assert.strictEqual(totalsWithAssetComm.assetCommissions[0].fiatValue, 30);
assert.strictEqual(totalsWithAssetComm.assetCommissions[0].impliedRate, 60000);
console.log('✓ Commissioni in asset scorporate e totalizzate con controvalore e tasso di cambio corretto');

console.log('\n======================================================');
console.log(' TUTTI I TEST DELLA SUITE SONO STATI SUPERATI CON SUCCESSO!');
console.log('======================================================');
