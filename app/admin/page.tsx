import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import CountUp from "./count-up";

export const metadata = { title: "Overview — BuyTune Admin" };
export const dynamic = "force-dynamic";

// Aggregate platform KPIs only. By design this page shows NO per-user information,
// no portfolio values, and no other sensitive data — just counts, mixes, and trends.

type Row = Record<string, unknown>;

async function countOf(qb: PromiseLike<{ count: number | null }>): Promise<number> {
  try {
    const { count } = await qb;
    return count ?? 0;
  } catch {
    return 0;
  }
}

// Await a fully-built row query, returning [] on any failure (table missing, etc.).
async function fetchRows(qb: PromiseLike<{ data: unknown }>): Promise<Row[]> {
  try {
    const { data } = await qb;
    return Array.isArray(data) ? (data as Row[]) : [];
  } catch {
    return [];
  }
}

const DAY = 86_400_000;
function nowMs(): number {
  return Date.now();
}

// Count distinct user_ids in a fetched column set (used for the adoption funnel).
function distinctUsers(rows: Row[]): number {
  const s = new Set<string>();
  for (const r of rows) if (typeof r.user_id === "string") s.add(r.user_id);
  return s.size;
}

// Group a column into { label, count }, sorted desc, with a fallback bucket for nulls.
function groupBy(rows: Row[], key: string, fallback: string) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const raw = (r[key] ?? "").toString().trim().toLowerCase() || fallback;
    m.set(raw, (m.get(raw) ?? 0) + 1);
  }
  return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

const ACCOUNT_LABELS: Record<string, string> = {
  brokerage: "Brokerage", taxable: "Taxable", roth_ira: "Roth IRA", traditional_ira: "Traditional IRA",
  retirement: "Retirement", "401k": "401(k)", margin: "Margin", paper_trade: "Paper", speculative: "Speculative",
  other: "Other",
};
const ASSET_LABELS: Record<string, string> = {
  stock: "Stocks", equity: "Stocks", etf: "ETFs", crypto: "Crypto", manual: "Non-tradeable", other: "Other",
};
const MIX_COLORS = ["#0ea5a0", "#3fae4a", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#64748b"];

function Tile({ label, value, sub, accent, decimals, suffix, delay }: {
  label: string; value: number; sub?: string; accent?: boolean; decimals?: number; suffix?: string; delay: number;
}) {
  return (
    <div className="bt-adm-reveal" style={{
      animationDelay: `${delay}ms`,
      background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "14px",
      padding: "16px 18px", display: "flex", flexDirection: "column", gap: "6px",
    }}>
      <span style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-tertiary)" }}>{label}</span>
      <span style={{ fontSize: "26px", fontWeight: 700, lineHeight: 1, color: accent ? "var(--accent, #159f6f)" : "var(--text-primary)", fontFamily: "var(--font-mono)", letterSpacing: "-0.5px" }}>
        <CountUp value={value} decimals={decimals} suffix={suffix} />
      </span>
      {sub && <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>{sub}</span>}
    </div>
  );
}

const sectionCard: React.CSSProperties = {
  background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "14px", padding: "20px 22px",
};

function MixCard({ title, data, labels, total }: {
  title: string; data: { label: string; count: number }[]; labels: Record<string, string>; total: number;
}) {
  return (
    <div style={sectionCard}>
      <h2 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "16px" }}>{title}</h2>
      <div style={{ display: "flex", height: "12px", borderRadius: "6px", overflow: "hidden", marginBottom: "16px", background: "rgba(148,163,184,0.12)" }}>
        {data.map((d, i) => (
          <div key={d.label} className="bt-adm-wide" style={{ width: `${total ? (d.count / total) * 100 : 0}%`, background: MIX_COLORS[i % MIX_COLORS.length], animationDelay: `${i * 70}ms` }} />
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {data.length === 0 && <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>No data yet.</span>}
        {data.map((d, i) => (
          <div key={d.label} style={{ display: "flex", alignItems: "center", gap: "9px", fontSize: "12.5px" }}>
            <span style={{ width: "9px", height: "9px", borderRadius: "3px", background: MIX_COLORS[i % MIX_COLORS.length], flexShrink: 0 }} />
            <span style={{ color: "var(--text-secondary)", flex: 1 }}>{labels[d.label] ?? d.label}</span>
            <span style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>{d.count.toLocaleString()}</span>
            <span style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", width: "38px", textAlign: "right" }}>{total ? Math.round((d.count / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function AdminOverview() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) {
    return <p style={{ color: "var(--text-tertiary)" }}>Not authorized.</p>;
  }

  const admin = createAdminClient();
  const now = nowMs();
  const since7 = new Date(now - 7 * DAY).toISOString();

  const [
    activePortfolios, holdingsCount, strategies, aiRunsTotal, aiRuns7,
    notifications, badgesEarned, feedbackCount, ratingsRes, usersRes,
    portfolioRows, holdingRows, aiUserRows, planningCount,
  ] = await Promise.all([
    countOf(admin.from("portfolios").select("id", { count: "exact", head: true }).eq("is_active", true)),
    countOf(admin.from("holdings").select("id", { count: "exact", head: true })),
    countOf(admin.from("strategies").select("id", { count: "exact", head: true }).eq("is_active", true)),
    countOf(admin.from("recommendation_runs").select("id", { count: "exact", head: true }).eq("status", "completed")),
    countOf(admin.from("recommendation_runs").select("id", { count: "exact", head: true }).eq("status", "completed").gte("created_at", since7)),
    countOf(admin.from("app_notifications").select("id", { count: "exact", head: true })),
    countOf(admin.from("user_badges").select("id", { count: "exact", head: true })),
    countOf(admin.from("feedback_responses").select("id", { count: "exact", head: true })),
    admin.from("feedback_responses").select("rating").limit(2000),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }).catch(() => null),
    // Column pulls for the funnel + mixes (ids/categories only — no names, emails, or values).
    fetchRows(admin.from("portfolios").select("user_id, account_type").eq("is_active", true).limit(5000)),
    fetchRows(admin.from("holdings").select("user_id, asset_type").limit(5000)),
    fetchRows(admin.from("recommendation_runs").select("user_id").eq("status", "completed").limit(5000)),
    countOf(admin.from("financial_profiles").select("id", { count: "exact", head: true })),
  ]);

  const ratings = (ratingsRes.data ?? []).map((r) => r.rating as number).filter((n) => typeof n === "number");
  const avgRating = ratings.length ? ratings.reduce((s, n) => s + n, 0) / ratings.length : 0;

  const users = usersRes?.data?.users ?? [];
  const totalUsers = users.length;
  const created = users.map((u) => new Date(u.created_at).getTime()).filter((t) => !Number.isNaN(t));
  const new7 = created.filter((t) => t >= now - 7 * DAY).length;
  const new30 = created.filter((t) => t >= now - 30 * DAY).length;
  const usersCapped = totalUsers >= 1000;

  const WEEKS = 8;
  const buckets = Array.from({ length: WEEKS }, (_, i) => {
    const end = now - (WEEKS - 1 - i) * 7 * DAY;
    return { count: created.filter((t) => t > end - 7 * DAY && t <= end).length };
  });
  const maxBucket = Math.max(1, ...buckets.map((b) => b.count));

  // Adoption funnel — distinct users reaching each stage.
  const usersWithPortfolio = distinctUsers(portfolioRows);
  const usersWithHolding = distinctUsers(holdingRows);
  const usersWithAi = distinctUsers(aiUserRows);
  const funnelBase = Math.max(totalUsers, usersWithPortfolio, 1);
  const funnel = [
    { label: "Signed up", value: totalUsers },
    { label: "Built a portfolio", value: usersWithPortfolio },
    { label: "Added holdings", value: usersWithHolding },
    { label: "Ran AI analysis", value: usersWithAi },
    { label: "Started planning", value: planningCount },
  ];

  // Mixes (aggregate category counts).
  const accountMix = groupBy(portfolioRows, "account_type", "other");
  const assetMix = groupBy(holdingRows, "asset_type", "stock");
  const accountTotal = accountMix.reduce((s, m) => s + m.count, 0);
  const assetTotal = assetMix.reduce((s, m) => s + m.count, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <style>{`
        @keyframes bt-adm-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @keyframes bt-adm-bar { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        @keyframes bt-adm-wide { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        .bt-adm-reveal { animation: bt-adm-up .5s cubic-bezier(0.16,1,0.3,1) both; }
        .bt-adm-bar { transform-origin: bottom; animation: bt-adm-bar .6s cubic-bezier(0.16,1,0.3,1) both; }
        .bt-adm-wide { transform-origin: left; animation: bt-adm-wide .7s cubic-bezier(0.16,1,0.3,1) both; }
        @media (prefers-reduced-motion: reduce) { .bt-adm-reveal, .bt-adm-bar, .bt-adm-wide { animation: none !important; } }
      `}</style>

      <div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "22px", fontWeight: 700, letterSpacing: "-0.4px", color: "var(--text-primary)" }}>Overview</h1>
        <p style={{ fontSize: "13px", color: "var(--text-tertiary)", marginTop: "2px" }}>
          Platform KPIs at a glance. Aggregate only — no individual users, balances, or sensitive data.
        </p>
      </div>

      {/* Headline KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px" }}>
        <Tile label="Total users" value={totalUsers} sub={usersCapped ? "1,000+ (sampled)" : `+${new7} this week`} accent delay={0} />
        <Tile label="New (30 days)" value={new30} sub={`${new7} in last 7 days`} delay={50} />
        <Tile label="Active portfolios" value={activePortfolios} delay={100} />
        <Tile label="Holdings tracked" value={holdingsCount} delay={150} />
        <Tile label="AI analyses" value={aiRunsTotal} sub={`${aiRuns7} in last 7 days`} delay={200} />
        <Tile label="Avg feedback" value={avgRating} decimals={2} suffix="★" sub={`${feedbackCount} responses`} delay={250} />
      </div>

      {/* Signups trend */}
      <section className="bt-adm-reveal" style={{ ...sectionCard, animationDelay: "120ms" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "18px" }}>
          <h2 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>New signups</h2>
          <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>last 8 weeks</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "10px", height: "120px" }}>
          {buckets.map((b, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", height: "100%", justifyContent: "flex-end" }}>
              <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{b.count}</span>
              <div className="bt-adm-bar" style={{
                width: "100%", maxWidth: "38px", animationDelay: `${i * 60}ms`,
                height: `${Math.max(4, (b.count / maxBucket) * 92)}px`,
                background: i === WEEKS - 1 ? "linear-gradient(180deg,#0ea5a0,#3fae4a)" : "rgba(63,174,74,0.28)",
                borderRadius: "6px 6px 2px 2px",
              }} />
              <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{i === WEEKS - 1 ? "now" : `-${WEEKS - 1 - i}w`}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Adoption funnel */}
      <section className="bt-adm-reveal" style={{ ...sectionCard, animationDelay: "160ms" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "16px" }}>
          <h2 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>Adoption funnel</h2>
          <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>distinct users</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "11px" }}>
          {funnel.map((f, i) => {
            const pct = funnelBase ? Math.round((f.value / funnelBase) * 100) : 0;
            return (
              <div key={f.label} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ width: "118px", fontSize: "12.5px", color: "var(--text-secondary)", flexShrink: 0 }}>{f.label}</span>
                <div style={{ flex: 1, height: "26px", borderRadius: "7px", background: "rgba(148,163,184,0.1)", overflow: "hidden", position: "relative" }}>
                  <div className="bt-adm-wide" style={{
                    height: "100%", width: `${Math.max(2, pct)}%`,
                    background: "linear-gradient(90deg,#0ea5a0,#3fae4a)", borderRadius: "7px",
                    animationDelay: `${i * 80}ms`,
                  }} />
                </div>
                <span style={{ width: "84px", textAlign: "right", fontSize: "12.5px", fontFamily: "var(--font-mono)", color: "var(--text-primary)", flexShrink: 0 }}>
                  {f.value.toLocaleString()} <span style={{ color: "var(--text-tertiary)" }}>· {pct}%</span>
                </span>
              </div>
            );
          })}
        </div>
        <p style={{ fontSize: "10.5px", color: "var(--text-tertiary)", marginTop: "12px" }}>
          Share of signed-up users who reached each stage.
        </p>
      </section>

      {/* Mixes */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px" }}>
        <div className="bt-adm-reveal" style={{ animationDelay: "180ms" }}>
          <MixCard title="Portfolios by account type" data={accountMix} labels={ACCOUNT_LABELS} total={accountTotal} />
        </div>
        <div className="bt-adm-reveal" style={{ animationDelay: "220ms" }}>
          <MixCard title="Holdings by asset type" data={assetMix} labels={ASSET_LABELS} total={assetTotal} />
        </div>
      </div>

      {/* Engagement */}
      <section className="bt-adm-reveal" style={{ animationDelay: "240ms" }}>
        <h2 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "12px" }}>Engagement</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px" }}>
          <Tile label="Strategies created" value={strategies} delay={0} />
          <Tile label="Badges earned" value={badgesEarned} delay={50} />
          <Tile label="Notifications sent" value={notifications} delay={100} />
          <Tile label="AI analyses (7d)" value={aiRuns7} delay={150} />
        </div>
      </section>
    </div>
  );
}
