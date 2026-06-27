import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Feedback — BuyTune Admin" };
export const dynamic = "force-dynamic";

type FeedbackRow = {
  id: string;
  user_id: string;
  rating: number;
  feedback: string | null;
  created_at: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function Stars({ rating }: { rating: number }) {
  return (
    <span style={{ letterSpacing: "2px", color: "#f59e0b", fontSize: "15px" }}>
      {"★".repeat(rating)}
      <span style={{ color: "rgba(148,163,184,0.25)" }}>{"★".repeat(5 - rating)}</span>
    </span>
  );
}

const card: React.CSSProperties = {
  background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "14px", padding: "18px 20px",
};

export default async function FeedbackDashboard() {
  // Defense-in-depth: re-verify admin before the service-role read.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) {
    return <p style={{ color: "var(--text-tertiary)" }}>Not authorized.</p>;
  }

  // Service-role read: RLS only grants per-user selects.
  const admin = createAdminClient();
  const { data: rawRows } = await admin
    .from("feedback_responses")
    .select("id, user_id, rating, feedback, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = (rawRows ?? []) as FeedbackRow[];

  // Map user ids → emails so the admin can follow up (best-effort).
  const emailById = new Map<string, string>();
  try {
    const { data: userList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of userList?.users ?? []) {
      if (u.email) emailById.set(u.id, u.email);
    }
  } catch { /* non-fatal */ }

  const total = rows.length;
  const avg = total ? rows.reduce((s, r) => s + r.rating, 0) / total : 0;
  const withText = rows.filter((r) => r.feedback && r.feedback.trim()).length;
  const dist = [5, 4, 3, 2, 1].map((star) => ({ star, count: rows.filter((r) => r.rating === star).length }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "22px", fontWeight: 700, letterSpacing: "-0.4px", color: "var(--text-primary)" }}>Feedback</h1>
        <p style={{ fontSize: "13px", color: "var(--text-tertiary)", marginTop: "2px" }}>
          Responses from the &ldquo;Are you enjoying BuyTune?&rdquo; prompt, most recent first.
        </p>
      </div>

      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" }}>
        <div style={card}>
          <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", marginBottom: "8px" }}>Average rating</div>
          <div style={{ fontSize: "28px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text-primary)", lineHeight: 1 }}>
            {avg ? avg.toFixed(2) : "—"}<span style={{ fontSize: "14px", color: "var(--text-tertiary)" }}> / 5</span>
          </div>
          <div style={{ marginTop: "8px" }}><Stars rating={Math.round(avg)} /></div>
        </div>
        <div style={card}>
          <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", marginBottom: "8px" }}>Total responses</div>
          <div style={{ fontSize: "28px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text-primary)", lineHeight: 1 }}>{total}</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", marginBottom: "8px" }}>With written notes</div>
          <div style={{ fontSize: "28px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text-primary)", lineHeight: 1 }}>{withText}</div>
        </div>
      </div>

      {/* Distribution */}
      <div style={card}>
        <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", marginBottom: "14px" }}>Rating distribution</div>
        {dist.map(({ star, count }) => {
          const pct = total ? (count / total) * 100 : 0;
          return (
            <div key={star} style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "9px" }}>
              <span style={{ width: "28px", color: "var(--text-secondary)", fontSize: "13px", fontFamily: "var(--font-mono)" }}>{star}★</span>
              <div style={{ flex: 1, height: "8px", background: "rgba(148,163,184,0.12)", borderRadius: "4px", overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: "#f59e0b", borderRadius: "4px" }} />
              </div>
              <span style={{ width: "36px", textAlign: "right", color: "var(--text-secondary)", fontSize: "13px", fontFamily: "var(--font-mono)" }}>{count}</span>
            </div>
          );
        })}
      </div>

      {/* Responses */}
      <div>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "12px" }}>Responses</h2>
        {rows.length === 0 ? (
          <div style={{ ...card, textAlign: "center", color: "var(--text-tertiary)", fontSize: "14px", padding: "32px" }}>No feedback yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {rows.map((r) => (
              <div key={r.id} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: r.feedback ? "10px" : 0 }}>
                  <Stars rating={r.rating} />
                  <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                    <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{emailById.get(r.user_id) ?? `${r.user_id.slice(0, 8)}…`}</span>
                    <span style={{ fontSize: "12px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{formatDate(r.created_at)}</span>
                  </div>
                </div>
                {r.feedback && (
                  <p style={{ fontSize: "14px", color: "var(--text-primary)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{r.feedback}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
