import React, { useState } from 'react';
import { DBState, InflationSetting, LanguagePhrases } from '../types.ts';
import { Trash2, Coins, Plus, Check } from 'lucide-react';

interface InflationPageProps {
  db: DBState;
  saveDatabaseState: (newDb: DBState) => void;
  currencySymbol: string;
  t: LanguagePhrases;
}

export const InflationPage: React.FC<InflationPageProps> = ({
  db,
  saveDatabaseState,
  currencySymbol,
  t
}) => {
  const [newIndexSigla, setNewIndexSigla] = useState('');
  const [newIndexDesc, setNewIndexDesc] = useState('');
  const [newIndexLink, setNewIndexLink] = useState('');
  const [selectedId, setSelectedId] = useState(db.settings.selectedInflationId || 'NIC');
  const [activeYearFilter, setActiveYearFilter] = useState(new Date().getFullYear());
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  // Selected Index
  const activeIndex = db.settings.inflationIndices.find(idx => idx?.id === selectedId) || db.settings.inflationIndices[0];

  const handleCreateNewIndex = () => {
    if (!newIndexSigla.trim()) return;
    const newId = 'custom_' + Date.now().toString();
    const newIdxObj: InflationSetting = {
      id: newId,
      name: newIndexSigla.trim().toUpperCase(),
      description: newIndexDesc.trim(),
      link: newIndexLink.trim(),
      values: [] // Initially empty values
    };
    const updatedIndices = [...db.settings.inflationIndices, newIdxObj];
    const newDb = {
      ...db,
      settings: {
        ...db.settings,
        selectedInflationId: newId,
        inflationIndices: updatedIndices
      }
    };
    setSelectedId(newId);
    setNewIndexSigla('');
    setNewIndexDesc('');
    setNewIndexLink('');
    saveDatabaseState(newDb);
    showSuccess(t.indexCreatedSuccess);
  };

  const showSuccess = (msg: string) => {
    setSaveSuccessMsg(msg);
    setTimeout(() => setSaveSuccessMsg(''), 3000);
  };

  const handleDeleteIndex = (idToDelete: string) => {
    const updatedIndices = db.settings.inflationIndices.filter(idx => idx.id !== idToDelete);
    let fallbackId = db.settings.selectedInflationId;
    if (fallbackId === idToDelete) {
      fallbackId = updatedIndices[0]?.id || '';
    }
    const newDb = {
      ...db,
      settings: {
        ...db.settings,
        selectedInflationId: fallbackId,
        inflationIndices: updatedIndices
      }
    };
    setSelectedId(fallbackId);
    saveDatabaseState(newDb);
    showSuccess(t.indexDeletedSuccess);
  };

  const handleUpdateActiveIndexDetails = (updatedField: 'name' | 'description' | 'link', newValue: string) => {
    if (!activeIndex) return;
    const updatedIndices = db.settings.inflationIndices.map(idx => {
      if (idx.id === activeIndex.id) {
        return {
          ...idx,
          [updatedField]: newValue
        };
      }
      return idx;
    });
    const newDb = {
      ...db,
      settings: {
        ...db.settings,
        inflationIndices: updatedIndices
      }
    };
    saveDatabaseState(newDb);
  };

  const handleUpdateMonthlyRate = (year: number, month: number, rateValuePercentage: string) => {
    if (!activeIndex) return;
    const rateNum = parseFloat(rateValuePercentage) / 100;
    
    // Copy values
    let updatedValues = [...(activeIndex.values || [])];
    const matchIdx = updatedValues.findIndex(v => v.year === year && v.month === month);
    
    if (isNaN(rateNum)) {
      // If empty or NaN, remove the record
      if (matchIdx !== -1) {
        updatedValues.splice(matchIdx, 1);
      }
    } else {
      if (matchIdx !== -1) {
        updatedValues[matchIdx] = { ...updatedValues[matchIdx], rate: rateNum, month };
      } else {
        updatedValues.push({ year, month, rate: rateNum });
      }
    }

    const updatedIndices = db.settings.inflationIndices.map(idx => {
      if (idx.id === activeIndex.id) {
        return { ...idx, values: updatedValues };
      }
      return idx;
    });

    const newDb = {
      ...db,
      settings: {
        ...db.settings,
        inflationIndices: updatedIndices
      }
    };
    saveDatabaseState(newDb);
  };

  const monthsList = [
    { num: 1, name: t.month1 },
    { num: 2, name: t.month2 },
    { num: 3, name: t.month3 },
    { num: 4, name: t.month4 },
    { num: 5, name: t.month5 },
    { num: 6, name: t.month6 },
    { num: 7, name: t.month7 },
    { num: 8, name: t.month8 },
    { num: 9, name: t.month9 },
    { num: 10, name: t.month10 },
    { num: 11, name: t.month11 },
    { num: 12, name: t.month12 },
  ];

  // Dynamically generated descending years down to 2020
  const currentYear = new Date().getFullYear();
  const yearsRange: number[] = [];
  for (let y = currentYear; y >= 2020; y--) {
    yearsRange.push(y);
  }

  return (
    <div className="space-y-8 animate-fade-in text-slate-100">
      <div className="border-b border-slate-800 pb-4 flex justify-between items-end flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">{t.inflationTitle}</h1>
          <p className="text-sm text-slate-400">{t.inflationDesc}</p>
        </div>
        {saveSuccessMsg && (
          <div className="bg-emerald-500/10 text-emerald-400 text-xs font-bold py-1.5 px-3.5 rounded-lg border border-emerald-500/20 flex items-center gap-1.5 animate-bounce">
            <Check className="w-3.5 h-3.5" />
            {saveSuccessMsg}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Left Column: Index Selection & Creation */}
        <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-800/80 space-y-6">
          <div className="space-y-3">
            <h3 className="font-extrabold text-sm text-white tracking-wider uppercase font-mono border-b border-slate-800 pb-2 flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-emerald-400" /> {t.myIndices}
            </h3>
            
            <div className="space-y-2">
              <label className="text-xs text-slate-400 font-semibold font-mono block">{t.activeDashboardIndex}</label>
              <select
                value={db.settings.selectedInflationId}
                onChange={(e) => {
                  const newDb = { ...db, settings: { ...db.settings, selectedInflationId: e.target.value } };
                  saveDatabaseState(newDb);
                  setSelectedId(e.target.value);
                  showSuccess(t.indexActiveSetSuccess);
                }}
                className="bg-slate-950/80 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/80 text-white text-xs py-2 px-3 rounded-xl w-full font-bold"
              >
                {db.settings.inflationIndices.map((inf) => (
                  <option key={inf.id} value={inf.id} className="bg-slate-950 text-white font-medium">
                    {inf.name} {inf.description ? ` (${inf.description})` : ''}
                  </option>
                ))}
                {db.settings.inflationIndices.length === 0 && (
                  <option value="" className="bg-slate-950 text-slate-500 font-medium">{t.none}</option>
                )}
              </select>
            </div>

            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] text-slate-500 font-extrabold uppercase font-mono block">{t.rapidChoiceEditor}</span>
              <div className="space-y-1 max-h-48 overflow-y-auto w-full">
                {db.settings.inflationIndices.map((inf) => {
                  const isActive = selectedId === inf.id;
                  return (
                    <div key={inf.id} className={`flex items-center justify-between p-2 rounded-xl transition ${isActive ? 'bg-slate-800/60 border border-slate-700' : 'hover:bg-slate-900 border border-transparent'}`}>
                      <button
                        onClick={() => setSelectedId(inf.id)}
                        className="text-left text-xs font-bold font-mono text-white flex-1 truncate pr-1"
                        title={inf.description || inf.name}
                      >
                        <span className="text-emerald-400 font-black mr-1">[{inf.name}]</span>
                        <span className="text-slate-300 font-sans text-xs font-normal">
                          {inf.description ? (inf.description.length > 25 ? inf.description.substring(0, 25) + '...' : inf.description) : t.noDescriptionText}
                        </span>
                        {inf.id === db.settings.selectedInflationId && (
                          <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400 ml-1 font-sans font-black">Dash</span>
                        )}
                      </button>
                      <button
                        onClick={() => handleDeleteIndex(inf.id)}
                        className="text-rose-400 hover:text-rose-500 p-1 rounded-lg hover:bg-rose-500/10 transition cursor-pointer shrink-0"
                        title={t.deleteIndexTooltip}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
                {db.settings.inflationIndices.length === 0 && (
                  <div className="text-xs text-slate-500 italic p-3 text-center border border-dashed border-slate-800 rounded-xl">
                    {t.noIndicesConfigured}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* New Index Creation */}
          <div className="space-y-3 pt-4 border-t border-slate-800">
            <h4 className="font-extrabold text-xs text-white uppercase tracking-wider font-mono flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-emerald-400" /> {t.createNewIndex}
            </h4>
            <div className="space-y-2.5 text-xs">
              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">{t.siglaLabel}</label>
                <input
                  type="text"
                  value={newIndexSigla}
                  placeholder="CPI"
                  maxLength={12}
                  onChange={(e) => setNewIndexSigla(e.target.value)}
                  className="bg-slate-950 text-xs py-2 px-3 rounded-xl border border-slate-800 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/25 text-white w-full font-mono font-bold"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">{t.descriptionLabel}</label>
                <textarea
                  value={newIndexDesc}
                  rows={2}
                  placeholder={t.descriptionPlaceholder}
                  onChange={(e) => setNewIndexDesc(e.target.value)}
                  className="bg-slate-950 text-xs py-2 px-3 rounded-xl border border-slate-800 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/25 text-white w-full font-sans resize-none"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">{t.linkLabel}</label>
                <input
                  type="text"
                  value={newIndexLink}
                  placeholder={t.sourceLinkPlaceholder}
                  onChange={(e) => setNewIndexLink(e.target.value)}
                  className="bg-slate-950 text-xs py-2 px-3 rounded-xl border border-slate-800 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/25 text-white w-full font-mono text-[11px]"
                />
              </div>

              <button
                onClick={handleCreateNewIndex}
                disabled={!newIndexSigla.trim()}
                className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500/10 text-xs font-bold py-2.5 w-full rounded-xl border border-emerald-500/20 transition cursor-pointer flex items-center justify-center gap-1.5 mt-2"
              >
                <Plus className="w-3.5 h-3.5" /> {t.createCustomIndexBtn}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Month-by-month table data inputs */}
        <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-800/80 md:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <span className="text-[10px] text-emerald-400 font-extrabold font-mono uppercase tracking-widest block">{t.editorTableValues}</span>
              <h3 className="font-black text-base text-white truncate font-sans">
                {activeIndex ? activeIndex.name : t.noIndexEditing}
              </h3>
            </div>
            
            {/* Year Selector Dropdown */}
            {activeIndex && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400 font-mono font-bold">{t.yearLabel}</label>
                <select
                  value={activeYearFilter}
                  onChange={(e) => setActiveYearFilter(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/80 text-white text-xs py-1.5 px-3 rounded-lg font-mono font-bold"
                >
                  {yearsRange.map((y) => (
                    <option key={y} value={y} className="bg-slate-950 font-mono text-white">
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {activeIndex && (
            <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800/60 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">{t.siglaAbbreviationLabel}</label>
                <input
                  type="text"
                  value={activeIndex.name}
                  onChange={(e) => handleUpdateActiveIndexDetails('name', e.target.value)}
                  className="bg-slate-950 text-xs py-1.5 px-2.5 rounded-lg border border-slate-800 focus:outline-none focus:border-emerald-500 text-white w-full font-mono font-bold"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">{t.descriptionLabel}</label>
                <input
                  type="text"
                  value={activeIndex.description || ''}
                  onChange={(e) => handleUpdateActiveIndexDetails('description', e.target.value)}
                  placeholder="Es. Indice FOI ISTAT"
                  className="bg-slate-950 text-xs py-1.5 px-2.5 rounded-lg border border-slate-800 focus:outline-none focus:border-emerald-500 text-white w-full font-sans"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">{t.dataSourceLinkLabel}</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={activeIndex.link || ''}
                    onChange={(e) => handleUpdateActiveIndexDetails('link', e.target.value)}
                    placeholder="https://..."
                    className="bg-slate-950 text-xs py-1.5 px-2.5 rounded-lg border border-slate-800 focus:outline-none focus:border-emerald-500 text-white w-full font-mono text-[11px]"
                  />
                  {activeIndex.link && (
                    <a
                      href={activeIndex.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 hover:text-emerald-300 font-bold px-3 py-1.5 rounded-lg flex items-center justify-center cursor-pointer select-none"
                      title={t.visitSourceTooltip}
                    >
                      {t.goBtn}
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeIndex ? (
            <div className="space-y-3 text-xs pt-2">
              <div className="flex justify-between items-center bg-slate-950/40 p-3 rounded-xl border border-slate-800/60 font-mono text-[10px] text-slate-300 leading-relaxed font-semibold">
                <span>{t.momPercentageNotice}</span>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-1">
                {monthsList.map((m) => {
                  const matchVal = (activeIndex.values || []).find(v => v.year === activeYearFilter && v.month === m.num);
                  const displayRate = matchVal ? (matchVal.rate * 100).toFixed(4).replace(/\.?0+$/, '') : '';

                  return (
                    <div key={m.num} className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/50 flex items-center justify-between gap-3 hover:border-slate-800 transition duration-150">
                      <div className="font-mono">
                        <span className="text-slate-500 text-[10px] block uppercase font-bold">{m.num.toString().padStart(2, '0')} / {activeYearFilter}</span>
                        <span className="font-bold text-white font-sans text-xs">{m.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <input
                          type="number"
                          step="0.0001"
                          value={displayRate}
                          placeholder="0.0"
                          onChange={(e) => handleUpdateMonthlyRate(activeYearFilter, m.num, e.target.value)}
                          className="bg-slate-950 text-xs text-white py-1 px-2.5 rounded-lg border border-slate-800 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/20 w-24 font-mono font-bold text-right py-1.5"
                        />
                        <span className="text-slate-400 font-extrabold pr-1">%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-500 text-sm italic font-mono border border-dashed border-slate-800 rounded-xl">
              {t.selectOrCreateIndexInstruction}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
