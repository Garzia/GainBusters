/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Formats a date string beautifully based on the active language.
 * - zh: YYYY/MM/DD
 * - en: MM/DD/YYYY
 * - it, es, fr, ar: DD/MM/YYYY
 */
export function formatDateString(
  dateValue: string | Date | undefined,
  lang: string,
  includeTime = false
): string {
  if (!dateValue) return '';
  let d: Date;

  if (dateValue instanceof Date) {
    d = dateValue;
  } else {
    const rawStr = String(dateValue).trim();
    if (rawStr.length === 10 && rawStr.includes('-')) {
      const parts = rawStr.split('-');
      // Parse YYYY-MM-DD as local date safely
      d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    } else {
      d = new Date(rawStr);
    }
  }

  if (isNaN(d.getTime())) {
    return typeof dateValue === 'string' ? dateValue : '';
  }

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  let formattedDate = `${day}/${month}/${year}`;
  if (lang === 'zh') {
    formattedDate = `${year}/${month}/${day}`;
  } else if (lang === 'en') {
    formattedDate = `${month}/${day}/${year}`;
  }

  if (includeTime) {
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${formattedDate} ${hours}:${minutes}`;
  }
  return formattedDate;
}
