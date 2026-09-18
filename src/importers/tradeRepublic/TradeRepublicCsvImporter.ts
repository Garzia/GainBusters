/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Importer per estratto conto / esportazione CSV di Trade Republic.
 * 
 * Mappa i movimenti di liquidità (CASH):
 * - INTEREST_PAYMENT: Rendimento da liquidità remunerata (grossReturn = amount, taxAmount = |tax|, netReturn = amount + tax)
 * - TRANSFER_INSTANT_INBOUND / TRANSFER_INBOUND: Flusso in entrata (DEPOSIT)
 * - TRANSFER_INSTANT_OUTBOUND / TRANSFER_OUTBOUND: Flusso in uscita (WITHDRAWAL)
 * - CARD_TRANSACTION: Uscita per spesa carta (WITHDRAWAL / OTHER_OUTFLOW)
 * - CARD_REFUND: Entrata per rimborso carta (OTHER_INFLOW)
 * - BENEFITS_SAVEBACK / BENEFITS_ROUNDUP: Entrata per reward/saveback (OTHER_INFLOW)
 * - BUY / SELL: Flussi di cassa correlati a compravendita strumenti (WITHDRAWAL / DEPOSIT)
 * 
 * Deduplicazione rigorosa tramite la colonna univoca 'transaction_id' come chiave di idempotenza.
 */

import {
  NonTickerImporter,
  ImporterDetectionResult,
  ImportParsedResult,
  ImportOptions,
  NonTickerImportItem,
  ImportItemResult
} from '../types.ts';
import { NonTickerMovementType } from '../../types.ts';
import { parseCsvToObjects, parseCsvNumber, normalizeCsvDate } from '../csvHelper.ts';
import { cleanFloatNoise } from '../../utils/finance.ts';

export class TradeRepublicCsvImporter implements NonTickerImporter {
  public readonly id = 'trade_republic';
  public readonly name = 'Trade Republic';
  public readonly supportedExtensions = ['.csv'];
  public readonly supportedFormats = ['CSV'];
  public readonly description = 'Importatore per file CSV esportati dall\'applicazione Trade Republic.';

  /**
   * Rileva se il contenuto corrisponde alla struttura di un CSV Trade Republic.
   */
  public detect(rawContent: string | ArrayBuffer, fileName: string): ImporterDetectionResult {
    if (typeof rawContent !== 'string') {
      return {
        canHandle: false,
        confidence: 0,
        providerId: this.id,
        providerName: this.name,
        format: 'CSV',
        reason: 'Il contenuto deve essere in formato testuale CSV.'
      };
    }

    const firstLine = rawContent.split(/\r\n|\n|\r/)[0] || '';
    const lowerFirstLine = firstLine.toLowerCase();

    // Firme caratteristiche dell'intestazione Trade Republic
    const requiredKeys = ['transaction_id', 'datetime', 'account_type', 'type', 'amount'];
    const bonusKeys = ['counterparty_name', 'counterparty_iban', 'mcc_code', 'original_amount', 'fx_rate'];

    let matchCount = 0;
    for (const key of requiredKeys) {
      if (lowerFirstLine.includes(key)) {
        matchCount++;
      }
    }

    let bonusCount = 0;
    for (const key of bonusKeys) {
      if (lowerFirstLine.includes(key)) {
        bonusCount++;
      }
    }

    if (matchCount >= 4) {
      const confidence = bonusCount > 0 ? 1.0 : 0.9;
      return {
        canHandle: true,
        confidence,
        providerId: this.id,
        providerName: this.name,
        format: 'CSV',
        reason: 'Struttura colonne CSV Trade Republic identificata con successo.'
      };
    }

    return {
      canHandle: false,
      confidence: 0,
      providerId: this.id,
      providerName: this.name,
      format: 'CSV',
      reason: 'Le intestazioni del file non corrispondono allo schema CSV di Trade Republic.'
    };
  }

  /**
   * Effettua il parsing e la normalizzazione dei movimenti dal CSV Trade Republic.
   */
  public parse(
    rawContent: string | ArrayBuffer,
    fileName: string,
    options: ImportOptions
  ): ImportParsedResult {
    if (typeof rawContent !== 'string') {
      throw new Error('Il contenuto del file deve essere una stringa di testo CSV.');
    }

    const { headers, rows } = parseCsvToObjects(rawContent);

    if (rows.length === 0) {
      return {
        providerId: this.id,
        providerName: this.name,
        fileName,
        totalRows: 0,
        validCount: 0,
        duplicateCount: 0,
        skippedCount: 0,
        errorCount: 0,
        items: [],
        summary: {
          totalGrossReturns: 0,
          totalTaxes: 0,
          totalNetReturns: 0,
          totalInflows: 0,
          totalOutflows: 0
        },
        warnings: ['Il file CSV è vuoto o non contiene righe di dati valide.']
      };
    }

    // Set di chiavi esterne già presenti nel database per la deduplicazione idempotente
    const existingExternalIds = new Set<string>();
    for (const m of options.existingMovements) {
      if (m.externalId) {
        existingExternalIds.add(m.externalId.trim().toLowerCase());
      }
      // Controlla anche se l'ID è citato nelle note di precedenti registrazioni
      if (m.notes) {
        const match = m.notes.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        if (match) {
          existingExternalIds.add(match[0].toLowerCase());
        }
      }
    }

    const items: ImportItemResult[] = [];
    let validCount = 0;
    let duplicateCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    let totalGrossReturns = 0;
    let totalTaxes = 0;
    let totalNetReturns = 0;
    let totalInflows = 0;
    let totalOutflows = 0;
    let detectedCurrency = 'EUR';
    let minDate: string | null = null;
    let maxDate: string | null = null;
    const warnings: string[] = [];

    // Tracciamento chiavi univoche presenti all'interno del file stesso per evitare duplicati in-file
    const seenInFileIds = new Set<string>();

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const rowIndex = r + 2; // +2 per conteggio 1-indexed comprensivo di riga header

      // Estrai transaction_id
      const rawTxId = (row['transaction_id'] || '').trim();
      if (!rawTxId) {
        // Se manca transaction_id, genera una chiave deterministica di fallback
        items.push({
          rowIndex,
          status: 'ERROR',
          statusReason: 'Campo transaction_id mancante o vuoto.',
          rawText: JSON.stringify(row)
        });
        errorCount++;
        continue;
      }

      const txIdLower = rawTxId.toLowerCase();

      // Rileva se è duplicato in-file
      if (seenInFileIds.has(txIdLower)) {
        items.push({
          rowIndex,
          status: 'DUPLICATE',
          statusReason: `Transazione duplicata all'interno del medesimo file CSV (ID: ${rawTxId})`,
          rawText: JSON.stringify(row)
        });
        duplicateCount++;
        continue;
      }
      seenInFileIds.add(txIdLower);

      // Data del movimento
      const rawDate = row['date'] || row['datetime'] || '';
      const date = normalizeCsvDate(rawDate);
      if (!date) {
        items.push({
          rowIndex,
          status: 'ERROR',
          statusReason: 'Data della transazione non valida o non interpretabile.',
          rawText: JSON.stringify(row)
        });
        errorCount++;
        continue;
      }

      if (!minDate || date < minDate) minDate = date;
      if (!maxDate || date > maxDate) maxDate = date;

      // Valuta
      if (row['currency']) {
        detectedCurrency = row['currency'].toUpperCase();
      }

      // Tipo di movimento Trade Republic
      const rawType = (row['type'] || '').toUpperCase().trim();
      const rawCategory = (row['category'] || '').toUpperCase().trim();
      const rawDescription = (row['description'] || '').trim();
      const counterparty = (row['counterparty_name'] || '').trim();

      // Parsing importo, fee, tasse, quote e prezzo unitario
      const rawAmount = parseCsvNumber(row['amount']);
      const rawTax = parseCsvNumber(row['tax']); // Spesso negativa nel CSV per INTEREST_PAYMENT
      const rawFee = parseCsvNumber(row['fee']);
      const rawShares = parseCsvNumber(row['shares'] || row['units'] || row['quantity']);
      const rawPrice = parseCsvNumber(row['price'] || row['unit_price'] || row['nav']);
      const titleName = row['name'] || row['symbol'] || '';

      let itemPayload: Partial<NonTickerImportItem> | null = null;
      let isSupported = true;
      let skipReason = '';

      if (rawCategory === 'TRADING' || rawType === 'BUY' || rawType === 'SELL') {
        // Categoria TRADING o compravendita titoli / strumenti
        const amt = cleanFloatNoise(Math.abs(rawAmount));
        const isSell = rawType === 'SELL' || (!rawType.includes('BUY') && rawAmount > 0);

        if (isSell) {
          // Vendita / Disinvestimento (Flusso in entrata)
          itemPayload = {
            externalId: rawTxId,
            date,
            type: NonTickerMovementType.DIVESTMENT,
            amount: amt,
            units: rawShares && rawShares > 0 ? cleanFloatNoise(rawShares) : undefined,
            unitPrice: rawPrice && rawPrice > 0 ? cleanFloatNoise(rawPrice) : undefined,
            fee: rawFee > 0 ? cleanFloatNoise(rawFee) : undefined,
            notes: rawDescription || (titleName ? `Disinvestimento / Vendita: ${titleName}` : 'Trading / Vendita titoli'),
            importProvider: this.id,
            rawType,
            rawRow: row
          };
          totalInflows = cleanFloatNoise(totalInflows + amt);
        } else {
          // Acquisto / Investimento (Flusso in uscita)
          itemPayload = {
            externalId: rawTxId,
            date,
            type: NonTickerMovementType.INVESTMENT,
            amount: amt,
            units: rawShares && rawShares > 0 ? cleanFloatNoise(rawShares) : undefined,
            unitPrice: rawPrice && rawPrice > 0 ? cleanFloatNoise(rawPrice) : undefined,
            fee: rawFee > 0 ? cleanFloatNoise(rawFee) : undefined,
            notes: rawDescription || (titleName ? `Investimento / Acquisto: ${titleName}` : 'Trading / Acquisto titoli'),
            importProvider: this.id,
            rawType,
            rawRow: row
          };
          totalOutflows = cleanFloatNoise(totalOutflows + amt);
        }

      } else if (rawType === 'INTEREST_PAYMENT') {
        // Regola calcolo interessi e ritenute:
        // amount = interesse lordo
        // tax = tassa trattenuta/pagata (con segno negativo nel file)
        // netto = amount + tax
        const grossReturn = cleanFloatNoise(Math.abs(rawAmount));
        const taxPaid = cleanFloatNoise(Math.abs(rawTax));
        const netReturn = cleanFloatNoise(grossReturn - taxPaid);

        itemPayload = {
          externalId: rawTxId,
          date,
          type: NonTickerMovementType.RETURN,
          grossReturn,
          taxAmount: taxPaid,
          netReturn,
          isReinvested: true, // Gli interessi su Trade Republic vengono accreditati sul saldo
          notes: rawDescription || 'Interessi maturati liquidità remunerata Trade Republic',
          importProvider: this.id,
          rawType,
          rawRow: row
        };

        totalGrossReturns = cleanFloatNoise(totalGrossReturns + grossReturn);
        totalTaxes = cleanFloatNoise(totalTaxes + taxPaid);
        totalNetReturns = cleanFloatNoise(totalNetReturns + netReturn);

      } else if (
        rawType === 'TRANSFER_INSTANT_INBOUND' ||
        rawType === 'TRANSFER_INBOUND' ||
        rawType === 'TRANSFER_SEPA_INBOUND' ||
        rawType === 'INBOUND_TRANSFER'
      ) {
        // Bonifico in entrata (versamento di liquidità)
        const amt = cleanFloatNoise(Math.abs(rawAmount));
        itemPayload = {
          externalId: rawTxId,
          date,
          type: NonTickerMovementType.DEPOSIT,
          amount: amt,
          fee: rawFee > 0 ? cleanFloatNoise(rawFee) : undefined,
          notes: rawDescription || (counterparty ? `Bonifico in entrata da ${counterparty}` : 'Bonifico in entrata'),
          importProvider: this.id,
          rawType,
          rawRow: row
        };
        totalInflows = cleanFloatNoise(totalInflows + amt);

      } else if (
        rawType === 'TRANSFER_INSTANT_OUTBOUND' ||
        rawType === 'TRANSFER_OUTBOUND' ||
        rawType === 'TRANSFER_SEPA_OUTBOUND' ||
        rawType === 'OUTBOUND_TRANSFER'
      ) {
        // Bonifico in uscita (prelievo di liquidità)
        const amt = cleanFloatNoise(Math.abs(rawAmount));
        itemPayload = {
          externalId: rawTxId,
          date,
          type: NonTickerMovementType.WITHDRAWAL,
          amount: amt,
          fee: rawFee > 0 ? cleanFloatNoise(rawFee) : undefined,
          notes: rawDescription || (counterparty ? `Bonifico in uscita verso ${counterparty}` : 'Bonifico in uscita'),
          importProvider: this.id,
          rawType,
          rawRow: row
        };
        totalOutflows = cleanFloatNoise(totalOutflows + amt);

      } else if (rawType === 'CARD_TRANSACTION') {
        // Pagamento con carta (prelievo/spesa)
        const amt = cleanFloatNoise(Math.abs(rawAmount));
        itemPayload = {
          externalId: rawTxId,
          date,
          type: NonTickerMovementType.CARD_SPEND,
          amount: amt,
          notes: rawDescription || row['name'] || 'Transazione Carta di Debito Trade Republic',
          importProvider: this.id,
          rawType,
          rawRow: row
        };
        totalOutflows = cleanFloatNoise(totalOutflows + amt);

      } else if (rawType === 'CARD_REFUND' || rawType === 'CARD_TRANSACTION_REFUND') {
        // Rimborso spesa carta (entrata)
        const amt = cleanFloatNoise(Math.abs(rawAmount));
        itemPayload = {
          externalId: rawTxId,
          date,
          type: NonTickerMovementType.OTHER_INFLOW,
          amount: amt,
          notes: rawDescription || 'Rimborso spesa carta Trade Republic',
          importProvider: this.id,
          rawType,
          rawRow: row
        };
        totalInflows = cleanFloatNoise(totalInflows + amt);

      } else if (rawType === 'BENEFITS_SAVEBACK') {
        // Reward Saveback (accredito/flusso in entrata)
        const amt = cleanFloatNoise(Math.abs(rawAmount));
        itemPayload = {
          externalId: rawTxId,
          date,
          type: NonTickerMovementType.CASHBACK,
          amount: amt,
          notes: rawDescription || 'Saveback Reward Trade Republic',
          importProvider: this.id,
          rawType,
          rawRow: row
        };
        totalInflows = cleanFloatNoise(totalInflows + amt);

      } else if (rawType === 'BENEFITS_ROUNDUP') {
        // Reward o arrotondamento
        const amt = cleanFloatNoise(Math.abs(rawAmount));
        const isNegative = rawAmount < 0;
        itemPayload = {
          externalId: rawTxId,
          date,
          type: isNegative ? NonTickerMovementType.OTHER_OUTFLOW : NonTickerMovementType.CASHBACK,
          amount: amt,
          notes: rawDescription || 'Round up Trade Republic',
          importProvider: this.id,
          rawType,
          rawRow: row
        };
        if (isNegative) totalOutflows = cleanFloatNoise(totalOutflows + amt);
        else totalInflows = cleanFloatNoise(totalInflows + amt);

      } else if (rawType === 'FEE' || rawType === 'CUSTODY_FEE' || rawType === 'SUBSCRIPTION_FEE') {
        const amt = cleanFloatNoise(Math.abs(rawAmount));
        itemPayload = {
          externalId: rawTxId,
          date,
          type: NonTickerMovementType.FEE,
          amount: amt,
          notes: rawDescription || 'Canone / Commissione di servizio Trade Republic',
          importProvider: this.id,
          rawType,
          rawRow: row
        };
        totalOutflows = cleanFloatNoise(totalOutflows + amt);

      } else {
        // Tipologia non direttamente gestita o ignota
        isSupported = false;
        skipReason = `Tipologia '${rawType || 'SCONOSCIUTA'}' non supportata per il conto liquidità.`;
      }

      if (!isSupported || !itemPayload) {
        items.push({
          rowIndex,
          status: 'SKIPPED',
          statusReason: skipReason || 'Movimento ignorato',
          rawText: JSON.stringify(row)
        });
        skippedCount++;
        continue;
      }

      // Verifica DEDUPLICAZIONE con il database esistente
      const isAlreadyInDb = existingExternalIds.has(txIdLower);

      if (isAlreadyInDb) {
        items.push({
          rowIndex,
          status: 'DUPLICATE',
          statusReason: `Movimento già registrato nel database (ID: ${rawTxId})`,
          item: itemPayload as NonTickerImportItem,
          rawText: JSON.stringify(row)
        });
        duplicateCount++;
      } else {
        items.push({
          rowIndex,
          status: 'VALID',
          item: itemPayload as NonTickerImportItem,
          rawText: JSON.stringify(row)
        });
        validCount++;
      }
    }

    return {
      providerId: this.id,
      providerName: this.name,
      fileName,
      totalRows: rows.length,
      validCount,
      duplicateCount,
      skippedCount,
      errorCount,
      items,
      summary: {
        totalGrossReturns,
        totalTaxes,
        totalNetReturns,
        totalInflows,
        totalOutflows,
        currency: detectedCurrency,
        dateRange: minDate && maxDate ? { start: minDate, end: maxDate } : undefined
      },
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }
}
