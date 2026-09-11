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
}

export interface DBState {
  settings: SystemSettings;
  accounts: Account[];
  portfolios: Portfolio[];
  transactions: Transaction[];
  transfers?: Transfer[];
  otherCosts?: OtherCost[];
  instrumentGroups?: InstrumentGroup[];
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
}

export interface TranslationDictionary {
  [langCode: string]: LanguagePhrases;
}
