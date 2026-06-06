import { NextResponse } from "next/server";
import { MACRO_SCENARIOS } from "@/lib/scenarios/macro-plays";
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

    // Build a combined lookup: scenarioId → keywords[]
    const allScenarios: { id: string; keywords: string[] }[] = [
      ...MACRO_SCENARIOS.map((s) => ({ id: s.id, keywords: s.keywords })),
      ...aiScenarios.map((s) => ({ id: s.scenario_key, keywords: s.keywords })),
    ];

    const signals: ScenarioSignal[] = allScenarios.map(({ id, keywords }) => {
      const matched = news.filter((item) => {
        const text = (item.headline + " " + item.summary).toLowerCase();
        return keywords.some((kw) => text.includes(kw.toLowerCase()));
      });

      return {
        scenarioId: id,
        count: matched.length,
        headlines: matched.slice(0, 4).map((item) => ({
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
