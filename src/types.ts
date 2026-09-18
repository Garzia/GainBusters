/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum Currency {
  EUR = 'EUR',
  USD = 'USD'
}

export enum TransactionType {
  BUY = 'BUY',
  SELL = 'SELL',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
  DIVIDEND = 'DIVIDEND'
}

export interface Account {
  id: string;
  name: string;
  currency: Currency;
  includeInDashboard: boolean;
}

export interface Portfolio {
  id: string;
  accountId: string;
  name: string;
  includeInDashboard: boolean;
}

export interface Transaction {
  id: string;
  portfolioId: string;
  date: string; // ISO String (Date & time)
  type: TransactionType;
  symbol: string; // Ticker (e.g., VWCE.MI, VAGF.MI)
  qty: number;
  price: number; // Unit price
  commission: number; // Commission paid
  currency: Currency | string;
  commissionCurrency?: string;
  commissionPaymentMode?: 'EXTERNAL' | 'ASSET'; // Payment mode for commission
  notes: string;
  transferId?: string; // Links transaction to its unified Transfer entity
  parentTransactionId?: string; // Links to parent lot tx (BUY or TRANSFER_IN)
  transferInTransactionId?: string; // Links TRANSFER_OUT to TRANSFER_IN
  transferOutTransactionId?: string; // Links TRANSFER_IN to TRANSFER_OUT
  originalBuyPrice?: number; // Preserves purchase cost basis during transfers
  originalBuyDate?: string; // Preserves purchase date during transfers
  transferCriteria?: 'FIFO' | 'LIFO'; // Preserves selection criteria
}

export interface Transfer {
  id: string;
  date: string; // ISO String
  symbol: string;
  qty: number;
  price?: number;
  priceCurrency?: Currency | string;
  sourcePortfolioId: string;
  destPortfolioId: string;
  sourceCommission?: number;
  sourceCommissionCurrency?: string;
  sourceCommissionPaymentMode?: 'EXTERNAL' | 'ASSET';
  destCommission?: number;
  destCommissionCurrency?: string;
  destCommissionPaymentMode?: 'EXTERNAL' | 'ASSET';
  criteria: 'FIFO' | 'LIFO';
  notes?: string;
  childTransactionIds?: string[];
  transferOutTransactionId?: string;
  transferInTransactionId?: string;
}

export interface OtherCost {
  id: string;
  portfolioId: string;
  date: string; // ISO String (Date & time or YYYY-MM-DD)
  amount: number;
  currency: Currency | string;
  type: 'bollo' | 'custody' | 'tax' | 'other';
  notes: string;
}

export interface InflationIndex {
  year: number;
  month?: number; // Optional 1-12 for monthly MoM inflation rate
  rate: number; // e.g. 0.02 for 2%
}

export interface InflationSetting {
  id: string;
  name: string; // NIC, FOI, IPCA, etc.
  description?: string; // Decrizione dell'indice
  link?: string; // Link al sito per recuperare il valore
  values: InflationIndex[];
}

export interface InstrumentGroup {
  id: string;
  name: string;
  tickerSymbols: string[];
  notes?: string;
}

export enum NonTickerMovementType {
  DEPOSIT = 'DEPOSIT',
  EMPLOYEE_CONTRIBUTION = 'EMPLOYEE_CONTRIBUTION',
  EMPLOYER_CONTRIBUTION = 'EMPLOYER_CONTRIBUTION',
  TFR = 'TFR',
  DIVESTMENT = 'DIVESTMENT',
  CASHBACK = 'CASHBACK',
  OTHER_INFLOW = 'OTHER_INFLOW',
  WITHDRAWAL = 'WITHDRAWAL',
  INVESTMENT = 'INVESTMENT',
  CARD_SPEND = 'CARD_SPEND',
  FEE = 'FEE',
  OTHER_OUTFLOW = 'OTHER_OUTFLOW',
  RETURN = 'RETURN',
  VALUATION = 'VALUATION'
}

export type NonTickerCategory =
  | 'PENSION_FUND'
  | 'SAVINGS_ACCOUNT'
  | 'COMPANY_TFR'
  | 'INSURANCE_POLICY'
  | 'PRIVATE_INVESTMENT'
  | 'OTHER';

export interface NonTickerEntity {
  id: string;
  name: string;
  category: NonTickerCategory;
  currency: Currency | string;
  identifier?: string;
  notes?: string;
  createdAt: string;
}

export interface NonTickerMovementTypeConfig {
  id: string;
  name: string;
  direction: 'INFLOW' | 'OUTFLOW';
  isDefault?: boolean;
  order: number;
}

export interface NonTickerMovement {
  id: string;
  entityId: string;
  date: string;
  type: NonTickerMovementType | string;
  amount?: number;
  valuation?: number;
  grossReturn?: number;
  taxAmount?: number;
  netReturn?: number;
  isReinvested?: boolean;
  units?: number;
  unitPrice?: number;
  fee?: number;
  notes?: string;
  externalId?: string;
  importProvider?: string;
  importMetadata?: Record<string, any>;
}

export interface NonTickerTablePreferences {
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  visibleColumns?: string[];
  pageSize?: number;
}

export interface SystemSettings {
  theme: 'light' | 'dark' | 'system';
  defaultCurrency: Currency | string;
  passwordHash?: string;
  passwordSet: boolean;
  selectedInflationId: string;
  inflationIndices: InflationSetting[];
  activeCurrencies?: string[];
  lang?: string;
  includeCommissions?: boolean;
  targetWeights?: { [symbol: string]: number };
  columnWidths?: { [columnId: string]: number };
  aggregateInstrumentsView?: boolean;
  nonTickerTablePreferences?: NonTickerTablePreferences;
}

export interface DBState {
  settings: SystemSettings;
  accounts: Account[];
  portfolios: Portfolio[];
  transactions: Transaction[];
  transfers?: Transfer[];
  otherCosts?: OtherCost[];
  instrumentGroups?: InstrumentGroup[];
  nonTickerEntities?: NonTickerEntity[];
  nonTickerMovements?: NonTickerMovement[];
  nonTickerMovementTypes?: NonTickerMovementTypeConfig[];
  priceCache: {
    // Ticker -> Date (YYYY-MM-DD) -> Price
    [ticker: string]: { [date: string]: number };
  };
}

// Translations Structure
export interface LanguagePhrases {
  appName: string;
  appSlogan: string;
  loginTitle: string;
  setupPassword: string;
  enterPassword: string;
  confirmPassword: string;
  submit: string;
  incorrectPassword: string;
  passwordMismatch: string;
  passwordRules: string;
  dashboard: string;
  accountsPortfolios: string;
  mission: string;
  fire: string;
  tools: string;
  settings: string;
  logout: string;
  totalInvested: string;
  totalValue: string;
  netGain: string;
  totalReturn: string;
  dailyChange: string;
  annualizedReturn: string;
  twrrReturn: string;
  mwrrReturn: string;
  volatility: string;
  maxDrawdown: string;
  positionsSectionTitle: string;
  positionsSectionDesc: string;
  colTicker: string;
  colQuantity: string;
  colPmc: string;
  colCurrentPrice: string;
  colMarketValue: string;
  colProfitLossAbs: string;
  colProfitLossPct: string;
  colPortfolioWeight: string;
  colDailyChange: string;
  searchPositionsPlaceholder: string;
  openLotsTitle: string;
  lotOriginalDate: string;
  lotPortfolio: string;
  lotRemainingQty: string;
  lotPurchasePrice: string;
  lotTotalInvested: string;
  lotCurrentValue: string;
  lotGainLoss: string;
  noPositionsFound: string;
  totalPositionsSummary: string;
  pmcTooltip: string;
  sortByName: string;
  sortByValue: string;
  sortByGain: string;
  sortByPmc: string;
  sortByWeight: string;
  expandLotDetails: string;
  collapseLotDetails: string;
  includeCommissions: string;
  excludeCommissions: string;
  benchmarkSelect: string;
  inflationAdjust: string;
  noBenchmark: string;
  assetsTitle: string;
  rebalanceTitle: string;
  assetClass: string;
  currentValue: string;
  currentWeight: string;
  targetWeight: string;
  addAccount: string;
  addPortfolio: string;
  addTransaction: string;
  editAccount: string;
  deleteAccount: string;
  editPortfolio: string;
  deletePortfolio: string;
  deleteTransaction: string;
  accountName: string;
  portfolioName: string;
  includeDashboard: string;
  currencyLabel: string;
  save: string;
  cancel: string;
  dateLabel: string;
  tickerLabel: string;
  qtyLabel: string;
  priceLabel: string;
  commissionLabel: string;
  notesLabel: string;
  buyBtn: string;
  sellBtn: string;
  compoundCalc: string;
  initialCapital: string;
  yearlyContribution: string;
  monthlyContribution: string;
  interestRate: string;
  yearsLabel: string;
  futureValue: string;
  totalWithdrawnSWR: string;
  withdrawalRate: string;
  retireToday: string;
  yearsToRetire: string;
  projectedValue: string;
  annualWithdrawal: string;
  monthlyWithdrawal: string;
  fireSummaryTemplate: string;
  missionContent: string;

  // DB and Vault setup screens:
  vaultSetupActive: string;
  connectedFile: string;
  unlockAndAuthorize: string;
  useAnotherFile: string;
  storageSubtitle: string;
  iframeWarningTitle: string;
  iframeWarningDesc: string;
  filePrivacyInfo: string;
  createNewFile: string;
  openExistingFile: string;
  setMasterPassword: string;
  militaryEncryptionInfo: string;
  saveFileOnPc: string;
  selectedDatabase: string;
  enterPasswordToLoad: string;
  back: string;
  decryptAndEnter: string;
  connectionToYahoo: string;
  quotesUpdatedSuccess: string;
  quotesSyncError: string;
  quotesSyncConnectionFailed: string;
  activeLanguageLabel: string;
  createYourFirstAccount: string;
  addCurrency: string;
  brokerBankLabel: string;
  refreshQuotesBtn: string;
  
  // Backup & Restore keys
  backupRestoreTitle: string;
  backupRestoreDesc: string;
  exportDatabaseBtn: string;
  importDatabaseBtn: string;
  importOptionsTitle: string;
  overwriteDatabaseTitle: string;
  overwriteDatabaseDesc: string;
  overwriteBtn: string;
  mergeDataTitle: string;
  mergeDataDesc: string;
  mergeBtn: string;
  invalidBackupFile: string;
  invalidJsonFile: string;

  // Mission page extra keys:
  missionIntro: string;
  missionPilarsTitle: string;
  missionPilar1Title: string;
  missionPilar1Desc: string;
  missionPilar2Title: string;
  missionPilar2Desc: string;
  missionPilar3Title: string;
  missionPilar3Desc: string;
  missionPilar4Title: string;
  missionPilar4Desc: string;
  missionVincitriceTitle: string;
  missionVincitriceDesc: string;

  // Inflation manager extra keys:
  inflationTitle: string;
  inflationDesc: string;
  myIndices: string;
  activeDashboardIndex: string;
  none: string;
  rapidChoiceEditor: string;
  noIndicesConfigured: string;
  createNewIndex: string;
  siglaLabel: string;
  linkLabel: string;
  createCustomIndexBtn: string;
  editorTableValues: string;
  noIndexEditing: string;
  yearFilterLabel: string;
  monthColumn: string;
  rateMoMColumn: string;
  indexCreatedSuccess: string;
  indexDeletedSuccess: string;
  indexActiveSetSuccess: string;

  // Charts or other page extra keys:
  noAssetsInPortfolio: string;
  selectOptionPlaceholder: string;
  totalNominalPortfolioValueLabel: string;
  useGlobalPortfolioValueBtn: string;

  // Extra Config & Translations
  setupCenterTitle: string;
  setupCenterDesc: string;
  appSettingsTitle: string;
  themeLabel: string;
  defaultCurrencyLabel: string;
  activeCurrenciesLabel: string;
  addCurrencyPlaceholder: string;
  addBtn: string;
  navigationSidebarTitle: string;
  month1: string;
  month2: string;
  month3: string;
  month4: string;
  month5: string;
  month6: string;
  month7: string;
  month8: string;
  month9: string;
  month10: string;
  month11: string;
  month12: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  sourceLinkPlaceholder: string;
  goBtn: string;
  visitSourceTooltip: string;
  momPercentageNotice: string;
  deleteIndexTooltip: string;
  noDescriptionText: string;
  selectOrCreateIndexInstruction: string;
  yearLabel: string;
  siglaAbbreviationLabel: string;
  dataSourceLinkLabel: string;
  configureAccumulationTitle: string;
  useGlobalPortfolioTooltip: string;
  pacPeriodicDepositLabel: string;
  depositFrequencyLabel: string;
  expectedReturnLabel: string;
  regimesTitle: string;
  regimesIntro: string;
  simpleCompoundingLabel: string;
  simpleCompoundingDesc: string;
  compoundCompoundingLabel: string;
  compoundCompoundingDesc: string;
  pacTimingDisclaimer: string;
  cagrParamsTitle: string;
  inputMethodLabel: string;
  totalReturnPercentageLabel: string;
  initialFinalCapitalsLabel: string;
  totalReturnGeneratedLabel: string;
  cagrExampleHint: string;
  finalCapitalAchievedLabel: string;
  freqTwiceMonthly: string;
  freqMonthly: string;
  freqBimonthly: string;
  freqQuarterly: string;
  freqQuadrimonthly: string;
  freqSemiannually: string;
  freqAnnually: string;
  historicalCapitalTrend: string;
  fromLabel: string;
  toLabel: string;
  dateColonLabel: string;
  nominalCapitalLabel: string;
  realValueAdjustedLabel: string;
  investedCapitalLabel: string;
  currentNominalValueLabel: string;
  realValueAdjustedNetInflationLabel: string;
  capitalInvestedNoCommissionsLabel: string;
  noTransactionDataForChartLabel: string;
  perfReportTitle: string;
  customValuation: string;
  controlledBySelectedPeriodLabel: string;
  twrrPeriodLabel: string;
  twrrDesc: string;
  mwrrPeriodLabel: string;
  mwrrDesc: string;
  volatilityYearLabel: string;
  volatilityDesc: string;
  maxDrawdownLabel: string;
  maxDrawdownDesc: string;
  netCapitalInvestedLabel: string;
  capitalInvestedDesc: string;
  overallCommissionsLabel: string;
  totalCommissionsDesc: string;
  finalPeriodValueLabel: string;
  finalValueDesc: string;
  netPeriodGainLabel: string;
  netGainDesc: string;
  benchmarkOptionsTitle: string;
  tickerDCAOption: string;
  tickerPlaceholder: string;
  autoDownloadNotice: string;
  compareWithBrokerLabel: string;
  selectPortfolioAccountPlaceholder: string;
  realInflationLookTitle: string;
  realInflationSubtitle: string;
  realInflationToggleDesc: string;
  activeInflationIndexLabel: string;
  assetsAndRebalancingTitle: string;
  targetWeightingSumNotice: string;
  targetOk: string;
  clickAnalyzeTickerTooltip: string;
  statusInTarget: string;
  statusBuyMore: string;
  statusSellMore: string;
  currentWeightLabel: string;
  targetPercentLabel: string;
  visualPortfolioBreakdownLabel: string;

  // New ToolsPage keys
  toolsPageTitle: string;
  toolsPageDesc: string;
  tabPacFire: string;
  tabCagr: string;
  pacHorizonLabel: string;
  yearSingular: string;
  yearsPlural: string;
  fireParamsTitle: string;
  fireParamsDesc: string;
  conservativeLabel: string;
  aggressiveLabel: string;
  swrStandardNotice: string;
  freqCompoundingLabel: string;
  compoundingDaily: string;
  compoundingMonthly: string;
  compoundingAnnually: string;
  compoundingSimple: string;
  totalInvestedCard: string;
  withBaseLabel: string;
  onlyPacLabel: string;
  interestsGeneratedCard: string;
  totalLabel: string;
  pacFinalValueCard: string;
  multipleLabel: string;
  investedAndInterestsLabel: string;
  pacProjectionGraphTitle: string;
  pacProjectionGraphDesc: string;
  hoverToCalculateSwrLabel: string;
  yearAbbreviation: string;
  yearDetailLabel: string;
  accumulatedCapitalLabel: string;
  swrMonthlyWithdrawalLabel: string;
  swrAnnualWithdrawalLabel: string;
  graphHoverInstructionDetail: string;
  reinvestedInterestsLabel: string;
  sustainablePensionTitle: string;
  sustainablePensionDesc: string;
  swrTemplateAssuming: string;
  swrTemplateRetireToday: string;
  swrTemplateRetireTarget: string;
  initialStateLabel: string;
  retireTodayLabel: string;
  year0Label: string;
  baseCapitalLabel: string;
  baseCapitalSublabel: string;
  withdrawalSWRLabel: string;
  freeMonthlyStreamLabel: string;
  extendedAnnualStreamLabel: string;
  targetHorizonLabel: string;
  pacHorizonRetirementLabel: string;
  finalMontantLabel: string;
  cagrTitleCard: string;
  cagrDescCard: string;
  perYearLabel: string;
  totalReturnCagrTemplate: string;
  fundamentalFormulaLabel: string;
  cagrGuideTitle: string;
  cagrGuideIntro: string;
  cagrGuideCaseStudyTitle: string;
  cagrGuideCaseStudyDesc: string;
  cagrGuideArithmeticMeanLabel: string;
  cagrGuideArithmeticMeanDesc: string;
  cagrGuideGeometricCagrLabel: string;
  cagrGuideGeometricCagrDesc: string;
  cagrGuideOutro: string;

  // New translations requested by user
  cacciatoreDiRenditaLabel: string;
  refreshPricesLabel: string;
  currentViewLabel: string;
  overallPortfolioLabel: string;
  globalLabel: string;
  brokerOnlyLabel: string;
  portfolioOnlyLabel: string;
  tickerOnlyLabel: string;
  excludingCommissionsLabel: string;
  commissionsAdjustedLabel: string;
  declaredBrokerFeesLabel: string;
  yesterdayLabel: string;
  calculateCommPerformanceDesc: string;
  marketValuationLabel: string;
  selectBrokerLabel: string;
  noBrokerRegisteredLabel: string;
  selectPortfolioLabel: string;
  noPortfolioRegisteredLabel: string;
  selectAssetTickerLabel: string;
  noAssetsInArchiveLabel: string;
  configureBrokersAssetsTitle: string;
  configureBrokersAssetsDesc: string;
  brokerAccountCurrencyLabel: string;
  associateToAccountLabel: string;
  noBrokersRegisteredPlaceholder: string;
  createFirstAccountLink: string;
  clickToAnalyzeBrokerTooltip: string;
  excludedFromHomeLabel: string;
  noPortfoliosDefinedPlaceholder: string;
  operationsCountLabel: string;
  registerNewTransactionTitle: string;
  belongingPortfolioLabel: string;
  selectPortfolioOptionPlaceholder: string;
  withoutBrokerOption: string;
  transactionTypeLabel: string;
  commissionCurrencyLabel: string;
  notesPlaceholder: string;
  saveTransactionBtn: string;
  historicalTransactionsRegistryTitle: string;
  resetFiltersBtn: string;
  foundXOfYLabel: string;
  allOption: string;
  buyOption: string;
  sellOption: string;
  fromDateLabel: string;
  toDateLabel: string;
  noTransactionsMatchingCriteriaLabel: string;
  safeWithdrawalRateLabel: string;
  readOnLabel: string;
  validationErrorAllFieldsRequired: string;
  refreshPricesTooltip: string;
  analysisPerimeterLabel: string;
  benchmarkLabel: string;
  brokerLabel: string;
  bankLabel: string;
  portfolioLabel: string;
  instrumentLabel: string;
  disclaimerTitle: string;
  disclaimerText1: string;
  disclaimerText2: string;
  disclaimerAcknowledge: string;
  confirmDeleteTitle: string;
  confirmDeleteBroker: string;
  confirmDeletePortfolio: string;
  confirmDeleteTransaction: string;
  confirmDeleteIndex: string;
  confirmBtn: string;
  cancelBtn: string;
  otherCostsTab: string;
  addCostBtn: string;
  editCostBtn: string;
  costType: string;
  costAmount: string;
  costDate: string;
  costNotes: string;
  stampDuty: string;
  custodyFee: string;
  otherTax: string;
  otherCostType: string;
  confirmDeleteCost: string;
  allCosts: string;
  totalCostsPaid: string;
  costSelection: string;
  costSuccessMsg: string;
  noCostsMsg: string;
  transferBtn: string;
  sourcePortfolioLabel: string;
  destPortfolioLabel: string;
  transferQtyLabel: string;
  transferDateLabel: string;
  lotSelectionCriteria: string;
  availableQtyNotice: string;
  transferSuccessMsg: string;
  insufficientQtyError: string;
  samePortfolioError: string;
  lotBadgePartial: string;
  lotBadgeFully: string;
  transferInBadge: string;
  transferOutBadge: string;
  viewConnectedTx: string;
  lotDetailTooltip: string;
  confirmDeleteTransfer: string;
  transfersRegistryTitle: string;
  sourceBrokerAndPortfolio: string;
  destBrokerAndPortfolio: string;
  sourceCommissionLabel: string;
  destCommissionLabel: string;
  sourceCommissionCurrencyLabel: string;
  destCommissionCurrencyLabel: string;
  transferUnitPriceLabel: string;
  transferUnitPricePlaceholder: string;
  noTransfersRecorded: string;
  editTransferModalTitle: string;
  newTransferModalTitle: string;
  editTransactionModalTitle: string;
  newTransactionModalTitle: string;
  totalTransferredLabel: string;
  columnsLabel: string;
  actionsLabel: string;
  closeLabel: string;
  cryptoConversionNote: string;
  otherCostsDesc: string;
  allPortfolios: string;
  allTypes: string;
  searchNotesPlaceholder: string;
  recordsFound: string;
  otherCostsCalcNote: string;
  internalAssetMovement: string;
  newTransferBtn: string;
  registerFirstTransferMsg: string;
  transfersRecordedCount: string;
  totalsLabel: string;
  allTimeframe: string;
  customTimeframe: string;
  analyzedPeriod: string;
  valoreLabel: string;
  infoPmc: string;
  pmcFullTitle: string;
  createFirstTransfer: string;
  transfersCountLabel: string;

  // Dividend keys
  dividendsTab: string;
  dividendsTitle: string;
  dividendsDesc: string;
  dividendLabel: string;
  totalDividendsReceived: string;
  dividendsPerPortfolio: string;
  historicalPaymentDates: string;
  paymentDate: string;
  grossDividend: string;
  withholdingTax: string;
  netDividend: string;
  registerDividendBtn: string;
  noDividendsRecorded: string;
  noDividendsMatchingCriteria: string;
  dividendPaymentsCount: string;
  latestPaymentDate: string;
  allPortfoliosOption: string;
  dividendPerShareLabel: string;
  topDividendPayerLabel: string;
  viewDividendsTooltip: string;

  // Instrument Groups & Aggregated Mode
  aggregatedInstrumentsMode?: string;
  aggregatedModeShort?: string;
  standardModeShort?: string;
  manageGroupsBtn?: string;
  manageGroups?: string;
  newGroupBtn?: string;
  editGroupTitle?: string;
  newGroupTitle?: string;
  groupNameLabel?: string;
  groupTickersLabel?: string;
  groupNotesLabel?: string;
  groupOnlyLabel?: string;
  groupLabel?: string;
  selectGroupLabel?: string;
  noGroupsConfigured?: string;
  instrumentGroupsManagerTitle?: string;
  instrumentGroupsManagerDesc?: string;
  aggregatedBadge?: string;
  aggregatedInstrumentBadge?: string;
  constituentTickersTitle?: string;
  groupOpenLotsTitle?: string;
  autoDetectGroupsBtn?: string;
  autoDetectGroupsDesc?: string;
  confirmDeleteGroup?: string;
  groupDetailsLabel?: string;
  weightInGroupLabel?: string;

  // Non-Ticker Assets & Funds Keys
  nonTickerTab?: string;
  nonTickerTitle?: string;
  nonTickerDesc?: string;
  newEntityBtn?: string;
  editEntityBtn?: string;
  deleteEntityBtn?: string;
  newMovementBtn?: string;
  newValuationBtn?: string;
  newReturnBtn?: string;
  entityNameLabel?: string;
  entityCategoryLabel?: string;
  entityCurrencyLabel?: string;
  entityIdentifierLabel?: string;
  allEntitiesOption?: string;
  selectEntityLabel?: string;
  categoryPensionFund?: string;
  categorySavingsAccount?: string;
  categoryCompanyTfr?: string;
  categoryInsurancePolicy?: string;
  categoryPrivateInvestment?: string;
  categoryOther?: string;
  movementTypeLabel?: string;
  mvDeposit?: string;
  mvEmployeeContrib?: string;
  mvEmployerContrib?: string;
  mvTfr?: string;
  mvDivestment?: string;
  mvCashback?: string;
  mvOtherInflow?: string;
  mvWithdrawal?: string;
  mvInvestment?: string;
  mvCardSpend?: string;
  mvFee?: string;
  mvOtherOutflow?: string;
  mvReturn?: string;
  mvValuation?: string;
  grossReturnLabel?: string;
  taxAmountLabel?: string;
  netReturnLabel?: string;
  isReinvestedLabel?: string;
  reinvestedInBalance?: string;
  paidOutExternal?: string;
  valuationAmountLabel?: string;
  movementAmountLabel?: string;
  netInvestedCapital?: string;
  currentTotalValue?: string;
  totalNetGain?: string;
  totalGrossReturns?: string;
  totalTaxesPaid?: string;
  totalNetReturns?: string;
  totalInflows?: string;
  totalOutflows?: string;
  capitalEvolutionTitle?: string;
  capitalEvolutionDesc?: string;
  movementsHistoryTitle?: string;
  noEntitiesConfigured?: string;
  createFirstEntityPrompt?: string;
  noMovementsRecorded?: string;
  confirmDeleteEntity?: string;
  confirmDeleteMovement?: string;
  performanceSummaryTitle?: string;
  twrrTitle?: string;
  twrrTooltip?: string;
  mwrrTitle?: string;
  mwrrTooltip?: string;
  simpleReturnTitle?: string;
  annualizedShort?: string;
  cumulativeShort?: string;
  flowBreakdownTitle?: string;
  employeeContribTotal?: string;
  employerContribTotal?: string;
  tfrContribTotal?: string;
  voluntaryDepositTotal?: string;
  withdrawalsTotal?: string;
  lastValuationDate?: string;
  filterTimeframeAll?: string;
  filterTimeframe1Y?: string;
  filterTimeframe3Y?: string;
  filterTimeframe5Y?: string;
  filterTimeframeYTD?: string;
  editMovementBtn?: string;
  effectiveTaxRate?: string;
  summaryStatisticsTitle?: string;
  unitsLabel?: string;
  unitsOptional?: string;
  totalUnits?: string;
  navPerUnit?: string;
  averageUnitCost?: string;
  impliedUnitPrice?: string;
  unitsPresent?: string;
  categoryFilterLabel?: string;
  singleAssetFilterLabel?: string;
  selectCategoryLabel?: string;
  allCategories?: string;
  consolidatedView?: string;
  manageMovementTypes?: string;
  manageMovementTypesDesc?: string;
  inflowsGroup?: string;
  outflowsGroup?: string;
  newTypeNamePlaceholder?: string;
  addTypeBtn?: string;
  moveUp?: string;
  moveDown?: string;
  resetDefaultTypes?: string;
  noFlowsRecorded?: string;
  movementUnitsLabel?: string;
  unitPriceLabel?: string;
  movementFeeLabel?: string;
  optionalLabel?: string;
  periodGrossReturns?: string;
  periodTaxes?: string;
  periodNetReturns?: string;
  periodFlowBreakdown?: string;
  periodTaxAnalysis?: string;
  trendCapitalTitle?: string;
  periodInvestedCapital?: string;
  periodNetGain?: string;
  periodNetGainLabel?: string;
  periodNetInvestedLabel?: string;
  periodCommissionsLabel?: string;
  periodGrossReturnsLabel?: string;
  periodTaxesLabel?: string;
  periodNetReturnsLabel?: string;
  periodTwrrLabel?: string;
  periodMwrrLabel?: string;
  periodEndValue?: string;
  totalCommissionsLabel?: string;
  includeCommissionsToggle?: string;
  includeCommissionsBtn?: string;
  excludeCommissionsBtn?: string;
  periodPerformanceTitle?: string;
  periodStartBalanceLabel?: string;
  periodEndBalanceLabel?: string;
  customDateRangeLabel?: string;
  entitySingular?: string;
  entitiesPlural?: string;
  singleEntityOption?: string;
  selectEntityAndFund?: string;
  addFirstEntityBtn?: string;
  cashFlowsOnly?: string;
  commissionsShort?: string;
  includedInInvestedCapital?: string;
  excludedFromInvestedCapital?: string;
  insufficientData?: string;
  irrShort?: string;
  totalUnitsLabel?: string;
  navPerUnitLabel?: string;
  unitShort?: string;
  positionCalculatedInUnits?: string;
  grossReturnsLabel?: string;
  taxesLabel?: string;
  netReturnsLabel?: string;
  averageTaxRate?: string;
  includedBadge?: string;
  excludedBadge?: string;
  commissionsExternalDesc?: string;
  newValuationTooltip?: string;
  newReturnTooltip?: string;
  manageMovementTypesTooltip?: string;
  movementTypesShort?: string;
  noTimelineData?: string;
  investedPrefix?: string;
  balancePrefix?: string;
  gainPrefix?: string;
  unitsPrefix?: string;
  chartHoverInstruction?: string;
  periodIrrLabel?: string;
  externalCostsLabel?: string;
  grossLabel?: string;
  taxesPrefix?: string;
  selectedPeriodLabel?: string;
  noFlowsInPeriod?: string;
  inflowsAndDepositsTitle?: string;
  unitsShort?: string;
  outflowsAndWithdrawalsTitle?: string;
  netShort?: string;
  allMovementTypes?: string;
  capitalFlowsFilter?: string;
  valuationSnapshotsFilter?: string;
  returnsFilter?: string;
  entityColumn?: string;
  movementTypeColumn?: string;
  amountOrValuationColumn?: string;
  unitsColumn?: string;
  detailsAndTaxColumn?: string;
  liquidatedBadge?: string;
  navPrefix?: string;
  bankStatementSnapshot?: string;
  feePrefix?: string;
  capitalFlowBadge?: string;
  deleteLabel?: string;
  noMovementsFound?: string;
  entityNamePlaceholder?: string;
  entityIdentifierPlaceholder?: string;
  entityNotesPlaceholder?: string;
  flowTab?: string;
  balanceNavTab?: string;
  returnTab?: string;
  manageMovementTypesLink?: string;
  optionalShort?: string;
  valuationExplanation?: string;
  grossMinusTaxes?: string;
  assignedUnitsLabel?: string;
  reinvestedInBalanceDesc?: string;
  movementNotesPlaceholder?: string;
  saveMovementBtn?: string;
  manageMovementTypesTitle?: string;
  manageMovementTypesSubtitle?: string;
  defineNewTypeTitle?: string;
  inflowOption?: string;
  outflowOption?: string;
  inflowsCountLabel?: string;
  outflowsCountLabel?: string;
  deleteCustomTypeTooltip?: string;
  cannotDeleteUsedTypeAlert?: string;
  confirmDeleteEntityTitle?: string;
  confirmDeleteMovementTitle?: string;
  deleteEntityWarning?: string;
  deleteMovementWarning?: string;
  confirmPermanentDelete?: string;
  daysLabel?: string;

  // Additional Non-Ticker translations
  tabCapitalFlow?: string;
  tabValuation?: string;
  tabReturn?: string;
  manageCustomTypesBtn?: string;
  optionalBadge?: string;
  externalCost?: string;
  notesOrReferenceLabel?: string;
  notesOrDetailsLabel?: string;
  operationDateLabel?: string;
  valuationHelperText?: string;
  balanceLabel?: string;
  gainShort?: string;
  hoverPointsHint?: string;
  dateColumn?: string;
  operationTypeColumn?: string;
  amountValueColumn?: string;
  detailsTaxColumn?: string;
  notesColumn?: string;
  actionsColumn?: string;
  netLabel?: string;
  allTypesFilter?: string;
  valuationRecordsFilter?: string;
  deleteMovementBtn?: string;
  restoreDefaultsBtn?: string;
  deleteCustomTypeTitle?: string;
  inflowStreamsLabel?: string;
  outflowStreamsLabel?: string;
  inflowBadge?: string;
  outflowBadge?: string;
  typeNamePlaceholder?: string;
  confirmPermanentDeleteBtn?: string;
  noChartDataWarning?: string;
  statementValuationShort?: string;
  capitalFlowShort?: string;
  investedShort?: string;

  // Importer keys
  importMovementsBtn?: string;
  importModalTitle?: string;
  importModalDesc?: string;
  importFileSelectPrompt?: string;
  importDragDropHint?: string;
  importTargetEntityLabel?: string;
  importSelectProviderLabel?: string;
  importAutoDetectedBadge?: string;
  importAutoDetectFailed?: string;
  importSummaryTitle?: string;
  importTotalAnalyzed?: string;
  importReadyToImport?: string;
  importDuplicatesSkipped?: string;
  importUnsupportedSkipped?: string;
  importErrorsCount?: string;
  importExecuteBtn?: string;
  importNoNewMovements?: string;
  importSuccessMsg?: string;
  importStatusValid?: string;
  importStatusDuplicate?: string;
  importStatusSkipped?: string;
  importStatusError?: string;
  importPreviewTitle?: string;
  importNoFileSelected?: string;
  importProcessingFile?: string;

  // Analytical Table Keys
  columnsVisibility?: string;
  columnsPicker?: string;
  resetFilters?: string;
  activeFilters?: string;
  sourceFilter?: string;
  sourceAll?: string;
  sourceManual?: string;
  sourceImported?: string;
  filterDateFrom?: string;
  filterDateTo?: string;
  filterMovementTypes?: string;
  filterAssets?: string;
  filterCashFlowDirection?: string;
  filterAllFlows?: string;
  filterInflowsOnly?: string;
  filterOutflowsOnly?: string;
  filterReturnsOnly?: string;
  filterValuationsOnly?: string;
  tableTotals?: string;
  totalInflowsSum?: string;
  totalOutflowsSum?: string;
  netFlowSum?: string;
  totalGrossReturnsSum?: string;
  totalTaxesSum?: string;
  totalNetReturnsSum?: string;
  totalCommissionsSum?: string;
  itemsPerPage?: string;
  pageOf?: string;
  showingRows?: string;
  ofTotalRows?: string;
  originColumn?: string;
  feeColumn?: string;
  unitPriceColumn?: string;
  grossReturnColumn?: string;
  taxAmountColumn?: string;
  netReturnColumn?: string;
  valuationColumn?: string;
  inflowOutflowColumn?: string;
  allColumns?: string;
  restoreDefaultColumns?: string;
  noMatchingRecords?: string;
  externalTransactionId?: string;
  importedVia?: string;
}

export interface TranslationDictionary {
  [langCode: string]: LanguagePhrases;
}
