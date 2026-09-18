/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Test suite per il sistema modulare di importazione e Trade Republic CSV Importer.
 */

import assert from 'node:assert';
import { TradeRepublicCsvImporter } from '../importers/tradeRepublic/TradeRepublicCsvImporter.ts';
import { importerRegistry, detectBestImporter } from '../importers/registry.ts';
import { NonTickerMovement, NonTickerMovementType } from '../types.ts';
import { parseCsvToObjects, parseCsvNumber } from '../importers/csvHelper.ts';

console.log('--- Esecuzione Test Suite Importer Trade Republic & Registry ---');

const sampleTradeRepublicCsv = `"datetime","date","account_type","category","type","asset_class","name","symbol","shares","price","amount","fee","tax","currency","original_amount","original_currency","fx_rate","description","transaction_id","counterparty_name","counterparty_iban","payment_reference","mcc_code"
"2026-08-05T15:56:17.190986Z","2026-08-05","DEFAULT","CASH","TRANSFER_INSTANT_INBOUND","","MARIO ROSSI E BIANCA ROSSI","","","","100.000000","","","EUR","","","","Incoming transfer from MARIO ROSSI E BIANCA ROSSI(IT60L0301503200000004364400)","019fd2a3-c9a6-7881-a27c-61b18fd4678f","MARIO ROSSI E BIANCA ROSSI","IT60L0301503200000004364400","",""
"2026-08-17T10:19:02.314142Z","2026-08-17","DEFAULT","CASH","CARD_TRANSACTION","","BELLA ITALIA & EFA VILLAG","","","","-1059.000000","","","EUR","","","","BELLA ITALIA & EFA VIL","01a00f3b-572a-7c43-b0c0-30ed006bc39b","","","","7033"
"2026-08-17T12:49:38.326Z","2026-08-17","DEFAULT","TRADING","BUY","FUND","Global Aggregate Bond EUR Hedged (Acc)","IE00BG47KH54","5.9574460000","23.5000000000","-140.00","","","EUR","","","","Savings plan execution IE00BG47KH54 Vanguard Funds PLC - Vanguard Global Aggregate Bond UCITS ETF EUR Hedged Accumulating, quantity: 5.957446","e41b899c-10da-4836-9f31-7323194add26","","","",""
"2026-09-01T12:32:52.239808Z","2026-09-01","DEFAULT","CASH","INTEREST_PAYMENT","","","","","","11.770000","","-3.06","EUR","","","","Interest payment for payout collection 01a05b64-df0a-76fd-a411-5bd2e7b79d07","01a05cf5-420f-7912-a37b-49bd3cf5f8e0","","","",""
"2026-09-01T01:11:52.902400Z","2026-09-01","DEFAULT","CASH","BENEFITS_SAVEBACK","FUND","Global Aggregate Bond EUR Hedged (Acc)","IE00BG47KH54","","","14.990000","","","EUR","","",""," Cash reward allocation f68a3684-3950-4b67-88f4-dd8d16cc53f6 for reservation: 9d3e05aa-50ae-4464-9a39-90f69a274c64","01a05a85-cb46-7f5b-a147-24ed71d0eeae","","","",""
`;

// 1. TEST AUTO-RILEVAMENTO
console.log('1. Test rilevamento automatico del formato Trade Republic...');
const importer = new TradeRepublicCsvImporter();
const detection = importer.detect(sampleTradeRepublicCsv, 'trade_republic_statement.csv');
assert.strictEqual(detection.canHandle, true, 'Deve rilevare correttamente il CSV Trade Republic');
assert.strictEqual(detection.confidence, 1.0, 'La confidenza deve essere massima per il formato riconosciuto');
console.log('✓ Auto-rilevamento Trade Republic superato');

// 2. TEST PARSING E CALCOLO MOVIMENTI (Lordo, Ritenuta, Netto, Trading, Spesa carta, Cashback)
console.log('2. Test classificazione movimenti (Trading/Investimento, Rendimento, Spesa Carta, Cashback, Deposito)...');
const parseResult = importer.parse(sampleTradeRepublicCsv, 'trade_republic_statement.csv', {
  entityId: 'entity-tr-cash',
  existingMovements: []
});

assert.strictEqual(parseResult.totalRows, 5, 'Devono essere analizzate 5 righe');
assert.strictEqual(parseResult.validCount, 5, 'Tutte e 5 le righe iniziali devono essere valide');
assert.strictEqual(parseResult.duplicateCount, 0, 'Nessun duplicato al primo passaggio');

// Trova la riga INTEREST_PAYMENT
const interestRow = parseResult.items.find(it => it.item?.externalId === '01a05cf5-420f-7912-a37b-49bd3cf5f8e0');
assert.ok(interestRow, 'Deve trovare la riga con ID 01a05cf5-420f-7912-a37b-49bd3cf5f8e0');
assert.strictEqual(interestRow.item?.type, NonTickerMovementType.RETURN);
assert.strictEqual(interestRow.item?.grossReturn, 11.77, 'Lordo deve essere 11.77');
assert.strictEqual(interestRow.item?.taxAmount, 3.06, 'Imposta deve essere 3.06');
assert.strictEqual(interestRow.item?.netReturn, 8.71, 'Netto = 11.77 - 3.06 = 8.71');
assert.strictEqual(interestRow.item?.isReinvested, true, 'Interesse deve risultare reinvestito nel saldo');

// Trova la riga TRADING BUY
const tradingBuyRow = parseResult.items.find(it => it.item?.externalId === 'e41b899c-10da-4836-9f31-7323194add26');
assert.ok(tradingBuyRow, 'Deve trovare la riga TRADING BUY');
assert.strictEqual(tradingBuyRow.item?.type, NonTickerMovementType.INVESTMENT, 'category TRADING BUY deve essere INVESTMENT');
assert.strictEqual(tradingBuyRow.item?.amount, 140.00, 'Importo acquisto 140.00');
assert.strictEqual(tradingBuyRow.item?.units, 5.957446, 'Quote estratte 5.957446');
assert.strictEqual(tradingBuyRow.item?.unitPrice, 23.50, 'Prezzo unitario estratto 23.50');

// Trova la riga CARD_TRANSACTION
const cardSpendRow = parseResult.items.find(it => it.item?.externalId === '01a00f3b-572a-7c43-b0c0-30ed006bc39b');
assert.ok(cardSpendRow, 'Deve trovare la riga CARD_TRANSACTION');
assert.strictEqual(cardSpendRow.item?.type, NonTickerMovementType.CARD_SPEND, 'CARD_TRANSACTION deve essere CARD_SPEND');
assert.strictEqual(cardSpendRow.item?.amount, 1059.00);

// Trova la riga BENEFITS_SAVEBACK
const savebackRow = parseResult.items.find(it => it.item?.externalId === '01a05a85-cb46-7f5b-a147-24ed71d0eeae');
assert.ok(savebackRow, 'Deve trovare la riga BENEFITS_SAVEBACK');
assert.strictEqual(savebackRow.item?.type, NonTickerMovementType.CASHBACK, 'BENEFITS_SAVEBACK deve essere CASHBACK');
assert.strictEqual(savebackRow.item?.amount, 14.99);

console.log('✓ Calcoli e mappatura tipi (RETURN, INVESTMENT, CARD_SPEND, CASHBACK, DEPOSIT) verificati con successo');

// 3. TEST DEDUPLICAZIONE ED IDEMPOTENZA
console.log('3. Test idempotenza e deduplicazione su re-importazione...');
const existingMovements: NonTickerMovement[] = [
  {
    id: 'mov-1',
    entityId: 'entity-tr-cash',
    date: '2026-09-01',
    type: NonTickerMovementType.RETURN,
    grossReturn: 11.77,
    taxAmount: 3.06,
    netReturn: 8.71,
    isReinvested: true,
    externalId: '01a05cf5-420f-7912-a37b-49bd3cf5f8e0'
  },
  {
    id: 'mov-2',
    entityId: 'entity-tr-cash',
    date: '2026-08-05',
    type: NonTickerMovementType.DEPOSIT,
    amount: 100,
    externalId: '019fd2a3-c9a6-7881-a27c-61b18fd4678f'
  }
];

const reimportResult = importer.parse(sampleTradeRepublicCsv, 'trade_republic_statement.csv', {
  entityId: 'entity-tr-cash',
  existingMovements
});

assert.strictEqual(reimportResult.duplicateCount, 2, 'Deve identificare 2 movimenti già presenti');
assert.strictEqual(reimportResult.validCount, 3, 'Deve considerare validi solo i 3 movimenti rimanenti');
console.log('✓ Deduplicazione idempotente verificata con successo');

// 4. TEST DEL REGISTRY
console.log('4. Test Registry globale e rilevamento asincrono...');
const detected = await detectBestImporter(sampleTradeRepublicCsv, 'my_export.csv');
assert.ok(detected, 'Il registry deve trovare un importer compatibile');
assert.strictEqual(detected.importer.id, 'trade_republic');
console.log('✓ Registry e motore di auto-rilevamento verificati con successo');

console.log('--- Tutti i test degli Importer sono stati superati con successo! ---');
