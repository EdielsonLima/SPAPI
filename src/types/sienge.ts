export interface SiengeCompany {
  id: number;
  name: string;
  tradeName?: string;
  cnpj?: string;
  stateRegistration?: string;
  cityRegistration?: string;
  address?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  phone?: string;
  email?: string;
}

export interface SiengeCostCenter {
  id: number;
  name: string;
  cnpj?: string;
  idCompany?: number;
}

export interface SiengePaymentCategory {
  id: string;
  name: string;
  tpConta?: string;
  flRedutora?: string;
  flAtiva?: string;
  flAdiantamento?: string;
  flImposto?: string;
}

export interface SiengeListResponse<T> {
  resultSetMetadata: {
    count: number;
    offset: number;
    limit: number;
  };
  results: T[];
}

export interface SiengeOutcomePaymentCategory {
  costCenterId: number;
  costCenterName: string;
  financialCategoryId: string;
  financialCategoryName: string;
  financialCategoryReducer: string;
  financialCategoryType: string;
  financialCategoryRate: number;
  projectId: number;
  projectName: string;
}

export interface SiengeOutcomePayment {
  paymentDate: string;
  paidAmount: number;
  interestAmount: number;
  fineAmount: number;
  discountAmount: number;
}

export interface SiengeOutcomeBuildingCost {
  buildingId: number;
  buildingName: string;
  buildingUnitId: number;
  buildingUnitName: string;
  costEstimationSheetId: string;
  costEstimationSheetName: string;
  rate: number;
}

export interface SiengeOutcome {
  companyId: number;
  companyName: string;
  projectId: number;
  projectName: string;
  creditorId: number;
  creditorName: string;
  billId: number;
  installmentId: number;
  documentIdentificationId: string;
  documentIdentificationName: string;
  documentNumber: string;
  forecastDocument: string;
  consistencyStatus: string;
  originId: string;
  originalAmount: number;
  discountAmount: number;
  taxAmount: number;
  dueDate: string;
  issueDate: string;
  balanceAmount: number;
  correctedBalanceAmount: number;
  authorizationStatus: string;
  billDate: string;
  registeredBy: string;
  registeredDate: string;
  paymentsCategories: SiengeOutcomePaymentCategory[];
  payments: SiengeOutcomePayment[];
  buildingsCosts: SiengeOutcomeBuildingCost[];
}

export interface SiengeOutcomeResponse {
  data: SiengeOutcome[];
}
