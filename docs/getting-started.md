# Getting Started

## What is CMF?

CMF (CM Financiera) is the consumer financing arm of Banco General / HNL in Panama. It offers credit accounts that allow customers to pay for purchases in monthly installments (cuotas) or as a full one-time charge. This SDK wraps the CMF API so you can integrate it into any Node.js backend and React frontend.

## Prerequisites

- Node.js 18 or later
- TypeScript 5.0 or later (strict mode recommended)
- Active merchant account with Banco General / CM Financiera
- CMF API credentials (see "Obtaining Credentials" below)

## Obtaining Credentials

Contact Banco General merchant services to activate your integration. They will provide:

| Credential | Description |
|---|---|
| API base URL | Different for QA and production |
| Merchant email | Used to authenticate with the API |
| Merchant password | Used to authenticate with the API |
| Branch office code | Identifies your physical or virtual branch |
| Company code | Identifies your merchant entity |

### QA Environment

Use this URL for testing and development:

```
https://qa-idilw8q1smn68l4eux.cmf.com.pa/mdl03/api
```

Test credentials are provided by Banco General along with test customer document numbers you can use in the QA environment.

### Production Environment

The production URL is provided by Banco General upon merchant activation. It follows a similar pattern but points to the live system.

Never use production credentials during development. The QA environment is fully functional for testing the complete payment flow.

## Installation

```bash
# npm
npm install @panama-payments/cmf axios

# pnpm
pnpm add @panama-payments/cmf axios

# bun
bun add @panama-payments/cmf axios
```

React hooks (optional, for browser integration):

```bash
npm install @panama-payments/cmf react
```

## Quick Start: Server-Side

```typescript
import { CMFClient, CMFDocumentType } from '@panama-payments/cmf/server';

const cmf = new CMFClient({
  baseUrl: process.env.CMF_URL!,
  email: process.env.CMF_EMAIL!,
  password: process.env.CMF_PASSWORD!,
  branchOfficeCode: process.env.CMF_BRANCH_OFFICE_CODE!,
  companyCode: process.env.CMF_COMPANY_CODE!,
  createdBy: 'system',
});

// Authenticate (call once per server lifecycle or per-request if needed)
await cmf.ensureAuthenticated();

// Look up a customer
const customer = await cmf.getCustomerByDocument(CMFDocumentType.Cedula, '8-123-456');

// Get their financing products
const products = await cmf.getCustomerProducts(customer.id);

// Simulate installment plans for a $500 purchase
const quotas = await cmf.getQuotas(products[0].customerProductId, 500);
quotas.sort((a, b) => a.loanTerm - b.loanTerm);

// Process the purchase
const result = await cmf.processPurchaseInQuotas({
  AccountNumber: products[0].productAccount,
  UniqueCode: quotas[0].uniqueCode,
  Mto: 500,
  BranchOfficeCode: cmf.config.branchOfficeCode,
  CreatedBy: cmf.config.createdBy,
  CompanyCode: cmf.config.companyCode,
  ReceiptNumber: `ORDER-${Date.now()}`,
  Description: 'Purchase at My Store',
  UserName: customer.email,
});
```

## Quick Start: React Hooks

The React hooks call your backend API — they never talk to CMF directly. You must implement the backend routes first (see `examples/express/routes.ts`).

```tsx
import { useCMFCustomer, useCMFQuotas, useCMFPayment, CMFDocumentType } from '@panama-payments/cmf/react';

function CheckoutCMF() {
  const { search, customer, products } = useCMFCustomer();
  const { getQuotas, quotas } = useCMFQuotas();
  const { pay, isLoading, result } = useCMFPayment();

  const handleSearch = async () => {
    await search(CMFDocumentType.Cedula, '8-123-456');
  };

  const handleGetQuotas = async () => {
    if (products[0]) {
      await getQuotas(products[0].customerProductId, 500);
    }
  };

  const handlePay = async () => {
    if (!products[0] || !quotas[0]) return;
    await pay({
      mode: 'quotas',
      customerProductId: products[0].customerProductId,
      accountNumber: products[0].productAccount,
      uniqueCode: quotas[0].uniqueCode,
      amount: 500,
      receiptNumber: `ORDER-${Date.now()}`,
      description: 'Purchase at My Store',
      userName: customer!.email,
    });
  };

  return (
    <div>
      {/* Render your CMF checkout UI */}
    </div>
  );
}
```

## Security Notes

- **Never expose credentials in the browser.** Use `CMFClient` only on the server (Node.js).
- Mount your CMF routes behind authentication middleware so only logged-in customers can call them.
- Store `cmfCustomerId`, `customerProductId`, and `accountNumber` in your database after the first successful OTP verification. This avoids requiring customers to re-verify every time they check out.
- Validate the `receiptNumber` format before sending to CMF: alphanumeric, max 20 characters.

## Next Steps

- [flow.md](./flow.md) — Full purchase flow diagram
- [integration-guide.md](./integration-guide.md) — 5 real-world integration patterns
- [api-reference.md](./api-reference.md) — Complete method documentation
- [env-vars.md](./env-vars.md) — All environment variables
- [database-model.md](./database-model.md) — Recommended database schema
