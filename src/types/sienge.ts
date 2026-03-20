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
  operationTypeId: number;
  operationTypeName: string;
  grossAmount: number;
  monetaryCorrectionAmount: number;
  interestAmount: number;
  fineAmount: number;
  discountAmount: number;
  taxAmount: number;
  netAmount: number;
  calculationDate: string;
  paymentDate: string;
  paymentAuthentication: string;
  sequencialNumber: number;
  correctedNetAmount: number;
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
  observation?: string;
  indexerId?: number;
  indexerName?: string;
  paymentsCategories: SiengeOutcomePaymentCategory[];
  payments: SiengeOutcomePayment[];
  buildingsCosts: SiengeOutcomeBuildingCost[];
}

export interface SiengeOutcomeResponse {
  data: SiengeOutcome[];
}

// ─── Income (Contas a Receber) ──────────────────────────────────────────────

export interface SiengeIncomePaymentCategory {
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

export interface SiengeIncomePayment {
  operationTypeId: number;
  operationTypeName: string;
  grossAmount: number;
  monetaryCorrectionAmount: number;
  interestAmount: number;
  fineAmount: number;
  discountAmount: number;
  taxAmount: number;
  netAmount: number;
  calculationDate: string;
  paymentDate: string;
  paymentAuthentication: string;
  sequencialNumber: number;
  correctedNetAmount: number;
}

export interface SiengeIncome {
  companyId: number;
  companyName: string;
  projectId: number;
  projectName: string;
  clientId: number;
  clientName: string;
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
  observation?: string;
  indexerId?: number;
  indexerName?: string;
  paymentsCategories: SiengeIncomePaymentCategory[];
  payments: SiengeIncomePayment[];
  receivedNetAmount?: number;
}

export interface SiengeIncomeResponse {
  data: SiengeIncome[];
}

export interface SiengeBankMovement {
  bankMovementId: number;
  billId: number;
  installmentId: number;
  bankMovementAmount: number;
  documentIdentificationId: string;
  documentIdentificationName: string;
  documentIdentificationNumber: string;
  bankMovementOriginId: string;
  bankMovementHistoricId: string;
  bankMovementHistoricName: string;
  bankMovementOperationId: number;
  bankMovementOperationName: string;
  bankMovementOperationType: string;
  bankMovementReconcile: string;
  bankMovementDate: string;
  billDate: string;
  accountNumber: string;
  companyId: number;
  companyName: string;
  groupCompanyId: number;
  groupCompanyName: string;
  holdingId: number;
  holdingName: string;
  subsidiaryId: number;
  subsidiaryName: string;
  creditorId: number;
  creditorName: string;
  clientId: number;
  clientName: string;
  financialCategories: SiengeBankMovementFinancialCategory[];
}

export interface SiengeBankMovementFinancialCategory {
  companyId: number;
  companyName: string;
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

export interface SiengeBankMovementResponse {
  data: SiengeBankMovement[];
}

export interface SiengePurchaseOrder {
  id: number;
  formattedPurchaseOrderId: string;
  status: string;
  consistent: string;
  authorized: boolean;
  disapproved: boolean;
  deliveryLate: boolean;
  supplierId: number;
  buildingId: number;
  buyerId: string;
  date: string;
  salesRepresentativeId: number | null;
  internalNotes: string;
  costCenterId: number;
  departamentId: number | null;
  companyBillId: number;
  transporterId: number | null;
  forecastDocumentId: string;
  forecastBillId: number | null;
  indexerId: number;
  discount: number;
  increase: number;
  totalAmount: number;
  createdBy: string;
  createdAt: string;
  modifiedBy: string;
  modifiedAt: string;
  authorizedAt: string | null;
  sentDate: string | null;
  freightType: string;
  itemsFreightAmount: number;
  freightAmount: number;
  totalFreight: number;
  notes: string;
  paymentCondition: string;
}

export interface SiengePurchaseOrderItem {
  itemNumber: number;
  buildingCostDatabaseId: number;
  resourceId: number;
  resourceDescription: string;
  resourceCode: string;
  resourceReference: string;
  detailId: number | null;
  detailDescription: string;
  trademarkId: number | null;
  trademarkDescription: string;
  unitOfMeasure: string;
  quantity: number;
  unitPrice: number;
  netPrice: number;
  freightUnitPrice: number;
  discount: number;
  discountPercentage: number;
  increasePercentage: number;
  icmsTaxPercentage: number;
  ipiTaxPercentage: number;
  issTaxPercentage: number;
  notes: string;
}

export interface SiengeDeliverySchedule {
  deliveryScheduleNumber: number;
  sheduledDate: string;
  sheduledQuantity: number;
  deliveredQuantity: number;
  openQuantity: number;
}

export interface SiengePurchaseRequest {
  id: number;
  buildingId: number;
  departamentId?: number;
  requesterUser: string;
  requestDate: string;
  notes?: string;
  status: string; // PENDING | PARTIALLY_ATTENDED | FULLY_ATTENDED | CANCELED
  consitent?: string; // IN_INCLUSION | CONSISTENT | INCONSISTENT
  createdBy?: string;
  createdAt?: string;
  modifiedBy?: string;
  modifiedAt?: string;
  purchaseProcessCarriedOutByBuildingFlag?: boolean;
}

export interface SiengePurchaseRequestItem {
  purchaseRequestId: number;
  itemNumber: number;
  productId: number;
  productDescription: string;
  detailId?: number;
  detailDescription?: string;
  trademarkId?: number;
  trademarkDescription?: string;
  quantity: number;
  unitySymbol: string;
  notes?: string;
  authorized: boolean;
  disapproved: boolean;
  competenceLevel?: number;
  estimatedDeliveryTime?: number;
  disapprovalReason?: number;
}

export interface SiengeDeliveryRequirement {
  deliveryRequirementNumber: number;
  requirementDate: string;
  requirementQuantity: number;
  attendedQuantity?: number;
  openQuantity?: boolean;
}

export interface SiengeDeliveryAttended {
  purchaseOrderId: number;
  purchaseOrderItemNumber: number;
  deliveryItemPurchaseOrderNumber: number;
  purchaseOrderItemAttendedNumber: number;
  sequentialNumber: number;
  invoiceItemNumber: number;
  deliveryDate: string;
  quantityDelivery: number;
}

// ─── Sales Contracts (Contratos de Vendas) ──────────────────────────────────

export interface SiengeSalesContractCustomer {
  id: number;
  name: string;
  main: boolean;
  spouse: boolean;
  participationPercentage: number;
}

export interface SiengeSalesContractUnit {
  id: number;
  main: boolean;
  name: string;
  participationPercentage: number;
}

export interface SiengeSalesContractPaymentCondition {
  conditionTypeId: string;
  conditionTypeName: string;
  installmentsNumber: number;
  openInstallmentsNumber: number;
  totalValue: number;
  outstandingBalance: number;
  amountPaid: number;
  bearerName: string;
  indexerName: string;
  firstPayment: string;
  baseDate: string;
  sequenceId: number;
  orderNumber: number;
  status: string;
}

export interface SiengeSalesContract {
  id: number;
  companyId: number;
  companyName: string;
  enterpriseId: number;
  enterpriseName: string;
  number: string;
  situation: string;
  value: number;
  totalSellingValue: number;
  contractDate: string;
  issueDate: string;
  expectedDeliveryDate: string;
  cancellationDate: string | null;
  cancellationReason: string | null;
  totalCancellationAmount: number;
  creationDate: string;
  lastUpdateDate: string;
  salesContractCustomers: SiengeSalesContractCustomer[];
  salesContractUnits: SiengeSalesContractUnit[];
  paymentConditions: SiengeSalesContractPaymentCondition[];
}

// ─── Enterprise Units ─────────────────────────────────────────────────────────

export interface SiengeEnterprise {
  id: number;
  name: string;
  commercialName: string | null;
  companyId: number;
  companyName: string;
}

export interface SiengeUnit {
  id: number;
  enterpriseId: number;
  contractId: number | null;
  name: string;
  propertyType: string;
  commercialStock: string; // V=Vendida, D=Disponível, R=Reserva Técnica, P=Permuta, G=Gravame
  floor: string;
  contractNumber: string;
  deliveryDate: string | null;
  scheduledDeliveryDate: string | null;
  privateArea: number;
  commonArea: number;
  terrainArea: number | null;
  usableArea: number | null;
  note: string;
  childUnits: unknown[];
}

// Enriched unit with enterprise name (returned by our API)
export interface SiengeEnrichedUnit {
  id: number;
  enterpriseId: number;
  enterpriseName: string;
  companyName: string;
  name: string;
  propertyType: string;
  commercialStock: string; // Label: "Vendida", "Disponível", "Reserva Técnica", "Permuta", "Gravame"
  floor: string;
  contractNumber: string;
  privateArea: number;
  deliveryDate: string | null;
}
