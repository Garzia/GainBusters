/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { DBState, LanguagePhrases } from '../types.ts';
import { formatCurrency } from '../App.tsx';
import { 
  Percent, 
  Plus, 
  Trash2, 
  Edit, 
  Calendar, 
  DollarSign, 
  Info, 
  FileText,
  X,
  Search,
  Filter
} from 'lucide-react';

interface OtherCostsPageProps {
  t: LanguagePhrases;
  db: DBState;
  selectedCurrency: string;
  convertValue: (val: number, from: string, to: string, date: string) => number;
  costForm: {
    open: boolean;
    editId: string | null;
    portfolioId: string;
    date: string;
    amount: number;
    currency: string;
    type: 'bollo' | 'custody' | 'tax' | 'other';
    notes: string;
  };
  setCostForm: React.Dispatch<React.SetStateAction<{
    open: boolean;
    editId: string | null;
    portfolioId: string;
    date: string;
    amount: number;
    currency: string;
    type: 'bollo' | 'custody' | 'tax' | 'other';
    notes: string;
  }>>;
  saveCostMutation: () => void;
  requestDeleteCost: (id: string) => void;
  lang: string;
}

export default function OtherCostsPage({
  t,
  db,
  selectedCurrency,
  convertValue,
  costForm,
  setCostForm,
  saveCostMutation,
  requestDeleteCost,
  lang
}: OtherCostsPageProps) {
  const otherCosts = db.otherCosts || [];
  
  // Filter and Search states
  const [filterPortfolioId, setFilterPortfolioId] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [searchNotes, setSearchNotes] = useState<string>('');

  // Find all active/linked accounts and portfolios for select menus
  const activeAccounts = db.accounts.filter(a => a.includeInDashboard);
  const activeAccountIds = activeAccounts.map(a => a.id);
  const activePortfolios = db.portfolios.filter(p => p.includeInDashboard && activeAccountIds.includes(p.accountId));
  const activePortIds = activePortfolios.map(p => p.id);

  // Filtered costs to display
  const displayedCosts = otherCosts
    .filter(c => {
      // Must belong to an active portfolio
      if (!activePortIds.includes(c.portfolioId)) return false;
      // Filter by portfolio
      if (filterPortfolioId && c.portfolioId !== filterPortfolioId) return false;
      // Filter by type
      if (filterType && c.type !== filterType) return false;
      // Search notes
      if (searchNotes && !c.notes.toLowerCase().includes(searchNotes.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Calculate total costs paid in selected display currency
  const totalCostsDisplay = displayedCosts.reduce((sum, c) => {
    return sum + convertValue(c.amount || 0, c.currency || 'EUR', selectedCurrency, c.date);
  }, 0);

  // Helper to resolve translated type name
  const getTranslatedTypeName = (type: string) => {
    switch (type) {
      case 'bollo':
        return t.stampDuty;
      case 'custody':
        return t.custodyFee;
      case 'tax':
        return t.otherTax;
      case 'other':
      default:
        return t.otherCostType;
    }
  };

  const getPortfolioName = (portId: string) => {
    const p = db.portfolios.find(port => port.id === portId);
    if (!p) return 'Unknown Portfolio';
    const acc = db.accounts.find(a => a.id === p.accountId);
    return acc ? `${acc.name} - ${p.name}` : p.name;
  };

  const openAddForm = () => {
    setCostForm({
      open: true,
      editId: null,
      portfolioId: activePortfolios[0]?.id || '',
      date: new Date().toISOString().substring(0, 16),
      amount: 0,
      currency: selectedCurrency,
      type: 'bollo',
      notes: ''
    });
  };

  const openEditForm = (c: any) => {
    setCostForm({
      open: true,
      editId: c.id,
      portfolioId: c.portfolioId,
      date: c.date.substring(0, 16),
      amount: c.amount,
      currency: c.currency || 'EUR',
      type: c.type || 'bollo',
      notes: c.notes || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-8 animate-fade-in text-slate-100 dark:text-slate-100" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Title & Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Percent className="w-6 h-6 text-emerald-400" />
            {t.otherCostsTab}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {t.otherCostsDesc}
          </p>
        </div>
        
        {activePortfolios.length > 0 && (
          <button
            onClick={openAddForm}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-5 py-3 rounded-xl flex items-center gap-1.5 transition-all duration-300 transform hover:-translate-y-0.5 cursor-pointer shadow-lg shadow-emerald-950/20"
          >
            <Plus className="w-4 h-4" /> {t.addCostBtn}
          </button>
        )}
      </div>

      {/* Aggregate Totals Widget */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none"></div>
          <div>
            <span className="text-[10px] text-slate-400 font-mono tracking-widest uppercase font-bold">
              {t.totalCostsPaid}
            </span>
            <h2 className="text-3xl font-black text-emerald-400 mt-1 tracking-tight">
              {formatCurrency(totalCostsDisplay, selectedCurrency)}
            </h2>
          </div>
          <div className="text-[11px] text-slate-500 mt-4 flex items-center gap-1">
            <Info className="w-3.5 h-3.5" />
            {t.otherCostsCalcNote}
          </div>
        </div>

        {/* Breakdown counters */}
        <div className="col-span-1 md:col-span-2 bg-slate-900/40 border border-slate-800/40 rounded-2xl p-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {(['bollo', 'custody', 'tax', 'other'] as const).map((type) => {
            const sumForType = displayedCosts
              .filter(c => c.type === type)
              .reduce((sum, c) => sum + convertValue(c.amount || 0, c.currency || 'EUR', selectedCurrency, c.date), 0);
            return (
              <div key={type} className="bg-slate-950/60 border border-slate-800/40 rounded-xl p-3 flex flex-col justify-between">
                <span className="text-[9px] text-slate-400 font-semibold tracking-wider uppercase truncate">
                  {getTranslatedTypeName(type)}
                </span>
                <span className="text-sm font-black text-white mt-1">
                  {formatCurrency(sumForType, selectedCurrency)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Inline Form Card if open */}
      {costForm.open && (
        <div className="bg-slate-900 border border-emerald-500/20 rounded-2xl p-6 shadow-2xl relative overflow-hidden animate-slide-in">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none"></div>
          
          <div className="flex justify-between items-center mb-5 border-b border-slate-800 pb-3">
            <h3 className="text-base font-bold text-white flex items-center gap-1.5">
              <Percent className="w-4 h-4 text-emerald-400" />
              {costForm.editId ? t.editCostBtn : t.addCostBtn}
            </h3>
            <button
              onClick={() => setCostForm({ ...costForm, open: false })}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800/50 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Portfolio Selection */}
            <div className="flex flex-col">
              <label className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1.5">{t.costSelection}</label>
              <select
                value={costForm.portfolioId}
                onChange={(e) => setCostForm({ ...costForm, portfolioId: e.target.value })}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500/50 transition font-medium"
              >
                {activePortfolios.map((p) => {
                  const acc = db.accounts.find(a => a.id === p.accountId);
                  return (
                    <option key={p.id} value={p.id}>
                      {acc ? `${acc.name} - ${p.name}` : p.name}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Cost Type Selection */}
            <div className="flex flex-col">
              <label className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1.5">{t.costType}</label>
              <select
                value={costForm.type}
                onChange={(e) => setCostForm({ ...costForm, type: e.target.value as any })}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500/50 transition font-medium"
              >
                <option value="bollo">{t.stampDuty}</option>
                <option value="custody">{t.custodyFee}</option>
                <option value="tax">{t.otherTax}</option>
                <option value="other">{t.otherCostType}</option>
              </select>
            </div>

            {/* Date Selection */}
            <div className="flex flex-col">
              <label className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1.5">{t.costDate}</label>
              <input
                type="datetime-local"
                value={costForm.date}
                onChange={(e) => setCostForm({ ...costForm, date: e.target.value })}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500/50 transition font-medium"
              />
            </div>

            {/* Amount */}
            <div className="flex flex-col">
              <label className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1.5">{t.costAmount}</label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  value={costForm.amount || ''}
                  onChange={(e) => setCostForm({ ...costForm, amount: Number(e.target.value) })}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white w-full focus:outline-none focus:border-emerald-500/50 transition font-medium"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Currency Selection */}
            <div className="flex flex-col">
              <label className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1.5">{t.currencyLabel}</label>
              <select
                value={costForm.currency}
                onChange={(e) => setCostForm({ ...costForm, currency: e.target.value })}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500/50 transition font-medium"
              >
                {['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CNY'].map((cur) => (
                  <option key={cur} value={cur}>{cur}</option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div className="flex flex-col md:col-span-3">
              <label className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1.5">{t.costNotes}</label>
              <input
                type="text"
                value={costForm.notes}
                onChange={(e) => setCostForm({ ...costForm, notes: e.target.value })}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500/50 transition font-medium"
                placeholder={t.notesPlaceholder}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-800/80">
            <button
              type="button"
              onClick={() => setCostForm({ ...costForm, open: false })}
              className="px-4 py-2.5 text-xs font-bold text-slate-400 hover:text-white bg-slate-900 border border-slate-800 rounded-xl transition cursor-pointer"
            >
              {t.cancelBtn}
            </button>
            <button
              type="button"
              onClick={saveCostMutation}
              className="px-5 py-2.5 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-xl transition cursor-pointer shadow-lg shadow-emerald-950/20"
            >
              {t.save}
            </button>
          </div>
        </div>
      )}

      {/* Listing and Table Filters */}
      <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-emerald-400" />
            {t.allCosts}
          </h3>

          {/* Quick Stats count */}
          <span className="text-xs font-mono text-slate-400">
            {displayedCosts.length} {t.recordsFound}
          </span>
        </div>

        {/* Filters bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {/* Portfolio Filter */}
          <div className="flex flex-col">
            <span className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-1 flex items-center gap-1">
              <Filter className="w-3 h-3 text-slate-500" /> {t.costSelection}
            </span>
            <select
              value={filterPortfolioId}
              onChange={(e) => setFilterPortfolioId(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/30 transition"
            >
              <option value="">{t.allPortfolios}</option>
              {activePortfolios.map((p) => {
                const acc = db.accounts.find(a => a.id === p.accountId);
                return (
                  <option key={p.id} value={p.id}>
                    {acc ? `${acc.name} - ${p.name}` : p.name}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Type Filter */}
          <div className="flex flex-col">
            <span className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-1 flex items-center gap-1">
              <Filter className="w-3 h-3 text-slate-500" /> {t.costType}
            </span>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/30 transition"
            >
              <option value="">{t.allTypes}</option>
              <option value="bollo">{t.stampDuty}</option>
              <option value="custody">{t.custodyFee}</option>
              <option value="tax">{t.otherTax}</option>
              <option value="other">{t.otherCostType}</option>
            </select>
          </div>

          {/* Search Notes */}
          <div className="flex flex-col">
            <span className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-1 flex items-center gap-1">
              <Search className="w-3 h-3 text-slate-500" /> {t.costNotes}
            </span>
            <input
              type="text"
              value={searchNotes}
              onChange={(e) => setSearchNotes(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/30 transition"
              placeholder={t.searchNotesPlaceholder}
            />
          </div>
        </div>

        {/* List of Registered Costs */}
        {displayedCosts.length === 0 ? (
          <div className="text-center py-10 text-slate-500 border border-dashed border-slate-800/60 rounded-xl">
            <Info className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-medium">{t.noCostsMsg}</p>
          </div>
        ) : (
          <div className="space-y-3 pt-2">
            {displayedCosts.map((c) => {
              const convertedDisplay = convertValue(c.amount || 0, c.currency || 'EUR', selectedCurrency, c.date);
              const isDifferentCurrency = (c.currency || 'EUR') !== selectedCurrency;

              return (
                <div
                  key={c.id}
                  className="bg-slate-900/50 border border-slate-800/40 hover:border-slate-800 hover:bg-slate-900/70 rounded-xl p-4 transition duration-200 flex flex-wrap items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="p-2.5 bg-slate-800/50 border border-slate-700/30 rounded-lg text-emerald-400">
                      <Calendar className="w-4 h-4" />
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-white">
                          {getTranslatedTypeName(c.type)}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {new Date(c.date).toLocaleDateString(lang, { year: 'numeric', month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1 flex flex-wrap gap-x-2">
                        <span className="font-semibold text-slate-400">
                          {getPortfolioName(c.portfolioId)}
                        </span>
                        {c.notes && (
                          <span className="italic text-slate-500">
                            • {c.notes}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions & Price */}
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-xs font-black text-white">
                        {formatCurrency(convertedDisplay, selectedCurrency)}
                      </div>
                      {isDifferentCurrency && (
                        <div className="text-[9px] text-slate-500">
                          Orig: {formatCurrency(c.amount || 0, c.currency || 'EUR')}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-1">
                      <button
                        onClick={() => openEditForm(c)}
                        className="p-2 bg-slate-800 hover:bg-emerald-600 hover:text-white rounded-lg text-slate-400 transition cursor-pointer"
                        title={t.editCostBtn}
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => requestDeleteCost(c.id)}
                        className="p-2 bg-slate-800 hover:bg-rose-600 hover:text-white rounded-lg text-slate-400 transition cursor-pointer"
                        title={t.confirmDeleteCost}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
