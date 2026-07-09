const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const tableStart = `                  <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950/40">
                    <table className="w-full text-left border-collapse text-xs select-text">`;

const replacement = `                  <>
                  <div className="hidden lg:block overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950/40">
                    <table className="w-full text-left border-collapse text-xs select-text">`;

content = content.replace(tableStart, replacement);

const tableEnd = `                    </table>
                  </div>
                )}
              </div>`;

const cardLayout = `                    </table>
                  </div>
                  
                  {/* Mobile Cards View */}
                  <div className="lg:hidden space-y-4">
                    {getProcessedTransactions().map((tx) => {
                      const port = db.portfolios.find(p => p.id === tx.portfolioId);
                      const isBuy = tx.type === TransactionType.BUY;
                      const latestPriceObj = getLatestPriceInfo(tx.symbol);
                      return (
                        <div key={tx.id} className="bg-slate-900/40 border border-slate-800/80 p-4 rounded-xl space-y-3">
                          <div className="flex justify-between items-start border-b border-slate-800/60 pb-3">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className={\`px-2 py-0.5 rounded-lg font-black text-[9px] uppercase tracking-wider \${
                                  isBuy ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                }\`}>
                                  {tx.type}
                                </span>
                                <span className="text-white font-black uppercase tracking-wider">{tx.symbol}</span>
                              </div>
                              <div className="text-xs text-slate-400">{formatDateString(tx.date, lang, true)}</div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => { setTxForm({ ...tx, open: true, editId: tx.id }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="p-1.5 bg-slate-800 text-slate-300 rounded hover:bg-emerald-600 hover:text-white transition">
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleDeleteTransaction(tx.id)} className="p-1.5 bg-slate-800 text-slate-300 rounded hover:bg-rose-600 hover:text-white transition">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
                            <div>
                              <span className="block text-[10px] text-slate-500 uppercase tracking-widest">{t.portfolioLabel || 'Portfolio'}</span>
                              <span className="text-white font-bold">{port?.name || 'Incompleto'}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] text-slate-500 uppercase tracking-widest">{t.qtyLabel}</span>
                              <span className="text-slate-300 font-bold">{tx.qty.toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] text-slate-500 uppercase tracking-widest">{t.priceLabel}</span>
                              <span className="text-slate-300 font-bold">{formatCurrency(convertValue(tx.price, tx.currency || 'EUR', selectedCurrency, tx.date), selectedCurrency)}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] text-slate-500 uppercase tracking-widest">Tot.</span>
                              <span className="text-slate-300 font-bold">{formatCurrency(convertValue(tx.price * tx.qty, tx.currency || 'EUR', selectedCurrency, tx.date), selectedCurrency)}</span>
                            </div>
                            {latestPriceObj && (
                              <div className="col-span-2 pt-2 mt-1 border-t border-slate-800/40">
                                <span className="block text-[10px] text-slate-500 uppercase tracking-widest">Valore Att.</span>
                                <span className="text-emerald-400 font-black">{formatCurrency(convertValue(tx.qty * latestPriceObj.price, tx.currency || 'EUR', selectedCurrency, todayStr), selectedCurrency)}</span>
                                <span className="ml-2 text-[9px] text-slate-400">({formatCurrency(latestPriceObj.price, tx.currency || 'EUR')})</span>
                              </div>
                            )}
                            {tx.commission > 0 && (
                              <div className="col-span-2 pt-1">
                                <span className="block text-[10px] text-slate-500 uppercase tracking-widest">{t.commissionLabel}</span>
                                <span className="text-rose-400 font-mono">{formatCurrency(convertValue(tx.commission, tx.currency || 'EUR', selectedCurrency, tx.date), selectedCurrency)}</span>
                              </div>
                            )}
                            {tx.notes && (
                              <div className="col-span-2 pt-1 text-[10px] text-slate-500 italic">
                                {tx.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  </>
                )}
              </div>`;

content = content.replace(tableEnd, cardLayout);

fs.writeFileSync('src/App.tsx', content);
