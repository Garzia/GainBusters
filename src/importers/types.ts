/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Contratto e definizioni TypeScript per il sottosistema modulare di importazione
 * per le "Attività senza ticker" (Non-Ticker Assets).
 */

import { NonTickerMovement, NonTickerMovementType } from '../types.ts';

/**
 * Singolo elemento normalizzato prodotto da un importer.
 */
export interface NonTickerImportItem {
  externalId: string; // Identificativo univoco di transazione del provider per deduplicazione (idempotenza)
  date: string; // Formato standard YYYY-MM-DD (o ISO timestamp)
  type: NonTickerMovementType | string;
  amount?: number;
  valuation?: number;
  grossReturn?: number;
  taxAmount?: number;
  netReturn?: number;
  isReinvested?: boolean;
  units?: number;
  unitPrice?: number;
  fee?: number;
  notes?: string;
  importProvider: string; // Es. 'TRADE_REPUBLIC', 'SCALABLE_CAPITAL'
  rawType?: string;
  rawRow?: Record<string, string>;
}

/**
 * Risultato dell'elaborazione di una singola riga di file.
 */
export type ImportItemStatus = 'VALID' | 'DUPLICATE' | 'SKIPPED' | 'ERROR';

export interface ImportItemResult {
  rowIndex: number;
  status: ImportItemStatus;
  statusReason?: string;
  item?: NonTickerImportItem;
  rawText?: string;
}

/**
 * Riepilogo aggregato dell'analisi di un file di importazione.
 */
export interface ImportParsedResult {
  providerId: string;
  providerName: string;
  fileName: string;
  totalRows: number;
  validCount: number;
  duplicateCount: number;
  skippedCount: number;
  errorCount: number;
  items: ImportItemResult[];
  summary: {
    totalGrossReturns: number;
    totalTaxes: number;
    totalNetReturns: number;
    totalInflows: number;
    totalOutflows: number;
    currency?: string;
    dateRange?: { start: string; end: string };
  };
  warnings?: string[];
}

/**
 * Esito dell'auto-rilevamento dell'importer per un determinato file.
 */
export interface ImporterDetectionResult {
  canHandle: boolean;
  confidence: number; // Valore tra 0 (nessuna corrispondenza) e 1 (corrispondenza certa)
  providerId: string;
  providerName: string;
  format: 'CSV' | 'XLSX' | 'JSON' | 'OTHER';
  reason?: string;
}

/**
 * Opzioni passate all'importer durante il parsing.
 */
export interface ImportOptions {
  entityId: string;
  existingMovements: NonTickerMovement[];
  defaultCurrency?: string;
}

/**
 * Interfaccia comune (contratto) che OGNI importer deve implementare.
 */
export interface NonTickerImporter {
  readonly id: string; // Identificativo univoco del provider (es: 'trade_republic')
  readonly name: string; // Nome descrittivo (es: 'Trade Republic')
  readonly supportedExtensions: string[]; // Es: ['.csv']
  readonly supportedFormats: string[]; // Es: ['CSV']
  readonly description: string; // Breve descrizione tecnica dell'importer

  /**
   * Determina se l'importer è in grado di gestire il file fornito analizzandone l'intestazione/struttura.
   */
  detect(rawContent: string | ArrayBuffer, fileName: string): Promise<ImporterDetectionResult> | ImporterDetectionResult;

  /**
   * Effettua il parsing, la normalizzazione e la deduplicazione dei movimenti.
   */
  parse(rawContent: string | ArrayBuffer, fileName: string, options: ImportOptions): Promise<ImportParsedResult> | ImportParsedResult;
}
