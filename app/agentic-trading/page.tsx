import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import { Chip } from "@/app/components/ui-primitives";

export const dynamic = "force-dynamic";

const MCP_URL = "https://buytune.io/api/mcp";

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: "16px", marginBottom: "28px" }}>
      <div style={{
        flexShrink: 0, width: "30px", height: "30px", borderRadius: "var(--radius-full)",
        background: "var(--brand-gradient)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "13px",
      }}>
        {n}
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingTop: "3px" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
          {title}
        </h2>
        <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.7 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "16px 18px", marginTop: "10px" }}>
      {children}
    </div>
  );
}

function ToolName({ children }: { children: React.ReactNode }) {
  return <code style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--brand-blue)", background: "rgba(14,165,160,0.08)", padding: "1px 5px", borderRadius: "4px" }}>{children}</code>;
}

const TOOL_GROUPS: { label: string; tools: string[] }[] = [
  { label: "Your data", tools: ["get_portfolio", "get_strategies", "get_financial_profile", "get_net_worth_summary", "get_watchlist", "add_to_watchlist"] },
  { label: "Per-ticker analysis", tools: ["get_recommendation", "run_ai_analysis", "run_deep_analysis", "get_x_sentiment", "get_kronos_forecast", "get_research", "get_reddit_sentiment"] },
  { label: "Market context", tools: ["get_congress_trades", "get_market_regime"] },
  { label: "Framework + workflow", tools: ["get_analysis_framework", "get_trading_routine"] },
  { label: "Writes (narrow, auditable)", tools: ["record_trade", "log_trading_decision"] },
];

export default async function AgenticTradingGuidePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: portfolios } = await supabase
    .from("portfolios").select("id, name, cash_balance, account_type").eq("user_id", user.id).eq("status", "active");

  const sidebarPortfolios = (portfolios ?? []).map((p) => ({
    id: p.id, name: p.name, cash_balance: Number(p.cash_balance ?? 0), account_type: p.account_type,
  }));

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-base)" }}>
      <div className="hidden lg:flex"><Sidebar userEmail={user.email} portfolios={sidebarPortfolios} /></div>
      <div className="bt-main-col" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <MobileNav />
        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }} className="bt-mobile-nav-pad">
          <div style={{ maxWidth: "720px", margin: "0 auto" }}>

            <Chip tone="brand">Guide</Chip>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "26px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.5px", margin: "10px 0 8px" }}>
              Set up an AI agent to trade for you
            </h1>
            <p style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.7, maxWidth: "62ch", marginBottom: "8px" }}>
              The idea: your own AI (e.g. Claude) is the <strong>director</strong> — it reasons, decides, and executes trades through your brokerage&apos;s own agentic-trading connector. BuyTune is the <strong>analyst</strong> — it supplies portfolio state, your strategy rules, and research, but never places a trade or holds brokerage credentials itself.
            </p>

            <div style={{ background: "rgba(14,148,136,0.06)", border: "1px solid rgba(14,148,136,0.15)", borderRadius: "var(--radius-lg)", padding: "12px 16px", marginBottom: "32px", fontSize: "12.5px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
              Everything BuyTune exposes to your agent is read-only except two narrow, auditable writes (a watchlist add and a trade-record entry — see below). It cannot execute a trade, move money, or touch a brokerage account. Read the <Link href="/legal/ai-disclaimer" style={{ color: "var(--brand-blue)" }}>AI Disclaimer</Link> before connecting a live account — this is a tool, not a registered investment adviser, and you&apos;re responsible for what your agent does.
            </div>

            <Step n={1} title="Build (or copy) a strategy">
              Define the rules your agent should follow — position sizing, risk level, what counts as a buy/sell signal, style. Build one from scratch in <Link href="/strategies" style={{ color: "var(--brand-blue)" }}>Strategies</Link>, or browse public strategies in <Link href="/community" style={{ color: "var(--brand-blue)" }}>Community</Link> and use &quot;copy as template&quot; to start from someone else&apos;s. Assign the finished strategy to the portfolio you want the agent managing.
            </Step>

            <Step n={2} title="Decide how your portfolio stays in sync">
              <Card>
                <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>Option A — connect your brokerage</div>
                <p style={{ marginBottom: "10px" }}>Link it in <Link href="/connections" style={{ color: "var(--brand-blue)" }}>Connections</Link> for a verified, automatic read-only sync of holdings and cash.</p>
                <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>Option B — skip the connection</div>
                <p style={{ margin: 0 }}>Have your agent call <ToolName>record_trade</ToolName> right after it executes each order. It updates holdings and cash the same way a manual entry does — no brokerage link required, free.</p>
              </Card>
            </Step>

            <Step n={3} title="Connect your AI agent to BuyTune">
              In <Link href="/settings/profile" style={{ color: "var(--brand-blue)" }}>Settings → Connected AI Agents</Link>:
              <Card>
                <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>claude.ai / ChatGPT (Connectors)</div>
                <p style={{ marginBottom: "10px" }}>Add a custom connector with the URL below. It&apos;ll prompt you to log into BuyTune and approve — no client ID/secret to paste anywhere.</p>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", background: "var(--bg-elevated, rgba(255,255,255,0.04))", border: "1px solid var(--card-border)", borderRadius: "6px", padding: "8px 10px", marginBottom: "10px", wordBreak: "break-all" }}>
                  {MCP_URL}
                </div>
                <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>Claude Desktop / Claude Code</div>
                <p style={{ margin: 0 }}>Create a token in the same settings section and use it as a Bearer token in your MCP config, pointed at the same URL.</p>
              </Card>
            </Step>

            <Step n={4} title="Connect your brokerage's own agentic-trading tool">
              This is separate from BuyTune, and it&apos;s the piece that can actually place an order. For Robinhood, that&apos;s their own Agentic Trading connector — set it up directly with Robinhood, under your own account. BuyTune never sees this connection or your brokerage credentials.
            </Step>

            <Step n={5} title="Set up your scheduled task">
              In Claude, create a recurring scheduled task (e.g. Claude Desktop&apos;s Cowork) with a short prompt — the workflow itself lives in BuyTune and updates automatically, so you don&apos;t need to spell it out here:
              <Card>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-primary)", lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>
{`Weekdays [your times]: connect to BuyTune's MCP tools and [your brokerage]'s agentic trading tools for account [your account].

Call get_trading_routine() and follow it. Use get_strategies() to find "[your strategy name]" and apply it to the portfolio named "[your portfolio name]".

First run only: message me with the candidate, reasoning, and proposed size before executing, and wait for approval. After that, proceed autonomously.`}
                </p>
              </Card>
              <p style={{ marginTop: "10px", fontSize: "12px", color: "var(--text-tertiary)" }}>
                Fill in your own strategy name, portfolio name, account, schedule, and how much autonomy you want it to have from the start — that last part is entirely your call.
              </p>
            </Step>

            <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "24px", marginTop: "8px" }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "12px" }}>
                What your agent can see and do
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {TOOL_GROUPS.map((g) => (
                  <div key={g.label} style={{ fontSize: "12.5px" }}>
                    <span style={{ color: "var(--text-tertiary)", fontWeight: 600 }}>{g.label}:</span>{" "}
                    {g.tools.map((t, i) => (
                      <span key={t}>
                        <ToolName>{t}</ToolName>
                        {i < g.tools.length - 1 ? " " : ""}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
              <p style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "14px", lineHeight: 1.6 }}>
                Paid tools (<ToolName>run_deep_analysis</ToolName>, <ToolName>get_x_sentiment</ToolName>) are capped per day and cached — everything else is free. Revoke any connection anytime from <Link href="/settings/profile" style={{ color: "var(--brand-blue)" }}>Settings → Connected AI Agents</Link>.
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
