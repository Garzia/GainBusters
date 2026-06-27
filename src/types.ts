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
  SELL = 'SELL'
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

export interface SystemSettings {
  theme: 'light' | 'dark' | 'system';
  defaultCurrency: Currency | string;
  passwordHash?: string;
  passwordSet: boolean;
  selectedInflationId: string;
  inflationIndices: InflationSetting[];
  activeCurrencies?: string[];
  lang?: string;
}

export interface DBState {
  settings: SystemSettings;
  accounts: Account[];
  portfolios: Portfolio[];
  transactions: Transaction[];
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
  volatility: string;
  maxDrawdown: string;
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
}

export interface TranslationDictionary {
  [langCode: string]: LanguagePhrases;
}
