/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Registro centrale (Registry) per gli importer di attività senza ticker.
 * Gestisce la registrazione estendibile dei provider e l'auto-rilevamento intelligente dei formati.
 */

import {
  NonTickerImporter,
  ImporterDetectionResult
} from './types.ts';
import { TradeRepublicCsvImporter } from './tradeRepublic/TradeRepublicCsvImporter.ts';

class ImporterRegistry {
  private importers: Map<string, NonTickerImporter> = new Map();

  constructor() {
    // Registra i provider di default
    this.register(new TradeRepublicCsvImporter());
  }

  /**
   * Registra un nuovo importer nel registry.
   */
  public register(importer: NonTickerImporter): void {
    this.importers.set(importer.id.toLowerCase(), importer);
  }

  /**
   * Restituisce tutti gli importer registrati.
   */
  public getAll(): NonTickerImporter[] {
    return Array.from(this.importers.values());
  }

  /**
   * Recupera uno specifico importer per ID.
   */
  public getById(id: string): NonTickerImporter | undefined {
    return this.importers.get(id.toLowerCase());
  }

  /**
   * Esegue l'auto-rilevamento su tutti gli importer registrati per individuare il provider compatibile
   * con il più alto punteggio di confidenza.
   */
  public async detectBest(
    rawContent: string | ArrayBuffer,
    fileName: string
  ): Promise<{ importer: NonTickerImporter; detection: ImporterDetectionResult } | null> {
    let bestMatch: { importer: NonTickerImporter; detection: ImporterDetectionResult } | null = null;
    let highestConfidence = 0;

    for (const importer of this.importers.values()) {
      try {
        const detection = await Promise.resolve(importer.detect(rawContent, fileName));
        if (detection.canHandle && detection.confidence > highestConfidence) {
          highestConfidence = detection.confidence;
          bestMatch = { importer, detection };
        }
      } catch (err) {
        console.warn(`Errore durante il rilevamento dell'importer ${importer.name}:`, err);
      }
    }

    return bestMatch;
  }
}

// Istanza Singleton globale
export const importerRegistry = new ImporterRegistry();

/**
 * Funzioni di utilità per accedere al registry.
 */
export function registerImporter(importer: NonTickerImporter): void {
  importerRegistry.register(importer);
}

export function getAllImporters(): NonTickerImporter[] {
  return importerRegistry.getAll();
}

export function getImporterById(id: string): NonTickerImporter | undefined {
  return importerRegistry.getById(id);
}

export async function detectBestImporter(
  rawContent: string | ArrayBuffer,
  fileName: string
): Promise<{ importer: NonTickerImporter; detection: ImporterDetectionResult } | null> {
  return importerRegistry.detectBest(rawContent, fileName);
}
