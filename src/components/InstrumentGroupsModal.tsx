/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Layers, Plus, Trash2, Edit2, X, Check, Sparkles, AlertCircle, Info, Tag } from 'lucide-react';
import { InstrumentGroup, LanguagePhrases, Transaction } from '../types.ts';

interface InstrumentGroupsModalProps {
  isOpen: boolean;
  onClose: () => void;
  groups?: InstrumentGroup[];
  availableSymbols?: string[];
  allTransactions?: Transaction[];
  onSaveGroup: (group: InstrumentGroup) => void;
  onDeleteGroup: (groupId: string) => void;
  t: LanguagePhrases;
  lang?: string;
}

export const InstrumentGroupsModal: React.FC<InstrumentGroupsModalProps> = ({
  isOpen,
  onClose,
  groups = [],
  availableSymbols: providedSymbols,
  allTransactions = [],
  onSaveGroup,
  onDeleteGroup,
  t
}) => {
  const [editingGroup, setEditingGroup] = useState<InstrumentGroup | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [customSymbolInput, setCustomSymbolInput] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [deleteConfirmGroupId, setDeleteConfirmGroupId] = useState<string | null>(null);

  const safeGroups = groups || [];

  const availableSymbols = useMemo(() => {
    if (providedSymbols && Array.isArray(providedSymbols) && providedSymbols.length > 0) {
      return Array.from(new Set(providedSymbols.map(s => (s || '').toUpperCase().trim()))).filter(Boolean).sort();
    }
    if (allTransactions && Array.isArray(allTransactions) && allTransactions.length > 0) {
      const txSymbols = allTransactions.map(t => (t?.symbol || '').toUpperCase().trim()).filter(Boolean);
      return Array.from(new Set(txSymbols)).sort();
    }
    return [];
  }, [providedSymbols, allTransactions]);

  if (!isOpen) return null;

  // Auto-detection logic: group symbols that share a base prefix before the first period or dash (e.g. VWCE.MI and VWCE.DE)
  const getAutoDetectableGroups = () => {
    const prefixMap: { [prefix: string]: string[] } = {};
    const existingGroupedSymbols = new Set(
      safeGroups.flatMap(g => (g?.tickerSymbols || []).map(s => (s || '').toUpperCase().trim())).filter(Boolean)
    );

    (availableSymbols || []).forEach(sym => {
      const upper = (sym || '').toUpperCase().trim();
      if (!upper) return;
      const dotIndex = upper.indexOf('.');
      const prefix = dotIndex > 0 ? upper.substring(0, dotIndex) : upper;
      if (!prefixMap[prefix]) {
        prefixMap[prefix] = [];
      }
      if (!prefixMap[prefix].includes(upper)) {
        prefixMap[prefix].push(upper);
      }
    });

    const candidates: { prefix: string; symbols: string[]; defaultName: string }[] = [];
    Object.keys(prefixMap).forEach(prefix => {
      const syms = prefixMap[prefix];
      // Candidate if 2 or more symbols share the prefix and none are already in an existing group
      if (syms.length >= 2) {
        const hasUngrouped = syms.some(s => !existingGroupedSymbols.has(s));
        if (hasUngrouped) {
          candidates.push({
            prefix,
            symbols: syms,
            defaultName: `${prefix} (Multi-Borsa)`
          });
        }
      }
    });
    return candidates;
  };

  const detectedCandidates = getAutoDetectableGroups();

  const handleStartCreate = () => {
    setEditingGroup(null);
    setIsCreatingNew(true);
    setGroupName('');
    setSelectedSymbols([]);
    setCustomSymbolInput('');
    setNotes('');
    setErrorMessage('');
  };

  const handleStartEdit = (g: InstrumentGroup) => {
    setEditingGroup(g);
    setIsCreatingNew(false);
    setGroupName(g.name);
    setSelectedSymbols([...g.tickerSymbols]);
    setCustomSymbolInput('');
    setNotes(g.notes || '');
    setErrorMessage('');
  };

  const handleCancelEdit = () => {
    setEditingGroup(null);
    setIsCreatingNew(false);
    setGroupName('');
    setSelectedSymbols([]);
    setCustomSymbolInput('');
    setNotes('');
    setErrorMessage('');
  };

  const handleToggleSymbol = (sym: string) => {
    const upper = sym.toUpperCase().trim();
    if (selectedSymbols.includes(upper)) {
      setSelectedSymbols(selectedSymbols.filter(s => s !== upper));
    } else {
      setSelectedSymbols([...selectedSymbols, upper]);
    }
  };

  const handleAddCustomSymbol = () => {
    const trimmed = customSymbolInput.toUpperCase().trim();
    if (!trimmed) return;
    if (!selectedSymbols.includes(trimmed)) {
      setSelectedSymbols([...selectedSymbols, trimmed]);
    }
    setCustomSymbolInput('');
  };

  const handleSave = () => {
    if (!groupName.trim()) {
      setErrorMessage('Inserisci un nome descrittivo per lo strumento aggregato.');
      return;
    }
    if (selectedSymbols.length === 0) {
      setErrorMessage('Seleziona almeno un ticker per questo raggruppamento.');
      return;
    }

    const groupToSave: InstrumentGroup = {
      id: editingGroup ? editingGroup.id : `grp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: groupName.trim(),
      tickerSymbols: selectedSymbols.map(s => s.toUpperCase().trim()),
      notes: notes.trim() ? notes.trim() : undefined
    };

    onSaveGroup(groupToSave);
    handleCancelEdit();
  };

  const handleApplyCandidate = (candidate: { prefix: string; symbols: string[]; defaultName: string }) => {
    const newGroup: InstrumentGroup = {
      id: `grp_${candidate.prefix.toLowerCase()}_${Date.now()}`,
      name: candidate.defaultName,
      tickerSymbols: candidate.symbols,
      notes: `Raggruppamento automatico per ticker base ${candidate.prefix}`
    };
    onSaveGroup(newGroup);
  };

  const handleApplyAllCandidates = () => {
    detectedCandidates.forEach(cand => {
      handleApplyCandidate(cand);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">
                {t.aggregatedInstrumentsMode || 'Raggruppamento Strumenti Multi-Borsa'}
              </h2>
              <p className="text-xs text-slate-400">
                Aggrega più ticker (es. VWCE.MI e VWCE.DE) in un unico strumento per Dashboard, Allocazione e Ribilanciamento
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Quick Auto-Detection Banner if candidates found */}
          {detectedCandidates.length > 0 && !isCreatingNew && !editingGroup && (
            <div className="p-4 rounded-xl bg-sky-950/40 border border-sky-800/60 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold text-sky-200">
                      {t.autoDetectGroupsBtn || 'Strumenti Multi-Borsa Rilevati Automaticamente'}
                    </h3>
                    <p className="text-xs text-slate-300 mt-0.5">
                      {t.autoDetectGroupsDesc || 'Abbiamo individuato ticker che condividono la stessa radice scambiati su Borse differenti. Puoi creare i gruppi con un clic.'}
                    </p>
                  </div>
                </div>
                {detectedCandidates.length > 1 && (
                  <button
                    onClick={handleApplyAllCandidates}
                    className="px-3 py-1.5 text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors shrink-0 shadow-sm"
                  >
                    Crea Tutti ({detectedCandidates.length})
                  </button>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-2 pt-1">
                {detectedCandidates.map(c => (
                  <div
                    key={c.prefix}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs"
                  >
                    <div>
                      <span className="font-bold text-white block">{c.defaultName}</span>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {c.symbols.map(s => (
                          <span key={s} className="px-1.5 py-0.5 rounded bg-sky-900/50 text-sky-300 font-mono text-[10px]">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => handleApplyCandidate(c)}
                      className="px-2.5 py-1 bg-emerald-600/80 hover:bg-emerald-500 text-white rounded text-[11px] font-medium transition-colors ml-2"
                    >
                      Crea
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Form when Creating or Editing */}
          {(isCreatingNew || editingGroup) ? (
            <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-4">
              <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  {isCreatingNew ? (t.newGroupTitle || 'Crea Strumento Aggregato') : (t.editGroupTitle || 'Modifica Strumento Aggregato')}
                </h3>
                <button
                  onClick={handleCancelEdit}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Annulla
                </button>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-lg bg-red-950/50 border border-red-800/80 text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Group Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">
                  {t.groupNameLabel || 'Nome Strumento Aggregato (es. Vanguard FTSE All-World)'} <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => {
                    setGroupName(e.target.value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  placeholder="es. Vanguard FTSE All-World (VWCE)"
                  className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 text-white text-xs px-3 py-2 rounded-lg outline-none font-medium"
                />
              </div>

              {/* Constituent Tickers Selection */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 block">
                  {t.groupTickersLabel || 'Ticker Appartenenti allo Strumento'} <span className="text-red-400">*</span>
                </label>
                <p className="text-[11px] text-slate-400">
                  Seleziona i ticker registrati nel portafoglio oppure aggiungine altri manualmente:
                </p>

                {/* Available portfolio tickers as selectable badges */}
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-slate-900/60 rounded-lg border border-slate-800/80">
                  {availableSymbols.length === 0 ? (
                    <span className="text-xs text-slate-500 italic p-1">Nessun ticker trovato nelle transazioni</span>
                  ) : (
                    availableSymbols.map(sym => {
                      const upper = sym.toUpperCase();
                      const isSelected = selectedSymbols.includes(upper);
                      return (
                        <button
                          key={upper}
                          type="button"
                          onClick={() => handleToggleSymbol(upper)}
                          className={`px-2 py-1 rounded text-xs font-mono transition-all flex items-center gap-1 ${
                            isSelected
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 font-bold'
                              : 'bg-slate-800/80 text-slate-400 border border-slate-700/60 hover:text-white'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 text-emerald-400" />}
                          {upper}
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Custom symbol input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customSymbolInput}
                    onChange={(e) => setCustomSymbolInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomSymbol();
                      }
                    }}
                    placeholder="Aggiungi ticker personalizzato (es. VWCE.DE)"
                    className="flex-1 bg-slate-900 border border-slate-700 focus:border-emerald-500 text-white text-xs px-3 py-1.5 rounded-lg outline-none font-mono uppercase"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomSymbol}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition-colors"
                  >
                    Aggiungi
                  </button>
                </div>

                {/* Selected Tickers Summary Pills */}
                {selectedSymbols.length > 0 && (
                  <div className="pt-2">
                    <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                      Ticker inclusi in questo strumento ({selectedSymbols.length}):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedSymbols.map(sym => (
                        <span
                          key={sym}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-mono"
                        >
                          {sym}
                          <button
                            type="button"
                            onClick={() => handleToggleSymbol(sym)}
                            className="text-emerald-400/70 hover:text-emerald-300 ml-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Notes or Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">
                  {t.groupNotesLabel || 'Note o Dettagli Opzionali (es. ISIN, borse)'}
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="es. ISIN IE00BK5BQT80 - Borsa Italiana e Xetra"
                  className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 text-white text-xs px-3 py-2 rounded-lg outline-none font-medium"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-4 py-2 text-xs text-slate-300 hover:text-white rounded-lg transition-colors"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow-md transition-colors flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  Salva Strumento
                </button>
              </div>
            </div>
          ) : (
            /* Button to add new group */
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400">
                Strumenti aggregati configurati: <strong className="text-white">{safeGroups.length}</strong>
              </span>
              <button
                onClick={handleStartCreate}
                className="px-3.5 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                {t.newGroupBtn || 'Nuovo Strumento Aggregato'}
              </button>
            </div>
          )}

          {/* Existing Groups List */}
          <div className="space-y-3">
            {safeGroups.length === 0 ? (
              <div className="p-8 text-center bg-slate-950/40 rounded-xl border border-slate-800/80 space-y-3">
                <Layers className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Nessun gruppo strumento configurato finora. Crea un gruppo manuale oppure utilizza il rilevamento automatico per unificare i ticker scambiati su borse diverse.
                </p>
                <button
                  onClick={handleStartCreate}
                  className="px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
                >
                  Crea il tuo primo gruppo
                </button>
              </div>
            ) : (
              safeGroups.map((group) => (
                <div
                  key={group.id}
                  className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-slate-700/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white tracking-wide">
                        {group.name}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold uppercase">
                        {(group.tickerSymbols || []).length} Ticker
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 items-center">
                      <Tag className="w-3 h-3 text-slate-500" />
                      {(group.tickerSymbols || []).map(s => (
                        <span
                          key={s}
                          className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-sky-400 font-mono text-xs font-semibold"
                        >
                          {s}
                        </span>
                      ))}
                    </div>

                    {group.notes && (
                      <p className="text-xs text-slate-400 italic">
                        {group.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {deleteConfirmGroupId === group.id ? (
                      <div className="flex items-center gap-1.5 bg-red-950/40 border border-red-800/80 rounded-lg p-1.5 animate-fade-in">
                        <span className="text-[11px] text-red-300 font-semibold px-1">
                          {t.confirmDeleteTitle || 'Eliminare?'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteGroup(group.id);
                            setDeleteConfirmGroupId(null);
                          }}
                          className="px-2.5 py-1 rounded-md bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors cursor-pointer"
                        >
                          {t.delete || 'Elimina'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmGroupId(null)}
                          className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
                        >
                          {t.cancel || 'Annulla'}
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleStartEdit(group)}
                          className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-colors cursor-pointer"
                          title="Modifica Strumento"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmGroupId(group.id)}
                          className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-red-400 hover:text-red-300 hover:bg-red-950/30 hover:border-red-800 transition-colors cursor-pointer"
                          title="Rimuovi Strumento"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer Info */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1.5 text-[11px]">
            <Info className="w-3.5 h-3.5 text-slate-500" />
            <span>I raggruppamenti non modificano le transazioni o i dati storici: sono visuali e analitici.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};
