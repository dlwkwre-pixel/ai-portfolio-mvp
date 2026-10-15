import { createHash } from "node:crypto";
import { kvGet, kvSet } from "@/lib/kv";

// Firecrawl: reads a web page and returns its main content as markdown. Server-only.
//
// Built for the free plan (~1,000 credits/month, ~1 credit per page):
// - every page is cached in chart_cache, so the same URL is only paid for once per window
// - a monthly credit cap (FIRECRAWL_MONTHLY_CREDIT_CAP, default 900) stops calls before the
//   plan runs out — callers fall back to whatever they had without it
// - plain markdown only; structured extraction happens in our own (free) model afterwards

const ENDPOINT = "https://api.firecrawl.dev/v2/scrape";
const DEFAULT_CAP = 900;

export type ScrapedPage = { url: string; title: string | null; markdown: string };
export type ScrapeResult =
  | { ok: true; page: ScrapedPage; cached: boolean }
  | { ok: false; reason: "not_configured" | "budget" | "invalid_url" | "blocked" | "failed" };

export function firecrawlConfigured(): boolean {
  return !!process.env.FIRECRAWL_API_KEY;
}


function usageKey(): string {
  const d = new Date();
  return `fc:usage:${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function firecrawlUsageThisMonth(): Promise<{ used: number; cap: number }> {
  const cap = Number(process.env.FIRECRAWL_MONTHLY_CREDIT_CAP) || DEFAULT_CAP;
  const used = (await kvGet<{ credits?: number }>(usageKey()))?.credits ?? 0;
  return { used, cap };
}

export function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(u.hostname) || u.hostname.endsWith(".local")) return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

export async function scrapePage(
  rawUrl: string,
  opts: { maxAgeHours?: number; maxChars?: number; timeoutMs?: number } = {},
): Promise<ScrapeResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return { ok: false, reason: "not_configured" };
  const url = normalizeUrl(rawUrl);
  if (!url) return { ok: false, reason: "invalid_url" };

  const maxAgeMs = (opts.maxAgeHours ?? 24) * 3_600_000;
  const maxChars = opts.maxChars ?? 15_000;
  const cacheKey = `fc:page:${createHash("sha1").update(url).digest("hex")}`;

  const cached = await kvGet<{ page?: ScrapedPage; at?: number }>(cacheKey);
  if (cached?.page && cached.at && Date.now() - cached.at < maxAgeMs) {
    return { ok: true, page: { ...cached.page, markdown: cached.page.markdown.slice(0, maxChars) }, cached: true };
  }

  const { used, cap } = await firecrawlUsageThisMonth();
  if (used >= cap) return { ok: false, reason: "budget" };

  const timeoutMs = opts.timeoutMs ?? 25_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs + 5_000);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, timeout: timeoutMs, maxAge: maxAgeMs }),
      signal: controller.signal,
      cache: "no-store",
    });
    // Count the attempt whether or not it worked — failed scrapes can still be billed.
    await kvSet(usageKey(), { credits: used + 1 }, 40 * 86_400_000);
    const body = await res.json().catch(() => null) as { success?: boolean; data?: { markdown?: string; metadata?: { title?: string | string[]; statusCode?: number } } } | null;
    if (!res.ok || !body?.success || !body.data?.markdown) {
      const status = body?.data?.metadata?.statusCode ?? res.status;
      return { ok: false, reason: status === 401 || status === 403 || status === 429 ? "blocked" : "failed" };
    }
    const rawTitle = body.data.metadata?.title;
    const page: ScrapedPage = {
      url,
      title: (Array.isArray(rawTitle) ? rawTitle[0] : rawTitle) ?? null,
      // keep a generous copy in cache; callers trim to what they need
      markdown: body.data.markdown.slice(0, 40_000),
    };
    await kvSet(cacheKey, { page, at: Date.now() }, maxAgeMs);
    return { ok: true, page: { ...page, markdown: page.markdown.slice(0, maxChars) }, cached: false };
  } catch {
    return { ok: false, reason: "failed" };
  } finally {
    clearTimeout(timer);
  }
}

// One plain-English message per failure, shared by every feature that reads links.
export function scrapeErrorMessage(reason: Exclude<ScrapeResult, { ok: true }>["reason"]): { status: number; message: string } {
  switch (reason) {
    case "not_configured": return { status: 503, message: "Reading links isn't set up yet." };
    case "budget": return { status: 429, message: "We've hit this month's limit for reading links. You can still fill this in by hand." };
    case "invalid_url": return { status: 400, message: "That doesn't look like a web address. Paste the full link, starting with https://" };
    case "blocked": return { status: 422, message: "That site wouldn't let us read the page. Some sites block this, so copy the details in by hand." };
    default: return { status: 502, message: "Couldn't read that page right now. Try again, or fill it in by hand." };
  }
}
