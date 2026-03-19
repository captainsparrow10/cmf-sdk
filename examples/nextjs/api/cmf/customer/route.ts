/**
 * @file examples/nextjs/api/cmf/customer/route.ts
 *
 * Next.js App Router: API Route para buscar un cliente CMF y solicitar OTP.
 *
 * Ruta: POST /api/cmf/customer
 *
 * Esta ruta actúa como proxy — el frontend nunca llama a CMF directamente.
 * Las credenciales de CMF están en variables de entorno del servidor.
 */

import { NextRequest, NextResponse } from 'next/server';
import { CMFClient, CMFError } from 'cmf-sdk/server';

// Instanciar el cliente CMF con las credenciales del servidor
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
    const { email, phone } = await req.json();

    if (!email && !phone) {
      return NextResponse.json(
        { success: false, message: 'Se requiere email o teléfono' },
        { status: 400 }
      );
    }

    let channel: 'email' | 'phone';

    if (email) {
      // Verificar que el cliente existe en CMF
      const response = await cmf.getCustomerByEmail(email);
      if (!response.status || !response.jsonAnswer) {
        return NextResponse.json(
          { success: false, message: 'No existe un cliente CMF con ese email' },
          { status: 404 }
        );
      }
      await cmf.sendEmailOtp(email);
      channel = 'email';
    } else {
      const response = await cmf.getCustomerByPhone(phone!);
      if (!response.status || !response.jsonAnswer) {
        return NextResponse.json(
          { success: false, message: 'No existe un cliente CMF con ese teléfono' },
          { status: 404 }
        );
      }
      await cmf.sendPhoneOtp(phone!);
      channel = 'phone';
    }

    return NextResponse.json({ success: true, channel });
  } catch (error) {
    if (error instanceof CMFError) {
      return NextResponse.json(
        {
          success: false,
          message: CMFClient.getImprovedErrorMessage(error.publicMessage || error.message),
          errorType: error.errorType,
        },
        { status: error.httpStatus || 500 }
      );
    }
    return NextResponse.json(
      { success: false, message: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
