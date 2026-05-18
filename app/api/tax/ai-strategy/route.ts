import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    year, stcgNet, ltcgNet, unknownNet, dividendIncome,
    tlhTotal, washSaleCount, lots, opportunities,
  } = body;

  const totalGain = (stcgNet ?? 0) + (ltcgNet ?? 0) + (unknownNet ?? 0);

  const prompt = `You are a knowledgeable tax strategy assistant helping an investor understand their ${year} tax situation. You are not a licensed tax advisor — always remind them to consult a CPA for filing decisions.

INVESTOR'S ${year} TAX DATA:
- Short-Term Capital Gains (STCG, held ≤1 year): $${(stcgNet ?? 0).toFixed(2)} (taxed as ordinary income)
- Long-Term Capital Gains (LTCG, held >1 year): $${(ltcgNet ?? 0).toFixed(2)} (preferential rates)
- Unknown-term gains: $${(unknownNet ?? 0).toFixed(2)} (acquisition date not recorded)
- Dividend income: $${(dividendIncome ?? 0).toFixed(2)}
- Total realized gain/loss: $${totalGain.toFixed(2)}
- Tax-loss harvesting potential (unrealized losses available): $${Math.abs(tlhTotal ?? 0).toFixed(2)}
- Potential wash sale violations detected: ${washSaleCount ?? 0}

${lots?.length > 0 ? `RECENT REALIZED TRANSACTIONS (sample):
${lots.slice(0, 10).map((l: { ticker: string; gainLoss: number; termType: string; soldAt: string }) => `- ${l.ticker}: ${l.gainLoss >= 0 ? "+" : ""}$${l.gainLoss.toFixed(2)} (${l.termType}-term, sold ${new Date(l.soldAt).toLocaleDateString()})`).join("\n")}` : ""}

${opportunities?.length > 0 ? `TAX-LOSS HARVESTING OPPORTUNITIES (positions with unrealized losses):
${opportunities.slice(0, 8).map((o: { ticker: string; unrealizedLoss: number | null; shares: number }) => `- ${o.ticker}: $${(o.unrealizedLoss ?? 0).toFixed(2)} unrealized loss (${o.shares} shares)`).join("\n")}` : "No positions with unrealized losses currently."}

Please provide a focused, actionable tax strategy analysis covering:

1. **Overall Tax Situation** — Summarize what this investor is facing in ${year} and what their approximate federal tax liability looks like at typical rates.

2. **Key Actions Before Year-End** — Specific things this investor should consider doing before December 31st to minimize taxes. Be concrete.

3. **Tax-Loss Harvesting** — If there are TLH opportunities, recommend which positions to prioritize and remind them about the 30-day wash sale rule and how to replace positions with similar (non-identical) securities.

4. **Wash Sale Risk** — If wash sales were detected, explain the impact and what to watch for.

5. **Strategy for Next Year** — 2–3 proactive strategies to reduce the tax burden going forward (e.g. maximizing tax-advantaged accounts, holding periods, lot identification methods).

Keep the response practical, not overly long. Use clear section headers. End with a reminder that this is educational, not tax advice, and they should verify with a CPA.`;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI service not configured." }, { status: 503 });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1200 },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    return NextResponse.json({ error: `AI error: ${errText}` }, { status: 502 });
  }

  const json = await response.json();
  const analysis = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "No analysis generated.";
  return NextResponse.json({ analysis });
}
