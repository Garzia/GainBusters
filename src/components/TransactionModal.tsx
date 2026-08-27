import React from 'react';
import { X, Coins } from 'lucide-react';
import { DBState, TransactionType, TranslationDictionary } from '../types';
import { TickerInput } from './TickerInput';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  txForm: {
    open: boolean;
    editId: string | null;
    portfolioId: string;
    date: string;
    type: TransactionType;
    symbol: string;
    qty: number | string;
    price: number | string;
    commission: number | string;
    currency: string;
    commissionCurrency: string;
    notes: string;
  };
  setTxForm: React.Dispatch<React.SetStateAction<any>>;
  onSave: () => void;
  formErr: string;
  db: DBState;
  t: TranslationDictionary;
  activeCurrencies: string[];
  lang?: string;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  txForm,
  setTxForm,
  onSave,
  formErr,
  db,
  t,
  activeCurrencies,
  lang = 'it'
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-6 sm:pt-12 md:pt-16 bg-slate-950/80 backdrop-blur-sm overflow-y-auto animate-fade-in" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl max-w-2xl w-full my-4 space-y-4 relative">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-emerald-400" />
            <h3 className="font-extrabold text-base text-white">
              {txForm.editId
                ? `${t.allOption === 'Tutti' ? 'Modifica Operazione' : t.allOption === 'Todos' ? 'Modificar Operación' : t.allOption === 'Tous' ? 'Modifier la Transaction' : t.allOption === '全部' ? '修改交易记录' : 'Edit Transaction'} ${txForm.symbol}`
                : t.registerNewTransactionTitle}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Portfolio Selector Dropdown */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-slate-400 font-semibold">{t.belongingPortfolioLabel}</label>
            <select
              value={txForm.portfolioId}
              onChange={(e) => {
                const portId = e.target.value;
                const selectedP = db.portfolios.find(p => p.id === portId);
                const selectedAcc = selectedP ? db.accounts.find(a => a.id === selectedP.accountId) : null;
                const brokerCurr = selectedAcc?.currency || db.settings.defaultCurrency || 'EUR';
                setTxForm({
                  ...txForm,
                  portfolioId: portId,
                  currency: brokerCurr,
                  commissionCurrency: brokerCurr
                });
              }}
              className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/80 px-3 py-2 text-white rounded-xl w-full font-sans font-bold transition-all duration-300"
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

          <div className="space-y-1.5">
            <label className="text-slate-400 font-semibold">{t.dateLabel}</label>
            <input
              type="datetime-local"
              value={txForm.date}
              onChange={(e) => setTxForm({ ...txForm, date: e.target.value })}
              className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/80 px-3 py-2 text-white rounded-xl w-full font-mono transition-all duration-300"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-slate-400 font-semibold">{t.transactionTypeLabel}</label>
            <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 border border-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => setTxForm({ ...txForm, type: TransactionType.BUY })}
                className={`py-1.5 rounded-lg font-bold text-xs transition duration-300 cursor-pointer ${
                  txForm.type === TransactionType.BUY ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                {t.buyBtn}
              </button>
              <button
                type="button"
                onClick={() => setTxForm({ ...txForm, type: TransactionType.SELL })}
                className={`py-1.5 rounded-lg font-bold text-xs transition duration-300 cursor-pointer ${
                  txForm.type === TransactionType.SELL ? 'bg-rose-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                {t.sellBtn}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-slate-400 font-semibold">{t.tickerLabel}</label>
            <TickerInput
              value={txForm.symbol}
              onChange={(val) => setTxForm({ ...txForm, symbol: val.toUpperCase() })}
              placeholder={t.allOption === 'Tutti' ? 'VWCE.MI o VAGF.MI o BTC' : 'VWCE.MI / BTC'}
              className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/80 px-3 py-2 text-white rounded-xl w-full font-mono uppercase transition-all duration-300"
              portfolioSymbols={Array.from(new Set(db.transactions.map(t => t.symbol)))}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-slate-400 font-semibold">{t.qtyLabel}</label>
            <input
              type="number"
              step="any"
              value={txForm.qty ?? ''}
              onChange={(e) => setTxForm({ ...txForm, qty: e.target.value })}
              className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/80 px-3 py-2 text-white rounded-xl w-full font-mono transition-all duration-300"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1.5">
              <label className="text-slate-400 font-semibold">{t.priceLabel}</label>
              <input
                type="number"
                step="any"
                value={txForm.price ?? ''}
                onChange={(e) => setTxForm({ ...txForm, price: e.target.value })}
                className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/80 px-3 py-2 text-white rounded-xl w-full font-mono transition-all duration-300"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-slate-400 font-semibold">{t.currencyLabel}</label>
              <select
                value={txForm.currency}
                onChange={(e) => setTxForm({ ...txForm, currency: e.target.value })}
                className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/80 px-2.5 py-2 text-white rounded-xl w-full font-mono transition-all text-xs"
              >
                {activeCurrencies.map(cur => (
                  <option key={cur} value={cur}>{cur}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1.5">
              <label className="text-slate-400 font-semibold">{t.commissionLabel}</label>
              <input
                type="number"
                step="any"
                value={txForm.commission ?? ''}
                onChange={(e) => setTxForm({ ...txForm, commission: e.target.value })}
                className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/80 px-3 py-2 text-white rounded-xl w-full font-mono transition-all duration-300"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-slate-400 font-semibold">{t.commissionCurrencyLabel}</label>
              <select
                value={txForm.commissionCurrency}
                onChange={(e) => setTxForm({ ...txForm, commissionCurrency: e.target.value })}
                className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/80 px-2.5 py-2 text-white rounded-xl w-full font-mono transition-all text-xs"
              >
                {activeCurrencies.map(cur => (
                  <option key={cur} value={cur}>{cur}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label className="text-slate-400 font-semibold">{t.notesLabel}</label>
            <input
              type="text"
              value={txForm.notes}
              onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })}
              placeholder={t.notesPlaceholder}
              className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/80 px-3 py-2 text-white rounded-xl w-full transition-all duration-300"
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
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-xl font-bold font-sans transition-all duration-300 transform hover:-translate-y-0.5 cursor-pointer shadow-lg shadow-emerald-950/20"
          >
            {t.saveTransactionBtn}
          </button>
        </div>
      </div>
    </div>
  );
};
