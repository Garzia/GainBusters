/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Modale di importazione modulare dei movimenti per "Attività senza ticker".
 * Supporta:
 * - Drag and drop e upload manuale del file
 * - Selezione dell'entità di destinazione (o creazione rapida)
 * - Rilevamento automatico del provider (es. Trade Republic CSV)
 * - Anteprima in tempo reale con conteggio validi, duplicati, esclusi ed errori
 * - Riepilogo finanziario dettagliato (Rendimenti lordi, Ritenute, Netto, Entrate, Uscite)
 * - Salvataggio atomico tramite saveDatabaseState
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Copy,
  ArrowRight,
  Filter,
  Check,
  ChevronDown,
  Sparkles,
  Info,
  Calendar,
  Layers,
  Receipt,
  Plus
} from 'lucide-react';
import { ModalPortal } from './ModalPortal.tsx';
import {
  DBState,
  NonTickerEntity,
  NonTickerMovement,
  NonTickerMovementType,
  LanguagePhrases
} from '../types.ts';
import {
  getAllImporters,
  getImporterById,
  detectBestImporter
} from '../importers/registry.ts';
import {
  ImportParsedResult,
  ImporterDetectionResult,
  NonTickerImportItem,
  ImportItemResult
} from '../importers/types.ts';
import { formatDateString } from '../utils.ts';
import { formatCurrency } from '../App.tsx';

interface NonTickerImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  db: DBState;
  entities: NonTickerEntity[];
  movements: NonTickerMovement[];
  preSelectedEntityId?: string;
  onSaveDatabase: (newDb: DBState, message?: string) => Promise<void>;
  t: LanguagePhrases;
  lang: string;
}

export const NonTickerImportModal: React.FC<NonTickerImportModalProps> = ({
  isOpen,
  onClose,
  db,
  entities,
  movements,
  preSelectedEntityId,
  onSaveDatabase,
  t,
  lang
}) => {
  // Entità selezionata
  const [selectedEntityId, setSelectedEntityId] = useState<string>(() => {
    if (preSelectedEntityId && preSelectedEntityId !== 'ALL' && entities.some(e => e.id === preSelectedEntityId)) {
      return preSelectedEntityId;
    }
    return entities.length > 0 ? entities[0].id : '';
  });

  // Gestione file e parsing
  const [file, setFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Provider e Registry
  const availableImporters = useMemo(() => getAllImporters(), []);
  const [selectedProviderId, setSelectedProviderId] = useState<string>('AUTO');
  const [autoDetection, setAutoDetection] = useState<ImporterDetectionResult | null>(null);

  // Risultato parsing
  const [parsedResult, setParsedResult] = useState<ImportParsedResult | null>(null);

  // Filtro visualizzazione anteprima righe
  const [previewFilter, setPreviewFilter] = useState<'ALL' | 'VALID' | 'DUPLICATE' | 'SKIPPED' | 'ERROR'>('ALL');

  // Input file ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sincronizza pre-selected entity se cambia
  useEffect(() => {
    if (preSelectedEntityId && preSelectedEntityId !== 'ALL' && entities.some(e => e.id === preSelectedEntityId)) {
      setSelectedEntityId(preSelectedEntityId);
    } else if (!selectedEntityId && entities.length > 0) {
      setSelectedEntityId(entities[0].id);
    }
  }, [preSelectedEntityId, entities]);

  // Esegui analisi del file quando cambia fileContent, selectedProviderId o selectedEntityId
  useEffect(() => {
    if (!fileContent || !fileName) {
      setParsedResult(null);
      setAutoDetection(null);
      setParseError(null);
      return;
    }

    let isCancelled = false;

    const runAnalysis = async () => {
      setIsAnalyzing(true);
      setParseError(null);

      try {
        let activeImporter = null;

        if (selectedProviderId === 'AUTO') {
          const detected = await detectBestImporter(fileContent, fileName);
          if (isCancelled) return;

          if (detected && detected.detection.canHandle) {
            setAutoDetection(detected.detection);
            activeImporter = detected.importer;
          } else {
            setAutoDetection(null);
            setParseError(
              t.importAutoDetectFailed ||
                'Nessun provider riconosciuto per questo formato di file. Seleziona manualmente il provider dal menu.'
            );
            setIsAnalyzing(false);
            return;
          }
        } else {
          activeImporter = getImporterById(selectedProviderId);
          setAutoDetection(null);
        }

        if (!activeImporter) {
          setParseError('Provider selezionato non valido.');
          setIsAnalyzing(false);
          return;
        }

        // Filtra i movimenti esistenti dell'entità selezionata per la deduplicazione
        const targetEntityMovements = movements.filter(m => m.entityId === selectedEntityId);

        const result = await Promise.resolve(
          activeImporter.parse(fileContent, fileName, {
            entityId: selectedEntityId,
            existingMovements: targetEntityMovements
          })
        );

        if (isCancelled) return;
        setParsedResult(result);
      } catch (err: any) {
        if (isCancelled) return;
        console.error("Errore durante l'analisi del file:", err);
        setParseError(err?.message || "Si è verificato un errore durante l'elaborazione del file.");
      } finally {
        if (!isCancelled) {
          setIsAnalyzing(false);
        }
      }
    };

    runAnalysis();

    return () => {
      isCancelled = true;
    };
  }, [fileContent, fileName, selectedProviderId, selectedEntityId, movements, t]);

  const handleFileChange = (selectedFile: File) => {
    setFile(selectedFile);
    setFileName(selectedFile.name);
    setParseError(null);

    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      setFileContent(text);
    };
    reader.onerror = () => {
      setParseError('Impossibile leggere il file selezionato.');
    };
    reader.readAsText(selectedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  // Esecuzione dell'importazione vera e propria
  const handleExecuteImport = async () => {
    if (!parsedResult || parsedResult.validCount === 0 || !selectedEntityId) return;

    setIsImporting(true);
    try {
      // Estrai solo i movimenti contrassegnati come VALID
      const validItems = parsedResult.items.filter(it => it.status === 'VALID' && it.item);

      const newMovements: NonTickerMovement[] = validItems.map(it => {
        const item = it.item!;
        return {
          id: `ntm_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          entityId: selectedEntityId,
          date: item.date,
          type: item.type,
          amount: item.amount,
          valuation: item.valuation,
          grossReturn: item.grossReturn,
          taxAmount: item.taxAmount,
          netReturn: item.netReturn,
          isReinvested: item.isReinvested,
          units: item.units,
          unitPrice: item.unitPrice,
          fee: item.fee,
          notes: item.notes,
          externalId: item.externalId,
          importProvider: item.importProvider
        };
      });

      const updatedMovements = [...(db.nonTickerMovements || []), ...newMovements];
      const updatedDb: DBState = {
        ...db,
        nonTickerMovements: updatedMovements
      };

      const targetEntity = entities.find(e => e.id === selectedEntityId);
      const entityName = targetEntity ? targetEntity.name : 'Attività';

      const successMsg = `Importati con successo ${newMovements.length} movimenti per "${entityName}" (${parsedResult.duplicateCount} duplicati ignorati).`;

      await onSaveDatabase(updatedDb, successMsg);
      onClose();
    } catch (err: any) {
      console.error("Errore durante il salvataggio dell'importazione:", err);
      setParseError(err?.message || "Errore durante il salvataggio dei movimenti.");
    } finally {
      setIsImporting(false);
    }
  };

  const filteredPreviewItems = useMemo(() => {
    if (!parsedResult) return [];
    if (previewFilter === 'ALL') return parsedResult.items;
    return parsedResult.items.filter(it => it.status === previewFilter);
  }, [parsedResult, previewFilter]);

  const currentEntity = entities.find(e => e.id === selectedEntityId);
  const targetCurrency = currentEntity?.currency || 'EUR';

  return (
    <ModalPortal isOpen={isOpen}>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-sm overflow-hidden animate-fade-in"
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
        onClick={e => {
          if (e.target === e.currentTarget && !isImporting) {
            onClose();
          }
        }}
      >
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl max-w-3xl w-full relative space-y-4 max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col overflow-y-auto custom-scrollbar my-auto">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-violet-500/10 rounded-xl text-violet-400 border border-violet-500/20">
                <FileSpreadsheet className="w-5 h-5" />
              </span>
              <div>
                <h3 className="font-extrabold text-base text-white">
                  {t.importModalTitle || 'Importa Movimenti da File Esterno'}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {t.importModalDesc || 'Importatore modulare idempotente per Trade Republic e altri provider.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={isImporting}
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form Step 1: Target Entity & Provider Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Target Entity Selector */}
            <div className="space-y-1.5">
              <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t.importTargetEntityLabel || 'Attività di Destinazione'} *</span>
              </label>
              {entities.length > 0 ? (
                <select
                  value={selectedEntityId}
                  onChange={e => setSelectedEntityId(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl text-white font-medium focus:outline-none focus:border-emerald-500/60 cursor-pointer"
                >
                  {entities.map(ent => (
                    <option key={ent.id} value={ent.id}>
                      {ent.name} ({ent.currency || 'EUR'})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="p-2.5 bg-rose-950/20 border border-rose-800/40 rounded-xl text-rose-300 text-xs">
                  Nessuna attività presente. Crea prima un'attività in cui importare i movimenti.
                </div>
              )}
            </div>

            {/* Provider Selector */}
            <div className="space-y-1.5">
              <label className="text-slate-300 font-semibold flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                  <span>{t.importSelectProviderLabel || 'Provider / Formato File'}</span>
                </span>
                {autoDetection && (
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
                    {autoDetection.providerName} (Auto)
                  </span>
                )}
              </label>
              <select
                value={selectedProviderId}
                onChange={e => setSelectedProviderId(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl text-white font-medium focus:outline-none focus:border-violet-500/60 cursor-pointer"
              >
                <option value="AUTO">✨ Rileva automaticamente dal file</option>
                {availableImporters.map(imp => (
                  <option key={imp.id} value={imp.id}>
                    {imp.name} ({imp.supportedExtensions.join(', ')})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Form Step 2: File Upload / Drag & Drop Area */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-2 ${
              isDragging
                ? 'border-violet-500 bg-violet-500/10'
                : file
                ? 'border-emerald-500/50 bg-emerald-950/10 hover:border-emerald-500/80'
                : 'border-slate-800 hover:border-slate-700 bg-slate-950/40 hover:bg-slate-950/60'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={e => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileChange(e.target.files[0]);
                }
              }}
              className="hidden"
            />

            {file ? (
              <>
                <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-white font-mono">{fileName}</p>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {(file.size / 1024).toFixed(1)} KB — Clicca o trascina per sostituire il file
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="p-3 bg-slate-800 rounded-2xl text-slate-400 border border-slate-700">
                  <Upload className="w-6 h-6" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-slate-200">
                    {t.importFileSelectPrompt || 'Seleziona o trascina qui il file esportato da Trade Republic (.csv)'}
                  </p>
                  <p className="text-[11px] text-slate-500 font-mono">
                    Formati supportati: CSV con intestazioni standard Trade Republic
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Parsing Errors or Status */}
          {parseError && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-2xl flex items-start gap-2 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{parseError}</span>
            </div>
          )}

          {/* Analysis in Progress */}
          {isAnalyzing && (
            <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl flex items-center justify-center gap-2.5 text-xs text-slate-300">
              <span className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></span>
              <span>Analisi e deduplicazione dei movimenti in corso...</span>
            </div>
          )}

          {/* Parsed Summary & Visual Badges */}
          {parsedResult && !isAnalyzing && (
            <div className="space-y-3.5 animate-fade-in">
              {/* Metric Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {/* Nuovi da importare */}
                <div className="p-2.5 bg-emerald-950/30 border border-emerald-500/30 rounded-xl">
                  <span className="text-[10px] text-emerald-400 font-semibold block">
                    {t.importReadyToImport || 'Nuovi da Importare'}
                  </span>
                  <span className="text-base font-black font-mono text-emerald-300">
                    {parsedResult.validCount}
                  </span>
                  <span className="text-[9px] text-emerald-500 block font-mono">
                    su {parsedResult.totalRows} righe
                  </span>
                </div>

                {/* Duplicati ignorati */}
                <div className="p-2.5 bg-amber-950/30 border border-amber-500/30 rounded-xl">
                  <span className="text-[10px] text-amber-400 font-semibold block">
                    {t.importDuplicatesSkipped || 'Duplicati Ignorati'}
                  </span>
                  <span className="text-base font-black font-mono text-amber-300">
                    {parsedResult.duplicateCount}
                  </span>
                  <span className="text-[9px] text-amber-500 block font-mono">
                    già presenti nel DB
                  </span>
                </div>

                {/* Esclusi / Non supportati */}
                <div className="p-2.5 bg-slate-950/50 border border-slate-800 rounded-xl">
                  <span className="text-[10px] text-slate-400 font-semibold block">
                    {t.importUnsupportedSkipped || 'Non Rilevanti / Ignorati'}
                  </span>
                  <span className="text-base font-black font-mono text-slate-300">
                    {parsedResult.skippedCount}
                  </span>
                  <span className="text-[9px] text-slate-500 block font-mono">
                    tipologie non di cassa
                  </span>
                </div>

                {/* Errori di formato */}
                <div className="p-2.5 bg-rose-950/30 border border-rose-500/30 rounded-xl">
                  <span className="text-[10px] text-rose-400 font-semibold block">
                    {t.importErrorsCount || 'Errori di Lettura'}
                  </span>
                  <span className="text-base font-black font-mono text-rose-300">
                    {parsedResult.errorCount}
                  </span>
                  <span className="text-[9px] text-rose-500 block font-mono">
                    righe non valide
                  </span>
                </div>
              </div>

              {/* Financial Totals Preview Card */}
              {parsedResult.validCount > 0 && (
                <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-2 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                    <span className="font-extrabold text-slate-300 uppercase font-mono tracking-wider text-[10px]">
                      Impatto Finanziario Movimenti Nuovi
                    </span>
                    {parsedResult.summary.dateRange && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        {formatDateString(parsedResult.summary.dateRange.start, lang)} →{' '}
                        {formatDateString(parsedResult.summary.dateRange.end, lang)}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono">
                    {parsedResult.summary.totalNetReturns > 0 && (
                      <div>
                        <span className="text-[10px] text-slate-400 block font-sans">
                          Rendimenti Netti (Interessi):
                        </span>
                        <span className="font-bold text-emerald-400">
                          +{formatCurrency(parsedResult.summary.totalNetReturns, targetCurrency)}
                        </span>
                        <span className="text-[9px] text-slate-500 block">
                          (Lordo: {formatCurrency(parsedResult.summary.totalGrossReturns, targetCurrency)} | Imposte: -{formatCurrency(parsedResult.summary.totalTaxes, targetCurrency)})
                        </span>
                      </div>
                    )}

                    {parsedResult.summary.totalInflows > 0 && (
                      <div>
                        <span className="text-[10px] text-slate-400 block font-sans">
                          Totale Versamenti / Entrate:
                        </span>
                        <span className="font-bold text-sky-400">
                          +{formatCurrency(parsedResult.summary.totalInflows, targetCurrency)}
                        </span>
                      </div>
                    )}

                    {parsedResult.summary.totalOutflows > 0 && (
                      <div>
                        <span className="text-[10px] text-slate-400 block font-sans">
                          Totale Prelievi / Uscite:
                        </span>
                        <span className="font-bold text-rose-400">
                          -{formatCurrency(parsedResult.summary.totalOutflows, targetCurrency)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Preview Table Header & Filters */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-white font-mono uppercase tracking-wider">
                    {t.importPreviewTitle || 'Anteprima Righe Elaborate'} ({filteredPreviewItems.length})
                  </span>
                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[10px] font-mono">
                    <button
                      type="button"
                      onClick={() => setPreviewFilter('ALL')}
                      className={`px-2 py-0.5 rounded-lg transition cursor-pointer ${
                        previewFilter === 'ALL' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400'
                      }`}
                    >
                      Tutti ({parsedResult.totalRows})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewFilter('VALID')}
                      className={`px-2 py-0.5 rounded-lg transition cursor-pointer ${
                        previewFilter === 'VALID' ? 'bg-emerald-950 text-emerald-300 font-bold' : 'text-slate-400'
                      }`}
                    >
                      Nuovi ({parsedResult.validCount})
                    </button>
                    {parsedResult.duplicateCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setPreviewFilter('DUPLICATE')}
                        className={`px-2 py-0.5 rounded-lg transition cursor-pointer ${
                          previewFilter === 'DUPLICATE' ? 'bg-amber-950 text-amber-300 font-bold' : 'text-slate-400'
                        }`}
                      >
                        Duplicati ({parsedResult.duplicateCount})
                      </button>
                    )}
                  </div>
                </div>

                {/* Table */}
                <div className="max-h-48 overflow-y-auto overflow-x-auto custom-scrollbar border border-slate-800 rounded-2xl bg-slate-950/40">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-[10px] text-slate-500 font-mono uppercase sticky top-0 bg-slate-900/95 backdrop-blur-sm">
                        <th className="py-1.5 px-2.5">Riga</th>
                        <th className="py-1.5 px-2.5">Data</th>
                        <th className="py-1.5 px-2.5">Tipo Rilevato</th>
                        <th className="py-1.5 px-2.5">Importo / Netto</th>
                        <th className="py-1.5 px-2.5">Dettagli / Fisco</th>
                        <th className="py-1.5 px-2.5">Note</th>
                        <th className="py-1.5 px-2.5 text-right">Stato</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 font-mono">
                      {filteredPreviewItems.map(it => {
                        const item = it.item;
                        return (
                          <tr key={it.rowIndex} className="hover:bg-slate-800/30 transition">
                            <td className="py-1.5 px-2.5 text-slate-500">{it.rowIndex}</td>
                            <td className="py-1.5 px-2.5 text-slate-300 whitespace-nowrap">
                              {item?.date ? formatDateString(item.date, lang) : '—'}
                            </td>
                            <td className="py-1.5 px-2.5 text-slate-300 whitespace-nowrap font-sans font-medium">
                              {item?.rawType || item?.type || '—'}
                            </td>
                            <td className="py-1.5 px-2.5 font-bold whitespace-nowrap">
                              {item?.netReturn !== undefined ? (
                                <span className="text-emerald-400">
                                  +{formatCurrency(item.netReturn, targetCurrency)} netto
                                </span>
                              ) : item?.type === NonTickerMovementType.WITHDRAWAL ||
                                item?.type === NonTickerMovementType.OTHER_OUTFLOW ? (
                                <span className="text-rose-400">
                                  -{formatCurrency(item.amount || 0, targetCurrency)}
                                </span>
                              ) : item?.amount ? (
                                <span className="text-sky-400">
                                  +{formatCurrency(item.amount, targetCurrency)}
                                </span>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>
                            <td className="py-1.5 px-2.5 text-[10px] text-slate-400 whitespace-nowrap font-sans">
                              {item?.grossReturn !== undefined && item?.taxAmount !== undefined ? (
                                <span>
                                  Lordo {formatCurrency(item.grossReturn, targetCurrency)} | Tasse -
                                  {formatCurrency(item.taxAmount, targetCurrency)}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="py-1.5 px-2.5 text-slate-400 truncate max-w-[150px] font-sans" title={item?.notes}>
                              {item?.notes || '—'}
                            </td>
                            <td className="py-1.5 px-2.5 text-right whitespace-nowrap">
                              {it.status === 'VALID' && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-md">
                                  Nuovo
                                </span>
                              )}
                              {it.status === 'DUPLICATE' && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-md" title={it.statusReason}>
                                  Duplicato
                                </span>
                              )}
                              {it.status === 'SKIPPED' && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded-md" title={it.statusReason}>
                                  Escluso
                                </span>
                              )}
                              {it.status === 'ERROR' && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/30 rounded-md" title={it.statusReason}>
                                  Errore
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Footer Action Buttons */}
          <div className="flex items-center justify-between border-t border-slate-800/80 pt-3 text-xs">
            <button
              type="button"
              onClick={onClose}
              disabled={isImporting}
              className="px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer font-bold"
            >
              {t.cancel || 'Annulla'}
            </button>

            <button
              type="button"
              disabled={!parsedResult || parsedResult.validCount === 0 || isImporting || !selectedEntityId}
              onClick={handleExecuteImport}
              className={`flex items-center gap-1.5 px-5 py-2.5 rounded-xl font-bold transition shadow-lg cursor-pointer ${
                !parsedResult || parsedResult.validCount === 0 || isImporting || !selectedEntityId
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40 border border-emerald-500/50'
              }`}
            >
              {isImporting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Salvataggio...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>
                    {parsedResult && parsedResult.validCount > 0
                      ? `Importa ${parsedResult.validCount} Movimenti`
                      : 'Nessun nuovo movimento da importare'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
