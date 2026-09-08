import { cleanFloatNoise } from './finance';

/**
 * High-Precision Quantity & Value Formatters
 *
 * Enforces absolute separation between calculation precision and UI presentation:
 * - Data & Financial Calculations: Maximum floating-point precision (no rounding).
 * - Standard UI Presentation: Up to 8 decimal digits.
 * - Tooltip / Hover: Full precision available in the raw data without micro float artifacts.
 */

export function formatFullQuantity(val: number | string | undefined | null): string {
  if (val === null || val === undefined || val === '') return '0';
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!isNaN(Number(trimmed)) && !trimmed.toLowerCase().includes('e')) {
      const cleanNum = cleanFloatNoise(Number(trimmed));
      const cleanStr = cleanNum.toString();
      const parts = cleanStr.split('.');
      if (parts.length === 2) {
        const intPart = parts[0].replace(/^0+(?=\d)/, '') || '0';
        const fracPart = parts[1].replace(/0+$/, '');
        return fracPart.length > 0 ? `${intPart}.${fracPart}` : intPart;
      }
      return cleanStr.replace(/^0+(?=\d)/, '') || '0';
    }
  }

  const rawNum = Number(val);
  if (isNaN(rawNum)) return '0';
  if (rawNum === 0) return '0';

  const num = cleanFloatNoise(rawNum);

  // Handle exponential notation if present (e.g. 1e-7, 1e-8)
  const str = num.toString();
  if (str.includes('e') || str.includes('E')) {
    const [coefficientStr, exponentStr] = str.toLowerCase().split('e');
    const exponent = parseInt(exponentStr, 10);
    const [intPart, fracPart = ''] = coefficientStr.split('.');
    if (exponent < 0) {
      const leadingZeros = '0'.repeat(Math.abs(exponent) - 1);
      const res = `0.${leadingZeros}${intPart}${fracPart}`.replace(/0+$/, '');
      return res;
    } else {
      const neededZeros = exponent - fracPart.length;
      if (neededZeros >= 0) {
        return `${intPart}${fracPart}${'0'.repeat(neededZeros)}`;
      } else {
        const intPortion = `${intPart}${fracPart.slice(0, exponent)}`;
        const fracPortion = fracPart.slice(exponent);
        return `${intPortion}.${fracPortion}`.replace(/0+$/, '');
      }
    }
  }

  if (str.includes('.')) {
    return str.replace(/0+$/, '').replace(/\.$/, '');
  }
  return str;
}

export interface FormattedQuantityResult {
  display: string;
  full: string;
  isAbbreviated: boolean;
}

export function formatQuantityParts(
  val: number | string | undefined | null,
  maxDecimals: number = 8
): FormattedQuantityResult {
  const full = formatFullQuantity(val);
  const num = Number(val);
  if (isNaN(num) || num === 0) {
    return { display: '0', full: '0', isAbbreviated: false };
  }

  const parts = full.split('.');
  if (parts.length === 1) {
    return { display: full, full, isAbbreviated: false };
  }

  const [, fracPart] = parts;
  if (fracPart.length <= maxDecimals) {
    return { display: full, full, isAbbreviated: false };
  }

  // Truncate/round to maxDecimals for standard display
  const factor = Math.pow(10, maxDecimals);
  const roundedNum = Math.round(num * factor) / factor;
  let display = formatFullQuantity(roundedNum);

  const displayParts = display.split('.');
  if (displayParts.length === 2 && displayParts[1].length > maxDecimals) {
    display = `${displayParts[0]}.${displayParts[1].slice(0, maxDecimals)}`.replace(/0+$/, '').replace(/\.$/, '');
  }

  const isAbbreviated = display !== full;
  return { display, full, isAbbreviated };
}

export function formatDisplayQuantity(
  val: number | string | undefined | null,
  maxDecimals: number = 8
): string {
  return formatQuantityParts(val, maxDecimals).display;
}
