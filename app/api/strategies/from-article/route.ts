import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { scrapePage, scrapeErrorMessage } from "@/lib/scrape/firecrawl";
import { callGemini, extractJsonObject } from "@/lib/ai/gemini";

// "Start from an article" in the Strategy Builder: read an investing article / fund letter
// (Firecrawl, cached 7 days per URL) and boil it down to the approach it describes. The
// client drops that summary into the Atlas conversation as the user's opening message, so
// the normal interview (goals, risk, horizon) still happens around it.

export const maxDuration = 60;

const PROMPT = `You are reading an article about investing. Summarize the investing APPROACH it describes so an advisor can build a personal strategy around it.
Return ONLY a JSON object:
{"is_investing": boolean (false if the page isn't about an investing approach at all),
 "title": string (short title of the article),
 "approach": string (2-4 sentences: what to buy, how to pick it, how long to hold, how often to trade),
 "rules": string[] (3-6 concrete rules or criteria from the article, each under 20 words),
 "risks": string (one sentence on the main risk or weakness of this approach)}
Describe only what the article says. Do not add your own recommendations.`;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { limited, retryAfter } = checkRateLimit(`strategy-article:${user.id}`, 5, 10 * 60_000);
  if (limited) return NextResponse.json({ error: "Too many articles in a short time. Please wait a few minutes." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });

  let url = "";
  try {
    url = String((await req.json() as { url?: string }).url ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const scraped = await scrapePage(url, { maxAgeHours: 24 * 7, maxChars: 16_000 });
  if (!scraped.ok) {
    const { status, message } = scrapeErrorMessage(scraped.reason);
    return NextResponse.json({ error: message }, { status });
  }

  const raw = await callGemini(
    `${PROMPT}\n\nArticle title: ${scraped.page.title ?? "(none)"}\n\nArticle:\n${scraped.page.markdown}`,
    { temperature: 0.1, maxOutputTokens: 700, groqOnly: true },
  );
  const parsed = extractJsonObject<{ is_investing?: boolean; title?: string; approach?: string; rules?: unknown; risks?: string }>(raw);
  if (!parsed) return NextResponse.json({ error: "Couldn't summarize that article. Try another link." }, { status: 422 });
  if (parsed.is_investing === false || !parsed.approach) {
    return NextResponse.json({ error: "That page doesn't seem to describe an investing approach. Try a different article." }, { status: 422 });
  }

  const rules = Array.isArray(parsed.rules) ? parsed.rules.filter((r): r is string => typeof r === "string").slice(0, 6).map((r) => r.slice(0, 160)) : [];
  return NextResponse.json({
    title: String(parsed.title ?? scraped.page.title ?? "Article").slice(0, 140),
    approach: String(parsed.approach).slice(0, 800),
    rules,
    risks: typeof parsed.risks === "string" ? parsed.risks.slice(0, 300) : null,
    url: scraped.page.url,
  });
}
