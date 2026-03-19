# Integration Guide

Five real-world integration patterns for the CMF SDK.

---

## 1. New Customer: Full OTP + Account Link Flow

Use this when a customer is checking out with CMF for the first time.

### curl

```bash
# Step 1: Send OTP by email
curl -X POST https://yourstore.com/api/cmf/otp/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <customer-token>" \
  -d '{ "channel": "email", "destination": "customer@example.com" }'

# Step 2: Verify OTP
curl -X POST https://yourstore.com/api/cmf/otp/verify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <customer-token>" \
  -d '{ "channel": "email", "destination": "customer@example.com", "code": "123456" }'

# Step 3: Look up customer by document
curl -X POST https://yourstore.com/api/cmf/customer \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <customer-token>" \
  -d '{ "docType": "8F3C2EF0-F0D2-4FF0-9863-218D3D494D56", "docNumber": "8-123-456" }'
```

### TypeScript (server)

```typescript
import { CMFClient, CMFDocumentType } from '@panama-payments/cmf/server';

async function linkCMFAccount(
  email: string,
  otpCode: string,
  docType: CMFDocumentType,
  docNumber: string,
  yourCustomerId: string,
  db: YourDatabase,
) {
  const cmf = getCMFClient();
  await cmf.ensureAuthenticated();

  // Verify OTP first
  await cmf.verifyOtpByEmail(email, otpCode);

  // Look up CMF customer
  const customer = await cmf.getCustomerByDocument(docType, docNumber);
  const products = await cmf.getCustomerProducts(customer.id);

  if (products.length === 0) {
    throw new Error('No active CMF products found');
  }

  const product = products[0]!;
  const card = product.customerAccountCards[0]!;

  // Persist to your database — no OTP needed on future checkouts
  await db.upsertCMFInfo({
    customerId: yourCustomerId,
    cmfCustomerId: customer.id,
    email: customer.email,
    phone: customer.phone,
    customerProductId: product.customerProductId,
    accountNumber: card.account,
  });

  return { customer, products };
}
```

---

## 2. Returning Customer: Load Stored CMF Info

Use this when the customer has previously linked their CMF account. No OTP required.

### curl

```bash
# Get quota plans with stored product ID
curl -X POST https://yourstore.com/api/cmf/quotas \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <customer-token>" \
  -d '{ "customerProductId": "uuid-from-db", "amount": 300 }'
```

### TypeScript (server)

```typescript
async function getStoredCMFQuotas(yourCustomerId: string, amount: number, db: YourDatabase) {
  const cmfInfo = await db.getCMFInfo(yourCustomerId);
  if (!cmfInfo) {
    return { requiresLink: true };
  }

  const cmf = getCMFClient();
  await cmf.ensureAuthenticated();

  // Refresh product data (cards may change over time)
  const products = await cmf.getCustomerProducts(cmfInfo.cmfCustomerId);
  const quotas = await cmf.getQuotas(cmfInfo.customerProductId, amount);
  quotas.sort((a, b) => a.loanTerm - b.loanTerm);

  return { products, quotas, cmfInfo };
}
```

---

## 3. Installment Purchase at Checkout

Use this to process a quota-based payment after the customer selects a plan.

### curl

```bash
curl -X POST https://yourstore.com/api/cmf/pay \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <customer-token>" \
  -d '{
    "mode": "quotas",
    "customerProductId": "product-uuid",
    "accountNumber": "encrypted-account",
    "uniqueCode": "plan-unique-code",
    "amount": 500.00,
    "receiptNumber": "ORDER-1234567890",
    "description": "Order #1234",
    "userName": "customer@example.com"
  }'
```

### TypeScript (server)

```typescript
import type { CMFQuotaPurchaseRequest } from '@panama-payments/cmf/server';

async function processInstallmentPayment(
  cmfInfo: StoredCMFInfo,
  selectedQuotaUniqueCode: string,
  amount: number,
  orderId: string,
  customerEmail: string,
) {
  const cmf = getCMFClient();
  await cmf.ensureAuthenticated();

  // Max 20 chars, alphanumeric
  const receiptNumber = `ORD${orderId}${Date.now()}`.slice(0, 20);

  const params: CMFQuotaPurchaseRequest = {
    AccountNumber: cmfInfo.accountNumber,
    UniqueCode: selectedQuotaUniqueCode,
    Mto: amount,
    BranchOfficeCode: cmf.config.branchOfficeCode,
    CreatedBy: cmf.config.createdBy,
    CompanyCode: cmf.config.companyCode,
    ReceiptNumber: receiptNumber,
    Description: `Order ${orderId}`,
    UserName: customerEmail,
  };

  const result = await cmf.processPurchaseInQuotas(params);

  // Always verify — confirms the transaction was recorded in CMF
  await cmf.verifyTransaction(receiptNumber);

  return { result, receiptNumber };
}
```

### TypeScript (React hook)

```tsx
import { useCMFPayment } from '@panama-payments/cmf/react';

function PayButton({ product, selectedQuota, amount, customer }) {
  const { pay, isLoading, result, error } = useCMFPayment();

  const handlePay = () => pay({
    mode: 'quotas',
    customerProductId: product.customerProductId,
    accountNumber: product.productAccount,
    uniqueCode: selectedQuota.uniqueCode,
    amount,
    receiptNumber: `ORDER-${Date.now()}`,
    description: 'Purchase at My Store',
    userName: customer.email,
  });

  if (result) return <div>Payment successful!</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <button onClick={handlePay} disabled={isLoading}>
      {isLoading
        ? 'Processing...'
        : `Pay $${amount} in ${selectedQuota.loanTerm} installments`}
    </button>
  );
}
```

---

## 4. Normal (Full Charge) Purchase

Use this when the customer selects "pay in full" instead of installments.

### curl

```bash
curl -X POST https://yourstore.com/api/cmf/pay \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <customer-token>" \
  -d '{
    "mode": "normal",
    "cardNumber": "encrypted-card-number",
    "amount": 150.00,
    "receiptNumber": "ORDER-1234567890",
    "description": "Order #1234",
    "userName": "customer@example.com"
  }'
```

### TypeScript (server)

```typescript
import type { CMFNormalPurchaseRequest } from '@panama-payments/cmf/server';

async function processNormalPayment(
  encryptedCardNumber: string,
  amount: number,
  orderId: string,
  customerEmail: string,
) {
  const cmf = getCMFClient();
  await cmf.ensureAuthenticated();

  const receiptNumber = `ORD${orderId}`.slice(0, 20);

  const params: CMFNormalPurchaseRequest = {
    BranchOfficeCode: cmf.config.branchOfficeCode,
    CreatedBy: cmf.config.createdBy,
    CompanyCode: cmf.config.companyCode,
    CardNumber: encryptedCardNumber,
    MtoTran: amount,
    ReceiptNumber: receiptNumber,
    Description: `Order ${orderId}`,
    UserName: customerEmail,
    MovementType: 2,
    PaymentCashAmount: 0,
    WithdrawalFee: 0,
    Itbms: 0,
  };

  const result = await cmf.processNormalPurchase(params);
  await cmf.verifyTransaction(receiptNumber);

  return { result, receiptNumber };
}
```

---

## 5. Phone OTP Flow (WhatsApp)

Use this when the customer prefers to verify via WhatsApp instead of email.

**WARNING**: Multiple failed verification attempts block the phone number in the OTP provider. Always track attempts server-side and enforce a maximum of 3.

### curl

```bash
# Send OTP via WhatsApp
curl -X POST https://yourstore.com/api/cmf/otp/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <customer-token>" \
  -d '{ "channel": "phone", "destination": "+50761234567" }'

# Verify OTP
curl -X POST https://yourstore.com/api/cmf/otp/verify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <customer-token>" \
  -d '{ "channel": "phone", "destination": "+50761234567", "code": "123456" }'
```

### TypeScript (server — with attempt tracking)

```typescript
// Use Redis in production for distributed attempt tracking
const otpAttempts = new Map<string, number>();
const MAX_OTP_ATTEMPTS = 3;

async function verifyPhoneOtp(phone: string, code: string) {
  const attempts = (otpAttempts.get(phone) ?? 0) + 1;

  if (attempts > MAX_OTP_ATTEMPTS) {
    throw new Error('Too many OTP attempts. Please contact support.');
  }

  otpAttempts.set(phone, attempts);

  const cmf = getCMFClient();
  await cmf.ensureAuthenticated();

  try {
    await cmf.verifyOtpByPhone(phone, code);
    otpAttempts.delete(phone); // Reset on success
  } catch (err) {
    if (attempts >= MAX_OTP_ATTEMPTS) {
      otpAttempts.delete(phone);
      throw new Error('Maximum attempts reached. The phone may be temporarily blocked.');
    }
    throw err;
  }
}
```

### TypeScript (React hook)

```tsx
import { useCMFOtp, CMFOtpChannel } from '@panama-payments/cmf/react';

function PhoneOtpForm() {
  const { sendOtp, verifyOtp, step, error, isLoading } = useCMFOtp();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [attempts, setAttempts] = useState(0);
  const MAX_ATTEMPTS = 3;

  const handleSend = () => sendOtp(CMFOtpChannel.Phone, `+507${phone}`);

  const handleVerify = async () => {
    if (attempts >= MAX_ATTEMPTS) return;
    setAttempts(a => a + 1);
    await verifyOtp(code);
  };

  if (step === 'done') return <div>Phone verified successfully.</div>;

  return (
    <div>
      {step === 'idle' && (
        <>
          <input
            value={phone}
            onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="8-digit phone number"
            maxLength={8}
          />
          <button onClick={handleSend} disabled={isLoading || phone.length !== 8}>
            {isLoading ? 'Sending...' : 'Send WhatsApp code'}
          </button>
        </>
      )}
      {step === 'verify' && (
        <>
          <p>Enter the code sent to +507{phone} via WhatsApp</p>
          <p>Attempts remaining: {MAX_ATTEMPTS - attempts}</p>
          <input
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6-digit code"
            maxLength={6}
          />
          <button
            onClick={handleVerify}
            disabled={isLoading || attempts >= MAX_ATTEMPTS || code.length < 6}
          >
            {isLoading ? 'Verifying...' : 'Verify code'}
          </button>
        </>
      )}
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
}
```
