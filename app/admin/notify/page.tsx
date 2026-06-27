import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import NotifyForm from "./notify-form";

export const metadata = { title: "Notifications — BuyTune Admin" };
export const dynamic = "force-dynamic";

type NotificationRow = { id: string; title: string; body: string; created_at: string; target_user_id: string | null };

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default async function NotifyPage() {
  // Defense-in-depth: re-verify admin before the service-role read.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) {
    return <p style={{ color: "var(--text-tertiary)" }}>Not authorized.</p>;
  }

  const admin = createAdminClient();
  const { data: recentRaw } = await admin
    .from("app_notifications")
    .select("id, title, body, created_at, target_user_id")
    .order("created_at", { ascending: false })
    .limit(10);
  const recent = (recentRaw ?? []) as NotificationRow[];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "22px", fontWeight: 700, letterSpacing: "-0.4px", color: "var(--text-primary)" }}>Notifications</h1>
        <p style={{ fontSize: "13px", color: "var(--text-tertiary)", marginTop: "2px" }}>
          Post to the in-app bell for every user. It can&apos;t be unsent, so double-check the wording.
        </p>
      </div>

      <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "14px", padding: "22px 24px" }}>
        <NotifyForm />
      </div>

      {/* Recently sent */}
      <section>
        <h2 style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", marginBottom: "12px" }}>
          Recently sent
        </h2>
        {recent.length === 0 ? (
          <p style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>Nothing sent yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--card-border)", borderRadius: "14px", overflow: "hidden", background: "var(--card-bg)" }}>
            {recent.map((n, i) => (
              <div key={n.id} style={{ padding: "13px 18px", borderTop: i === 0 ? "none" : "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", marginBottom: "3px" }}>
                  <span style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text-primary)" }}>{n.title}</span>
                  <span style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                    {!n.target_user_id && (
                      <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--accent, #6366f1)", border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))", borderRadius: "999px", padding: "1px 8px" }}>All users</span>
                    )}
                    <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{formatDate(n.created_at)}</span>
                  </span>
                </div>
                <p style={{ fontSize: "12.5px", color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>{n.body}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
