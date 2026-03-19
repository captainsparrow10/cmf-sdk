/**
 * @file examples/nextjs/api/cmf/quotas/route.ts
 *
 * Next.js App Router: API Route para obtener planes de cuotas del simulador CMF.
 *
 * Ruta: POST /api/cmf/quotas
 * Body: { customerProductId: string, amount: number }
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
  try {
    const { customerProductId, amount } = await req.json();

    if (!customerProductId || !amount || amount <= 0) {
      return NextResponse.json(
        { success: false, message: 'Se requiere customerProductId y amount > 0' },
        { status: 400 }
      );
    }

    await cmf.ensureAuthenticated();
    const quotas = await cmf.getQuotas(customerProductId, parseFloat(amount));

    return NextResponse.json({ success: true, data: quotas });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al obtener cuotas';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
