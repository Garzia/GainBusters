/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Motore di calcolo finanziario per investimenti e attività finanziarie prive di ticker:
 * Fondi pensione, conti deposito/liquidità remunerata, TFR aziendale, polizze, prestiti p2p.
 * Calcola:
 * - Flussi di capitale in entrata/uscita distinti per tipologia (dipendente, datore, TFR, versamenti, prelievi)
 * - Ricostruzione dell'evoluzione temporale del capitale versato e del saldo/controvalore
 * - Rendimenti lordi, imposte e rendimenti netti (reinvestiti o liquidati)
 * - Metriche di rendimento: Rendimento Semplice, MWRR/IRR (Newton-Raphson + Bisezione), TWRR (Time-Weighted)
 * - Statistiche e spaccati dettagliati dei flussi.
 */

import { NonTickerEntity, NonTickerMovement, NonTickerMovementType, NonTickerMovementTypeConfig } from '../types.ts';
import { cleanFloatNoise } from './finance.ts';

export interface NonTickerTimelinePoint {
  date: string; // YYYY-MM-DD
  netInvested: number;
  investedNominal: number;
  investedWithCommissions: number;
  balance: number;
  netGain: number;
  movementType?: NonTickerMovementType | string;
  amount?: number;
  units?: number;
  unitPrice?: number;
  fee?: number;
  balanceUnits?: number;
  notes?: string;
}

export interface NonTickerUsedFlow {
  type: string;
  direction: 'INFLOW' | 'OUTFLOW';
  amount: number;
  units: number;
  count: number;
  pct: number;
}

export interface NonTickerPeriodPerformance {
  timeframe: string;
  startDate: string;
  endDate: string;
  startBalance: number;
  endBalance: number;
  inflows: number;
  outflows: number;
  netInvested: number;
  commissions: number;
  grossReturn: number;
  grossReturns?: number;
  taxes: number;
  netReturn: number;
  netReturns?: number;
  netGain: number;
  simpleReturnPct: number;
  twrr: { annualized: number | null; cumulative: number | null };
  mwrr: { annualized: number | null; cumulative: number | null };
  twrrCumulative?: number | null;
  twrrAnnualized?: number | null;
  mwrrCumulative?: number | null;
  mwrrAnnualized?: number | null;
}

export interface NonTickerMetrics {
  entityId: string | 'ALL';
  currency: string;
  totalInflows: number;
  totalOutflows: number;
  netInvested: number;
  netInvestedNominal: number;
  netInvestedWithCommissions: number;
  totalCommissions: number;
  includeCommissions: boolean;
  currentValue: number;
  netGain: number;
  simpleReturnPct: number;
  mwrrAnnualized: number | null;
  mwrrCumulative: number | null;
  twrrAnnualized: number | null;
  twrrCumulative: number | null;
  totalGrossReturn: number;
  totalTaxes: number;
  totalNetReturn: number;
  effectiveTaxRate: number;

  // Supporto per gestione quote
  hasUnits: boolean;
  totalUnits: number;
  inflowUnits: number;
  outflowUnits: number;
  averageUnitCost: number | null;
  currentUnitPrice: number | null;

  // Spaccato dinamico flussi effettivamente utilizzati
  usedFlows: NonTickerUsedFlow[];
  
  // Spaccato Entrate Standard (retrocompatibilità)
  employeeContrib: number;
  employerContrib: number;
  tfrContrib: number;
  voluntaryDeposit: number;
  otherInflows: number;

  // Spaccato Uscite Standard (retrocompatibilità)
  withdrawals: number;
  otherOutflows: number;

  // Rendimenti
  reinvestedReturns: number;
  liquidatedReturns: number;

  lastValuationDate: string | null;
  firstDate: string | null;
  daysTracked: number;
  timeline: NonTickerTimelinePoint[];
  movementsCount: number;
}

export const DEFAULT_NON_TICKER_MOVEMENT_TYPES: NonTickerMovementTypeConfig[] = [
  // Entrate (+)
  { id: 'EMPLOYEE_CONTRIBUTION', name: 'Contributo Dipendente', direction: 'INFLOW', isDefault: true, order: 1 },
  { id: 'EMPLOYER_CONTRIBUTION', name: 'Contributo Datore di Lavoro', direction: 'INFLOW', isDefault: true, order: 2 },
  { id: 'TFR', name: 'Quota TFR Versata', direction: 'INFLOW', isDefault: true, order: 3 },
  { id: 'DEPOSIT', name: 'Versamento / Deposito', direction: 'INFLOW', isDefault: true, order: 4 },
  { id: 'DIVESTMENT', name: 'Disinvestimento / Vendita Titoli', direction: 'INFLOW', isDefault: true, order: 5 },
  { id: 'CASHBACK', name: 'Cashback / Saveback / Bonus', direction: 'INFLOW', isDefault: true, order: 6 },
  { id: 'OTHER_INFLOW', name: 'Altro Flusso in Entrata', direction: 'INFLOW', isDefault: true, order: 7 },
  // Uscite (-)
  { id: 'WITHDRAWAL', name: 'Prelievo / Riscatto / Anticipazione', direction: 'OUTFLOW', isDefault: true, order: 8 },
  { id: 'INVESTMENT', name: 'Investimento / Acquisto Titoli', direction: 'OUTFLOW', isDefault: true, order: 9 },
  { id: 'CARD_SPEND', name: 'Spesa con Carta', direction: 'OUTFLOW', isDefault: true, order: 10 },
  { id: 'FEE', name: 'Canone / Spese di Gestione', direction: 'OUTFLOW', isDefault: true, order: 11 },
  { id: 'OTHER_OUTFLOW', name: 'Altro Flusso in Uscita', direction: 'OUTFLOW', isDefault: true, order: 12 }
];

export function isFlowInflow(type: string, configs?: NonTickerMovementTypeConfig[]): boolean {
  if (configs && configs.length > 0) {
    const found = configs.find(c => c.id === type);
    if (found) return found.direction === 'INFLOW';
  }
  return (
    type === NonTickerMovementType.DEPOSIT ||
    type === NonTickerMovementType.EMPLOYEE_CONTRIBUTION ||
    type === NonTickerMovementType.EMPLOYER_CONTRIBUTION ||
    type === NonTickerMovementType.TFR ||
    type === NonTickerMovementType.DIVESTMENT ||
    type === NonTickerMovementType.CASHBACK ||
    type === NonTickerMovementType.OTHER_INFLOW
  );
}

export function isFlowOutflow(type: string, configs?: NonTickerMovementTypeConfig[]): boolean {
  if (configs && configs.length > 0) {
    const found = configs.find(c => c.id === type);
    if (found) return found.direction === 'OUTFLOW';
  }
  return (
    type === NonTickerMovementType.WITHDRAWAL ||
    type === NonTickerMovementType.INVESTMENT ||
    type === NonTickerMovementType.CARD_SPEND ||
    type === NonTickerMovementType.FEE ||
    type === NonTickerMovementType.OTHER_OUTFLOW
  );
}

/**
 * Normalizza data per ordinamento e comparazione (YYYY-MM-DD)
 */
export function getStandardDate(dateStr: string): string {
  if (!dateStr) return '';
  return dateStr.includes('T') ? dateStr.split('T')[0] : dateStr.substring(0, 10);
}

/**
 * Risolutore MWRR / IRR (Money-Weighted Rate of Return / Internal Rate of Return)
 * Utilizza il metodo di Newton-Raphson con fallback robusto a bisezione.
 */
export function solveMWRR(
  cashFlows: { dateStr: string; amount: number }[]
): { annualized: number | null; cumulative: number | null } {
  if (cashFlows.length < 2) {
    return { annualized: null, cumulative: null };
  }

  // Ordina per data crescente
  const sorted = [...cashFlows].sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  const t0 = new Date(sorted[0].dateStr).getTime();
  const tEnd = new Date(sorted[sorted.length - 1].dateStr).getTime();
  const totalDays = Math.max(1, (tEnd - t0) / (1000 * 60 * 60 * 24));

  // Verifica se ci sono flussi di segno opposto
  let hasPositive = false;
  let hasNegative = false;
  for (const cf of sorted) {
    if (cf.amount > 0.0001) hasPositive = true;
    if (cf.amount < -0.0001) hasNegative = true;
  }
  if (!hasPositive || !hasNegative) {
    return { annualized: null, cumulative: null };
  }

  // Prepara anni frazionari
  const items = sorted.map(cf => ({
    amount: cf.amount,
    years: (new Date(cf.dateStr).getTime() - t0) / (1000 * 60 * 60 * 24 * 365.25)
  }));

  const npv = (r: number): number => {
    let sum = 0;
    for (const item of items) {
      if (item.years === 0) {
        sum += item.amount;
      } else {
        const base = 1 + r;
        if (base <= 0.000001) return -Infinity;
        sum += item.amount / Math.pow(base, item.years);
      }
    }
    return sum;
  };

  const dnpv = (r: number): number => {
    let sum = 0;
    for (const item of items) {
      if (item.years > 0) {
        const base = 1 + r;
        if (base <= 0.000001) return 0;
        sum += (-item.years * item.amount) / Math.pow(base, item.years + 1);
      }
    }
    return sum;
  };

  // 1. Newton-Raphson
  let r = 0.08; // punto iniziale 8%
  let found = false;
  for (let i = 0; i < 60; i++) {
    const val = npv(r);
    if (Math.abs(val) < 0.001) {
      found = true;
      break;
    }
    const deriv = dnpv(r);
    if (Math.abs(deriv) < 1e-9) break;
    const step = val / deriv;
    const nextR = r - step;
    if (nextR <= -0.999 || nextR > 20) {
      break; // Fuori range, passa a bisezione
    }
    r = nextR;
  }

  // 2. Fallback Bisezione
  if (!found) {
    let low = -0.99;
    let high = 5.0;
    let fLow = npv(low);
    let fHigh = npv(high);

    if (fLow * fHigh > 0) {
      // Prova range più ampio
      high = 20.0;
      fHigh = npv(high);
    }

    if (fLow * fHigh <= 0) {
      for (let i = 0; i < 80; i++) {
        const mid = (low + high) / 2;
        const fMid = npv(mid);
        if (Math.abs(fMid) < 0.001 || (high - low) < 0.0001) {
          r = mid;
          found = true;
          break;
        }
        if (fLow * fMid < 0) {
          high = mid;
          fHigh = fMid;
        } else {
          low = mid;
          fLow = fMid;
        }
      }
    }
  }

  if (!found || isNaN(r) || !isFinite(r)) {
    return { annualized: null, cumulative: null };
  }

  const annualized = r;
  const cumulative = totalDays >= 365.25
    ? Math.pow(1 + r, totalDays / 365.25) - 1
    : r * (totalDays / 365.25);

  return { annualized, cumulative };
}

/**
 * Calcola il TWRR (Time-Weighted Rate of Return) basato su rilevazioni periodiche e flussi
 */
export function calculateTWRR(
  movements: NonTickerMovement[],
  currentValue: number,
  asOfDate: string,
  movementTypeConfigs?: NonTickerMovementTypeConfig[]
): { annualized: number | null; cumulative: number | null } {
  if (movements.length === 0) return { annualized: null, cumulative: null };

  const sorted = [...movements].sort((a, b) => a.date.localeCompare(b.date));
  const t0Str = getStandardDate(sorted[0].date);
  const tEndStr = getStandardDate(asOfDate || sorted[sorted.length - 1].date);
  
  const d0 = new Date(t0Str).getTime();
  const dEnd = new Date(tEndStr).getTime();
  const totalDays = Math.max(1, (dEnd - d0) / (1000 * 60 * 60 * 24));

  // Raggruppa i movimenti per data e identifica le rilevazioni
  // Ogni intervallo tra due rilevazioni costituisce un sub-periodo di performance pura
  interface SubPeriod {
    startDate: string;
    startVal: number;
    endDate: string;
    endVal: number;
    flows: { date: string; netFlow: number }[];
  }

  const valuations = sorted.filter(m => m.type === NonTickerMovementType.VALUATION && m.valuation !== undefined);

  // Se non ci sono rilevazioni intermedie esplicite oltre al valore attuale:
  // Valutiamo l'intero periodo partendo dal primo versamento
  if (valuations.length === 0) {
    const totalIn = sorted.reduce((sum, m) => {
      if (isFlowInflow(m.type, movementTypeConfigs)) return sum + (m.amount || 0);
      return sum;
    }, 0);
    const totalOut = sorted.reduce((sum, m) => {
      if (isFlowOutflow(m.type, movementTypeConfigs)) {
        return sum + (m.amount || 0);
      }
      return sum;
    }, 0);
    const netCashIn = totalIn - totalOut;
    if (netCashIn <= 0) return { annualized: null, cumulative: null };

    const gain = currentValue + totalOut - totalIn;
    const periodReturn = gain / netCashIn;
    const ann = totalDays >= 365.25 ? Math.pow(1 + periodReturn, 365.25 / totalDays) - 1 : periodReturn;
    return { annualized: ann, cumulative: periodReturn };
  }

  // Costruisci catena di sub-periodi (Modified Dietz per ogni subperiodo)
  const valuationDates = Array.from(new Set(valuations.map(v => getStandardDate(v.date)))).sort();
  
  let compoundFactor = 1.0;
  let prevValDate = t0Str;
  let prevVal = 0;

  // Calcola saldo iniziale al tempo t0
  const firstMv = sorted[0];
  if (firstMv.type === NonTickerMovementType.VALUATION) {
    prevVal = firstMv.valuation || 0;
  } else {
    prevVal = firstMv.amount || 0;
  }

  for (let i = 0; i < valuationDates.length; i++) {
    const vDate = valuationDates[i];
    const valObj = valuations.find(v => getStandardDate(v.date) === vDate);
    const endVal = valObj?.valuation || 0;

    if (vDate === prevValDate) {
      prevVal = endVal;
      continue;
    }

    // Flussi intermedi in [prevValDate, vDate)
    const midFlows = sorted.filter(m => {
      const d = getStandardDate(m.date);
      return d >= prevValDate && d <= vDate && m.type !== NonTickerMovementType.VALUATION;
    });

    const dStartMs = new Date(prevValDate).getTime();
    const dEndMs = new Date(vDate).getTime();
    const spanDays = Math.max(1, (dEndMs - dStartMs) / (1000 * 60 * 60 * 24));

    let netFlowsSum = 0;
    let weightedFlowsSum = 0;

    for (const mf of midFlows) {
      let flow = 0;
      if (isFlowInflow(mf.type, movementTypeConfigs)) {
        flow = mf.amount || 0;
      } else if (isFlowOutflow(mf.type, movementTypeConfigs)) {
        flow = -(mf.amount || 0);
      } else if (mf.type === NonTickerMovementType.RETURN && mf.isReinvested === false) {
        // Provento pagato fuori
        flow = -(mf.netReturn || 0);
      }

      if (flow !== 0) {
        const dFlowMs = new Date(getStandardDate(mf.date)).getTime();
        const weight = Math.max(0, Math.min(1, (dEndMs - dFlowMs) / spanDays));
        netFlowsSum += flow;
        weightedFlowsSum += flow * weight;
      }
    }

    const denominator = prevVal + weightedFlowsSum;
    if (denominator > 0.0001) {
      const subReturn = (endVal - prevVal - netFlowsSum) / denominator;
      compoundFactor *= (1 + subReturn);
    }

    prevVal = endVal;
    prevValDate = vDate;
  }

  // Se ci sono flussi o tempo dopo l'ultima rilevazione fino ad asOfDate:
  if (prevValDate < tEndStr && currentValue > 0) {
    const postFlows = sorted.filter(m => {
      const d = getStandardDate(m.date);
      return d > prevValDate && m.type !== NonTickerMovementType.VALUATION;
    });
    const dStartMs = new Date(prevValDate).getTime();
    const dEndMs = new Date(tEndStr).getTime();
    const spanDays = Math.max(1, (dEndMs - dStartMs) / (1000 * 60 * 60 * 24));

    let netFlowsSum = 0;
    let weightedFlowsSum = 0;

    for (const mf of postFlows) {
      let flow = 0;
      if (isFlowInflow(mf.type, movementTypeConfigs)) {
        flow = mf.amount || 0;
      } else if (isFlowOutflow(mf.type, movementTypeConfigs)) {
        flow = -(mf.amount || 0);
      } else if (mf.type === NonTickerMovementType.RETURN && mf.isReinvested === false) {
        flow = -(mf.netReturn || 0);
      }

      if (flow !== 0) {
        const dFlowMs = new Date(getStandardDate(mf.date)).getTime();
        const weight = Math.max(0, Math.min(1, (dEndMs - dFlowMs) / spanDays));
        netFlowsSum += flow;
        weightedFlowsSum += flow * weight;
      }
    }

    const denominator = prevVal + weightedFlowsSum;
    if (denominator > 0.0001) {
      const subReturn = (currentValue - prevVal - netFlowsSum) / denominator;
      compoundFactor *= (1 + subReturn);
    }
  }

  const cumulative = compoundFactor - 1;
  const annualized = totalDays >= 365.25
    ? Math.pow(compoundFactor, 365.25 / totalDays) - 1
    : cumulative;

  return { annualized, cumulative };
}

/**
 * Calcola l'insieme completo delle metriche di performance e la cronistoria
 * per una singola entità o per tutte le entità aggregate.
 */
export function calculateNonTickerMetrics(
  entityId: string | 'ALL',
  entities: NonTickerEntity[],
  allMovements: NonTickerMovement[],
  targetCurrency: string = 'EUR',
  movementTypeConfigs?: NonTickerMovementTypeConfig[],
  includeCommissions: boolean = true
): NonTickerMetrics {
  // Filtra per entità se non 'ALL'
  const relevantEntities = entityId === 'ALL'
    ? entities
    : entities.filter(e => e.id === entityId);
  
  const relevantEntityIds = new Set(relevantEntities.map(e => e.id));
  const movements = allMovements
    .filter(m => relevantEntityIds.has(m.entityId))
    .sort((a, b) => a.date.localeCompare(b.date));

  let totalInflows = 0;
  let totalOutflows = 0;
  let totalCommissions = 0;
  let employeeContrib = 0;
  let employerContrib = 0;
  let tfrContrib = 0;
  let voluntaryDeposit = 0;
  let otherInflows = 0;
  let withdrawals = 0;
  let otherOutflows = 0;

  let totalGrossReturn = 0;
  let totalTaxes = 0;
  let totalNetReturn = 0;
  let reinvestedReturns = 0;
  let liquidatedReturns = 0;

  // Gestione Quote (Units)
  const hasUnits = movements.some(m => (m.units !== undefined && m.units !== null && Number(m.units) > 0) || (m.unitPrice !== undefined && Number(m.unitPrice) > 0));
  let runningUnits = 0;
  let inflowUnits = 0;
  let outflowUnits = 0;
  const entityRunningUnits = new Map<string, number>();

  let lastValuationDate: string | null = null;
  let latestValuationValue: number | null = null;
  let firstDate: string | null = movements.length > 0 ? getStandardDate(movements[0].date) : null;

  // Tracciamento timeline punto per punto
  const timeline: NonTickerTimelinePoint[] = [];
  let runningInvestedNominal = 0;
  let runningInvestedWithCommissions = 0;
  let runningBalance = 0;

  // Memorizza l'ultima rilevazione per entità per gestire aggregazioni multiple
  const latestValuationByEntity = new Map<string, { date: string; value: number }>();
  const entityRunningBalance = new Map<string, number>();

  // Calcolo flussi utilizzati per lo spaccato dinamico
  const usedFlowsMap = new Map<string, { type: string; direction: 'INFLOW' | 'OUTFLOW'; amount: number; units: number; count: number }>();

  for (const m of movements) {
    const dStr = getStandardDate(m.date);
    const currentEntityBal = entityRunningBalance.get(m.entityId) || 0;
    const currentEntUnits = entityRunningUnits.get(m.entityId) || 0;
    const mUnits = Number(m.units) || 0;
    const mFee = Number(m.fee) || 0;
    const mUnitPrice = Number(m.unitPrice) || undefined;

    const isInf = isFlowInflow(m.type, movementTypeConfigs);
    const isOut = isFlowOutflow(m.type, movementTypeConfigs);

    if (isInf) {
      let amt = m.amount !== undefined && m.amount !== null ? Number(m.amount) : 0;
      if (amt === 0 && mUnits > 0 && mUnitPrice !== undefined && mUnitPrice > 0) {
        amt = mUnits * mUnitPrice;
      }
      totalInflows += amt;
      totalCommissions += mFee;
      runningInvestedNominal += amt;
      runningInvestedWithCommissions += (amt + mFee);
      runningBalance += amt;
      entityRunningBalance.set(m.entityId, currentEntityBal + amt);

      if (mUnits > 0) {
        inflowUnits += mUnits;
        runningUnits += mUnits;
        entityRunningUnits.set(m.entityId, currentEntUnits + mUnits);
      }

      // Aggregazione per spaccato flussi utilizzati
      const entry = usedFlowsMap.get(m.type) || { type: m.type, direction: 'INFLOW', amount: 0, units: 0, count: 0 };
      entry.amount += amt;
      entry.units += mUnits;
      entry.count += 1;
      usedFlowsMap.set(m.type, entry);

      // Categorie standard retrocompatibili
      if (m.type === NonTickerMovementType.EMPLOYEE_CONTRIBUTION) employeeContrib += amt;
      else if (m.type === NonTickerMovementType.EMPLOYER_CONTRIBUTION) employerContrib += amt;
      else if (m.type === NonTickerMovementType.TFR) tfrContrib += amt;
      else if (m.type === NonTickerMovementType.DEPOSIT) voluntaryDeposit += amt;
      else otherInflows += amt;

    } else if (isOut) {
      let amt = m.amount !== undefined && m.amount !== null ? Number(m.amount) : 0;
      if (amt === 0 && mUnits > 0 && mUnitPrice !== undefined && mUnitPrice > 0) {
        amt = mUnits * mUnitPrice;
      }
      totalOutflows += amt;
      totalCommissions += mFee;
      runningInvestedNominal -= amt;
      runningInvestedWithCommissions -= (amt - mFee);
      runningBalance = Math.max(0, runningBalance - amt);
      entityRunningBalance.set(m.entityId, Math.max(0, currentEntityBal - amt));

      if (mUnits > 0) {
        outflowUnits += mUnits;
        runningUnits = Math.max(0, runningUnits - mUnits);
        entityRunningUnits.set(m.entityId, Math.max(0, currentEntUnits - mUnits));
      }

      // Aggregazione per spaccato flussi utilizzati
      const entry = usedFlowsMap.get(m.type) || { type: m.type, direction: 'OUTFLOW', amount: 0, units: 0, count: 0 };
      entry.amount += amt;
      entry.units += mUnits;
      entry.count += 1;
      usedFlowsMap.set(m.type, entry);

      // Categorie standard retrocompatibili
      if (m.type === NonTickerMovementType.WITHDRAWAL) withdrawals += amt;
      else otherOutflows += amt;

    } else if (m.type === NonTickerMovementType.RETURN) {
      const gross = m.grossReturn || (m.netReturn !== undefined && m.taxAmount !== undefined ? (m.netReturn + m.taxAmount) : (m.netReturn || 0));
      const tax = m.taxAmount || 0;
      const net = m.netReturn !== undefined ? m.netReturn : Math.max(0, gross - tax);

      totalGrossReturn += gross;
      totalTaxes += tax;
      totalNetReturn += net;

      if (m.isReinvested !== false) {
        reinvestedReturns += net;
        runningBalance += net;
        entityRunningBalance.set(m.entityId, currentEntityBal + net);
        if (mUnits > 0) {
          runningUnits += mUnits;
          entityRunningUnits.set(m.entityId, currentEntUnits + mUnits);
        }
      } else {
        liquidatedReturns += net;
      }

    } else if (m.type === NonTickerMovementType.VALUATION) {
      const val = m.valuation !== undefined ? m.valuation : 0;
      const diff = val - currentEntityBal;
      runningBalance += diff;
      entityRunningBalance.set(m.entityId, val);
      latestValuationByEntity.set(m.entityId, { date: dStr, value: val });
      lastValuationDate = dStr;
      latestValuationValue = val;

      if (mUnits > 0) {
        const uDiff = mUnits - currentEntUnits;
        runningUnits += uDiff;
        entityRunningUnits.set(m.entityId, mUnits);
      }
    }

    const currentInvested = includeCommissions ? runningInvestedWithCommissions : runningInvestedNominal;
    const currentNetGain = (runningBalance + totalOutflows + liquidatedReturns - totalInflows) - (includeCommissions ? totalCommissions : 0);

    const lastPt = timeline.length > 0 ? timeline[timeline.length - 1] : null;
    const pointData: NonTickerTimelinePoint = {
      date: dStr,
      netInvested: Math.round(currentInvested * 100) / 100,
      investedNominal: Math.round(runningInvestedNominal * 100) / 100,
      investedWithCommissions: Math.round(runningInvestedWithCommissions * 100) / 100,
      balance: Math.round(runningBalance * 100) / 100,
      netGain: Math.round(currentNetGain * 100) / 100,
      movementType: lastPt && lastPt.date === dStr ? 'MULTIPLE' : m.type,
      amount: lastPt && lastPt.date === dStr
        ? Math.round(((lastPt.amount || 0) + (m.amount || m.valuation || m.netReturn || 0)) * 100) / 100
        : (m.amount || m.valuation || m.netReturn),
      units: lastPt && lastPt.date === dStr && lastPt.units !== undefined
        ? (lastPt.units + (m.units || 0))
        : m.units,
      unitPrice: m.unitPrice,
      fee: lastPt && lastPt.date === dStr && (lastPt.fee !== undefined || m.fee !== undefined)
        ? ((lastPt.fee || 0) + (m.fee || 0))
        : m.fee,
      balanceUnits: hasUnits ? cleanFloatNoise(runningUnits) : undefined,
      notes: lastPt && lastPt.date === dStr
        ? [lastPt.notes, m.notes].filter(Boolean).join('; ')
        : m.notes
    };

    if (lastPt && lastPt.date === dStr) {
      timeline[timeline.length - 1] = pointData;
    } else {
      timeline.push(pointData);
    }
  }

  // Calcolo saldo attuale finale
  let currentValue = 0;
  let totalUnits = 0;
  if (entityId !== 'ALL' && entityId) {
    currentValue = Math.max(0, runningBalance);
    totalUnits = Math.max(0, runningUnits);
  } else {
    // Somma dei saldi correnti di tutte le entità
    for (const ent of relevantEntities) {
      currentValue += entityRunningBalance.get(ent.id) || 0;
      totalUnits += entityRunningUnits.get(ent.id) || 0;
    }
  }

  const netInvestedNominal = totalInflows - totalOutflows;
  const netInvestedWithCommissions = netInvestedNominal + totalCommissions;
  const netInvested = includeCommissions ? netInvestedWithCommissions : netInvestedNominal;

  const netGainNominal = currentValue + totalOutflows + liquidatedReturns - totalInflows;
  const netGainWithCommissions = netGainNominal - totalCommissions;
  const netGain = includeCommissions ? netGainWithCommissions : netGainNominal;

  const returnBasis = includeCommissions ? netInvestedWithCommissions : netInvestedNominal;
  const simpleReturnPct = returnBasis > 0.01 ? (netGain / returnBasis) * 100 : (netInvestedNominal > 0.01 ? (netGain / netInvestedNominal) * 100 : 0);
  const effectiveTaxRate = totalGrossReturn > 0.01 ? (totalTaxes / totalGrossReturn) * 100 : 0;

  // Calcolo metriche quote
  const averageUnitCost = hasUnits && totalUnits > 0.00001 && netInvested > 0.001
    ? Math.round((netInvested / totalUnits) * 10000) / 10000
    : null;
  const currentUnitPrice = hasUnits && totalUnits > 0.00001 && currentValue > 0.001
    ? Math.round((currentValue / totalUnits) * 10000) / 10000
    : null;

  // Costruzione lista flussi utilizzati con percentuali
  const usedFlows: NonTickerUsedFlow[] = Array.from(usedFlowsMap.values()).map(f => {
    const baseTotal = f.direction === 'INFLOW' ? totalInflows : totalOutflows;
    return {
      ...f,
      amount: Math.round(f.amount * 100) / 100,
      units: cleanFloatNoise(f.units),
      pct: baseTotal > 0.001 ? Math.round((f.amount / baseTotal) * 1000) / 10 : 0
    };
  });

  // Calcolo MWRR / IRR
  const todayStr = new Date().toISOString().substring(0, 10);
  const mwrrCashFlows: { dateStr: string; amount: number }[] = [];

  for (const m of movements) {
    const dStr = getStandardDate(m.date);
    const fee = (Number(m.fee) || 0);
    if (isFlowInflow(m.type, movementTypeConfigs)) {
      const amt = m.amount || (m.units && m.unitPrice ? m.units * m.unitPrice : 0) || 0;
      if (amt > 0) {
        const cashOut = includeCommissions ? -(amt + fee) : -amt;
        mwrrCashFlows.push({ dateStr: dStr, amount: cashOut });
      }
    } else if (isFlowOutflow(m.type, movementTypeConfigs)) {
      const amt = m.amount || (m.units && m.unitPrice ? m.units * m.unitPrice : 0) || 0;
      if (amt > 0) {
        const cashIn = includeCommissions ? +(amt - fee) : +amt;
        mwrrCashFlows.push({ dateStr: dStr, amount: cashIn });
      }
    } else if (m.type === NonTickerMovementType.RETURN && m.isReinvested === false) {
      if ((m.netReturn || 0) > 0) {
        mwrrCashFlows.push({ dateStr: dStr, amount: +(m.netReturn || 0) });
      }
    }
  }

  if (currentValue > 0) {
    mwrrCashFlows.push({ dateStr: todayStr, amount: +currentValue });
  }

  const mwrrResult = solveMWRR(mwrrCashFlows);
  const twrrResult = calculateTWRR(movements, currentValue, todayStr, movementTypeConfigs);

  const daysTracked = firstDate
    ? Math.max(1, Math.round((new Date(todayStr).getTime() - new Date(firstDate).getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  return {
    entityId,
    currency: targetCurrency,
    totalInflows: Math.round(totalInflows * 100) / 100,
    totalOutflows: Math.round(totalOutflows * 100) / 100,
    netInvested: Math.round(netInvested * 100) / 100,
    netInvestedNominal: Math.round(netInvestedNominal * 100) / 100,
    netInvestedWithCommissions: Math.round(netInvestedWithCommissions * 100) / 100,
    totalCommissions: Math.round(totalCommissions * 100) / 100,
    includeCommissions,
    currentValue: Math.round(currentValue * 100) / 100,
    netGain: Math.round(netGain * 100) / 100,
    simpleReturnPct: Math.round(simpleReturnPct * 100) / 100,
    mwrrAnnualized: mwrrResult.annualized !== null ? Math.round(mwrrResult.annualized * 10000) / 100 : null,
    mwrrCumulative: mwrrResult.cumulative !== null ? Math.round(mwrrResult.cumulative * 10000) / 100 : null,
    twrrAnnualized: twrrResult.annualized !== null ? Math.round(twrrResult.annualized * 10000) / 100 : null,
    twrrCumulative: twrrResult.cumulative !== null ? Math.round(twrrResult.cumulative * 10000) / 100 : null,
    totalGrossReturn: Math.round(totalGrossReturn * 100) / 100,
    totalTaxes: Math.round(totalTaxes * 100) / 100,
    totalNetReturn: Math.round(totalNetReturn * 100) / 100,
    effectiveTaxRate: Math.round(effectiveTaxRate * 100) / 100,

    // Quote
    hasUnits,
    totalUnits: Math.round(totalUnits * 10000) / 10000,
    inflowUnits: Math.round(inflowUnits * 10000) / 10000,
    outflowUnits: Math.round(outflowUnits * 10000) / 10000,
    averageUnitCost,
    currentUnitPrice,

    // Flussi utilizzati
    usedFlows,

    employeeContrib: Math.round(employeeContrib * 100) / 100,
    employerContrib: Math.round(employerContrib * 100) / 100,
    tfrContrib: Math.round(tfrContrib * 100) / 100,
    voluntaryDeposit: Math.round(voluntaryDeposit * 100) / 100,
    otherInflows: Math.round(otherInflows * 100) / 100,
    withdrawals: Math.round(withdrawals * 100) / 100,
    otherOutflows: Math.round(otherOutflows * 100) / 100,
    reinvestedReturns: Math.round(reinvestedReturns * 100) / 100,
    liquidatedReturns: Math.round(liquidatedReturns * 100) / 100,
    lastValuationDate,
    firstDate,
    daysTracked,
    timeline,
    movementsCount: movements.length
  };
}

/**
 * Calcola le metriche di rendimento e performance per un periodo temporale specifico [startDate, endDate].
 * Usata per la sezione "Performance di periodo", nonché per assoggettare spaccato flussi e analisi fiscale al periodo.
 */
export function calculateNonTickerPeriodMetrics(
  metrics: NonTickerMetrics,
  movements: NonTickerMovement[],
  startDate: string,
  endDate: string,
  timeframeLabel: string = 'PERIODO',
  includeCommissions: boolean = true,
  movementTypeConfigs?: NonTickerMovementTypeConfig[]
): NonTickerPeriodPerformance {
  const normStart = getStandardDate(startDate);
  const normEnd = getStandardDate(endDate);

  // Trova saldo iniziale alla data startDate dalla timeline
  let startBalance = 0;
  if (metrics.timeline.length > 0) {
    const beforeOrAtStart = metrics.timeline.filter(pt => pt.date < normStart);
    if (beforeOrAtStart.length > 0) {
      startBalance = beforeOrAtStart[beforeOrAtStart.length - 1].balance;
    }
  }

  // Trova saldo finale alla data endDate dalla timeline
  let endBalance = metrics.currentValue;
  if (metrics.timeline.length > 0) {
    const beforeOrAtEnd = metrics.timeline.filter(pt => pt.date <= normEnd);
    if (beforeOrAtEnd.length > 0) {
      endBalance = beforeOrAtEnd[beforeOrAtEnd.length - 1].balance;
    } else {
      endBalance = 0;
    }
  }

  // Movimenti compresi nel periodo
  const periodMovements = movements.filter(m => {
    const d = getStandardDate(m.date);
    return d >= normStart && d <= normEnd;
  });

  let periodInflows = 0;
  let periodOutflows = 0;
  let periodCommissions = 0;
  let periodGrossReturn = 0;
  let periodTaxes = 0;
  let periodNetReturn = 0;
  let periodLiquidatedReturns = 0;

  for (const m of periodMovements) {
    const fee = Number(m.fee) || 0;
    const isInf = isFlowInflow(m.type, movementTypeConfigs);
    const isOut = isFlowOutflow(m.type, movementTypeConfigs);

    if (isInf) {
      let amt = m.amount !== undefined && m.amount !== null ? Number(m.amount) : 0;
      if (amt === 0 && m.units && m.unitPrice) amt = m.units * m.unitPrice;
      periodInflows += amt;
      periodCommissions += fee;
    } else if (isOut) {
      let amt = m.amount !== undefined && m.amount !== null ? Number(m.amount) : 0;
      if (amt === 0 && m.units && m.unitPrice) amt = m.units * m.unitPrice;
      periodOutflows += amt;
      periodCommissions += fee;
    } else if (m.type === NonTickerMovementType.RETURN) {
      const gross = m.grossReturn || (m.netReturn !== undefined && m.taxAmount !== undefined ? (m.netReturn + m.taxAmount) : (m.netReturn || 0));
      const tax = m.taxAmount || 0;
      const net = m.netReturn !== undefined ? m.netReturn : Math.max(0, gross - tax);

      periodGrossReturn += gross;
      periodTaxes += tax;
      periodNetReturn += net;

      if (m.isReinvested === false) {
        periodLiquidatedReturns += net;
      }
    }
  }

  const periodNetCapital = periodInflows - periodOutflows;
  const netInvested = periodNetCapital + (includeCommissions ? periodCommissions : 0);

  // Guadagno netto di periodo
  // Variazione di saldo + uscite + liquidati - entrate - commissioni (se incluse)
  const netGain = (endBalance - startBalance) + periodOutflows + periodLiquidatedReturns - periodInflows - (includeCommissions ? periodCommissions : 0);

  const baseCapital = startBalance + periodInflows + (includeCommissions ? periodCommissions : 0);
  const simpleReturnPct = baseCapital > 0.01 ? (netGain / baseCapital) * 100 : 0;

  // Calcolo MWRR di periodo
  const periodCashFlows: { dateStr: string; amount: number }[] = [];
  if (startBalance > 0) {
    periodCashFlows.push({ dateStr: normStart, amount: -startBalance });
  }

  for (const m of periodMovements) {
    const dStr = getStandardDate(m.date);
    const fee = Number(m.fee) || 0;
    if (isFlowInflow(m.type, movementTypeConfigs)) {
      const amt = m.amount || (m.units && m.unitPrice ? m.units * m.unitPrice : 0) || 0;
      if (amt > 0) {
        periodCashFlows.push({ dateStr: dStr, amount: includeCommissions ? -(amt + fee) : -amt });
      }
    } else if (isFlowOutflow(m.type, movementTypeConfigs)) {
      const amt = m.amount || (m.units && m.unitPrice ? m.units * m.unitPrice : 0) || 0;
      if (amt > 0) {
        periodCashFlows.push({ dateStr: dStr, amount: includeCommissions ? +(amt - fee) : +amt });
      }
    } else if (m.type === NonTickerMovementType.RETURN && m.isReinvested === false) {
      if ((m.netReturn || 0) > 0) {
        periodCashFlows.push({ dateStr: dStr, amount: +(m.netReturn || 0) });
      }
    }
  }

  if (endBalance > 0) {
    periodCashFlows.push({ dateStr: normEnd, amount: +endBalance });
  }

  const mwrr = solveMWRR(periodCashFlows);
  const twrr = calculateTWRR(periodMovements, endBalance, normEnd, movementTypeConfigs);

  return {
    timeframe: timeframeLabel,
    startDate: normStart,
    endDate: normEnd,
    startBalance: Math.round(startBalance * 100) / 100,
    endBalance: Math.round(endBalance * 100) / 100,
    inflows: Math.round(periodInflows * 100) / 100,
    outflows: Math.round(periodOutflows * 100) / 100,
    netInvested: Math.round(netInvested * 100) / 100,
    commissions: Math.round(periodCommissions * 100) / 100,
    grossReturn: Math.round(periodGrossReturn * 100) / 100,
    taxes: Math.round(periodTaxes * 100) / 100,
    netReturn: Math.round(periodNetReturn * 100) / 100,
    netGain: Math.round(netGain * 100) / 100,
    simpleReturnPct: Math.round(simpleReturnPct * 100) / 100,
    twrr: {
      annualized: twrr.annualized !== null ? Math.round(twrr.annualized * 10000) / 100 : null,
      cumulative: twrr.cumulative !== null ? Math.round(twrr.cumulative * 10000) / 100 : null
    },
    mwrr: {
      annualized: mwrr.annualized !== null ? Math.round(mwrr.annualized * 10000) / 100 : null,
      cumulative: mwrr.cumulative !== null ? Math.round(mwrr.cumulative * 10000) / 100 : null
    },
    twrrCumulative: twrr.cumulative !== null ? Math.round(twrr.cumulative * 10000) / 100 : null,
    twrrAnnualized: twrr.annualized !== null ? Math.round(twrr.annualized * 10000) / 100 : null,
    mwrrCumulative: mwrr.cumulative !== null ? Math.round(mwrr.cumulative * 10000) / 100 : null,
    mwrrAnnualized: mwrr.annualized !== null ? Math.round(mwrr.annualized * 10000) / 100 : null,
    netReturns: Math.round(periodNetReturn * 100) / 100,
    grossReturns: Math.round(periodGrossReturn * 100) / 100
  };
}
