import { NextResponse } from "next/server";
import { fetchAggregatedNewsItems } from "@/lib/market-data/news-aggregator";
import { createClient } from "@/lib/supabase/server";

export type ScenarioSignal = {
  scenarioId: string;
  count: number;
  headlines: { headline: string; source: string; datetime: number; url: string }[];
  gdeltArticleCount?: number; // raw GDELT article volume, geopolitical-category scenarios only
};

type AIScenarioRow = {
  scenario_key: string;
  keywords: string[];
  category: string;
};

// GDELT counts are refreshed by app/api/cron/refresh-gdelt-signals (paced to
// respect GDELT's ~1 request/5s courtesy limit) — this route only ever reads
// the cache, so a live user request is never stuck waiting on a third party.
// A stale/missing cache row just means the field is omitted, not an error.
// The cron runs once daily (Vercel Hobby plan caps crons at once/day), so
// this needs real headroom past 24h or the cache goes cold for hours before
// the next run — 30h covers a same-day run plus reasonable slack.
const GDELT_CACHE_MAX_AGE_MS = 30 * 60 * 60 * 1000;

async function getCachedGdeltCount(supabase: Awaited<ReturnType<typeof createClient>>, scenarioKey: string): Promise<number | undefined> {
  const { data } = await supabase
    .from("gdelt_signal_cache").select("article_count, checked_at").eq("scenario_key", scenarioKey).maybeSingle();
  if (!data || Date.now() - new Date(data.checked_at).getTime() > GDELT_CACHE_MAX_AGE_MS) return undefined;
  return data.article_count;
}

export async function GET() {
  try {
    // Fetch news from all configured sources in parallel with AI scenario list
    const [news, supabase] = await Promise.all([
      fetchAggregatedNewsItems(50),
      createClient(),
    ]);

    // Load active AI-generated scenarios (keywords for matching)
    const { data: aiRows } = await supabase
      .from("ai_generated_scenarios")
      .select("scenario_key, keywords, category")
      .eq("is_active", true)
      .gt("expires_at", new Date().toISOString());

    const aiScenarios: AIScenarioRow[] = (aiRows ?? []).map((r) => ({
      scenario_key: r.scenario_key as string,
      keywords: Array.isArray(r.keywords) ? (r.keywords as string[]) : [],
      category: (r.category as string) ?? "markets",
    }));

    const signals: ScenarioSignal[] = await Promise.all(aiScenarios.map(async ({ scenario_key, keywords, category }) => {
      // Require >= 2 keyword hits per article to filter incidental single-word mentions
      const matched = news.filter((item) => {
        const text = (item.headline + " " + item.summary).toLowerCase();
        const hits = keywords.filter((kw) => text.includes(kw.toLowerCase())).length;
        return hits >= 2;
      });

      let count = matched.length;
      let gdeltArticleCount: number | undefined;

      // Geopolitical scenarios get a second, independent signal — real GDELT
      // news-event volume — instead of relying purely on whether Finnhub's
      // curated feed happened to run a matching headline. Scaled down (÷6) so
      // GDELT's much broader, noisier count (up to 75 articles across hundreds
      // of outlets) doesn't dwarf the Finnhub-headline count on the same
      // 0 / 1-4 / 5-11 / 12+ tier scale — a first-pass heuristic, not
      // empirically calibrated yet.
      if (category === "geopolitical") {
        const gdelt = await getCachedGdeltCount(supabase, scenario_key);
        if (gdelt != null) {
          gdeltArticleCount = gdelt;
          count += Math.round(gdelt / 6);
        }
      }

      return {
        scenarioId: scenario_key,
        count,
        gdeltArticleCount,
        headlines: matched.slice(0, 5).map((item) => ({
          headline: item.headline,
          source:   item.source,
          datetime: item.datetime,
          url:      item.url,
        })),
      };
    }));

    return NextResponse.json(signals, {
      headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=300" },
    });
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}
