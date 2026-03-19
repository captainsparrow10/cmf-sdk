/**
 * Document type identifiers used by the CMF API.
 * These are UUIDs assigned by Banco General to each document type.
 */
export enum CMFDocumentType {
  /** Panamanian national ID (Cédula de identidad personal) */
  Cedula = '8F3C2EF0-F0D2-4FF0-9863-218D3D494D56',
  /** Driver's license (Licencia de conducir) */
  Licencia = '438EF2ED-7C3A-4322-AC84-0964A455753E',
  /** International passport */
  Pasaporte = '3C88AF1B-BEC2-4533-9A25-80E3226841F7',
  /** Registro Único de Contribuyente (business tax ID) */
  RUC = 'E8C46303-196C-4139-AE0C-FDFAAAF71ADB',
}

/** OTP delivery channel */
export enum CMFOtpChannel {
  /** OTP delivered via email */
  Email = 'email',
  /** OTP delivered via WhatsApp by CM Financiera / Banco General */
  Phone = 'phone',
}

/**
 * CMF API error codes returned in `status_result.code`.
 * A response can have HTTP 200 but still be an error — always check `complete: true`.
 */
export enum CMFErrorCode {
  /** Input validation error (e.g. negative or zero amount) — errorType: 'Cmf_GeneralValidations' */
  GeneralValidation = 1000,
  /** Core banking processing error (insufficient funds, inactive card) — errorType: 'Vtc_ErrorProcessTransacction' */
  VtcProcessError = 2006,
}

/**
 * Response from the CMF login endpoint.
 * The `token` field is a JWT used for all subsequent authenticated requests.
 */
export interface CMFLoginResponse {
  /** Merchant user UUID */
  id: string;
  /** Merchant email address */
  email: string;
  /** Merchant user first name */
  firstName: string;
  /** Merchant user first surname */
  firstSurname: string;
  /** Identity/document number of the merchant user */
  identityNumber: string;
  /** JWT token — include as `Authorization: Bearer <token>` in all subsequent calls */
  token: string;
  /** Roles assigned to the merchant user */
  roles: string[];
  /** Branch offices associated with the merchant user */
  branchOffices: unknown[];
}

/**
 * Customer record returned by the CMF customer search endpoint.
 * The `id` field is used as `customerId` in `getCustomerProducts()`.
 */
export interface CMFCustomerResponse {
  /** CMF internal customer UUID — required for getCustomerProducts() */
  id: string;
  /** Document type UUID */
  typeIdentityId: string;
  /** Marital status UUID */
  maritalStatusId: string;
  /** Gender UUID */
  genderId: string;
  /** Country UUID */
  countryId: string;
  /** Nationality UUID */
  nationalityId: string;
  /** System UUID */
  systemId: string;
  /** Customer's registered phone number */
  phone: string;
  /** Customer's registered email address */
  email: string;
  /** Branch office UUID */
  branchOfficeId: string;
  /** Seller UUID */
  sellerId: string;
  /** Document number as stored in CMF (e.g. '8-123-456') */
  identityNumber: string;
  /** Customer's first name */
  firstName: string;
  /** Customer's second name */
  secondName: string;
  /** Customer's first surname */
  firstSurname: string;
  /** Customer's second surname */
  secondSurname: string;
  /** Married last name, if applicable */
  marriedLastName: string | null;
  /** Full name as stored in CMF */
  fullName: string;
  /** Date of birth in ISO format */
  dateOfBirth: string;
  /** Customer's age */
  age: number;
  /** Date of death, if applicable */
  dateOfDeath: string | null;
  /** Whether the customer is CRS-flagged */
  isCrs: boolean;
  /** Whether the customer is a Politically Exposed Person */
  isPep: boolean;
  /** Whether the customer is a PEP relative */
  isPepRel: boolean;
  /** Whether the customer is FATCA-flagged */
  isFatca: boolean;
  /** ISO timestamp of account creation */
  createdDate: string;
  /** User who created the record */
  createdBy: string;
  /** ISO timestamp of last modification */
  lastModifiedDate: string;
  /** User who last modified the record */
  lastModifiedBy: string | null;
  /** Monthly salary, if recorded */
  salary: number | null;
  /** ISO timestamp of last onboarding */
  lastOnboardingDate: string;
  /** Product UUID */
  productId: string;
  /** Customer number */
  customerNumber: string;
  /** Last onboarding ID */
  lasOnboardingId: number;
  /** Whether record was created by batch process */
  isBatch: boolean;
  /** Whether the customer account is active */
  active: boolean;
  /** Additional properties may be present */
  [key: string]: unknown;
}

/**
 * A financing/credit product associated with a customer.
 * Each product may have multiple linked cards (`customerAccountCards`).
 */
export interface CMFProduct {
  /** UUID used to identify the product in quota simulation and purchases */
  customerProductId: string;
  /** Product UUID */
  productId: string;
  /** Product type code (e.g. 'CREDITO') */
  productCode: string;
  /** Human-readable product name */
  productName: string;
  /** Billing cycle */
  cycle: number | string;
  /** Product type UUID */
  productTypeId: string;
  /** Encrypted account number — used in processPurchaseInQuotas */
  productAccount: string;
  /** Whether this is a renewed product */
  isRenovated: boolean;
  /** Who renewed the product, if applicable */
  renovatedBy: string | null;
  /** Product status ('ACTIVO' or similar) */
  status: string | boolean;
  /** Cards linked to this product */
  customerAccountCards: CMFAccountCard[];
  /** Decrypted account number for display */
  decryptedAccount: string;
}

/**
 * A card linked to a CMF customer product.
 * Both `account` and `card` are encrypted values returned by CMF.
 */
export interface CMFAccountCard {
  /** Encrypted account number — used in processPurchaseInQuotas */
  account: string;
  /** Encrypted card number — used in processNormalPurchase */
  card: string;
  /** Masked card number for display (e.g. "****1234") */
  maskedCard: string;
  /** Whether this is an additional card (not the primary) */
  isAditionalCard: boolean;
  /** Card status */
  status: string | boolean;
  /** Card currency (e.g. 'USD') */
  currency?: string;
  /** Decrypted account number */
  decryptedAccount?: string;
}

/**
 * A financing quota plan returned by the CMF simulator.
 * The `uniqueCode` is used in `processPurchaseInQuotas` to identify the selected plan.
 */
export interface CMFQuota {
  /** The product this quota is for */
  customerProductId: string;
  /** Plan identifier — pass this as `UniqueCode` in processPurchaseInQuotas */
  uniqueCode: string;
  /** Human-readable plan description (e.g. 'Plan 6 cuotas') */
  descriptionPlan: string;
  /** Interest description, if applicable */
  interestDescription: string | null;
  /** Fixed rate loan plan UUID */
  fixedRateLoanId: string;
  /** Number of installments (e.g. 6, 12, 18, 24) */
  loanTerm: number;
  /** Annual effective interest rate as a decimal (e.g. 0.18 = 18%) */
  effectiveInterestPct: number;
  /** Down payment amount required */
  downPayment: number;
  /** Product price (for reference) */
  productPrice: number;
  /** Payment frequency (e.g. 'MENSUAL') */
  frequencyType: string;
  /** Total amount to be paid including interest */
  totalCreditAmount: number;
  /** Pending total credit amount */
  pendingTotalCreditAmount: number | null;
  /** Original requested amount */
  requestedAmount: number;
  /** Amount of interest per installment */
  interestAmount: number;
  /** Sum of all interest over the loan term */
  totalInterestSum: number;
  /** Interest rate percentage */
  interestPct: number;
  /** Amount of each monthly installment */
  monthlyQuota: number;
  /** Annual effective interest rate */
  annualEffectiveRate: number;
  /** Total interest over the loan term */
  totalInterest: number | null;
  /** Capital (principal) value */
  capitalValue: number;
  /** Amount already paid */
  paidAmount: number;
  /** Remaining balance */
  balanceAmount: number;
  /** Expected start date of the financing */
  startDate: string;
  /** Expected end date of the financing */
  finishDate: string | null;
  /** ISO timestamp of last modification */
  lastModifiedDate: string;
  /** Down payment as a percentage */
  downPaymentPercentage: number;
}

/**
 * Parameters for processing an installment (quota) purchase via CMF.
 * The `AccountNumber` and `UniqueCode` come from the simulator flow.
 */
export interface CMFQuotaPurchaseRequest {
  /** Encrypted account number from CMFProduct.productAccount */
  AccountNumber: string;
  /** Plan identifier from CMFQuota.uniqueCode */
  UniqueCode: string;
  /** Purchase amount in USD */
  Mto: number;
  /** Merchant branch office code (from CMF merchant credentials) */
  BranchOfficeCode: string;
  /** Operator/user identifier for audit trail */
  CreatedBy: string;
  /** Merchant company code (from CMF merchant credentials) */
  CompanyCode: string;
  /** Unique receipt/order number generated by the merchant (alphanumeric, max 20 chars) */
  ReceiptNumber: string;
  /** Purchase description shown in the CMF email to customer */
  Description: string;
  /** Customer username or identifier (typically the customer's email) */
  UserName: string;
  /** Encrypted card number — optional in quota purchases */
  Card?: string;
}

/**
 * Parameters for processing a normal (non-installment) card purchase via CMF.
 * The `CardNumber` comes from CMFAccountCard.card (encrypted).
 */
export interface CMFNormalPurchaseRequest {
  /** Merchant branch office code */
  BranchOfficeCode: string;
  /** Operator/user identifier for audit trail */
  CreatedBy: string;
  /** Merchant company code */
  CompanyCode: string;
  /** Encrypted card number from CMFAccountCard.card */
  CardNumber: string;
  /** Purchase amount in USD */
  MtoTran: number;
  /** Unique receipt/order number generated by the merchant */
  ReceiptNumber: string;
  /** Purchase description shown in the CMF email to customer */
  Description: string;
  /** Customer username or identifier */
  UserName: string;
  /** Movement type — always 2 for purchases */
  MovementType: 2;
  /** Optional payment ID — pass null if not applicable */
  PaymentId?: string | null;
  /** Cash payment amount — always 0 for card purchases */
  PaymentCashAmount: 0;
  /** Withdrawal fee — always 0 for purchases */
  WithdrawalFee: 0;
  /** ITBMS tax amount — always 0 for standard purchases */
  Itbms?: 0;
}

/**
 * Status detail returned in CMF error responses.
 * Present in `CMFApiResponse.status_result` when `complete === false`.
 */
export interface CMFStatusResult {
  /** Originating system identifier */
  system: string | number;
  /** Whether this is an error */
  error: boolean;
  /** Error code — see CMFErrorCode enum for known values */
  code: number | string | null;
  /** Error category (e.g. 'Cmf_GeneralValidations', 'Vtc_ErrorProcessTransacction') */
  errorType: string | null;
  /** Human-readable error message */
  message: string | null;
  /** Source system of the error */
  source: string;
}

/**
 * Generic API response wrapper returned by all CMF endpoints.
 *
 * IMPORTANT: HTTP 200 alone does not mean success — always check `complete === true`.
 * When `complete` is false, inspect `status_result` for the error details.
 *
 * @template T - The shape of `jsonAnswer`, which varies by endpoint.
 */
export interface CMFApiResponse<T = unknown> {
  /** Internal record ID */
  id: number | string | null;
  /** True only when the operation completed successfully */
  complete: boolean;
  /** Process identifier */
  process: string | boolean | null;
  /** Unique code generated by CMF for this transaction */
  uniqueCode: string | null;
  /** New code, if applicable */
  newCode: string | null;
  /** New code mail, if applicable */
  newCodeMail?: string | null;
  /** The actual response payload — shape depends on the endpoint */
  jsonAnswer: T;
  /** Array of completed processing steps */
  processComplete: unknown[];
  /** Public-facing error message — present when `complete === false` */
  problemPublic: string | null;
  /** Internal error message — not for end-user display */
  problemInternal?: string | null;
  /** Overall status flag */
  status: boolean;
  /** Present when `complete === false` — contains structured error details */
  status_result: CMFStatusResult | null;
  /** ISO timestamp of record creation */
  createdDate?: string;
  /** User who created the record */
  createdBy?: string;
  /** ISO timestamp of last modification */
  lastModifiedDate?: string;
  /** User who last modified the record */
  lastModifiedBy?: string | null;
  /** Original request as a JSON string */
  jsonInput?: string;
  /** Whether the phone-based onboarding is active */
  onboardingPhoneActive?: boolean;
  /** Lexis-Nexis list flag */
  isLexisNexisList?: boolean | string | null;
}

/**
 * Credentials and configuration required to instantiate CMFClient.
 * All values must be obtained from Banco General / CM Financiera upon merchant activation.
 */
export interface CMFClientConfig {
  /**
   * CMF API base URL (without trailing slash).
   *
   * Environments:
   * - QA: `https://qa-idilw8q1smn68l4eux.cmf.com.pa/mdl03/api`
   * - Production: provided by Banco General / HNL upon merchant activation
   */
  baseUrl: string;
  /** Merchant email used to authenticate with the CMF API */
  email: string;
  /** Merchant password for CMF API authentication */
  password: string;
  /** Branch office code assigned to the merchant by CMF (e.g. 'MKP') */
  branchOfficeCode: string;
  /** Company code assigned to the merchant by CMF (e.g. 'MKP') */
  companyCode: string;
  /** Operator identifier used in transaction audit trail (e.g. 'system' or 'api') */
  createdBy: string;
  /**
   * Request timeout in milliseconds.
   * CMF API can be slow — default is 60000ms (60 seconds).
   * @default 60000
   */
  timeoutMs?: number;
}
