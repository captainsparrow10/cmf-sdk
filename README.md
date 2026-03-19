# @panama-payments/cmf

[![npm version](https://img.shields.io/npm/v/@panama-payments/cmf.svg)](https://www.npmjs.com/package/@panama-payments/cmf)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

SDK for integrating **CMF (CM Financiera / Banco General HNL)** consumer financing into Node.js backends and React frontends. Supports installment purchases, normal card charges, OTP verification, and quota simulation.

---

## Features

- Full TypeScript support with strict mode and JSDoc on every export
- Server-side `CMFClient` for Node.js — handles authentication, token management, and all API calls
- Headless React hooks that call your backend — no credentials in the browser
- OTP flow for both email and WhatsApp (phone)
- Installment (quota) simulation with plan selection
- Transaction verification after payment
- Zero framework dependencies — works with Express, Next.js, Fastify, or any Node.js server

---

## Installation

```bash
npm install @panama-payments/cmf axios
# or
pnpm add @panama-payments/cmf axios
# or
bun add @panama-payments/cmf axios
```

For React hooks (optional):

```bash
npm install @panama-payments/cmf react
```

---

## Quick Start

### 1. Set environment variables

```bash
CMF_URL=https://qa-idilw8q1smn68l4eux.cmf.com.pa/mdl03/api
CMF_EMAIL=your-merchant-email@example.com
CMF_PASSWORD=your-merchant-password
CMF_BRANCH_OFFICE_CODE=MKP
CMF_COMPANY_CODE=MKP
CMF_CREATED_BY=system
```

See [docs/env-vars.md](./docs/env-vars.md) for the full list.

### 2. Create the client (server only)

```typescript
import { CMFClient, CMFDocumentType } from '@panama-payments/cmf/server';

const cmf = new CMFClient({
  baseUrl: process.env.CMF_URL!,
  email: process.env.CMF_EMAIL!,
  password: process.env.CMF_PASSWORD!,
  branchOfficeCode: process.env.CMF_BRANCH_OFFICE_CODE!,
  companyCode: process.env.CMF_COMPANY_CODE!,
  createdBy: process.env.CMF_CREATED_BY ?? 'system',
});
```

### 3. Run the installment purchase flow

```typescript
// Authenticate
await cmf.ensureAuthenticated();

// Send OTP to customer's email
await cmf.sendOtpByEmail('customer@example.com');

// Verify OTP entered by customer
await cmf.verifyOtpByEmail('customer@example.com', '123456');

// Look up customer
const customer = await cmf.getCustomerByDocument(CMFDocumentType.Cedula, '8-123-456');
const products = await cmf.getCustomerProducts(customer.id);

// Simulate financing plans for $500
const quotas = await cmf.getQuotas(products[0].customerProductId, 500);
quotas.sort((a, b) => a.loanTerm - b.loanTerm);

// Process installment purchase
const receiptNumber = `ORDER-${Date.now()}`;
const result = await cmf.processPurchaseInQuotas({
  AccountNumber: products[0].productAccount,
  UniqueCode: quotas[0].uniqueCode,
  Mto: 500,
  BranchOfficeCode: cmf.config.branchOfficeCode,
  CreatedBy: cmf.config.createdBy,
  CompanyCode: cmf.config.companyCode,
  ReceiptNumber: receiptNumber,
  Description: 'Purchase at My Store',
  UserName: customer.email,
});

// Verify the transaction was recorded
await cmf.verifyTransaction(receiptNumber);
```

### 4. Add Express routes (proxy for the browser)

```typescript
import { cmfRouter, cmfErrorHandler } from './examples/express/routes';

app.use('/api/cmf', authMiddleware, cmfRouter);
app.use('/api/cmf', cmfErrorHandler);
```

See [examples/express/routes.ts](./examples/express/routes.ts) for the complete implementation.

### 5. Use React hooks in the browser

```tsx
import { useCMFCustomer, useCMFQuotas, useCMFPayment, CMFDocumentType } from '@panama-payments/cmf/react';

function CMFCheckout() {
  const { search, customer, products } = useCMFCustomer();
  const { getQuotas, quotas } = useCMFQuotas();
  const { pay, isLoading, result } = useCMFPayment();

  // Hooks call /api/cmf/* routes — never CMF directly
  // ...
}
```

---

## Documentation

| Doc | Description |
|---|---|
| [docs/getting-started.md](./docs/getting-started.md) | Prerequisites, installation, QA vs production URLs |
| [docs/flow.md](./docs/flow.md) | Mermaid diagrams of the complete purchase flows |
| [docs/integration-guide.md](./docs/integration-guide.md) | 5 real-world patterns with curl + TypeScript code |
| [docs/api-reference.md](./docs/api-reference.md) | Every method, parameter, return type, and error |
| [docs/env-vars.md](./docs/env-vars.md) | All environment variables with descriptions |
| [docs/database-model.md](./docs/database-model.md) | Sequelize schema for storing CMF customer links |

---

## Architecture

```
@panama-payments/cmf
├── /server          Node.js only — CMFClient with all API methods
└── /react           Headless hooks — call your backend, never CMF directly
```

The separation ensures that merchant credentials never reach the browser. Your backend acts as a secure proxy.

```
Browser → Your Backend API → CMFClient → CMF API (Banco General)
   (useCMF* hooks)  (/api/cmf/* routes)   (server-only)
```

---

## Security

- `CMFClient` must only run on the server. The `email` and `password` are merchant credentials that must never be exposed to the browser.
- Mount your `/api/cmf/*` routes behind your authentication middleware.
- Store `cmfCustomerId` in your database after the first OTP verification so customers do not need to re-verify on every checkout.
- Enforce a maximum of 3 OTP attempts for phone numbers to avoid blocking the number in the CMF OTP provider.
- Always validate `receiptNumber` to be alphanumeric, max 20 characters.

---

## License

MIT
