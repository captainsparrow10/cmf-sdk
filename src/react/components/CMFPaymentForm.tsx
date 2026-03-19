/**
 * @module CMFPaymentForm
 *
 * Componente React que implementa el flujo completo de pago con CMF.
 *
 * ## Diseño headless (sin UI propia)
 *
 * Este componente usa HTML semántico estándar con `className` en cada elemento
 * para que el integrador pueda estilizarlo con cualquier framework (Tailwind,
 * CSS Modules, styled-components, etc.).
 *
 * NO importa ninguna librería de UI externa. El componente es funcional sin estilos.
 *
 * ## Flujo que implementa
 *
 * 1. **Búsqueda**: El usuario ingresa su email o teléfono registrado en CMF
 * 2. **OTP**: CMF envía un código de verificación al canal elegido
 * 3. **Verificación**: El usuario ingresa el código para confirmar su identidad
 * 4. **Tarjeta**: Se muestran las tarjetas CMF del cliente
 * 5. **Cuotas**: El usuario selecciona el plan de pago (cuotas o pago único)
 * 6. **Pago**: Se procesa el pago con CMF
 *
 * ## Uso mínimo
 *
 * ```tsx
 * import { CMFPaymentForm } from 'cmf-sdk/react';
 *
 * <CMFPaymentForm
 *   apiBase="/api/cmf"
 *   total={150.00}
 *   userName="Juan Pérez"
 *   description="Compra en Mi Tienda"
 *   onSuccess={(receiptNumber) => {
 *     router.push(`/confirmation/${receiptNumber}`);
 *   }}
 * />
 * ```
 *
 * ## Estilizar con Tailwind
 *
 * Cada elemento tiene un `className` con prefijo `cmf-` que puedes sobreescribir
 * con `classNames` prop, o agregar clases con los `className` de cada sección.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useCMFCustomer } from '../hooks/useCMFCustomer';
import { useCMFOtp } from '../hooks/useCMFOtp';
import { useCMFQuotas } from '../hooks/useCMFQuotas';
import { useCMFPayment } from '../hooks/useCMFPayment';
import type { CMFCustomerWithProducts, CMFSimulatorResponse } from '../../types';

/**
 * Props del componente `CMFPaymentForm`.
 */
export interface CMFPaymentFormProps {
  /**
   * URL base del proxy backend que expone los endpoints de CMF.
   * Ejemplo: '/api/cmf' o 'https://mi-servidor.com/api/cmf'
   *
   * El proxy debe implementar:
   * - `POST /customer` — buscar cliente y solicitar OTP
   * - `POST /otp/request` — solicitar OTP
   * - `POST /otp/verify` — verificar OTP y retornar tarjetas
   * - `POST /quotas` — obtener planes de cuotas
   * - `POST /payment/installment` — pago en cuotas
   * - `POST /payment/normal` — pago normal
   */
  apiBase: string;

  /**
   * Monto total del pedido en USD.
   * Se usa para calcular los planes de cuotas disponibles.
   */
  total: number;

  /**
   * Nombre del usuario final (cliente del comercio).
   * Se incluye en las transacciones CMF.
   */
  userName: string;

  /**
   * Descripción de la compra que aparece en el email de confirmación de CMF.
   * Ejemplo: 'Compra en Mi Tienda - Orden #12345'
   */
  description: string;

  /**
   * Callback llamado cuando el pago se procesa exitosamente.
   * Recibe el número de recibo único de CMF para guardar en tu base de datos.
   *
   * @param receiptNumber - ID único de la transacción generado por CMF
   */
  onSuccess: (receiptNumber: string) => void;

  /**
   * Callback opcional llamado cuando ocurre un error en cualquier paso del flujo.
   * Si no se provee, los errores solo se muestran en el UI del componente.
   *
   * @param error - Mensaje de error legible para el usuario
   */
  onError?: (error: string) => void;

  /**
   * Clase CSS adicional para el contenedor raíz del componente.
   * Permite aplicar estilos externos sin sobreescribir la estructura interna.
   */
  className?: string;
}

/** Pasos internos del formulario de pago CMF */
type FormStep = 'search' | 'otp' | 'cards' | 'quotas' | 'paying' | 'success';

/**
 * Componente de flujo completo de pago con CMF.
 *
 * Implementa todos los pasos necesarios para que un cliente pague
 * usando su tarjeta CMF, incluyendo verificación de identidad por OTP.
 *
 * El componente es totalmente stateful — no necesita ningún store externo.
 * Para integración con Zustand u otro gestor de estado, usa los hooks
 * individuales (`useCMFCustomer`, `useCMFOtp`, `useCMFQuotas`, `useCMFPayment`).
 *
 * @example
 * // Uso básico en un checkout
 * function CheckoutPage() {
 *   const total = useCartTotal();
 *
 *   return (
 *     <div className="payment-section">
 *       <h2>Pagar con CMF</h2>
 *       <CMFPaymentForm
 *         apiBase="/api/cmf"
 *         total={total}
 *         userName={user.name}
 *         description={`Orden #${orderId}`}
 *         onSuccess={(receiptNumber) => {
 *           // Confirmar la orden en tu backend con el receiptNumber
 *           confirmOrder(orderId, { cmfReceiptNumber: receiptNumber });
 *         }}
 *         onError={(msg) => toast.error(msg)}
 *         className="mt-4 rounded-lg border p-6"
 *       />
 *     </div>
 *   );
 * }
 */
export function CMFPaymentForm({
  apiBase,
  total,
  userName,
  description,
  onSuccess,
  onError,
  className = '',
}: CMFPaymentFormProps) {
  const hookConfig = { apiBase };

  const [step, setStep] = useState<FormStep>('search');
  const [activeChannel, setActiveChannel] = useState<'email' | 'phone'>('email');
  const [customerTarget, setCustomerTarget] = useState<string>('');
  const [customerCards, setCustomerCards] = useState<CMFCustomerWithProducts[]>([]);
  const [selectedCard, setSelectedCard] = useState<CMFCustomerWithProducts | null>(null);

  const customer = useCMFCustomer(hookConfig);
  const otp = useCMFOtp(hookConfig);
  const quotas = useCMFQuotas(hookConfig);
  const payment = useCMFPayment(hookConfig);

  // Cuando se selecciona una tarjeta, cargar sus cuotas automáticamente
  useEffect(() => {
    if (selectedCard && total > 0) {
      quotas.fetchQuotas(selectedCard.customerInfo.customerProductId, total);
      setStep('quotas');
    }
  }, [selectedCard]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSendOtp = useCallback(async () => {
    const target = activeChannel === 'email' ? customer.email : customer.phone;
    if (!target.trim()) return;

    setCustomerTarget(target);
    const sent = await otp.sendOtp({ channel: activeChannel, target });
    if (sent) {
      setStep('otp');
    } else if (otp.error) {
      onError?.(otp.error);
    }
  }, [activeChannel, customer.email, customer.phone, otp, onError]);

  const handleVerifyOtp = useCallback(async () => {
    const cards = await otp.verifyOtp({
      channel: activeChannel,
      target: customerTarget,
      code: otp.otpCode,
      orderAmount: total,
    });

    if (cards && cards.length > 0) {
      setCustomerCards(cards);
      setStep(cards.length === 1 ? 'quotas' : 'cards');
      if (cards.length === 1) {
        setSelectedCard(cards[0]);
      }
    } else if (otp.error) {
      onError?.(otp.error);
    }
  }, [activeChannel, customerTarget, otp, total, onError]);

  const handleSelectCard = useCallback((card: CMFCustomerWithProducts) => {
    setSelectedCard(card);
    // useEffect arriba maneja la carga de cuotas
  }, []);

  const handlePay = useCallback(async () => {
    if (!selectedCard || !quotas.selectedQuota) return;

    setStep('paying');
    const isNormalPayment = quotas.selectedQuota.uniqueCode === 'normal-payment';

    const result = await payment.processPayment(
      isNormalPayment
        ? {
            type: 'normal',
            card: selectedCard.customerInfo.card,
            amount: total,
            userName,
            description,
          }
        : {
            type: 'installment',
            accountNumber: selectedCard.customerInfo.accountNumber,
            card: selectedCard.customerInfo.card,
            uniqueCode: quotas.selectedQuota.uniqueCode,
            amount: total,
            userName,
            description,
          }
    );

    if (result?.success) {
      setStep('success');
      onSuccess(result.receiptNumber);
    } else {
      setStep('quotas');
      const errorMsg = payment.error || 'Error al procesar el pago';
      onError?.(errorMsg);
    }
  }, [selectedCard, quotas.selectedQuota, payment, total, userName, description, onSuccess, onError]);

  // -------------------------------------------------------------------------
  // Render: Búsqueda de usuario
  // -------------------------------------------------------------------------
  if (step === 'search') {
    return (
      <div className={`cmf-payment-form cmf-step-search ${className}`}>
        <h3 className="cmf-title">Pagar con CMF</h3>
        <p className="cmf-subtitle">
          Ingresa el email o teléfono registrado en tu cuenta CMF para continuar.
        </p>

        {/* Selector de canal */}
        <div className="cmf-channel-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={activeChannel === 'email'}
            className={`cmf-tab ${activeChannel === 'email' ? 'cmf-tab--active' : ''}`}
            onClick={() => setActiveChannel('email')}
          >
            Correo electrónico
          </button>
          <button
            role="tab"
            aria-selected={activeChannel === 'phone'}
            className={`cmf-tab ${activeChannel === 'phone' ? 'cmf-tab--active' : ''}`}
            onClick={() => setActiveChannel('phone')}
          >
            Teléfono (WhatsApp)
          </button>
        </div>

        {/* Input de email */}
        {activeChannel === 'email' && (
          <div className="cmf-field">
            <label htmlFor="cmf-email" className="cmf-label">
              Correo electrónico
            </label>
            <input
              id="cmf-email"
              type="email"
              className="cmf-input"
              placeholder="usuario@gmail.com"
              value={customer.email}
              onChange={(e) => customer.setEmail(e.target.value)}
              disabled={customer.isSearching || otp.isSending}
              autoComplete="email"
            />
          </div>
        )}

        {/* Input de teléfono */}
        {activeChannel === 'phone' && (
          <div className="cmf-field">
            <label htmlFor="cmf-phone" className="cmf-label">
              Teléfono (8 dígitos, sin +507)
            </label>
            <input
              id="cmf-phone"
              type="tel"
              className="cmf-input"
              placeholder="61234567"
              value={customer.phone}
              onChange={(e) =>
                customer.setPhone(e.target.value.replace(/\D/g, '').slice(0, 8))
              }
              maxLength={8}
              disabled={customer.isSearching || otp.isSending}
              autoComplete="tel"
            />
          </div>
        )}

        {/* Error */}
        {(customer.error || otp.error) && (
          <p className="cmf-error" role="alert">
            {customer.error || otp.error}
          </p>
        )}

        {/* Botón enviar */}
        <button
          className="cmf-button cmf-button--primary"
          onClick={handleSendOtp}
          disabled={
            customer.isSearching ||
            otp.isSending ||
            (activeChannel === 'email' ? !customer.email : !customer.phone)
          }
        >
          {otp.isSending ? 'Enviando código...' : 'Enviar código de verificación'}
        </button>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: Verificación OTP
  // -------------------------------------------------------------------------
  if (step === 'otp') {
    return (
      <div className={`cmf-payment-form cmf-step-otp ${className}`}>
        <h3 className="cmf-title">Verificación de identidad</h3>

        {otp.message && (
          <div className="cmf-info-box" role="status">
            <p>{otp.message}</p>
          </div>
        )}

        <div className="cmf-field">
          <label htmlFor="cmf-otp-code" className="cmf-label">
            Código de verificación
          </label>
          <input
            id="cmf-otp-code"
            type="text"
            inputMode="numeric"
            className="cmf-input cmf-input--otp"
            placeholder="000000"
            value={otp.otpCode}
            onChange={(e) => otp.setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            maxLength={6}
            autoComplete="one-time-code"
            disabled={otp.isVerifying}
          />
        </div>

        {otp.error && (
          <p className="cmf-error" role="alert">
            {otp.error}
          </p>
        )}

        <div className="cmf-button-group">
          <button
            className="cmf-button cmf-button--secondary"
            onClick={() => {
              otp.reset();
              setStep('search');
            }}
          >
            Cancelar
          </button>
          <button
            className="cmf-button cmf-button--primary"
            onClick={handleVerifyOtp}
            disabled={otp.isVerifying || otp.otpCode.length < 4}
          >
            {otp.isVerifying ? 'Verificando...' : 'Verificar código'}
          </button>
        </div>

        <div className="cmf-resend">
          <button
            className="cmf-link"
            onClick={() =>
              otp.sendOtp({ channel: activeChannel, target: customerTarget })
            }
            disabled={otp.isSending}
          >
            ¿No recibiste el código? Reenviar
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: Selección de tarjeta
  // -------------------------------------------------------------------------
  if (step === 'cards') {
    return (
      <div className={`cmf-payment-form cmf-step-cards ${className}`}>
        <h3 className="cmf-title">Selecciona tu tarjeta CMF</h3>
        <p className="cmf-subtitle">
          Elige la tarjeta con la que deseas pagar.
        </p>

        <ul className="cmf-card-list" role="listbox" aria-label="Tarjetas CMF disponibles">
          {customerCards.map((cardData, index) => (
            <li key={index} role="option" aria-selected={selectedCard === cardData}>
              <button
                className="cmf-card-item"
                onClick={() => handleSelectCard(cardData)}
              >
                <span className="cmf-card-name">
                  {cardData.customerInfo.cardDecrypted || 'Tarjeta CMF'}
                </span>
                <span className="cmf-card-product">
                  {cardData.customerInfo.productName}
                </span>
                <span className="cmf-card-quotas">
                  {cardData.quotas.length} planes disponibles
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: Selección de cuota
  // -------------------------------------------------------------------------
  if (step === 'quotas') {
    /** Cuota especial para indicar pago completo sin financiamiento */
    const normalPaymentQuota: CMFSimulatorResponse = {
      customerProductId: selectedCard?.customerInfo.customerProductId || '',
      uniqueCode: 'normal-payment',
      descriptionPlan: 'Pago completo',
      interestDescription: null,
      fixedRateLoanId: 'normal',
      loanTerm: 1,
      effectiveInterestPct: 0,
      downPayment: 0,
      productPrice: total,
      frequencyType: 'Pago único',
      totalCreditAmount: total,
      pendingTotalCreditAmount: null,
      requestedAmount: total,
      interestAmount: 0,
      totalInterestSum: 0,
      interestPct: 0,
      monthlyQuota: total,
      annualEffectiveRate: 0,
      totalInterest: null,
      capitalValue: total,
      paidAmount: 0,
      balanceAmount: total,
      startDate: new Date().toISOString(),
      finishDate: null,
      lastModifiedDate: new Date().toISOString(),
      downPaymentPercentage: 0,
    };

    const allOptions = [normalPaymentQuota, ...quotas.quotas];

    return (
      <div className={`cmf-payment-form cmf-step-quotas ${className}`}>
        <h3 className="cmf-title">Elige tu plan de pago</h3>

        {customerCards.length > 1 && (
          <button
            className="cmf-link"
            onClick={() => {
              setSelectedCard(null);
              quotas.clearQuotas();
              setStep('cards');
            }}
          >
            ← Ver todas las tarjetas
          </button>
        )}

        {selectedCard && (
          <p className="cmf-selected-card">
            Tarjeta: <strong>{selectedCard.customerInfo.cardDecrypted}</strong>
          </p>
        )}

        {quotas.isLoading ? (
          <p className="cmf-loading" role="status">Cargando planes de pago...</p>
        ) : (
          <ul className="cmf-quota-list" role="listbox" aria-label="Planes de pago disponibles">
            {allOptions.map((quota) => (
              <li
                key={quota.uniqueCode}
                role="option"
                aria-selected={quotas.selectedQuota?.uniqueCode === quota.uniqueCode}
              >
                <button
                  className={`cmf-quota-item ${
                    quotas.selectedQuota?.uniqueCode === quota.uniqueCode
                      ? 'cmf-quota-item--selected'
                      : ''
                  }`}
                  onClick={() => quotas.selectQuota(quota)}
                >
                  {quota.uniqueCode === 'normal-payment' ? (
                    <>
                      <span className="cmf-quota-term">Pago completo</span>
                      <span className="cmf-quota-amount">
                        ${total.toFixed(2)}
                      </span>
                      <span className="cmf-quota-interest">Sin intereses</span>
                    </>
                  ) : (
                    <>
                      <span className="cmf-quota-term">{quota.loanTerm} cuotas</span>
                      <span className="cmf-quota-amount">
                        ${quota.monthlyQuota.toFixed(2)}/mes
                      </span>
                      <span className="cmf-quota-interest">
                        {quota.effectiveInterestPct > 0
                          ? `${quota.effectiveInterestPct}% efectivo anual`
                          : 'Sin intereses'}
                      </span>
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {quotas.selectedQuota && (
          <div className="cmf-quota-summary">
            <p>
              <strong>Plan seleccionado:</strong>{' '}
              {quotas.selectedQuota.uniqueCode === 'normal-payment'
                ? `Pago completo de $${total.toFixed(2)}`
                : `${quotas.selectedQuota.loanTerm} cuotas de $${quotas.selectedQuota.monthlyQuota.toFixed(2)}`}
            </p>
            {quotas.selectedQuota.uniqueCode !== 'normal-payment' && (
              <p>
                <strong>Total a pagar:</strong>{' '}
                ${quotas.selectedQuota.totalCreditAmount.toFixed(2)}
              </p>
            )}
          </div>
        )}

        {payment.error && (
          <p className="cmf-error" role="alert">
            {payment.error}
          </p>
        )}

        <button
          className="cmf-button cmf-button--primary"
          onClick={handlePay}
          disabled={!quotas.selectedQuota || payment.isProcessing}
        >
          {payment.isProcessing
            ? 'Procesando pago...'
            : `Pagar con CMF`}
        </button>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: Procesando pago
  // -------------------------------------------------------------------------
  if (step === 'paying') {
    return (
      <div className={`cmf-payment-form cmf-step-paying ${className}`}>
        <p className="cmf-loading" role="status" aria-live="polite">
          Procesando tu pago con CMF...
        </p>
        <p className="cmf-loading-sub">
          Por favor no cierres ni recargues esta página.
        </p>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: Pago exitoso
  // -------------------------------------------------------------------------
  if (step === 'success') {
    return (
      <div className={`cmf-payment-form cmf-step-success ${className}`}>
        <h3 className="cmf-title">¡Pago exitoso!</h3>
        <p className="cmf-subtitle">
          Tu pago con CMF fue procesado correctamente.
          Recibirás un email de confirmación de CMF.
        </p>
        {payment.result?.receiptNumber && (
          <p className="cmf-receipt">
            Número de recibo: <strong>{payment.result.receiptNumber}</strong>
          </p>
        )}
      </div>
    );
  }

  return null;
}
