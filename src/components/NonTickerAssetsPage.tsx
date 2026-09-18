/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Sezione dedicata al monitoraggio di investimenti e attività finanziarie
 * prive di strumento/ticker negoziabile:
 * - Fondi pensione (negoziali, aperti, PIP)
 * - Liquidità remunerata / Conti deposito
 * - TFR in azienda
 * - Polizze vita a capitale garantito / Ramo I
 * - Investimenti diretti / P2P Lending
 * 
 * Fornisce:
 * - Ricostruzione dell'evoluzione temporale del capitale versato e del saldo/controvalore
 * - Calcolo di metriche di performance: Guadagno Netto, Rendimento Semplice, MWRR/IRR e TWRR
 * - Supporto opzionale per numero di quote (PMC, NAV e totali quote)
 * - Spaccato dei flussi limitato esclusivamente alle tipologie effettivamente utilizzate
 * - Gestione personalizzata, ordinamento e definizione delle tipologie di movimento (Entrate e Uscite)
 * - Ergonomia di selezione perimetro d'analisi ispirata alla Dashboard
 * - Gestione finestre modali centralizzata tramite ModalPortal
 * - Sincronizzazione valute con le impostazioni dell'app
 */

import React, { useState, useMemo } from 'react';
import {
  Landmark,
  PiggyBank,
  TrendingUp,
  Plus,
  Trash2,
  Edit,
  DollarSign,
  Percent,
  ShieldCheck,
  Layers,
  Activity,
  FileText,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Receipt,
  Scale,
  X,
  HelpCircle,
  Briefcase,
  Sliders,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Coins,
  Calendar,
  FileUp
} from 'lucide-react';
import {
  DBState,
  LanguagePhrases,
  NonTickerEntity,
  NonTickerMovement,
  NonTickerMovementType,
  NonTickerMovementTypeConfig,
  NonTickerCategory,
  Currency,
  NonTickerTablePreferences
} from '../types.ts';
import {
  calculateNonTickerMetrics,
  calculateNonTickerPeriodMetrics,
  NonTickerTimelinePoint,
  getStandardDate,
  DEFAULT_NON_TICKER_MOVEMENT_TYPES,
  isFlowInflow,
  isFlowOutflow
} from '../utils/nonTickerFinance.ts';
import { formatDateString } from '../utils.ts';
import { cleanFloatNoise } from '../utils/finance.ts';
import { formatCurrency } from '../App.tsx';
import { ModalPortal } from './ModalPortal.tsx';
import { QuantityDisplay } from './QuantityDisplay.tsx';
import { NonTickerImportModal } from './NonTickerImportModal.tsx';
import { NonTickerAnalyticsTable } from './NonTickerAnalyticsTable.tsx';

interface NonTickerAssetsPageProps {
  db: DBState;
  saveDatabaseState: (newDb: DBState) => Promise<void>;
  selectedCurrency: string;
  convertValue: (amount: number, from: string, to: string, date: string) => number;
  t: LanguagePhrases;
  lang: string;
  activeCurrencies?: Currency[];
}

export const NonTickerAssetsPage: React.FC<NonTickerAssetsPageProps> = ({
  db,
  saveDatabaseState,
  selectedCurrency,
  t,
  lang,
  activeCurrencies
}) => {
  const entities = useMemo(() => db.nonTickerEntities || [], [db.nonTickerEntities]);
  const movements = useMemo(() => db.nonTickerMovements || [], [db.nonTickerMovements]);

  // Movement Types configuration (default fallback if not set, with seamless merge of new defaults)
  const movementTypeConfigs = useMemo<NonTickerMovementTypeConfig[]>(() => {
    if (!db.nonTickerMovementTypes || db.nonTickerMovementTypes.length === 0) {
      return DEFAULT_NON_TICKER_MOVEMENT_TYPES;
    }
    const existingIds = new Set(db.nonTickerMovementTypes.map(c => c.id));
    const missingDefaults = DEFAULT_NON_TICKER_MOVEMENT_TYPES.filter(d => !existingIds.has(d.id));
    if (missingDefaults.length > 0) {
      return [...db.nonTickerMovementTypes, ...missingDefaults];
    }
    return db.nonTickerMovementTypes;
  }, [db.nonTickerMovementTypes]);

  // Currencies list synchronized with user settings
  const availableCurrencies: (Currency | string)[] = useMemo(() => {
    if (activeCurrencies && activeCurrencies.length > 0) {
      return activeCurrencies;
    }
    if (db.settings?.activeCurrencies && db.settings.activeCurrencies.length > 0) {
      return db.settings.activeCurrencies;
    }
    return [Currency.EUR, Currency.USD];
  }, [activeCurrencies, db.settings?.activeCurrencies]);

  // Selected Entity state: 'ALL' or specific entity id
  const [selectedEntityId, setSelectedEntityId] = useState<string>('ALL');

  // Timeframe filter for chart & period analysis: 1M, 3M, 6M, 1Y, 3Y, 5Y, YTD, ALL, CUSTOM
  type NonTickerTimeframe = '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | 'YTD' | 'ALL' | 'CUSTOM';
  const [timeframe, setTimeframe] = useState<NonTickerTimeframe>('ALL');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // Commissions toggle (default from settings if available, else true)
  const [includeCommissions, setIncludeCommissions] = useState<boolean>(
    db.settings?.includeCommissions !== undefined ? db.settings.includeCommissions : true
  );

  // Movements table filter
  const [movementFilterType, setMovementFilterType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // ================= MODAL STATES (All initialized to open: false) =================
  const [entityForm, setEntityForm] = useState<{
    open: boolean;
    editId: string | null;
    name: string;
    category: NonTickerCategory;
    currency: string;
    identifier: string;
    notes: string;
  }>({
    open: false,
    editId: null,
    name: '',
    category: 'PENSION_FUND',
    currency: selectedCurrency || 'EUR',
    identifier: '',
    notes: ''
  });

  const [movementForm, setMovementForm] = useState<{
    open: boolean;
    editId: string | null;
    tab: 'CAPITAL' | 'VALUATION' | 'RETURN';
    entityId: string;
    date: string;
    type: string;
    amount: string;
    units: string;
    unitPrice: string;
    fee: string;
    valuation: string;
    grossReturn: string;
    taxAmount: string;
    netReturn: string;
    isReinvested: boolean;
    notes: string;
  }>({
    open: false,
    editId: null,
    tab: 'CAPITAL',
    entityId: '',
    date: new Date().toISOString().substring(0, 10),
    type: NonTickerMovementType.DEPOSIT,
    amount: '',
    units: '',
    unitPrice: '',
    fee: '',
    valuation: '',
    grossReturn: '',
    taxAmount: '',
    netReturn: '',
    isReinvested: true,
    notes: ''
  });

  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    type: 'entity' | 'movement';
    id: string;
    name: string;
  }>({
    open: false,
    type: 'entity',
    id: '',
    name: ''
  });

  // Import movements modal state
  const [importModalOpen, setImportModalOpen] = useState<boolean>(false);

  const [manageTypesForm, setManageTypesForm] = useState<{
    open: boolean;
  }>({
    open: false
  });

  const [newTypeInput, setNewTypeInput] = useState<{
    name: string;
    direction: 'INFLOW' | 'OUTFLOW';
  }>({
    name: '',
    direction: 'INFLOW'
  });

  // Calculate Metrics for selected entity or ALL (considering includeCommissions)
  const metrics = useMemo(() => {
    return calculateNonTickerMetrics(
      selectedEntityId,
      entities,
      movements,
      selectedCurrency,
      movementTypeConfigs,
      includeCommissions
    );
  }, [selectedEntityId, entities, movements, selectedCurrency, movementTypeConfigs, includeCommissions]);

  // Determine period boundaries
  const { periodStartDate, periodEndDate } = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().substring(0, 10);

    if (timeframe === 'ALL') {
      return {
        periodStartDate: metrics.firstDate || todayStr,
        periodEndDate: todayStr
      };
    }

    if (timeframe === 'CUSTOM') {
      return {
        periodStartDate: customStartDate || metrics.firstDate || todayStr,
        periodEndDate: customEndDate || todayStr
      };
    }

    let start = new Date();
    if (timeframe === '1M') {
      start.setMonth(now.getMonth() - 1);
    } else if (timeframe === '3M') {
      start.setMonth(now.getMonth() - 3);
    } else if (timeframe === '6M') {
      start.setMonth(now.getMonth() - 6);
    } else if (timeframe === '1Y') {
      start.setFullYear(now.getFullYear() - 1);
    } else if (timeframe === '3Y') {
      start.setFullYear(now.getFullYear() - 3);
    } else if (timeframe === '5Y') {
      start.setFullYear(now.getFullYear() - 5);
    } else if (timeframe === 'YTD') {
      start = new Date(now.getFullYear(), 0, 1);
    }

    return {
      periodStartDate: start.toISOString().substring(0, 10),
      periodEndDate: todayStr
    };
  }, [timeframe, customStartDate, customEndDate, metrics.firstDate]);

  // Relevant movements for current asset selection
  const relevantMovements = useMemo(() => {
    if (selectedEntityId === 'ALL') return movements;
    return movements.filter(m => m.entityId === selectedEntityId);
  }, [movements, selectedEntityId]);

  // Period Performance Metrics
  const periodPerformance = useMemo(() => {
    return calculateNonTickerPeriodMetrics(
      metrics,
      relevantMovements,
      periodStartDate,
      periodEndDate,
      timeframe,
      includeCommissions,
      movementTypeConfigs
    );
  }, [metrics, relevantMovements, periodStartDate, periodEndDate, timeframe, includeCommissions, movementTypeConfigs]);

  // Filter timeline based on timeframe for chart
  const filteredTimeline = useMemo(() => {
    if (!metrics.timeline || metrics.timeline.length === 0) return [];
    if (timeframe === 'ALL') return metrics.timeline;

    const pts = metrics.timeline.filter(pt => pt.date >= periodStartDate && pt.date <= periodEndDate);
    if (pts.length === 0) {
      const lastBefore = [...metrics.timeline].reverse().find(pt => pt.date < periodStartDate);
      if (lastBefore) {
        return [
          { ...lastBefore, date: periodStartDate },
          { ...lastBefore, date: periodEndDate }
        ];
      }
      return metrics.timeline;
    }

    let result = [...pts];
    // Ensure chart starts at periodStartDate with initial balance if history exists before periodStartDate
    const firstPt = pts[0];
    if (firstPt.date > periodStartDate) {
      const priorPt = [...metrics.timeline].reverse().find(pt => pt.date < periodStartDate);
      if (priorPt) {
        result = [{ ...priorPt, date: periodStartDate }, ...result];
      }
    }
    const lastPt = result[result.length - 1];
    if (lastPt.date < periodEndDate) {
      result = [...result, { ...lastPt, date: periodEndDate }];
    }
    return result;
  }, [metrics.timeline, timeframe, periodStartDate, periodEndDate]);

  const getDaysBetween = (startStr: string, endStr: string) => {
    if (!startStr || !endStr) return 0;
    const s = new Date(startStr);
    const e = new Date(endStr);
    const diffTime = Math.abs(e.getTime() - s.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive of start and end day
  };

  const totalDays = filteredTimeline.length > 0
    ? getDaysBetween(filteredTimeline[0].date, filteredTimeline[filteredTimeline.length - 1].date)
    : 0;

  const getPeriodDaysLabel = () => {
    switch (lang) {
      case 'it': return `${totalDays} giorni`;
      case 'es': return `${totalDays} días`;
      case 'fr': return `${totalDays} jours`;
      case 'zh': return `${totalDays} 天`;
      case 'ar': return `${totalDays} يوم`;
      default: return `${totalDays} days`;
    }
  };

  // Movements within selected period for breakdown & tax analysis
  const periodMovements = useMemo(() => {
    return relevantMovements.filter(m => m.date >= periodStartDate && m.date <= periodEndDate);
  }, [relevantMovements, periodStartDate, periodEndDate]);

  // Flow breakdown for selected period
  const periodUsedFlows = useMemo(() => {
    const flowSums = new Map<string, { amount: number; units: number }>();
    let periodInflows = 0;
    let periodOutflows = 0;

    for (const m of periodMovements) {
      if (m.type === NonTickerMovementType.VALUATION || m.type === NonTickerMovementType.RETURN) continue;
      const amt = m.amount || 0;
      const u = m.units || 0;
      const current = flowSums.get(m.type) || { amount: 0, units: 0 };
      flowSums.set(m.type, { amount: current.amount + amt, units: current.units + u });

      if (isFlowInflow(m.type, movementTypeConfigs)) periodInflows += amt;
      else if (isFlowOutflow(m.type, movementTypeConfigs)) periodOutflows += amt;
    }

    const res: Array<{
      type: string;
      direction: 'INFLOW' | 'OUTFLOW';
      amount: number;
      units: number;
      pct: number;
    }> = [];

    flowSums.forEach((val, typeId) => {
      const isIn = isFlowInflow(typeId, movementTypeConfigs);
      const isOut = isFlowOutflow(typeId, movementTypeConfigs);
      const direction: 'INFLOW' | 'OUTFLOW' = isOut ? 'OUTFLOW' : 'INFLOW';
      const totalDir = direction === 'INFLOW' ? periodInflows : periodOutflows;
      const pct = totalDir > 0 ? (val.amount / totalDir) * 100 : 0;
      res.push({
        type: typeId,
        direction,
        amount: val.amount,
        units: val.units,
        pct
      });
    });

    return res.sort((a, b) => b.amount - a.amount);
  }, [periodMovements, movementTypeConfigs]);

  // Tax and returns breakdown for selected period
  const periodTaxAnalysis = useMemo(() => {
    let gross = 0;
    let taxes = 0;
    let net = 0;
    let reinvested = 0;
    let liquidated = 0;

    for (const m of periodMovements) {
      if (m.type === NonTickerMovementType.RETURN) {
        const g = m.grossReturn || 0;
        const t = m.taxAmount || 0;
        const n = m.netReturn !== undefined ? m.netReturn : Math.max(0, g - t);
        gross += g;
        taxes += t;
        net += n;
        if (m.isReinvested !== false) {
          reinvested += n;
        } else {
          liquidated += n;
        }
      }
    }

    const effRate = gross > 0 ? (taxes / gross) * 100 : 0;

    return {
      gross,
      taxes,
      net,
      effectiveTaxRate: effRate,
      reinvested,
      liquidated
    };
  }, [periodMovements]);

  // Filtered movements for table
  const filteredMovements = useMemo(() => {
    let list = movements;
    if (selectedEntityId !== 'ALL') {
      list = list.filter(m => m.entityId === selectedEntityId);
    }

    if (movementFilterType === 'CAPITAL') {
      list = list.filter(m => m.type !== NonTickerMovementType.VALUATION && m.type !== NonTickerMovementType.RETURN);
    } else if (movementFilterType === 'VALUATION') {
      list = list.filter(m => m.type === NonTickerMovementType.VALUATION);
    } else if (movementFilterType === 'RETURN') {
      list = list.filter(m => m.type === NonTickerMovementType.RETURN);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(m => {
        const ent = entities.find(e => e.id === m.entityId);
        const entName = ent ? ent.name.toLowerCase() : '';
        const notes = (m.notes || '').toLowerCase();
        return entName.includes(q) || notes.includes(q);
      });
    }

    return [...list].sort((a, b) => b.date.localeCompare(a.date));
  }, [movements, selectedEntityId, movementFilterType, searchQuery, entities]);

  // Check if any movement in the filtered view has units
  const hasUnitsInView = useMemo(() => {
    return filteredMovements.some(m => m.units !== undefined && m.units !== null && Number(m.units) > 0);
  }, [filteredMovements]);

  // Current entity object
  const currentEntityObj = useMemo(() => {
    return entities.find(e => e.id === selectedEntityId);
  }, [entities, selectedEntityId]);

  // Sorted movement types for dropdowns and manager
  const inflowConfigs = useMemo(() => {
    return movementTypeConfigs
      .filter(c => c.direction === 'INFLOW')
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [movementTypeConfigs]);

  const outflowConfigs = useMemo(() => {
    return movementTypeConfigs
      .filter(c => c.direction === 'OUTFLOW')
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [movementTypeConfigs]);

  // Category labels and icons
  const getCategoryLabel = (category: NonTickerCategory): string => {
    switch (category) {
      case 'PENSION_FUND':
        return t.categoryPensionFund || 'Fondo Pensione';
      case 'SAVINGS_ACCOUNT':
        return t.categorySavingsAccount || 'Conto Deposito / Liquidità';
      case 'COMPANY_TFR':
        return t.categoryCompanyTfr || 'TFR in Azienda';
      case 'INSURANCE_POLICY':
        return t.categoryInsurancePolicy || 'Polizza Vita / Ramo I';
      case 'PRIVATE_INVESTMENT':
        return t.categoryPrivateInvestment || 'Investimento Diretto';
      default:
        return t.categoryOther || 'Altro';
    }
  };

  const getCategoryIcon = (category: NonTickerCategory) => {
    switch (category) {
      case 'PENSION_FUND':
        return <ShieldCheck className="w-4 h-4 text-indigo-400" />;
      case 'SAVINGS_ACCOUNT':
        return <PiggyBank className="w-4 h-4 text-emerald-400" />;
      case 'COMPANY_TFR':
        return <Briefcase className="w-4 h-4 text-amber-400" />;
      case 'INSURANCE_POLICY':
        return <Landmark className="w-4 h-4 text-sky-400" />;
      case 'PRIVATE_INVESTMENT':
        return <Layers className="w-4 h-4 text-violet-400" />;
      default:
        return <DollarSign className="w-4 h-4 text-slate-400" />;
    }
  };

  // Helper to get movement type name
  const getMovementTypeName = (typeId: string): string => {
    if (typeId === NonTickerMovementType.VALUATION) return t.mvValuation || 'Rilevazione Saldo';
    if (typeId === NonTickerMovementType.RETURN) return t.mvReturn || 'Rendimento Riconosciuto';
    const cfg = movementTypeConfigs.find(c => c.id === typeId);
    if (cfg) return cfg.name;
    // Fallback standard labels
    switch (typeId) {
      case NonTickerMovementType.EMPLOYEE_CONTRIBUTION:
        return t.mvEmployeeContrib || 'Contributo Dipendente';
      case NonTickerMovementType.EMPLOYER_CONTRIBUTION:
        return t.mvEmployerContrib || 'Contributo Datore di Lavoro';
      case NonTickerMovementType.TFR:
        return t.mvTfr || 'Quota TFR Versata';
      case NonTickerMovementType.DEPOSIT:
        return t.mvDeposit || 'Versamento / Deposito';
      case NonTickerMovementType.DIVESTMENT:
        return t.mvDivestment || 'Disinvestimento / Vendita Titoli';
      case NonTickerMovementType.CASHBACK:
        return t.mvCashback || 'Cashback / Saveback / Bonus';
      case NonTickerMovementType.WITHDRAWAL:
        return t.mvWithdrawal || 'Prelievo / Riscatto / Anticipazione';
      case NonTickerMovementType.INVESTMENT:
        return t.mvInvestment || 'Investimento / Acquisto Titoli';
      case NonTickerMovementType.CARD_SPEND:
        return t.mvCardSpend || 'Spesa con Carta';
      case NonTickerMovementType.FEE:
        return t.mvFee || 'Canone / Spese di Gestione';
      case NonTickerMovementType.OTHER_INFLOW:
        return t.mvOtherInflow || 'Altro Flusso in Entrata';
      case NonTickerMovementType.OTHER_OUTFLOW:
        return t.mvOtherOutflow || 'Altro Flusso in Uscita';
      default:
        return typeId;
    }
  };

  const getMovementTypeBadge = (type: string) => {
    if (type === NonTickerMovementType.VALUATION) {
      return (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
          {t.mvValuation || 'Rilevazione Saldo'}
        </span>
      );
    }
    if (type === NonTickerMovementType.RETURN) {
      return (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          {t.mvReturn || 'Rendimento'}
        </span>
      );
    }

    const isInf = isFlowInflow(type, movementTypeConfigs);
    const isOut = isFlowOutflow(type, movementTypeConfigs);
    const name = getMovementTypeName(type);

    if (isInf) {
      return (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-sky-500/10 text-sky-400 border border-sky-500/20">
          {name}
        </span>
      );
    }

    if (isOut) {
      return (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20">
          {name}
        </span>
      );
    }

    return (
      <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
        {name}
      </span>
    );
  };

  // ================= MODAL HANDLERS =================
  const handleOpenNewEntity = () => {
    setEntityForm({
      open: true,
      editId: null,
      name: '',
      category: 'PENSION_FUND',
      currency: availableCurrencies[0] || 'EUR',
      identifier: '',
      notes: ''
    });
  };

  const handleOpenEditEntity = (entity: NonTickerEntity) => {
    setEntityForm({
      open: true,
      editId: entity.id,
      name: entity.name,
      category: entity.category,
      currency: entity.currency || availableCurrencies[0] || 'EUR',
      identifier: entity.identifier || '',
      notes: entity.notes || ''
    });
  };

  const handleSaveEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entityForm.name.trim()) return;

    let updatedEntities: NonTickerEntity[];
    if (entityForm.editId) {
      updatedEntities = entities.map(ent =>
        ent.id === entityForm.editId
          ? {
              ...ent,
              name: entityForm.name.trim(),
              category: entityForm.category,
              currency: entityForm.currency,
              identifier: entityForm.identifier.trim() || undefined,
              notes: entityForm.notes.trim() || undefined
            }
          : ent
      );
    } else {
      const newEntity: NonTickerEntity = {
        id: `nte-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        name: entityForm.name.trim(),
        category: entityForm.category,
        currency: entityForm.currency,
        identifier: entityForm.identifier.trim() || undefined,
        notes: entityForm.notes.trim() || undefined,
        createdAt: new Date().toISOString()
      };
      updatedEntities = [...entities, newEntity];
      setSelectedEntityId(newEntity.id);
    }

    const updatedDb: DBState = {
      ...db,
      nonTickerEntities: updatedEntities
    };

    await saveDatabaseState(updatedDb);
    setEntityForm(prev => ({ ...prev, open: false }));
  };

  const handleRequestDeleteEntity = (entity: NonTickerEntity) => {
    setDeleteConfirm({
      open: true,
      type: 'entity',
      id: entity.id,
      name: entity.name
    });
  };

  const handleOpenNewMovement = (defaultTab: 'CAPITAL' | 'VALUATION' | 'RETURN' = 'CAPITAL') => {
    const targetEntityId = selectedEntityId !== 'ALL' ? selectedEntityId : (entities[0]?.id || '');
    
    let defaultType = inflowConfigs[0]?.id || NonTickerMovementType.DEPOSIT;
    if (defaultTab === 'VALUATION') defaultType = NonTickerMovementType.VALUATION;
    else if (defaultTab === 'RETURN') defaultType = NonTickerMovementType.RETURN;

    setMovementForm({
      open: true,
      editId: null,
      tab: defaultTab,
      entityId: targetEntityId,
      date: new Date().toISOString().substring(0, 10),
      type: defaultType,
      amount: '',
      units: '',
      unitPrice: '',
      fee: '',
      valuation: '',
      grossReturn: '',
      taxAmount: '',
      netReturn: '',
      isReinvested: true,
      notes: ''
    });
  };

  const handleOpenEditMovement = (m: NonTickerMovement) => {
    let tab: 'CAPITAL' | 'VALUATION' | 'RETURN' = 'CAPITAL';
    if (m.type === NonTickerMovementType.VALUATION) tab = 'VALUATION';
    else if (m.type === NonTickerMovementType.RETURN) tab = 'RETURN';

    setMovementForm({
      open: true,
      editId: m.id,
      tab,
      entityId: m.entityId,
      date: getStandardDate(m.date),
      type: m.type,
      amount: m.amount !== undefined ? m.amount.toString() : '',
      units: m.units !== undefined && m.units !== null ? m.units.toString() : '',
      unitPrice: m.unitPrice !== undefined && m.unitPrice !== null ? m.unitPrice.toString() : '',
      fee: m.fee !== undefined && m.fee !== null ? m.fee.toString() : '',
      valuation: m.valuation !== undefined ? m.valuation.toString() : '',
      grossReturn: m.grossReturn !== undefined ? m.grossReturn.toString() : '',
      taxAmount: m.taxAmount !== undefined ? m.taxAmount.toString() : '',
      netReturn: m.netReturn !== undefined ? m.netReturn.toString() : '',
      isReinvested: m.isReinvested !== false,
      notes: m.notes || ''
    });
  };

  const handleSaveMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movementForm.entityId) return;

    let movementType = movementForm.type;
    if (movementForm.tab === 'VALUATION') {
      movementType = NonTickerMovementType.VALUATION;
    } else if (movementForm.tab === 'RETURN') {
      movementType = NonTickerMovementType.RETURN;
    }

    const payload: Partial<NonTickerMovement> = {
      entityId: movementForm.entityId,
      date: movementForm.date || new Date().toISOString().substring(0, 10),
      type: movementType,
      notes: movementForm.notes.trim() || undefined
    };

    // Optional units handling
    const rawUnits = movementForm.units.trim().replace(',', '.');
    if (rawUnits !== '') {
      const parsedUnits = Number(rawUnits);
      if (!isNaN(parsedUnits) && parsedUnits > 0) {
        payload.units = cleanFloatNoise(parsedUnits);
      } else {
        payload.units = undefined;
      }
    } else {
      payload.units = undefined;
    }

    // Optional unit price handling
    const rawUnitPrice = movementForm.unitPrice.trim().replace(',', '.');
    if (rawUnitPrice !== '') {
      const parsedUnitPrice = Number(rawUnitPrice);
      if (!isNaN(parsedUnitPrice) && parsedUnitPrice > 0) {
        payload.unitPrice = cleanFloatNoise(parsedUnitPrice);
      } else {
        payload.unitPrice = undefined;
      }
    } else {
      payload.unitPrice = undefined;
    }

    // Optional fee handling (external cost)
    const rawFee = movementForm.fee.trim().replace(',', '.');
    if (rawFee !== '') {
      const parsedFee = Number(rawFee);
      if (!isNaN(parsedFee) && parsedFee >= 0) {
        payload.fee = cleanFloatNoise(parsedFee);
      } else {
        payload.fee = undefined;
      }
    } else {
      payload.fee = undefined;
    }

    if (movementForm.tab === 'VALUATION') {
      payload.valuation = parseFloat(movementForm.valuation) || 0;
    } else if (movementForm.tab === 'RETURN') {
      const gross = parseFloat(movementForm.grossReturn) || 0;
      const tax = parseFloat(movementForm.taxAmount) || 0;
      const net = movementForm.netReturn !== '' ? parseFloat(movementForm.netReturn) : Math.max(0, gross - tax);
      payload.grossReturn = gross;
      payload.taxAmount = tax;
      payload.netReturn = net;
      payload.isReinvested = movementForm.isReinvested;
    } else {
      let amt = parseFloat(movementForm.amount) || 0;
      if (amt === 0 && payload.units && payload.unitPrice) {
        amt = payload.units * payload.unitPrice;
      }
      payload.amount = amt;
    }

    let updatedMovements: NonTickerMovement[];
    if (movementForm.editId) {
      updatedMovements = movements.map(m =>
        m.id === movementForm.editId ? ({ ...m, ...payload } as NonTickerMovement) : m
      );
    } else {
      const newM: NonTickerMovement = {
        id: `ntm-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        ...(payload as NonTickerMovement)
      };
      updatedMovements = [...movements, newM];
    }

    const updatedDb: DBState = {
      ...db,
      nonTickerMovements: updatedMovements
    };

    await saveDatabaseState(updatedDb);
    setMovementForm(prev => ({ ...prev, open: false }));
  };

  const handleRequestDeleteMovement = (m: NonTickerMovement) => {
    setDeleteConfirm({
      open: true,
      type: 'movement',
      id: m.id,
      name: `${getMovementTypeName(m.type)} — ${formatDateString(m.date, lang)}`
    });
  };

  const handleExecuteDelete = async () => {
    if (deleteConfirm.type === 'entity') {
      const updatedEntities = entities.filter(e => e.id !== deleteConfirm.id);
      const updatedMovements = movements.filter(m => m.entityId !== deleteConfirm.id);
      const updatedDb: DBState = {
        ...db,
        nonTickerEntities: updatedEntities,
        nonTickerMovements: updatedMovements
      };
      if (selectedEntityId === deleteConfirm.id) {
        setSelectedEntityId('ALL');
      }
      await saveDatabaseState(updatedDb);
    } else {
      const updatedMovements = movements.filter(m => m.id !== deleteConfirm.id);
      const updatedDb: DBState = {
        ...db,
        nonTickerMovements: updatedMovements
      };
      await saveDatabaseState(updatedDb);
    }
    setDeleteConfirm({ open: false, type: 'entity', id: '', name: '' });
  };

  // Movement Types Manager Helpers
  const handleMoveTypeOrder = async (id: string, direction: 'UP' | 'DOWN') => {
    const list = [...movementTypeConfigs];
    const item = list.find(c => c.id === id);
    if (!item) return;

    // Filter by same direction to swap with adjacent item of same direction
    const sameDirList = list
      .filter(c => c.direction === item.direction)
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    const currentIndex = sameDirList.findIndex(c => c.id === id);
    if (direction === 'UP' && currentIndex > 0) {
      const swapWith = sameDirList[currentIndex - 1];
      const tempOrder = item.order || (currentIndex + 1);
      item.order = swapWith.order || currentIndex;
      swapWith.order = tempOrder;
    } else if (direction === 'DOWN' && currentIndex < sameDirList.length - 1) {
      const swapWith = sameDirList[currentIndex + 1];
      const tempOrder = item.order || (currentIndex + 1);
      item.order = swapWith.order || (currentIndex + 2);
      swapWith.order = tempOrder;
    }

    const updatedDb: DBState = {
      ...db,
      nonTickerMovementTypes: list
    };
    await saveDatabaseState(updatedDb);
  };

  const handleUpdateTypeName = async (id: string, newName: string) => {
    if (!newName.trim()) return;
    const updated = movementTypeConfigs.map(c =>
      c.id === id ? { ...c, name: newName.trim() } : c
    );
    const updatedDb: DBState = {
      ...db,
      nonTickerMovementTypes: updated
    };
    await saveDatabaseState(updatedDb);
  };

  const handleAddNewType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTypeInput.name.trim()) return;

    const newId = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const maxOrder = Math.max(
      0,
      ...movementTypeConfigs.filter(c => c.direction === newTypeInput.direction).map(c => c.order || 0)
    );

    const newConfig: NonTickerMovementTypeConfig = {
      id: newId,
      name: newTypeInput.name.trim(),
      direction: newTypeInput.direction,
      isDefault: false,
      order: maxOrder + 1
    };

    const updated = [...movementTypeConfigs, newConfig];
    const updatedDb: DBState = {
      ...db,
      nonTickerMovementTypes: updated
    };
    await saveDatabaseState(updatedDb);
    setNewTypeInput(prev => ({ ...prev, name: '' }));
  };

  const handleDeleteType = async (id: string) => {
    const isUsed = movements.some(m => m.type === id);
    if (isUsed) {
      alert(t.cannotDeleteUsedTypeAlert || 'Questa tipologia è attualmente utilizzata in una o più registrazioni storiche e non può essere eliminata.');
      return;
    }
    const updated = movementTypeConfigs.filter(c => c.id !== id);
    const updatedDb: DBState = {
      ...db,
      nonTickerMovementTypes: updated
    };
    await saveDatabaseState(updatedDb);
  };

  const handleResetTypesToDefault = async () => {
    const updatedDb: DBState = {
      ...db,
      nonTickerMovementTypes: DEFAULT_NON_TICKER_MOVEMENT_TYPES
    };
    await saveDatabaseState(updatedDb);
  };

  // Auto-calculate Net Return when Gross or Tax changes
  const handleGrossChange = (val: string) => {
    const gross = parseFloat(val) || 0;
    const tax = parseFloat(movementForm.taxAmount) || 0;
    setMovementForm(prev => ({
      ...prev,
      grossReturn: val,
      netReturn: Math.max(0, gross - tax).toString()
    }));
  };

  const handleTaxChange = (val: string) => {
    const tax = parseFloat(val) || 0;
    const gross = parseFloat(movementForm.grossReturn) || 0;
    setMovementForm(prev => ({
      ...prev,
      taxAmount: val,
      netReturn: Math.max(0, gross - tax).toString()
    }));
  };

  const handleSaveTablePreferences = async (prefs: NonTickerTablePreferences) => {
    const updatedDb: DBState = {
      ...db,
      settings: {
        ...db.settings,
        nonTickerTablePreferences: prefs
      }
    };
    await saveDatabaseState(updatedDb);
  };

  return (
    <div className="space-y-6 animate-fade-in text-slate-100 pb-16">
      {/* HEADER SECTION */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="p-2.5 bg-emerald-500/10 rounded-2xl text-emerald-400 border border-emerald-500/20 shadow-inner">
              <Landmark className="w-6 h-6" />
            </span>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                {t.nonTickerTitle || 'Attività e Investimenti Senza Ticker'}
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/60 uppercase">
                  {entities.length} {entities.length === 1 ? (t.entitySingular || 'entità') : (t.entitiesPlural || 'entità')}
                </span>
              </h1>
              <p className="text-xs text-slate-400 max-w-3xl leading-relaxed mt-0.5">
                {t.nonTickerDesc ||
                  'Monitoraggio per fondi pensione, conti deposito, liquidità remunerata, TFR e polizze con tracciamento temporale del capitale, rendimenti lordi/netti, imposte, quote/NAV, TWRR e MWRR/IRR.'}
              </p>
            </div>
          </div>
        </div>

        {/* TOP ACTION BUTTONS */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleOpenNewEntity}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 hover:border-slate-600 rounded-xl transition cursor-pointer shadow-sm"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-400" />
            <span>{t.newEntityBtn || 'Nuova Entità'}</span>
          </button>

          <button
            type="button"
            disabled={entities.length === 0}
            onClick={() => handleOpenNewMovement('CAPITAL')}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition cursor-pointer shadow-sm ${
              entities.length === 0
                ? 'opacity-40 cursor-not-allowed bg-slate-900 border border-slate-800 text-slate-500'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/20'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.newMovementBtn || 'Registra Flusso'}</span>
          </button>

          <button
            type="button"
            disabled={entities.length === 0}
            onClick={() => handleOpenNewMovement('VALUATION')}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition cursor-pointer shadow-sm ${
              entities.length === 0
                ? 'opacity-40 cursor-not-allowed bg-slate-900 border border-slate-800 text-slate-500'
                : 'bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30'
            }`}
            title={t.newValuationTooltip || "Registra saldo o controvalore certificato dall'estratto conto periodico"}
          >
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>{t.newValuationBtn || 'Rileva Saldo'}</span>
          </button>

          <button
            type="button"
            disabled={entities.length === 0}
            onClick={() => handleOpenNewMovement('RETURN')}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition cursor-pointer shadow-sm ${
              entities.length === 0
                ? 'opacity-40 cursor-not-allowed bg-slate-900 border border-slate-800 text-slate-500'
                : 'bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30'
            }`}
            title={t.newReturnTooltip || "Registra interessi, cedole o rivalutazione con distinzione tra lordo e imposte"}
          >
            <Percent className="w-3.5 h-3.5 text-indigo-400" />
            <span>{t.newReturnBtn || 'Registra Rendimento'}</span>
          </button>

          <button
            type="button"
            onClick={() => setImportModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-violet-300 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 hover:border-violet-500/50 rounded-xl transition cursor-pointer shadow-sm"
            title={t.importMovementsBtn || 'Importa movimenti da file esterno (Trade Republic CSV, ecc.)'}
          >
            <FileUp className="w-3.5 h-3.5 text-violet-400" />
            <span>{t.importMovementsBtn || 'Importa'}</span>
          </button>

          <button
            type="button"
            onClick={() => setManageTypesForm({ open: true })}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-xl transition cursor-pointer"
            title={t.manageMovementTypesTooltip || "Personalizza, ordina e definisci le tipologie di movimento"}
          >
            <Sliders className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">{t.movementTypesShort || 'Tipologie'}</span>
          </button>
        </div>
      </div>

      {/* ================= ERGONOMIC ANALYSIS PERIMETER (DASHBOARD STYLE) ================= */}
      {entities.length > 0 ? (
        <div className="bg-slate-900/60 p-4 sm:p-5 rounded-3xl border border-slate-800/80 backdrop-blur-md space-y-4 shadow-xl">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                <Activity className="w-5 h-5" />
              </span>
              <div>
                <h4 className="font-mono text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  {t.analysisPerimeterLabel || 'PERIMETRO DI ANALISI'}
                </h4>
                <div className="text-white text-sm font-black tracking-tight flex items-center gap-2">
                  <span>{t.currentViewLabel || 'Vista:'}</span>
                  <span className="text-emerald-400 font-extrabold px-2.5 py-0.5 bg-emerald-950/40 border border-emerald-500/20 rounded-xl text-xs uppercase font-mono">
                    {selectedEntityId === 'ALL'
                      ? (t.allEntitiesOption || 'Tutte le Attività (Globale)')
                      : `${currentEntityObj?.name || selectedEntityId}`}
                  </span>
                </div>
              </div>
            </div>

            {/* Scope Toggles */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedEntityId('ALL')}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-xl border cursor-pointer transition-all duration-300 flex items-center gap-1.5 ${
                  selectedEntityId === 'ALL'
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-950/40'
                    : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{t.allEntitiesOption || 'Tutte le Attività'}</span>
                <span className="px-1.5 py-0.2 rounded-md bg-slate-900/80 text-[10px] font-mono">
                  {entities.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (selectedEntityId === 'ALL' && entities.length > 0) {
                    setSelectedEntityId(entities[0].id);
                  }
                }}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-xl border cursor-pointer transition-all duration-300 flex items-center gap-1.5 ${
                  selectedEntityId !== 'ALL'
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-950/40'
                    : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-white'
                }`}
              >
                <Landmark className="w-3.5 h-3.5" />
                <span>{t.singleEntityOption || 'Singola Attività'}</span>
              </button>
            </div>
          </div>

          {/* Sub-selector Dropdown when Single Entity is selected */}
          {selectedEntityId !== 'ALL' && (
            <div className="pt-3 border-t border-slate-800/60 animate-fade-in flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
                <span className="text-xs text-slate-400 font-bold sm:w-44 shrink-0">
                  {t.selectEntityAndFund || 'Seleziona Attività / Fondo:'}
                </span>
                <select
                  value={selectedEntityId}
                  onChange={e => setSelectedEntityId(e.target.value)}
                  className="bg-slate-950/90 text-white border border-slate-800 text-xs px-3.5 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 w-full sm:max-w-md font-semibold cursor-pointer"
                >
                  {entities.map(ent => (
                    <option key={ent.id} value={ent.id}>
                      {ent.name} — {getCategoryLabel(ent.category)} ({ent.currency || 'EUR'})
                    </option>
                  ))}
                </select>
              </div>

              {currentEntityObj && (
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => handleOpenEditEntity(currentEntityObj)}
                    className="text-xs text-slate-300 hover:text-white flex items-center gap-1 hover:underline cursor-pointer px-2.5 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 transition border border-slate-700/40"
                  >
                    <Edit className="w-3 h-3 text-emerald-400" />
                    <span>{t.editEntityBtn || 'Modifica'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRequestDeleteEntity(currentEntityObj)}
                    className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 hover:underline cursor-pointer px-2.5 py-1.5 rounded-lg bg-rose-950/20 hover:bg-rose-950/40 transition border border-rose-900/30"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>{t.deleteEntityBtn || 'Elimina'}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Empty State */
        <div className="p-8 sm:p-12 text-center bg-slate-900/30 border border-slate-800/80 rounded-3xl space-y-4">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-inner">
            <PiggyBank className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-base font-black text-white">
              {t.noEntitiesConfigured || 'Nessuna attività o fondo senza ticker registrato'}
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              {t.createFirstEntityPrompt ||
                'Crea la prima entità (es. Fondo Pensione, Conto Deposito, TFR aziendale, Polizza) per iniziare a tracciare flussi, quote e rendimenti.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenNewEntity}
            className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition shadow-lg shadow-emerald-950/30 cursor-pointer"
          >
            {t.addFirstEntityBtn || t.newEntityBtn || 'Aggiungi la prima entità'}
          </button>
        </div>
      )}

      {/* ================= SUMMARY CARDS (DASHBOARD STYLE) ================= */}
      <div className="space-y-3">
        {/* Row 1: Primary Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Controvalore Attuale */}
          <div className="bg-slate-900/40 border border-slate-800/80 p-4 rounded-2xl relative overflow-hidden backdrop-blur-md shadow-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1.5">
              <span className="font-semibold">{t.currentTotalValue || 'Controvalore Attuale'}</span>
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="text-lg sm:text-2xl font-black text-white font-mono tracking-tight">
              {formatCurrency(metrics.currentValue, selectedCurrency)}
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-1 flex items-center gap-1 truncate">
              <span>{t.lastValuationDate || 'Ultima rilevazione'}:</span>
              <strong className="text-slate-300 truncate">
                {metrics.lastValuationDate ? formatDateString(metrics.lastValuationDate, lang) : (t.cashFlowsOnly || 'Flussi cassa')}
              </strong>
            </div>
          </div>

          {/* Capitale Netto Versato */}
          <div className="bg-slate-900/40 border border-slate-800/80 p-4 rounded-2xl relative overflow-hidden backdrop-blur-md shadow-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1.5">
              <span className="font-semibold">{t.netInvestedCapital || 'Capitale Netto Versato'}</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div className="text-lg sm:text-2xl font-black text-white font-mono tracking-tight">
              {formatCurrency(metrics.netInvested, selectedCurrency)}
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-1 truncate">
              +{formatCurrency(metrics.totalInflows, selectedCurrency)} / -{formatCurrency(metrics.totalOutflows, selectedCurrency)}
              {includeCommissions && metrics.totalCommissions > 0 && (
                <span className="text-amber-400/90 ml-1">
                  (incl. {formatCurrency(metrics.totalCommissions, selectedCurrency)} {t.commissionsShort || 'comm.'})
                </span>
              )}
            </div>
          </div>

          {/* Commissioni e Spese Complessive */}
          <div className="bg-slate-900/40 border border-slate-800/80 p-4 rounded-2xl relative overflow-hidden backdrop-blur-md shadow-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1.5">
              <span className="font-semibold">{t.totalCommissionsLabel || 'Commissioni Complessive'}</span>
              <Coins className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-lg sm:text-2xl font-black text-amber-400 font-mono tracking-tight">
              {formatCurrency(metrics.totalCommissions, selectedCurrency)}
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-1">
              <span>{includeCommissions ? (t.includedInInvestedCapital || 'Incluse nel versato effettivo') : (t.excludedFromInvestedCapital || 'Escluse dal versato nominale')}</span>
            </div>
          </div>

          {/* Guadagno Netto Totale */}
          <div className="bg-slate-900/40 border border-slate-800/80 p-4 rounded-2xl relative overflow-hidden backdrop-blur-md shadow-sm">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1.5">
              <span className="font-semibold">{t.totalNetGain || 'Guadagno Netto Totale'}</span>
              <TrendingUp className={`w-3.5 h-3.5 ${metrics.netGain >= 0 ? 'text-emerald-400' : 'text-rose-400'}`} />
            </div>
            <div
              className={`text-lg sm:text-2xl font-black font-mono tracking-tight ${
                metrics.netGain >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {metrics.netGain >= 0 ? '+' : ''}
              {formatCurrency(metrics.netGain, selectedCurrency)}
            </div>
            <div className="text-[10px] font-mono mt-1">
              <span className="text-slate-400">{t.simpleReturnTitle || 'ROI'}: </span>
              <strong className={(metrics?.simpleReturnPct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {(metrics?.simpleReturnPct ?? 0) >= 0 ? '+' : ''}
                {(metrics?.simpleReturnPct ?? 0).toFixed(2)}%
              </strong>
            </div>
          </div>
        </div>

        {/* Row 2: Secondary Indicators (TWRR, MWRR, Units NAV) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* TWRR */}
          <div className="bg-slate-900/40 border border-slate-800/80 p-3.5 rounded-2xl relative overflow-hidden backdrop-blur-md">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <div className="flex items-center gap-1">
                <span className="font-semibold">TWRR</span>
                <span
                  className="cursor-help text-slate-500 hover:text-slate-300"
                  title={t.twrrTooltip || "Rendimento ponderato nel tempo che misura la pura performance gestionale dell'attività."}
                >
                  <HelpCircle className="w-3 h-3" />
                </span>
              </div>
              <Percent className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <div className="text-base sm:text-lg font-black text-white font-mono tracking-tight">
              {metrics?.twrrAnnualized !== null && metrics?.twrrAnnualized !== undefined ? (
                <span className={metrics.twrrAnnualized >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {metrics.twrrAnnualized >= 0 ? '+' : ''}
                  {metrics.twrrAnnualized.toFixed(2)}%
                </span>
              ) : metrics?.twrrCumulative !== null && metrics?.twrrCumulative !== undefined ? (
                <span className={metrics.twrrCumulative >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {metrics.twrrCumulative >= 0 ? '+' : ''}
                  {metrics.twrrCumulative.toFixed(2)}%
                </span>
              ) : (
                <span className="text-slate-500">—</span>
              )}
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
              {metrics?.twrrAnnualized !== null && metrics?.twrrAnnualized !== undefined ? (
                <span>{t.annualizedShort || 'annuo'} (cum. {metrics?.twrrCumulative != null ? metrics.twrrCumulative.toFixed(2) : '—'}%)</span>
              ) : (
                <span>{t.cumulativeShort || 'totale'}</span>
              )}
            </div>
          </div>

          {/* MWRR / IRR */}
          <div className="bg-slate-900/40 border border-slate-800/80 p-3.5 rounded-2xl relative overflow-hidden backdrop-blur-md">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <div className="flex items-center gap-1">
                <span className="font-semibold">MWRR / IRR</span>
                <span
                  className="cursor-help text-slate-500 hover:text-slate-300"
                  title={t.mwrrTooltip || "Tasso Interno di Rendimento (IRR) che tiene conto dell'esatto timing di ciascun versamento e prelievo."}
                >
                  <HelpCircle className="w-3 h-3" />
                </span>
              </div>
              <Scale className="w-3.5 h-3.5 text-violet-400" />
            </div>
            <div className="text-base sm:text-lg font-black text-white font-mono tracking-tight">
              {metrics?.mwrrAnnualized !== null && metrics?.mwrrAnnualized !== undefined ? (
                <span className={metrics.mwrrAnnualized >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {metrics.mwrrAnnualized >= 0 ? '+' : ''}
                  {metrics.mwrrAnnualized.toFixed(2)}%
                </span>
              ) : (
                <span className="text-slate-500">—</span>
              )}
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
              {metrics.mwrrAnnualized !== null ? (
                <span>{t.annualizedShort || 'annuo'} ({t.irrShort || 'TIR'})</span>
              ) : (
                <span>{t.insufficientData || 'Dati insufficienti'}</span>
              )}
            </div>
          </div>

          {/* Quote e PMC (se presenti) o Rendimenti Lordi */}
          {metrics.hasUnits ? (
            <>
              <div className="bg-cyan-950/20 border border-cyan-500/30 p-3.5 rounded-2xl relative overflow-hidden backdrop-blur-md">
                <div className="flex items-center justify-between text-cyan-300 text-xs mb-1">
                  <span className="font-semibold">{t.totalUnitsLabel || 'Quote Totali'}</span>
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <div className="text-base sm:text-lg font-black text-cyan-200 font-mono tracking-tight">
                  {metrics.totalUnits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  PMC: {metrics.averageUnitCost !== null ? `${formatCurrency(metrics.averageUnitCost, selectedCurrency)}/${t.unitShort || 'quota'}` : '—'}
                </div>
              </div>

              <div className="bg-emerald-950/20 border border-emerald-500/30 p-3.5 rounded-2xl relative overflow-hidden backdrop-blur-md">
                <div className="flex items-center justify-between text-emerald-300 text-xs mb-1">
                  <span className="font-semibold">{t.navPerUnitLabel || 'Valore Quota (NAV)'}</span>
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="text-base sm:text-lg font-black text-emerald-200 font-mono tracking-tight">
                  {metrics.currentUnitPrice !== null ? `${formatCurrency(metrics.currentUnitPrice, selectedCurrency)}/${t.unitShort || 'quota'}` : '—'}
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  {t.positionCalculatedInUnits || 'Posizione calcolata in quote'}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Rendimenti Lordi Riconosciuti */}
              <div className="bg-slate-900/40 border border-slate-800/80 p-3.5 rounded-2xl relative overflow-hidden backdrop-blur-md">
                <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                  <span className="font-semibold">{t.grossReturnsLabel || 'Rendimenti Lordi'}</span>
                  <Receipt className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="text-base sm:text-lg font-black text-white font-mono tracking-tight">
                  {formatCurrency(metrics.totalGrossReturn, selectedCurrency)}
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  {t.taxesLabel || 'Imposte'}: -{formatCurrency(metrics.totalTaxes, selectedCurrency)}
                </div>
              </div>

              {/* Rendimenti Netti Riconosciuti */}
              <div className="bg-slate-900/40 border border-slate-800/80 p-3.5 rounded-2xl relative overflow-hidden backdrop-blur-md">
                <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                  <span className="font-semibold">{t.netReturnsLabel || 'Rendimenti Netti'}</span>
                  <Percent className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="text-base sm:text-lg font-black text-emerald-400 font-mono tracking-tight">
                  +{formatCurrency(metrics.totalNetReturn, selectedCurrency)}
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  {t.averageTaxRate || 'Aliquota media'}: {metrics.effectiveTaxRate.toFixed(1)}%
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ================= COMMISSIONS TOGGLE CONTROL (DASHBOARD REFERENCE) ================= */}
      <div className="bg-slate-900/40 border border-slate-800/80 p-3.5 sm:p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 backdrop-blur-md shadow-sm">
        <div className="flex items-center gap-2.5">
          <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
            <Coins className="w-4 h-4" />
          </span>
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-2">
              <span>{t.includeCommissionsToggle || 'Commissioni nei calcoli'}</span>
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                  includeCommissions
                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {includeCommissions ? (t.includedBadge || 'INCLUSE') : (t.excludedBadge || 'ESCLUSE')}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {t.commissionsExternalDesc
                ? t.commissionsExternalDesc.replace('{amount}', formatCurrency(metrics.totalCommissions, selectedCurrency))
                : `Gestite come costi esterni al capitale versato (${formatCurrency(metrics.totalCommissions, selectedCurrency)} complessive registrate)`}
            </p>
          </div>
        </div>

        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setIncludeCommissions(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              !includeCommissions
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.excludeCommissionsBtn || 'Escludi commissioni'}
          </button>
          <button
            type="button"
            onClick={() => setIncludeCommissions(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              includeCommissions
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.includeCommissionsBtn || 'Includi commissioni'}
          </button>
        </div>
      </div>

      {/* ================= HISTORICAL CAPITAL EVOLUTION CHART & TIMEFRAME SELECTOR ================= */}
      <div className="bg-slate-900/40 border border-slate-800/80 p-5 sm:p-6 rounded-3xl space-y-4 shadow-sm backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/70 pb-3">
          <div className="flex flex-col gap-1">
            <h3 className="font-extrabold text-sm sm:text-base text-white tracking-tight flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span>{t.trendCapitalTitle || t.capitalEvolutionTitle || 'Trend Storico del Capitale'}</span>
            </h3>
            {filteredTimeline.length > 0 && (
              <span className="text-xs text-slate-400 font-mono">
                {`${t.analyzedPeriod || 'Periodo analizzato'}: ${getPeriodDaysLabel()} (${formatDateString(filteredTimeline[0].date, lang)} - ${formatDateString(filteredTimeline[filteredTimeline.length - 1].date, lang)})`}
              </span>
            )}
            <p className="text-xs text-slate-400 mt-0.5">
              {t.capitalEvolutionDesc ||
                "Confronto dinamico dell'andamento temporale tra Capitale Netto Versato e Saldo / Controvalore Effettivo."}
            </p>
          </div>

          {/* Timeframe Filter Buttons (Matching Dashboard standard: 1M, 3M, 6M, 1Y, 3Y, 5Y, YTD, ALL, CUSTOM) */}
          <div className="flex flex-wrap items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800 self-start sm:self-auto">
            {(['1M', '3M', '6M', '1Y', '3Y', '5Y', 'YTD', 'ALL', 'CUSTOM'] as const).map(tf => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition cursor-pointer ${
                  timeframe === tf
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Date Range Picker when CUSTOM is selected */}
        {timeframe === 'CUSTOM' && (
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex flex-wrap items-center gap-3 text-xs animate-fade-in">
            <div className="flex items-center gap-1.5 text-slate-300 font-medium">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t.customDateRangeLabel || 'Intervallo Personalizzato'}:</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">{t.fromDateLabel || 'Da'}:</span>
              <input
                type="date"
                value={customStartDate}
                onChange={e => setCustomStartDate(e.target.value)}
                className="bg-slate-900 border border-slate-700 px-2.5 py-1 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-emerald-500/60"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">{t.toDateLabel || 'A'}:</span>
              <input
                type="date"
                value={customEndDate}
                onChange={e => setCustomEndDate(e.target.value)}
                className="bg-slate-900 border border-slate-700 px-2.5 py-1 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-emerald-500/60"
              />
            </div>
          </div>
        )}

        {/* SVG Interactive Chart Component */}
        <NonTickerEvolutionChart
          data={filteredTimeline}
          currency={selectedCurrency}
          lang={lang}
          t={t}
        />
      </div>

      {/* ================= PERIOD PERFORMANCE SECTION (DASHBOARD STYLE) ================= */}
      <div className="bg-slate-900/40 border border-slate-800/80 p-4 sm:p-5 rounded-3xl space-y-3.5 backdrop-blur-md shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/70 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20">
              <Activity className="w-4 h-4" />
            </span>
            <div>
              <h4 className="font-extrabold text-xs sm:text-sm text-white uppercase font-mono tracking-wide">
                {t.periodPerformanceTitle || 'Performance di Periodo'} ({timeframe})
              </h4>
              <span className="text-[10px] text-slate-400 font-mono">
                {formatDateString(periodPerformance.startDate, lang)} → {formatDateString(periodPerformance.endDate, lang)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono font-bold">
            <span className="text-slate-400">{t.balanceLabel || 'Saldo'}:</span>
            <span className="text-slate-300">{formatCurrency(periodPerformance.startBalance, selectedCurrency)}</span>
            <span className="text-slate-500">→</span>
            <span className="text-emerald-400">{formatCurrency(periodPerformance.endBalance, selectedCurrency)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {/* Guadagno Netto Periodo */}
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block font-semibold">
              {t.periodNetGainLabel || 'Guadagno Netto'}
            </span>
            <span
              className={`text-sm sm:text-base font-bold font-mono mt-0.5 block ${
                (periodPerformance?.netGain ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {(periodPerformance?.netGain ?? 0) >= 0 ? '+' : ''}
              {formatCurrency(periodPerformance?.netGain ?? 0, selectedCurrency)}
            </span>
            <span className="text-[9px] text-slate-500 font-mono">
              {t.simpleReturnTitle || 'ROI'}: {(periodPerformance?.simpleReturnPct ?? 0) >= 0 ? '+' : ''}{(periodPerformance?.simpleReturnPct ?? 0).toFixed(2)}%
            </span>
          </div>

          {/* TWRR Periodo */}
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block font-semibold">
              {t.periodTwrrLabel || 'TWRR di Periodo'}
            </span>
            <span className="text-sm sm:text-base font-bold font-mono mt-0.5 block">
              {(periodPerformance?.twrr?.cumulative ?? periodPerformance?.twrrCumulative) != null ? (
                <span className={(periodPerformance?.twrr?.cumulative ?? periodPerformance?.twrrCumulative)! >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {(periodPerformance?.twrr?.cumulative ?? periodPerformance?.twrrCumulative)! >= 0 ? '+' : ''}
                  {(periodPerformance?.twrr?.cumulative ?? periodPerformance?.twrrCumulative)!.toFixed(2)}%
                </span>
              ) : (
                <span className="text-slate-500">—</span>
              )}
            </span>
            <span className="text-[9px] text-slate-500 font-mono">
              {(periodPerformance?.twrr?.annualized ?? periodPerformance?.twrrAnnualized) != null
                ? `${t.annualizedShort || 'annuo'} ${(periodPerformance?.twrr?.annualized ?? periodPerformance?.twrrAnnualized)!.toFixed(2)}%`
                : (t.cumulativeShort || 'cumulativo')}
            </span>
          </div>

          {/* MWRR / IRR Periodo */}
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block font-semibold">
              {t.periodMwrrLabel || 'MWRR di Periodo'}
            </span>
            <span className="text-sm sm:text-base font-bold font-mono mt-0.5 block">
              {(periodPerformance?.mwrr?.annualized ?? periodPerformance?.mwrrAnnualized) != null ? (
                <span className={(periodPerformance?.mwrr?.annualized ?? periodPerformance?.mwrrAnnualized)! >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {(periodPerformance?.mwrr?.annualized ?? periodPerformance?.mwrrAnnualized)! >= 0 ? '+' : ''}
                  {(periodPerformance?.mwrr?.annualized ?? periodPerformance?.mwrrAnnualized)!.toFixed(2)}%
                </span>
              ) : (
                <span className="text-slate-500">—</span>
              )}
            </span>
            <span className="text-[9px] text-slate-500 font-mono">{t.periodIrrLabel || 'TIR di periodo'}</span>
          </div>

          {/* Capitale Netto Periodo */}
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block font-semibold">
              {t.periodNetInvestedLabel || 'Capitale Netto Periodo'}
            </span>
            <span className="text-sm sm:text-base font-bold font-mono text-white mt-0.5 block">
              {formatCurrency(periodPerformance?.netInvested ?? 0, selectedCurrency)}
            </span>
            <span className="text-[9px] text-slate-500 font-mono truncate block">
              +{formatCurrency(periodPerformance?.inflows ?? 0, selectedCurrency)} / -{formatCurrency(periodPerformance?.outflows ?? 0, selectedCurrency)}
            </span>
          </div>

          {/* Commissioni Periodo */}
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block font-semibold">
              {t.periodCommissionsLabel || 'Commissioni Periodo'}
            </span>
            <span className="text-sm sm:text-base font-bold font-mono text-amber-400 mt-0.5 block">
              {formatCurrency(periodPerformance?.commissions ?? 0, selectedCurrency)}
            </span>
            <span className="text-[9px] text-slate-500 font-mono">{t.externalCostsShort || 'Costi esterni'}</span>
          </div>

          {/* Rendimenti Netti Periodo */}
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
            <span className="text-[10px] text-slate-400 block font-semibold">
              {t.periodNetReturnsLabel || 'Rendimenti Netti'}
            </span>
            <span className="text-sm sm:text-base font-bold font-mono text-emerald-400 mt-0.5 block">
              +{formatCurrency(periodPerformance?.netReturn ?? periodPerformance?.netReturns ?? 0, selectedCurrency)}
            </span>
            <span className="text-[9px] text-slate-500 font-mono truncate block">
              {t.grossShort || 'Lordo'}: {formatCurrency(periodPerformance?.grossReturn ?? periodPerformance?.grossReturns ?? 0, selectedCurrency)}
            </span>
          </div>
        </div>
      </div>

      {/* ================= TWO BALANCED MODULES: FLOW BREAKDOWN & TAX/YIELD ANALYSIS (PERIOD-FILTERED) ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
        {/* Module 1: Spaccato Flussi di Capitale del Periodo */}
        <div className="bg-slate-900/40 border border-slate-800/80 p-5 sm:p-6 rounded-3xl space-y-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-slate-800/70 pb-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-blue-500/10 rounded-xl text-blue-400 border border-blue-500/20">
                <ArrowUpRight className="w-4 h-4" />
              </span>
              <div>
                <h3 className="font-extrabold text-sm text-white tracking-wide uppercase font-mono">
                  {t.flowBreakdownTitle || 'Spaccato dei Flussi di Capitale'}
                </h3>
                <span className="text-[10px] text-slate-400 font-mono">
                  {t.selectedPeriodLabel || 'Periodo selezionato'} ({timeframe})
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono font-bold">
              <span className="text-slate-300">
                +{formatCurrency(periodPerformance.inflows, selectedCurrency)}
              </span>
              {periodPerformance.outflows > 0 && (
                <span className="text-rose-400">
                  -{formatCurrency(periodPerformance.outflows, selectedCurrency)}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-3 pt-1">
            {periodUsedFlows.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs">
                {t.noCapitalFlowsInPeriod || 'Nessun flusso di capitale registrato nel periodo selezionato'}
              </div>
            ) : (
              <>
                {/* Flussi in Entrata effettivamente utilizzati */}
                {periodUsedFlows.filter(f => f.direction === 'INFLOW').length > 0 && (
                  <div className="space-y-2.5">
                    <span className="text-[10px] font-mono uppercase font-bold text-slate-400 tracking-wider block">
                      {t.inflowsAndDepositsTitle || 'Entrate e Versamenti'} ({formatCurrency(periodPerformance.inflows, selectedCurrency)})
                    </span>
                    {periodUsedFlows.filter(f => f.direction === 'INFLOW').map(f => (
                      <div key={f.type} className="space-y-1">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-300 font-medium flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                            <span>{getMovementTypeName(f.type)}</span>
                            {f.units > 0 && (
                              <span className="text-[10px] text-cyan-400 font-mono">
                                (<QuantityDisplay value={f.units} /> {t.unitsPlural || 'quote'})
                              </span>
                            )}
                          </span>
                          <span className="font-mono font-bold text-slate-200">
                            {formatCurrency(f.amount, selectedCurrency)}{' '}
                            <span className="text-[10px] text-slate-400 font-normal">
                              ({f.pct.toFixed(1)}%)
                            </span>
                          </span>
                        </div>
                        <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-sky-500 h-1.5 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max(0, f.pct))}%` }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Flussi in Uscita effettivamente utilizzati */}
                {periodUsedFlows.filter(f => f.direction === 'OUTFLOW').length > 0 && (
                  <div className="space-y-2.5 pt-2 border-t border-slate-800/60">
                    <span className="text-[10px] font-mono uppercase font-bold text-rose-400/80 tracking-wider block">
                      {t.outflowsAndWithdrawalsTitle || 'Uscite e Prelievi'} (-{formatCurrency(periodPerformance.outflows, selectedCurrency)})
                    </span>
                    {periodUsedFlows.filter(f => f.direction === 'OUTFLOW').map(f => (
                      <div key={f.type} className="space-y-1">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-rose-300 font-medium flex items-center gap-1.5">
                            <ArrowDownRight className="w-3 h-3 text-rose-400" />
                            <span>{getMovementTypeName(f.type)}</span>
                            {f.units > 0 && (
                              <span className="text-[10px] text-rose-400 font-mono">
                                (<QuantityDisplay value={f.units} /> {t.unitsPlural || 'quote'})
                              </span>
                            )}
                          </span>
                          <span className="font-mono font-bold text-rose-400">
                            -{formatCurrency(f.amount, selectedCurrency)}{' '}
                            <span className="text-[10px] text-rose-300 font-normal">
                              ({f.pct.toFixed(1)}%)
                            </span>
                          </span>
                        </div>
                        <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-rose-500 h-1.5 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max(0, f.pct))}%` }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Module 2: Analisi Fiscale e Rendimenti del Periodo */}
        <div className="bg-slate-900/40 border border-slate-800/80 p-5 sm:p-6 rounded-3xl space-y-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-slate-800/70 pb-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20">
                <Receipt className="w-4 h-4" />
              </span>
              <div>
                <h3 className="font-extrabold text-sm text-white tracking-wide uppercase font-mono">
                  {t.summaryStatisticsTitle || 'Analisi Fiscale e Rendimenti'}
                </h3>
                <span className="text-[10px] text-slate-400 font-mono">
                  {t.selectedPeriodLabel || 'Periodo selezionato'} ({timeframe})
                </span>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-400">
              +{formatCurrency(periodTaxAnalysis.net, selectedCurrency)} {t.netLabel || 'netti'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            {/* Rendimento Lordo */}
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
              <span className="text-[10px] text-slate-400 block font-semibold">
                {t.totalGrossReturns || 'Rendimenti Lordi Periodo'}
              </span>
              <span className="text-sm font-bold font-mono text-white mt-0.5 block">
                {formatCurrency(periodTaxAnalysis.gross, selectedCurrency)}
              </span>
            </div>

            {/* Imposte Totali */}
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
              <span className="text-[10px] text-slate-400 block font-semibold">
                {t.totalTaxesPaid || 'Imposte Applicate Periodo'}
              </span>
              <span className="text-sm font-bold font-mono text-rose-400 mt-0.5 block">
                -{formatCurrency(periodTaxAnalysis.taxes, selectedCurrency)}
              </span>
            </div>

            {/* Aliquota Fiscale Effettiva */}
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
              <span className="text-[10px] text-slate-400 block font-semibold">
                {t.effectiveTaxRate || 'Aliquota Fiscale Effettiva'}
              </span>
              <span className="text-sm font-bold font-mono text-amber-400 mt-0.5 block">
                {periodTaxAnalysis.effectiveTaxRate.toFixed(2)}%
              </span>
            </div>

            {/* Rendimento Netto */}
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
              <span className="text-[10px] text-slate-400 block font-semibold">
                {t.totalNetReturns || 'Rendimento Netto Periodo'}
              </span>
              <span className="text-sm font-bold font-mono text-emerald-400 mt-0.5 block">
                {formatCurrency(periodTaxAnalysis.net, selectedCurrency)}
              </span>
            </div>
          </div>

          {/* Destinazione proventi: Reinvestiti vs Liquidati */}
          <div className="pt-2 border-t border-slate-800/60 space-y-1.5 text-xs text-slate-300">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">{t.reinvestedInBalance || 'Reinvestiti nel Saldo'}:</span>
              <span className="font-mono font-bold text-slate-200">
                {formatCurrency(periodTaxAnalysis.reinvested, selectedCurrency)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">{t.paidOutExternal || 'Accreditati su Conto Esterno'}:</span>
              <span className="font-mono font-bold text-slate-200">
                {formatCurrency(periodTaxAnalysis.liquidated, selectedCurrency)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ================= ADVANCED ANALYTICAL MOVEMENTS TABLE ================= */}
      <NonTickerAnalyticsTable
        movements={movements}
        entities={entities}
        movementTypeConfigs={movementTypeConfigs}
        selectedEntityId={selectedEntityId}
        onSelectEntityId={setSelectedEntityId}
        selectedCurrency={selectedCurrency}
        t={t}
        lang={lang}
        onEditMovement={handleOpenEditMovement}
        onRequestDeleteMovement={handleRequestDeleteMovement}
        initialPreferences={db.settings?.nonTickerTablePreferences}
        onSavePreferences={handleSaveTablePreferences}
        getCategoryIcon={getCategoryIcon}
        getMovementTypeName={getMovementTypeName}
      />

      {/* ================= MODAL 1: ADD / EDIT ENTITY (via ModalPortal) ================= */}
      {entityForm.open && (
        <ModalPortal isOpen={entityForm.open}>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-hidden animate-fade-in"
            dir={lang === 'ar' ? 'rtl' : 'ltr'}
            onClick={e => {
              if (e.target === e.currentTarget) {
                setEntityForm(prev => ({ ...prev, open: false }));
              }
            }}
          >
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl max-w-md w-full relative space-y-4 max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col overflow-y-auto custom-scrollbar my-auto">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20">
                    <Landmark className="w-4 h-4" />
                  </span>
                  <h3 className="font-extrabold text-base text-white">
                    {entityForm.editId ? t.editEntityBtn || 'Modifica Entità' : t.newEntityBtn || 'Nuova Entità'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setEntityForm(prev => ({ ...prev, open: false }))}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveEntity} className="space-y-4 text-xs">
                <div className="space-y-1.5">
                  <label className="text-slate-400 font-semibold block">{t.entityNameLabel || 'Nome Attività o Fondo'} *</label>
                  <input
                    type="text"
                    required
                    placeholder={t.entityNamePlaceholder || 'es. Fondo Pensione Cometa, Conto BBVA, TFR Azienda'}
                    value={entityForm.name}
                    onChange={e => setEntityForm({ ...entityForm, name: e.target.value })}
                    className="w-full bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl text-white focus:outline-none focus:border-emerald-500/60"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-400 font-semibold block">{t.entityCategoryLabel || 'Tipologia Entità'}</label>
                  <select
                    value={entityForm.category}
                    onChange={e => setEntityForm({ ...entityForm, category: e.target.value as NonTickerCategory })}
                    className="w-full bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl text-white focus:outline-none focus:border-emerald-500/60 cursor-pointer"
                  >
                    <option value="PENSION_FUND">{t.categoryPensionFund || 'Fondo Pensione (negoziale, aperto, PIP)'}</option>
                    <option value="SAVINGS_ACCOUNT">{t.categorySavingsAccount || 'Conto Deposito / Liquidità Remunerata'}</option>
                    <option value="COMPANY_TFR">{t.categoryCompanyTfr || 'TFR in Azienda / Tesoreria'}</option>
                    <option value="INSURANCE_POLICY">{t.categoryInsurancePolicy || 'Polizza Vita / Capitale Garantito'}</option>
                    <option value="PRIVATE_INVESTMENT">{t.categoryPrivateInvestment || 'Investimento Diretto / P2P Lending'}</option>
                    <option value="OTHER">{t.categoryOther || 'Altra Attività Finanziaria'}</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Currency synchronized with app active currencies */}
                  <div className="space-y-1.5">
                    <label className="text-slate-400 font-semibold block">{t.entityCurrencyLabel || 'Valuta'}</label>
                    <select
                      value={entityForm.currency}
                      onChange={e => setEntityForm({ ...entityForm, currency: e.target.value })}
                      className="w-full bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl text-white focus:outline-none focus:border-emerald-500/60 font-mono cursor-pointer"
                    >
                      {availableCurrencies.map(c => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-slate-400 font-semibold block">
                      {t.entityIdentifierLabel || 'Identificativo / IBAN'}
                    </label>
                    <input
                      type="text"
                      placeholder={t.entityIdentifierPlaceholder || 'es. N. Posizione, IBAN'}
                      value={entityForm.identifier}
                      onChange={e => setEntityForm({ ...entityForm, identifier: e.target.value })}
                      className="w-full bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl text-white focus:outline-none focus:border-emerald-500/60 font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-400 font-semibold block">{t.notesOrDetailsLabel || t.notes || 'Note o Dettagli'}</label>
                  <textarea
                    rows={2}
                    placeholder={t.entityNotesPlaceholder || 'Comparto di investimento, orizzonte temporale, aliquota fiscale agevolata...'}
                    value={entityForm.notes}
                    onChange={e => setEntityForm({ ...entityForm, notes: e.target.value })}
                    className="w-full bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl text-white focus:outline-none focus:border-emerald-500/60 custom-scrollbar"
                  ></textarea>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => setEntityForm(prev => ({ ...prev, open: false }))}
                    className="px-4 py-2 rounded-xl text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 font-bold transition cursor-pointer"
                  >
                    {t.cancel || 'Annulla'}
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl text-white bg-emerald-600 hover:bg-emerald-500 font-bold transition shadow-lg shadow-emerald-950/20 cursor-pointer"
                  >
                    {t.save || 'Salva'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* ================= MODAL 2: ADD / EDIT MOVEMENT (via ModalPortal) ================= */}
      {movementForm.open && (
        <ModalPortal isOpen={movementForm.open}>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-hidden animate-fade-in"
            dir={lang === 'ar' ? 'rtl' : 'ltr'}
            onClick={e => {
              if (e.target === e.currentTarget) {
                setMovementForm(prev => ({ ...prev, open: false }));
              }
            }}
          >
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl max-w-lg w-full relative space-y-4 max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col overflow-y-auto custom-scrollbar my-auto">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20">
                    <Activity className="w-4 h-4" />
                  </span>
                  <h3 className="font-extrabold text-base text-white">
                    {movementForm.editId
                      ? t.editMovementBtn || 'Modifica Registrazione'
                      : movementForm.tab === 'VALUATION'
                      ? t.newValuationBtn || 'Rileva Valore / Saldo'
                      : movementForm.tab === 'RETURN'
                      ? t.newReturnBtn || 'Registra Rendimento'
                      : t.newMovementBtn || 'Registra Flusso di Capitale'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setMovementForm(prev => ({ ...prev, open: false }))}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Sub-Tabs: CAPITAL vs VALUATION vs RETURN */}
              {!movementForm.editId && (
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-950/80 rounded-2xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setMovementForm(prev => ({
                        ...prev,
                        tab: 'CAPITAL',
                        type: inflowConfigs[0]?.id || NonTickerMovementType.DEPOSIT
                      }));
                    }}
                    className={`py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      movementForm.tab === 'CAPITAL'
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    <span>{t.tabCapitalFlow || 'Flusso'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMovementForm(prev => ({
                        ...prev,
                        tab: 'VALUATION',
                        type: NonTickerMovementType.VALUATION
                      }));
                    }}
                    className={`py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      movementForm.tab === 'VALUATION'
                        ? 'bg-cyan-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>{t.tabValuation || 'Saldo / NAV'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMovementForm(prev => ({
                        ...prev,
                        tab: 'RETURN',
                        type: NonTickerMovementType.RETURN
                      }));
                    }}
                    className={`py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      movementForm.tab === 'RETURN'
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Percent className="w-3.5 h-3.5" />
                    <span>{t.tabReturn || 'Rendimento'}</span>
                  </button>
                </div>
              )}

              <form onSubmit={handleSaveMovement} className="space-y-4 text-xs pt-1">
                {/* Select Target Entity */}
                <div className="space-y-1.5">
                  <label className="text-slate-400 font-semibold block">{t.selectEntityLabel || 'Seleziona Attività / Fondo'} *</label>
                  <select
                    required
                    value={movementForm.entityId}
                    onChange={e => setMovementForm({ ...movementForm, entityId: e.target.value })}
                    className="w-full bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl text-white focus:outline-none focus:border-emerald-500/60 cursor-pointer"
                  >
                    {entities.map(ent => (
                      <option key={ent.id} value={ent.id}>
                        {ent.name} ({getCategoryLabel(ent.category)})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date */}
                <div className="space-y-1.5">
                  <label className="text-slate-400 font-semibold block">{t.operationDateLabel || t.date || 'Data Operazione'} *</label>
                  <input
                    type="date"
                    required
                    value={movementForm.date}
                    onChange={e => setMovementForm({ ...movementForm, date: e.target.value })}
                    className="w-full bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl text-white focus:outline-none focus:border-emerald-500/60 font-mono"
                  />
                </div>

                {/* MODE A: CAPITAL MOVEMENT */}
                {movementForm.tab === 'CAPITAL' && (
                  <>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-slate-400 font-semibold block">
                          {t.movementTypeLabel || 'Tipologia di Flusso'} *
                        </label>
                        <button
                          type="button"
                          onClick={() => setManageTypesForm({ open: true })}
                          className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Sliders className="w-3 h-3" />
                          <span>{t.manageCustomTypesBtn || 'Gestisci tipologie...'}</span>
                        </button>
                      </div>

                      <select
                        value={movementForm.type}
                        onChange={e => setMovementForm({ ...movementForm, type: e.target.value })}
                        className="w-full bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl text-white focus:outline-none focus:border-emerald-500/60 cursor-pointer font-medium"
                      >
                        <optgroup label={t.optgroupInflows || 'Entrate / Versamenti (+)'}>
                          {inflowConfigs.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label={t.optgroupOutflows || 'Uscite / Prelievi (-)'}>
                          {outflowConfigs.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-slate-400 font-semibold block">
                          {t.movementAmountLabel || 'Importo Flusso (€)'} *
                        </label>
                        <input
                          type="number"
                          step="any"
                          required
                          placeholder="0.00"
                          value={movementForm.amount}
                          onChange={e => setMovementForm({ ...movementForm, amount: e.target.value })}
                          className="w-full bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl text-white focus:outline-none focus:border-emerald-500/60 font-mono text-sm"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-slate-400 font-semibold block flex items-center justify-between">
                          <span>{t.movementUnitsLabel || 'Numero Quote'}</span>
                          <span className="text-[10px] text-slate-500 font-normal">{t.optionalBadge || 'Opzionale'}</span>
                        </label>
                        <input
                          type="number"
                          step="any"
                          placeholder="es. 12.4580"
                          value={movementForm.units}
                          onChange={e => {
                            const newUnits = e.target.value;
                            const u = parseFloat(newUnits);
                            const p = parseFloat(movementForm.unitPrice);
                            const shouldCalcAmount = (!movementForm.amount || parseFloat(movementForm.amount) === 0) && !isNaN(u) && !isNaN(p) && u > 0 && p > 0;
                            setMovementForm({
                              ...movementForm,
                              units: newUnits,
                              amount: shouldCalcAmount ? (u * p).toFixed(2) : movementForm.amount
                            });
                          }}
                          className="w-full bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl text-white focus:outline-none focus:border-emerald-500/60 font-mono text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-slate-400 font-semibold block flex items-center justify-between">
                          <span>{t.unitPriceLabel || 'Prezzo Unitario Quota (€)'}</span>
                          <span className="text-[10px] text-slate-500 font-normal">{t.optionalBadge || 'Opzionale'}</span>
                        </label>
                        <input
                          type="number"
                          step="any"
                          placeholder="es. 15.2500"
                          value={movementForm.unitPrice}
                          onChange={e => {
                            const newPrice = e.target.value;
                            const p = parseFloat(newPrice);
                            const u = parseFloat(movementForm.units);
                            const shouldCalcAmount = (!movementForm.amount || parseFloat(movementForm.amount) === 0) && !isNaN(u) && !isNaN(p) && u > 0 && p > 0;
                            setMovementForm({
                              ...movementForm,
                              unitPrice: newPrice,
                              amount: shouldCalcAmount ? (u * p).toFixed(2) : movementForm.amount
                            });
                          }}
                          className="w-full bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl text-white focus:outline-none focus:border-emerald-500/60 font-mono text-sm"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-amber-400/90 font-semibold block flex items-center justify-between">
                          <span>{t.movementFeeLabel || 'Commissioni / Spese (€)'}</span>
                          <span className="text-[10px] text-slate-500 font-normal">{t.externalCost || 'Costo esterno'}</span>
                        </label>
                        <input
                          type="number"
                          step="any"
                          placeholder="0.00"
                          value={movementForm.fee}
                          onChange={e => setMovementForm({ ...movementForm, fee: e.target.value })}
                          className="w-full bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl text-white focus:outline-none focus:border-amber-500/60 font-mono text-sm"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* MODE B: VALUATION SNAPSHOT */}
                {movementForm.tab === 'VALUATION' && (
                  <div className="space-y-3 bg-cyan-950/10 border border-cyan-500/20 p-4 rounded-2xl">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-cyan-300 font-semibold block">
                          {t.valuationAmountLabel || 'Controvalore Saldo (€)'} *
                        </label>
                        <input
                          type="number"
                          step="any"
                          required
                          placeholder="0.00"
                          value={movementForm.valuation}
                          onChange={e => setMovementForm({ ...movementForm, valuation: e.target.value })}
                          className="w-full bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl text-white focus:outline-none focus:border-cyan-500/60 font-mono text-sm"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-cyan-300 font-semibold block flex items-center justify-between">
                          <span>{t.balanceUnitsLabel || t.movementUnitsLabel || 'Quote Saldo'}</span>
                          <span className="text-[10px] text-slate-500 font-normal">{t.optionalShort || 'Opz.'}</span>
                        </label>
                        <input
                          type="number"
                          step="any"
                          placeholder="es. 1250.4580"
                          value={movementForm.units}
                          onChange={e => setMovementForm({ ...movementForm, units: e.target.value })}
                          className="w-full bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl text-white focus:outline-none focus:border-cyan-500/60 font-mono text-sm"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-cyan-300 font-semibold block flex items-center justify-between">
                          <span>{t.navPerUnitLabel || t.unitPriceLabel || 'NAV Quota (€)'}</span>
                          <span className="text-[10px] text-slate-500 font-normal">{t.optionalShort || 'Opz.'}</span>
                        </label>
                        <input
                          type="number"
                          step="any"
                          placeholder="es. 15.2500"
                          value={movementForm.unitPrice}
                          onChange={e => setMovementForm({ ...movementForm, unitPrice: e.target.value })}
                          className="w-full bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl text-white focus:outline-none focus:border-cyan-500/60 font-mono text-sm"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {t.valuationHelperText || "Inserisci il saldo finale o la posizione risultante dall'estratto conto periodico. Il sistema calcolerà automaticamente le plusvalenze non realizzate e la rivalutazione netta."}
                    </p>
                  </div>
                )}

                {/* MODE C: RECOGNIZED RETURN & TAXES */}
                {movementForm.tab === 'RETURN' && (
                  <div className="space-y-3 bg-indigo-950/10 border border-indigo-500/20 p-4 rounded-2xl">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-slate-300 font-semibold block">
                          {t.grossReturnLabel || 'Rendimento Lordo (€)'} *
                        </label>
                        <input
                          type="number"
                          step="any"
                          required
                          placeholder="0.00"
                          value={movementForm.grossReturn}
                          onChange={e => handleGrossChange(e.target.value)}
                          className="w-full bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl text-white focus:outline-none focus:border-indigo-500/60 font-mono text-sm"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-slate-300 font-semibold block">
                          {t.taxAmountLabel || 'Imposte / Ritenute (€)'}
                        </label>
                        <input
                          type="number"
                          step="any"
                          placeholder="0.00"
                          value={movementForm.taxAmount}
                          onChange={e => handleTaxChange(e.target.value)}
                          className="w-full bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl text-white focus:outline-none focus:border-indigo-500/60 font-mono text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-emerald-400 font-bold block flex items-center justify-between">
                          <span>{t.netReturnLabel || 'Rendimento Netto (€)'}</span>
                          <span className="text-[10px] text-slate-400 font-normal">{t.grossMinusTaxes || 'Lordo - Imposte'}</span>
                        </label>
                        <input
                          type="number"
                          step="any"
                          required
                          placeholder="0.00"
                          value={movementForm.netReturn}
                          onChange={e => setMovementForm({ ...movementForm, netReturn: e.target.value })}
                          className="w-full bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl text-emerald-300 font-bold focus:outline-none focus:border-emerald-500/60 font-mono text-sm"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-indigo-300 font-semibold block flex items-center justify-between">
                          <span>{t.assignedUnitsLabel || 'Numero Quote Assegnate'}</span>
                          <span className="text-[10px] text-slate-500 font-normal">{t.optionalBadge || 'Opzionale'}</span>
                        </label>
                        <input
                          type="number"
                          step="any"
                          placeholder="es. 1.2500"
                          value={movementForm.units}
                          onChange={e => setMovementForm({ ...movementForm, units: e.target.value })}
                          className="w-full bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl text-white focus:outline-none focus:border-indigo-500/60 font-mono text-sm"
                        />
                      </div>
                    </div>

                    <div className="pt-1">
                      <label className="flex items-center gap-2.5 cursor-pointer text-slate-300 py-1">
                        <input
                          type="checkbox"
                          checked={movementForm.isReinvested}
                          onChange={e => setMovementForm({ ...movementForm, isReinvested: e.target.checked })}
                          className="w-4 h-4 rounded border-slate-800 text-emerald-500 focus:ring-emerald-500/20 bg-slate-950 cursor-pointer accent-emerald-500"
                        />
                        <span className="text-xs">
                          {t.reinvestedInBalance || 'Reinvestito nel saldo (aumenta il controvalore)'}
                        </span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Notes */}
                <div className="space-y-1.5">
                  <label className="text-slate-400 font-semibold block">{t.notesOrReferenceLabel || t.notes || 'Note o Riferimento'}</label>
                  <input
                    type="text"
                    placeholder={t.movementNotesPlaceholder || 'es. Quota mensile, contributo straordinario, rivalutazione annua...'}
                    value={movementForm.notes}
                    onChange={e => setMovementForm({ ...movementForm, notes: e.target.value })}
                    className="w-full bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl text-white focus:outline-none focus:border-emerald-500/60"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => setMovementForm(prev => ({ ...prev, open: false }))}
                    className="px-4 py-2 rounded-xl text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 font-bold transition cursor-pointer"
                  >
                    {t.cancel || 'Annulla'}
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl text-white bg-emerald-600 hover:bg-emerald-500 font-bold transition shadow-lg shadow-emerald-950/20 cursor-pointer"
                  >
                    {t.saveMovementBtn || t.save || 'Salva Registrazione'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* ================= MODAL 3: MANAGE MOVEMENT TYPES (via ModalPortal) ================= */}
      {manageTypesForm.open && (
        <ModalPortal isOpen={manageTypesForm.open}>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-hidden animate-fade-in"
            dir={lang === 'ar' ? 'rtl' : 'ltr'}
            onClick={e => {
              if (e.target === e.currentTarget) {
                setManageTypesForm({ open: false });
              }
            }}
          >
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl max-w-xl w-full relative space-y-4 max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col overflow-y-auto custom-scrollbar my-auto">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20">
                    <Sliders className="w-4 h-4" />
                  </span>
                  <div>
                    <h3 className="font-extrabold text-base text-white">
                      {t.manageMovementTypesTitle || 'Gestione Tipologie di Movimento'}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {t.manageMovementTypesDesc || 'Ordina, modifica e aggiungi le tipologie per la tendina dei flussi (Entrate e Uscite).'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setManageTypesForm({ open: false })}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Add New Type Form */}
              <form onSubmit={handleAddNewType} className="bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800/80 space-y-3">
                <span className="text-xs font-bold text-slate-300 block">
                  {t.defineNewTypeTitle || 'Definisci Nuova Tipologia'}
                </span>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    required
                    placeholder={t.typeNamePlaceholder || 'Nome tipologia (es. Rimborso spese, Stipendio, TFR Fondaco)...'}
                    value={newTypeInput.name}
                    onChange={e => setNewTypeInput({ ...newTypeInput, name: e.target.value })}
                    className="flex-1 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500/60"
                  />
                  <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setNewTypeInput({ ...newTypeInput, direction: 'INFLOW' })}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                        newTypeInput.direction === 'INFLOW'
                          ? 'bg-sky-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {t.inflowBadge || 'Entrata (+)'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewTypeInput({ ...newTypeInput, direction: 'OUTFLOW' })}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                        newTypeInput.direction === 'OUTFLOW'
                          ? 'bg-rose-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {t.outflowBadge || 'Uscita (-)'}
                    </button>
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition cursor-pointer shadow-sm"
                  >
                    {t.addTypeBtn || t.add || 'Aggiungi'}
                  </button>
                </div>
              </form>

              {/* SECTION: ENTRATE (+) */}
              <div className="space-y-2">
                <span className="text-xs font-mono font-bold text-sky-400 uppercase tracking-wider block">
                  {t.inflowStreamsLabel || 'Flussi in Entrata (+)'} ({inflowConfigs.length})
                </span>
                <div className="space-y-1.5">
                  {inflowConfigs.map((cfg, idx) => (
                    <div
                      key={cfg.id}
                      className="flex items-center justify-between gap-2 p-2.5 bg-slate-950/60 rounded-xl border border-slate-800/80 text-xs"
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <span className="w-5 text-center font-mono text-[10px] text-slate-500">
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          defaultValue={cfg.name}
                          onBlur={e => handleUpdateTypeName(cfg.id, e.target.value)}
                          className="bg-transparent text-white font-medium focus:outline-none focus:bg-slate-900 px-2 py-0.5 rounded border border-transparent focus:border-slate-700 flex-1"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveTypeOrder(cfg.id, 'UP')}
                          className="p-1 text-slate-400 hover:text-white disabled:opacity-30 rounded hover:bg-slate-800 transition"
                          title={t.moveUp || 'Sposta su'}
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === inflowConfigs.length - 1}
                          onClick={() => handleMoveTypeOrder(cfg.id, 'DOWN')}
                          className="p-1 text-slate-400 hover:text-white disabled:opacity-30 rounded hover:bg-slate-800 transition"
                          title={t.moveDown || 'Sposta giù'}
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        {!cfg.isDefault && (
                          <button
                            type="button"
                            onClick={() => handleDeleteType(cfg.id)}
                            className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-rose-950/20 transition ml-1"
                            title={t.deleteCustomTypeTitle || 'Elimina tipologia personalizzata'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* SECTION: USCITE (-) */}
              <div className="space-y-2 pt-2 border-t border-slate-800/60">
                <span className="text-xs font-mono font-bold text-rose-400 uppercase tracking-wider block">
                  {t.outflowStreamsLabel || 'Flussi in Uscita (-)'} ({outflowConfigs.length})
                </span>
                <div className="space-y-1.5">
                  {outflowConfigs.map((cfg, idx) => (
                    <div
                      key={cfg.id}
                      className="flex items-center justify-between gap-2 p-2.5 bg-slate-950/60 rounded-xl border border-slate-800/80 text-xs"
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <span className="w-5 text-center font-mono text-[10px] text-slate-500">
                          {idx + 1}
                        </span>
                        <input
                          type="text"
                          defaultValue={cfg.name}
                          onBlur={e => handleUpdateTypeName(cfg.id, e.target.value)}
                          className="bg-transparent text-white font-medium focus:outline-none focus:bg-slate-900 px-2 py-0.5 rounded border border-transparent focus:border-slate-700 flex-1"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveTypeOrder(cfg.id, 'UP')}
                          className="p-1 text-slate-400 hover:text-white disabled:opacity-30 rounded hover:bg-slate-800 transition"
                          title={t.moveUp || 'Sposta su'}
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === outflowConfigs.length - 1}
                          onClick={() => handleMoveTypeOrder(cfg.id, 'DOWN')}
                          className="p-1 text-slate-400 hover:text-white disabled:opacity-30 rounded hover:bg-slate-800 transition"
                          title={t.moveDown || 'Sposta giù'}
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        {!cfg.isDefault && (
                          <button
                            type="button"
                            onClick={() => handleDeleteType(cfg.id)}
                            className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-rose-950/20 transition ml-1"
                            title={t.deleteCustomTypeTitle || 'Elimina tipologia personalizzata'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={handleResetTypesToDefault}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{t.restoreDefaultsBtn || 'Ripristina predefinite'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setManageTypesForm({ open: false })}
                  className="px-5 py-2 rounded-xl text-white bg-emerald-600 hover:bg-emerald-500 font-bold text-xs transition cursor-pointer shadow-sm"
                >
                  {t.close || 'Chiudi'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* ================= MODAL 4: CONFIRM DELETE (via ModalPortal) ================= */}
      {deleteConfirm.open && (
        <ModalPortal isOpen={deleteConfirm.open}>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-hidden animate-fade-in"
            dir={lang === 'ar' ? 'rtl' : 'ltr'}
            onClick={e => {
              if (e.target === e.currentTarget) {
                setDeleteConfirm(prev => ({ ...prev, open: false }));
              }
            }}
          >
            <div className="bg-slate-900 border border-rose-500/30 rounded-3xl p-5 sm:p-6 shadow-2xl max-w-md w-full relative space-y-4 my-auto">
              <div className="flex items-center gap-3">
                <span className="p-2.5 bg-rose-500/10 rounded-xl text-rose-400 border border-rose-500/20">
                  <Trash2 className="w-5 h-5 animate-pulse" />
                </span>
                <div>
                  <h3 className="font-extrabold text-base text-white">
                    {deleteConfirm.type === 'entity'
                      ? t.confirmDeleteEntity || 'Elimina Attività'
                      : t.confirmDeleteMovement || 'Elimina Registrazione'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {deleteConfirm.type === 'entity'
                      ? t.deleteEntityWarning || 'Verranno eliminati anche tutti i movimenti e i dati storici associati.'
                      : t.deleteMovementWarning || "L'operazione non potrà essere annullata."}
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-xs font-mono text-slate-200">
                {deleteConfirm.name}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(prev => ({ ...prev, open: false }))}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 font-bold text-xs transition cursor-pointer"
                >
                  {t.cancel || 'Annulla'}
                </button>
                <button
                  type="button"
                  onClick={handleExecuteDelete}
                  className="px-5 py-2 rounded-xl text-white bg-rose-600 hover:bg-rose-500 font-bold text-xs transition shadow-lg shadow-rose-950/30 cursor-pointer"
                >
                  {t.confirmPermanentDeleteBtn || t.confirmBtn || 'Elimina definitivamente'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* ================= MODAL 5: IMPORT MOVEMENTS (via ModalPortal) ================= */}
      {importModalOpen && (
        <NonTickerImportModal
          isOpen={importModalOpen}
          onClose={() => setImportModalOpen(false)}
          db={db}
          entities={entities}
          movements={movements}
          preSelectedEntityId={selectedEntityId !== 'ALL' ? selectedEntityId : undefined}
          onSaveDatabase={async (updatedDb) => {
            await saveDatabaseState(updatedDb);
          }}
          t={t}
          lang={lang}
        />
      )}
    </div>
  );
};

// ================= EVOLUTION CHART SVG SUBCOMPONENT =================
interface NonTickerEvolutionChartProps {
  data: NonTickerTimelinePoint[];
  currency: string;
  lang: string;
  t: LanguagePhrases;
}

const NonTickerEvolutionChart: React.FC<NonTickerEvolutionChartProps> = ({
  data,
  currency,
  lang,
  t
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Aggrega strettamente tutti i dati per singola data di calendario (1 unico punto per data sull'asse X)
  const chartPoints = useMemo(() => {
    if (!data || data.length === 0) return [];
    const dateMap = new Map<string, NonTickerTimelinePoint>();
    for (const pt of data) {
      const existing = dateMap.get(pt.date);
      if (!existing) {
        dateMap.set(pt.date, { ...pt });
      } else {
        // Mantiene il saldo/versato progressivo finale del giorno e cumula importi/commissioni
        dateMap.set(pt.date, {
          ...pt,
          amount: Math.round(((existing.amount || 0) + (pt.amount || 0)) * 100) / 100,
          fee: (existing.fee !== undefined || pt.fee !== undefined) ? ((existing.fee || 0) + (pt.fee || 0)) : undefined,
          notes: [existing.notes, pt.notes].filter(Boolean).join('; ')
        });
      }
    }
    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  if (!chartPoints || chartPoints.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-slate-500 text-xs gap-2">
        <TrendingUp className="w-8 h-8 stroke-[1.5]" />
        <span>{t.noChartDataWarning || 'Nessun dato temporale sufficiente per tracciare il grafico.'}</span>
      </div>
    );
  }

  // Width & height internal coordinates for SVG
  const width = 800;
  const height = 280;
  const padL = 60;
  const padR = 30;
  const padT = 20;
  const padB = 40;

  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  // Find min and max for Y
  let maxY = 0;
  let minY = 0;
  for (const pt of chartPoints) {
    if (pt.netInvested > maxY) maxY = pt.netInvested;
    if (pt.balance > maxY) maxY = pt.balance;
    if (pt.netInvested < minY) minY = pt.netInvested;
    if (pt.balance < minY) minY = pt.balance;
  }
  // Buffer on Y
  maxY = Math.max(10, maxY * 1.1);
  minY = Math.min(0, minY * 1.1);
  const rangeY = maxY - minY || 1;

  const getX = (idx: number) => {
    if (chartPoints.length <= 1) return padL + chartW / 2;
    return padL + (idx / (chartPoints.length - 1)) * chartW;
  };

  const getY = (val: number) => {
    return padT + chartH - ((val - minY) / rangeY) * chartH;
  };

  // Build path strings
  let investedPath = '';
  let balancePath = '';
  let areaPath = '';

  chartPoints.forEach((pt, idx) => {
    const x = getX(idx);
    const yInvested = getY(pt.netInvested);
    const yBalance = getY(pt.balance);

    if (idx === 0) {
      investedPath += `M ${x} ${yInvested}`;
      balancePath += `M ${x} ${yBalance}`;
    } else {
      investedPath += ` L ${x} ${yInvested}`;
      balancePath += ` L ${x} ${yBalance}`;
    }
  });

  // Area path: Balance forwards, then Invested backwards
  if (chartPoints.length > 1) {
    areaPath = balancePath;
    for (let i = chartPoints.length - 1; i >= 0; i--) {
      const x = getX(i);
      const yInvested = getY(chartPoints[i].netInvested);
      areaPath += ` L ${x} ${yInvested}`;
    }
    areaPath += ' Z';
  }

  // Active hover point
  const activePt = hoverIndex !== null && hoverIndex >= 0 && hoverIndex < chartPoints.length ? chartPoints[hoverIndex] : null;

  return (
    <div className="space-y-3">
      {/* Legend & Hover Data summary */}
      <div className="flex flex-wrap items-center justify-between text-xs gap-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-blue-400 rounded-full"></span>
            <span className="text-slate-300 font-semibold">{t.netInvestedCapital || 'Capitale Netto Versato'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-emerald-400 rounded-full"></span>
            <span className="text-emerald-300 font-semibold">{t.currentTotalValue || 'Saldo / Controvalore'}</span>
          </div>
        </div>

        {activePt ? (
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono bg-slate-950/80 px-3 py-1 rounded-xl border border-slate-800">
            <span className="text-slate-400">{formatDateString(activePt.date, lang)}</span>
            <span className="text-blue-400">{t.investedShort || 'Versato'}: {formatCurrency(activePt.netInvested, currency)}</span>
            <span className="text-emerald-400">{t.balanceLabel || 'Saldo'}: {formatCurrency(activePt.balance, currency)}</span>
            <span className={activePt.netGain >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {t.gainShort || 'Gain'}: {activePt.netGain >= 0 ? '+' : ''}
              {formatCurrency(activePt.netGain, currency)}
            </span>
            {activePt.balanceUnits !== undefined && (
              <span className="text-cyan-400">
                {t.unitsColumn || 'Quote'}: <QuantityDisplay value={activePt.balanceUnits} />
              </span>
            )}
          </div>
        ) : (
          <span className="text-[11px] text-slate-500">{t.hoverPointsHint || 'Passa il cursore sui punti per il dettaglio storico'}</span>
        )}
      </div>

      {/* SVG Container */}
      <div className="w-full relative aspect-[800/280] max-h-72 select-none">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full overflow-visible"
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id="gainGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Grid lines (horizontal) */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
            const val = minY + rangeY * (1 - pct);
            const y = padT + chartH * pct;
            return (
              <g key={i}>
                <line
                  x1={padL}
                  y1={y}
                  x2={width - padR}
                  y2={y}
                  stroke="#334155"
                  strokeWidth="0.8"
                  strokeDasharray="3 3"
                  strokeOpacity="0.4"
                />
                <text
                  x={padL - 8}
                  y={y + 3}
                  textAnchor="end"
                  fill="#64748b"
                  fontSize="10"
                  fontFamily="monospace"
                >
                  {formatCurrency(val, currency)}
                </text>
              </g>
            );
          })}

          {/* Area between curves */}
          {areaPath && <path d={areaPath} fill="url(#gainGradient)" />}

          {/* Line 1: Net Invested (Blue) */}
          {investedPath && (
            <path
              d={investedPath}
              fill="none"
              stroke="#60a5fa"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Line 2: Balance / Valuation (Emerald) */}
          {balancePath && (
            <path
              d={balancePath}
              fill="none"
              stroke="#10b981"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Interactive Points and Crosshair */}
          {chartPoints.map((pt, idx) => {
            const x = getX(idx);
            const yBalance = getY(pt.balance);
            const isHovered = hoverIndex === idx;

            return (
              <g
                key={idx}
                className="cursor-pointer"
                onMouseEnter={() => setHoverIndex(idx)}
              >
                {/* Invisible hover trigger column */}
                <rect
                  x={x - (chartW / Math.max(1, chartPoints.length)) / 2}
                  y={padT}
                  width={chartW / Math.max(1, chartPoints.length)}
                  height={chartH}
                  fill="transparent"
                />

                {/* Point indicators when hovered or for key events */}
                {isHovered && (
                  <>
                    <line
                      x1={x}
                      y1={padT}
                      x2={x}
                      y2={padT + chartH}
                      stroke="#94a3b8"
                      strokeWidth="1"
                      strokeDasharray="2 2"
                    />
                    <circle
                      cx={x}
                      cy={yBalance}
                      r="5"
                      fill="#10b981"
                      stroke="#0f172a"
                      strokeWidth="2"
                    />
                    <circle
                      cx={x}
                      cy={getY(pt.netInvested)}
                      r="4"
                      fill="#60a5fa"
                      stroke="#0f172a"
                      strokeWidth="2"
                    />
                  </>
                )}
              </g>
            );
          })}

          {/* X Axis Date labels (First, Middle, Last) */}
          {chartPoints.length > 0 && (
            <g>
              <text
                x={getX(0)}
                y={height - 12}
                textAnchor="start"
                fill="#64748b"
                fontSize="10"
                fontFamily="monospace"
              >
                {formatDateString(chartPoints[0].date, lang)}
              </text>
              {chartPoints.length > 2 && (
                <text
                  x={getX(Math.floor((chartPoints.length - 1) / 2))}
                  y={height - 12}
                  textAnchor="middle"
                  fill="#64748b"
                  fontSize="10"
                  fontFamily="monospace"
                >
                  {formatDateString(chartPoints[Math.floor((chartPoints.length - 1) / 2)].date, lang)}
                </text>
              )}
              {chartPoints.length > 1 && (
                <text
                  x={getX(chartPoints.length - 1)}
                  y={height - 12}
                  textAnchor="end"
                  fill="#64748b"
                  fontSize="10"
                  fontFamily="monospace"
                >
                  {formatDateString(chartPoints[chartPoints.length - 1].date, lang)}
                </text>
              )}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
};
