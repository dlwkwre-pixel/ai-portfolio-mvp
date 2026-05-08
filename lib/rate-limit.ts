type Entry = { count: number; windowStart: number };
const store = new Map<string, Entry>();

/**
 * In-memory IP rate limiter (best-effort per serverless instance).
 * key      — unique string, e.g. "research-search:<ip>"
 * max      — max requests allowed in the window
 * windowMs — window length in milliseconds
 */
export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number
): { limited: boolean; retryAfter: number } {
  const now = Date.now();

  if (store.size > 2000) {
    for (const [k, v] of store) {
      if (now - v.windowStart > windowMs * 2) store.delete(k);
    }
  }

  const entry = store.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return { limited: false, retryAfter: 0 };
  }

  if (entry.count >= max) {
    const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
    return { limited: true, retryAfter };
  }

  entry.count++;
  return { limited: false, retryAfter: 0 };
}

export function getIp(req: Request): string {
  const fwd = (req as { headers: { get(k: string): string | null } }).headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}
