import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { verifyApiToken } from "@/lib/auth/api-tokens";
import { verifyOAuthAccessToken } from "@/lib/oauth/tokens";
import { PROTECTED_RESOURCE_METADATA_URL } from "@/lib/oauth/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFinnhubQuote } from "@/lib/market-data/finnhub";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// A user's own AI agent (Claude, ChatGPT, etc.) connects here with a personal
// access token from Settings > Connected AI Agents. Read-only by design —
// this is a data source for someone else's agent, not a place BuyTune places
// trades from. See lib/auth/api-tokens.ts for the token model.
//
// Every tool here is a cache/DB read, a watchlist write (touches only
// BuyTune's own tracking data, never a brokerage), or — run_ai_analysis only —
// a cheap free-tier-model call with its own 12h cache. The expensive
// live-search Grok deep-dive and fresh Kronos inference (up to a minute,
// costs real tokens) are deliberately NOT exposed here yet — see
// docs/roadmap/buytune-mcp-agent-access.md for why.

const DISCLAIMER =
  "BuyTune is a software tool, not a registered investment adviser. This data is informational only, not investment advice or a recommendation to buy or sell any security.";

const AI_ANALYSIS_DISCLAIMER =
  DISCLAIMER + " This specific take is a cached, offline-model read — not live, not personalized to your strategy or cost basis.";

const FORECAST_DISCLAIMER =
  DISCLAIMER + " This forecast is a small model-based technical projection (Kronos-mini), not a fundamentals- or news-aware analysis. A backtest run 2026-08-13 found it did not beat a naive no-change baseline — treat it as low-confidence.";

function buildServer(userId: string, origin: string): McpServer {
  const server = new McpServer({ name: "buytune", version: "0.1.0" });

  server.registerTool(
    "get_portfolio",
    {
      title: "Get portfolio",
      description: "Returns the user's active portfolios and current holdings (shares, cost basis) from BuyTune. Read-only.",
      inputSchema: {
        portfolio_id: z.string().uuid().optional().describe("Limit to one portfolio; omit to return all active portfolios."),
      },
    },
    async ({ portfolio_id }) => {
      const admin = createAdminClient();

      let portfolioQuery = admin.from("portfolios")
        .select("id, name, cash_balance, account_type")
        .eq("user_id", userId).eq("is_active", true);
      if (portfolio_id) portfolioQuery = portfolioQuery.eq("id", portfolio_id);
      const { data: portfolios, error: portfolioErr } = await portfolioQuery;
      if (portfolioErr) {
        return { content: [{ type: "text", text: `Error loading portfolios: ${portfolioErr.message}` }], isError: true };
      }

      const portfolioIds = (portfolios ?? []).map((p) => p.id);
      const { data: holdings } = portfolioIds.length > 0
        ? await admin.from("holdings")
            .select("portfolio_id, ticker, company_name, asset_type, shares, average_cost_basis")
            .in("portfolio_id", portfolioIds).eq("user_id", userId)
        : { data: [] };

      const result = {
        disclaimer: DISCLAIMER,
        portfolios: (portfolios ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          account_type: p.account_type,
          cash_balance: Number(p.cash_balance ?? 0),
          holdings: (holdings ?? [])
            .filter((h) => h.portfolio_id === p.id)
            .map((h) => ({
              ticker: h.ticker,
              company_name: h.company_name,
              asset_type: h.asset_type,
              shares: Number(h.shares ?? 0),
              average_cost_basis: h.average_cost_basis != null ? Number(h.average_cost_basis) : null,
            })),
        })),
      };

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "get_recommendation",
    {
      title: "Get AI recommendation",
      description: "Returns BuyTune's cached AI verdict (BUY/HOLD/SELL, conviction, bull/bear case, price target) for a ticker. Shared across all users, not personalized. Read-only, no fresh AI call triggered.",
      inputSchema: { ticker: z.string().min(1).max(12).describe("Stock ticker, e.g. AAPL") },
    },
    async ({ ticker }) => {
      const t = ticker.trim().toUpperCase();
      const admin = createAdminClient();
      const { data } = await admin.from("stock_ai_analyses").select("analysis_text, created_at").eq("ticker", t).maybeSingle();
      if (!data?.analysis_text) {
        return { content: [{ type: "text", text: JSON.stringify({ ticker: t, available: false, note: "No cached recommendation for this ticker yet — ask the user to open it in BuyTune Research first." }) }] };
      }
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(data.analysis_text); } catch {
        return { content: [{ type: "text", text: `Cached recommendation for ${t} is corrupted.` }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify({ ticker: t, disclaimer: AI_ANALYSIS_DISCLAIMER, cached_at: data.created_at, ...parsed }, null, 2) }] };
    }
  );

  server.registerTool(
    "run_ai_analysis",
    {
      title: "Run AI analysis",
      description: "Returns BuyTune's AI verdict for a ticker, regenerating it if the cache is stale (>12h). This is the cheap, free-tier-model 'quick take' — the same one shown on the Research page by default — not the paid live-search Grok deep-dive. Shared across all users, not personalized.",
      inputSchema: {
        ticker: z.string().min(1).max(12).describe("Stock ticker, e.g. AAPL"),
        company_name: z.string().optional().describe("Optional, improves prompt quality"),
      },
    },
    async ({ ticker, company_name }) => {
      const t = ticker.trim().toUpperCase();
      let quote;
      try { quote = await getFinnhubQuote(t); } catch { quote = null; }
      if (!quote || !quote.c) {
        return { content: [{ type: "text", text: `Couldn't find a live price for ${t}.` }], isError: true };
      }
      try {
        const res = await fetch(`${origin}/api/research/ai-analysis`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker: t, company_name: company_name ?? t, price: quote.c, change_pct: quote.dp }),
        });
        const data = await res.json();
        if (!res.ok) return { content: [{ type: "text", text: data?.error ?? "Analysis failed." }], isError: true };
        return { content: [{ type: "text", text: JSON.stringify({ ticker: t, disclaimer: AI_ANALYSIS_DISCLAIMER, ...data }, null, 2) }] };
      } catch {
        return { content: [{ type: "text", text: "Analysis request failed." }], isError: true };
      }
    }
  );

  server.registerTool(
    "get_kronos_forecast",
    {
      title: "Get Kronos price forecast",
      description: "Returns BuyTune's cached Kronos AI price forecast (10-day-ahead OHLCV projection) for a ticker, if one has been generated recently. Read-only, does not trigger a new forecast (that takes up to a minute and is user-initiated in the app).",
      inputSchema: { ticker: z.string().min(1).max(12).describe("Stock ticker, e.g. AAPL") },
    },
    async ({ ticker }) => {
      const t = ticker.trim().toUpperCase();
      const admin = createAdminClient();
      const { data } = await admin.from("kronos_forecasts").select("forecast, pred_len, generated_at").eq("ticker", t).maybeSingle();
      if (!data) {
        return { content: [{ type: "text", text: JSON.stringify({ ticker: t, available: false, note: "No cached forecast for this ticker yet — ask the user to run one from BuyTune Research or Watchlist first." }) }] };
      }
      return { content: [{ type: "text", text: JSON.stringify({ ticker: t, disclaimer: FORECAST_DISCLAIMER, generated_at: data.generated_at, forecast: data.forecast }, null, 2) }] };
    }
  );

  server.registerTool(
    "get_research",
    {
      title: "Get research digest",
      description: "Returns BuyTune's cached AI research digest for a ticker — company overview, recent-news summary, earnings snapshot, financial snapshot, market outlook. Shared across all users, not personalized. Read-only, no fresh AI call triggered (a fresh digest costs a Gemini call and is generated on-demand when a user opens the ticker in the app).",
      inputSchema: { ticker: z.string().min(1).max(12).describe("Stock ticker, e.g. AAPL") },
    },
    async ({ ticker }) => {
      const t = ticker.trim().toUpperCase();
      const admin = createAdminClient();
      const { data } = await admin.from("research_digests").select("data, generated_at").eq("ticker", t).maybeSingle();
      if (!data) {
        return { content: [{ type: "text", text: JSON.stringify({ ticker: t, available: false, note: "No cached research digest for this ticker yet — ask the user to open it in BuyTune Research first." }) }] };
      }
      return { content: [{ type: "text", text: JSON.stringify({ ticker: t, disclaimer: AI_ANALYSIS_DISCLAIMER, generated_at: data.generated_at, ...(data.data as Record<string, unknown>) }, null, 2) }] };
    }
  );

  server.registerTool(
    "get_watchlist",
    {
      title: "Get watchlist",
      description: "Returns the user's BuyTune watchlist — tickers they're tracking with optional price targets and notes. Read-only.",
      inputSchema: {},
    },
    async () => {
      const admin = createAdminClient();
      const { data, error } = await admin.from("watchlist")
        .select("ticker, company_name, target_price, alert_direction, note, created_at")
        .eq("user_id", userId).order("created_at", { ascending: false });
      if (error) return { content: [{ type: "text", text: `Error loading watchlist: ${error.message}` }], isError: true };
      return { content: [{ type: "text", text: JSON.stringify({ disclaimer: DISCLAIMER, watchlist: data ?? [] }, null, 2) }] };
    }
  );

  server.registerTool(
    "add_to_watchlist",
    {
      title: "Add to watchlist",
      description: "Adds a ticker to the user's BuyTune watchlist. This only updates BuyTune's own tracking list — it never places a trade or touches a brokerage account.",
      inputSchema: {
        ticker: z.string().min(1).max(12).describe("Stock ticker, e.g. AAPL"),
        target_price: z.number().positive().optional().describe("Optional price target to get notified about"),
        alert_direction: z.enum(["below", "above"]).optional().describe("'below' = watching for a dip, 'above' = watching for a breakout. Defaults to 'below'."),
        note: z.string().max(300).optional().describe("Optional note on why this is being watched"),
      },
    },
    async ({ ticker, target_price, alert_direction, note }) => {
      const t = ticker.trim().toUpperCase();
      let quote;
      try { quote = await getFinnhubQuote(t); } catch { quote = null; }
      if (!quote || !quote.c || quote.c <= 0) {
        return { content: [{ type: "text", text: `Couldn't find a live price for ${t} — not adding it.` }], isError: true };
      }
      const admin = createAdminClient();
      const { error } = await admin.from("watchlist").insert({
        user_id: userId,
        ticker: t,
        target_price: target_price ?? null,
        alert_direction: alert_direction ?? "below",
        note: note ?? null,
      });
      if (error) {
        const msg = error.code === "23505" ? `${t} is already on the watchlist.` : error.message;
        return { content: [{ type: "text", text: msg }], isError: true };
      }
      return { content: [{ type: "text", text: `Added ${t} to the BuyTune watchlist.` }] };
    }
  );

  return server;
}

async function handle(req: NextRequest): Promise<Response> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  // Two token flavors share this surface: static PATs (bt_live_..., from
  // Settings > Connected AI Agents) and OAuth-issued access tokens
  // (bt_at_..., from the /oauth/authorize consent flow). Prefix picks which
  // table to check — see lib/auth/api-tokens.ts and lib/oauth/tokens.ts.
  const auth = token?.startsWith("bt_at_") ? await verifyOAuthAccessToken(token) : await verifyApiToken(token);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized. Create a token in BuyTune Settings > Connected AI Agents, or connect via OAuth, and send it as a Bearer token." },
      {
        status: 401,
        headers: { "WWW-Authenticate": `Bearer resource_metadata="${PROTECTED_RESOURCE_METADATA_URL}"` },
      }
    );
  }

  // Keyed by user, not IP — an agent's requests may all come from the same
  // provider infrastructure IP regardless of which user it's acting for.
  // Generous ceiling: this is a read-mostly tool surface, the point is
  // catching a runaway/looping agent, not throttling normal interactive use.
  const { limited, retryAfter } = checkRateLimit(`mcp:${auth.userId}`, 60, 60_000);
  if (limited) {
    return NextResponse.json(
      { error: "Rate limited — too many requests. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const server = buildServer(auth.userId, req.nextUrl.origin);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — each request is independent, matches serverless
    enableJsonResponse: true,
  });

  await server.connect(transport);

  const body = req.method === "POST" ? await req.json().catch(() => undefined) : undefined;
  return transport.handleRequest(req, {
    parsedBody: body,
    authInfo: { token: token!, clientId: auth.userId, scopes: ["read"], extra: { userId: auth.userId } },
  });
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
export async function DELETE(req: NextRequest) { return handle(req); }
