import React, { useRef } from 'react';
import { RefreshCw, Plus, Edit, Trash2, ArrowRight, Download, Upload } from 'lucide-react';
import { TranslationDictionary, Transfer } from '../types';

export interface TransferRecord {
  id: string;
  date: string;
  symbol: string;
  qty: number;
  price?: number;
  priceCurrency?: string;
  sourcePortfolioId: string;
  sourcePortfolioName: string;
  sourceBrokerName: string;
  destPortfolioId: string;
  destPortfolioName: string;
  destBrokerName: string;
  sourceCommission: number;
  sourceCommissionCurrency: string;
  destCommission: number;
  destCommissionCurrency: string;
  criteria: 'FIFO' | 'LIFO';
  notes: string;
  childCount?: number;
  childLotsSummary?: string;
  txOutId?: string;
  txInId?: string;
}

interface TransfersTableProps {
  transfers: TransferRecord[];
  onNewTransfer: () => void;
  onEdit: (record: TransferRecord) => void;
  onDelete: (record: TransferRecord) => void;
  t: TranslationDictionary;
  formatDateString: (dateStr: string, lang?: string, withTime?: boolean) => string;
  formatFullQuantity: (val: number | string) => string;
  formatCurrency: (val: number, cur: string) => string;
  lang?: string;
  onImportTransfers?: (importedTransfers: Transfer[]) => void;
  dbTransfersRaw?: Transfer[];
}

export const TransfersTable: React.FC<TransfersTableProps> = ({
  transfers,
  onNewTransfer,
  onEdit,
  onDelete,
  t,
  formatDateString,
  formatFullQuantity,
  formatCurrency,
  lang = 'it',
  onImportTransfers,
  dbTransfersRaw
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportJSON = () => {
    const exportList = dbTransfersRaw && dbTransfersRaw.length > 0
      ? dbTransfersRaw
      : transfers.map(t => ({
          id: t.id,
          date: t.date,
          symbol: t.symbol,
          qty: t.qty,
          price: t.price,
          priceCurrency: t.priceCurrency,
          sourcePortfolioId: t.sourcePortfolioId,
          destPortfolioId: t.destPortfolioId,
          sourceCommission: t.sourceCommission,
          sourceCommissionCurrency: t.sourceCommissionCurrency,
          destCommission: t.destCommission,
          destCommissionCurrency: t.destCommissionCurrency,
          criteria: t.criteria,
          notes: t.notes
        }));

    const dataStr = JSON.stringify({ transfers: exportList, exportDate: new Date().toISOString() }, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileName = `gainbusters_transfers_${new Date().toISOString().split('T')[0]}.json`;
    const link = document.createElement('a');
    link.setAttribute('href', dataUri);
    link.setAttribute('download', exportFileName);
    link.click();
  };

  const handleExportCSV = () => {
    const headers = [
      'ID',
      'Data',
      'Ticker',
      'Quantita',
      'Sorgente_ID',
      'Sorgente_Nome',
      'Destinazione_ID',
      'Destinazione_Nome',
      'Prezzo_PMC',
      'Valuta_Prezzo',
      'Comm_Uscita',
      'Valuta_Comm_Uscita',
      'Comm_Entrata',
      'Valuta_Comm_Entrata',
      'Criterio',
      'Note'
    ];
    const rows = transfers.map(r => [
      r.id,
      r.date,
      r.symbol,
      r.qty,
      r.sourcePortfolioId,
      `"${(r.sourcePortfolioName || '').replace(/"/g, '""')}"`,
      r.destPortfolioId,
      `"${(r.destPortfolioName || '').replace(/"/g, '""')}"`,
      r.price || '',
      r.priceCurrency || 'EUR',
      r.sourceCommission || 0,
      r.sourceCommissionCurrency || 'EUR',
      r.destCommission || 0,
      r.destCommissionCurrency || 'EUR',
      r.criteria,
      `"${(r.notes || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `gainbusters_transfers_${new Date().toISOString().split('T')[0]}.csv`);
    link.click();
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        if (!content) return;

        let transfersToImport: Transfer[] = [];

        if (file.name.endsWith('.csv')) {
          const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
          if (lines.length > 1) {
            for (let i = 1; i < lines.length; i++) {
              const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());
              if (cols.length >= 5) {
                const date = cols[1] || new Date().toISOString();
                const symbol = (cols[2] || '').toUpperCase();
                const qty = parseFloat(cols[3]) || 0;
                const srcPortId = cols[4] || '';
                const dstPortId = cols[6] || '';
                if (symbol && qty > 0 && srcPortId && dstPortId) {
                  transfersToImport.push({
                    id: cols[0] || `tr_${Date.now()}_${i}`,
                    date,
                    symbol,
                    qty,
                    sourcePortfolioId: srcPortId,
                    destPortfolioId: dstPortId,
                    price: parseFloat(cols[8]) || undefined,
                    priceCurrency: cols[9] || 'EUR',
                    sourceCommission: parseFloat(cols[10]) || 0,
                    sourceCommissionCurrency: cols[11] || 'EUR',
                    destCommission: parseFloat(cols[12]) || 0,
                    destCommissionCurrency: cols[13] || 'EUR',
                    criteria: (cols[14] === 'LIFO' ? 'LIFO' : 'FIFO'),
                    notes: cols[15] || ''
                  });
                }
              }
            }
          }
        } else {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            transfersToImport = parsed;
          } else if (parsed && Array.isArray(parsed.transfers)) {
            transfersToImport = parsed.transfers;
          }
        }

        if (transfersToImport.length > 0) {
          if (onImportTransfers) {
            onImportTransfers(transfersToImport);
          }
        } else {
          alert(t.invalidBackupFile || 'Nessun trasferimento valido trovato nel file.');
        }
      } catch (err) {
        console.error('Failed to parse transfer file', err);
        alert(t.invalidJsonFile || 'Errore nella lettura del file.');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <div className="bg-slate-900/40 p-6 rounded-2xl border border-slate-800/80 space-y-4 shadow-sm">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800/60 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400">
            <RefreshCw className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-white tracking-wide uppercase font-mono">
              {t.transfersRegistryTitle}
            </h3>
            <span className="text-[10px] text-slate-500 font-mono">
              {transfers.length} {t.transfersRecordedCount}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap self-end sm:self-auto">
          {/* <button
            onClick={handleExportJSON}
            className="px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
            title="Esporta Registro Trasferimenti (JSON)"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">JSON</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
            title="Esporta Registro Trasferimenti (CSV)"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">CSV</span>
          </button>
          <label
            className="px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
            title="Importa Registro Trasferimenti (JSON/CSV)"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Importa</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv"
              onChange={handleFileImport}
              className="hidden"
            />
          </label> */}
          <button
            onClick={onNewTransfer}
            className="bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 hover:border-amber-500/50 px-3 py-1.5 rounded-xl text-xs font-bold font-sans transition-all duration-300 flex items-center gap-1.5 cursor-pointer shadow-sm ml-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.newTransferBtn}</span>
          </button>
        </div>
      </div>

      {transfers.length === 0 ? (
        <div className="h-28 border border-dashed border-slate-800 flex flex-col items-center justify-center p-4 text-slate-500 rounded-2xl italic text-xs font-mono bg-slate-950/20 text-center gap-1">
          <span>{t.noTransfersRecorded}</span>
          <button
            onClick={onNewTransfer}
            className="text-amber-400 hover:text-amber-300 font-bold not-italic hover:underline cursor-pointer"
          >
            {t.createFirstTransfer}
          </button>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950/40">
            <table className="w-full text-left border-collapse text-xs select-text">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/40 text-slate-400 uppercase tracking-widest font-mono font-black text-[10px]">
                  <th className="py-3 px-4">{t.dateLabel}</th>
                  <th className="py-3 px-4">{t.tickerLabel}</th>
                  <th className="py-3 px-4">{t.qtyLabel}</th>
                  <th className="py-3 px-4">{t.sourcePortfolioLabel}</th>
                  <th className="py-3 px-4">{t.destPortfolioLabel}</th>
                  <th className="py-3 px-4">{t.transferUnitPriceLabel}</th>
                  <th className="py-3 px-4">{t.sourceCommissionLabel}</th>
                  <th className="py-3 px-4">{t.destCommissionLabel}</th>
                  <th className="py-3 px-4">{t.lotSelectionCriteria}</th>
                  <th className="py-3 px-4">{t.notesLabel}</th>
                  <th className="py-3 px-4 text-center">{t.actionsLabel}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 font-mono">
                {transfers.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-900/35 transition-colors">
                    <td className="py-2.5 px-4 text-slate-400 whitespace-nowrap">
                      {formatDateString(rec.date, lang, true)}
                    </td>
                    <td className="py-2.5 px-4 text-white font-black uppercase">
                      {rec.symbol}
                    </td>
                    <td className="py-2.5 px-4 text-amber-400 font-bold whitespace-nowrap">
                      <span>{formatFullQuantity(rec.qty)}</span>
                      {rec.childCount && rec.childCount > 1 ? (
                        <span
                          title={rec.childLotsSummary || `${rec.childCount} lotti generati`}
                          className="ml-1.5 px-1.5 py-0.5 text-[9px] font-sans font-semibold rounded bg-amber-500/15 text-amber-300 border border-amber-500/25"
                        >
                          {rec.childCount} lotti
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2.5 px-4 text-slate-300">
                      <div className="flex flex-col">
                        <span className="font-bold text-white">{rec.sourcePortfolioName}</span>
                        {rec.sourceBrokerName && (
                          <span className="text-[10px] text-slate-500 font-sans">{rec.sourceBrokerName}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-slate-300">
                      <div className="flex flex-col">
                        <span className="font-bold text-emerald-400">{rec.destPortfolioName}</span>
                        {rec.destBrokerName && (
                          <span className="text-[10px] text-slate-500 font-sans">{rec.destBrokerName}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-slate-300">
                      {rec.price && rec.price > 0 ? (
                        <span>{formatCurrency(rec.price, rec.priceCurrency || 'EUR')}</span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-rose-400">
                      {rec.sourceCommission > 0 ? (
                        <span>{formatCurrency(rec.sourceCommission, rec.sourceCommissionCurrency || 'EUR')}</span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-rose-400">
                      {rec.destCommission > 0 ? (
                        <span>{formatCurrency(rec.destCommission, rec.destCommissionCurrency || 'EUR')}</span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {rec.criteria}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-400 italic font-sans max-w-xs truncate">
                      {rec.notes || '-'}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => onEdit(rec)}
                          className="text-slate-500 hover:text-amber-400 p-1 rounded hover:bg-amber-950/20 transition-colors cursor-pointer"
                          title="Modifica Trasferimento"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDelete(rec)}
                          className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-rose-950/20 transition-colors cursor-pointer"
                          title="Elimina Trasferimento (Entrata & Uscita)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden space-y-3">
            {transfers.map((rec) => (
              <div key={rec.id} className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 space-y-3 font-mono text-xs">
                <div className="flex justify-between items-start border-b border-slate-800/60 pb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-black text-sm uppercase">{rec.symbol}</span>
                      <span className="text-[10px] text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                        {rec.criteria}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-sans mt-0.5">
                      {formatDateString(rec.date, lang, true)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onEdit(rec)}
                      className="p-1.5 bg-slate-800 text-slate-300 rounded hover:bg-amber-600 hover:text-white transition"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDelete(rec)}
                      className="p-1.5 bg-slate-800 text-slate-300 rounded hover:bg-rose-600 hover:text-white transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase font-sans font-bold">Quantità</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-amber-400 font-bold">{formatFullQuantity(rec.qty)}</span>
                      {rec.childCount && rec.childCount > 1 ? (
                        <span className="px-1.5 py-0.2 text-[9px] font-sans font-semibold rounded bg-amber-500/15 text-amber-300 border border-amber-500/25">
                          {rec.childCount} lotti
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {rec.price && rec.price > 0 && (
                    <div>
                      <span className="text-[10px] text-slate-500 block uppercase font-sans font-bold">PMC</span>
                      <span className="text-slate-300">{formatCurrency(rec.price, rec.priceCurrency || 'EUR')}</span>
                    </div>
                  )}
                </div>

                <div className="p-2 bg-slate-950/60 rounded-lg border border-slate-800/60 flex items-center justify-between text-xs font-sans">
                  <div>
                    <span className="text-[9px] text-slate-500 block uppercase">Da</span>
                    <span className="font-bold text-white">{rec.sourcePortfolioName}</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-amber-500 shrink-0 mx-2" />
                  <div className="text-right">
                    <span className="text-[9px] text-slate-500 block uppercase">A</span>
                    <span className="font-bold text-emerald-400">{rec.destPortfolioName}</span>
                  </div>
                </div>

                {(rec.sourceCommission > 0 || rec.destCommission > 0) && (
                  <div className="flex justify-between text-[11px] pt-1 text-slate-400 border-t border-slate-800/40">
                    {rec.sourceCommission > 0 && (
                      <span>Comm. Uscita: <strong className="text-rose-400">{formatCurrency(rec.sourceCommission, rec.sourceCommissionCurrency || 'EUR')}</strong></span>
                    )}
                    {rec.destCommission > 0 && (
                      <span>Comm. Entrata: <strong className="text-rose-400">{formatCurrency(rec.destCommission, rec.destCommissionCurrency || 'EUR')}</strong></span>
                    )}
                  </div>
                )}

                {rec.notes && (
                  <div className="text-[10px] text-slate-500 italic font-sans border-t border-slate-800/40 pt-1">
                    {rec.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
