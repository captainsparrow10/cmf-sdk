import axios, { AxiosInstance } from 'axios';
import type {
  CMFClientConfig,
  CMFLoginResponse,
  CMFCustomerResponse,
  CMFProduct,
  CMFQuota,
  CMFQuotaPurchaseRequest,
  CMFNormalPurchaseRequest,
  CMFApiResponse,
} from '../types.js';
import { CMFDocumentType } from '../types.js';

/**
 * Client for the CMF (Banco General / HNL) financing API.
 *
 * All API calls are authenticated with a JWT obtained via `login()`.
 * The client manages the token internally and refreshes it automatically
 * by calling `login()` again when needed.
 *
 * **IMPORTANT**: This client must only be used on the server (Node.js).
 * Never expose merchant credentials (`email`, `password`) to the browser.
 *
 * @example
 * ```ts
 * const cmf = new CMFClient({
 *   baseUrl: process.env.CMF_URL!,
 *   email: process.env.CMF_EMAIL!,
 *   password: process.env.CMF_PASSWORD!,
 *   branchOfficeCode: process.env.CMF_BRANCH_OFFICE_CODE!,
 *   companyCode: process.env.CMF_COMPANY_CODE!,
 *   createdBy: process.env.CMF_CREATED_BY ?? 'system',
 * });
 *
 * // Ensure authenticated before making API calls
 * await cmf.ensureAuthenticated();
 * const customer = await cmf.getCustomerByDocument(CMFDocumentType.Cedula, '8-123-456');
 * ```
 */
export class CMFClient {
  private readonly http: AxiosInstance;
  /** @internal */
  readonly config: CMFClientConfig;
  private token: string | null = null;

  constructor(config: CMFClientConfig) {
    this.config = config;
    this.http = axios.create({
      baseURL: config.baseUrl,
      headers: { 'Content-Type': 'application/json' },
      timeout: config.timeoutMs ?? 60000,
    });
  }

  // ── AUTHENTICATION ──────────────────────────────────────────────────────────

  /**
   * Authenticates the merchant with the CMF API and stores the JWT token
   * for subsequent requests.
   *
   * The token is automatically included in all subsequent API calls via the
   * `Authorization: Bearer <token>` header.
   *
   * @returns Login response including the JWT token and merchant user details
   * @throws {Error} If authentication fails (invalid credentials or API error)
   *
   * @example
   * ```ts
   * const auth = await cmf.login();
   * console.log(`Logged in as ${auth.firstName} ${auth.firstSurname}`);
   * ```
   */
  async login(): Promise<CMFLoginResponse> {
    const response = await this.http.post<CMFLoginResponse>('/auth/login', {
      email: this.config.email,
      password: this.config.password,
    });

    const data = response.data;
    if (!data.token) {
      throw new Error('CMF login failed: No token in response');
    }

    this.token = data.token;
    this.http.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;
    return data;
  }

  /**
   * Ensures the client has a valid authentication token.
   * If no token exists, calls `login()` automatically.
   *
   * Call this before making your first API request in a new client instance.
   *
   * @example
   * ```ts
   * await cmf.ensureAuthenticated();
   * const customer = await cmf.getCustomerByDocument(CMFDocumentType.Cedula, '8-123-456');
   * ```
   */
  async ensureAuthenticated(): Promise<void> {
    if (!this.token) {
      await this.login();
    }
  }

  // ── CUSTOMER LOOKUP ─────────────────────────────────────────────────────────

  /**
   * Looks up a customer by their document type and number.
   *
   * Use the `CMFDocumentType` enum to get the correct UUID for the document type.
   * The returned `id` (customerId) is required for `getCustomerProducts()`.
   *
   * @param docType - Document type (use the `CMFDocumentType` enum for the correct UUID)
   * @param docNumber - Document number (e.g. '8-123-456' for a cédula)
   * @returns Customer record including the internal `id` (customerId)
   * @throws {Error} If customer is not found or API returns an error
   *
   * @example
   * ```ts
   * await cmf.ensureAuthenticated();
   * const customer = await cmf.getCustomerByDocument(CMFDocumentType.Cedula, '8-123-456');
   * console.log(`Found customer: ${customer.fullName} (id: ${customer.id})`);
   * ```
   */
  async getCustomerByDocument(
    docType: CMFDocumentType,
    docNumber: string,
  ): Promise<CMFCustomerResponse> {
    const response = await this.http.get<CMFApiResponse<CMFCustomerResponse>>(
      `/Customers/${encodeURIComponent(docType)}/${encodeURIComponent(docNumber)}`,
    );
    const data = response.data;
    if (!data.complete || !data.jsonAnswer?.id) {
      throw new Error(
        `CMF customer not found: ${data.status_result?.message ?? data.problemPublic ?? 'No customer found for document'}`,
      );
    }
    return data.jsonAnswer;
  }

  /**
   * Looks up a customer by their registered email address.
   *
   * Only use email addresses that the customer registered with CMF.
   * Returns the full customer record including the internal `id` for `getCustomerProducts()`.
   *
   * @param email - Customer's registered CMF email address
   * @returns Customer record including the internal `id` (customerId)
   * @throws {Error} If customer is not found or API returns an error
   *
   * @example
   * ```ts
   * await cmf.ensureAuthenticated();
   * const customer = await cmf.getCustomerByEmail('customer@example.com');
   * console.log(`Found: ${customer.fullName}`);
   * ```
   */
  async getCustomerByEmail(email: string): Promise<CMFCustomerResponse> {
    const response = await this.http.get<CMFApiResponse<CMFCustomerResponse>>(
      `/Customers/GetCustomerInfoByEmail?email=${encodeURIComponent(email)}`,
    );
    const data = response.data;
    if (!data.complete || !data.jsonAnswer?.id) {
      throw new Error(
        `CMF customer not found by email: ${data.status_result?.message ?? data.problemPublic ?? 'No customer found'}`,
      );
    }
    return data.jsonAnswer;
  }

  /**
   * Looks up a customer by their registered phone number.
   *
   * Phone numbers should be in the format used when the customer registered with CMF.
   * For Panama numbers, omit the country code (e.g. '61234567' for a local number).
   *
   * @param phone - Customer's registered phone number
   * @returns Customer record including the internal `id` (customerId)
   * @throws {Error} If customer is not found or API returns an error
   *
   * @example
   * ```ts
   * await cmf.ensureAuthenticated();
   * const customer = await cmf.getCustomerByPhone('61234567');
   * ```
   */
  async getCustomerByPhone(phone: string): Promise<CMFCustomerResponse> {
    const response = await this.http.get<CMFApiResponse<CMFCustomerResponse>>(
      `/Customers/GetCustomerInfoByPhone?phone=${encodeURIComponent(phone)}`,
    );
    const data = response.data;
    if (!data.complete || !data.jsonAnswer?.id) {
      throw new Error(
        `CMF customer not found by phone: ${data.status_result?.message ?? data.problemPublic ?? 'No customer found'}`,
      );
    }
    return data.jsonAnswer;
  }

  // ── CUSTOMER PRODUCTS ───────────────────────────────────────────────────────

  /**
   * Retrieves the financing products (credit accounts) associated with a customer.
   *
   * Each product contains:
   * - `productAccount` (encrypted) — used as `AccountNumber` in `processPurchaseInQuotas()`
   * - `customerAccountCards[]` — each card has an encrypted `card` for `processNormalPurchase()`
   * - `customerProductId` — used in `getQuotas()` to simulate financing plans
   *
   * @param customerId - The customer's internal CMF UUID (from any `getCustomerBy*` method)
   * @returns Array of products. Empty array if the customer has no active products.
   * @throws {Error} If the API returns an error
   *
   * @example
   * ```ts
   * const products = await cmf.getCustomerProducts(customer.id);
   * if (products.length === 0) {
   *   throw new Error('Customer has no active CMF products');
   * }
   * const product = products[0];
   * console.log(`Product: ${product.productName} (${product.customerAccountCards.length} cards)`);
   * ```
   */
  async getCustomerProducts(customerId: string): Promise<CMFProduct[]> {
    const response = await this.http.get<CMFProduct[]>(
      `/Customers/GetProdAccountInfoByCustomerIdV2?customerId=${encodeURIComponent(customerId)}`,
    );
    if (!response.data) {
      return [];
    }
    return Array.isArray(response.data) ? response.data : [];
  }

  // ── QUOTA SIMULATION ────────────────────────────────────────────────────────

  /**
   * Simulates financing quota plans for a given product and purchase amount.
   *
   * Returns multiple financing plans with different terms (6, 12, 18, 24 months, etc.).
   * Present all available plans to the customer and let them select one.
   * The selected plan's `uniqueCode` is used in `processPurchaseInQuotas()`.
   *
   * @param customerProductId - Product UUID from `CMFProduct.customerProductId`
   * @param amount - Purchase amount to finance (must be positive)
   * @returns Array of available financing plans, unsorted
   * @throws {Error} If simulation fails (e.g. amount too low, product inactive)
   *
   * @example
   * ```ts
   * const quotas = await cmf.getQuotas(product.customerProductId, 500);
   * const sorted = quotas.sort((a, b) => a.loanTerm - b.loanTerm);
   * sorted.forEach(plan => {
   *   console.log(`${plan.loanTerm} months at $${plan.monthlyQuota.toFixed(2)}/month`);
   * });
   * const selectedPlan = sorted.find(q => q.loanTerm === 12);
   * ```
   */
  async getQuotas(customerProductId: string, amount: number): Promise<CMFQuota[]> {
    const response = await this.http.post<CMFApiResponse<CMFQuota[]>>(
      '/onboarding/Credit/SimulatorAmount',
      { customerProductId, amountoToEvaluate: amount },
    );
    const data = response.data;
    if (!data.complete) {
      throw new Error(
        `CMF quota simulation failed: ${data.status_result?.message ?? data.problemPublic ?? 'Unknown error'}`,
      );
    }
    return data.jsonAnswer ?? [];
  }

  // ── PURCHASES ───────────────────────────────────────────────────────────────

  /**
   * Processes a purchase using CMF financing (installments/quotas).
   *
   * CMF automatically sends a confirmation email to the customer upon success.
   * After calling this, use `verifyTransaction()` to confirm the transaction was recorded.
   *
   * **Receipt Number**: Generate a unique receipt number per transaction.
   * Example: `` `ORDER-${Date.now()}${Math.floor(Math.random() * 1000)}` ``
   * Store this in your database to correlate with CMF records.
   *
   * @param params - Purchase parameters including encrypted account, plan code, and receipt number
   * @returns The API response. Always check `complete === true`.
   * @throws {Error} If the API returns an error (includes CMFErrorCode details in the message)
   *
   * @example
   * ```ts
   * const receiptNumber = `ORDER-${Date.now()}`;
   * const result = await cmf.processPurchaseInQuotas({
   *   AccountNumber: product.productAccount,
   *   UniqueCode: selectedPlan.uniqueCode,
   *   Mto: 500,
   *   BranchOfficeCode: cmf.config.branchOfficeCode,
   *   CreatedBy: cmf.config.createdBy,
   *   CompanyCode: cmf.config.companyCode,
   *   ReceiptNumber: receiptNumber,
   *   Description: 'Purchase at My Store',
   *   UserName: customer.email,
   * });
   * ```
   */
  async processPurchaseInQuotas(params: CMFQuotaPurchaseRequest): Promise<CMFApiResponse> {
    const response = await this.http.post<CMFApiResponse>(
      '/Versatec/VtcIngresarFinanciamientoCuentaWeb',
      params,
    );
    const data = response.data;
    if (!data.complete) {
      throw new Error(
        `CMF quota purchase failed (code ${data.status_result?.code ?? 'unknown'}): ${data.status_result?.message ?? data.problemPublic ?? 'Unknown error'}`,
      );
    }
    return data;
  }

  /**
   * Processes a normal (non-installment) card purchase.
   *
   * Use this when the customer wants to pay the full amount at once using their
   * CMF card, without financing. CMF sends a confirmation email upon success.
   *
   * @param params - Purchase parameters including encrypted card number
   * @returns The API response. Always check `complete === true`.
   * @throws {Error} If the API returns an error
   *
   * @example
   * ```ts
   * const card = product.customerAccountCards[0];
   * const result = await cmf.processNormalPurchase({
   *   BranchOfficeCode: cmf.config.branchOfficeCode,
   *   CreatedBy: cmf.config.createdBy,
   *   CompanyCode: cmf.config.companyCode,
   *   CardNumber: card.card,
   *   MtoTran: 150.00,
   *   ReceiptNumber: `ORDER-${Date.now()}`,
   *   Description: 'Purchase at My Store',
   *   UserName: customer.email,
   *   MovementType: 2,
   *   PaymentCashAmount: 0,
   *   WithdrawalFee: 0,
   * });
   * ```
   */
  async processNormalPurchase(params: CMFNormalPurchaseRequest): Promise<CMFApiResponse> {
    const response = await this.http.post<CMFApiResponse>(
      '/Versatec/VtcProcessTransacctionPagoWeb',
      params,
    );
    const data = response.data;
    if (!data.complete) {
      throw new Error(
        `CMF normal purchase failed (code ${data.status_result?.code ?? 'unknown'}): ${data.status_result?.message ?? data.problemPublic ?? 'Unknown error'}`,
      );
    }
    return data;
  }

  // ── TRANSACTION VERIFICATION ────────────────────────────────────────────────

  /**
   * Verifies that a transaction was recorded correctly in the CMF system.
   *
   * Call this after `processPurchaseInQuotas()` or `processNormalPurchase()` to
   * confirm the transaction was stored with the correct amount and receipt number.
   * This is especially important before fulfilling an order.
   *
   * @param receiptNumber - The merchant-generated receipt number used in the purchase
   * @returns The transaction record from CMF
   * @throws {Error} If the transaction is not found or verification fails
   *
   * @example
   * ```ts
   * const receiptNumber = `ORDER-${Date.now()}`;
   * await cmf.processPurchaseInQuotas({ ..., ReceiptNumber: receiptNumber });
   * const verification = await cmf.verifyTransaction(receiptNumber);
   * console.log('Transaction verified:', verification.complete);
   * ```
   */
  async verifyTransaction(receiptNumber: string): Promise<CMFApiResponse> {
    const response = await this.http.get<CMFApiResponse>(
      `/Versatec/GetTransacctionPagoWeb/${encodeURIComponent(receiptNumber)}`,
    );
    const data = response.data;
    if (!data.complete) {
      throw new Error(
        `CMF transaction verification failed: ${data.status_result?.message ?? data.problemPublic ?? 'Transaction not found'}`,
      );
    }
    return data;
  }

  // ── OTP ─────────────────────────────────────────────────────────────────────

  /**
   * Sends an OTP verification code to the customer's email.
   *
   * Only use email addresses registered in the CMF system.
   * After calling this, prompt the user to enter the code and call `verifyOtpByEmail()`.
   *
   * @param email - Customer's registered CMF email address
   * @throws {Error} If OTP send fails
   *
   * @example
   * ```ts
   * await cmf.sendOtpByEmail(customer.email);
   * // Prompt user to enter the 6-digit code
   * const isValid = await cmf.verifyOtpByEmail(customer.email, userInput);
   * ```
   */
  async sendOtpByEmail(email: string): Promise<void> {
    const response = await this.http.post<CMFApiResponse>(
      '/EmailServices/sendEmailverify',
      { to: email, username: '' },
    );
    if (!response.data.complete) {
      throw new Error(
        `CMF OTP send failed: ${response.data.status_result?.message ?? response.data.problemPublic ?? 'Unknown error'}`,
      );
    }
  }

  /**
   * Verifies an OTP code sent to the customer's email.
   *
   * **IMPORTANT**: Each OTP code can only be verified once. After successful
   * verification, the code is invalidated by CMF.
   *
   * @param email - Customer's email (same as used in `sendOtpByEmail()`)
   * @param code - The OTP code entered by the customer
   * @returns `true` if the code is valid
   * @throws {Error} If the code is invalid, expired, or already used
   *
   * @example
   * ```ts
   * try {
   *   const isValid = await cmf.verifyOtpByEmail(customer.email, userInput);
   * } catch (err) {
   *   // Code invalid or expired — ask user to request a new code
   * }
   * ```
   */
  async verifyOtpByEmail(email: string, code: string): Promise<boolean> {
    const response = await this.http.post<CMFApiResponse>(
      '/EmailServices/confirmEmailVerify',
      { to: email, code },
    );
    if (!response.data.complete) {
      throw new Error(
        `CMF OTP verification failed: ${response.data.status_result?.message ?? response.data.problemPublic ?? 'Invalid code'}`,
      );
    }
    return true;
  }

  /**
   * Sends an OTP verification code to the customer's phone via WhatsApp.
   *
   * The message is sent by CM Financiera / Banco General via WhatsApp.
   * Phone numbers should include the country code (e.g. '+50761234567' for Panama).
   *
   * **WARNING**: Multiple failed verification attempts will block the phone number
   * in the OTP provider. Implement rate limiting and a maximum attempts limit.
   *
   * @param phone - Customer phone number with country code (e.g. '+50761234567')
   * @throws {Error} If OTP send fails
   *
   * @example
   * ```ts
   * await cmf.sendOtpByPhone('+50761234567');
   * const isValid = await cmf.verifyOtpByPhone('+50761234567', userInput);
   * ```
   */
  async sendOtpByPhone(phone: string): Promise<void> {
    const response = await this.http.post<CMFApiResponse>(
      '/EmailServices/sendverify',
      { To: phone },
    );
    if (!response.data.complete) {
      throw new Error(
        `CMF OTP send failed: ${response.data.status_result?.message ?? response.data.problemPublic ?? 'Unknown error'}`,
      );
    }
  }

  /**
   * Verifies an OTP code sent to the customer's phone.
   *
   * **WARNING**: Multiple failed attempts will block the phone number in the
   * OTP provider. Implement a maximum of 3 attempts before resetting the flow.
   *
   * @param phone - Customer phone number with country code (same as used in `sendOtpByPhone()`)
   * @param code - The OTP code entered by the customer
   * @returns `true` if the code is valid
   * @throws {Error} If the code is invalid or the phone number is blocked
   *
   * @example
   * ```ts
   * let attempts = 0;
   * const MAX_ATTEMPTS = 3;
   * try {
   *   attempts++;
   *   const isValid = await cmf.verifyOtpByPhone('+50761234567', userInput);
   * } catch (err) {
   *   if (attempts >= MAX_ATTEMPTS) {
   *     // Reset flow — do not retry verifyOtpByPhone for this session
   *   }
   * }
   * ```
   */
  async verifyOtpByPhone(phone: string, code: string): Promise<boolean> {
    const response = await this.http.post<CMFApiResponse>(
      '/EmailServices/confirmVerify',
      { to: phone, code },
    );
    if (!response.data.complete) {
      throw new Error(
        `CMF OTP verification failed: ${response.data.status_result?.message ?? response.data.problemPublic ?? 'Invalid code'}`,
      );
    }
    return true;
  }
}
