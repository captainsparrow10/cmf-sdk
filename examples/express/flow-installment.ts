/**
 * @file examples/express/flow-installment.ts
 *
 * Complete standalone example: Full CMF installment purchase flow.
 *
 * This file shows every step from authentication to payment verification,
 * using the CMFClient directly (no Express, no framework). Run it with:
 *
 *   npx ts-node --esm examples/express/flow-installment.ts
 *
 * Prerequisites:
 *   npm install ts-node @panama-payments/cmf
 *
 * Set environment variables before running:
 *   CMF_URL, CMF_EMAIL, CMF_PASSWORD,
 *   CMF_BRANCH_OFFICE_CODE, CMF_COMPANY_CODE, CMF_CREATED_BY
 *
 * This example uses the CMF QA environment. Replace CMF_URL with the
 * production URL when you go live.
 */

import { CMFClient, CMFDocumentType, CMFOtpChannel } from '@panama-payments/cmf/server';
import type { CMFQuota, CMFProduct, CMFCustomerResponse } from '@panama-payments/cmf/server';

// ── STEP 0: Configure the client ──────────────────────────────────────────────

const client = new CMFClient({
  // QA URL — replace with production URL from Banco General when ready
  baseUrl: process.env['CMF_URL'] ?? 'https://qa-idilw8q1smn68l4eux.cmf.com.pa/mdl03/api',
  email: process.env['CMF_EMAIL'] ?? '',
  password: process.env['CMF_PASSWORD'] ?? '',
  branchOfficeCode: process.env['CMF_BRANCH_OFFICE_CODE'] ?? '',
  companyCode: process.env['CMF_COMPANY_CODE'] ?? '',
  createdBy: process.env['CMF_CREATED_BY'] ?? 'system',
  // CMF API can be slow — 60 seconds is the recommended timeout
  timeoutMs: 60000,
});

// ── MAIN FLOW ─────────────────────────────────────────────────────────────────

async function runInstallmentFlow(): Promise<void> {
  console.log('=== CMF Installment Purchase Flow ===\n');

  // ── STEP 1: Authenticate ────────────────────────────────────────────────────
  //
  // The client logs in and stores the JWT token internally.
  // All subsequent calls are automatically authenticated.
  console.log('STEP 1: Authenticating with CMF API...');
  await client.ensureAuthenticated();
  console.log('  Authenticated successfully.\n');

  // ── STEP 2: OTP verification (identity check) ───────────────────────────────
  //
  // CMF requires the customer to verify their identity via OTP before their
  // account data can be accessed. In a real flow, you would:
  //   1. Collect the customer's email or phone at checkout
  //   2. Call sendOtpByEmail / sendOtpByPhone
  //   3. Show an OTP input to the customer
  //   4. Call verifyOtpByEmail / verifyOtpByPhone with the entered code
  //
  // The OTP step is optional if you already have the customer's CMF ID
  // stored from a previous session (see: database-model.md).
  //
  // Example with email OTP:
  const customerEmail = 'customer@example.com'; // collected at checkout

  console.log('STEP 2: Sending OTP to customer email...');
  await client.sendOtpByEmail(customerEmail);
  console.log(`  OTP sent to ${customerEmail}\n`);

  // In a real app, you would pause here and wait for the customer to enter
  // the code from their email. For this example, we assume the code is known.
  const otpCode = '123456'; // entered by the customer

  console.log('STEP 2b: Verifying OTP...');
  await client.verifyOtpByEmail(customerEmail, otpCode);
  console.log('  OTP verified successfully.\n');

  // ── STEP 3: Look up the customer ────────────────────────────────────────────
  //
  // You can look up by document (cedula/passport/RUC), email, or phone.
  // Use whichever the customer provided at registration.
  //
  // The returned `id` (cmfCustomerId) should be saved in your database
  // so you don't need to search every time.
  console.log('STEP 3: Looking up customer by cédula...');
  const customer: CMFCustomerResponse = await client.getCustomerByDocument(
    CMFDocumentType.Cedula,
    '8-123-456', // customer's document number
  );
  console.log(`  Found: ${customer.fullName} (CMF ID: ${customer.id})\n`);

  // ── STEP 4: Get customer's financing products ───────────────────────────────
  //
  // A customer may have multiple products (credit cards / accounts).
  // Each product has one or more cards. The encrypted `productAccount` is
  // used in the quota purchase. The encrypted `card` is used in normal purchases.
  console.log('STEP 4: Fetching customer products...');
  const products: CMFProduct[] = await client.getCustomerProducts(customer.id);

  if (products.length === 0) {
    throw new Error('Customer has no active CMF financing products');
  }

  console.log(`  Found ${products.length} product(s):`);
  products.forEach((p, i) => {
    console.log(`    [${i}] ${p.productName} — ${p.customerAccountCards.length} card(s)`);
  });

  // Select the first available product
  const selectedProduct = products[0]!;
  console.log(`  Selected product: ${selectedProduct.productName}\n`);

  // ── STEP 5: Simulate financing plans ────────────────────────────────────────
  //
  // The simulator returns available installment plans for the purchase amount.
  // Plans typically cover 6, 12, 18, 24 months or more depending on the product.
  // Display these to the customer and let them choose.
  const purchaseAmount = 500.00; // USD

  console.log(`STEP 5: Simulating quota plans for $${purchaseAmount}...`);
  const quotas: CMFQuota[] = await client.getQuotas(
    selectedProduct.customerProductId,
    purchaseAmount,
  );

  if (quotas.length === 0) {
    // Fall back to normal (non-installment) purchase if no plans are available
    console.log('  No installment plans available. Use processNormalPurchase() instead.\n');
    return;
  }

  // Sort by loan term for display
  quotas.sort((a, b) => a.loanTerm - b.loanTerm);

  console.log(`  Available plans:`);
  quotas.forEach((q, i) => {
    const rate = (q.effectiveInterestPct * 100).toFixed(1);
    console.log(
      `    [${i}] ${q.loanTerm} months — $${q.monthlyQuota.toFixed(2)}/month — ` +
      `Total: $${q.totalCreditAmount.toFixed(2)} — Rate: ${rate}%`,
    );
  });

  // Customer selects a plan (in a real app, this comes from UI input)
  const selectedPlan = quotas[0]!; // first plan (shortest term)
  console.log(`  Selected plan: ${selectedPlan.loanTerm} months\n`);

  // ── STEP 6: Process the installment purchase ────────────────────────────────
  //
  // Generate a unique receipt number for this transaction.
  // Store this in your database — it links your order to the CMF record.
  //
  // After a successful payment, CMF sends a confirmation email to the customer.
  const receiptNumber = `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  console.log(`STEP 6: Processing installment purchase (receipt: ${receiptNumber})...`);
  const paymentResult = await client.processPurchaseInQuotas({
    AccountNumber: selectedProduct.productAccount, // encrypted
    UniqueCode: selectedPlan.uniqueCode,
    Mto: purchaseAmount,
    BranchOfficeCode: client.config.branchOfficeCode,
    CreatedBy: client.config.createdBy,
    CompanyCode: client.config.companyCode,
    ReceiptNumber: receiptNumber,
    Description: 'Purchase at My Store — Order #1234',
    UserName: customer.email,
  });

  console.log(`  Payment processed. CMF code: ${paymentResult.uniqueCode ?? 'N/A'}\n`);

  // ── STEP 7: Verify the transaction ─────────────────────────────────────────
  //
  // Always verify after processing. CMF may return complete: true but still fail
  // to record the transaction in some edge cases. Verification is your safety net.
  console.log('STEP 7: Verifying transaction...');
  const verification = await client.verifyTransaction(receiptNumber);
  console.log(`  Verification complete: ${verification.complete}\n`);

  // ── DONE ──────────────────────────────────────────────────────────────────
  console.log('=== Flow complete ===');
  console.log(`Receipt number: ${receiptNumber}`);
  console.log(`CMF transaction code: ${paymentResult.uniqueCode ?? 'N/A'}`);
  console.log('CMF will send a confirmation email to the customer.');
}

// ── NORMAL PURCHASE EXAMPLE ───────────────────────────────────────────────────

/**
 * Alternative flow: Process a full (non-installment) card purchase.
 * Use this when the customer selects "pay in full" instead of installments.
 */
async function runNormalPurchaseFlow(): Promise<void> {
  console.log('=== CMF Normal (Full Charge) Purchase Flow ===\n');

  await client.ensureAuthenticated();

  const customer = await client.getCustomerByDocument(
    CMFDocumentType.Cedula,
    '8-123-456',
  );
  const products = await client.getCustomerProducts(customer.id);

  if (products.length === 0 || products[0]!.customerAccountCards.length === 0) {
    throw new Error('No active cards found');
  }

  const card = products[0]!.customerAccountCards[0]!;
  const receiptNumber = `ORDER-${Date.now()}`;

  console.log(`Processing full charge for $150.00 (receipt: ${receiptNumber})...`);

  const result = await client.processNormalPurchase({
    BranchOfficeCode: client.config.branchOfficeCode,
    CreatedBy: client.config.createdBy,
    CompanyCode: client.config.companyCode,
    CardNumber: card.card, // encrypted
    MtoTran: 150.00,
    ReceiptNumber: receiptNumber,
    Description: 'Purchase at My Store',
    UserName: customer.email,
    MovementType: 2,
    PaymentCashAmount: 0,
    WithdrawalFee: 0,
    Itbms: 0,
  });

  console.log(`Payment complete: ${result.complete}`);
  console.log(`CMF code: ${result.uniqueCode ?? 'N/A'}`);
}

// ── PHONE OTP EXAMPLE ─────────────────────────────────────────────────────────

/**
 * Example: OTP flow using phone (WhatsApp).
 *
 * WARNING: Multiple failed verifications will block the phone number
 * in the OTP provider. Always enforce a maximum of 3 attempts.
 */
async function runPhoneOtpFlow(phone: string): Promise<void> {
  await client.ensureAuthenticated();

  console.log(`Sending OTP to ${phone} via WhatsApp...`);
  // Phone number should include country code: +50761234567 for Panama
  await client.sendOtpByPhone(phone);
  console.log('OTP sent. Waiting for customer to enter code...');

  // In a real app, wait for user input via your UI/API
  const code = '123456'; // entered by customer

  let attempts = 0;
  const MAX_ATTEMPTS = 3;

  while (attempts < MAX_ATTEMPTS) {
    try {
      attempts++;
      await client.verifyOtpByPhone(phone, code);
      console.log('OTP verified successfully.');
      break;
    } catch {
      console.error(`OTP attempt ${attempts}/${MAX_ATTEMPTS} failed.`);
      if (attempts >= MAX_ATTEMPTS) {
        throw new Error(`Max OTP attempts reached for ${phone}. Phone may be blocked.`);
      }
    }
  }
}

// Run the main installment flow
runInstallmentFlow().catch(console.error);

// Uncomment to run other examples:
// runNormalPurchaseFlow().catch(console.error);
// runPhoneOtpFlow('+50761234567').catch(console.error);
