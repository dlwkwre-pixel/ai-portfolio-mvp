import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import EditStrategyForm from "./edit-strategy-form";
import StrategyPublicToggle from "./strategy-public-toggle";
import StrategiesHeader from "./strategies-header";

function formatRiskLevel(value: string | null) {
  if (!value) return "No Risk Set";
  const map: Record<string, string> = {
    low: "Conservative", Low: "Conservative",
    moderate: "Moderate", Moderate: "Moderate",
    high: "Aggressive", High: "Aggressive",
    conservative: "Conservative", Conservative: "Conservative",
    aggressive: "Aggressive", Aggressive: "Aggressive",
  };
  return map[value] ?? value;
}

function riskStyle(value: string | null) {
  const level = formatRiskLevel(value);
  if (level === "Conservative") return { bg: "var(--green-bg)", border: "var(--green-border)", color: "var(--green)" };
  if (level === "Aggressive") return { bg: "var(--red-bg)", border: "var(--red-border)", color: "var(--red)" };
  return { bg: "var(--amber-bg)", border: "var(--amber-border)", color: "var(--amber)" };
}

type StrategyRow = {
  id: string; user_id: string; name: string;
  description: string | null; style: string | null;
  risk_level: string | null; is_active: boolean;
  created_at: string; updated_at: string;
};

type StrategyVersion = {
  id: string; strategy_id: string; version_number: number;
  prompt_text: string | null; max_position_pct: number | null;
  min_position_pct: number | null; turnover_preference: string | null;
  holding_period_bias: string | null; cash_min_pct: number | null;
  cash_max_pct: number | null; created_at: string;
};

type StrategyCard = StrategyRow & {
  latest_version: StrategyVersion | null;
  version_history: StrategyVersion[];
};

export default async function StrategiesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: strategiesData, error } = await supabase
    .from("strategies").select("*").eq("user_id", user.id).eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const strategies: StrategyRow[] = (strategiesData ?? []) as StrategyRow[];
  const strategyIds = strategies.map((s) => s.id);
  const versionsByStrategyId = new Map<string, StrategyVersion[]>();
  const latestVersionsByStrategyId = new Map<string, StrategyVersion>();

  if (strategyIds.length > 0) {
    const { data: versionsData, error: versionsError } = await supabase
      .from("strategy_versions").select("*").in("strategy_id", strategyIds)
      .order("version_number", { ascending: false });
    if (versionsError) throw new Error(versionsError.message);
    for (const version of (versionsData ?? []) as StrategyVersion[]) {
      const existing = versionsByStrategyId.get(version.strategy_id) ?? [];
      existing.push(version);
      versionsByStrategyId.set(version.strategy_id, existing);
      if (!latestVersionsByStrategyId.has(version.strategy_id)) {
        latestVersionsByStrategyId.set(version.strategy_id, version);
      }
    }
  }

  const strategyCards: StrategyCard[] = strategies.map((strategy) => ({
    ...strategy,
    latest_version: latestVersionsByStrategyId.get(strategy.id) ?? null,
    version_history: versionsByStrategyId.get(strategy.id) ?? [],
  }));

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg-base)", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
      <div className="bt-glow" style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1, display: "flex", minHeight: "100vh" }}>
        <div className="hidden lg:flex">
          <Sidebar userEmail={user.email} />
        </div>
        <div className="bt-main-col" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <MobileNav />

          {/* Topbar */}
          <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-base)", position: "sticky", top: 0, zIndex: 10 }}>
            <div>
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.2px" }}>
                Strategies
              </h1>
              <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "1px" }}>
                Reusable investing frameworks that guide AI analysis
              </p>
            </div>
            <StrategiesHeader />
          </div>

          <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px", marginBottom: "20px" }}>
              {[
                { label: "Active Strategies", value: strategyCards.length },
                { label: "Total Versions", value: strategyCards.reduce((sum, s) => sum + s.version_history.length, 0) },
                { label: "With AI Prompts", value: strategyCards.filter((s) => s.latest_version?.prompt_text).length },
              ].map((stat) => (
                <div key={stat.label} className="bt-card" style={{ padding: "14px 16px" }}>
                  <div className="label" style={{ marginBottom: "6px" }}>{stat.label}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.5px" }}>
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Strategy cards */}
            {strategyCards.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {strategyCards.map((strategy) => {
                  const rs = riskStyle(strategy.risk_level);
                  return (
                    <div key={strategy.id} className="bt-card">
                      {/* Header */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                              <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
                                {strategy.name}
                              </h2>
                              {/* Risk badge */}
                              <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", padding: "2px 8px", borderRadius: "var(--radius-full)", background: rs.bg, border: `1px solid ${rs.border}`, color: rs.color }}>
                                {formatRiskLevel(strategy.risk_level)}
                              </span>
                              {strategy.style && (
                                <span style={{ fontSize: "9px", color: "var(--text-tertiary)", background: "var(--card-bg)", border: "1px solid var(--card-border)", padding: "2px 8px", borderRadius: "var(--radius-full)" }}>
                                  {strategy.style}
                                </span>
                              )}
                              <span style={{ fontSize: "9px", color: "var(--text-muted)", background: "var(--card-bg)", border: "1px solid var(--card-border)", padding: "2px 8px", borderRadius: "var(--radius-full)" }}>
                                v{strategy.latest_version?.version_number ?? "—"}
                              </span>
                            </div>
                            {strategy.description ? (
                              <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                                {strategy.description}
                              </p>
                            ) : (
                              <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>No description added yet.</p>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                            <StrategyPublicToggle strategyId={strategy.id} isPublic={(strategy as any).is_public ?? false} />
                            {/* @ts-ignore */}
                            <EditStrategyForm strategy={strategy} />
                          </div>
                        </div>

                        {/* Version parameters */}
                        {strategy.latest_version && (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px" }}>
                            {[
                              ["Max Pos %", strategy.latest_version.max_position_pct ?? "—"],
                              ["Min Pos %", strategy.latest_version.min_position_pct ?? "—"],
                              ["Cash Min %", strategy.latest_version.cash_min_pct ?? "—"],
                              ["Cash Max %", strategy.latest_version.cash_max_pct ?? "—"],
                              ["Turnover", strategy.latest_version.turnover_preference ?? "—"],
                              ["Holding Bias", strategy.latest_version.holding_period_bias ?? "—"],
                            ].map(([label, value]) => (
                              <div key={String(label)} style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "8px 12px" }}>
                                <div className="label" style={{ marginBottom: "3px" }}>{label}</div>
                                <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)" }}>{value}</div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* AI Prompt */}
                        {strategy.latest_version?.prompt_text && (
                          <div style={{ background: "rgba(37,99,235,0.05)", border: "1px solid rgba(37,99,235,0.1)", borderRadius: "var(--radius-md)", padding: "12px 14px" }}>
                            <div className="label" style={{ color: "var(--brand-blue)", marginBottom: "6px" }}>AI Prompt / Rules</div>
                            <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                              {strategy.latest_version.prompt_text}
                            </p>
                          </div>
                        )}

                        {/* Version history */}
                        {strategy.version_history.length > 0 && (
                          <details>
                            <summary style={{ fontSize: "11px", color: "var(--text-tertiary)", cursor: "pointer", listStyle: "none", padding: "4px 0", display: "flex", alignItems: "center", gap: "6px" }}>
                              <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--text-muted)" }}>
                                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd"/>
                              </svg>
                              Version History ({strategy.version_history.length})
                            </summary>
                            <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
                              {strategy.version_history.map((version) => (
                                <div key={version.id} style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                                    <span style={{ fontSize: "10px", fontWeight: 600, background: "var(--card-bg)", border: "1px solid var(--card-border)", color: "var(--text-secondary)", padding: "1px 7px", borderRadius: "var(--radius-full)" }}>
                                      v{version.version_number}
                                    </span>
                                    {strategy.latest_version?.id === version.id && (
                                      <span style={{ fontSize: "9px", fontWeight: 600, background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.2)", color: "var(--brand-blue)", padding: "1px 7px", borderRadius: "var(--radius-full)" }}>
                                        Current
                                      </span>
                                    )}
                                    <span style={{ marginLeft: "auto", fontSize: "10px", color: "var(--text-tertiary)" }}>
                                      {new Date(version.created_at).toLocaleDateString()}
                                    </span>
                                  </div>
                                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "4px", fontSize: "11px", color: "var(--text-tertiary)" }}>
                                    {[
                                      ["Max Pos", version.max_position_pct ?? "—"],
                                      ["Turnover", version.turnover_preference ?? "—"],
                                      ["Holding", version.holding_period_bias ?? "—"],
                                    ].map(([l, v]) => (
                                      <span key={String(l)}><span style={{ color: "var(--text-muted)" }}>{l}: </span>{v}</span>
                                    ))}
                                  </div>
                                  {version.prompt_text && (
                                    <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "8px", lineHeight: 1.6, borderTop: "1px solid var(--border-subtle)", paddingTop: "8px" }}>
                                      {version.prompt_text}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bt-card" style={{ padding: "40px", textAlign: "center" }}>
                <div style={{ width: "44px", height: "44px", background: "var(--violet-bg)", border: "1px solid var(--violet-border)", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--violet)" }}>
                    <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192zM6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.897l-2.051-.684a1 1 0 01-.633-.633L6.95 5.684z" />
                  </svg>
                </div>
                <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>No strategies yet</h2>
                <p style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>
                  Create your first strategy to define AI investing rules for your portfolios.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
