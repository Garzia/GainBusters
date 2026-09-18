/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Helper robusto per il parsing di file CSV (RFC 4180 compliant).
 * Gestisce:
 * - Campi racchiusi da virgolette con virgole o ritorni a capo interni
 * - Escape delle virgolette doppie ("")
 * - Delimitatori virgola (,) o punto e virgola (;)
 * - Rimozione del BOM UTF-8
 * - Normalizzazione numerica e delle date
 */

/**
 * Parsa una stringa CSV in una matrice di stringhe (righe x colonne).
 */
export function parseCsvToMatrix(csvText: string, customDelimiter?: string): string[][] {
  if (!csvText) return [];

  // Rimuovi eventuale BOM UTF-8
  let cleanText = csvText;
  if (cleanText.charCodeAt(0) === 0xfeff) {
    cleanText = cleanText.substring(1);
  }

  // Rileva delimitatore dalla prima riga se non specificato
  const delimiter = customDelimiter || detectCsvDelimiter(cleanText);

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;
  const len = cleanText.length;

  while (i < len) {
    const char = cleanText[i];
    const nextChar = i + 1 < len ? cleanText[i + 1] : null;

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Virgoletta escapata ("")
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Fine campo quotato
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === delimiter) {
        currentRow.push(currentField);
        currentField = '';
        i++;
        continue;
      } else if (char === '\r') {
        if (nextChar === '\n') {
          i += 2;
        } else {
          i++;
        }
        currentRow.push(currentField);
        currentField = '';
        if (currentRow.length > 0 && currentRow.some(f => f.trim() !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        continue;
      } else if (char === '\n') {
        currentRow.push(currentField);
        currentField = '';
        if (currentRow.length > 0 && currentRow.some(f => f.trim() !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  // Ultimo campo / riga se il file non finisce con newline
  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some(f => f.trim() !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Rileva il delimitatore (, o ;) analizzando le prime righe del CSV.
 */
export function detectCsvDelimiter(text: string): string {
  const firstLine = text.split(/\r\n|\n|\r/)[0] || '';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;

  if (semicolonCount > commaCount && semicolonCount > tabCount) return ';';
  if (tabCount > commaCount && tabCount > semicolonCount) return '\t';
  return ',';
}

/**
 * Parsa un CSV in un array di oggetti riga basati sulle intestazioni della prima riga.
 */
export function parseCsvToObjects(csvText: string): { headers: string[]; rows: Record<string, string>[] } {
  const matrix = parseCsvToMatrix(csvText);
  if (matrix.length === 0) {
    return { headers: [], rows: [] };
  }

  const rawHeaders = matrix[0];
  const headers = rawHeaders.map(h => h.trim().toLowerCase().replace(/^["']|["']$/g, ''));

  const rows: Record<string, string>[] = [];

  for (let r = 1; r < matrix.length; r++) {
    const rowValues = matrix[r];
    const rowObj: Record<string, string> = {};
    let hasData = false;

    for (let c = 0; c < headers.length; c++) {
      const headerKey = headers[c];
      const val = (rowValues[c] !== undefined ? rowValues[c] : '').trim();
      rowObj[headerKey] = val;
      if (val !== '') hasData = true;
    }

    if (hasData) {
      rows.push(rowObj);
    }
  }

  return { headers, rows };
}

/**
 * Parsa in modo sicuro una stringa numerica da CSV (supporta sia '11.77' sia '11,77', numeri negativi e spazi).
 */
export function parseCsvNumber(val: string | undefined | null): number {
  if (val === undefined || val === null) return 0;
  let str = String(val).trim();
  if (!str) return 0;

  // Rimuovi eventuali simboli di valuta e apici
  str = str.replace(/[€$£]/g, '').trim();

  // Se contiene sia '.' che ',' (es. 1.234,56 o 1,234.56)
  if (str.includes('.') && str.includes(',')) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      // Formato europeo: 1.234,56 -> 1234.56
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // Formato US con virgole per migliaia: 1,234.56 -> 1234.56
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    // Solo virgola (es: '11,77')
    str = str.replace(',', '.');
  }

  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * Normalizza una data ISO (da stringhe tipo '2026-09-01T12:32:52.239808Z' o '2026-09-01' o '01/09/2026')
 * in formato standard YYYY-MM-DD.
 */
export function normalizeCsvDate(val: string | undefined | null): string {
  if (!val) return '';
  const str = String(val).trim();

  // Se già ISO 'YYYY-MM-DD...'
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.substring(0, 10);
  }

  // Se 'DD/MM/YYYY' o 'DD-MM-YYYY'
  const matchDmy = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (matchDmy) {
    const day = matchDmy[1].padStart(2, '0');
    const month = matchDmy[2].padStart(2, '0');
    const year = matchDmy[3];
    return `${year}-${month}-${day}`;
  }

  // Fallback con Date.parse
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return d.toISOString().substring(0, 10);
    }
  } catch (e) {
    // ignore
  }

  return str.substring(0, 10);
}
