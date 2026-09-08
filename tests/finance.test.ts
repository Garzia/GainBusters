import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateHoldingsAndLots,
  calculateInvestedCapital,
  calculateFinancialMetrics
} from '../src/utils/finance.ts';
import { Transaction, TransactionType, Currency } from '../src/types.ts';

describe('Financial Engine - High-Precision Decimal & Total Invested Tests', () => {
  const identityConvert = (amount: number) => amount;
  const mockGetPrice = () => 100;
  const mockGetTickerCurrency = () => 'EUR';

  it('1. should preserve exact decimal places for crypto micro-quantities in Total Invested', () => {
    // 0.000015 BTC purchased at 65,000 EUR
    const transactions: Transaction[] = [
      {
        id: 'tx-btc-1',
        portfolioId: 'port-1',
        date: '2025-01-01T10:00:00.000Z',
        type: TransactionType.BUY,
        symbol: 'BTC',
        qty: 0.000015,
        price: 65000,
        commission: 0,
        currency: 'EUR',
        commissionCurrency: 'EUR',
        notes: ''
      }
    ];

    const { tickerHoldings } = calculateHoldingsAndLots(
      transactions,
      ['port-1'],
      identityConvert,
      'EUR'
    );

    assert.equal(tickerHoldings['BTC'].sharesOwned, 0.000015);
    // 0.000015 * 65000 = 0.975 EUR
    assert.equal(tickerHoldings['BTC'].totalCapitalInvested, 0.975);
    assert.equal(tickerHoldings['BTC'].pmc, 65000);
  });

  it('2. should handle fractional transfers with ASSET commissions accurately', () => {
    // Buy 1 BTC at 50,000 EUR in Binance
    // Transfer 0.4 BTC to Ledger with 0.000015 BTC asset commission deducted
    const transactions: Transaction[] = [
      {
        id: 'tx-buy-binance',
        portfolioId: 'port-binance',
        date: '2025-01-01T10:00:00.000Z',
        type: TransactionType.BUY,
        symbol: 'BTC',
        qty: 1,
        price: 50000,
        commission: 0,
        currency: 'EUR',
        commissionCurrency: 'EUR',
        notes: ''
      },
      {
        id: 'tx-out-binance',
        transferId: 'tr-1',
        portfolioId: 'port-binance',
        date: '2025-02-01T10:00:00.000Z',
        type: TransactionType.TRANSFER_OUT,
        symbol: 'BTC',
        qty: 0.4,
        price: 50000,
        commission: 0.000015,
        commissionPaymentMode: 'ASSET',
        currency: 'EUR',
        commissionCurrency: 'BTC',
        parentTransactionId: 'tx-buy-binance',
        transferInTransactionId: 'tx-in-ledger',
        notes: ''
      },
      {
        id: 'tx-in-ledger',
        transferId: 'tr-1',
        portfolioId: 'port-ledger',
        date: '2025-02-01T10:00:00.000Z',
        type: TransactionType.TRANSFER_IN,
        symbol: 'BTC',
        qty: 0.399985, // 0.4 - 0.000015 fee
        price: 50000,
        originalBuyPrice: 50000,
        originalBuyDate: '2025-01-01T10:00:00.000Z',
        commission: 0,
        commissionPaymentMode: 'EXTERNAL',
        currency: 'EUR',
        commissionCurrency: 'EUR',
        parentTransactionId: 'tx-buy-binance',
        transferOutTransactionId: 'tx-out-binance',
        notes: ''
      }
    ];

    // Check individual portfolios
    const binanceHoldings = calculateHoldingsAndLots(
      transactions,
      ['port-binance'],
      identityConvert,
      'EUR'
    ).tickerHoldings;

    // Binance remaining: 1 - 0.4 = 0.6 BTC
    assert.equal(binanceHoldings['BTC'].sharesOwned, 0.6);
    assert.equal(binanceHoldings['BTC'].totalCapitalInvested, 30000);

    const ledgerHoldings = calculateHoldingsAndLots(
      transactions,
      ['port-ledger'],
      identityConvert,
      'EUR'
    ).tickerHoldings;

    // Ledger received: 0.399985 BTC
    assert.equal(ledgerHoldings['BTC'].sharesOwned, 0.399985);
    // 0.399985 * 50000 = 19999.25
    assert.equal(ledgerHoldings['BTC'].totalCapitalInvested, 19999.25);

    // Global combined view
    const globalMetrics = calculateFinancialMetrics(
      transactions,
      ['port-binance', 'port-ledger'],
      [],
      false,
      'EUR',
      identityConvert,
      mockGetPrice,
      mockGetTickerCurrency,
      '2025-02-02',
      '2025-02-01'
    );

    // Global shares = 0.6 + 0.399985 = 0.999985
    assert.equal(globalMetrics.tickerMetrics['BTC'].sharesOwned, 0.999985);
    // Global total invested = 30000 + 19999.25 = 49999.25
    assert.equal(globalMetrics.totalCapitalInvested, 49999.25);
  });

  it('3. should handle high-precision fractional shares without rounding errors', () => {
    // 123.45678901 shares at 12.345678 EUR
    const transactions: Transaction[] = [
      {
        id: 'tx-frac-1',
        portfolioId: 'port-1',
        date: '2025-01-01T10:00:00.000Z',
        type: TransactionType.BUY,
        symbol: 'FRACT',
        qty: 123.45678901,
        price: 12.345678,
        commission: 0,
        currency: 'EUR',
        commissionCurrency: 'EUR',
        notes: ''
      }
    ];

    const { tickerHoldings } = calculateHoldingsAndLots(
      transactions,
      ['port-1'],
      identityConvert,
      'EUR'
    );

    const expectedInvested = 123.45678901 * 12.345678;
    assert.equal(tickerHoldings['FRACT'].sharesOwned, 123.45678901);
    assert.equal(tickerHoldings['FRACT'].totalCapitalInvested, expectedInvested);
  });
});
