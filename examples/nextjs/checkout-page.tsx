/**
 * @file examples/nextjs/checkout-page.tsx
 *
 * Ejemplo de uso de los hooks del SDK en un componente de checkout Next.js.
 *
 * Muestra cómo usar los hooks individuales para construir un flujo
 * de pago CMF completamente personalizado con tu propia UI.
 *
 * Si prefieres usar el componente ya construido, usa `CMFPaymentForm`:
 * ```tsx
 * import { CMFPaymentForm } from 'cmf-sdk/react';
 * <CMFPaymentForm apiBase="/api/cmf" total={150} ... />
 * ```
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useCMFCustomer } from 'cmf-sdk/react';
import { useCMFOtp } from 'cmf-sdk/react';
import { useCMFQuotas } from 'cmf-sdk/react';
import { useCMFPayment } from 'cmf-sdk/react';
import { CMFDocumentType } from 'cmf-sdk/react';
import type { CMFProduct, CMFQuota } from 'cmf-sdk/react';

/**
 * Ejemplo de página de checkout con pago CMF.
 * Adapta este componente a tu diseño — aquí solo se muestra la lógica.
 */
export default function CMFCheckoutExample() {
  // ── Estado local del flujo ─────────────────────────────────────────────
  const [step, setStep] = useState<'customer' | 'otp' | 'quotas' | 'done'>('customer');
  const [selectedProduct, setSelectedProduct] = useState<CMFProduct | null>(null);
  const [selectedQuota, setSelectedQuota] = useState<CMFQuota | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [docNumber, setDocNumber] = useState('');

  const ORDER_TOTAL = 150.00;
  const USER_NAME = 'Usuario Ejemplo';

  // ── Hooks del SDK ──────────────────────────────────────────────────────
  const customerHook = useCMFCustomer({ endpoint: '/api/cmf/customer' });
  const quotasHook = useCMFQuotas({ endpoint: '/api/cmf/quotas' });
  const paymentHook = useCMFPayment({ endpoint: '/api/cmf/payment' });

  // useCMFOtp y el resto de hooks aún están disponibles para OTP personalizado
  // const otpHook = useCMFOtp({ endpoint: '/api/cmf/otp' });

  // ── Paso 1: Buscar cliente por cédula ─────────────────────────────────
  const handleSearchCustomer = async () => {
    await customerHook.search(CMFDocumentType.Cedula, docNumber);
  };

  // Avanzar al siguiente paso cuando se encuentra el cliente
  useEffect(() => {
    if (customerHook.customer && customerHook.products.length > 0) {
      // Si tiene un solo producto, seleccionarlo automáticamente
      if (customerHook.products.length === 1) {
        setSelectedProduct(customerHook.products[0]);
      }
      setStep('otp');
    }
  }, [customerHook.customer, customerHook.products]);

  // ── Paso 2: Cargar cuotas al seleccionar producto ─────────────────────
  useEffect(() => {
    if (selectedProduct && ORDER_TOTAL > 0) {
      quotasHook.getQuotas(selectedProduct.customerProductId, ORDER_TOTAL);
    }
  }, [selectedProduct]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Paso 3: Procesar el pago ───────────────────────────────────────────
  const handlePay = async () => {
    if (!selectedProduct || !selectedQuota) return;

    const card = selectedProduct.customerAccountCards[0];

    const isNormalPayment = selectedQuota.uniqueCode === 'normal-payment';

    await paymentHook.processPayment({
      type: isNormalPayment ? 'normal' : 'installment',
      // Para pago en cuotas:
      ...(isNormalPayment
        ? { card: card.card }
        : {
            accountNumber: card.account,
            card: card.card,
            uniqueCode: selectedQuota.uniqueCode,
          }),
      amount: ORDER_TOTAL,
      userName: USER_NAME,
      description: 'Compra de ejemplo',
    } as any);
  };

  useEffect(() => {
    if (paymentHook.result?.success) {
      setStep('done');
    }
  }, [paymentHook.result]);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 24 }}>
      <h1>Pagar con CMF</h1>
      <p>Total: ${ORDER_TOTAL.toFixed(2)}</p>

      {/* ── Paso 1: Buscar cliente ─────────────────────────────────── */}
      {step === 'customer' && (
        <section>
          <h2>Ingresa tu cédula CMF</h2>
          <label htmlFor="doc-number">Número de cédula</label>
          <input
            id="doc-number"
            type="text"
            value={docNumber}
            onChange={(e) => setDocNumber(e.target.value)}
            placeholder="8-123-456"
          />
          <button
            onClick={handleSearchCustomer}
            disabled={customerHook.isLoading || !docNumber}
          >
            {customerHook.isLoading ? 'Buscando...' : 'Continuar'}
          </button>
          {customerHook.error && (
            <p style={{ color: 'red' }}>{customerHook.error}</p>
          )}
        </section>
      )}

      {/* ── Paso 2: Seleccionar producto y cuota ───────────────────── */}
      {step === 'otp' && customerHook.products.length > 0 && (
        <section>
          <h2>Selecciona tu tarjeta CMF</h2>

          {/* Selector de producto (si tiene más de uno) */}
          {customerHook.products.length > 1 && (
            <div>
              {customerHook.products.map((product) => (
                <button
                  key={product.customerProductId}
                  onClick={() => setSelectedProduct(product)}
                  style={{
                    fontWeight: selectedProduct?.customerProductId === product.customerProductId
                      ? 'bold' : 'normal',
                  }}
                >
                  {product.productName} — {product.customerAccountCards[0]?.maskedCard}
                </button>
              ))}
            </div>
          )}

          {/* Mostrar cuotas cuando hay un producto seleccionado */}
          {selectedProduct && (
            <div>
              <h3>Planes de pago disponibles</h3>
              {quotasHook.isLoading && <p>Cargando planes...</p>}
              {quotasHook.error && <p style={{ color: 'red' }}>{quotasHook.error}</p>}

              {/* Opción de pago completo */}
              <button
                onClick={() => setSelectedQuota({ uniqueCode: 'normal-payment' } as any)}
                style={{ fontWeight: selectedQuota?.uniqueCode === 'normal-payment' ? 'bold' : 'normal' }}
              >
                Pago completo — ${ORDER_TOTAL.toFixed(2)}
              </button>

              {/* Planes de cuotas */}
              {quotasHook.quotas
                .sort((a, b) => a.loanTerm - b.loanTerm)
                .map((quota) => (
                  <button
                    key={quota.uniqueCode}
                    onClick={() => setSelectedQuota(quota)}
                    style={{ fontWeight: selectedQuota?.uniqueCode === quota.uniqueCode ? 'bold' : 'normal' }}
                  >
                    {quota.loanTerm} cuotas × ${quota.monthlyQuota.toFixed(2)}
                    {quota.effectiveInterestPct > 0
                      ? ` (${quota.effectiveInterestPct}% anual)`
                      : ' (sin interés)'}
                  </button>
                ))}
            </div>
          )}

          {selectedQuota && (
            <div>
              <h3>Resumen</h3>
              <p>
                {selectedQuota.uniqueCode === 'normal-payment'
                  ? `Pago completo: $${ORDER_TOTAL.toFixed(2)}`
                  : `${selectedQuota.loanTerm} cuotas × $${selectedQuota.monthlyQuota.toFixed(2)}`}
              </p>

              <button
                onClick={handlePay}
                disabled={paymentHook.isProcessing}
              >
                {paymentHook.isProcessing ? 'Procesando...' : 'Pagar con CMF'}
              </button>
              {paymentHook.error && (
                <p style={{ color: 'red' }}>{paymentHook.error}</p>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── Paso 3: Confirmación ───────────────────────────────────── */}
      {step === 'done' && (
        <section>
          <h2>✅ Pago exitoso</h2>
          <p>Tu pago con CMF fue procesado correctamente.</p>
          <p>Recibirás un email de confirmación de CMF.</p>
          {paymentHook.result?.receiptNumber && (
            <p>
              Número de recibo: <strong>{paymentHook.result.receiptNumber}</strong>
            </p>
          )}
        </section>
      )}
    </div>
  );
}
