# Environment Variables

All CMF environment variables are **server-only secrets**. Never expose them in the browser, in `NEXT_PUBLIC_*` variables, or in client-side bundles.

---

## Required Variables

| Variable | Description | Example |
|---|---|---|
| `CMF_URL` | CMF API base URL without trailing slash | `https://qa-idilw8q1smn68l4eux.cmf.com.pa/mdl03/api` |
| `CMF_EMAIL` | Merchant email for API authentication | `merchant@yourstore.com` |
| `CMF_PASSWORD` | Merchant password for API authentication | `YourSecurePassword123` |
| `CMF_BRANCH_OFFICE_CODE` | Branch office code assigned by Banco General | `MKP` |
| `CMF_COMPANY_CODE` | Company code assigned by Banco General | `MKP` |

## Optional Variables

| Variable | Description | Default |
|---|---|---|
| `CMF_CREATED_BY` | Operator identifier used in transaction audit trail | `system` |
| `CMF_TIMEOUT_MS` | API request timeout in milliseconds | `60000` |

---

## Environment Files

### `.env` (development)

```bash
# CMF API
CMF_URL=https://qa-idilw8q1smn68l4eux.cmf.com.pa/mdl03/api
CMF_EMAIL=your-dev-email@yourstore.com
CMF_PASSWORD=your-dev-password
CMF_BRANCH_OFFICE_CODE=MKP
CMF_COMPANY_CODE=MKP
CMF_CREATED_BY=dev-system
CMF_TIMEOUT_MS=60000
```

### `.env.production`

```bash
# CMF API — production values provided by Banco General
CMF_URL=https://prod-url-from-banco-general.cmf.com.pa/mdl03/api
CMF_EMAIL=your-prod-email@yourstore.com
CMF_PASSWORD=your-prod-password
CMF_BRANCH_OFFICE_CODE=YOUR_PROD_CODE
CMF_COMPANY_CODE=YOUR_PROD_CODE
CMF_CREATED_BY=api
CMF_TIMEOUT_MS=60000
```

### `.env.example` (commit this, not the actual values)

```bash
# CMF API — see docs/env-vars.md
CMF_URL=
CMF_EMAIL=
CMF_PASSWORD=
CMF_BRANCH_OFFICE_CODE=
CMF_COMPANY_CODE=
CMF_CREATED_BY=system
CMF_TIMEOUT_MS=60000
```

---

## Loading Variables in Code

### Express.js / Node.js

```typescript
import { CMFClient } from '@panama-payments/cmf/server';

function createCMFClient(): CMFClient {
  const baseUrl = process.env['CMF_URL'];
  const email = process.env['CMF_EMAIL'];
  const password = process.env['CMF_PASSWORD'];
  const branchOfficeCode = process.env['CMF_BRANCH_OFFICE_CODE'];
  const companyCode = process.env['CMF_COMPANY_CODE'];

  if (!baseUrl || !email || !password || !branchOfficeCode || !companyCode) {
    throw new Error(
      'Missing required CMF env vars: CMF_URL, CMF_EMAIL, CMF_PASSWORD, ' +
      'CMF_BRANCH_OFFICE_CODE, CMF_COMPANY_CODE',
    );
  }

  return new CMFClient({
    baseUrl,
    email,
    password,
    branchOfficeCode,
    companyCode,
    createdBy: process.env['CMF_CREATED_BY'] ?? 'system',
    timeoutMs: Number(process.env['CMF_TIMEOUT_MS'] ?? '60000'),
  });
}
```

### Next.js (server route / API route)

```typescript
// app/api/cmf/pay/route.ts — this is a server route
import { CMFClient } from '@panama-payments/cmf/server';

// These are server-only — never put CMF vars in NEXT_PUBLIC_*
const cmf = new CMFClient({
  baseUrl: process.env.CMF_URL!,
  email: process.env.CMF_EMAIL!,
  password: process.env.CMF_PASSWORD!,
  branchOfficeCode: process.env.CMF_BRANCH_OFFICE_CODE!,
  companyCode: process.env.CMF_COMPANY_CODE!,
  createdBy: process.env.CMF_CREATED_BY ?? 'system',
});
```

---

## QA vs Production URLs

| Environment | URL |
|---|---|
| QA / Development | `https://qa-idilw8q1smn68l4eux.cmf.com.pa/mdl03/api` |
| Production | Provided by Banco General / HNL upon merchant activation |

Use QA credentials during development and testing. QA supports the full payment flow, including OTP and purchase processing.

---

## Secret Rotation

1. Update the environment variable in your secrets manager (AWS Secrets Manager, Vault, etc.)
2. Redeploy or restart your API server to pick up the new values
3. The `CMFClient` will re-authenticate on the next request (token is stored in memory, not persisted)
4. Verify the new credentials work by calling `cmf.ensureAuthenticated()` in a health check

---

## Security Checklist

- [ ] `CMF_PASSWORD` is stored in a secrets manager, not in plaintext files
- [ ] `.env` files are in `.gitignore` and never committed
- [ ] No CMF variables are prefixed with `NEXT_PUBLIC_` or equivalent
- [ ] CMF routes have authentication middleware (customers can only call their own data)
- [ ] Production `CMF_URL` is only set in the production environment
