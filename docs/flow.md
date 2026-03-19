# CMF Payment Flow

## Overview

The CMF payment flow has two paths: **installment (quota) purchase** and **normal (full charge) purchase**. Both paths require authentication and customer lookup. The installment path adds a quota simulation step.

A one-time OTP verification is required when a customer links their CMF account for the first time. After linking, store the `cmfCustomerId` in your database to skip OTP on future checkouts.

---

## Installment Purchase Flow

```mermaid
sequenceDiagram
    autonumber
    actor Customer
    participant Frontend
    participant YourBackend as Your Backend
    participant CMF as CMF API

    Customer->>Frontend: Enters email or phone at checkout
    Frontend->>YourBackend: POST /api/cmf/otp/send { channel, destination }
    YourBackend->>CMF: POST /EmailServices/sendEmailverify (or sendverify)
    CMF-->>YourBackend: { complete: true }
    YourBackend-->>Frontend: { success: true }
    Frontend->>Customer: Shows OTP input

    Customer->>Frontend: Enters OTP code
    Frontend->>YourBackend: POST /api/cmf/otp/verify { channel, destination, code }
    YourBackend->>CMF: POST /EmailServices/confirmEmailVerify (or confirmVerify)
    CMF-->>YourBackend: { complete: true }
    YourBackend-->>Frontend: { success: true }

    Frontend->>YourBackend: POST /api/cmf/customer { docType, docNumber }
    YourBackend->>CMF: GET /Customers/{docType}/{docNumber}
    CMF-->>YourBackend: CMFApiResponse<CMFCustomerResponse>
    YourBackend->>CMF: GET /Customers/GetProdAccountInfoByCustomerIdV2?customerId=...
    CMF-->>YourBackend: CMFProduct[]
    YourBackend-->>Frontend: { customer, products }

    Frontend->>YourBackend: POST /api/cmf/quotas { customerProductId, amount }
    YourBackend->>CMF: POST /onboarding/Credit/SimulatorAmount
    CMF-->>YourBackend: CMFApiResponse<CMFQuota[]>
    YourBackend-->>Frontend: { quotas }
    Frontend->>Customer: Shows installment plan options

    Customer->>Frontend: Selects a plan
    Frontend->>YourBackend: POST /api/cmf/pay { mode: 'quotas', ... }
    YourBackend->>CMF: POST /Versatec/VtcIngresarFinanciamientoCuentaWeb
    CMF-->>YourBackend: CMFApiResponse { complete: true }
    YourBackend->>CMF: GET /Versatec/GetTransacctionPagoWeb/{receiptNumber}
    CMF-->>YourBackend: CMFApiResponse { complete: true }
    YourBackend-->>Frontend: Payment confirmed
    CMF->>Customer: Sends confirmation email (automatic)
    Frontend->>Customer: Shows order confirmation
```

---

## Normal (Full Charge) Purchase Flow

```mermaid
sequenceDiagram
    autonumber
    actor Customer
    participant Frontend
    participant YourBackend as Your Backend
    participant CMF as CMF API

    note over Frontend,CMF: OTP + customer lookup steps same as above

    Customer->>Frontend: Selects "Pay in full"
    Frontend->>YourBackend: POST /api/cmf/pay { mode: 'normal', cardNumber, amount, ... }
    YourBackend->>CMF: POST /Versatec/VtcProcessTransacctionPagoWeb
    CMF-->>YourBackend: CMFApiResponse { complete: true }
    YourBackend->>CMF: GET /Versatec/GetTransacctionPagoWeb/{receiptNumber}
    CMF-->>YourBackend: CMFApiResponse { complete: true }
    YourBackend-->>Frontend: Payment confirmed
    CMF->>Customer: Sends confirmation email (automatic)
```

---

## Returning Customer Flow (Stored CMF Info)

If you store `cmfCustomerId` and `customerProductId` in your database after the first OTP verification, you can skip the OTP and customer search on future checkouts:

```mermaid
sequenceDiagram
    autonumber
    actor Customer
    participant Frontend
    participant YourBackend as Your Backend
    participant CMF as CMF API
    participant DB as Your Database

    Customer->>Frontend: Arrives at checkout
    Frontend->>YourBackend: GET /api/cmf/info (with auth token)
    YourBackend->>DB: SELECT * FROM cmf_info WHERE customer_id = ?
    DB-->>YourBackend: { cmfCustomerId, customerProductId, accountNumber }
    YourBackend->>CMF: ensureAuthenticated()
    YourBackend->>CMF: GET /Customers/GetProdAccountInfoByCustomerIdV2?customerId=...
    CMF-->>YourBackend: CMFProduct[]
    YourBackend->>CMF: POST /onboarding/Credit/SimulatorAmount
    CMF-->>YourBackend: CMFQuota[]
    YourBackend-->>Frontend: { products, quotas }
    Frontend->>Customer: Shows available plans (no OTP needed)
```

---

## Error Handling

| Scenario | HTTP status | `complete` | Action |
|---|---|---|---|
| Customer not found | 404 from CMF | N/A | Ask customer to verify their document |
| Invalid OTP code | 200 from CMF | `false` | Show error, allow retry (max 3 attempts for phone) |
| OTP expired | 200 from CMF | `false` | Ask customer to request a new code |
| Phone OTP blocked | 200 from CMF | `false` | Advise customer to contact Banco General |
| Insufficient funds | 200 from CMF | `false` | code: 2006 — show user-friendly message |
| Invalid amount | 200 from CMF | `false` | code: 1000 — validate amount before sending |
| Network timeout | Axios error | N/A | Retry with exponential backoff (max 3 retries) |

**Key rule**: HTTP 200 from CMF does not mean success. Always check `complete === true` before proceeding. The `CMFClient` methods throw on `complete === false`, so a `try/catch` is sufficient.

---

## State Machine (Frontend)

The OTP + customer search portion of the flow follows this state machine:

```
idle
  └─► [user enters email/phone] ─► sendOtp() ─► verifying
        └─► [user enters code] ─► verifyOtp() ─► done
              └─► [error] ─► retry (max 3 for phone)
```

Use the `useCMFOtp` hook, which manages this state internally via the `step` property:
- `step === 'idle'` — Show email/phone input
- `step === 'verify'` — Show OTP code input
- `step === 'done'` — OTP verified; proceed to product/quota selection
