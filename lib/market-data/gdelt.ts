// GDELT DOC 2.0 API client — free, public, no key required. The project asks
// callers to keep to roughly one request per 5 seconds; callers of this
// function are responsible for caching (see gdelt_signal_cache table and
// app/api/scenarios/signals/route.ts) rather than calling this per-request.
// Fail-soft throughout: a GDELT hiccup should degrade a signal count, never
// break the page it feeds.

const GDELT_DOC_API = "https://api.gdeltproject.org/api/v2/doc/doc";

type GdeltDocResponse = { articles?: unknown[] };

// Counts recent articles matching any of the given keywords — a rough proxy
// for how much real-world news volume a topic is currently generating.
// Multi-word keywords are phrase-quoted; GDELT ORs bare terms together.
export async function getGdeltArticleCount(keywords: string[], timespanDays = 3): Promise<number | null> {
  const terms = keywords.filter((k) => k.trim().length > 0).slice(0, 6);
  if (terms.length === 0) return null;

  const query = terms.map((k) => (k.includes(" ") ? `"${k.trim()}"` : k.trim())).join(" OR ");
  const url = new URL(GDELT_DOC_API);
  url.searchParams.set("query", `(${query})`);
  url.searchParams.set("mode", "artlist");
  url.searchParams.set("maxrecords", "75");
  url.searchParams.set("timespan", `${Math.max(1, timespanDays)}d`);
  url.searchParams.set("format", "json");

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000), cache: "no-store" });
    // Includes GDELT's courtesy-limit 429 — fail soft, caller keeps its stale cache.
    if (!res.ok) return null;
    const data = (await res.json()) as GdeltDocResponse;
    return Array.isArray(data.articles) ? data.articles.length : 0;
  } catch {
    return null;
  }
}
