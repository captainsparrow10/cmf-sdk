/**
 * @file examples/nextjs/api/cmf/payment/route.ts
 *
 * Next.js App Router: API Route para procesar pagos con CMF.
 *
 * POST /api/cmf/payment?type=installment  — Pago en cuotas
 * POST /api/cmf/payment?type=normal       — Pago normal (sin cuotas)
 *
 * Ambos endpoints requieren autenticación del usuario (verificar sesión
 * con tu sistema de auth antes de procesar el pago).
 */

import { NextRequest, NextResponse } from 'next/server';
import { CMFClient } from 'cmf-sdk/server';

const cmf = new CMFClient({
  baseUrl: process.env.CMF_URL!,
  email: process.env.CMF_EMAIL!,
  password: process.env.CMF_PASSWORD!,
  branchOfficeCode: process.env.CMF_BRANCH_OFFICE_CODE!,
  companyCode: process.env.CMF_COMPANY_CODE!,
  userName: process.env.CMF_USER_NAME!,
});

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');

  try {
    const body = await req.json();
    await cmf.ensureAuthenticated();

    // ── Pago en cuotas ─────────────────────────────────────────────────────
    if (type === 'installment') {
      const { accountNumber, card, uniqueCode, amount, userName, description } = body;

      if (!accountNumber || !card || !uniqueCode || !amount || !userName) {
        return NextResponse.json(
          { success: false, message: 'Faltan campos: accountNumber, card, uniqueCode, amount, userName' },
          { status: 400 }
        );
      }

      // Generar un número de recibo único para esta transacción
      const receiptNumber = `ORD${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

      const result = await cmf.processPurchaseInQuotas({
        AccountNumber: accountNumber,
        UniqueCode: uniqueCode,
        Mto: parseFloat(amount),
        BranchOfficeCode: process.env.CMF_BRANCH_OFFICE_CODE!,
        CreatedBy: process.env.CMF_USER_NAME!,
        CompanyCode: process.env.CMF_COMPANY_CODE!,
        ReceiptNumber: receiptNumber,
        Description: description || 'Compra en línea',
        UserName: userName,
        Card: card,
      });

      // Aquí guardarías el receiptNumber en tu base de datos:
      // await db.orders.update({ cmfReceiptNumber: receiptNumber }, { where: { id: orderId } });

      return NextResponse.json({
        success: true,
        receiptNumber,
        message: 'Pago en cuotas procesado exitosamente',
      });
    }

    // ── Pago normal (sin cuotas) ───────────────────────────────────────────
    if (type === 'normal') {
      const { card, amount, userName, description } = body;

      if (!card || !amount || !userName) {
        return NextResponse.json(
          { success: false, message: 'Faltan campos: card, amount, userName' },
          { status: 400 }
        );
      }

      const receiptNumber = `ORD${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

      await cmf.processNormalPurchase({
        BranchOfficeCode: process.env.CMF_BRANCH_OFFICE_CODE!,
        CreatedBy: process.env.CMF_USER_NAME!,
        CompanyCode: process.env.CMF_COMPANY_CODE!,
        CardNumber: card,
        MtoTran: parseFloat(amount),
        ReceiptNumber: receiptNumber,
        Description: description || 'Compra en línea',
        UserName: userName,
        MovementType: 2,
        PaymentCashAmount: 0,
        WithdrawalFee: 0,
        Itbms: 0,
      });

      return NextResponse.json({
        success: true,
        receiptNumber,
        message: 'Pago procesado exitosamente',
      });
    }

    return NextResponse.json(
      { success: false, message: "Tipo inválido. Usa ?type=installment o ?type=normal" },
      { status: 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al procesar el pago';
    // Código 402 para errores del core bancario (fondos insuficientes, etc.)
    const status = message.includes('code 2006') ? 402 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
