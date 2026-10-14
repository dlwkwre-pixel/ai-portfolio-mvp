// Plaid errors that only the account owner can fix by logging in to their bank again
// (password changed, MFA re-prompt, periodic re-consent). Until they do, that bank stops
// syncing — so the UI offers "Reconnect" (Plaid Link update mode) instead of a dead end.
// Safe to import from client components (no server-only dependencies).
const RECONNECT_CODES = [
  "ITEM_LOGIN_REQUIRED",
  "PENDING_EXPIRATION",
  "PENDING_DISCONNECT",
  "INVALID_CREDENTIALS",
  "INVALID_MFA",
  "ITEM_LOCKED",
  "USER_SETUP_REQUIRED",
  "ACCESS_NOT_GRANTED",
];

// last_error is stored as "Plaid /path failed: CODE".
export function needsReconnect(lastError: string | null | undefined): boolean {
  if (!lastError) return false;
  return RECONNECT_CODES.some((code) => lastError.includes(code));
}
