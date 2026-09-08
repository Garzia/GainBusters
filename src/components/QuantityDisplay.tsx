import React from 'react';
import { formatQuantityParts } from '../utils/formatters';

interface QuantityDisplayProps {
  value: number | string | undefined | null;
  className?: string;
  assetSymbol?: string;
  titlePrefix?: string;
  maxDecimals?: number;
  id?: string;
}

/**
 * Standardized High-Precision Quantity Component
 * Displays up to `maxDecimals` (default 8) in normal view.
 * If truncated/abbreviated, renders native tooltip (hover) with the exact full precision value.
 */
export const QuantityDisplay: React.FC<QuantityDisplayProps> = ({
  value,
  className = '',
  assetSymbol,
  titlePrefix,
  maxDecimals = 8,
  id
}) => {
  const { display, full, isAbbreviated } = formatQuantityParts(value, maxDecimals);
  const symbolSuffix = assetSymbol ? ` ${assetSymbol}` : '';
  const tooltip = isAbbreviated
    ? (titlePrefix ? `${titlePrefix}: ${full}${symbolSuffix}` : `${full}${symbolSuffix}`)
    : undefined;

  return (
    <span
      id={id}
      className={`${className} ${isAbbreviated ? 'cursor-help border-b border-dotted border-slate-500/40' : ''}`}
      title={tooltip}
    >
      {display}{symbolSuffix}
    </span>
  );
};
