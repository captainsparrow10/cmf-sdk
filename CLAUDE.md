# @panama-payments/cmf

SDK de TypeScript para integrar financiamiento CMF (HNL / Banco General) en aplicaciones Node.js y React. Open source — parte del proyecto [panama-payments](https://github.com/captainsparrow10).

## Comandos

```bash
npm install              # Instalar dependencias
npm run typecheck        # Verificar tipos (SIEMPRE antes de commit)
npm run build            # Compilar TypeScript → dist/
```

## Arquitectura

Dos subpath exports — nunca mezclar:

| Import | Entorno | Contiene |
|--------|---------|----------|
| `@panama-payments/cmf/server` | Node.js only | `CMFClient`, tipos, enums |
| `@panama-payments/cmf/react` | React (browser) | hooks headless, `CMFPaymentForm` |

```
src/
├── types.ts                    # Todos los tipos, enums, interfaces
├── server/
│   ├── CMFClient.ts            # Axios wrapper hacia API de CMF (server-only)
│   └── index.ts
└── react/
    ├── hooks/
    │   ├── useCMFCustomer.ts   # Busca cliente por documento
    │   ├── useCMFQuotas.ts     # Simula planes de financiamiento
    │   ├── useCMFOtp.ts        # Flujo OTP (email o WhatsApp)
    │   └── useCMFPayment.ts    # Ejecuta el pago
    ├── components/
    │   └── CMFPaymentForm.tsx  # Componente UI completo (opcional)
    └── index.ts
examples/
├── express/                    # Proxy routes para Express
└── nextjs/                     # App Router routes + checkout page
docs/                           # getting-started, flow, integration-guide, api-reference, env-vars, database-model
```

## Flujo de compra en cuotas

1. `login()` → JWT (gestionado internamente por `CMFClient`)
2. `getCustomerByDocument(docType, docNumber)` → `customerId`
3. `getCustomerProducts(customerId)` → `customerProductId` + `accountNumber` (encriptado)
4. `getQuotas(customerProductId, amount)` → planes con `uniqueCode`
5. `sendOtpByEmail/Phone()` → `verifyOtpByEmail/Phone()`
6. `processPurchaseInQuotas({ AccountNumber, UniqueCode, Mto, ReceiptNumber, ... })`
7. `verifyTransaction(receiptNumber)` → confirmar

## Reglas críticas

- **server-only**: `CMFClient` nunca va al browser. Credenciales (`CMF_EMAIL`, `CMF_PASSWORD`) son server-only.
- **HTTP 200 ≠ éxito**: Siempre verificar `response.complete === true`. Errores llegan en `status_result`.
- **Enums no cambiar**: `CMFDocumentType` usa UUIDs de Banco General — son fijos.
- **Imports ESM**: Usar extensión `.js` en todos los imports internos (ej: `from './CMFClient.js'`).
- **Hooks headless**: No agregar JSX ni HTML a hooks. Solo estado y callbacks.
- **OTP por teléfono**: Múltiples intentos fallidos bloquean el número en el proveedor. Limitar a 3 intentos.
- **TypeScript strict**: Correr `npm run typecheck` antes de cualquier commit.

## Variables de entorno (server-only)

| Variable | Descripción |
|----------|-------------|
| `CMF_URL` | URL base de la API (QA o producción — provista por Banco General) |
| `CMF_EMAIL` | Email del merchant en el portal CMF |
| `CMF_PASSWORD` | Password del merchant |
| `CMF_BRANCH_OFFICE_CODE` | Código de sucursal asignado por CMF |
| `CMF_COMPANY_CODE` | Código de empresa asignado por CMF |

Ver `docs/env-vars.md` para detalles completos.

## Documentación

- `docs/getting-started.md` — Prerrequisitos y cómo obtener credenciales
- `docs/flow.md` — Diagramas Mermaid de los flujos de pago
- `docs/integration-guide.md` — 5 casos de uso con curl + TypeScript
- `docs/api-reference.md` — Referencia completa de métodos y tipos
- `docs/env-vars.md` — Variables de entorno con ejemplos
- `docs/database-model.md` — Schema de Sequelize/Prisma para persistir datos CMF
