import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Feedback — BuyTune Admin" };

type FeedbackRow = {
  id: string;
  user_id: string;
  rating: number;
  feedback: string | null;
  created_at: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function Stars({ rating }: { rating: number }) {
  return (
    <span style={{ letterSpacing: "2px", color: "#f59e0b", fontSize: "15px" }}>
      {"★".repeat(rating)}
      <span style={{ color: "rgba(255,255,255,0.18)" }}>{"★".repeat(5 - rating)}</span>
    </span>
  );
}

export default async function FeedbackDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/admin/feedback");

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || user.email !== adminEmail) {
    redirect("/dashboard");
  }

  // Service-role read: RLS only grants per-user selects, so the admin must use
  // the service client to see everyone's feedback.
  const admin = createAdminClient();
  const { data: rawRows } = await admin
    .from("feedback_responses")
    .select("id, user_id, rating, feedback, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = (rawRows ?? []) as FeedbackRow[];

  // Map user ids → emails for context (best-effort).
  const emailById = new Map<string, string>();
  try {
    const { data: userList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of userList?.users ?? []) {
      if (u.email) emailById.set(u.id, u.email);
    }
  } catch { /* non-fatal — fall back to user id */ }

  const total = rows.length;
  const avg = total ? rows.reduce((s, r) => s + r.rating, 0) / total : 0;
  const withText = rows.filter((r) => r.feedback && r.feedback.trim()).length;
  const dist = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: rows.filter((r) => r.rating === star).length,
  }));

  return (
    <div style={{ minHeight: "100vh", background: "#07090f", color: "#e2e8f0", fontFamily: "'DM Sans', sans-serif", padding: "40px 32px 80px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .fb-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 20px 24px; margin-bottom: 16px; }
        .fb-mono { font-family: 'DM Mono', monospace; }
      `}</style>

      <div style={{ maxWidth: "860px", margin: "0 auto" }}>
        <div style={{ marginBottom: "8px" }}>
          <Link href="/admin/compliance" style={{ fontSize: "12px", color: "#60a5fa", textDecoration: "none" }}>
            ← Admin
          </Link>
        </div>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: "28px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>
          User Feedback
        </h1>
        <p style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "28px" }}>
          Responses from the &ldquo;Are you enjoying BuyTune?&rdquo; prompt, most recent first.
        </p>

        {/* Summary stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "16px", marginBottom: "28px" }}>
          <div className="fb-card" style={{ margin: 0 }}>
            <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b", marginBottom: "8px" }}>
              Average rating
            </div>
            <div className="fb-mono" style={{ fontSize: "30px", fontWeight: 500, color: "#fff", lineHeight: 1 }}>
              {avg ? avg.toFixed(2) : "—"}
              <span style={{ fontSize: "15px", color: "#64748b" }}> / 5</span>
            </div>
            <div style={{ marginTop: "8px" }}>
              <Stars rating={Math.round(avg)} />
            </div>
          </div>
          <div className="fb-card" style={{ margin: 0 }}>
            <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b", marginBottom: "8px" }}>
              Total responses
            </div>
            <div className="fb-mono" style={{ fontSize: "30px", fontWeight: 500, color: "#fff", lineHeight: 1 }}>{total}</div>
          </div>
          <div className="fb-card" style={{ margin: 0 }}>
            <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b", marginBottom: "8px" }}>
              With written notes
            </div>
            <div className="fb-mono" style={{ fontSize: "30px", fontWeight: 500, color: "#fff", lineHeight: 1 }}>{withText}</div>
          </div>
        </div>

        {/* Distribution */}
        <div className="fb-card">
          <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b", marginBottom: "14px" }}>
            Rating distribution
          </div>
          {dist.map(({ star, count }) => {
            const pct = total ? (count / total) * 100 : 0;
            return (
              <div key={star} style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                <span className="fb-mono" style={{ width: "28px", color: "#94a3b8", fontSize: "13px" }}>{star}★</span>
                <div style={{ flex: 1, height: "8px", background: "rgba(255,255,255,0.06)", borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: "#f59e0b", borderRadius: "4px" }} />
                </div>
                <span className="fb-mono" style={{ width: "36px", textAlign: "right", color: "#cbd5e1", fontSize: "13px" }}>{count}</span>
              </div>
            );
          })}
        </div>

        {/* Responses */}
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: "16px", fontWeight: 700, color: "#fff", margin: "28px 0 14px" }}>
          Responses
        </h2>

        {rows.length === 0 ? (
          <div className="fb-card" style={{ textAlign: "center", color: "#64748b", fontSize: "14px", padding: "32px" }}>
            No feedback yet.
          </div>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="fb-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: r.feedback ? "10px" : 0 }}>
                <Stars rating={r.rating} />
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                    {emailById.get(r.user_id) ?? `${r.user_id.slice(0, 8)}…`}
                  </span>
                  <span className="fb-mono" style={{ fontSize: "12px", color: "#64748b" }}>{formatDate(r.created_at)}</span>
                </div>
              </div>
              {r.feedback && (
                <p style={{ fontSize: "14px", color: "#e2e8f0", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                  {r.feedback}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
