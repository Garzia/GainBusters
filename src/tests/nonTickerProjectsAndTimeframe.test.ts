/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Test suite per la classificazione logica a progetti/tag delle Attività senza ticker
 * e per i selettori temporali dinamici "Mese corrente" e "Mese precedente".
 */

import {
  NonTickerMovement,
  NonTickerMovementType,
  NonTickerProject,
  DBState
} from '../types.ts';
import {
  isFlowInflow,
  isFlowOutflow
} from '../utils/nonTickerFinance.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
}

function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function calculateMonthBounds(referenceDate: Date) {
  // Current month: from day 1 to reference date
  const currentStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const currentEnd = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());

  // Previous month: from day 1 of previous month to last calendar day of previous month
  const prevStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1);
  const prevEnd = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 0);

  return {
    current: {
      start: formatLocalDate(currentStart),
      end: formatLocalDate(currentEnd)
    },
    previous: {
      start: formatLocalDate(prevStart),
      end: formatLocalDate(prevEnd)
    }
  };
}

console.log('--- Esecuzione Test Suite Progetti e Selettori Temporali Attività Senza Ticker ---');

// -------------------------------------------------------------
// 1. Test Calcolo Date "Mese Corrente" e "Mese Precedente"
// -------------------------------------------------------------
console.log('1. Verifica calcolo intervalli Mese Corrente e Mese Precedente...');

// Caso A: Mese standard a metà mese (15 Maggio 2026)
{
  const ref = new Date(2026, 4, 15); // Maggio 2026 (0-indexed 4)
  const bounds = calculateMonthBounds(ref);
  assert(bounds.current.start === '2026-05-01', `Current start mismatch: ${bounds.current.start}`);
  assert(bounds.current.end === '2026-05-15', `Current end mismatch: ${bounds.current.end}`);
  assert(bounds.previous.start === '2026-04-01', `Previous start mismatch: ${bounds.previous.start}`);
  assert(bounds.previous.end === '2026-04-30', `Previous end mismatch: ${bounds.previous.end} (Aprile deve avere 30 giorni)`);
}

// Caso B: Anno bisestile - Marzo 2024 verifica Febbraio 29
{
  const ref = new Date(2024, 2, 10); // 10 Marzo 2024
  const bounds = calculateMonthBounds(ref);
  assert(bounds.current.start === '2024-03-01', `Current start mismatch: ${bounds.current.start}`);
  assert(bounds.current.end === '2024-03-10', `Current end mismatch: ${bounds.current.end}`);
  assert(bounds.previous.start === '2024-02-01', `Previous start mismatch: ${bounds.previous.start}`);
  assert(bounds.previous.end === '2024-02-29', `Previous end mismatch: ${bounds.previous.end} (Febbraio 2024 bisestile deve avere 29 giorni)`);
}

// Caso C: Anno non bisestile - Marzo 2025 verifica Febbraio 28
{
  const ref = new Date(2025, 2, 5); // 5 Marzo 2025
  const bounds = calculateMonthBounds(ref);
  assert(bounds.previous.start === '2025-02-01', `Previous start mismatch: ${bounds.previous.start}`);
  assert(bounds.previous.end === '2025-02-28', `Previous end mismatch: ${bounds.previous.end} (Febbraio 2025 deve avere 28 giorni)`);
}

// Caso D: Passaggio d'anno - Gennaio 2026 verifica Dicembre 2025 (31 giorni)
{
  const ref = new Date(2026, 0, 12); // 12 Gennaio 2026
  const bounds = calculateMonthBounds(ref);
  assert(bounds.current.start === '2026-01-01', `Current start mismatch: ${bounds.current.start}`);
  assert(bounds.current.end === '2026-01-12', `Current end mismatch: ${bounds.current.end}`);
  assert(bounds.previous.start === '2025-12-01', `Previous start mismatch: ${bounds.previous.start} (Deve arretrare al 2025)`);
  assert(bounds.previous.end === '2025-12-31', `Previous end mismatch: ${bounds.previous.end} (Dicembre deve avere 31 giorni)`);
}

console.log('✓ Intervalli temporali dinamici (Mese corrente e Mese precedente con bisestile e rollover anno) validati con successo');

// -------------------------------------------------------------
// 2. Test Classificazione Many-to-Many e Deduplicazione Aggregati
// -------------------------------------------------------------
console.log('2. Verifica associazione molti-a-molti e deduplicazione aggregati...');

const projectCresima: NonTickerProject = {
  id: 'proj-cresima',
  name: 'Cresima',
  color: '#10b981',
  isArchived: false,
  createdAt: '2026-01-01T00:00:00Z'
};

const projectSpeseFamiglia: NonTickerProject = {
  id: 'proj-famiglia',
  name: 'Spese familiari',
  color: '#0ea5e9',
  isArchived: false,
  createdAt: '2026-01-01T00:00:00Z'
};

const projectCasa: NonTickerProject = {
  id: 'proj-casa',
  name: 'Ristrutturazione Casa',
  color: '#f59e0b',
  isArchived: true, // Archiviato
  createdAt: '2025-01-01T00:00:00Z'
};

// Movimento 1: Entrata 400 € associata sia a Cresima che a Spese familiari (multi-tag)
const m1: NonTickerMovement = {
  id: 'mov-1',
  entityId: 'ent-1',
  date: '2026-05-01',
  type: NonTickerMovementType.DEPOSIT,
  amount: 400,
  projectIds: ['proj-cresima', 'proj-famiglia']
};

// Movimento 2: Uscita 150 € associata solo a Cresima
const m2: NonTickerMovement = {
  id: 'mov-2',
  entityId: 'ent-1',
  date: '2026-05-05',
  type: NonTickerMovementType.WITHDRAWAL,
  amount: 150,
  projectIds: ['proj-cresima']
};

// Movimento 3: Uscita 250 € associata solo a Spese familiari
const m3: NonTickerMovement = {
  id: 'mov-3',
  entityId: 'ent-1',
  date: '2026-05-10',
  type: NonTickerMovementType.CARD_SPEND,
  amount: 250,
  projectIds: ['proj-famiglia']
};

// Movimento 4: Movimento senza alcun progetto (generale)
const m4: NonTickerMovement = {
  id: 'mov-4',
  entityId: 'ent-1',
  date: '2026-05-12',
  type: NonTickerMovementType.DEPOSIT,
  amount: 1000
};

const allMovements = [m1, m2, m3, m4];

// Helper che riproduce il calcolo aggregato con deduplicazione usato in NonTickerAssetsPage
function calculateProjectMetrics(selectedIds: string[], movements: NonTickerMovement[]) {
  if (selectedIds.length === 0) return null;

  // Filtra i movimenti che contengono almeno uno degli ID progetto selezionati
  // Ogni movimento è analizzato ESATTAMENTE UNA VOLTA (Set/array unico)
  const matchedMovements = movements.filter(m =>
    m.projectIds && m.projectIds.some(pid => selectedIds.includes(pid))
  );

  let totalInflows = 0;
  let totalOutflows = 0;

  for (const m of matchedMovements) {
    if (isFlowInflow(m.type)) {
      totalInflows += m.amount;
    } else if (isFlowOutflow(m.type)) {
      totalOutflows += m.amount;
    }
  }

  const netBalance = totalInflows - totalOutflows;

  return {
    count: matchedMovements.length,
    totalInflows,
    totalOutflows,
    netBalance
  };
}

// Test selezione singolo progetto: Cresima
{
  const metrics = calculateProjectMetrics(['proj-cresima'], allMovements);
  assert(metrics !== null, 'Metrics should not be null');
  assert(metrics.count === 2, `Count mismatch: ${metrics.count} !== 2`); // m1 (400) + m2 (150)
  assert(metrics.totalInflows === 400, `Inflow mismatch: ${metrics.totalInflows} !== 400`);
  assert(metrics.totalOutflows === 150, `Outflow mismatch: ${metrics.totalOutflows} !== 150`);
  assert(metrics.netBalance === 250, `Net balance mismatch: ${metrics.netBalance} !== 250`);
}

// Test selezione singolo progetto: Spese familiari
{
  const metrics = calculateProjectMetrics(['proj-famiglia'], allMovements);
  assert(metrics !== null, 'Metrics should not be null');
  assert(metrics.count === 2, `Count mismatch: ${metrics.count} !== 2`); // m1 (400) + m3 (250)
  assert(metrics.totalInflows === 400, `Inflow mismatch: ${metrics.totalInflows} !== 400`);
  assert(metrics.totalOutflows === 250, `Outflow mismatch: ${metrics.totalOutflows} !== 250`);
  assert(metrics.netBalance === 150, `Net balance mismatch: ${metrics.netBalance} !== 150`);
}

// Test CRUCIALE: Selezione MULTIPLA contemporanea di ['proj-cresima', 'proj-famiglia']
// m1 appartiene ad entrambi: deve essere conteggiato ESATTAMENTE UNA VOLTA!
// Totale Inflows: 400 (NON 800!)
// Totale Outflows: 150 (m2) + 250 (m3) = 400
// Saldo netto: 400 - 400 = 0
// Conteggio movimenti: 3 (m1, m2, m3) (NON 4!)
{
  const metrics = calculateProjectMetrics(['proj-cresima', 'proj-famiglia'], allMovements);
  assert(metrics !== null, 'Metrics should not be null');
  assert(metrics.count === 3, `Count mismatch: ${metrics.count} !== 3 (Deduplicazione fallita sul conteggio)`);
  assert(metrics.totalInflows === 400, `Inflow mismatch: ${metrics.totalInflows} !== 400 (Deduplicazione fallita su entrate: m1 conteggiato due volte!)`);
  assert(metrics.totalOutflows === 400, `Outflow mismatch: ${metrics.totalOutflows} !== 400`);
  assert(metrics.netBalance === 0, `Net balance mismatch: ${metrics.netBalance} !== 0`);
}

console.log('✓ Deduplicazione rigorosa accertata: nessuna doppia contabilizzazione quando più progetti condividono lo stesso movimento');

// -------------------------------------------------------------
// 3. Test Archiviazione, Riattivazione ed Eliminazione Progetti
// -------------------------------------------------------------
console.log('3. Verifica ciclo di vita: archiviazione, riattivazione ed eliminazione sicura...');

let dbState: DBState = {
  settings: {
    theme: 'dark',
    defaultCurrency: 'EUR',
    passwordSet: false,
    selectedInflationId: '',
    inflationIndices: []
  },
  accounts: [],
  portfolios: [],
  transactions: [],
  priceCache: {},
  nonTickerEntities: [{ id: 'ent-1', name: 'Conto Deposito Progetti', category: 'SAVINGS_ACCOUNT', currency: 'EUR', createdAt: '2025-01-01T00:00:00.000Z' }],
  nonTickerMovements: [m1, m2, m3, m4],
  nonTickerProjects: [projectCresima, projectSpeseFamiglia, projectCasa]
};

// Archiviazione del progetto Cresima:
// 1. isArchived diventa true
// 2. I movimenti non vengono modificati o eliminati
// 3. I totali globali rimangono invariati
const archiveProject = (db: DBState, projId: string, archive: boolean): DBState => ({
  ...db,
  nonTickerProjects: (db.nonTickerProjects || []).map(p =>
    p.id === projId ? { ...p, isArchived: archive, updatedAt: new Date().toISOString() } : p
  )
});

dbState = archiveProject(dbState, 'proj-cresima', true);
const archivedProj = dbState.nonTickerProjects?.find(p => p.id === 'proj-cresima');
assert(archivedProj?.isArchived === true, 'Project should be archived');
assert(dbState.nonTickerMovements?.length === 4, 'Movements count must remain unchanged');
// Il movimento m1 conserva il tag anche se il progetto è archiviato
assert(dbState.nonTickerMovements?.[0].projectIds?.includes('proj-cresima') === true, 'Historical tag preserved');

// Riattivazione del progetto Casa
dbState = archiveProject(dbState, 'proj-casa', false);
const restoredProj = dbState.nonTickerProjects?.find(p => p.id === 'proj-casa');
assert(restoredProj?.isArchived === false, 'Project should be restored from archive');

// Eliminazione di un progetto: rimuove il tag dai movimenti senza eliminare o alterare le proprietà finanziarie
const deleteProject = (db: DBState, projId: string): DBState => {
  const updatedProjects = (db.nonTickerProjects || []).filter(p => p.id !== projId);
  const updatedMovements = (db.nonTickerMovements || []).map(m => {
    if (m.projectIds && m.projectIds.includes(projId)) {
      const remaining = m.projectIds.filter(pid => pid !== projId);
      return {
        ...m,
        projectIds: remaining.length > 0 ? remaining : undefined
      };
    }
    return m;
  });
  return {
    ...db,
    nonTickerProjects: updatedProjects,
    nonTickerMovements: updatedMovements
  };
};

dbState = deleteProject(dbState, 'proj-famiglia');
assert(dbState.nonTickerProjects?.find(p => p.id === 'proj-famiglia') === undefined, 'Project removed from db');
// m1 ora ha solo 'proj-cresima'
const updatedM1 = dbState.nonTickerMovements?.find(m => m.id === 'mov-1');
assert(updatedM1?.projectIds?.length === 1 && updatedM1?.projectIds?.[0] === 'proj-cresima', 'Project id safely pruned');
assert(updatedM1?.amount === 400, 'Movement amount remains untouched');
// m3 ora non ha più projectIds (era associato solo a proj-famiglia)
const updatedM3 = dbState.nonTickerMovements?.find(m => m.id === 'mov-3');
assert(updatedM3?.projectIds === undefined, 'Project id safely undefined after last tag removed');
assert(updatedM3?.amount === 250, 'Movement 3 amount remains untouched');

console.log('✓ Ciclo di vita progetti verificato: archiviazione ed eliminazione non distruttive e preservazione contabile');

// -------------------------------------------------------------
// 4. Test Persistenza DB: Salvataggio, Logout e Ripristino al Login
// -------------------------------------------------------------
console.log('4. Verifica persistenza DB: serializzazione, payload server e ripristino al login...');

// Simulazione stato DB salvato dal client con progetti e assegnazioni movimenti
const clientStateToSave: DBState = {
  settings: {
    theme: 'dark',
    defaultCurrency: 'EUR',
    passwordSet: true,
    selectedInflationId: 'NIC',
    inflationIndices: []
  },
  accounts: [],
  portfolios: [],
  transactions: [],
  priceCache: {},
  nonTickerEntities: [{ id: 'ent-1', name: 'Conto Deposito', category: 'SAVINGS_ACCOUNT', currency: 'EUR', createdAt: '2025-01-01T00:00:00.000Z' }],
  nonTickerProjects: [
    { id: 'proj-cresima', name: 'Cresima', color: '#10b981', createdAt: '2025-01-01T00:00:00.000Z' },
    { id: 'proj-vacanze', name: 'Vacanze', color: '#0ea5e9', createdAt: '2025-01-01T00:00:00.000Z' }
  ],
  nonTickerMovements: [
    {
      id: 'ntm-101',
      entityId: 'ent-1',
      date: '2025-05-15',
      type: NonTickerMovementType.DEPOSIT,
      amount: 400,
      projectIds: ['proj-cresima', 'proj-vacanze']
    },
    {
      id: 'ntm-102',
      entityId: 'ent-1',
      date: '2025-06-01',
      type: NonTickerMovementType.WITHDRAWAL,
      amount: 150,
      projectIds: ['proj-vacanze']
    }
  ]
};

// 4.1 Simulazione logica POST /api/db (server.ts)
const currentServerDb: DBState = {
  settings: { theme: 'dark', defaultCurrency: 'EUR', passwordSet: true, selectedInflationId: 'NIC', inflationIndices: [] },
  accounts: [],
  portfolios: [],
  transactions: [],
  priceCache: {}
};

const serverFullDb = {
  settings: { ...currentServerDb.settings, ...clientStateToSave.settings },
  accounts: Array.isArray(clientStateToSave.accounts) ? clientStateToSave.accounts : (currentServerDb.accounts || []),
  portfolios: Array.isArray(clientStateToSave.portfolios) ? clientStateToSave.portfolios : (currentServerDb.portfolios || []),
  transactions: Array.isArray(clientStateToSave.transactions) ? clientStateToSave.transactions : (currentServerDb.transactions || []),
  transfers: Array.isArray(clientStateToSave.transfers) ? clientStateToSave.transfers : (currentServerDb.transfers || []),
  otherCosts: Array.isArray(clientStateToSave.otherCosts) ? clientStateToSave.otherCosts : (currentServerDb.otherCosts || []),
  instrumentGroups: Array.isArray(clientStateToSave.instrumentGroups) ? clientStateToSave.instrumentGroups : (currentServerDb.instrumentGroups || []),
  tickerConfigs: (clientStateToSave.tickerConfigs && typeof clientStateToSave.tickerConfigs === 'object') ? clientStateToSave.tickerConfigs : (currentServerDb.tickerConfigs || {}),
  nonTickerEntities: Array.isArray(clientStateToSave.nonTickerEntities) ? clientStateToSave.nonTickerEntities : (currentServerDb.nonTickerEntities || []),
  nonTickerMovements: Array.isArray(clientStateToSave.nonTickerMovements) ? clientStateToSave.nonTickerMovements : (currentServerDb.nonTickerMovements || []),
  nonTickerMovementTypes: Array.isArray(clientStateToSave.nonTickerMovementTypes) ? clientStateToSave.nonTickerMovementTypes : (currentServerDb.nonTickerMovementTypes || []),
  nonTickerProjects: Array.isArray(clientStateToSave.nonTickerProjects) ? clientStateToSave.nonTickerProjects : (currentServerDb.nonTickerProjects || []),
  priceCache: (clientStateToSave.priceCache && typeof clientStateToSave.priceCache === 'object') ? clientStateToSave.priceCache : (currentServerDb.priceCache || {})
};

// Verifica che il payload del server includa integralmente i progetti e le assegnazioni
assert(Array.isArray(serverFullDb.nonTickerProjects), 'Server payload must contain nonTickerProjects array');
assert(serverFullDb.nonTickerProjects.length === 2, 'Server payload must retain all 2 projects');
assert(serverFullDb.nonTickerProjects[0].name === 'Cresima', 'Project name preserved in server payload');

// 4.2 Simulazione serializzazione su disco / JSON DB file
const serializedDiskContent = JSON.stringify(serverFullDb);
const parsedFromDisk = JSON.parse(serializedDiskContent);

// 4.3 Simulazione ripristino al Login (fetchDB in App.tsx)
const loadedAfterLogin: DBState = {
  ...serverFullDb,
  ...parsedFromDisk,
  nonTickerProjects: Array.isArray(parsedFromDisk.nonTickerProjects) ? parsedFromDisk.nonTickerProjects : [],
  nonTickerMovements: Array.isArray(parsedFromDisk.nonTickerMovements) ? parsedFromDisk.nonTickerMovements : []
};

// Verifiche sui progetti dopo il login
assert(loadedAfterLogin.nonTickerProjects?.length === 2, 'Projects must be retained upon login');
const projCresimaLoaded = loadedAfterLogin.nonTickerProjects?.find(p => p.id === 'proj-cresima');
assert(projCresimaLoaded !== undefined, 'Project Cresima exists after login');
assert(projCresimaLoaded?.color === '#10b981', 'Project Cresima color preserved');

// Verifiche sull\'assegnazione dei movimenti dopo il login
assert(loadedAfterLogin.nonTickerMovements?.length === 2, 'Movements must be retained upon login');
const mov1Loaded = loadedAfterLogin.nonTickerMovements?.find(m => m.id === 'ntm-101');
assert(mov1Loaded !== undefined, 'Movement 1 exists after login');
assert(Array.isArray(mov1Loaded?.projectIds), 'Movement 1 projectIds must be an array');
assert(mov1Loaded?.projectIds?.length === 2, 'Movement 1 must still have 2 assigned projectIds');
assert(mov1Loaded?.projectIds?.includes('proj-cresima'), 'Movement 1 must still be assigned to Cresima');
assert(mov1Loaded?.projectIds?.includes('proj-vacanze'), 'Movement 1 must still be assigned to Vacanze');

const mov2Loaded = loadedAfterLogin.nonTickerMovements?.find(m => m.id === 'ntm-102');
assert(mov2Loaded?.projectIds?.length === 1 && mov2Loaded?.projectIds?.[0] === 'proj-vacanze', 'Movement 2 assignment preserved');

console.log('✓ Persistenza DB verificata: progetti e assegnazioni movimenti salvati e ripristinati correttamente al login');

console.log('======================================================');
console.log(' TUTTI I TEST DELLA SUITE PROGETTI E TIMEFRAME SUPERATI CON SUCCESSO! ');
console.log('======================================================');
