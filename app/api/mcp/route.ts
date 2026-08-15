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
import { runGrokDeepDive } from "@/lib/ai/grok-deep-dive";

export const dynamic = "force-dynamic";

// A user's own AI agent (Claude, ChatGPT, etc.) connects here with a personal
// access token from Settings > Connected AI Agents, or via the OAuth consent
// flow (see lib/oauth/). Read-only by design for anything that touches money
// — this is a data/analysis source for someone else's agent (e.g. paired
// with Robinhood's own separate Agentic Trading MCP, which is what actually
// places orders), not a place BuyTune itself places trades from. See
// lib/auth/api-tokens.ts for the token model.
//
// Most tools here are a cache/DB read or a watchlist write (touches only
// BuyTune's own tracking data, never a brokerage). run_ai_analysis is a
// cheap free-tier-model call with its own 12h cache. run_deep_analysis is
// the paid live-search Grok deep-dive — real cost per call, so it carries
// its own per-user daily cap (see DEEP_ANALYSIS_DAILY_CAP below) on top of
// the shared 12h cache. Fresh Kronos inference (up to a minute) is still not
// exposed — see docs/roadmap/buytune-mcp-agent-access.md.

const DISCLAIMER =
  "BuyTune is a software tool, not a registered investment adviser. This data is informational only, not investment advice or a recommendation to buy or sell any security.";

const AI_ANALYSIS_DISCLAIMER =
  DISCLAIMER + " This specific take is a cached, offline-model read — not live, not personalized to your strategy or cost basis.";

const DEEP_ANALYSIS_DISCLAIMER =
  DISCLAIMER + " This is the live-search deep-dive (current news, analyst moves, X sentiment) — still a generic per-ticker take, not personalized to your strategy or cost basis.";

const FORECAST_DISCLAIMER =
  DISCLAIMER + " This forecast is a small model-based technical projection (Kronos-mini), not a fundamentals- or news-aware analysis. A backtest run 2026-08-13 found it did not beat a naive no-change baseline — treat it as low-confidence.";

const FINANCIAL_DISCLAIMER =
  DISCLAIMER + " Personal financial data — income, tax situation, and net worth — shared here to give context for investing decisions, not a complete financial plan.";

// Real-money cost per call (Grok live search) with no fine-grained spend
// controls beyond this — best-effort, in-memory, resets on cold start, same
// tradeoff as every other rate limit in this file. The point is bounding
// worst-case surprise cost from a looping agent, not precision metering.
const DEEP_ANALYSIS_DAILY_CAP = 10;

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
      // holdings has no user_id column — ownership comes entirely through
      // portfolio_id, which portfolioIds is already scoped to above. An
      // earlier .eq("user_id", userId) filter here referenced a column that
      // doesn't exist, so every call silently errored to an empty array —
      // this tool returned zero holdings for every user, always.
      const { data: holdings, error: holdingsErr } = portfolioIds.length > 0
        ? await admin.from("holdings")
            .select("portfolio_id, ticker, company_name, asset_type, shares, average_cost_basis")
            .in("portfolio_id", portfolioIds)
        : { data: [], error: null };
      if (holdingsErr) {
        return { content: [{ type: "text", text: `Error loading holdings: ${holdingsErr.message}` }], isError: true };
      }

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
    "run_deep_analysis",
    {
      title: "Run deep AI analysis (live search)",
      description: `Returns BuyTune's paid live-search Grok deep-dive for a ticker — runs 2-4 live web/X searches (current news, analyst price-target moves, real-time sentiment) before forming a verdict. Slower and more current than run_ai_analysis, which only reads an offline model's cached take. Shared 12h cache across all users, PLUS capped at ${DEEP_ANALYSIS_DAILY_CAP} fresh calls/day for this connection specifically — real money per call. Falls back to the cache when available even after the cap is hit.`,
      inputSchema: {
        ticker: z.string().min(1).max(12).describe("Stock ticker, e.g. AAPL"),
        company_name: z.string().optional().describe("Optional, improves prompt quality"),
      },
    },
    async ({ ticker, company_name }) => {
      const t = ticker.trim().toUpperCase();
      const { limited, retryAfter } = checkRateLimit(`mcp-deepdive:${userId}`, DEEP_ANALYSIS_DAILY_CAP, 24 * 60 * 60 * 1000);
      if (limited) {
        const hours = Math.max(1, Math.ceil(retryAfter / 3600));
        return {
          content: [{ type: "text", text: `Daily deep-analysis budget (${DEEP_ANALYSIS_DAILY_CAP}/day) reached for this connection — resets in about ${hours}h. Use run_ai_analysis or get_recommendation for a free cached take in the meantime.` }],
          isError: true,
        };
      }
      let quote;
      try { quote = await getFinnhubQuote(t); } catch { quote = null; }
      const result = await runGrokDeepDive(t, company_name ?? t, quote?.c, quote?.dp, userId);
      if (result.kind === "error") return { content: [{ type: "text", text: result.error }], isError: true };
      return { content: [{ type: "text", text: JSON.stringify({ ticker: t, disclaimer: DEEP_ANALYSIS_DISCLAIMER, ...result.payload }, null, 2) }] };
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
    "get_strategies",
    {
      title: "Get strategies",
      description: "Returns the user's saved BuyTune investment strategies — free-text guidance, position-sizing limits, cash range, turnover/holding-period preferences — plus which portfolio each is currently assigned to and that portfolio's current holdings. This is the personalized layer on top of the generic per-ticker tools (get_recommendation, get_research, etc). Read-only.",
      inputSchema: {},
    },
    async () => {
      const admin = createAdminClient();
      const { data: strategies, error: stratErr } = await admin.from("strategies")
        .select("id, name, description, style, risk_level, is_public")
        .eq("user_id", userId).eq("is_active", true);
      if (stratErr) return { content: [{ type: "text", text: `Error loading strategies: ${stratErr.message}` }], isError: true };
      if (!strategies || strategies.length === 0) {
        return { content: [{ type: "text", text: JSON.stringify({ disclaimer: DISCLAIMER, strategies: [], note: "No saved strategies yet — ask the user to build one in BuyTune Strategies first." }) }] };
      }

      const strategyIds = strategies.map((s) => s.id);
      const { data: versions } = await admin.from("strategy_versions")
        .select("id, strategy_id, version_number, prompt_text, max_position_pct, min_position_pct, turnover_preference, holding_period_bias, cash_min_pct, cash_max_pct")
        .in("strategy_id", strategyIds).order("version_number", { ascending: false });
      const latestVersionByStrategy = new Map<string, NonNullable<typeof versions>[number]>();
      for (const v of versions ?? []) if (!latestVersionByStrategy.has(v.strategy_id)) latestVersionByStrategy.set(v.strategy_id, v);

      const { data: assignments } = await admin.from("portfolio_strategy_assignments")
        .select("portfolio_id, strategy_id, portfolios(id, name)")
        .in("strategy_id", strategyIds).eq("is_active", true).is("ended_at", null);
      const assignmentByStrategy = new Map((assignments ?? []).map((a) => [a.strategy_id, a]));

      const assignedPortfolioIds = [...new Set((assignments ?? []).map((a) => a.portfolio_id))];
      const { data: holdings } = assignedPortfolioIds.length > 0
        ? await admin.from("holdings")
            .select("portfolio_id, ticker, company_name, asset_type, shares, average_cost_basis")
            .in("portfolio_id", assignedPortfolioIds)
        : { data: [] };

      const result = strategies.map((s) => {
        const v = latestVersionByStrategy.get(s.id);
        const assignment = assignmentByStrategy.get(s.id);
        const portfolio = assignment?.portfolios as { id: string; name: string } | null | undefined;
        return {
          id: s.id,
          name: s.name,
          description: s.description,
          style: s.style,
          risk_level: s.risk_level,
          is_public: s.is_public,
          rules: v ? {
            guidance: v.prompt_text,
            max_position_pct: v.max_position_pct,
            min_position_pct: v.min_position_pct,
            turnover_preference: v.turnover_preference,
            holding_period_bias: v.holding_period_bias,
            cash_min_pct: v.cash_min_pct,
            cash_max_pct: v.cash_max_pct,
          } : null,
          assigned_portfolio: portfolio ? {
            id: portfolio.id,
            name: portfolio.name,
            holdings: (holdings ?? [])
              .filter((h) => h.portfolio_id === portfolio.id)
              .map((h) => ({
                ticker: h.ticker,
                company_name: h.company_name,
                asset_type: h.asset_type,
                shares: Number(h.shares ?? 0),
                average_cost_basis: h.average_cost_basis != null ? Number(h.average_cost_basis) : null,
              })),
          } : null,
        };
      });

      return { content: [{ type: "text", text: JSON.stringify({ disclaimer: DISCLAIMER, strategies: result }, null, 2) }] };
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

  server.registerTool(
    "get_financial_profile",
    {
      title: "Get financial profile",
      description: "Returns the user's BuyTune financial profile — risk tolerance, retirement horizon, tax filing status/state, income, expenses, and emergency-fund/surplus settings. Context for investing decisions (time horizon, tax bracket, how much is actually safe to risk), not a full financial plan. Read-only.",
      inputSchema: {},
    },
    async () => {
      const admin = createAdminClient();
      const { data, error } = await admin.from("financial_profiles")
        .select("date_of_birth, target_retirement_age, risk_tolerance, gross_monthly_income, monthly_expenses, filing_status, state_code, income_type, emergency_fund_months, surplus_to_invest_pct, has_401k, k401_current_balance")
        .eq("user_id", userId).maybeSingle();
      if (error) return { content: [{ type: "text", text: `Error loading financial profile: ${error.message}` }], isError: true };
      if (!data) {
        return { content: [{ type: "text", text: JSON.stringify({ disclaimer: FINANCIAL_DISCLAIMER, available: false, note: "No financial profile set up yet — ask the user to fill one out in BuyTune Planning first." }) }] };
      }
      return { content: [{ type: "text", text: JSON.stringify({ disclaimer: FINANCIAL_DISCLAIMER, ...data }, null, 2) }] };
    }
  );

  server.registerTool(
    "get_net_worth_summary",
    {
      title: "Get net worth summary",
      description: "Returns the user's current total assets, liabilities, net worth, and portfolio value, plus a recent daily history for trend. Read-only.",
      inputSchema: {
        history_days: z.number().int().min(1).max(180).optional().describe("How many recent days of history to include (default 30)."),
      },
    },
    async ({ history_days }) => {
      const admin = createAdminClient();
      const limit = history_days ?? 30;
      const { data, error } = await admin.from("net_worth_history")
        .select("snapshot_date, total_assets, total_liabilities, net_worth, portfolio_value")
        .eq("user_id", userId).order("snapshot_date", { ascending: false }).limit(limit);
      if (error) return { content: [{ type: "text", text: `Error loading net worth history: ${error.message}` }], isError: true };
      if (!data || data.length === 0) {
        return { content: [{ type: "text", text: JSON.stringify({ disclaimer: FINANCIAL_DISCLAIMER, available: false, note: "No net worth history yet — ask the user to open BuyTune Planning at least once." }) }] };
      }
      const history = data.slice().reverse();
      return { content: [{ type: "text", text: JSON.stringify({ disclaimer: FINANCIAL_DISCLAIMER, current: history[history.length - 1], history }, null, 2) }] };
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
