import React, { useState } from 'react';
import { X, Coins, HelpCircle, BookOpen } from 'lucide-react';
import { DBState, TransactionType, TranslationDictionary } from '../types';
import { TickerInput } from './TickerInput';
import { ModalPortal } from './ModalPortal';

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
  const [showTickerGuide, setShowTickerGuide] = useState(false);

  if (!isOpen) return null;

  return (
    <ModalPortal isOpen={isOpen}>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-hidden animate-fade-in"
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xl max-w-2xl w-full max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col relative overflow-hidden my-auto">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
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

          <div className="overflow-y-auto py-2 pr-1 space-y-4 custom-scrollbar flex-1 min-h-0">
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
            <div className="flex items-center justify-between gap-1">
              <label className="text-slate-400 font-semibold">{t.tickerLabel}</label>
              <button
                type="button"
                onClick={() => setShowTickerGuide(!showTickerGuide)}
                className={`inline-flex items-center gap-1.5 text-[11px] font-medium transition-all px-2 py-0.5 rounded-md cursor-pointer select-none border ${
                  showTickerGuide
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                    : 'bg-slate-850 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 border-slate-700/60'
                }`}
                aria-expanded={showTickerGuide}
                title="Guida al formato del Ticker, piazze e recupero quotazioni"
              >
                <HelpCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>{showTickerGuide ? 'Nascondi Guida' : 'Guida Ticker'}</span>
              </button>
            </div>

            <TickerInput
              value={txForm.symbol}
              onChange={(val) => setTxForm({ ...txForm, symbol: val.toUpperCase() })}
              placeholder={t.allOption === 'Tutti' ? 'VWCE.MI o VAGF.MI o BTC' : 'VWCE.MI / BTC'}
              className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/80 px-3 py-2 text-white rounded-xl w-full font-mono uppercase transition-all duration-300"
              portfolioSymbols={Array.from(new Set(db.transactions.map(t => t.symbol)))}
            />

            <div className="flex items-center justify-between text-[10px] text-slate-500 px-1 pt-0.5">
              <span>
                Esempi: <button type="button" onClick={() => setTxForm((f: any) => ({ ...f, symbol: 'VWCE.MI' }))} className="text-slate-400 hover:text-emerald-400 underline decoration-slate-700 cursor-pointer">VWCE.MI</button>, <button type="button" onClick={() => setTxForm((f: any) => ({ ...f, symbol: 'SWDA.MI' }))} className="text-slate-400 hover:text-emerald-400 underline decoration-slate-700 cursor-pointer">SWDA.MI</button>, <button type="button" onClick={() => setTxForm((f: any) => ({ ...f, symbol: 'BTC-EUR' }))} className="text-slate-400 hover:text-emerald-400 underline decoration-slate-700 cursor-pointer">BTC-EUR</button>
              </span>
              <span className="text-slate-400 font-mono hidden sm:inline">Milano: .MI</span>
            </div>
          </div>

          {/* Cognitive-ergonomic informational note */}
          {showTickerGuide && (
            <div className="md:col-span-2 bg-slate-950/90 border border-emerald-500/30 rounded-2xl p-4 text-xs space-y-3 shadow-2xl backdrop-blur-md animate-fade-in text-slate-300">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="font-bold text-white text-xs tracking-wide">
                    Guida Ticker & Recupero Quotazioni
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTickerGuide(false)}
                  className="text-slate-400 hover:text-white text-[11px] font-medium px-2 py-0.5 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  ✕ Chiudi
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* 1. Origine dei Valori */}
                <div className="bg-slate-900/70 p-3 rounded-xl border border-slate-800/80 space-y-1">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[11px]">
                    <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-black">1</span>
                    Origine dei Valori
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Le serie storiche e i prezzi di chiusura sono recuperati in tempo reale tramite <strong className="text-white">Yahoo Finance</strong>. Per le criptovalute, in caso di mancata risposta, è attivo un fallback automatico su <strong className="text-white">Binance</strong>.
                  </p>
                </div>

                {/* 2. Come va scritto il Ticker */}
                <div className="bg-slate-900/70 p-3 rounded-xl border border-slate-800/80 space-y-1">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[11px]">
                    <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-black">2</span>
                    Come Scrivere il Ticker
                  </div>
                  <ul className="text-[11px] text-slate-300 space-y-1 leading-relaxed">
                    <li>• <strong className="text-white">Azioni USA</strong>: simbolo diretto (es. <code className="bg-slate-800 px-1 py-0.5 rounded text-amber-300">AAPL</code>, <code className="bg-slate-800 px-1 py-0.5 rounded text-amber-300">NVDA</code>, <code className="bg-slate-800 px-1 py-0.5 rounded text-amber-300">MSFT</code>).</li>
                    <li>• <strong className="text-white">ETF & Azioni UE</strong>: <code className="bg-slate-800 px-1 py-0.5 rounded text-emerald-300">SIMBOLO.PIAZZA</code> (es. <code className="bg-slate-800 px-1 py-0.5 rounded text-emerald-300">VWCE.MI</code>, <code className="bg-slate-800 px-1 py-0.5 rounded text-emerald-300">SWDA.MI</code>).</li>
                    <li>• <strong className="text-white">Crypto</strong>: ticker con valuta o diretto (es. <code className="bg-slate-800 px-1 py-0.5 rounded text-cyan-300">BTC-EUR</code> o <code className="bg-slate-800 px-1 py-0.5 rounded text-cyan-300">BTC</code>).</li>
                  </ul>
                </div>

                {/* 3. Come funziona il fallback */}
                <div className="bg-slate-900/70 p-3 rounded-xl border border-slate-800/80 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[11px]">
                    <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-black">3</span>
                    Fallback Automatico (senza suffisso)
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Se inserisci il solo ticker base (es. <code className="bg-slate-800 px-1 rounded text-amber-300">SWDA</code>), il sistema prova automaticamente nell'ordine:
                  </p>
                  <div className="flex items-center gap-1 text-[10px] font-mono text-slate-300 pt-0.5">
                    <span className="bg-slate-800/90 px-1.5 py-0.5 rounded border border-slate-700">1º Diretto</span>
                    <span className="text-slate-500">→</span>
                    <span className="bg-emerald-950/60 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-800/60">2º .MI (Milano)</span>
                    <span className="text-slate-500">→</span>
                    <span className="bg-amber-950/60 text-amber-300 px-1.5 py-0.5 rounded border border-amber-800/60">3º .DE (Xetra)</span>
                  </div>
                  <p className="text-[10px] text-slate-400 italic">
                    Per eliminare qualsiasi ambiguità, è sempre consigliato specificare il suffisso corretto.
                  </p>
                </div>

                {/* 4. Mini nota formativa sul perché dei suffissi */}
                <div className="bg-slate-900/70 p-3 rounded-xl border border-slate-800/80 space-y-1">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[11px]">
                    <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-black">4</span>
                    Perché i suffissi (.MI, .DE, .PA, .L)?
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Gli stessi titoli/ETF sono scambiati su più borse europee con valute, orari di contrattazione e volumi differenti:
                  </p>
                  <div className="grid grid-cols-2 gap-1 text-[10px] font-mono text-slate-300 pt-0.5">
                    <div><strong className="text-emerald-400">.MI</strong>: Borsa Italiana (Milano)</div>
                    <div><strong className="text-amber-400">.DE</strong>: Xetra (Francoforte)</div>
                    <div><strong className="text-sky-400">.PA</strong>: Euronext Parigi</div>
                    <div><strong className="text-purple-400">.L</strong>: London Stock Ex.</div>
                  </div>
                  <p className="text-[10px] text-slate-400 italic pt-0.5">
                    Usare la borsa del proprio broker assicura che il prezzo e la valuta coincidano con l'eseguito contabile.
                  </p>
                </div>
              </div>
            </div>
          )}

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
      </div>

        <div className="flex gap-2 justify-end text-xs pt-3 border-t border-slate-800 shrink-0">
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
    </ModalPortal>
  );
};
