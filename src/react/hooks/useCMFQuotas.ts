import { useState, useCallback } from 'react';
import type { CMFQuota } from '../../types.js';

/**
 * Configuration options for `useCMFQuotas`.
 */
export interface UseCMFQuotasConfig {
  /**
   * Your backend endpoint that returns financing quota plans.
   * The hook will POST `{ customerProductId, amount }` to this URL.
   *
   * Expected response shape:
   * ```json
   * { "quotas": [ ...CMFQuota[] ] }
   * ```
   *
   * @default '/api/cmf/quotas'
   */
  endpoint?: string;
}

/**
 * Return value of `useCMFQuotas`.
 */
export interface UseCMFQuotasReturn {
  /** Fetch available financing plans for a product and purchase amount. */
  getQuotas: (customerProductId: string, amount: number) => Promise<void>;
  /** Available financing plans returned by the last successful fetch. */
  quotas: CMFQuota[];
  /** True while the request is in flight. */
  isLoading: boolean;
  /** Error message from the last failed request, or `null` if none. */
  error: string | null;
  /** Reset all state back to initial values. */
  reset: () => void;
}

/**
 * Fetches available CMF financing quota plans for a given product and purchase amount.
 *
 * The hook calls your backend, which calls `CMFClient.getQuotas()`.
 * Display the returned plans to the customer and capture their selection.
 * Pass the selected plan's `uniqueCode` to `useCMFPayment` when processing the order.
 *
 * **Backend contract** — your endpoint must accept:
 * ```json
 * POST /api/cmf/quotas
 * { "customerProductId": "uuid", "amount": 500 }
 * ```
 * And respond with:
 * ```json
 * { "quotas": [ ...CMFQuota ] }
 * ```
 *
 * @param config - Hook configuration
 * @returns Quota state and the `getQuotas` action
 *
 * @example
 * ```tsx
 * const { getQuotas, quotas, isLoading, error } = useCMFQuotas();
 *
 * // Fetch plans when the user arrives at checkout
 * await getQuotas(product.customerProductId, 500);
 *
 * // Render options
 * quotas.sort((a, b) => a.loanTerm - b.loanTerm).forEach(plan => {
 *   console.log(`${plan.loanTerm} months at $${plan.monthlyQuota.toFixed(2)}/month`);
 * });
 * ```
 */
export function useCMFQuotas(config: UseCMFQuotasConfig = {}): UseCMFQuotasReturn {
  const endpoint = config.endpoint ?? '/api/cmf/quotas';

  const [quotas, setQuotas] = useState<CMFQuota[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getQuotas = useCallback(
    async (customerProductId: string, amount: number) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerProductId, amount }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { message?: string };
          throw new Error(err.message ?? `Request failed with status ${res.status}`);
        }
        const data = await res.json() as { quotas?: CMFQuota[] };
        setQuotas(data.quotas ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to fetch quotas');
      } finally {
        setIsLoading(false);
      }
    },
    [endpoint],
  );

  const reset = useCallback(() => {
    setQuotas([]);
    setError(null);
  }, []);

  return { getQuotas, quotas, isLoading, error, reset };
}
