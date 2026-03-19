import { useState, useCallback } from 'react';
import { CMFOtpChannel } from '../../types.js';

/**
 * Configuration options for `useCMFOtp`.
 */
export interface UseCMFOtpConfig {
  /**
   * Backend endpoint for sending an OTP code.
   * The hook will POST `{ channel, destination }` to this URL.
   * @default '/api/cmf/otp/send'
   */
  sendEndpoint?: string;
  /**
   * Backend endpoint for verifying an OTP code.
   * The hook will POST `{ channel, destination, code }` to this URL.
   * @default '/api/cmf/otp/verify'
   */
  verifyEndpoint?: string;
}

/**
 * Current step in the OTP verification flow.
 *
 * - `idle` — No OTP has been sent yet.
 * - `send` — An OTP send request is in progress (transient).
 * - `verify` — OTP has been sent; waiting for the user to enter the code.
 * - `done` — OTP has been successfully verified.
 */
export type CMFOtpStep = 'idle' | 'send' | 'verify' | 'done';

/**
 * Return value of `useCMFOtp`.
 */
export interface UseCMFOtpReturn {
  /**
   * Send an OTP to the customer via email or phone (WhatsApp).
   * @param channel - `CMFOtpChannel.Email` or `CMFOtpChannel.Phone`
   * @param destination - Email address or phone number with country code (e.g. '+50761234567')
   */
  sendOtp: (channel: CMFOtpChannel, destination: string) => Promise<void>;
  /**
   * Verify the OTP code entered by the customer.
   *
   * **Phone OTP warning**: Multiple failed attempts will block the phone number
   * in the OTP provider. Enforce a max attempts limit (e.g. 3) in your UI.
   *
   * @param code - The OTP code entered by the customer
   */
  verifyOtp: (code: string) => Promise<void>;
  /** The OTP channel used in the current session (`email` or `phone`). */
  channel: CMFOtpChannel | null;
  /** The destination address (email or phone) used in the current session. */
  destination: string | null;
  /** Current step in the OTP flow. */
  step: CMFOtpStep;
  /** True while a send or verify request is in flight. */
  isLoading: boolean;
  /** Error message from the last failed operation, or `null` if none. */
  error: string | null;
  /** Reset all state back to initial values. */
  reset: () => void;
}

/**
 * Manages the CMF OTP verification flow for both email and phone (WhatsApp).
 *
 * The flow is: `idle` → call `sendOtp()` → step becomes `verify` →
 * user enters code → call `verifyOtp()` → step becomes `done`.
 *
 * **Phone OTP warning**: The OTP is delivered via WhatsApp by CM Financiera /
 * Banco General. Multiple failed verification attempts will block the phone
 * number. Enforce a maximum of 3 attempts in your UI before resetting the flow.
 *
 * **Email OTP warning**: Each code can only be verified once. After a successful
 * verification, the code is invalidated by CMF.
 *
 * **Backend contracts**:
 *
 * Send endpoint (POST `/api/cmf/otp/send`):
 * ```json
 * { "channel": "email", "destination": "user@example.com" }
 * ```
 *
 * Verify endpoint (POST `/api/cmf/otp/verify`):
 * ```json
 * { "channel": "email", "destination": "user@example.com", "code": "123456" }
 * ```
 *
 * @param config - Hook configuration
 * @returns OTP state and the `sendOtp` / `verifyOtp` actions
 *
 * @example
 * ```tsx
 * const { sendOtp, verifyOtp, step, error, isLoading } = useCMFOtp();
 *
 * // Step 1: Send OTP
 * if (step === 'idle') {
 *   await sendOtp(CMFOtpChannel.Email, customer.email);
 *   // step is now 'verify'
 * }
 *
 * // Step 2: User enters code; verify it
 * if (step === 'verify') {
 *   await verifyOtp(userInputCode);
 *   // step is now 'done' on success
 * }
 * ```
 */
export function useCMFOtp(config: UseCMFOtpConfig = {}): UseCMFOtpReturn {
  const sendEndpoint = config.sendEndpoint ?? '/api/cmf/otp/send';
  const verifyEndpoint = config.verifyEndpoint ?? '/api/cmf/otp/verify';

  const [channel, setChannel] = useState<CMFOtpChannel | null>(null);
  const [destination, setDestination] = useState<string | null>(null);
  const [step, setStep] = useState<CMFOtpStep>('idle');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendOtp = useCallback(
    async (ch: CMFOtpChannel, dest: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(sendEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: ch, destination: dest }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { message?: string };
          throw new Error(err.message ?? 'Failed to send OTP');
        }
        setChannel(ch);
        setDestination(dest);
        setStep('verify');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to send OTP');
      } finally {
        setIsLoading(false);
      }
    },
    [sendEndpoint],
  );

  const verifyOtp = useCallback(
    async (code: string) => {
      if (!destination || !channel) {
        setError('No OTP session active. Call sendOtp() first.');
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(verifyEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel, destination, code }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { message?: string };
          throw new Error(err.message ?? 'Invalid OTP code');
        }
        setStep('done');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'OTP verification failed');
      } finally {
        setIsLoading(false);
      }
    },
    [verifyEndpoint, channel, destination],
  );

  const reset = useCallback(() => {
    setChannel(null);
    setDestination(null);
    setStep('idle');
    setError(null);
  }, []);

  return { sendOtp, verifyOtp, channel, destination, step, isLoading, error, reset };
}
