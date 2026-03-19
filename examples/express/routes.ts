/**
 * @file examples/express/routes.ts
 *
 * Complete Express.js route handlers for integrating the CMF SDK.
 *
 * These routes act as a secure proxy between your frontend (browser/mobile)
 * and the CMF API. Merchant credentials are never exposed to the client.
 *
 * Mount these routes under a protected prefix, e.g.:
 *   app.use('/api/cmf', cmfRouter);
 *
 * All routes expect JSON bodies and return JSON responses.
 * Add your own authentication middleware before mounting.
 *
 * Prerequisites:
 *   npm install express @panama-payments/cmf
 *   npm install --save-dev @types/express
 *
 * Environment variables required (see docs/env-vars.md):
 *   CMF_URL, CMF_EMAIL, CMF_PASSWORD,
 *   CMF_BRANCH_OFFICE_CODE, CMF_COMPANY_CODE, CMF_CREATED_BY
 */

import { Router, Request, Response, NextFunction } from 'express';
import { CMFClient, CMFDocumentType, CMFOtpChannel } from '@panama-payments/cmf/server';
import type {
  CMFQuotaPurchaseRequest,
  CMFNormalPurchaseRequest,
} from '@panama-payments/cmf/server';

// ── CLIENT SETUP ─────────────────────────────────────────────────────────────

/**
 * Singleton CMFClient instance.
 *
 * In production you may want to create this once at startup and reuse it
 * across requests. The client re-authenticates automatically when the token
 * is missing (e.g. after a server restart).
 *
 * For high-throughput scenarios, consider a token refresh strategy using
 * a periodic cron job or a JWT expiry check before each request.
 */
function createCMFClient(): CMFClient {
  const baseUrl = process.env['CMF_URL'];
  const email = process.env['CMF_EMAIL'];
  const password = process.env['CMF_PASSWORD'];
  const branchOfficeCode = process.env['CMF_BRANCH_OFFICE_CODE'];
  const companyCode = process.env['CMF_COMPANY_CODE'];
  const createdBy = process.env['CMF_CREATED_BY'] ?? 'system';

  if (!baseUrl || !email || !password || !branchOfficeCode || !companyCode) {
    throw new Error(
      'Missing required CMF environment variables. ' +
      'Set CMF_URL, CMF_EMAIL, CMF_PASSWORD, CMF_BRANCH_OFFICE_CODE, CMF_COMPANY_CODE.',
    );
  }

  return new CMFClient({
    baseUrl,
    email,
    password,
    branchOfficeCode,
    companyCode,
    createdBy,
    timeoutMs: 60000,
  });
}

// Create a single shared client instance
let cmfClient: CMFClient | null = null;

/**
 * Returns the shared CMFClient instance, creating it on first call.
 * Throws if required environment variables are missing.
 */
function getCMFClient(): CMFClient {
  if (!cmfClient) {
    cmfClient = createCMFClient();
  }
  return cmfClient;
}

// ── ROUTER ───────────────────────────────────────────────────────────────────

/** Express router for all CMF endpoints. Mount with: app.use('/api/cmf', cmfRouter) */
export const cmfRouter = Router();

// ── POST /api/cmf/customer ────────────────────────────────────────────────────

/**
 * Look up a CMF customer by document type and number, then fetch their products.
 *
 * Body:
 *   docType    {CMFDocumentType}  Document type UUID (use CMFDocumentType enum)
 *   docNumber  {string}           Document number (e.g. '8-123-456')
 *
 * Response:
 *   { customer: CMFCustomerResponse, products: CMFProduct[] }
 *
 * Used by the `useCMFCustomer` React hook.
 */
cmfRouter.post('/customer', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { docType, docNumber } = req.body as {
      docType: CMFDocumentType;
      docNumber: string;
    };

    if (!docType || !docNumber) {
      res.status(400).json({ message: 'docType and docNumber are required' });
      return;
    }

    const client = getCMFClient();
    await client.ensureAuthenticated();

    const customer = await client.getCustomerByDocument(docType, docNumber);
    const products = await client.getCustomerProducts(customer.id);

    res.json({ customer, products });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/cmf/customer/search ─────────────────────────────────────────────

/**
 * Look up a CMF customer by email or phone number, then fetch their products.
 * Exactly one of `email` or `phone` must be provided.
 *
 * Body:
 *   email?  {string}  Customer's registered CMF email address
 *   phone?  {string}  Customer's registered phone number (without country code)
 *
 * Response:
 *   { customer: CMFCustomerResponse, products: CMFProduct[] }
 */
cmfRouter.post('/customer/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, phone } = req.body as { email?: string; phone?: string };

    if (!email && !phone) {
      res.status(400).json({ message: 'Provide email or phone' });
      return;
    }
    if (email && phone) {
      res.status(400).json({ message: 'Provide only email or phone, not both' });
      return;
    }

    const client = getCMFClient();
    await client.ensureAuthenticated();

    const customer = email
      ? await client.getCustomerByEmail(email)
      : await client.getCustomerByPhone(phone!);

    const products = await client.getCustomerProducts(customer.id);

    res.json({ customer, products });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/cmf/quotas ──────────────────────────────────────────────────────

/**
 * Simulate financing quota plans for a product and purchase amount.
 *
 * Body:
 *   customerProductId  {string}  UUID from CMFProduct.customerProductId
 *   amount             {number}  Purchase amount to finance
 *
 * Response:
 *   { quotas: CMFQuota[] }  Sorted by loanTerm ascending
 *
 * Used by the `useCMFQuotas` React hook.
 */
cmfRouter.post('/quotas', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { customerProductId, amount } = req.body as {
      customerProductId: string;
      amount: number;
    };

    if (!customerProductId || typeof amount !== 'number' || amount <= 0) {
      res.status(400).json({ message: 'customerProductId and a positive amount are required' });
      return;
    }

    const client = getCMFClient();
    await client.ensureAuthenticated();

    const quotas = await client.getQuotas(customerProductId, amount);
    // Sort by loan term ascending for consistent display
    quotas.sort((a, b) => a.loanTerm - b.loanTerm);

    res.json({ quotas });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/cmf/pay ─────────────────────────────────────────────────────────

/**
 * Process a CMF payment — either installment (quota) or normal (full charge).
 * CMF sends a confirmation email to the customer automatically on success.
 *
 * Body (quota purchase):
 *   mode              'quotas'
 *   customerProductId {string}  UUID from CMFProduct.customerProductId
 *   accountNumber     {string}  Encrypted account from CMFProduct.productAccount
 *   uniqueCode        {string}  Plan code from CMFQuota.uniqueCode
 *   amount            {number}  Purchase amount
 *   receiptNumber     {string}  Unique merchant-generated receipt number
 *   description       {string}  Purchase description
 *   userName          {string}  Customer identifier (typically email)
 *
 * Body (normal purchase):
 *   mode          'normal'
 *   cardNumber    {string}  Encrypted card from CMFAccountCard.card
 *   amount        {number}  Purchase amount
 *   receiptNumber {string}  Unique merchant-generated receipt number
 *   description   {string}  Purchase description
 *   userName      {string}  Customer identifier
 *
 * Response:
 *   CMFApiResponse (the raw CMF response)
 *
 * Used by the `useCMFPayment` React hook.
 */
cmfRouter.post('/pay', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = req.body as {
      mode: 'quotas' | 'normal';
      customerProductId?: string;
      accountNumber?: string;
      uniqueCode?: string;
      cardNumber?: string;
      amount: number;
      receiptNumber: string;
      description: string;
      userName: string;
    };

    if (!params.mode || !params.amount || !params.receiptNumber) {
      res.status(400).json({ message: 'mode, amount, and receiptNumber are required' });
      return;
    }

    const client = getCMFClient();
    await client.ensureAuthenticated();

    if (params.mode === 'quotas') {
      if (!params.accountNumber || !params.uniqueCode) {
        res.status(400).json({ message: 'accountNumber and uniqueCode are required for quota payments' });
        return;
      }

      const quotaParams: CMFQuotaPurchaseRequest = {
        AccountNumber: params.accountNumber,
        UniqueCode: params.uniqueCode,
        Mto: params.amount,
        BranchOfficeCode: client.config.branchOfficeCode,
        CreatedBy: client.config.createdBy,
        CompanyCode: client.config.companyCode,
        ReceiptNumber: params.receiptNumber,
        Description: params.description,
        UserName: params.userName,
      };

      const result = await client.processPurchaseInQuotas(quotaParams);
      res.json(result);
    } else {
      // mode === 'normal'
      if (!params.cardNumber) {
        res.status(400).json({ message: 'cardNumber is required for normal payments' });
        return;
      }

      const normalParams: CMFNormalPurchaseRequest = {
        BranchOfficeCode: client.config.branchOfficeCode,
        CreatedBy: client.config.createdBy,
        CompanyCode: client.config.companyCode,
        CardNumber: params.cardNumber,
        MtoTran: params.amount,
        ReceiptNumber: params.receiptNumber,
        Description: params.description,
        UserName: params.userName,
        MovementType: 2,
        PaymentCashAmount: 0,
        WithdrawalFee: 0,
        Itbms: 0,
      };

      const result = await client.processNormalPurchase(normalParams);
      res.json(result);
    }
  } catch (err) {
    next(err);
  }
});

// ── POST /api/cmf/pay/verify ──────────────────────────────────────────────────

/**
 * Verify that a CMF transaction was recorded correctly.
 * Call this after a successful payment to confirm before fulfilling the order.
 *
 * Body:
 *   receiptNumber  {string}  The receipt number used when processing the payment
 *
 * Response:
 *   CMFApiResponse (the raw CMF response)
 */
cmfRouter.post('/pay/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { receiptNumber } = req.body as { receiptNumber: string };

    if (!receiptNumber) {
      res.status(400).json({ message: 'receiptNumber is required' });
      return;
    }

    const client = getCMFClient();
    await client.ensureAuthenticated();

    const result = await client.verifyTransaction(receiptNumber);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/cmf/otp/send ────────────────────────────────────────────────────

/**
 * Send an OTP code to a customer via email or phone (WhatsApp).
 *
 * Body:
 *   channel      {'email' | 'phone'}  Delivery channel
 *   destination  {string}             Email address or phone number with country code
 *
 * Response:
 *   { success: true, channel: 'email' | 'phone', destination: string }
 *
 * Used by the `useCMFOtp` React hook.
 *
 * Phone OTP warning: multiple failed verifications will block the phone number.
 * Consider rate-limiting this endpoint (e.g. max 3 sends per phone per 10 minutes).
 */
cmfRouter.post('/otp/send', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { channel, destination } = req.body as {
      channel: CMFOtpChannel;
      destination: string;
    };

    if (!channel || !destination) {
      res.status(400).json({ message: 'channel and destination are required' });
      return;
    }

    if (channel !== CMFOtpChannel.Email && channel !== CMFOtpChannel.Phone) {
      res.status(400).json({ message: 'channel must be "email" or "phone"' });
      return;
    }

    const client = getCMFClient();
    await client.ensureAuthenticated();

    if (channel === CMFOtpChannel.Email) {
      await client.sendOtpByEmail(destination);
    } else {
      await client.sendOtpByPhone(destination);
    }

    res.json({ success: true, channel, destination });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/cmf/otp/verify ──────────────────────────────────────────────────

/**
 * Verify an OTP code entered by the customer.
 *
 * Body:
 *   channel      {'email' | 'phone'}  Channel used when the OTP was sent
 *   destination  {string}             Email or phone (same as used in /otp/send)
 *   code         {string}             The OTP code entered by the customer
 *
 * Response:
 *   { success: true }
 *
 * Errors:
 *   401 — Invalid or expired code
 *   400 — Missing fields
 *
 * Used by the `useCMFOtp` React hook.
 *
 * Phone OTP warning: multiple failures will block the phone number.
 * Track attempt counts server-side and reject after 3 failures.
 */
cmfRouter.post('/otp/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { channel, destination, code } = req.body as {
      channel: CMFOtpChannel;
      destination: string;
      code: string;
    };

    if (!channel || !destination || !code) {
      res.status(400).json({ message: 'channel, destination, and code are required' });
      return;
    }

    const client = getCMFClient();
    await client.ensureAuthenticated();

    if (channel === CMFOtpChannel.Email) {
      await client.verifyOtpByEmail(destination, code);
    } else {
      await client.verifyOtpByPhone(destination, code);
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── ERROR HANDLER ─────────────────────────────────────────────────────────────

/**
 * CMF-specific error handler middleware.
 * Attach this after mounting `cmfRouter` to catch CMF errors gracefully.
 *
 * Usage:
 *   app.use('/api/cmf', cmfRouter);
 *   app.use('/api/cmf', cmfErrorHandler);
 */
export function cmfErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Log the error internally (replace with your logger)
  console.error('[CMF Error]', err.message);

  // Extract a user-friendly message
  const message = err.message.includes('CMF')
    ? err.message
    : 'An error occurred while processing your CMF request';

  // Determine HTTP status
  let status = 500;
  if (message.includes('not found') || message.includes('No customer')) {
    status = 404;
  } else if (message.includes('Invalid') || message.includes('required')) {
    status = 400;
  } else if (message.includes('OTP') && message.includes('failed')) {
    status = 401;
  }

  res.status(status).json({ message });
}
