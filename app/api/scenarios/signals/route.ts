import { NextResponse } from "next/server";
import { fetchAggregatedNewsItems } from "@/lib/market-data/news-aggregator";
import { createClient } from "@/lib/supabase/server";

export type ScenarioSignal = {
  scenarioId: string;
  count: number;
  headlines: { headline: string; source: string; datetime: number; url: string }[];
};

type AIScenarioRow = {
  scenario_key: string;
  keywords: string[];
};

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
      .select("scenario_key, keywords")
      .eq("is_active", true)
      .gt("expires_at", new Date().toISOString());

    const aiScenarios: AIScenarioRow[] = (aiRows ?? []).map((r) => ({
      scenario_key: r.scenario_key as string,
      keywords: Array.isArray(r.keywords) ? (r.keywords as string[]) : [],
    }));

    const signals: ScenarioSignal[] = aiScenarios.map(({ scenario_key, keywords }) => {
      // Require >= 2 keyword hits per article to filter incidental single-word mentions
      const matched = news.filter((item) => {
        const text = (item.headline + " " + item.summary).toLowerCase();
        const hits = keywords.filter((kw) => text.includes(kw.toLowerCase())).length;
        return hits >= 2;
      });

      return {
        scenarioId: scenario_key,
        count: matched.length,
        headlines: matched.slice(0, 5).map((item) => ({
          headline: item.headline,
          source:   item.source,
          datetime: item.datetime,
          url:      item.url,
        })),
      };
    });

    return NextResponse.json(signals, {
      headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=300" },
    });
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}
