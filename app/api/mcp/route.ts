import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { verifyApiToken } from "@/lib/auth/api-tokens";
import { verifyOAuthAccessToken } from "@/lib/oauth/tokens";
import { PROTECTED_RESOURCE_METADATA_URL } from "@/lib/oauth/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFinnhubQuote } from "@/lib/market-data/finnhub";
import { checkRateLimit, getIp } from "@/lib/rate-limit";
import { runGrokDeepDive } from "@/lib/ai/grok-deep-dive";
import { runXSentimentCheck } from "@/lib/ai/x-sentiment";
import { getCongressActivity, getCongressTradesForTicker } from "@/lib/market-data/congress";
import { searchRedditPosts, searchRedditPostsPublic } from "@/lib/market-data/reddit";
import { buildRedditPulse } from "@/lib/market-data/reddit-pulse";
import { fetchApeWisdomData } from "@/lib/market-data/apewisdom";
import { fetchTradestieData } from "@/lib/market-data/tradestie";
import { getStockGeistSentiment } from "@/lib/market-data/stockgeist";
import { recordPortfolioTransaction } from "@/lib/portfolio/record-transaction";

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

const X_SENTIMENT_DISCLAIMER =
  DISCLAIMER + " Reflects current X/Twitter chatter only — social sentiment is not a fundamental or technical signal and can be wrong, manipulated, or hype-driven.";

const CONGRESS_DISCLAIMER =
  DISCLAIMER + " Congressional trades are disclosed up to 45 days after the fact — this reflects a position taken in the past, not a live signal, and disclosure timing/amount ranges are approximate.";

const REGIME_DISCLAIMER =
  DISCLAIMER + " A macro/market-wide read (breadth, volatility, yield curve, geopolitical signal) — says nothing about any specific ticker.";

const REDDIT_DISCLAIMER =
  DISCLAIMER + " Retail sentiment from Reddit/social discussion — prone to hype, meme-driven moves, and coordinated posting. A crowd signal, not a fundamental or technical one.";

// The same discipline BuyTune's own Grok-based tools (run_deep_analysis,
// get_recommendation) are instructed to follow — offered as data so an
// agent synthesizing across multiple BuyTune tools + its own research
// produces a comparably-structured verdict, instead of freelancing a
// different format every time. Keep in sync with lib/ai/grok-deep-dive.ts's
// SYSTEM_PROMPT by hand if that ever changes materially.
const ANALYSIS_FRAMEWORK = {
  role: "Act as a sharp institutional equity analyst. Use current information — recent news, earnings, price action, analyst moves, real-time sentiment — never rely on stale training data for prices or events.",
  method: "Before forming a view: check BuyTune's cached/fresh data (get_recommendation, get_research, get_kronos_forecast), check real-time signal (get_x_sentiment, get_reddit_sentiment), check context (get_congress_trades, get_market_regime), and weigh all of it against the user's actual strategy rules (get_strategies) and risk tolerance (get_financial_profile) — not just the ticker in isolation.",
  verdict_schema: {
    verdict: "BUY, HOLD, or SELL",
    conviction: "Low, Medium, or High",
    price_target: "12-month price target as a number, or null if not estimable",
    bull_case: "2-3 specific bullish arguments citing actual fundamentals/catalysts, not generic optimism",
    bear_case: "2-3 specific bearish arguments citing actual risks/headwinds, not generic caution",
    key_catalysts: "Near-term events/trends that could move the position, with dates if known",
    key_risks: "Main downside risks, specific to this position",
    takeaway: "One sentence, stated plainly, no hedging",
  },
  discipline: "Cite the specific data point behind every claim (a strategy rule, a recommendation verdict, a scan signal, a sentiment read) — no vague justifications. This is the same standard log_trading_decision's reasoning field should meet.",
};

// Deliberately generic — no reference to any one user's specific strategy.
// Works for whatever strategy is assigned to whatever portfolio is being
// traded; the agent is expected to fetch get_strategies() fresh each run for
// the actual rules (position sizing, style, sell criteria), not assume them.
// This is what makes an unattended scheduled task's own instructions stay
// short and durable — the process lives here and updates for everyone the
// moment this changes, instead of being copy-pasted into every user's own
// task config and going stale.
const TRADING_ROUTINE = {
  applies_to: "Any portfolio with a strategy assigned via BuyTune's Strategy Builder, traded through a connected brokerage's own execution tools (e.g. Robinhood's Agentic Trading MCP).",
  per_run: [
    "Identify which BuyTune portfolio this account corresponds to (get_portfolio) and fetch get_strategies() FRESH — never rely on a cached or remembered copy of the rules, since they can change between runs.",
    "Find the strategy assigned to that portfolio and treat its rules, stop-loss, and any routine guidance in its own text as authoritative for this run — this generic routine covers workflow, the strategy covers what/when specifically.",
    "For candidate generation (typically the first run of the trading day): use whatever scanner tools are available (e.g. a connected brokerage's own screening tools) to find candidates matching the strategy's stated style/criteria.",
    "Check cheap/free BuyTune data first (get_recommendation, get_research, get_kronos_forecast) before spending on paid tools (run_deep_analysis, get_x_sentiment) — narrow to the strongest 1-2 candidates before going deeper.",
    "Weigh findings against get_financial_profile (risk tolerance, suitability) in addition to the strategy's own rules.",
    "For follow-up runs the same day (e.g. an afternoon check): re-evaluate existing positions under this strategy against its sell/stop-loss rules using current price/volume, rather than re-scanning for new candidates.",
    "Size the position in dollars first — the strategy's max/min position % times the portfolio's CURRENT total value (not a cached figure) — then convert to a share count using a live quote from the brokerage's own tools at the moment of execution. Never size a position off a price cached in any BuyTune tool's output (a Kronos forecast, a research digest, a quote from earlier in this run) — by execution time it may be stale.",
    "Execute via the connected brokerage's own trading tools if warranted (respect that tool's own confirmation/review behavior).",
    "After any executed trade, call record_trade so BuyTune's own portfolio stays current without needing a separate paid sync service — this is in addition to, not instead of, whatever the brokerage itself reports.",
    "Always call log_trading_decision — for every candidate considered, not just executed trades — citing the specific data behind the call. Include the portfolio_id so it lands in the right digest.",
  ],
  note: "This routine describes workflow only. It never authorizes a specific trade by itself — the strategy's rules and the user's own standing instructions to the agent (e.g. approval requirements) govern that.",
};

// Real-money cost per call (Grok live search) with no fine-grained spend
// controls beyond this — best-effort, in-memory, resets on cold start, same
// tradeoff as every other rate limit in this file. The point is bounding
// worst-case surprise cost from a looping agent, not precision metering.
const DEEP_ANALYSIS_DAILY_CAP = 10;
// Cheaper per call than the full deep-dive (X search only, no general web
// search, much shorter output) — headroom to check sentiment on every scan
// candidate, not just the one that clears a first pass.
const X_SENTIMENT_DAILY_CAP = 30;

// Real-time-ish alerting for anything that actually touched a portfolio,
// e.g. a scheduled/unattended agent run — otherwise the only record is the
// next evening's email digest, hours after the fact. Same per-user
// app_notifications insert already used by the watchlist/dividend/radar
// crons, just triggered from an MCP write instead of a cron tick. Awaited
// (not fire-and-forget): a silently-dropped alert defeats the entire point.
async function notifyUser(admin: ReturnType<typeof createAdminClient>, userId: string, title: string, body: string): Promise<void> {
  try {
    await admin.from("app_notifications").insert({ title, body, target_user_id: userId });
  } catch {
    // non-fatal — the daily digest is still the backstop
  }
}

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
    "get_analysis_framework",
    {
      title: "Get analysis framework",
      description: "Returns the same analytical discipline BuyTune's own Grok-based tools (run_deep_analysis, get_recommendation) are instructed to follow — role framing, which tools to check before forming a view, the structured verdict schema (verdict/conviction/price_target/bull_case/bear_case/catalysts/risks/takeaway), and the citation discipline expected in log_trading_decision. Worth calling once at the start of a reasoning session so any synthesis across multiple BuyTune tools comes out consistently structured. Static reference data, no cost.",
      inputSchema: {},
    },
    async () => {
      return { content: [{ type: "text", text: JSON.stringify(ANALYSIS_FRAMEWORK, null, 2) }] };
    }
  );

  server.registerTool(
    "get_trading_routine",
    {
      title: "Get trading routine",
      description: "Returns the generic workflow for running an unattended/scheduled trading routine against a BuyTune-strategy-managed portfolio — what order to check things in, when to use cheap vs. paid tools, and to always fetch get_strategies() fresh rather than relying on remembered rules. Strategy-agnostic: works for any user's own strategy, not any one specific one. Meant to keep a scheduled task's own instructions short and self-updating — call this instead of hardcoding the process into the task config. Static reference data, no cost.",
      inputSchema: {},
    },
    async () => {
      return { content: [{ type: "text", text: JSON.stringify(TRADING_ROUTINE, null, 2) }] };
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
    "get_x_sentiment",
    {
      title: "Get X (Twitter) sentiment",
      description: `Live X/Twitter-only search for a ticker — current sentiment, notable mentions, and hype/pump red flags. Deliberately narrow: no general web search, no bull/bear verdict (an agent with its own web search, like Claude's native search, already covers that — this fills the one gap generic web search doesn't: real, current X content). Cheaper than run_deep_analysis, with its own 6h shared cache and a ${X_SENTIMENT_DAILY_CAP}/day cap for this connection.`,
      inputSchema: {
        ticker: z.string().min(1).max(12).describe("Stock ticker, e.g. AAPL"),
        company_name: z.string().optional().describe("Optional, improves search quality"),
      },
    },
    async ({ ticker, company_name }) => {
      const t = ticker.trim().toUpperCase();
      const { limited, retryAfter } = checkRateLimit(`mcp-xsentiment:${userId}`, X_SENTIMENT_DAILY_CAP, 24 * 60 * 60 * 1000);
      if (limited) {
        const hours = Math.max(1, Math.ceil(retryAfter / 3600));
        return {
          content: [{ type: "text", text: `Daily X-sentiment budget (${X_SENTIMENT_DAILY_CAP}/day) reached for this connection — resets in about ${hours}h.` }],
          isError: true,
        };
      }
      const result = await runXSentimentCheck(t, company_name ?? t, userId);
      if (result.kind === "error") return { content: [{ type: "text", text: result.error }], isError: true };
      return { content: [{ type: "text", text: JSON.stringify({ ticker: t, disclaimer: X_SENTIMENT_DISCLAIMER, ...result.payload }, null, 2) }] };
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
      description: "Returns the user's saved BuyTune investment strategies — free-text guidance, position-sizing limits, cash range, turnover/holding-period preferences — plus every portfolio each is currently assigned to (a strategy can be assigned to more than one) and each of those portfolios' current holdings. This is the personalized layer on top of the generic per-ticker tools (get_recommendation, get_research, etc). Read-only.",
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

      // A strategy can be assigned to more than one portfolio at once — group
      // by strategy_id instead of taking one arbitrary row per strategy
      // (a Map keyed by strategy_id would silently drop every assignment but
      // the last one returned, with no guaranteed order from the DB).
      const { data: assignments } = await admin.from("portfolio_strategy_assignments")
        .select("portfolio_id, strategy_id, portfolios(id, name)")
        .in("strategy_id", strategyIds).eq("is_active", true).is("ended_at", null);
      const assignmentsByStrategy = new Map<string, typeof assignments>();
      for (const a of assignments ?? []) {
        const list = assignmentsByStrategy.get(a.strategy_id) ?? [];
        list.push(a);
        assignmentsByStrategy.set(a.strategy_id, list);
      }

      const assignedPortfolioIds = [...new Set((assignments ?? []).map((a) => a.portfolio_id))];
      const { data: holdings } = assignedPortfolioIds.length > 0
        ? await admin.from("holdings")
            .select("portfolio_id, ticker, company_name, asset_type, shares, average_cost_basis")
            .in("portfolio_id", assignedPortfolioIds)
        : { data: [] };

      const result = strategies.map((s) => {
        const v = latestVersionByStrategy.get(s.id);
        const strategyAssignments = assignmentsByStrategy.get(s.id) ?? [];
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
          assigned_portfolios: strategyAssignments.map((a) => {
            const portfolio = a.portfolios as unknown as { id: string; name: string };
            return {
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
            };
          }),
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

  server.registerTool(
    "get_congress_trades",
    {
      title: "Get congressional trading activity",
      description: "Returns recent U.S. House/Senate member stock trades from public STOCK Act disclosures (free, no live cost). Omit ticker for overall recent activity + most-traded tickers; pass a ticker for that specific stock's congressional activity. Read-only.",
      inputSchema: {
        ticker: z.string().min(1).max(12).optional().describe("Limit to one ticker's congressional trades; omit for general recent activity"),
      },
    },
    async ({ ticker }) => {
      try {
        if (ticker) {
          const data = await getCongressTradesForTicker(ticker);
          return { content: [{ type: "text", text: JSON.stringify({ disclaimer: CONGRESS_DISCLAIMER, ...data }, null, 2) }] };
        }
        const activity = await getCongressActivity();
        return { content: [{ type: "text", text: JSON.stringify({ disclaimer: CONGRESS_DISCLAIMER, ...activity }, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error loading congressional trades: ${e instanceof Error ? e.message : "unknown error"}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "get_market_regime",
    {
      title: "Get market regime",
      description: "Returns BuyTune's current macro/market-wide regime read — risk-on/constructive/cautious/defensive/risk-off, a 0-100 score, and the underlying dimensions (breadth, volatility, yield curve, geopolitical signal). Ticker-agnostic context, not a per-stock signal. Read-only, cached (updates every few hours).",
      inputSchema: {},
    },
    async () => {
      const admin = createAdminClient();
      const { data, error } = await admin.from("market_regime_snapshots")
        .select("date, level, score, label, dimensions, narrative, data_quality, calculated_at")
        .order("date", { ascending: false }).limit(1).maybeSingle();
      if (error) return { content: [{ type: "text", text: `Error loading market regime: ${error.message}` }], isError: true };
      if (!data) {
        return { content: [{ type: "text", text: JSON.stringify({ disclaimer: REGIME_DISCLAIMER, available: false, note: "No market regime snapshot yet." }) }] };
      }
      return { content: [{ type: "text", text: JSON.stringify({ disclaimer: REGIME_DISCLAIMER, ...data }, null, 2) }] };
    }
  );

  server.registerTool(
    "get_reddit_sentiment",
    {
      title: "Get Reddit sentiment",
      description: "Returns retail social sentiment for a ticker — StockGeist (broad social + news sentiment, ~2,200 tickers) is primary, Tradestie flags WallStreetBets-specific hype for tickers in its top 50, with ApeWisdom mention/rank data and full Reddit analysis as further fallbacks depending on what's enabled. Read-only, cached.",
      inputSchema: {
        ticker: z.string().min(1).max(12).describe("Stock ticker, e.g. AAPL"),
        company_name: z.string().optional().describe("Optional, improves matching"),
      },
    },
    async ({ ticker, company_name }) => {
      const t = ticker.trim().toUpperCase();
      try {
        if (process.env.ENABLE_STOCKGEIST_SENTIMENT === "true" && process.env.STOCKGEIST_API_KEY) {
          const sentiment = await getStockGeistSentiment(t, "1d");
          if (sentiment && sentiment.total_count > 0) {
            return { content: [{ type: "text", text: JSON.stringify({ disclaimer: REDDIT_DISCLAIMER, source: "stockgeist", ...sentiment }, null, 2) }] };
          }
        }

        if (process.env.ENABLE_TRADESTIE_TRENDING === "true") {
          const tradestieMap = await fetchTradestieData();
          const entry = tradestieMap?.[t];
          if (entry) {
            return { content: [{ type: "text", text: JSON.stringify({ disclaimer: REDDIT_DISCLAIMER, source: "tradestie", ...entry }, null, 2) }] };
          }
        }

        if (process.env.ENABLE_REDDIT_SOCIAL_PULSE === "true") {
          const admin = createAdminClient();
          const { data: cached } = await admin.from("reddit_social_snapshots")
            .select("*").eq("ticker", t).eq("time_window", "week")
            .gt("expires_at", new Date().toISOString()).maybeSingle();
          if (cached) {
            return { content: [{ type: "text", text: JSON.stringify({ disclaimer: REDDIT_DISCLAIMER, source: "reddit", ...cached }, null, 2) }] };
          }
          const posts = process.env.REDDIT_CLIENT_ID
            ? await searchRedditPosts(t, company_name ?? t, { timeWindow: "week" })
            : await searchRedditPostsPublic(t, company_name ?? t, { timeWindow: "week" });
          if (posts.length > 0) {
            const pulse = await buildRedditPulse(t, company_name ?? t, posts, "week", 120);
            void admin.from("reddit_social_snapshots").upsert(
              { ticker: t, company_name: company_name ?? t, time_window: "week", fetched_at: pulse.fetched_at, expires_at: pulse.expires_at,
                post_count: pulse.post_count, mention_count: pulse.mention_count, bullish_pct: pulse.bullish_pct, bearish_pct: pulse.bearish_pct,
                neutral_pct: pulse.neutral_pct, sentiment_score: pulse.sentiment_score, hype_score: pulse.hype_score, conviction_score: pulse.conviction_score,
                reddit_pulse_score: pulse.reddit_pulse_score, top_themes_json: JSON.stringify(pulse.top_themes),
                top_bullish_themes_json: JSON.stringify(pulse.top_bullish_themes), top_bearish_themes_json: JSON.stringify(pulse.top_bearish_themes),
                top_risks_json: JSON.stringify(pulse.top_risks), top_catalysts_json: JSON.stringify(pulse.top_catalysts),
                subreddit_breakdown_json: JSON.stringify(pulse.subreddit_breakdown), source_post_links_json: JSON.stringify(pulse.source_post_links),
                summary: pulse.summary, ai_analysis_json: JSON.stringify({ ai_powered: pulse.ai_powered, sentiment_label: pulse.sentiment_label }),
                updated_at: new Date().toISOString() },
              { onConflict: "ticker,time_window" }
            );
            return { content: [{ type: "text", text: JSON.stringify({ disclaimer: REDDIT_DISCLAIMER, source: "reddit", ...pulse }, null, 2) }] };
          }
        }

        if (process.env.ENABLE_APEWISDOM_REDDIT_TRENDS === "true") {
          const apeMap = await fetchApeWisdomData();
          const entry = apeMap?.[t];
          if (entry) {
            return { content: [{ type: "text", text: JSON.stringify({ disclaimer: REDDIT_DISCLAIMER, source: "apewisdom", ...entry }, null, 2) }] };
          }
        }

        return { content: [{ type: "text", text: JSON.stringify({ ticker: t, available: false, note: "No Reddit discussion/trend data found for this ticker." }) }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Error loading Reddit sentiment: ${e instanceof Error ? e.message : "unknown error"}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "record_trade",
    {
      title: "Record a trade",
      description: "Records a buy or sell you actually executed (e.g. via a connected brokerage's own trading tools) into a BuyTune portfolio, so its holdings/cash balance stay current without a paid brokerage-sync service. This derives the holding update (shares, weighted-average cost basis) and cash impact from this one trade event and inserts an auditable transaction record — it never overwrites holdings directly, so a bad report shows up as a reviewable/deletable transaction rather than silently corrupting portfolio state. This only updates BuyTune's own records — it never places a trade or touches a brokerage account itself.",
      inputSchema: {
        portfolio_id: z.string().uuid().describe("Which BuyTune portfolio this trade belongs to"),
        action: z.enum(["buy", "sell"]).describe("Whether shares were bought or sold"),
        ticker: z.string().min(1).max(12).describe("Stock ticker, e.g. AAPL"),
        shares: z.number().positive().describe("Number of shares traded"),
        price_per_share: z.number().positive().describe("Execution price per share"),
        fees: z.number().min(0).optional().describe("Commission/fees, if any — defaults to 0"),
        company_name: z.string().optional().describe("Optional, improves display if this is a new holding"),
        traded_at: z.string().optional().describe("ISO date/time of execution; defaults to now"),
        notes: z.string().max(500).optional().describe("Optional note on why this trade was made"),
      },
    },
    async ({ portfolio_id, action, ticker, shares, price_per_share, fees, company_name, traded_at, notes }) => {
      const admin = createAdminClient();
      const t = ticker.trim().toUpperCase();
      try {
        const result = await recordPortfolioTransaction(admin, {
          portfolioId: portfolio_id,
          userId,
          transactionType: action,
          ticker: t,
          companyName: company_name,
          quantity: shares,
          pricePerShare: price_per_share,
          fees: fees ?? 0,
          notes,
          tradedAt: traded_at ?? new Date().toISOString(),
        });
        await notifyUser(admin, userId, `${action === "buy" ? "Bought" : "Sold"} ${t}`, `Your agent recorded a ${action} of ${shares} shares of ${t} @ $${price_per_share.toFixed(2)}.${notes ? ` ${notes}` : ""}`);
        return { content: [{ type: "text", text: `Recorded ${action} of ${shares} ${t} @ $${price_per_share} in BuyTune (transaction ${result.transactionId}).` }] };
      } catch (e) {
        return { content: [{ type: "text", text: e instanceof Error ? e.message : "Failed to record trade." }], isError: true };
      }
    }
  );

  server.registerTool(
    "log_trading_decision",
    {
      title: "Log a trading decision",
      description: "Records a trading decision (executed/skipped/sold/held/note) and the reasoning behind it. Shows up in the user's next daily BuyTune email digest under 'AI Trading Activity', so they have a record to review even for unattended/scheduled runs. This only writes a log entry — it never places a trade or touches a brokerage account itself.",
      inputSchema: {
        action: z.enum(["executed", "skipped", "sold", "held", "note"]).describe("What happened with this ticker (or 'note' for general commentary not tied to an action)"),
        reasoning: z.string().min(1).max(2000).describe("Why — cite the actual data that drove the decision (e.g. the strategy rule, the recommendation/deep-analysis verdict, the scan signal)"),
        ticker: z.string().max(12).optional().describe("Ticker this concerns, if any"),
        portfolio_id: z.string().uuid().optional().describe("Scope this entry to one BuyTune portfolio's digest; omit to show it in all of the user's portfolio digests for that day"),
      },
    },
    async ({ action, reasoning, ticker, portfolio_id }) => {
      const admin = createAdminClient();
      if (portfolio_id) {
        const { data: owned } = await admin.from("portfolios").select("id").eq("id", portfolio_id).eq("user_id", userId).maybeSingle();
        if (!owned) return { content: [{ type: "text", text: "That portfolio_id doesn't belong to this account." }], isError: true };
      }
      const { error } = await admin.from("trading_decision_log").insert({
        user_id: userId,
        portfolio_id: portfolio_id ?? null,
        ticker: ticker ? ticker.trim().toUpperCase() : null,
        action,
        reasoning: reasoning.trim().slice(0, 2000),
        source: "mcp",
      });
      if (error) return { content: [{ type: "text", text: `Error logging decision: ${error.message}` }], isError: true };
      // Only for outcomes that actually did something — a skip/hold/note
      // notifying in real time would just be noise ahead of the digest.
      if (action === "executed" || action === "sold") {
        await notifyUser(admin, userId, `Trading decision: ${action}${ticker ? ` ${ticker.trim().toUpperCase()}` : ""}`, reasoning.trim().slice(0, 300));
      }
      return { content: [{ type: "text", text: `Logged: ${action}${ticker ? ` ${ticker.trim().toUpperCase()}` : ""} — will appear in the next daily digest.` }] };
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
  const auth = token?.startsWith("bt_at_")
    ? await verifyOAuthAccessToken(token, { ip: getIp(req), userAgent: req.headers.get("user-agent") })
    : await verifyApiToken(token);
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
