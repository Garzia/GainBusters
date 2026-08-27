import React from 'react';
import { X, RefreshCw } from 'lucide-react';
import { DBState, TranslationDictionary } from '../types';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  transferForm: {
    open: boolean;
    editTransferId?: string | null;
    sourcePortfolioId: string;
    destPortfolioId: string;
    symbol: string;
    qty: number | string;
    price: number | string;
    priceCurrency: string;
    sourceCommission: number | string;
    sourceCommissionCurrency: string;
    destCommission: number | string;
    destCommissionCurrency: string;
    date: string;
    criteria: 'FIFO' | 'LIFO';
    notes: string;
  };
  setTransferForm: React.Dispatch<React.SetStateAction<any>>;
  onSave: () => void;
  formErr: string;
  db: DBState;
  t: TranslationDictionary;
  activeCurrencies: string[];
  getAvailableTickersForSource: (srcPortId: string) => string[];
  getAvailableLots: (symbol: string, portfolioId: string, excludeTransferId?: string | null) => any[];
  formatFullQuantity: (val: number | string) => string;
  lang?: string;
}

export const TransferModal: React.FC<TransferModalProps> = ({
  isOpen,
  onClose,
  transferForm,
  setTransferForm,
  onSave,
  formErr,
  db,
  t,
  activeCurrencies,
  getAvailableTickersForSource,
  getAvailableLots,
  formatFullQuantity,
  lang = 'it'
}) => {
  if (!isOpen) return null;

  const maxAvailable = transferForm.sourcePortfolioId && transferForm.symbol
    ? getAvailableLots(transferForm.symbol, transferForm.sourcePortfolioId, transferForm.editTransferId).reduce((sum, l) => sum + l.availableQty, 0)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-6 sm:pt-12 md:pt-16 bg-slate-950/80 backdrop-blur-sm overflow-y-auto animate-fade-in" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-6 shadow-2xl max-w-2xl w-full my-4 space-y-4 relative overflow-hidden">
        <div className="absolute right-0 top-0 -translate-y-6 translate-x-6 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="font-extrabold text-base text-white tracking-wide">
                {transferForm.editTransferId ? t.editTransferModalTitle : t.newTransferModalTitle}
              </h3>
              <span className="text-[10px] text-amber-500 font-mono font-bold tracking-widest uppercase">
                {t.internalAssetMovement}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label={t.closeLabel}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Source Portfolio */}
          <div className="space-y-1.5">
            <label className="text-slate-400 font-semibold">{t.sourcePortfolioLabel}</label>
            <select
              value={transferForm.sourcePortfolioId}
              disabled={Boolean(transferForm.editTransferId)}
              onChange={(e) => {
                const srcPortId = e.target.value;
                const availSymbols = getAvailableTickersForSource(srcPortId);
                const defaultSym = availSymbols[0] || '';
                const lots = getAvailableLots(defaultSym, srcPortId);
                const total = lots.reduce((sum, l) => sum + l.availableQty, 0);
                const srcPort = db.portfolios.find(p => p.id === srcPortId);
                const srcAcc = srcPort ? db.accounts.find(a => a.id === srcPort.accountId) : null;
                const srcCurr = srcAcc?.currency || db.settings.defaultCurrency || 'EUR';

                setTransferForm({
                  ...transferForm,
                  sourcePortfolioId: srcPortId,
                  symbol: defaultSym,
                  qty: total > 0 ? total : '',
                  priceCurrency: srcCurr,
                  sourceCommissionCurrency: srcCurr
                });
              }}
              className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/80 px-3 py-2 text-white rounded-xl w-full font-sans font-bold transition-all duration-300 disabled:opacity-50"
            >
              <option value="">{t.selectPortfolioOptionPlaceholder}</option>
              {db.portfolios.map((p) => {
                const acc = db.accounts.find(a => a.id === p.accountId);
                return (
                  <option key={p.id} value={p.id}>
                    {p.name} ({acc?.name || t.withoutBrokerOption})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Destination Portfolio */}
          <div className="space-y-1.5">
            <label className="text-slate-400 font-semibold">{t.destPortfolioLabel}</label>
            <select
              value={transferForm.destPortfolioId}
              disabled={Boolean(transferForm.editTransferId)}
              onChange={(e) => {
                const dstPortId = e.target.value;
                const dstPort = db.portfolios.find(p => p.id === dstPortId);
                const dstAcc = dstPort ? db.accounts.find(a => a.id === dstPort.accountId) : null;
                const dstCurr = dstAcc?.currency || db.settings.defaultCurrency || 'EUR';
                setTransferForm({
                  ...transferForm,
                  destPortfolioId: dstPortId,
                  destCommissionCurrency: dstCurr
                });
              }}
              className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/80 px-3 py-2 text-white rounded-xl w-full font-sans font-bold transition-all duration-300 disabled:opacity-50"
            >
              <option value="">{t.selectPortfolioOptionPlaceholder}</option>
              {db.portfolios
                .filter(p => p.id !== transferForm.sourcePortfolioId)
                .map((p) => {
                  const acc = db.accounts.find(a => a.id === p.accountId);
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name} ({acc?.name || t.withoutBrokerOption})
                    </option>
                  );
                })}
            </select>
          </div>

          {/* Symbol */}
          <div className="space-y-1.5">
            <label className="text-slate-400 font-semibold">{t.tickerLabel}</label>
            <select
              value={transferForm.symbol}
              disabled={Boolean(transferForm.editTransferId)}
              onChange={(e) => {
                const sym = e.target.value;
                const lots = getAvailableLots(sym, transferForm.sourcePortfolioId);
                const total = lots.reduce((sum, l) => sum + l.availableQty, 0);
                setTransferForm({
                  ...transferForm,
                  symbol: sym,
                  qty: total > 0 ? total : ''
                });
              }}
              className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/80 px-3 py-2 text-white rounded-xl w-full font-mono font-bold transition-all duration-300 disabled:opacity-50"
            >
              <option value="">{t.selectAssetTickerLabel || 'Seleziona Asset'}</option>
              {getAvailableTickersForSource(transferForm.sourcePortfolioId).map((sym) => (
                <option key={sym} value={sym}>{sym}</option>
              ))}
            </select>
          </div>

          {/* Quantity */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-slate-400 font-semibold">{t.transferQtyLabel}</label>
              {!transferForm.editTransferId && transferForm.sourcePortfolioId && transferForm.symbol && (
                <button
                  type="button"
                  onClick={() => setTransferForm({ ...transferForm, qty: maxAvailable })}
                  className="text-[10px] text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-1.5 py-0.5 rounded font-mono font-bold transition-colors cursor-pointer"
                  title="Click per impostare la quantità massima"
                >
                  Max: {formatFullQuantity(maxAvailable)}
                </button>
              )}
            </div>
            <input
              type="number"
              step="any"
              value={transferForm.qty ?? ''}
              onChange={(e) => setTransferForm({ ...transferForm, qty: e.target.value })}
              className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/80 px-3 py-2 text-white rounded-xl w-full font-mono transition-all duration-300"
            />
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <label className="text-slate-400 font-semibold">{t.transferDateLabel}</label>
            <input
              type="datetime-local"
              value={transferForm.date}
              onChange={(e) => setTransferForm({ ...transferForm, date: e.target.value })}
              className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/80 px-3 py-2 text-white rounded-xl w-full font-mono transition-all duration-300"
            />
          </div>

          {/* Criteria */}
          <div className="space-y-1.5">
            <label className="text-slate-400 font-semibold">{t.lotSelectionCriteria}</label>
            <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 border border-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => setTransferForm({ ...transferForm, criteria: 'FIFO' })}
                className={`py-1.5 rounded-lg font-bold text-xs transition duration-300 cursor-pointer ${
                  transferForm.criteria === 'FIFO' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                FIFO
              </button>
              <button
                type="button"
                onClick={() => setTransferForm({ ...transferForm, criteria: 'LIFO' })}
                className={`py-1.5 rounded-lg font-bold text-xs transition duration-300 cursor-pointer ${
                  transferForm.criteria === 'LIFO' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                LIFO
              </button>
            </div>
          </div>

          {/* Unit Price & Price Currency */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1.5">
              <label className="text-slate-400 font-semibold">{t.transferUnitPriceLabel || 'Prezzo Unitario / PMC'}</label>
              <input
                type="number"
                step="any"
                placeholder={t.originalPmcOptional || 'PMC originario (opzionale)'}
                value={transferForm.price ?? ''}
                onChange={(e) => setTransferForm({ ...transferForm, price: e.target.value })}
                className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/80 px-3 py-2 text-white rounded-xl w-full font-mono transition-all duration-300"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-slate-400 font-semibold">{t.currencyLabel}</label>
              <select
                value={transferForm.priceCurrency || 'EUR'}
                onChange={(e) => setTransferForm({ ...transferForm, priceCurrency: e.target.value })}
                className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/80 px-2 py-2 text-white rounded-xl w-full font-mono transition-all text-xs"
              >
                {activeCurrencies.map(cur => (
                  <option key={cur} value={cur}>{cur}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Source Commission & Currency */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1.5">
              <label className="text-slate-400 font-semibold">{t.sourceCommissionLabel || 'Comm. Uscita (Sorgente)'}</label>
              <input
                type="number"
                step="any"
                value={transferForm.sourceCommission ?? ''}
                onChange={(e) => setTransferForm({ ...transferForm, sourceCommission: e.target.value })}
                className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/80 px-3 py-2 text-white rounded-xl w-full font-mono transition-all duration-300"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-slate-400 font-semibold">{t.commissionCurrencyLabel || 'Valuta'}</label>
              <select
                value={transferForm.sourceCommissionCurrency || 'EUR'}
                onChange={(e) => setTransferForm({ ...transferForm, sourceCommissionCurrency: e.target.value })}
                className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/80 px-2 py-2 text-white rounded-xl w-full font-mono transition-all text-xs"
              >
                {activeCurrencies.map(cur => (
                  <option key={cur} value={cur}>{cur}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Dest Commission & Currency */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1.5">
              <label className="text-slate-400 font-semibold">{t.destCommissionLabel || 'Comm. Entrata (Destinazione)'}</label>
              <input
                type="number"
                step="any"
                value={transferForm.destCommission ?? ''}
                onChange={(e) => setTransferForm({ ...transferForm, destCommission: e.target.value })}
                className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/80 px-3 py-2 text-white rounded-xl w-full font-mono transition-all duration-300"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-slate-400 font-semibold">{t.commissionCurrencyLabel || 'Valuta'}</label>
              <select
                value={transferForm.destCommissionCurrency || 'EUR'}
                onChange={(e) => setTransferForm({ ...transferForm, destCommissionCurrency: e.target.value })}
                className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/80 px-2 py-2 text-white rounded-xl w-full font-mono transition-all text-xs"
              >
                {activeCurrencies.map(cur => (
                  <option key={cur} value={cur}>{cur}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-slate-400 font-semibold">{t.notesLabel}</label>
            <input
              type="text"
              value={transferForm.notes}
              onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
              placeholder={t.notesPlaceholder}
              className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/80 px-3 py-2 text-white rounded-xl w-full transition-all duration-300"
            />
          </div>
        </div>

        {formErr && (
          <div className="bg-rose-950/20 text-rose-400 p-3 text-xs rounded-xl border border-rose-500/15 font-mono select-text">
            {formErr}
          </div>
        )}

        <div className="flex gap-2 justify-end text-xs pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl font-bold transition-all duration-300 cursor-pointer"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={onSave}
            className="bg-amber-600 hover:bg-amber-500 text-white px-5 py-2 rounded-xl font-bold font-sans transition-all duration-300 transform hover:-translate-y-0.5 cursor-pointer shadow-lg shadow-amber-950/20"
          >
            {t.saveTransactionBtn}
          </button>
        </div>
      </div>
    </div>
  );
};
