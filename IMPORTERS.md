# GainBusters — Guida all'Architettura Importer per Attività senza Ticker

Questo documento descrive l'architettura modulare ed estendibile per l'importazione di movimenti finanziari da provider ed estratti conto esterni (ad es. Trade Republic, Scalable Capital, Directa, ecc.) destinati alla sezione **"Attività senza ticker" (Liquidità remunerata, Fondi Pensione, TFR, Polizze)**.

---

## 1. Principi Architetturali

1. **Modularità e Separazione delle Responsabilità**:
   - Ogni istituto finanziario o formato dati possiede un proprio modulo autonomo.
   - Nessun importer modifica la logica interna dell'applicazione né le altre aree di GainBusters (Broker/Transazioni con ticker/FIFO).

2. **Idempotenza e Deduplicazione**:
   - Ogni movimento importato è identificato in modo univoco dal proprio `externalId` (es. `transaction_id` per Trade Republic).
   - Re-importare lo stesso file o un file con movimenti parzialmente già presenti non crea mai duplicati: i movimenti già registrati vengono identificati e ignorati.

3. **Integrità Finanziaria**:
   - Calcolo rigoroso di imponibile, ritenuta fiscale e rendimento netto.
   - Per Trade Republic (`INTEREST_PAYMENT`): `amount` è l'interesse lordo, `tax` è l'imposta trattenuta (con segno negativo), e il valore netto registrato è:
     $$\text{netto} = \text{amount} + \text{tax}$$

4. **Persistenza Atomica**:
   - Il salvataggio avviene in un'unica transazione atomica tramite `saveDatabaseState(db)`, garantendo la coerenza tra memoria, IndexedDB e filesystem.

---

## 2. Struttura del Sottosistema (`/src/importers/`)

```
src/importers/
├── types.ts                                # Contratti e interfacce TypeScript comuni
├── csvHelper.ts                            # Parser CSV RFC-4180 conforme, helper numerici e date
├── registry.ts                             # Registry centralizzato e motore di auto-rilevamento
├── index.ts                                # Re-export del modulo
└── tradeRepublic/
    └── TradeRepublicCsvImporter.ts         # Implementazione specifica per Trade Republic (CSV)
```

---

## 3. Il Contratto `NonTickerImporter`

Ogni nuovo provider deve implementare l'interfaccia `NonTickerImporter` definita in `src/importers/types.ts`:

```typescript
export interface NonTickerImporter {
  readonly id: string;                     // Es: 'scalable_capital'
  readonly name: string;                   // Es: 'Scalable Capital'
  readonly supportedExtensions: string[];  // Es: ['.csv', '.xlsx']
  readonly supportedFormats: string[];     // Es: ['CSV']
  readonly description: string;            // Descrizione per la UI

  detect(rawContent: string | ArrayBuffer, fileName: string): Promise<ImporterDetectionResult> | ImporterDetectionResult;

  parse(rawContent: string | ArrayBuffer, fileName: string, options: ImportOptions): Promise<ImportParsedResult> | ImportParsedResult;
}
```

---

## 4. Come Aggiungere un Nuovo Provider (es. Scalable Capital)

Per aggiungere un nuovo provider in 3 semplici passaggi:

### Passo 1: Crea la cartella e la classe del provider
Crea `/src/importers/scalableCapital/ScalableCapitalCsvImporter.ts`:

```typescript
import { NonTickerImporter, ImporterDetectionResult, ImportParsedResult, ImportOptions } from '../types.ts';
import { NonTickerMovementType } from '../../types.ts';
import { parseCsvToObjects, parseCsvNumber, normalizeCsvDate } from '../csvHelper.ts';

export class ScalableCapitalCsvImporter implements NonTickerImporter {
  public readonly id = 'scalable_capital';
  public readonly name = 'Scalable Capital';
  public readonly supportedExtensions = ['.csv'];
  public readonly supportedFormats = ['CSV'];
  public readonly description = 'Importatore CSV movimenti conto Scalable Capital';

  public detect(rawContent: string | ArrayBuffer, fileName: string): ImporterDetectionResult {
    if (typeof rawContent !== 'string') return { canHandle: false, confidence: 0, providerId: this.id, providerName: this.name, format: 'CSV' };
    const firstLine = rawContent.split(/\r\n|\n|\r/)[0].toLowerCase();
    
    // Verifica le intestazioni tipiche del provider
    if (firstLine.includes('booking_date') && firstLine.includes('reference_id')) {
      return { canHandle: true, confidence: 1.0, providerId: this.id, providerName: this.name, format: 'CSV' };
    }
    return { canHandle: false, confidence: 0, providerId: this.id, providerName: this.name, format: 'CSV' };
  }

  public parse(rawContent: string | ArrayBuffer, fileName: string, options: ImportOptions): ImportParsedResult {
    // 1. Parsing del CSV
    // 2. Controllo deduplicazione su options.existingMovements
    // 3. Normalizzazione dei tipi di movimento (DEPOSIT, WITHDRAWAL, RETURN)
    // 4. Restituzione dell'oggetto ImportParsedResult
  }
}
```

### Passo 2: Registra il provider nel Registry
In `/src/importers/registry.ts`:

```typescript
import { ScalableCapitalCsvImporter } from './scalableCapital/ScalableCapitalCsvImporter.ts';

class ImporterRegistry {
  constructor() {
    this.register(new TradeRepublicCsvImporter());
    this.register(new ScalableCapitalCsvImporter()); // <-- Aggiungi qui
  }
}
```

### Passo 3: Esporta in `/src/importers/index.ts`
```typescript
export * from './scalableCapital/ScalableCapitalCsvImporter.ts';
```

---

## 5. Mappatura Movimenti Trade Republic (Specifica Tecnica)

Il file CSV generato da Trade Republic viene mappato secondo lo standard delle **Attività senza ticker**:

| Categoria / Tipo CSV | Direzione | Tipo Movimento GainBusters | Note / Dati Estratti |
| :--- | :--- | :--- | :--- |
| `category: TRADING` & `type: BUY` (o importo negativo) | Flusso Uscita (-) | `INVESTMENT` (Investimento / Acquisto Titoli) | Estrae importo, quote (`shares`), prezzo (`price`) e commissioni (`fee`). |
| `category: TRADING` & `type: SELL` (o importo positivo) | Flusso Entrata (+) | `DIVESTMENT` (Disinvestimento / Vendita Titoli) | Estrae importo, quote (`shares`), prezzo (`price`) e commissioni (`fee`). |
| `type: INTEREST_PAYMENT` | Rendimento | `RETURN` (Rendimento / Rivalutazione) | `grossReturn = abs(amount)`, `taxAmount = abs(tax)`, `netReturn = grossReturn - taxAmount`. `isReinvested = true`. |
| `type: TRANSFER_*_INBOUND` | Flusso Entrata (+) | `DEPOSIT` (Versamento / Deposito) | Bonifico in entrata sul conto liquidità. |
| `type: TRANSFER_*_OUTBOUND` | Flusso Uscita (-) | `WITHDRAWAL` (Prelievo / Riscatto) | Bonifico in uscita verso conto corrente esterno. |
| `type: CARD_TRANSACTION` | Flusso Uscita (-) | `CARD_SPEND` (Spesa con Carta) | Pagamento con carta di debito Trade Republic. |
| `type: CARD_REFUND` / `CARD_TRANSACTION_REFUND` | Flusso Entrata (+) | `OTHER_INFLOW` (Altro Flusso in Entrata) | Storno o rimborso su carta. |
| `type: BENEFITS_SAVEBACK` | Flusso Entrata (+) | `CASHBACK` (Cashback / Saveback / Bonus) | Accredito bonus o saveback. |
| `type: BENEFITS_ROUNDUP` | In/Out | `OTHER_OUTFLOW` / `CASHBACK` | Arrotondamento investito o bonus accumulato. |
| `type: FEE` / `CUSTODY_FEE` | Flusso Uscita (-) | `FEE` (Canone / Spese di Gestione) | Oneri o costi fissi del conto. |
