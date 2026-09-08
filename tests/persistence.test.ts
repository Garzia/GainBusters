import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { storageService } from '../src/services/storageService.ts';
import { DBState, TransactionType, Currency } from '../src/types.ts';

// Mock Web Crypto API for Node environment if needed
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = globalThis;
}

const mockInitialDb: DBState = {
  settings: {
    theme: 'dark',
    defaultCurrency: 'EUR',
    lang: 'it',
    activeCurrencies: ['EUR', 'USD'],
    selectedInflationId: 'NIC',
    inflationIndices: [],
    passwordSet: true
  },
  accounts: [
    { id: 'acc-1', name: 'Broker Direct', currency: Currency.EUR, includeInDashboard: true }
  ],
  portfolios: [
    { id: 'port-1', accountId: 'acc-1', name: 'Main Portfolio', includeInDashboard: true }
  ],
  transactions: [
    {
      id: 'tx-1',
      portfolioId: 'port-1',
      date: '2025-01-15T10:00:00.000Z',
      type: TransactionType.BUY,
      symbol: 'VWCE',
      qty: 10,
      price: 100,
      commission: 2,
      currency: Currency.EUR,
      commissionCurrency: 'EUR',
      notes: 'Initial buy'
    }
  ],
  transfers: [],
  otherCosts: [],
  priceCache: {}
};

describe('Persistence Architecture - StorageService Regression Tests', () => {
  before(() => {
    // Setup clean mock localStorage for Node testing environment
    const storageMap = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (key: string) => storageMap.get(key) || null,
      setItem: (key: string, value: string) => storageMap.set(key, value),
      removeItem: (key: string) => storageMap.delete(key),
      clear: () => storageMap.clear()
    };
  });

  it('1. should persist and load state correctly in browser Mode with encryption', async () => {
    storageService.setStorageMode('browser');
    const masterPass = 'secretPass123!';
    storageService.setBrowserPassword(masterPass);

    const testDb: DBState = {
      ...mockInitialDb,
      accounts: [...mockInitialDb.accounts, { id: 'acc-2', name: 'Secondary Broker', currency: Currency.USD, includeInDashboard: true }]
    };

    // Execute atomic save
    await storageService.saveDatabaseState(testDb);

    // Load state back
    const loadedDb = await storageService.loadDatabaseState(masterPass);

    assert.notEqual(loadedDb, null, 'Loaded state should not be null');
    assert.equal(loadedDb?.accounts.length, 2, 'Accounts count should match updated state');
    assert.equal(loadedDb?.accounts[1].name, 'Secondary Broker');
  });

  it('2. should handle rapid consecutive save calls atomically via the Write Queue', async () => {
    storageService.setStorageMode('browser');
    const masterPass = 'queueTestPass!';
    storageService.setBrowserPassword(masterPass);

    const states: DBState[] = [];
    for (let i = 1; i <= 5; i++) {
      states.push({
        ...mockInitialDb,
        transactions: [
          ...mockInitialDb.transactions,
          {
            id: `tx-queue-${i}`,
            portfolioId: 'port-1',
            date: new Date().toISOString(),
            type: TransactionType.BUY,
            symbol: 'AAPL',
            qty: i * 5,
            price: 150,
            commission: 0,
            currency: Currency.USD,
            notes: `Test tx ${i}`
          }
        ]
      });
    }

    // Fire 5 saves in rapid succession without waiting
    const savePromises = states.map(s => storageService.saveDatabaseState(s));

    // Wait for all to resolve cleanly
    await Promise.all(savePromises);

    // Load state and verify it matches the FINAL state (iteration 5)
    const finalLoadedDb = await storageService.loadDatabaseState(masterPass);
    assert.notEqual(finalLoadedDb, null);
    const addedTx = finalLoadedDb?.transactions.find(t => t.id === 'tx-queue-5');
    assert.notEqual(addedTx, undefined, 'Final transaction tx-queue-5 must be saved');
    assert.equal(addedTx?.qty, 25, 'Final transaction qty must be 25');
  });

  it('3. should support mock FileSystemHandle with write stream serialization without errors', async () => {
    storageService.setStorageMode('browser');
    const masterPass = 'fileHandleTestPass!';
    storageService.setBrowserPassword(masterPass);

    let writtenContent = '';
    let isStreamOpen = false;

    // Mock FileSystemFileHandle
    const mockFileHandle = {
      name: 'gainbusters_db.json',
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      createWritable: async () => {
        if (isStreamOpen) {
          throw new Error('InvalidStateError: An ongoing write operation is in progress');
        }
        isStreamOpen = true;
        return {
          write: async (content: string) => {
            writtenContent = content;
          },
          close: async () => {
            isStreamOpen = false;
          }
        };
      },
      getFile: async () => ({
        text: async () => writtenContent
      })
    };

    storageService.setFileHandle(mockFileHandle as any);

    const testDb: DBState = {
      ...mockInitialDb,
      transfers: [
        {
          id: 'tr-1',
          date: '2025-02-01T12:00:00.000Z',
          symbol: 'VWCE',
          qty: 5,
          sourcePortfolioId: 'port-1',
          destPortfolioId: 'port-2',
          criteria: 'FIFO'
        }
      ]
    };

    // Save with mock file handle
    await storageService.saveDatabaseState(testDb);

    // Verify content was written to mock stream
    assert.ok(writtenContent.length > 0, 'Encrypted content should be written to file stream');

    // Load back from file handle
    const loadedDb = await storageService.loadDatabaseState(masterPass);
    assert.notEqual(loadedDb, null);
    assert.equal(loadedDb?.transfers.length, 1);
    assert.equal(loadedDb?.transfers[0].id, 'tr-1');
  });
});
