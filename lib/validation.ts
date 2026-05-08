// Shared server-side input validation helpers.
// These run only in server actions and API routes — never in the browser.

// Ticker symbols: uppercase letters, digits, dots, carets, hyphens, 1–12 chars.
// Covers US equities (AAPL, BRK.B), indices (^GSPC), ETFs, and crypto pairs (BTC-USD).
const TICKER_RE = /^[A-Z0-9.^-]{1,12}$/;

export function validateTicker(raw: string, field = "Ticker"): string {
  const v = raw.trim().toUpperCase();
  if (!v) throw new Error(`${field} is required.`);
  if (!TICKER_RE.test(v)) throw new Error(`${field} "${v}" is not a valid symbol.`);
  return v;
}

export function validateLength(value: string, max: number, field: string): string {
  if (value.length > max) throw new Error(`${field} must be ${max} characters or fewer.`);
  return value;
}

export function validateEnum<T extends string>(
  value: string,
  allowed: readonly T[],
  field: string
): T {
  if (!allowed.includes(value as T))
    throw new Error(`Invalid ${field} "${value}".`);
  return value as T;
}

export function validateDate(raw: string, field = "Date"): string {
  if (!raw) return raw; // empty means "use server default"
  if (isNaN(new Date(raw).getTime())) throw new Error(`${field} is not a valid date.`);
  return raw;
}
