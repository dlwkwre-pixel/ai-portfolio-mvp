import { NextResponse } from "next/server";
import { getFinnhubMarketNews } from "@/lib/market-data/finnhub";
import { MACRO_SCENARIOS } from "@/lib/scenarios/macro-plays";

export type ScenarioSignal = {
  scenarioId: string;
  count: number;
  headlines: { headline: string; source: string; datetime: number; url: string }[];
};

export async function GET() {
  try {
    const news = await getFinnhubMarketNews("general", 50);

    const signals: ScenarioSignal[] = MACRO_SCENARIOS.map((scenario) => {
      const matched = news.filter((item) => {
        const text = (item.headline + " " + item.summary).toLowerCase();
        return scenario.keywords.some((kw) => text.includes(kw));
      });

      return {
        scenarioId: scenario.id,
        count: matched.length,
        headlines: matched.slice(0, 4).map((item) => ({
          headline: item.headline,
          source: item.source,
          datetime: item.datetime,
          url: item.url,
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
