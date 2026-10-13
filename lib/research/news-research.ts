import { getFinnhubNews } from "@/lib/market-data/finnhub";
import { scrapePage } from "@/lib/scrape/firecrawl";

// Live context for the free research analysis: recent headlines (Finnhub, free) plus the
// full text of a few of them and of the company's latest press release (Firecrawl, ~1
// credit each, cached 24h per URL). Without Firecrawl configured or once the monthly cap
// is hit, this degrades to headlines + summaries — still far better than none.

export type ResearchSource = { title: string; source: string; url: string; date: string; full: boolean; pressRelease: boolean };

const WIRE_RE = /business\s*wire|globe\s*newswire|pr\s*newswire|accesswire|newsfile|press\s*release/i;
// Paywalled or login-walled — scraping them returns a teaser at best, so don't spend credits.
const PAYWALL_RE = /wsj|wall street journal|bloomberg|barron|financial times|\bft\b|seeking\s*alpha|investor'?s business daily|the information/i;

const MAX_FULL_ARTICLES = 2;
const EXCERPT_CHARS = 2_800;

function day(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

export async function gatherNewsResearch(ticker: string): Promise<{ context: string; sources: ResearchSource[] }> {
  const news = (await getFinnhubNews(ticker, 14)).filter((n) => n.headline && n.url);
  if (news.length === 0) return { context: "", sources: [] };

  const pressRelease = news.find((n) => WIRE_RE.test(n.source) || WIRE_RE.test(n.headline));
  const readable = news.filter((n) => n !== pressRelease && !PAYWALL_RE.test(n.source)).slice(0, MAX_FULL_ARTICLES);
  const toRead = [...(pressRelease ? [pressRelease] : []), ...readable];

  const fullText = new Map<string, string>();
  await Promise.all(toRead.map(async (n) => {
    const r = await scrapePage(n.url, { maxAgeHours: 24, maxChars: EXCERPT_CHARS });
    if (r.ok && r.page.markdown.trim().length > 200) fullText.set(n.url, r.page.markdown.trim());
  }));

  const lines: string[] = [`Recent news for ${ticker} (last 14 days, newest first):`];
  for (const n of news) {
    lines.push(`- ${day(n.datetime)} · ${n.source}: ${n.headline}${n.summary ? ` — ${n.summary.slice(0, 280)}` : ""}`);
  }
  if (pressRelease && fullText.has(pressRelease.url)) {
    lines.push("", `Latest company press release (${day(pressRelease.datetime)}): ${pressRelease.headline}`, fullText.get(pressRelease.url)!);
  }
  for (const n of readable) {
    if (!fullText.has(n.url)) continue;
    lines.push("", `Full article (${n.source}, ${day(n.datetime)}): ${n.headline}`, fullText.get(n.url)!);
  }

  const sources: ResearchSource[] = news.map((n) => ({
    title: n.headline.slice(0, 160),
    source: n.source,
    url: n.url,
    date: day(n.datetime),
    full: fullText.has(n.url),
    pressRelease: n === pressRelease,
  }));
  return { context: lines.join("\n"), sources };
}
