// Server-only pulse calculation layer.
// Consumes RedditPost[] and produces a structured RedditPulseData snapshot.
// Gemini is used for richer theme/risk extraction when available; basic keyword
// analysis is the fallback so the feature always returns something useful.

import type { RedditPost } from "./reddit";

// ─── Public types ──────────────────────────────────────────────────────────────

export type SubredditBreakdown = {
  subreddit: string;
  post_count: number;
  sentiment: "bullish" | "bearish" | "neutral" | "mixed";
  sentiment_label: string;
};

export type SourceLink = {
  subreddit: string;
  title: string;
  score: number;
  comment_count: number;
  created_utc: number;
  permalink: string;
  // Intentionally omits author/username fields
};

export type RedditPulseData = {
  ticker: string;
  company_name: string;
  time_window: "week" | "month";
  fetched_at: string;
  expires_at: string;
  post_count: number;
  mention_count: number;
  bullish_pct: number;
  bearish_pct: number;
  neutral_pct: number;
  sentiment_score: number;       // -100 to +100
  hype_score: number;            // 0–100 (higher = more speculative / meme-driven)
  conviction_score: number;      // 0–100 (higher = more fundamental / DD-driven)
  reddit_pulse_score: number;    // 0–100 overall signal quality
  sentiment_label: string;
  top_themes: string[];
  top_bullish_themes: string[];
  top_bearish_themes: string[];
  top_risks: string[];
  top_catalysts: string[];
  subreddit_breakdown: SubredditBreakdown[];
  source_post_links: SourceLink[];
  summary: string;
  ai_powered: boolean;
  stale?: boolean;
};

// ─── Keyword sets ──────────────────────────────────────────────────────────────

const BULLISH_TERMS = new Set([
  "bullish", "bull", "buy", "long", "calls", "moon", "upside", "upgrade",
  "strong", "beat", "outperform", "growth", "breakout", "surge", "rally",
  "accumulate", "undervalued", "opportunity", "green", "rip", "pump",
  "bounce", "recover", "uptrend", "oversold", "squeeze", "upward",
]);

const BEARISH_TERMS = new Set([
  "bearish", "bear", "sell", "short", "puts", "overvalued", "downgrade",
  "miss", "decline", "warning", "concern", "risky", "expensive",
  "correction", "resistance", "crash", "dump", "red", "fade",
  "bagholding", "overbought", "downtrend", "headwind",
]);

const MEME_TERMS = [
  "moon", "🚀", "💎", "tendies", "yolo", "apes", "ape",
  "diamond hands", "wsb", "gamma squeeze", "0dte", "degenerate",
];

const CONVICTION_TERMS = new Set([
  "dd", "due diligence", "thesis", "analysis", "fundamentals",
  "p/e", "forward p/e", "revenue", "margin", "earnings", "eps",
  "ebitda", "free cash flow", "price target", "dcf", "valuation",
  "debt", "cash flow", "growth rate", "pe ratio", "quarterly",
  "annual report", "guidance", "balance sheet",
]);

const CATALYST_TERMS = [
  "earnings", "guidance", "launch", "partnership", "acquisition",
  "fda", "approval", "contract", "deal", "upgrade", "announce",
  "report", "conference", "catalyst", "beat", "miss",
];

const RISK_TERMS = [
  "inventory", "competition", "dilution", "debt", "recession",
  "macro", "fed", "regulation", "regulatory", "concern", "risk",
  "overvalued", "correction", "miss", "downgrade", "guidance cut",
  "margin compression", "demand", "slowdown",
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function classifyPost(post: RedditPost): "bullish" | "bearish" | "neutral" {
  const words = tokenize(`${post.title} ${post.text}`);
  let bullish = 0;
  let bearish = 0;
  for (const word of words) {
    if (BULLISH_TERMS.has(word)) bullish++;
    if (BEARISH_TERMS.has(word)) bearish++;
  }
  if (bullish > bearish + 1) return "bullish";
  if (bearish > bullish + 1) return "bearish";
  return "neutral";
}

// ─── Metric calculators ────────────────────────────────────────────────────────

function calcSentiment(posts: RedditPost[]): {
  bullish_pct: number;
  bearish_pct: number;
  neutral_pct: number;
  sentiment_score: number;
  sentiment_label: string;
} {
  if (posts.length === 0) {
    return { bullish_pct: 0, bearish_pct: 0, neutral_pct: 0, sentiment_score: 0, sentiment_label: "Insufficient Data" };
  }

  let b = 0, br = 0, n = 0;
  for (const p of posts) {
    const c = classifyPost(p);
    if (c === "bullish") b++;
    else if (c === "bearish") br++;
    else n++;
  }

  const total = posts.length;
  const bp = Math.round((b / total) * 100);
  const brp = Math.round((br / total) * 100);
  const np = Math.max(0, 100 - bp - brp);
  const score = Math.round(((b - br) / total) * 100);

  let label = "Neutral";
  if (score >= 60) label = "Very Bullish";
  else if (score >= 30) label = "Bullish";
  else if (score >= 10) label = "Moderately Bullish";
  else if (score <= -60) label = "Very Bearish";
  else if (score <= -30) label = "Bearish";
  else if (score <= -10) label = "Moderately Bearish";
  else if (bp > 35 && brp > 25) label = "Mixed";

  return { bullish_pct: bp, bearish_pct: brp, neutral_pct: np, sentiment_score: score, sentiment_label: label };
}

function calcHypeScore(posts: RedditPost[]): number {
  if (posts.length === 0) return 0;

  let score = 20;

  // WSB concentration
  const wsbRatio = posts.filter((p) => p.subreddit.toLowerCase() === "wallstreetbets").length / posts.length;
  if (wsbRatio > 0.5) score += 35;
  else if (wsbRatio > 0.3) score += 20;
  else if (wsbRatio > 0.1) score += 10;

  // Meme/emoji language density
  let memeCount = 0;
  for (const p of posts) {
    const text = `${p.title} ${p.text}`.toLowerCase();
    for (const term of MEME_TERMS) {
      if (text.includes(term)) memeCount++;
    }
  }
  const memeDensity = memeCount / posts.length;
  if (memeDensity > 2) score += 25;
  else if (memeDensity > 1) score += 15;
  else if (memeDensity > 0.5) score += 8;

  // Options language
  const optionsRatio = posts.filter((p) => {
    const t = `${p.title} ${p.text}`.toLowerCase();
    return t.includes("calls") || t.includes("puts") || t.includes("0dte") || t.includes("gamma");
  }).length / posts.length;
  if (optionsRatio > 0.3) score += 10;

  return Math.min(100, Math.max(0, score));
}

function calcConvictionScore(posts: RedditPost[]): number {
  if (posts.length === 0) return 0;

  let score = 10;

  // DD-labeled posts (strongest signal)
  const ddPosts = posts.filter((p) => {
    const t = p.title.toLowerCase();
    return t.includes(" dd") || t.includes("[dd]") || t.includes("due diligence") || t.startsWith("dd:");
  });
  score += Math.min(35, ddPosts.length * 8);

  // Posts with multiple fundamental analysis terms
  let fundCount = 0;
  for (const p of posts) {
    const text = `${p.title} ${p.text}`.toLowerCase();
    let hits = 0;
    for (const term of CONVICTION_TERMS) {
      if (text.includes(term)) hits++;
    }
    if (hits >= 2) fundCount++;
  }
  score += Math.min(25, fundCount * 3);

  // Longer posts (more substantive)
  const longPosts = posts.filter((p) => p.text.length > 200);
  score += Math.min(15, longPosts.length * 2);

  // High-score posts (community validated)
  const highScore = posts.filter((p) => p.score > 100);
  score += Math.min(15, highScore.length * 3);

  return Math.min(100, Math.max(0, score));
}

function calcPulseScore(
  bullish_pct: number,
  bearish_pct: number,
  conviction_score: number,
  hype_score: number,
  post_count: number
): number {
  const sentimentContrib = ((bullish_pct - bearish_pct + 100) / 200) * 40;
  const convictionContrib = (conviction_score / 100) * 30;
  const hypeContrib = ((100 - hype_score) / 100) * 15; // high hype reduces reliability
  const volumeContrib = (Math.min(post_count, 25) / 25) * 15;
  return Math.round(Math.min(100, Math.max(0, sentimentContrib + convictionContrib + hypeContrib + volumeContrib)));
}

function calcSubredditBreakdown(posts: RedditPost[]): SubredditBreakdown[] {
  const map = new Map<string, RedditPost[]>();
  for (const p of posts) {
    map.set(p.subreddit, [...(map.get(p.subreddit) ?? []), p]);
  }
  return Array.from(map.entries())
    .map(([sub, subPosts]) => {
      const { bullish_pct, bearish_pct, sentiment_label } = calcSentiment(subPosts);
      let sentiment: "bullish" | "bearish" | "neutral" | "mixed" = "neutral";
      if (bullish_pct >= 60) sentiment = "bullish";
      else if (bearish_pct >= 50) sentiment = "bearish";
      else if (bullish_pct > 30 && bearish_pct > 25) sentiment = "mixed";
      return { subreddit: sub, post_count: subPosts.length, sentiment, sentiment_label };
    })
    .sort((a, b) => b.post_count - a.post_count);
}

function extractFromPosts(posts: RedditPost[], terms: string[]): string[] {
  const counts = new Map<string, number>();
  for (const p of posts) {
    const text = `${p.title} ${p.text}`.toLowerCase();
    for (const term of terms) {
      if (text.includes(term)) counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([t]) => t);
}

function topSourceLinks(posts: RedditPost[], limit = 5): SourceLink[] {
  return [...posts]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((p) => ({
      subreddit: p.subreddit,
      title: p.title,
      score: p.score,
      comment_count: p.commentCount,
      created_utc: p.createdUtc,
      permalink: p.permalink,
    }));
}

// ─── Gemini AI classification ──────────────────────────────────────────────────

type GeminiRedditResult = {
  sentiment_label?: string;
  bullish_pct?: number;
  bearish_pct?: number;
  neutral_pct?: number;
  top_themes?: string[];
  top_bullish_themes?: string[];
  top_bearish_themes?: string[];
  top_risks?: string[];
  top_catalysts?: string[];
  hype_score?: number;
  conviction_score?: number;
  summary?: string;
};

async function getGeminiRedditSummary(
  ticker: string,
  companyName: string,
  posts: RedditPost[]
): Promise<GeminiRedditResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || posts.length === 0) return null;

  // Send top 15 posts by score; compact format to stay within token budget
  const topPosts = [...posts].sort((a, b) => b.score - a.score).slice(0, 15);
  const postTexts = topPosts
    .map(
      (p, i) =>
        `${i + 1}. [r/${p.subreddit}] ${p.title}` +
        (p.text ? `\n   ${p.text.slice(0, 150)}` : "")
    )
    .join("\n\n");

  const prompt = `Analyze these ${topPosts.length} Reddit posts discussing ${ticker} (${companyName}) from the past week. Be specific — reference actual discussion themes, not generic finance commentary. Respond ONLY with valid JSON (no markdown):

${postTexts}

{
  "sentiment_label": "Very Bullish|Bullish|Moderately Bullish|Neutral|Mixed|Moderately Bearish|Bearish|Very Bearish",
  "bullish_pct": 0-100,
  "bearish_pct": 0-100,
  "neutral_pct": 0-100,
  "top_themes": ["3-5 specific discussion themes"],
  "top_bullish_themes": ["2-3 main bullish arguments with specifics"],
  "top_bearish_themes": ["2-3 main bearish concerns with specifics"],
  "top_risks": ["2-3 specific risk factors mentioned in posts"],
  "top_catalysts": ["2-3 upcoming catalysts mentioned"],
  "hype_score": 0-100,
  "conviction_score": 0-100,
  "summary": "2-3 sentence summary covering sentiment, top themes, and standout risks or catalysts"
}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 900, temperature: 0.2 },
        }),
        cache: "no-store",
      }
    );

    if (!res.ok) return null;
    const data = await res.json();
    const raw: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]) as GeminiRedditResult;
  } catch {
    return null;
  }
}

// ─── Main builder ──────────────────────────────────────────────────────────────

export async function buildRedditPulse(
  ticker: string,
  companyName: string,
  posts: RedditPost[],
  timeWindow: "week" | "month" = "week",
  ttlMinutes = 120
): Promise<RedditPulseData> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

  const basic = calcSentiment(posts);
  const hype = calcHypeScore(posts);
  const conviction = calcConvictionScore(posts);
  const pulse = calcPulseScore(basic.bullish_pct, basic.bearish_pct, conviction, hype, posts.length);
  const subredditBreakdown = calcSubredditBreakdown(posts);
  const basicCatalysts = extractFromPosts(posts, CATALYST_TERMS);
  const basicRisks = extractFromPosts(posts, RISK_TERMS);
  const sourceLinks = topSourceLinks(posts);

  // Gemini provides richer theme/risk extraction when available
  const ai = await getGeminiRedditSummary(ticker, companyName, posts);
  const aiPowered = ai !== null;

  return {
    ticker: ticker.toUpperCase(),
    company_name: companyName,
    time_window: timeWindow,
    fetched_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    post_count: posts.length,
    mention_count: posts.length,
    bullish_pct: ai?.bullish_pct ?? basic.bullish_pct,
    bearish_pct: ai?.bearish_pct ?? basic.bearish_pct,
    neutral_pct: ai?.neutral_pct ?? basic.neutral_pct,
    sentiment_score: basic.sentiment_score,
    hype_score: ai?.hype_score ?? hype,
    conviction_score: ai?.conviction_score ?? conviction,
    reddit_pulse_score: pulse,
    sentiment_label: ai?.sentiment_label ?? basic.sentiment_label,
    top_themes: ai?.top_themes ?? [],
    top_bullish_themes: ai?.top_bullish_themes ?? [],
    top_bearish_themes: ai?.top_bearish_themes ?? [],
    top_risks: ai?.top_risks ?? basicRisks,
    top_catalysts: ai?.top_catalysts ?? basicCatalysts,
    subreddit_breakdown: subredditBreakdown,
    source_post_links: sourceLinks,
    summary:
      ai?.summary ??
      `${posts.length} Reddit posts analyzed. Sentiment: ${basic.sentiment_label}. Conviction: ${conviction}/100. Hype Risk: ${hype}/100.`,
    ai_powered: aiPowered,
  };
}
