/**
 * Safe numeric and formatting utilities for BonCore POS.
 * Prevents TypeError crashes (e.g. Cannot read properties of undefined / reading 'toFixed').
 */

/**
 * Safely coerces any input (string, number, null, undefined) to a valid finite number.
 * Returns fallback if the result is NaN or infinite.
 */
export function safeNumber(val: unknown, fallback: number = 0): number {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : fallback;
  }
  const parsed = Number(val);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Formats a number to fixed decimal places, ensuring zero TypeError exceptions.
 * e.g. safeToFixed(undefined, 2) => "0.00"
 */
export function safeToFixed(val: unknown, decimals: number = 2): string {
  return safeNumber(val, 0).toFixed(decimals);
}

/**
 * Formats value as currency string (e.g. "₺120.50").
 */
export function formatCurrency(val: unknown, decimals: number = 2, symbol: string = '₺'): string {
  return `${symbol}${safeToFixed(val, decimals)}`;
}

/**
 * Safely parses a JSON string with fallback, guaranteeing no thrown SyntaxErrors.
 */
export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn('safeJsonParse fallback used for input:', raw, err);
    return fallback;
  }
}
