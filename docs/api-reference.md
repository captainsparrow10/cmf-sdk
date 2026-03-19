# API Reference

## CMFClient — `@panama-payments/cmf/server`

### Constructor

```typescript
new CMFClient(config: CMFClientConfig)
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `config.baseUrl` | `string` | Yes | CMF API base URL without trailing slash |
| `config.email` | `string` | Yes | Merchant email for authentication |
| `config.password` | `string` | Yes | Merchant password for authentication |
| `config.branchOfficeCode` | `string` | Yes | Branch office code assigned by CMF |
| `config.companyCode` | `string` | Yes | Company code assigned by CMF |
| `config.createdBy` | `string` | Yes | Operator identifier for audit trail |
| `config.timeoutMs` | `number` | No | Request timeout in ms (default: 60000) |

---

### Authentication

#### `login(): Promise<CMFLoginResponse>`

Authenticates with the CMF API and stores the JWT token internally.

- **Throws** if credentials are invalid or API is unreachable.
- After login, all subsequent requests automatically include `Authorization: Bearer <token>`.

#### `ensureAuthenticated(): Promise<void>`

Calls `login()` if no token is stored. Use this instead of `login()` to avoid re-authenticating on every request.

---

### Customer Lookup

#### `getCustomerByDocument(docType: CMFDocumentType, docNumber: string): Promise<CMFCustomerResponse>`

Looks up a customer by document type and number.

| Parameter | Type | Description |
|---|---|---|
| `docType` | `CMFDocumentType` | Document type UUID (use the enum) |
| `docNumber` | `string` | Document number (e.g. `'8-123-456'`) |

- **Returns** `CMFCustomerResponse` with `id` (cmfCustomerId) and contact details.
- **Throws** if customer not found (`complete === false`).

#### `getCustomerByEmail(email: string): Promise<CMFCustomerResponse>`

Looks up a customer by their registered CMF email address.

- **Throws** if customer not found.

#### `getCustomerByPhone(phone: string): Promise<CMFCustomerResponse>`

Looks up a customer by their registered phone number. Omit the country code for Panama numbers.

- **Throws** if customer not found.

---

### Customer Products

#### `getCustomerProducts(customerId: string): Promise<CMFProduct[]>`

Retrieves all active financing products for a customer.

| Parameter | Type | Description |
|---|---|---|
| `customerId` | `string` | Customer's CMF UUID from `getCustomerByDocument()` |

- **Returns** array of `CMFProduct`. May be empty if the customer has no active accounts.
- Each `CMFProduct` contains `productAccount` (encrypted, for quota purchases) and `customerAccountCards[]` (each with an encrypted `card` for normal purchases).

---

### Quota Simulation

#### `getQuotas(customerProductId: string, amount: number): Promise<CMFQuota[]>`

Simulates financing installment plans for a product and purchase amount.

| Parameter | Type | Description |
|---|---|---|
| `customerProductId` | `string` | UUID from `CMFProduct.customerProductId` |
| `amount` | `number` | Purchase amount to finance (must be positive) |

- **Returns** array of `CMFQuota` plans. Sort by `loanTerm` for display.
- The selected plan's `uniqueCode` is passed to `processPurchaseInQuotas()`.
- **Throws** if simulation fails (e.g. amount below minimum, product inactive).

---

### Purchases

#### `processPurchaseInQuotas(params: CMFQuotaPurchaseRequest): Promise<CMFApiResponse>`

Processes an installment purchase.

| Field | Type | Description |
|---|---|---|
| `AccountNumber` | `string` | Encrypted account from `CMFProduct.productAccount` |
| `UniqueCode` | `string` | Plan code from `CMFQuota.uniqueCode` |
| `Mto` | `number` | Purchase amount |
| `BranchOfficeCode` | `string` | Merchant branch code |
| `CreatedBy` | `string` | Operator identifier |
| `CompanyCode` | `string` | Merchant company code |
| `ReceiptNumber` | `string` | Unique merchant receipt number (alphanumeric, max 20 chars) |
| `Description` | `string` | Purchase description |
| `UserName` | `string` | Customer identifier (typically email) |
| `Card` | `string` | Optional encrypted card number |

- **Returns** `CMFApiResponse` with `complete: true` on success.
- **Throws** with error code and message if `complete === false`.
- CMF sends a confirmation email to the customer automatically.

#### `processNormalPurchase(params: CMFNormalPurchaseRequest): Promise<CMFApiResponse>`

Processes a non-installment (full charge) card purchase.

| Field | Type | Description |
|---|---|---|
| `BranchOfficeCode` | `string` | Merchant branch code |
| `CreatedBy` | `string` | Operator identifier |
| `CompanyCode` | `string` | Merchant company code |
| `CardNumber` | `string` | Encrypted card from `CMFAccountCard.card` |
| `MtoTran` | `number` | Purchase amount |
| `ReceiptNumber` | `string` | Unique merchant receipt number |
| `Description` | `string` | Purchase description |
| `UserName` | `string` | Customer identifier |
| `MovementType` | `2` | Always `2` for purchases |
| `PaymentCashAmount` | `0` | Always `0` for card purchases |
| `WithdrawalFee` | `0` | Always `0` for purchases |
| `Itbms` | `0` | Always `0` for standard purchases |

- **Returns** `CMFApiResponse` with `complete: true` on success.
- **Throws** if `complete === false`.

---

### Transaction Verification

#### `verifyTransaction(receiptNumber: string): Promise<CMFApiResponse>`

Verifies that a transaction was recorded in CMF.

| Parameter | Type | Description |
|---|---|---|
| `receiptNumber` | `string` | The receipt number used in the purchase |

- Call this after every purchase to confirm the transaction is stored.
- **Throws** if the transaction is not found.

---

### OTP

#### `sendOtpByEmail(email: string): Promise<void>`

Sends an OTP to the customer's registered CMF email address.

- **Throws** if send fails.

#### `verifyOtpByEmail(email: string, code: string): Promise<boolean>`

Verifies an OTP sent to email. Each code can only be verified once.

- **Returns** `true` if valid.
- **Throws** if invalid, expired, or already used.

#### `sendOtpByPhone(phone: string): Promise<void>`

Sends an OTP via WhatsApp. Phone must include country code (e.g. `'+50761234567'`).

- **WARNING**: Multiple failures block the phone number in the OTP provider.

#### `verifyOtpByPhone(phone: string, code: string): Promise<boolean>`

Verifies an OTP sent to phone.

- **Returns** `true` if valid.
- **Throws** if invalid or phone is blocked.
- **WARNING**: Enforce a maximum of 3 attempts before resetting the session.

---

## React Hooks — `@panama-payments/cmf/react`

All hooks are headless (no JSX). They call your backend API — never CMF directly.

---

### `useCMFCustomer(config?)`

Searches for a CMF customer by document type and number.

```typescript
const { search, customer, products, isLoading, error, reset } = useCMFCustomer({
  endpoint?: string; // default: '/api/cmf/customer'
});
```

| Return | Type | Description |
|---|---|---|
| `search` | `(docType, docNumber) => Promise<void>` | Trigger customer search |
| `customer` | `CMFCustomerResponse \| null` | Found customer |
| `products` | `CMFProduct[]` | Customer's financing products |
| `isLoading` | `boolean` | True during request |
| `error` | `string \| null` | Error message |
| `reset` | `() => void` | Reset all state |

---

### `useCMFQuotas(config?)`

Fetches installment plans for a product and amount.

```typescript
const { getQuotas, quotas, isLoading, error, reset } = useCMFQuotas({
  endpoint?: string; // default: '/api/cmf/quotas'
});
```

| Return | Type | Description |
|---|---|---|
| `getQuotas` | `(customerProductId, amount) => Promise<void>` | Fetch plans |
| `quotas` | `CMFQuota[]` | Available plans |
| `isLoading` | `boolean` | True during request |
| `error` | `string \| null` | Error message |
| `reset` | `() => void` | Reset all state |

---

### `useCMFOtp(config?)`

Manages the OTP verification flow (email or phone).

```typescript
const { sendOtp, verifyOtp, channel, destination, step, isLoading, error, reset } = useCMFOtp({
  sendEndpoint?: string;   // default: '/api/cmf/otp/send'
  verifyEndpoint?: string; // default: '/api/cmf/otp/verify'
});
```

| Return | Type | Description |
|---|---|---|
| `sendOtp` | `(channel, destination) => Promise<void>` | Send OTP |
| `verifyOtp` | `(code) => Promise<void>` | Verify entered code |
| `channel` | `CMFOtpChannel \| null` | Active channel |
| `destination` | `string \| null` | Active destination |
| `step` | `CMFOtpStep` | `'idle' \| 'verify' \| 'done'` |
| `isLoading` | `boolean` | True during requests |
| `error` | `string \| null` | Error message |
| `reset` | `() => void` | Reset all state |

---

### `useCMFPayment(config?)`

Processes a CMF payment (installment or full charge).

```typescript
const { pay, isLoading, result, error, reset } = useCMFPayment({
  endpoint?: string; // default: '/api/cmf/pay'
});
```

| Return | Type | Description |
|---|---|---|
| `pay` | `(params: CMFPaymentParams) => Promise<void>` | Process payment |
| `isLoading` | `boolean` | True during request |
| `result` | `CMFApiResponse \| null` | Payment result |
| `error` | `string \| null` | Error message |
| `reset` | `() => void` | Reset result and error |

`CMFPaymentParams` is a union type — use `mode: 'quotas'` or `mode: 'normal'` to select the payment type.

---

## Enums

### `CMFDocumentType`

| Value | UUID | Description |
|---|---|---|
| `CMFDocumentType.Cedula` | `8F3C2EF0-F0D2-4FF0-9863-218D3D494D56` | Panamanian cédula |
| `CMFDocumentType.Licencia` | `438EF2ED-7C3A-4322-AC84-0964A455753E` | Driver's license |
| `CMFDocumentType.Pasaporte` | `3C88AF1B-BEC2-4533-9A25-80E3226841F7` | Passport |
| `CMFDocumentType.RUC` | `E8C46303-196C-4139-AE0C-FDFAAAF71ADB` | RUC (business tax ID) |

### `CMFOtpChannel`

| Value | Description |
|---|---|
| `CMFOtpChannel.Email` | OTP via email |
| `CMFOtpChannel.Phone` | OTP via WhatsApp |

### `CMFErrorCode`

| Value | Code | Description |
|---|---|---|
| `CMFErrorCode.GeneralValidation` | `1000` | Input validation error |
| `CMFErrorCode.VtcProcessError` | `2006` | Core banking error (e.g. insufficient funds) |

---

## Key Types

### `CMFApiResponse<T>`

Wrapper returned by all CMF endpoints. **Always check `complete === true`**.

```typescript
interface CMFApiResponse<T = unknown> {
  id: number | string | null;
  complete: boolean;          // true = success; false = error
  uniqueCode: string | null;  // CMF transaction identifier
  jsonAnswer: T;              // Payload (shape varies by endpoint)
  problemPublic: string | null; // User-facing error message
  status: boolean;
  status_result: CMFStatusResult | null; // Error details when complete === false
}
```

### `CMFStatusResult`

Error details in `status_result` when `complete === false`.

```typescript
interface CMFStatusResult {
  system: string | number;
  error: boolean;
  code: number | string | null;   // See CMFErrorCode
  errorType: string | null;       // e.g. 'Cmf_GeneralValidations'
  message: string | null;
  source: string;
}
```
