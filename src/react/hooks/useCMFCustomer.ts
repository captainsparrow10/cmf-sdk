import { useState, useCallback } from 'react';
import type { CMFCustomerResponse, CMFProduct } from '../../types.js';
import { CMFDocumentType } from '../../types.js';

/**
 * Configuration options for `useCMFCustomer`.
 */
export interface UseCMFCustomerConfig {
  /**
   * Your backend endpoint that proxies calls to the CMF API.
   * The hook will POST `{ docType, docNumber }` to this URL.
   *
   * Expected response shape:
   * ```json
   * { "customer": { ...CMFCustomerResponse }, "products": [ ...CMFProduct[] ] }
   * ```
   *
   * @default '/api/cmf/customer'
   */
  endpoint?: string;
}

/**
 * Return value of `useCMFCustomer`.
 */
export interface UseCMFCustomerReturn {
  /** Search for a customer by document type and number. */
  search: (docType: CMFDocumentType, docNumber: string) => Promise<void>;
  /** Customer data returned from the last successful search. */
  customer: CMFCustomerResponse | null;
  /** Customer's active CMF financing products (credit accounts). */
  products: CMFProduct[];
  /** True while the search request is in flight. */
  isLoading: boolean;
  /** Error message from the last failed search, or `null` if none. */
  error: string | null;
  /** Reset all state back to initial values. */
  reset: () => void;
}

/**
 * Searches for a CMF customer by their document type and number.
 *
 * This hook calls your backend API, which in turn calls the CMF API
 * using merchant credentials. Never call CMF directly from the browser.
 *
 * **Backend contract** — your endpoint must accept:
 * ```json
 * POST /api/cmf/customer
 * { "docType": "8F3C2EF0-...", "docNumber": "8-123-456" }
 * ```
 * And respond with:
 * ```json
 * { "customer": { ...CMFCustomerResponse }, "products": [ ...CMFProduct ] }
 * ```
 *
 * @param config - Hook configuration options
 * @returns Customer search state and the `search` action
 *
 * @example
 * ```tsx
 * const { search, customer, products, isLoading, error } = useCMFCustomer();
 *
 * // On form submit:
 * await search(CMFDocumentType.Cedula, '8-123-456');
 *
 * if (customer) {
 *   console.log(`Found: ${customer.fullName}`);
 *   console.log(`Products: ${products.length}`);
 * }
 * ```
 */
export function useCMFCustomer(config: UseCMFCustomerConfig = {}): UseCMFCustomerReturn {
  const endpoint = config.endpoint ?? '/api/cmf/customer';

  const [customer, setCustomer] = useState<CMFCustomerResponse | null>(null);
  const [products, setProducts] = useState<CMFProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(
    async (docType: CMFDocumentType, docNumber: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ docType, docNumber }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { message?: string };
          throw new Error(err.message ?? `Request failed with status ${res.status}`);
        }
        const data = await res.json() as { customer: CMFCustomerResponse; products?: CMFProduct[] };
        setCustomer(data.customer);
        setProducts(data.products ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to find customer');
      } finally {
        setIsLoading(false);
      }
    },
    [endpoint],
  );

  const reset = useCallback(() => {
    setCustomer(null);
    setProducts([]);
    setError(null);
  }, []);

  return { search, customer, products, isLoading, error, reset };
}
