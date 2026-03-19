/**
 * @file examples/nextjs/api/cmf/otp/route.ts
 *
 * Next.js App Router: API Route para solicitar y verificar OTP de CMF.
 *
 * POST /api/cmf/otp?action=request  — Enviar código OTP
 * POST /api/cmf/otp?action=verify   — Verificar código OTP
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
  const action = searchParams.get('action');

  try {
    const body = await req.json();
    await cmf.ensureAuthenticated();

    // ── Solicitar OTP ──────────────────────────────────────────────────────
    if (action === 'request') {
      const { channel, email, phone } = body;

      if (channel === 'email' && email) {
        await cmf.sendOtpByEmail(email);
        return NextResponse.json({
          success: true,
          channel: 'email',
          message: 'Código enviado a tu email',
        });
      }

      if (channel === 'phone' && phone) {
        // CMF requiere el prefijo +507 para números panameños
        const formattedPhone = phone.startsWith('+507') ? phone : `+507${phone}`;
        await cmf.sendOtpByPhone(formattedPhone);
        return NextResponse.json({
          success: true,
          channel: 'phone',
          message: 'Código enviado por WhatsApp',
        });
      }

      return NextResponse.json(
        { success: false, message: 'Se requiere channel (email|phone) y el destino' },
        { status: 400 }
      );
    }

    // ── Verificar OTP ──────────────────────────────────────────────────────
    if (action === 'verify') {
      const { channel, email, phone, code, orderAmount } = body;

      if (!code) {
        return NextResponse.json(
          { success: false, message: 'El código OTP es requerido' },
          { status: 400 }
        );
      }

      // Verificar OTP
      if (channel === 'email' && email) {
        await cmf.verifyOtpByEmail(email, code);
      } else if (channel === 'phone' && phone) {
        const formattedPhone = phone.startsWith('+507') ? phone : `+507${phone}`;
        await cmf.verifyOtpByPhone(formattedPhone, code);
      } else {
        return NextResponse.json(
          { success: false, message: 'Canal o destino inválido' },
          { status: 400 }
        );
      }

      // OTP válido — obtener productos del cliente
      const target = channel === 'email' ? email : phone;
      const customerResponse = channel === 'email'
        ? await cmf.getCustomerByEmail(target)
        : await cmf.getCustomerByPhone(target);

      const products = await cmf.getCustomerProducts(customerResponse.id);

      const amount = parseFloat(orderAmount) || 0;
      const dataArray = await Promise.all(
        products.flatMap((product) =>
          product.customerAccountCards.map(async (card) => {
            let quotas = [];
            if (amount > 0) {
              try {
                quotas = await cmf.getQuotas(product.customerProductId, amount);
              } catch {
                // Si falla el simulador, retornar sin cuotas
              }
            }
            return {
              customerInfo: {
                customerProductId: product.customerProductId,
                cmfCustomerId: customerResponse.id,
                email: customerResponse.email,
                phone: customerResponse.phone,
                card: card.card,
                accountNumber: card.account,
                cardDecrypted: card.maskedCard,
                productName: product.productName,
                customerId: '',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              quotas,
            };
          })
        )
      );

      return NextResponse.json({ success: true, data: dataArray });
    }

    return NextResponse.json(
      { success: false, message: "Acción inválida. Usa ?action=request o ?action=verify" },
      { status: 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error en OTP CMF';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
