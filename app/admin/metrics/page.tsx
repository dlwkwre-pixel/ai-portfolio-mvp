import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Metrics — BuyTune Admin" };
export const dynamic = "force-dynamic";

// Growth metrics: retention, module usage, AI cost, willingness-to-pay.
// Admin gate lives in app/admin/layout.tsx. Data starts accumulating the day
// growth-instrumentation.sql is run — cohort cells fill in as weeks pass.

type ActivityRow = { user_id: string; day: string; modules: string[]; events: number };
type UsageRow = { provider: string; route: string; prompt_tokens: number | null; completion_tokens: number | null; search_count: number | null; est_cost_usd: number; user_id: string | null };
type SurveyRow = { features: string[]; price: string | null; comment: string | null; created_at: string };

const FEATURE_LABELS: Record<string, string> = {
  multiple_portfolios: "More portfolios",
  unlimited_ai: "Unlimited AI runs",
  tax_center: "Tax center + export",
  planning_stress: "Planning stress tests",
  community_strategies: "Premium strategies",
  none: "None of these",
};

function isoDay(d: Date): string { return d.toISOString().slice(0, 10); }
function daysAgo(n: number): string { return isoDay(new Date(Date.now() - n * 86_400_000)); }
function mondayOf(dayIso: string): string {
  const d = new Date(dayIso + "T12:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  return isoDay(new Date(d.getTime() - dow * 86_400_000));
}

export default async function MetricsPage() {
  const admin = createAdminClient();

  const [activityRes, usageRes, surveyRes, profilesRes] = await Promise.all([
    admin.from("user_activity_daily").select("user_id, day, modules, events").gte("day", daysAgo(56)),
    admin.from("ai_usage").select("provider, route, prompt_tokens, completion_tokens, search_count, est_cost_usd, user_id").gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString()),
    admin.from("pricing_survey_responses").select("features, price, comment, created_at").order("created_at", { ascending: false }),
    admin.from("user_profiles").select("id", { count: "exact", head: true }),
  ]);

  const tablesMissing = !!activityRes.error || !!usageRes.error;
  const activity = (activityRes.data ?? []) as ActivityRow[];
  const usage = (usageRes.data ?? []) as UsageRow[];
  const surveys = (surveyRes.data ?? []) as SurveyRow[];
  const totalUsers = profilesRes.count ?? 0;

  // ── Topline actives ─────────────────────────────────────────────────────────
  const today = isoDay(new Date());
  const activeSince = (cutoff: string) => new Set(activity.filter(a => a.day >= cutoff).map(a => a.user_id)).size;
  const dau = new Set(activity.filter(a => a.day === today).map(a => a.user_id)).size;
  const wau = activeSince(daysAgo(6));
  const mau = activeSince(daysAgo(29));
  const stickiness = wau > 0 ? Math.round((dau / wau) * 100) : 0;

  // ── Weekly cohorts (first-activity week → wk+1 / wk+2 retention) ───────────
  const firstDay = new Map<string, string>();
  const activeWeeks = new Map<string, Set<string>>();
  for (const a of activity) {
    if (!firstDay.has(a.user_id) || a.day < firstDay.get(a.user_id)!) firstDay.set(a.user_id, a.day);
    const wk = mondayOf(a.day);
    if (!activeWeeks.has(a.user_id)) activeWeeks.set(a.user_id, new Set());
    activeWeeks.get(a.user_id)!.add(wk);
  }
  const cohorts = new Map<string, { size: number; wk1: number; wk2: number }>();
  for (const [uid, first] of firstDay) {
    const cw = mondayOf(first);
    if (!cohorts.has(cw)) cohorts.set(cw, { size: 0, wk1: 0, wk2: 0 });
    const c = cohorts.get(cw)!;
    c.size++;
    const weeks = activeWeeks.get(uid)!;
    const plus = (n: number) => isoDay(new Date(new Date(cw + "T12:00:00Z").getTime() + n * 7 * 86_400_000));
    if (weeks.has(plus(1))) c.wk1++;
    if (weeks.has(plus(2))) c.wk2++;
  }
  const cohortRows = [...cohorts.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);

  // ── Module usage (30d distinct users) ───────────────────────────────────────
  const moduleUsers = new Map<string, Set<string>>();
  for (const a of activity.filter(a => a.day >= daysAgo(29))) {
    for (const m of a.modules ?? []) {
      if (!moduleUsers.has(m)) moduleUsers.set(m, new Set());
      moduleUsers.get(m)!.add(a.user_id);
    }
  }
  const moduleRows = [...moduleUsers.entries()].map(([m, s]) => [m, s.size] as const).sort((a, b) => b[1] - a[1]);
  const maxModule = Math.max(1, ...moduleRows.map(([, n]) => n));

  // ── AI usage (30d) ──────────────────────────────────────────────────────────
  const byProvider = new Map<string, { calls: number; cost: number; searches: number }>();
  const byRoute = new Map<string, { calls: number; cost: number }>();
  let totalCost = 0;
  for (const u of usage) {
    totalCost += Number(u.est_cost_usd ?? 0);
    const p = byProvider.get(u.provider) ?? { calls: 0, cost: 0, searches: 0 };
    p.calls++; p.cost += Number(u.est_cost_usd ?? 0); p.searches += u.search_count ?? 0;
    byProvider.set(u.provider, p);
    const r = byRoute.get(u.route) ?? { calls: 0, cost: 0 };
    r.calls++; r.cost += Number(u.est_cost_usd ?? 0);
    byRoute.set(u.route, r);
  }
  const costPerActive = mau > 0 ? totalCost / mau : 0;
  const routeRows = [...byRoute.entries()].sort((a, b) => b[1].cost - a[1].cost || b[1].calls - a[1].calls).slice(0, 10);

  // ── Survey rollup ───────────────────────────────────────────────────────────
  const featureCounts = new Map<string, number>();
  const priceCounts = new Map<string, number>();
  for (const s of surveys) {
    for (const f of s.features ?? []) featureCounts.set(f, (featureCounts.get(f) ?? 0) + 1);
    if (s.price) priceCounts.set(s.price, (priceCounts.get(s.price) ?? 0) + 1);
  }
  const comments = surveys.filter(s => s.comment).slice(0, 8);

  const mono: React.CSSProperties = { fontFamily: "var(--font-mono)" };
  const card: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "14px", padding: "18px 20px" };
  const h2: React.CSSProperties = { fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-tertiary)", marginBottom: "14px" };
  const money = (v: number) => `$${v.toFixed(v < 1 ? 3 : 2)}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "20px", fontWeight: 700, letterSpacing: "-0.4px", marginBottom: "4px" }}>Growth Metrics</h1>
        <p style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>
          Retention, module engagement, AI cost per user, and pricing-survey results. Data accumulates from the day the migration ran.
        </p>
      </div>

      {tablesMissing && (
        <div style={{ ...card, borderColor: "rgba(245,158,11,0.4)" }}>
          <span style={{ fontSize: "12.5px", color: "#f59e0b" }}>
            Instrumentation tables not found — run <span style={mono}>supabase/growth-instrumentation.sql</span> in the SQL editor, then reload.
          </span>
        </div>
      )}

      {/* Topline */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px" }}>
        {[
          ["Active today", String(dau)],
          ["Active 7d", String(wau)],
          ["Active 30d", String(mau)],
          ["DAU / WAU", `${stickiness}%`],
          ["Registered", String(totalUsers)],
          ["AI cost 30d", money(totalCost)],
          ["Cost / active user", money(costPerActive)],
        ].map(([label, value]) => (
          <div key={label} style={card}>
            <div style={{ fontSize: "10.5px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>{label}</div>
            <div style={{ ...mono, fontSize: "22px", fontWeight: 700, color: "var(--text-primary)" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Cohort retention */}
      <div style={card}>
        <h2 style={h2}>Weekly cohort retention (first-activity week)</h2>
        {cohortRows.length === 0 ? (
          <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>No activity yet — cohorts appear once users start hitting the app after the migration.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
              <thead>
                <tr style={{ color: "var(--text-tertiary)", textAlign: "left" }}>
                  <th style={{ padding: "6px 10px 6px 0", fontWeight: 600 }}>Cohort week</th>
                  <th style={{ padding: "6px 10px", fontWeight: 600 }}>Users</th>
                  <th style={{ padding: "6px 10px", fontWeight: 600 }}>Week +1</th>
                  <th style={{ padding: "6px 10px", fontWeight: 600 }}>Week +2</th>
                </tr>
              </thead>
              <tbody>
                {cohortRows.map(([week, c]) => (
                  <tr key={week} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td style={{ ...mono, padding: "8px 10px 8px 0", color: "var(--text-secondary)" }}>{week}</td>
                    <td style={{ ...mono, padding: "8px 10px" }}>{c.size}</td>
                    <td style={{ ...mono, padding: "8px 10px" }}>{c.size > 0 ? Math.round((c.wk1 / c.size) * 100) : 0}%</td>
                    <td style={{ ...mono, padding: "8px 10px" }}>{c.size > 0 ? Math.round((c.wk2 / c.size) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "16px" }}>
        {/* Module usage */}
        <div style={card}>
          <h2 style={h2}>Module usage — distinct users, 30d</h2>
          {moduleRows.length === 0 ? (
            <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>No module activity recorded yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {moduleRows.map(([m, n]) => (
                <div key={m} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "12px", color: "var(--text-secondary)", width: "96px", flexShrink: 0, textTransform: "capitalize" }}>{m}</span>
                  <div style={{ flex: 1, height: "8px", borderRadius: "99px", background: "var(--surface-005)", overflow: "hidden" }}>
                    <div style={{ width: `${(n / maxModule) * 100}%`, height: "100%", borderRadius: "99px", background: "linear-gradient(90deg,#2563eb,#4f46e5)" }} />
                  </div>
                  <span style={{ ...mono, fontSize: "12px", width: "32px", textAlign: "right" }}>{n}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI cost */}
        <div style={card}>
          <h2 style={h2}>AI usage — 30d, estimated</h2>
          <div style={{ display: "flex", gap: "18px", marginBottom: "12px", flexWrap: "wrap" }}>
            {[...byProvider.entries()].map(([p, v]) => (
              <div key={p}>
                <div style={{ fontSize: "10.5px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{p}</div>
                <div style={{ ...mono, fontSize: "15px", fontWeight: 600 }}>{v.calls} calls · {money(v.cost)}</div>
                {p === "grok" && <div style={{ ...mono, fontSize: "10.5px", color: "var(--text-muted)" }}>{v.searches} live searches</div>}
              </div>
            ))}
            {byProvider.size === 0 && <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>No AI calls logged yet.</p>}
          </div>
          {routeRows.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              {routeRows.map(([r, v]) => (
                <div key={r} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", borderTop: "1px solid var(--border-subtle)", paddingTop: "5px" }}>
                  <span style={{ color: "var(--text-secondary)" }}>{r}</span>
                  <span style={mono}>{v.calls} · {money(v.cost)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Survey */}
      <div style={card}>
        <h2 style={h2}>Willingness to pay — {surveys.length} response{surveys.length === 1 ? "" : "s"}</h2>
        {surveys.length === 0 ? (
          <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>No responses yet — the survey card shows on every user&apos;s dashboard until answered or dismissed.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "18px" }}>
            <div>
              <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "8px" }}>Would pay for</div>
              {[...featureCounts.entries()].sort((a, b) => b[1] - a[1]).map(([f, n]) => (
                <div key={f} style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px", padding: "4px 0" }}>
                  <span style={{ color: "var(--text-secondary)" }}>{FEATURE_LABELS[f] ?? f}</span>
                  <span style={mono}>{n}</span>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "8px" }}>Fair monthly price</div>
              {["0", "5", "10", "20"].map((p) => (
                <div key={p} style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px", padding: "4px 0" }}>
                  <span style={{ ...mono, color: "var(--text-secondary)" }}>{p === "20" ? "$20+" : `$${p}`}/mo</span>
                  <span style={mono}>{priceCounts.get(p) ?? 0}</span>
                </div>
              ))}
            </div>
            {comments.length > 0 && (
              <div>
                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "8px" }}>Comments</div>
                {comments.map((c, i) => (
                  <p key={i} style={{ fontSize: "12px", color: "var(--text-secondary)", padding: "4px 0", borderTop: i > 0 ? "1px solid var(--border-subtle)" : "none" }}>
                    &ldquo;{c.comment}&rdquo;
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
