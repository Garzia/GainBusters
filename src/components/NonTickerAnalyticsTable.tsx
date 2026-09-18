/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Tabella analitica avanzata per i movimenti e le rilevazioni di "Attività senza ticker".
 * Caratteristiche:
 * - Ordinamento per qualsiasi colonna (ascendente/discendente)
 * - Filtri multi-criterio combinati:
 *   * Intervallo date (Da / A e scorciatoie)
 *   * Selezione multipla dei tipi di movimento (con tendina e checkbox)
 *   * Selezione multipla delle entità/fondi
 *   * Filtro provenienza (Manuale vs Importer / Trade Republic)
 *   * Filtro direzione flusso (Tutti, Entrate, Uscite, Rendimenti, Saldi)
 *   * Ricerca testuale libera (note, entità, ID esterno, tipo)
 * - Visualizzazione chiara dell'origine (Manuale vs Importata con ID e provider)
 * - Selettore visibilità colonne personalizzabile con persistenza
 * - Totali di riga e di fine tabella semanticamente corretti
 * - Paginazione reattiva e scalabile per grandi dataset
 * - Persistenza delle preferenze utente (localStorage e DBState)
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  Search,
  X,
  SlidersHorizontal,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Edit,
  Trash2,
  Calendar,
  Check,
  Sparkles,
  User,
  FileSpreadsheet,
  Layers,
  Percent,
  Activity,
  Receipt,
  RotateCcw,
  Eye,
  Info,
  ExternalLink
} from 'lucide-react';
import {
  NonTickerMovement,
  NonTickerEntity,
  NonTickerMovementTypeConfig,
  NonTickerMovementType,
  LanguagePhrases,
  NonTickerCategory,
  NonTickerTablePreferences
} from '../types.ts';
import {
  isFlowInflow,
  isFlowOutflow
} from '../utils/nonTickerFinance.ts';
import { formatDateString } from '../utils.ts';
import { formatCurrency } from '../App.tsx';
import { QuantityDisplay } from './QuantityDisplay.tsx';

export interface NonTickerAnalyticsTableProps {
  movements: NonTickerMovement[];
  entities: NonTickerEntity[];
  movementTypeConfigs: NonTickerMovementTypeConfig[];
  selectedEntityId: string;
  onSelectEntityId: (id: string) => void;
  selectedCurrency: string;
  t: LanguagePhrases;
  lang: string;
  onEditMovement: (movement: NonTickerMovement) => void;
  onRequestDeleteMovement: (movement: NonTickerMovement) => void;
  initialPreferences?: NonTickerTablePreferences;
  onSavePreferences?: (prefs: NonTickerTablePreferences) => void;
  getCategoryIcon: (category: NonTickerCategory) => React.ReactNode;
  getMovementTypeName: (typeId: string) => string;
}

// Elenco delle colonne configurabili
export type ColumnKey =
  | 'date'
  | 'entity'
  | 'type'
  | 'amount'
  | 'valuation'
  | 'units'
  | 'unitPrice'
  | 'grossReturn'
  | 'taxAmount'
  | 'netReturn'
  | 'fee'
  | 'source'
  | 'notes'
  | 'actions';

interface ColumnDef {
  key: ColumnKey;
  label: string;
  sortable: boolean;
  defaultVisible: boolean;
  align?: 'left' | 'center' | 'right';
  numeric?: boolean;
}

const LOCAL_STORAGE_PREFS_KEY = 'gainbusters_nonticker_table_prefs';

export const NonTickerAnalyticsTable: React.FC<NonTickerAnalyticsTableProps> = ({
  movements,
  entities,
  movementTypeConfigs,
  selectedEntityId,
  onSelectEntityId,
  selectedCurrency,
  t,
  lang,
  onEditMovement,
  onRequestDeleteMovement,
  initialPreferences,
  onSavePreferences,
  getCategoryIcon,
  getMovementTypeName
}) => {
  // 1. Definizioni delle colonne
  const columnDefs: ColumnDef[] = useMemo(
    () => [
      { key: 'date', label: t.dateColumn || 'Data', sortable: true, defaultVisible: true },
      { key: 'entity', label: t.entityColumn || 'Attività / Fondo', sortable: true, defaultVisible: selectedEntityId === 'ALL' },
      { key: 'type', label: t.operationTypeColumn || 'Tipo Operazione', sortable: true, defaultVisible: true },
      { key: 'amount', label: t.inflowOutflowColumn || 'Flusso Cassa', sortable: true, defaultVisible: true, align: 'right', numeric: true },
      { key: 'valuation', label: t.valuationColumn || 'Saldo Rilevato', sortable: true, defaultVisible: true, align: 'right', numeric: true },
      { key: 'units', label: t.unitsColumn || 'Quote', sortable: true, defaultVisible: true, align: 'right', numeric: true },
      { key: 'unitPrice', label: t.unitPriceColumn || 'Prezzo Quota', sortable: true, defaultVisible: false, align: 'right', numeric: true },
      { key: 'grossReturn', label: t.grossReturnColumn || 'Rendimento Lordo', sortable: true, defaultVisible: false, align: 'right', numeric: true },
      { key: 'taxAmount', label: t.taxAmountColumn || 'Ritenute / Imposte', sortable: true, defaultVisible: false, align: 'right', numeric: true },
      { key: 'netReturn', label: t.netReturnColumn || 'Rendimento Netto', sortable: true, defaultVisible: true, align: 'right', numeric: true },
      { key: 'fee', label: t.feeColumn || 'Commissioni', sortable: true, defaultVisible: false, align: 'right', numeric: true },
      { key: 'source', label: t.originColumn || 'Provenienza', sortable: true, defaultVisible: true },
      { key: 'notes', label: t.notesColumn || 'Note / Rif.', sortable: true, defaultVisible: true },
      { key: 'actions', label: t.actionsColumn || 'Azioni', sortable: false, defaultVisible: true, align: 'right' }
    ],
    [t, selectedEntityId]
  );

  // 2. Caricamento preferenze da localStorage o initialPreferences
  const defaultVisibleCols = useMemo(() => {
    return columnDefs.filter(c => c.defaultVisible).map(c => c.key);
  }, [columnDefs]);

  const loadInitialPrefs = (): NonTickerTablePreferences => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_PREFS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          sortColumn: parsed.sortColumn || 'date',
          sortDirection: parsed.sortDirection || 'desc',
          visibleColumns: Array.isArray(parsed.visibleColumns) && parsed.visibleColumns.length > 0
            ? parsed.visibleColumns
            : defaultVisibleCols,
          pageSize: parsed.pageSize || 50
        };
      }
    } catch {
      // Ignora errori di parsing
    }

    if (initialPreferences) {
      return {
        sortColumn: initialPreferences.sortColumn || 'date',
        sortDirection: initialPreferences.sortDirection || 'desc',
        visibleColumns: initialPreferences.visibleColumns || defaultVisibleCols,
        pageSize: initialPreferences.pageSize || 50
      };
    }

    return {
      sortColumn: 'date',
      sortDirection: 'desc',
      visibleColumns: defaultVisibleCols,
      pageSize: 50
    };
  };

  const initialPrefs = useMemo(() => loadInitialPrefs(), []);

  // 3. Stati di ordinamento e visibilità colonne
  const [sortColumn, setSortColumn] = useState<string>(initialPrefs.sortColumn || 'date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(initialPrefs.sortDirection || 'desc');
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(
    (initialPrefs.visibleColumns as ColumnKey[]) || defaultVisibleCols
  );
  const [pageSize, setPageSize] = useState<number>(initialPrefs.pageSize || 50);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Salvataggio persistente preferenze
  const persistPreferences = (newSortCol: string, newSortDir: 'asc' | 'desc', newVisCols: ColumnKey[], newPageSize: number) => {
    const prefs: NonTickerTablePreferences = {
      sortColumn: newSortCol,
      sortDirection: newSortDir,
      visibleColumns: newVisCols,
      pageSize: newPageSize
    };
    try {
      localStorage.setItem(LOCAL_STORAGE_PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore localStorage errors
    }
    if (onSavePreferences) {
      onSavePreferences(prefs);
    }
  };

  // 4. Stati dei filtri analitici
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedEntityFilter, setSelectedEntityFilter] = useState<string[]>([]);
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'MANUAL' | 'IMPORTED' | string>('ALL');
  const [flowDirectionFilter, setFlowDirectionFilter] = useState<'ALL' | 'INFLOW' | 'OUTFLOW' | 'RETURN' | 'VALUATION'>('ALL');

  // Stati per tendine filtri interattivi
  const [typeDropdownOpen, setTypeDropdownOpen] = useState<boolean>(false);
  const [entityDropdownOpen, setEntityDropdownOpen] = useState<boolean>(false);
  const [columnPickerOpen, setColumnPickerOpen] = useState<boolean>(false);

  // Refs per chiusura popup al click esterno
  const typeDropdownRef = useRef<HTMLDivElement>(null);
  const entityDropdownRef = useRef<HTMLDivElement>(null);
  const columnPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target as Node)) {
        setTypeDropdownOpen(false);
      }
      if (entityDropdownRef.current && !entityDropdownRef.current.contains(e.target as Node)) {
        setEntityDropdownOpen(false);
      }
      if (columnPickerRef.current && !columnPickerRef.current.contains(e.target as Node)) {
        setColumnPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sincronizza filtro entità se la pagina principale ha selezionato una singola entità
  useEffect(() => {
    if (selectedEntityId !== 'ALL') {
      setSelectedEntityFilter([selectedEntityId]);
    } else {
      setSelectedEntityFilter([]);
    }
  }, [selectedEntityId]);

  // Lista di tutti i provider unici presenti nei movimenti
  const uniqueProviders = useMemo(() => {
    const set = new Set<string>();
    movements.forEach(m => {
      if (m.importProvider) {
        set.add(m.importProvider);
      }
    });
    return Array.from(set);
  }, [movements]);

  // Lista di tutti i tipi unici presenti nella configurazione e nei dati
  const allAvailableTypes = useMemo(() => {
    const map = new Map<string, { id: string; name: string; category: string }>();

    // Standard e custom types da configurazione
    movementTypeConfigs.forEach(cfg => {
      map.set(cfg.id, {
        id: cfg.id,
        name: cfg.name,
        category: cfg.direction === 'INFLOW' ? 'Flusso in Entrata (+)' : 'Flusso in Uscita (-)'
      });
    });

    // Aggiungi Rendimento e Saldo
    map.set(NonTickerMovementType.RETURN, {
      id: NonTickerMovementType.RETURN,
      name: t.mvReturn || 'Rendimento Riconosciuto',
      category: 'Rendimenti'
    });
    map.set(NonTickerMovementType.VALUATION, {
      id: NonTickerMovementType.VALUATION,
      name: t.mvValuation || 'Rilevazione Saldo / NAV',
      category: 'Rilevazioni Saldo'
    });

    // Includi anche eventuali tipi presenti nei movimenti storici
    movements.forEach(m => {
      if (m.type && !map.has(m.type)) {
        const isOut = isFlowOutflow(m.type, movementTypeConfigs);
        map.set(m.type, {
          id: m.type,
          name: getMovementTypeName(m.type),
          category: isOut ? 'Flusso in Uscita (-)' : 'Flusso in Entrata (+)'
        });
      }
    });

    return Array.from(map.values());
  }, [movementTypeConfigs, movements, t, getMovementTypeName]);

  // 5. Gestione Ordinamento
  const handleSort = (columnKey: string) => {
    let newDirection: 'asc' | 'desc' = 'asc';
    if (sortColumn === columnKey) {
      newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      // Default initial direction per specific columns
      newDirection = columnKey === 'date' ? 'desc' : 'asc';
    }
    setSortColumn(columnKey);
    setSortDirection(newDirection);
    persistPreferences(columnKey, newDirection, visibleColumns, pageSize);
  };

  // Toggle visibilità colonna
  const toggleColumnVisibility = (key: ColumnKey) => {
    let newCols: ColumnKey[];
    if (visibleColumns.includes(key)) {
      if (visibleColumns.length <= 1) return; // Non nascondere l'ultima colonna rimasta
      newCols = visibleColumns.filter(k => k !== key);
    } else {
      newCols = [...visibleColumns, key];
    }
    setVisibleColumns(newCols);
    persistPreferences(sortColumn, sortDirection, newCols, pageSize);
  };

  const handleSelectAllColumns = () => {
    const allCols = columnDefs.map(c => c.key);
    setVisibleColumns(allCols);
    persistPreferences(sortColumn, sortDirection, allCols, pageSize);
  };

  const handleRestoreDefaultColumns = () => {
    setVisibleColumns(defaultVisibleCols);
    persistPreferences(sortColumn, sortDirection, defaultVisibleCols, pageSize);
  };

  // 6. FILTRAGGIO MULTI-CRITERIO DEI DATI
  const filteredMovements = useMemo(() => {
    return movements.filter(m => {
      // 1. Filtro Entità (dalla pagina o dal multi-select)
      if (selectedEntityFilter.length > 0 && !selectedEntityFilter.includes(m.entityId)) {
        return false;
      }

      // 2. Filtro Intervallo Date
      if (dateFrom && m.date < dateFrom) {
        return false;
      }
      if (dateTo && m.date > dateTo) {
        return false;
      }

      // 3. Filtro Tipi di Movimento Multi-Select
      if (selectedTypes.length > 0 && !selectedTypes.includes(m.type)) {
        return false;
      }

      // 4. Filtro Direzione Flusso
      if (flowDirectionFilter === 'INFLOW') {
        if (!isFlowInflow(m.type, movementTypeConfigs)) return false;
      } else if (flowDirectionFilter === 'OUTFLOW') {
        if (!isFlowOutflow(m.type, movementTypeConfigs)) return false;
      } else if (flowDirectionFilter === 'RETURN') {
        if (m.type !== NonTickerMovementType.RETURN) return false;
      } else if (flowDirectionFilter === 'VALUATION') {
        if (m.type !== NonTickerMovementType.VALUATION) return false;
      }

      // 5. Filtro Provenienza (Manuale vs Importata)
      if (sourceFilter === 'MANUAL') {
        if (m.importProvider || m.externalId) return false;
      } else if (sourceFilter === 'IMPORTED') {
        if (!m.importProvider && !m.externalId) return false;
      } else if (sourceFilter !== 'ALL') {
        // Specific provider (es. 'Trade Republic')
        if (m.importProvider !== sourceFilter) return false;
      }

      // 6. Ricerca Testuale Libera
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const ent = entities.find(e => e.id === m.entityId);
        const entityName = ent ? ent.name.toLowerCase() : '';
        const typeName = getMovementTypeName(m.type).toLowerCase();
        const notes = (m.notes || '').toLowerCase();
        const extId = (m.externalId || '').toLowerCase();
        const provider = (m.importProvider || '').toLowerCase();

        const match =
          entityName.includes(q) ||
          typeName.includes(q) ||
          notes.includes(q) ||
          extId.includes(q) ||
          provider.includes(q);

        if (!match) return false;
      }

      return true;
    });
  }, [
    movements,
    selectedEntityFilter,
    dateFrom,
    dateTo,
    selectedTypes,
    flowDirectionFilter,
    sourceFilter,
    searchQuery,
    entities,
    movementTypeConfigs,
    getMovementTypeName
  ]);

  // 7. ORDINAMENTO DEI DATI FILTRATI
  const sortedMovements = useMemo(() => {
    const list = [...filteredMovements];
    const isAsc = sortDirection === 'asc';

    return list.sort((a, b) => {
      let comparison = 0;

      switch (sortColumn) {
        case 'date':
          comparison = a.date.localeCompare(b.date);
          break;

        case 'entity': {
          const entA = entities.find(e => e.id === a.entityId)?.name || '';
          const entB = entities.find(e => e.id === b.entityId)?.name || '';
          comparison = entA.localeCompare(entB);
          break;
        }

        case 'type': {
          const nameA = getMovementTypeName(a.type);
          const nameB = getMovementTypeName(b.type);
          comparison = nameA.localeCompare(nameB);
          break;
        }

        case 'amount': {
          // Importo flusso di cassa (+ entrata, - uscita, 0 altrimenti)
          const isOutA = isFlowOutflow(a.type, movementTypeConfigs);
          const isOutB = isFlowOutflow(b.type, movementTypeConfigs);
          const valA = a.amount ? (isOutA ? -a.amount : a.amount) : 0;
          const valB = b.amount ? (isOutB ? -b.amount : b.amount) : 0;
          comparison = valA - valB;
          break;
        }

        case 'valuation': {
          const valA = a.valuation !== undefined ? a.valuation : -Infinity;
          const valB = b.valuation !== undefined ? b.valuation : -Infinity;
          comparison = valA - valB;
          break;
        }

        case 'units': {
          const uA = a.units || 0;
          const uB = b.units || 0;
          comparison = uA - uB;
          break;
        }

        case 'unitPrice': {
          const pA = a.unitPrice || 0;
          const pB = b.unitPrice || 0;
          comparison = pA - pB;
          break;
        }

        case 'grossReturn': {
          const gA = a.grossReturn || 0;
          const gB = b.grossReturn || 0;
          comparison = gA - gB;
          break;
        }

        case 'taxAmount': {
          const tA = a.taxAmount || 0;
          const tB = b.taxAmount || 0;
          comparison = tA - tB;
          break;
        }

        case 'netReturn': {
          const nA = a.netReturn !== undefined ? a.netReturn : (a.grossReturn || 0) - (a.taxAmount || 0);
          const nB = b.netReturn !== undefined ? b.netReturn : (b.grossReturn || 0) - (b.taxAmount || 0);
          comparison = nA - nB;
          break;
        }

        case 'fee': {
          const fA = a.fee || 0;
          const fB = b.fee || 0;
          comparison = fA - fB;
          break;
        }

        case 'source': {
          const sA = a.importProvider || (a.externalId ? 'Importato' : 'Manuale');
          const sB = b.importProvider || (b.externalId ? 'Importato' : 'Manuale');
          comparison = sA.localeCompare(sB);
          break;
        }

        case 'notes': {
          const nA = a.notes || '';
          const nB = b.notes || '';
          comparison = nA.localeCompare(nB);
          break;
        }

        default:
          comparison = a.date.localeCompare(b.date);
      }

      return isAsc ? comparison : -comparison;
    });
  }, [filteredMovements, sortColumn, sortDirection, entities, movementTypeConfigs, getMovementTypeName]);

  // 8. TOTALI SEMANTICI DELLA TABELLA FILTRATA
  const tableTotals = useMemo(() => {
    let totalInflows = 0;
    let totalOutflows = 0;
    let totalGrossReturn = 0;
    let totalTaxes = 0;
    let totalNetReturn = 0;
    let totalCommissions = 0;
    let totalInflowUnits = 0;
    let totalOutflowUnits = 0;
    let valuationCount = 0;

    filteredMovements.forEach(m => {
      // 1. Flussi di Capitale
      if (m.type !== NonTickerMovementType.VALUATION && m.type !== NonTickerMovementType.RETURN) {
        const amt = m.amount || 0;
        const u = m.units || 0;

        if (isFlowInflow(m.type, movementTypeConfigs)) {
          totalInflows += amt;
          totalInflowUnits += u;
        } else if (isFlowOutflow(m.type, movementTypeConfigs)) {
          totalOutflows += amt;
          totalOutflowUnits += u;
        }
      }

      // 2. Rendimenti
      if (m.type === NonTickerMovementType.RETURN) {
        const g = m.grossReturn || 0;
        const t = m.taxAmount || 0;
        const n = m.netReturn !== undefined ? m.netReturn : Math.max(0, g - t);
        totalGrossReturn += g;
        totalTaxes += t;
        totalNetReturn += n;
      }

      // 3. Rilevazioni di Saldo
      if (m.type === NonTickerMovementType.VALUATION) {
        valuationCount++;
      }

      // 4. Commissioni
      if (m.fee && m.fee > 0) {
        totalCommissions += m.fee;
      }
    });

    const netCapitalContributed = totalInflows - totalOutflows;
    const netUnitsHandled = totalInflowUnits - totalOutflowUnits;

    return {
      totalInflows,
      totalOutflows,
      netCapitalContributed,
      totalGrossReturn,
      totalTaxes,
      totalNetReturn,
      totalCommissions,
      netUnitsHandled,
      hasUnits: totalInflowUnits > 0 || totalOutflowUnits > 0,
      valuationCount,
      totalCount: filteredMovements.length
    };
  }, [filteredMovements, movementTypeConfigs]);

  // 9. PAGINAZIONE
  const totalPages = useMemo(() => {
    if (pageSize >= 9999) return 1;
    return Math.max(1, Math.ceil(sortedMovements.length / pageSize));
  }, [sortedMovements.length, pageSize]);

  // Reset page if exceeds totalPages
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  const paginatedMovements = useMemo(() => {
    if (pageSize >= 9999) return sortedMovements;
    const startIndex = (currentPage - 1) * pageSize;
    return sortedMovements.slice(startIndex, startIndex + pageSize);
  }, [sortedMovements, currentPage, pageSize]);

  // 10. Gestione Reset Filtri
  const hasActiveFilters = useMemo(() => {
    const isEntityFilterActive = selectedEntityId === 'ALL' && selectedEntityFilter.length > 0;
    return Boolean(
      searchQuery.trim() ||
      dateFrom ||
      dateTo ||
      selectedTypes.length > 0 ||
      isEntityFilterActive ||
      sourceFilter !== 'ALL' ||
      flowDirectionFilter !== 'ALL'
    );
  }, [searchQuery, dateFrom, dateTo, selectedTypes, selectedEntityFilter, selectedEntityId, sourceFilter, flowDirectionFilter]);

  const handleResetAllFilters = () => {
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
    setSelectedTypes([]);
    if (selectedEntityId === 'ALL') {
      setSelectedEntityFilter([]);
    }
    setSourceFilter('ALL');
    setFlowDirectionFilter('ALL');
    setCurrentPage(1);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
    persistPreferences(sortColumn, sortDirection, visibleColumns, newSize);
  };

  // Helper rendering badge tipologia
  const renderMovementTypeBadge = (type: string) => {
    if (type === NonTickerMovementType.VALUATION) {
      return (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 whitespace-nowrap">
          {t.mvValuation || 'Rilevazione Saldo'}
        </span>
      );
    }
    if (type === NonTickerMovementType.RETURN) {
      return (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
          {t.mvReturn || 'Rendimento'}
        </span>
      );
    }

    const isInf = isFlowInflow(type, movementTypeConfigs);
    const isOut = isFlowOutflow(type, movementTypeConfigs);
    const name = getMovementTypeName(type);

    if (isInf) {
      return (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-sky-500/10 text-sky-400 border border-sky-500/20 whitespace-nowrap">
          {name}
        </span>
      );
    }

    if (isOut) {
      return (
        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20 whitespace-nowrap">
          {name}
        </span>
      );
    }

    return (
      <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700 whitespace-nowrap">
        {name}
      </span>
    );
  };

  // Helper rendering badge provenienza (Manuale vs Importato)
  const renderSourceBadge = (m: NonTickerMovement) => {
    if (m.importProvider) {
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-violet-500/15 text-violet-300 border border-violet-500/30 whitespace-nowrap"
          title={m.externalId ? `ID Esterno: ${m.externalId}` : `Importato da ${m.importProvider}`}
        >
          <Sparkles className="w-2.5 h-2.5 text-violet-400 shrink-0" />
          <span>{m.importProvider}</span>
        </span>
      );
    }

    if (m.externalId) {
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 whitespace-nowrap"
          title={`ID: ${m.externalId}`}
        >
          <FileSpreadsheet className="w-2.5 h-2.5 text-indigo-400 shrink-0" />
          <span>Importato</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-800/80 text-slate-400 border border-slate-700/60 whitespace-nowrap">
        <User className="w-2.5 h-2.5 text-slate-500 shrink-0" />
        <span>{t.sourceManual || 'Manuale'}</span>
      </span>
    );
  };

  return (
    <div className="bg-slate-900/40 border border-slate-800/80 p-4 sm:p-6 rounded-3xl space-y-4 shadow-sm backdrop-blur-md">
      {/* ================= HEADER & TOOLBAR ================= */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/70 pb-4">
        {/* Title and Record Count */}
        <div className="flex items-center gap-2.5">
          <span className="p-2 bg-slate-800 rounded-2xl text-emerald-400 border border-slate-700/70 shadow-sm">
            <SlidersHorizontal className="w-4 h-4" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-sm sm:text-base text-white tracking-wide uppercase font-mono">
                {t.movementsHistoryTitle || 'Registro Analitico Movimenti e Rilevazioni'}
              </h3>
              <span className="px-2 py-0.5 bg-slate-800 rounded-full text-[10px] font-mono font-bold text-slate-300 border border-slate-700">
                {filteredMovements.length} / {movements.length}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Ordinamento multi-colonna, filtri combinati avanzati, distinzione origine e totali semantici.
            </p>
          </div>
        </div>

        {/* Action Controls: Search, Quick Filters & Column Picker */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={t.search || 'Cerca note, ID, entità...'}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-slate-950/90 border border-slate-800 pl-8 pr-7 py-1.5 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60 w-40 sm:w-56"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Provenienza Filter Selector */}
          <select
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value)}
            className="bg-slate-950/90 border border-slate-800 px-3 py-1.5 rounded-xl text-xs text-slate-300 font-semibold focus:outline-none focus:border-emerald-500/60 cursor-pointer"
          >
            <option value="ALL">🌐 {t.sourceAll || 'Tutte le Origini'}</option>
            <option value="MANUAL">👤 {t.sourceManual || 'Solo Manuali'}</option>
            <option value="IMPORTED">✨ {t.sourceImported || 'Tutti gli Importati'}</option>
            {uniqueProviders.map(p => (
              <option key={p} value={p}>
                ⚡ {p}
              </option>
            ))}
          </select>

          {/* Direzione Flusso Filter */}
          <select
            value={flowDirectionFilter}
            onChange={e => setFlowDirectionFilter(e.target.value as any)}
            className="bg-slate-950/90 border border-slate-800 px-3 py-1.5 rounded-xl text-xs text-slate-300 font-semibold focus:outline-none focus:border-emerald-500/60 cursor-pointer"
          >
            <option value="ALL">{t.filterAllFlows || 'Tutti i Flussi'}</option>
            <option value="INFLOW">{t.filterInflowsOnly || 'Solo Entrate (+)'}</option>
            <option value="OUTFLOW">{t.filterOutflowsOnly || 'Solo Uscite (-)'}</option>
            <option value="RETURN">{t.filterReturnsOnly || 'Solo Rendimenti'}</option>
            <option value="VALUATION">{t.filterValuationsOnly || 'Solo Rilevazioni Saldo'}</option>
          </select>

          {/* Multi-Select Types Dropdown */}
          <div className="relative" ref={typeDropdownRef}>
            <button
              type="button"
              onClick={() => setTypeDropdownOpen(!typeDropdownOpen)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                selectedTypes.length > 0
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-950/90 text-slate-300 border-slate-800 hover:border-slate-700'
              }`}
            >
              <Filter className="w-3 h-3 text-emerald-400" />
              <span>{t.filterMovementTypes || 'Tipologie'}</span>
              {selectedTypes.length > 0 && (
                <span className="px-1.5 py-0.2 bg-emerald-500 text-slate-950 text-[10px] font-black rounded-full">
                  {selectedTypes.length}
                </span>
              )}
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {typeDropdownOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-3 z-30 space-y-2 animate-fade-in">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 text-xs">
                  <span className="font-extrabold text-white">Filtra per Tipologia</span>
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setSelectedTypes([])}
                      className="text-slate-400 hover:text-white underline cursor-pointer"
                    >
                      Tutti
                    </button>
                  </div>
                </div>

                <div className="max-h-56 overflow-y-auto custom-scrollbar space-y-1 text-xs">
                  {allAvailableTypes.map(typ => {
                    const isChecked = selectedTypes.includes(typ.id);
                    return (
                      <label
                        key={typ.id}
                        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-800/60 cursor-pointer text-slate-300 hover:text-white select-none transition"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setSelectedTypes(selectedTypes.filter(id => id !== typ.id));
                            } else {
                              setSelectedTypes([...selectedTypes, typ.id]);
                            }
                          }}
                          className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500/20"
                        />
                        <span className="truncate">{typ.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Multi-Select Assets/Entities Dropdown (if viewing ALL) */}
          {selectedEntityId === 'ALL' && entities.length > 1 && (
            <div className="relative" ref={entityDropdownRef}>
              <button
                type="button"
                onClick={() => setEntityDropdownOpen(!entityDropdownOpen)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  selectedEntityFilter.length > 0
                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                    : 'bg-slate-950/90 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                <Layers className="w-3 h-3 text-emerald-400" />
                <span>{t.filterAssets || 'Attività'}</span>
                {selectedEntityFilter.length > 0 && (
                  <span className="px-1.5 py-0.2 bg-emerald-500 text-slate-950 text-[10px] font-black rounded-full">
                    {selectedEntityFilter.length}
                  </span>
                )}
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {entityDropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-3 z-30 space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 text-xs">
                    <span className="font-extrabold text-white">Filtra per Attività</span>
                    <button
                      type="button"
                      onClick={() => setSelectedEntityFilter([])}
                      className="text-slate-400 hover:text-white underline text-[10px] cursor-pointer"
                    >
                      Tutte
                    </button>
                  </div>

                  <div className="max-h-56 overflow-y-auto custom-scrollbar space-y-1 text-xs">
                    {entities.map(ent => {
                      const isChecked = selectedEntityFilter.includes(ent.id);
                      return (
                        <label
                          key={ent.id}
                          className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-800/60 cursor-pointer text-slate-300 hover:text-white select-none transition"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setSelectedEntityFilter(selectedEntityFilter.filter(id => id !== ent.id));
                              } else {
                                setSelectedEntityFilter([...selectedEntityFilter, ent.id]);
                              }
                            }}
                            className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500/20"
                          />
                          <span className="truncate">{ent.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Column Visibility Picker Dropdown */}
          <div className="relative" ref={columnPickerRef}>
            <button
              type="button"
              onClick={() => setColumnPickerOpen(!columnPickerOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-950/90 text-slate-300 border border-slate-800 hover:border-slate-700 transition cursor-pointer"
              title={t.columnsPicker || 'Personalizza colonne visibili'}
            >
              <Eye className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">{t.columnsVisibility || 'Colonne'}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {columnPickerOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-3 z-30 space-y-2.5 animate-fade-in">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 text-xs">
                  <span className="font-extrabold text-white">Colonne Visibili</span>
                  <div className="flex items-center gap-2 text-[10px]">
                    <button
                      type="button"
                      onClick={handleSelectAllColumns}
                      className="text-emerald-400 hover:text-emerald-300 cursor-pointer"
                    >
                      Tutte
                    </button>
                    <span className="text-slate-600">|</span>
                    <button
                      type="button"
                      onClick={handleRestoreDefaultColumns}
                      className="text-slate-400 hover:text-white cursor-pointer"
                    >
                      Default
                    </button>
                  </div>
                </div>

                <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-1 text-xs">
                  {columnDefs.map(col => {
                    const isChecked = visibleColumns.includes(col.key);
                    return (
                      <label
                        key={col.key}
                        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-800/60 cursor-pointer text-slate-300 hover:text-white select-none transition"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isChecked && visibleColumns.length === 1}
                          onChange={() => toggleColumnVisibility(col.key)}
                          className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500/20 disabled:opacity-40"
                        />
                        <span className="truncate">{col.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ================= SECONDARY FILTER BAR: DATE RANGE & ACTIVE CHIPS ================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        {/* Date Range Inputs */}
        <div className="flex flex-wrap items-center gap-2 text-slate-400">
          <span className="font-bold flex items-center gap-1 text-slate-300">
            <Calendar className="w-3.5 h-3.5 text-emerald-400" />
            <span>{t.filterDateFrom || 'Da'}:</span>
          </span>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="bg-slate-950/80 text-white border border-slate-800 px-2.5 py-1 rounded-xl text-xs focus:outline-none focus:border-emerald-500/60 font-mono"
          />

          <span className="font-bold text-slate-300 ml-1">{t.filterDateTo || 'A'}:</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="bg-slate-950/80 text-white border border-slate-800 px-2.5 py-1 rounded-xl text-xs focus:outline-none focus:border-emerald-500/60 font-mono"
          />

          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
              className="text-[10px] text-slate-400 hover:text-white underline ml-1 cursor-pointer"
            >
              Azzera date
            </button>
          )}
        </div>

        {/* Reset All Filters Button (if active) */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleResetAllFilters}
            className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition cursor-pointer self-start md:self-auto"
          >
            <RotateCcw className="w-3 h-3" />
            <span>{t.resetFilters || 'Reimposta filtri'}</span>
          </button>
        )}
      </div>

      {/* ================= DATA TABLE ================= */}
      {sortedMovements.length > 0 ? (
        <div className="overflow-x-auto custom-scrollbar border border-slate-800/80 rounded-2xl bg-slate-950/30">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] text-slate-400 font-mono uppercase tracking-wider bg-slate-900/80 backdrop-blur-sm sticky top-0 z-10">
                {columnDefs
                  .filter(c => visibleColumns.includes(c.key))
                  .map(col => {
                    const isSorted = sortColumn === col.key;
                    const alignClass =
                      col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';

                    return (
                      <th
                        key={col.key}
                        onClick={() => col.sortable && handleSort(col.key)}
                        className={`py-2.5 px-3 select-none ${alignClass} ${
                          col.sortable ? 'cursor-pointer hover:text-white transition-colors group' : ''
                        }`}
                      >
                        <div
                          className={`flex items-center gap-1.5 ${
                            col.align === 'right'
                              ? 'justify-end'
                              : col.align === 'center'
                              ? 'justify-center'
                              : 'justify-start'
                          }`}
                        >
                          <span className={isSorted ? 'text-emerald-400 font-bold' : ''}>{col.label}</span>
                          {col.sortable && (
                            <span className="shrink-0">
                              {isSorted ? (
                                sortDirection === 'asc' ? (
                                  <ArrowUp className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <ArrowDown className="w-3 h-3 text-emerald-400" />
                                )
                              ) : (
                                <ArrowUpDown className="w-3 h-3 text-slate-600 group-hover:text-slate-400 transition" />
                              )}
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/40">
              {paginatedMovements.map(m => {
                const ent = entities.find(e => e.id === m.entityId);
                const isValuation = m.type === NonTickerMovementType.VALUATION;
                const isReturn = m.type === NonTickerMovementType.RETURN;
                const isOutflow = isFlowOutflow(m.type, movementTypeConfigs);
                const isInflow = isFlowInflow(m.type, movementTypeConfigs);
                const itemCurrency = ent?.currency || selectedCurrency;

                return (
                  <tr key={m.id} className="hover:bg-slate-800/30 transition-colors duration-150 group">
                    {/* 1. Date */}
                    {visibleColumns.includes('date') && (
                      <td className="py-2.5 px-3 font-mono text-slate-300 whitespace-nowrap">
                        {formatDateString(m.date, lang)}
                      </td>
                    )}

                    {/* 2. Entity Name */}
                    {visibleColumns.includes('entity') && (
                      <td className="py-2.5 px-3 font-semibold text-white whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          {ent && getCategoryIcon(ent.category)}
                          <span className="truncate max-w-[140px]" title={ent ? ent.name : m.entityId}>
                            {ent ? ent.name : m.entityId}
                          </span>
                        </span>
                      </td>
                    )}

                    {/* 3. Operation Type */}
                    {visibleColumns.includes('type') && (
                      <td className="py-2.5 px-3 whitespace-nowrap">{renderMovementTypeBadge(m.type)}</td>
                    )}

                    {/* 4. Cash Flow Amount */}
                    {visibleColumns.includes('amount') && (
                      <td className="py-2.5 px-3 font-mono font-bold whitespace-nowrap text-right">
                        {isValuation ? (
                          <span className="text-slate-600">—</span>
                        ) : isReturn ? (
                          <span className="text-slate-600">—</span>
                        ) : isOutflow ? (
                          <span className="text-rose-400">-{formatCurrency(m.amount || 0, itemCurrency)}</span>
                        ) : (
                          <span className="text-sky-400">+{formatCurrency(m.amount || 0, itemCurrency)}</span>
                        )}
                      </td>
                    )}

                    {/* 5. Valuation / Balance */}
                    {visibleColumns.includes('valuation') && (
                      <td className="py-2.5 px-3 font-mono font-bold whitespace-nowrap text-right">
                        {isValuation ? (
                          <span className="text-cyan-400">
                            {formatCurrency(m.valuation || 0, itemCurrency)}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    )}

                    {/* 6. Units */}
                    {visibleColumns.includes('units') && (
                      <td className="py-2.5 px-3 font-mono text-xs whitespace-nowrap text-right">
                        {m.units !== undefined && m.units !== null && Number(m.units) > 0 ? (
                          <span className={isOutflow ? 'text-rose-400 font-bold' : 'text-cyan-300 font-bold'}>
                            {isOutflow ? '-' : isValuation ? '' : '+'}
                            <QuantityDisplay value={m.units} />
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    )}

                    {/* 7. Unit Price / NAV */}
                    {visibleColumns.includes('unitPrice') && (
                      <td className="py-2.5 px-3 font-mono text-xs whitespace-nowrap text-right">
                        {m.unitPrice !== undefined && m.unitPrice !== null && m.unitPrice > 0 ? (
                          <span className="text-slate-300">
                            {formatCurrency(m.unitPrice, itemCurrency)}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    )}

                    {/* 8. Gross Return */}
                    {visibleColumns.includes('grossReturn') && (
                      <td className="py-2.5 px-3 font-mono text-xs whitespace-nowrap text-right">
                        {m.grossReturn !== undefined && m.grossReturn > 0 ? (
                          <span className="text-emerald-300 font-medium">
                            +{formatCurrency(m.grossReturn, itemCurrency)}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    )}

                    {/* 9. Taxes Paid */}
                    {visibleColumns.includes('taxAmount') && (
                      <td className="py-2.5 px-3 font-mono text-xs whitespace-nowrap text-right">
                        {m.taxAmount !== undefined && m.taxAmount > 0 ? (
                          <span className="text-rose-400 font-medium">
                            -{formatCurrency(m.taxAmount, itemCurrency)}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    )}

                    {/* 10. Net Return */}
                    {visibleColumns.includes('netReturn') && (
                      <td className="py-2.5 px-3 font-mono font-bold whitespace-nowrap text-right">
                        {isReturn ? (
                          <span className="text-emerald-400">
                            +{formatCurrency(m.netReturn || 0, itemCurrency)}
                            {m.isReinvested === false && (
                              <span className="text-[9px] text-amber-400 bg-amber-500/10 px-1 py-0.2 rounded ml-1 font-sans font-normal">
                                Liq.
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    )}

                    {/* 11. Fee / Commissions */}
                    {visibleColumns.includes('fee') && (
                      <td className="py-2.5 px-3 font-mono text-xs whitespace-nowrap text-right">
                        {m.fee !== undefined && m.fee > 0 ? (
                          <span className="text-amber-400/90 font-medium">
                            -{formatCurrency(m.fee, itemCurrency)}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    )}

                    {/* 12. Source / Provenance */}
                    {visibleColumns.includes('source') && (
                      <td className="py-2.5 px-3 whitespace-nowrap">{renderSourceBadge(m)}</td>
                    )}

                    {/* 13. Notes & References */}
                    {visibleColumns.includes('notes') && (
                      <td className="py-2.5 px-3 text-slate-400 max-w-[180px] truncate" title={m.notes}>
                        {m.notes || '—'}
                      </td>
                    )}

                    {/* 14. Actions */}
                    {visibleColumns.includes('actions') && (
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onEditMovement(m)}
                            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                            title={t.editMovementBtn || 'Modifica'}
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onRequestDeleteMovement(m)}
                            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-950/20 transition cursor-pointer"
                            title={t.deleteMovementBtn || 'Elimina'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-12 text-center text-slate-400 text-xs bg-slate-950/20 border border-slate-800/60 rounded-2xl space-y-2">
          <Info className="w-5 h-5 mx-auto text-slate-500" />
          <p>{t.noMatchingRecords || 'Nessun movimento trovato con i criteri di filtro selezionati.'}</p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetAllFilters}
              className="text-emerald-400 hover:text-emerald-300 underline font-bold cursor-pointer"
            >
              Reimposta tutti i filtri
            </button>
          )}
        </div>
      )}

      {/* ================= SEMANTIC FOOTER TOTALS ================= */}
      {sortedMovements.length > 0 && (
        <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <span className="font-extrabold text-[11px] text-white font-mono uppercase tracking-wider flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t.tableTotals || 'Totali Semantici Tabella Filtrata'} ({tableTotals.totalCount} righe)</span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              Valuta di riferimento: <span className="text-white font-bold">{selectedCurrency}</span>
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs font-mono">
            {/* Totale Entrate */}
            <div className="p-2.5 bg-sky-950/20 border border-sky-500/20 rounded-xl">
              <span className="text-[10px] text-slate-400 block font-sans">
                {t.totalInflowsSum || 'Totale Entrate (+)'}
              </span>
              <span className="text-sm font-bold text-sky-400 block mt-0.5">
                +{formatCurrency(tableTotals.totalInflows, selectedCurrency)}
              </span>
            </div>

            {/* Totale Uscite */}
            <div className="p-2.5 bg-rose-950/20 border border-rose-500/20 rounded-xl">
              <span className="text-[10px] text-slate-400 block font-sans">
                {t.totalOutflowsSum || 'Totale Uscite (-)'}
              </span>
              <span className="text-sm font-bold text-rose-400 block mt-0.5">
                -{formatCurrency(tableTotals.totalOutflows, selectedCurrency)}
              </span>
            </div>

            {/* Flusso Netto */}
            <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl">
              <span className="text-[10px] text-slate-400 block font-sans">
                {t.netFlowSum || 'Flusso Netto Versato'}
              </span>
              <span
                className={`text-sm font-bold block mt-0.5 ${
                  tableTotals.netCapitalContributed >= 0 ? 'text-white' : 'text-rose-400'
                }`}
              >
                {formatCurrency(tableTotals.netCapitalContributed, selectedCurrency)}
              </span>
            </div>

            {/* Rendimenti Lordi */}
            <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl">
              <span className="text-[10px] text-slate-400 block font-sans">
                {t.totalGrossReturnsSum || 'Rendimenti Lordi'}
              </span>
              <span className="text-sm font-bold text-emerald-300 block mt-0.5">
                +{formatCurrency(tableTotals.totalGrossReturn, selectedCurrency)}
              </span>
            </div>

            {/* Ritenute Fiscali */}
            <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl">
              <span className="text-[10px] text-slate-400 block font-sans">
                {t.totalTaxesSum || 'Ritenute Fiscali'}
              </span>
              <span className="text-sm font-bold text-rose-400 block mt-0.5">
                -{formatCurrency(tableTotals.totalTaxes, selectedCurrency)}
              </span>
            </div>

            {/* Rendimenti Netti */}
            <div className="p-2.5 bg-emerald-950/20 border border-emerald-500/30 rounded-xl">
              <span className="text-[10px] text-emerald-400 font-bold block font-sans">
                {t.totalNetReturnsSum || 'Rendimenti Netti'}
              </span>
              <span className="text-sm font-black text-emerald-400 block mt-0.5">
                +{formatCurrency(tableTotals.totalNetReturn, selectedCurrency)}
              </span>
            </div>
          </div>

          {/* Secondary stats if commissions or units are present */}
          {(tableTotals.totalCommissions > 0 || tableTotals.hasUnits) && (
            <div className="pt-2 border-t border-slate-800/60 flex flex-wrap items-center justify-between text-[11px] text-slate-400 font-mono gap-3">
              {tableTotals.totalCommissions > 0 && (
                <div>
                  <span>Totale Commissioni: </span>
                  <span className="text-amber-400 font-bold">
                    -{formatCurrency(tableTotals.totalCommissions, selectedCurrency)}
                  </span>
                </div>
              )}
              {tableTotals.hasUnits && (
                <div>
                  <span>Quote Nette Movimentate: </span>
                  <span className="text-cyan-300 font-bold">
                    {tableTotals.netUnitsHandled.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 4
                    })}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ================= PAGINATION CONTROLS ================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 text-xs">
        {/* Page Size selector and row range info */}
        <div className="flex items-center gap-3 text-slate-400">
          <div className="flex items-center gap-1.5">
            <span>{t.itemsPerPage || 'Righe:'}</span>
            <select
              value={pageSize}
              onChange={e => handlePageSizeChange(Number(e.target.value))}
              className="bg-slate-950 text-white border border-slate-800 rounded-lg px-2 py-1 focus:outline-none focus:border-emerald-500/60 font-mono cursor-pointer"
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="250">250</option>
              <option value="99999">Tutte</option>
            </select>
          </div>

          <span className="font-mono text-[11px]">
            {t.showingRows || 'Mostrati'}{' '}
            <strong className="text-white">
              {sortedMovements.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
            </strong>
            -
            <strong className="text-white">
              {Math.min(currentPage * pageSize, sortedMovements.length)}
            </strong>{' '}
            {t.ofTotalRows || 'di'} <strong className="text-white">{sortedMovements.length}</strong>
          </span>
        </div>

        {/* Pagination Page Jump Buttons */}
        {totalPages > 1 && (
          <div className="flex items-center gap-1 self-end sm:self-auto font-mono">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(1)}
              className="p-1.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
              title="Prima pagina"
            >
              <ChevronsLeft className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
              title="Pagina precedente"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <span className="px-2 text-slate-300 text-xs">
              {currentPage} {t.pageOf || 'di'} {totalPages}
            </span>

            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
              title="Pagina successiva"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(totalPages)}
              className="p-1.5 rounded-lg border border-slate-800 bg-slate-950 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
              title="Ultima pagina"
            >
              <ChevronsRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
