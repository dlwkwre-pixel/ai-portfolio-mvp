// Server-only — requires Node.js runtime (uses Buffer.from for base64 encoding).
// Never import this from client components.

export type RedditPost = {
  id: string;
  subreddit: string;
  title: string;
  text: string;          // selftext, capped at 500 chars
  score: number;
  commentCount: number;
  createdUtc: number;
  permalink: string;
  upvoteRatio: number;
};

export const DEFAULT_SUBREDDITS = [
  "stocks",
  "investing",
  "wallstreetbets",
  "options",
  "SecurityAnalysis",
  "ValueInvesting",
  "dividends",
];

// Tickers that are common English words — only safe to match via $TICKER or company name
const COMMON_WORD_TICKERS = new Set([
  "A", "I", "T", "W",
  "AN", "AS", "AT", "BE", "DO", "GO", "HE", "IF", "IN", "IS", "IT",
  "ME", "NO", "OF", "ON", "OR", "PM", "US", "WE",
  "AI", "ALL", "AND", "ARE", "FOR", "GET", "NEW", "NOW", "OLD", "THE",
]);

export function isCommonWordTicker(ticker: string): boolean {
  return COMMON_WORD_TICKERS.has(ticker.toUpperCase());
}

// Build ordered list of search queries for a ticker (most specific first)
export function buildSearchQueries(ticker: string, companyName: string): string[] {
  const t = ticker.toUpperCase();
  const queries: string[] = [`$${t}`];
  if (companyName && companyName.length > 3 && companyName.toLowerCase() !== t.toLowerCase()) {
    queries.push(companyName);
  }
  if (!isCommonWordTicker(t) && t.length >= 3) {
    queries.push(t);
  }
  return queries;
}

// Post-fetch filter: ensure a post is genuinely about the ticker, not a false positive
export function verifyTickerMention(text: string, ticker: string, companyName: string): boolean {
  if (!text) return false;
  const t = ticker.toUpperCase();

  // $TICKER pattern is always a definitive match
  if (text.toUpperCase().includes(`$${t}`)) return true;

  // Company name match (case-insensitive)
  if (companyName && companyName.length > 3 && text.toLowerCase().includes(companyName.toLowerCase())) return true;

  // Common-word tickers: require $TICKER or company name — already checked above
  if (isCommonWordTicker(t)) return false;

  // Word-boundary check for normal tickers (3+ chars)
  const re = new RegExp(`(?:^|[\\s,(\\[/$])${t}(?:$|[\\s.,;:!?)\\]/])`, "i");
  return re.test(text);
}

// ─── Auth ──────────────────────────────────────────────────────────────────────

function getCredentials(): { clientId: string; clientSecret: string; userAgent: string } | null {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const userAgent =
    process.env.REDDIT_USER_AGENT ?? "BuyTuneSocialPulse/0.1 by u/Terrible-Day-4023";
  return { clientId, clientSecret, userAgent };
}

// Module-level token cache (best-effort; survives across warm lambda invocations)
let _cachedToken: { token: string; expiresAt: number } | null = null;

async function fetchOAuthToken(
  clientId: string,
  clientSecret: string,
  userAgent: string
): Promise<string> {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "User-Agent": userAgent,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Reddit auth failed: ${res.status}`);
  const data = await res.json();
  if (!data.access_token) throw new Error("No access_token in Reddit OAuth response");
  return data.access_token as string;
}

async function getToken(): Promise<{ token: string; userAgent: string } | null> {
  const creds = getCredentials();
  if (!creds) return null;

  const now = Date.now();
  // Reuse cached token if it has > 2 minutes remaining
  if (_cachedToken && _cachedToken.expiresAt > now + 120_000) {
    return { token: _cachedToken.token, userAgent: creds.userAgent };
  }

  try {
    const token = await fetchOAuthToken(creds.clientId, creds.clientSecret, creds.userAgent);
    _cachedToken = { token, expiresAt: now + 55 * 60 * 1000 }; // 55 min (token valid 60 min)
    return { token, userAgent: creds.userAgent };
  } catch {
    return null;
  }
}

// ─── Rate Limit ────────────────────────────────────────────────────────────────

// Module-level tracking (best-effort within a lambda invocation)
let _rateLimitRemaining = 60;
let _rateLimitResetAt = 0; // Unix seconds

function updateRateLimit(headers: Headers) {
  const rem = headers.get("x-ratelimit-remaining");
  const reset = headers.get("x-ratelimit-reset");
  if (rem !== null) _rateLimitRemaining = parseFloat(rem);
  if (reset !== null) _rateLimitResetAt = parseInt(reset, 10);
}

async function guardRateLimit() {
  if (_rateLimitRemaining < 3) {
    const waitMs = Math.max(500, _rateLimitResetAt * 1000 - Date.now() + 500);
    if (waitMs > 0 && waitMs < 65_000) {
      await new Promise((r) => setTimeout(r, waitMs));
      _rateLimitRemaining = 60;
    }
  }
}

// ─── HTTP ──────────────────────────────────────────────────────────────────────

async function redditGet(url: string, token: string, userAgent: string): Promise<unknown | null> {
  await guardRateLimit();
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": userAgent },
      cache: "no-store",
    });
    updateRateLimit(res.headers);

    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 5000));
      const retry = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": userAgent },
        cache: "no-store",
      });
      updateRateLimit(retry.headers);
      if (!retry.ok) return null;
      return retry.json();
    }

    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ─── Post normalization ────────────────────────────────────────────────────────

function normalizePost(raw: Record<string, unknown>): RedditPost {
  return {
    id: String(raw.id ?? ""),
    subreddit: String(raw.subreddit ?? ""),
    title: String(raw.title ?? "").slice(0, 300),
    text: String(raw.selftext ?? "").slice(0, 500),
    score: Number(raw.score ?? 0),
    commentCount: Number(raw.num_comments ?? 0),
    createdUtc: Number(raw.created_utc ?? 0),
    permalink: `https://reddit.com${String(raw.permalink ?? "")}`,
    upvoteRatio: Number(raw.upvote_ratio ?? 0),
  };
}

// ─── Main search ───────────────────────────────────────────────────────────────

export async function searchRedditPosts(
  ticker: string,
  companyName: string,
  options: {
    timeWindow?: "week" | "month";
    subreddits?: string[];
    maxPerSubreddit?: number;
  } = {}
): Promise<RedditPost[]> {
  const auth = await getToken();
  if (!auth) return [];

  const { token, userAgent } = auth;
  const {
    timeWindow = "week",
    subreddits = DEFAULT_SUBREDDITS,
    maxPerSubreddit = 8,
  } = options;

  const primaryQuery = `$${ticker.toUpperCase()}`;
  const allPosts: RedditPost[] = [];
  const seenIds = new Set<string>();

  // Search each configured subreddit
  for (const sub of subreddits) {
    const url =
      `https://oauth.reddit.com/r/${sub}/search` +
      `?q=${encodeURIComponent(primaryQuery)}` +
      `&restrict_sr=1&sort=relevance&t=${timeWindow}&limit=${maxPerSubreddit}&type=link`;

    const data = await redditGet(url, token, userAgent);
    const children: unknown[] = (data as any)?.data?.children ?? [];

    for (const child of children) {
      const post = normalizePost((child as any).data ?? {});
      const combined = `${post.title} ${post.text}`;
      if (post.id && !seenIds.has(post.id) && verifyTickerMention(combined, ticker, companyName)) {
        seenIds.add(post.id);
        allPosts.push(post);
      }
    }

    // Polite delay between subreddit requests
    await new Promise((r) => setTimeout(r, 350));
  }

  // If too few results and not a common-word ticker, do a global search too
  if (allPosts.length < 5 && !isCommonWordTicker(ticker)) {
    const globalUrl =
      `https://oauth.reddit.com/search` +
      `?q=${encodeURIComponent(primaryQuery)}` +
      `&sort=relevance&t=${timeWindow}&limit=15&type=link`;

    const data = await redditGet(globalUrl, token, userAgent);
    const children: unknown[] = (data as any)?.data?.children ?? [];

    for (const child of children) {
      const post = normalizePost((child as any).data ?? {});
      const combined = `${post.title} ${post.text}`;
      if (post.id && !seenIds.has(post.id) && verifyTickerMention(combined, ticker, companyName)) {
        seenIds.add(post.id);
        allPosts.push(post);
      }
    }
  }

  return allPosts;
}
