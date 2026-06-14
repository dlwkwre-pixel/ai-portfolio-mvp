import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SCENARIOS = [
  { id: "tech_crash", label: "Tech selloff" },
  { id: "rate_spike", label: "Rate spike" },
  { id: "recession", label: "Recession" },
  { id: "inflation", label: "Stagflation" },
];

type HoldingInput = {
  ticker: string;
  company_name: string | null;
  market_value: number;
  weight_pct: number;
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const holdings: HoldingInput[] = body.holdings ?? [];
  const totalValue: number = body.totalValue ?? 0;
  const cashBalance: number = body.cashBalance ?? 0;

  if (!holdings.length || totalValue <= 0) {
    return NextResponse.json({ error: "No holdings provided" }, { status: 400 });
  }

  const topHoldings = [...holdings]
    .sort((a, b) => b.weight_pct - a.weight_pct)
    .slice(0, 8);

  const holdingsSummary = topHoldings
    .map((h) => `${h.ticker}: ${h.weight_pct.toFixed(1)}%`)
    .join(", ");

  const cashPct = ((cashBalance / totalValue) * 100).toFixed(1);

  const prompt = `Portfolio risk analyst. Stress test this portfolio against 4 macro scenarios. Reply with JSON only, no markdown.

Portfolio: $${totalValue.toLocaleString()} total, ${cashPct}% cash
Top holdings: ${holdingsSummary}

JSON format:
{"scenarios":[{"id":"tech_crash","label":"Tech selloff","estimatedLoss":"-X%","estimatedDollars":"-$X","exposed":["TICK"],"hedges":["TICK"],"summary":"1-2 sentences"},{"id":"rate_spike","label":"Rate spike","estimatedLoss":"-X%","estimatedDollars":"-$X","exposed":[],"hedges":[],"summary":"1-2 sentences"},{"id":"recession","label":"Recession","estimatedLoss":"-X%","estimatedDollars":"-$X","exposed":[],"hedges":[],"summary":"1-2 sentences"},{"id":"inflation","label":"Stagflation","estimatedLoss":"-X%","estimatedDollars":"-$X","exposed":[],"hedges":[],"summary":"1-2 sentences"}],"overallRisk":"one sentence"}

Scenarios: 1) Tech selloff: growth stocks -25% 2) Rate spike: yields +100bps, rate-sensitive -15% 3) Recession: market -30%, defensives outperform 4) Stagflation: equities -20%, inflation spike`;

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "AI not configured" }, { status: 503 });
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 800 },
        }),
      }
    );

    if (!res.ok) {
      return NextResponse.json({ error: "AI request failed" }, { status: 500 });
    }

    const geminiData = await res.json();
    const rawText: string = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const cleaned = rawText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    let parsed: { scenarios: typeof SCENARIOS; overallRisk?: string };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("[stress-test] Failed to parse Gemini JSON:", cleaned.slice(0, 300));
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    return NextResponse.json(parsed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[stress-test] error:", msg);
    return NextResponse.json({ error: "AI request failed" }, { status: 500 });
  }
}
