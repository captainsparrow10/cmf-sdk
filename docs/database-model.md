# Database Model

## Why Store the CMF Link

CMF requires OTP verification to look up a customer's account for the first time. Storing the CMF customer and product identifiers in your own database means:

1. **No OTP on repeat checkouts** — the customer only verifies once per device/session.
2. **Faster checkout** — skip the customer search round-trip to CMF.
3. **Order correlation** — track which CMF transaction corresponds to which order.
4. **Fraud auditing** — full record of every CMF payment made by each customer.

---

## Sequelize Schema

```typescript
import { Model, DataTypes, Sequelize } from 'sequelize';

// ── CMF_INFO: Customer account link ──────────────────────────────────────────

export class CMFInfoModel extends Model {
  declare id: number;
  /** Your platform's internal customer ID */
  declare customerId: string;
  /** CMF's internal customer UUID (from CMFCustomerResponse.id) */
  declare cmfCustomerId: string;
  /** Customer's email registered in CMF (nullable — not all customers have email) */
  declare email: string | null;
  /** Customer's phone number registered in CMF (nullable) */
  declare phone: string | null;
  /** UUID of the customer's active CMF financing product */
  declare customerProductId: string;
  /** Encrypted account number (used in processPurchaseInQuotas) */
  declare accountNumber: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initCMFInfoModel(sequelize: Sequelize) {
  CMFInfoModel.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      customerId: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'Your internal customer ID — foreign key to your customers table',
      },
      cmfCustomerId: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'CMF internal UUID from CMFCustomerResponse.id',
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: true,
        unique: true,
        validate: { isEmail: true },
        comment: "Customer's registered CMF email — unique because CMF emails are one-to-one",
      },
      phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
        unique: true,
        comment: "Customer's registered CMF phone — unique per CMF account",
      },
      customerProductId: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'UUID from CMFProduct.customerProductId — used in getQuotas()',
      },
      accountNumber: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Encrypted account number from CMFProduct.productAccount — used in processPurchaseInQuotas()',
      },
    },
    {
      sequelize,
      tableName: 'CMFInfos',
      timestamps: true,
      indexes: [
        { fields: ['customerId'], unique: true },
        { fields: ['cmfCustomerId'] },
      ],
    },
  );
  return CMFInfoModel;
}

// ── CMF_TRANSACTIONS: Payment audit log ──────────────────────────────────────

export class CMFTransactionModel extends Model {
  declare id: number;
  /** Your internal order ID */
  declare orderId: string;
  /** Your internal customer ID */
  declare customerId: string;
  /** Merchant-generated receipt number sent to CMF */
  declare receiptNumber: string;
  /** CMF transaction code returned in CMFApiResponse.uniqueCode */
  declare cmfTransactionCode: string | null;
  /** Payment type */
  declare paymentType: 'quotas' | 'normal';
  /** Purchase amount in USD */
  declare amount: number;
  /** Number of installments (null for normal purchases) */
  declare loanTerm: number | null;
  /** Selected plan's uniqueCode (null for normal purchases) */
  declare planUniqueCode: string | null;
  /** Full CMF API response, stored as JSON for audit */
  declare cmfResponse: object;
  /** Whether the transaction was successfully verified */
  declare verified: boolean;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export function initCMFTransactionModel(sequelize: Sequelize) {
  CMFTransactionModel.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      orderId: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'Your internal order ID',
      },
      customerId: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: 'Your internal customer ID',
      },
      receiptNumber: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true,
        comment: 'Merchant-generated receipt number sent to CMF (alphanumeric, max 20 chars)',
      },
      cmfTransactionCode: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'CMF uniqueCode from CMFApiResponse — returned after successful payment',
      },
      paymentType: {
        type: DataTypes.ENUM('quotas', 'normal'),
        allowNull: false,
        comment: 'quotas = installment plan; normal = full charge',
      },
      amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Purchase amount in USD',
      },
      loanTerm: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Number of installments (null for normal purchases)',
      },
      planUniqueCode: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "CMFQuota.uniqueCode selected by the customer (null for normal purchases)",
      },
      cmfResponse: {
        type: DataTypes.JSONB,
        allowNull: false,
        comment: 'Full CMFApiResponse stored for audit and dispute resolution',
      },
      verified: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'True after verifyTransaction() confirms the transaction in CMF',
      },
    },
    {
      sequelize,
      tableName: 'CMFTransactions',
      timestamps: true,
      indexes: [
        { fields: ['orderId'] },
        { fields: ['customerId'] },
        { fields: ['receiptNumber'], unique: true },
        { fields: ['cmfTransactionCode'] },
      ],
    },
  );
  return CMFTransactionModel;
}
```

---

## SQL Migration

```sql
-- CMFInfos: Customer account link
CREATE TABLE "CMFInfos" (
  id              SERIAL PRIMARY KEY,
  "customerId"    VARCHAR(255) NOT NULL UNIQUE,
  "cmfCustomerId" VARCHAR(255) NOT NULL,
  email           VARCHAR(255) UNIQUE,
  phone           VARCHAR(20) UNIQUE,
  "customerProductId" VARCHAR(255) NOT NULL,
  "accountNumber" TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cmf_infos_cmf_customer_id ON "CMFInfos" ("cmfCustomerId");

-- CMFTransactions: Payment audit log
CREATE TABLE "CMFTransactions" (
  id                   SERIAL PRIMARY KEY,
  "orderId"            VARCHAR(255) NOT NULL,
  "customerId"         VARCHAR(255) NOT NULL,
  "receiptNumber"      VARCHAR(20) NOT NULL UNIQUE,
  "cmfTransactionCode" VARCHAR(255),
  "paymentType"        VARCHAR(10) NOT NULL CHECK ("paymentType" IN ('quotas', 'normal')),
  amount               DECIMAL(10, 2) NOT NULL,
  "loanTerm"           INTEGER,
  "planUniqueCode"     VARCHAR(255),
  "cmfResponse"        JSONB NOT NULL,
  verified             BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cmf_transactions_order_id    ON "CMFTransactions" ("orderId");
CREATE INDEX idx_cmf_transactions_customer_id ON "CMFTransactions" ("customerId");
CREATE INDEX idx_cmf_transactions_code        ON "CMFTransactions" ("cmfTransactionCode");
```

---

## Field Explanations

### CMFInfos

| Field | Source | Usage |
|---|---|---|
| `customerId` | Your system | Links to your customers table |
| `cmfCustomerId` | `CMFCustomerResponse.id` | Used in `getCustomerProducts(cmfCustomerId)` |
| `email` | `CMFCustomerResponse.email` | Used in `sendOtpByEmail()` / `verifyOtpByEmail()` |
| `phone` | `CMFCustomerResponse.phone` | Used in `sendOtpByPhone()` / `verifyOtpByPhone()` |
| `customerProductId` | `CMFProduct.customerProductId` | Used in `getQuotas(customerProductId, amount)` |
| `accountNumber` | `CMFAccountCard.account` (encrypted) | Used as `AccountNumber` in `processPurchaseInQuotas()` |

### CMFTransactions

| Field | Source | Usage |
|---|---|---|
| `receiptNumber` | Generated by your system | Correlates your order with CMF record; used in `verifyTransaction()` |
| `cmfTransactionCode` | `CMFApiResponse.uniqueCode` | CMF's internal reference number |
| `paymentType` | Request `mode` | Distinguishes installment from full charge |
| `loanTerm` | `CMFQuota.loanTerm` | Number of months for installment |
| `planUniqueCode` | `CMFQuota.uniqueCode` | Which plan was selected |
| `cmfResponse` | `CMFApiResponse` (full) | Audit trail; useful for dispute resolution with Banco General |
| `verified` | `verifyTransaction()` result | Confirms transaction was recorded before fulfilling order |

---

## Receipt Number Generation

CMF receipt numbers must be:
- Alphanumeric only
- Maximum 20 characters
- Unique per transaction

Recommended approach:

```typescript
/**
 * Generate a unique CMF receipt number from an order ID.
 * Truncates to 20 characters to comply with CMF requirements.
 */
function generateReceiptNumber(orderId: string): string {
  const timestamp = Date.now().toString(36).toUpperCase(); // e.g. 'LR8N5K'
  const raw = `ORD${orderId}${timestamp}`.replace(/[^A-Z0-9]/gi, '');
  return raw.slice(0, 20);
}
```

Store the generated receipt number in `CMFTransactions.receiptNumber` before calling the CMF API.

---

## Upsert Pattern

When a customer re-links their CMF account (e.g. they changed their phone), use upsert to avoid duplicate records:

```typescript
async function upsertCMFInfo(data: {
  customerId: string;
  cmfCustomerId: string;
  email: string | null;
  phone: string | null;
  customerProductId: string;
  accountNumber: string | null;
}) {
  const existing = await CMFInfoModel.findOne({
    where: { customerId: data.customerId },
  });

  if (existing) {
    await existing.update(data);
    return existing;
  }

  return CMFInfoModel.create(data);
}
```
