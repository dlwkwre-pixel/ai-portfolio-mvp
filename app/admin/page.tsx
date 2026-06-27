import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Overview — BuyTune Admin" };
export const dynamic = "force-dynamic";

// Aggregate platform KPIs only. By design this page shows NO per-user information,
// no portfolio values, and no other sensitive data — just counts and trends.

// Await a fully-built head-count query (chained directly so Supabase keeps it typed),
// returning 0 on any failure (e.g. table missing).
async function countOf(qb: PromiseLike<{ count: number | null }>): Promise<number> {
  try {
    const { count } = await qb;
    return count ?? 0;
  } catch {
    return 0;
  }
}

const DAY = 86_400_000;

// Wrapped so the render body has no lexical impure call (react-hooks/purity).
function nowMs(): number {
  return Date.now();
}

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div style={{
      background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "14px",
      padding: "16px 18px", display: "flex", flexDirection: "column", gap: "6px",
    }}>
      <span style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-tertiary)" }}>{label}</span>
      <span style={{ fontSize: "26px", fontWeight: 700, lineHeight: 1, color: accent ? "var(--accent, #6366f1)" : "var(--text-primary)", fontFamily: "var(--font-mono)", letterSpacing: "-0.5px" }}>{value}</span>
      {sub && <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>{sub}</span>}
    </div>
  );
}

export default async function AdminOverview() {
  // Defense-in-depth: re-verify admin before touching the service-role client.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  const isAdmin = !!user && !!adminEmail && user.email === adminEmail;
  if (!isAdmin) {
    return <p style={{ color: "var(--text-tertiary)" }}>Not authorized.</p>;
  }

  const admin = createAdminClient();
  const now = nowMs();
  const since7 = new Date(now - 7 * DAY).toISOString();

  const [
    activePortfolios, holdings, strategies, aiRunsTotal, aiRuns7,
    notifications, badgesEarned, feedbackCount, ratingsRes, usersRes,
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
  ]);

  // Aggregate feedback rating (no user attribution).
  const ratings = (ratingsRes.data ?? []).map((r) => r.rating as number).filter((n) => typeof n === "number");
  const avgRating = ratings.length ? ratings.reduce((s, n) => s + n, 0) / ratings.length : 0;

  // Signups — created_at only, never identities.
  const users = usersRes?.data?.users ?? [];
  const totalUsers = users.length;
  const created = users.map((u) => new Date(u.created_at).getTime()).filter((t) => !Number.isNaN(t));
  const new7 = created.filter((t) => t >= now - 7 * DAY).length;
  const new30 = created.filter((t) => t >= now - 30 * DAY).length;

  // Last 8 rolling weeks, oldest → newest.
  const WEEKS = 8;
  const buckets = Array.from({ length: WEEKS }, (_, i) => {
    const end = now - (WEEKS - 1 - i) * 7 * DAY;
    const start = end - 7 * DAY;
    return { count: created.filter((t) => t > start && t <= end).length };
  });
  const maxBucket = Math.max(1, ...buckets.map((b) => b.count));
  const usersCapped = totalUsers >= 1000;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "22px", fontWeight: 700, letterSpacing: "-0.4px", color: "var(--text-primary)" }}>Overview</h1>
        <p style={{ fontSize: "13px", color: "var(--text-tertiary)", marginTop: "2px" }}>
          Platform KPIs at a glance. Aggregate only — no individual users, balances, or sensitive data.
        </p>
      </div>

      {/* Headline KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px" }}>
        <Tile label="Total users" value={usersCapped ? "1,000+" : totalUsers.toLocaleString()} sub={`+${new7} this week`} accent />
        <Tile label="New (30 days)" value={new30.toLocaleString()} sub={`${new7} in last 7 days`} />
        <Tile label="Active portfolios" value={activePortfolios.toLocaleString()} />
        <Tile label="Holdings tracked" value={holdings.toLocaleString()} />
        <Tile label="AI analyses" value={aiRunsTotal.toLocaleString()} sub={`${aiRuns7} in last 7 days`} />
        <Tile label="Avg feedback" value={avgRating ? `${avgRating.toFixed(2)}★` : "—"} sub={`${feedbackCount} responses`} />
      </div>

      {/* Signups trend */}
      <section style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "14px", padding: "20px 22px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "18px" }}>
          <h2 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>New signups</h2>
          <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>last 8 weeks</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "10px", height: "120px" }}>
          {buckets.map((b, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", height: "100%", justifyContent: "flex-end" }}>
              <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{b.count}</span>
              <div style={{
                width: "100%", maxWidth: "38px",
                height: `${Math.max(4, (b.count / maxBucket) * 92)}px`,
                background: i === WEEKS - 1 ? "linear-gradient(180deg,#2563eb,#7c3aed)" : "rgba(99,102,241,0.28)",
                borderRadius: "6px 6px 2px 2px", transition: "height .3s ease",
              }} />
              <span style={{ fontSize: "9.5px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{i === WEEKS - 1 ? "now" : `-${WEEKS - 1 - i}w`}</span>
            </div>
          ))}
        </div>
        {usersCapped && (
          <p style={{ fontSize: "10.5px", color: "var(--text-tertiary)", marginTop: "12px" }}>
            Trend sampled from the most recent 1,000 accounts.
          </p>
        )}
      </section>

      {/* Engagement */}
      <section>
        <h2 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "12px" }}>Engagement</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px" }}>
          <Tile label="Strategies created" value={strategies.toLocaleString()} />
          <Tile label="Badges earned" value={badgesEarned.toLocaleString()} />
          <Tile label="Notifications sent" value={notifications.toLocaleString()} />
          <Tile label="AI analyses (7d)" value={aiRuns7.toLocaleString()} />
        </div>
      </section>
    </div>
  );
}
