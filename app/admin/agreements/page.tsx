import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import AgreementsClient, { type AgreementUser } from "./agreements-client";

export const dynamic = "force-dynamic";

// Keep in sync with the value written in app/actions/terms-actions.ts + app/api/accept-terms.
const CURRENT_TERMS_VERSION = "2026-05-18";

export default async function AdminAgreementsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) {
    return <p style={{ color: "var(--text-tertiary)" }}>Not authorized.</p>;
  }

  const admin = createAdminClient();

  const profileById = new Map<string, { acceptedAt: string | null; version: string | null }>();
  try {
    const { data: profiles } = await admin.from("user_profiles").select("id, terms_accepted_at, terms_version");
    for (const p of profiles ?? []) profileById.set(p.id, { acceptedAt: p.terms_accepted_at ?? null, version: p.terms_version ?? null });
  } catch { /* column may not exist yet */ }

  const users: AgreementUser[] = [];
  try {
    const { data: userList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of userList?.users ?? []) {
      const p = profileById.get(u.id);
      users.push({
        id: u.id,
        email: u.email ?? "(no email)",
        createdAt: u.created_at ?? null,
        termsAcceptedAt: p?.acceptedAt ?? null,
        termsVersion: p?.version ?? null,
      });
    }
  } catch { /* non-fatal */ }

  const total = users.length;
  const accepted = users.filter((u) => u.termsAcceptedAt).length;
  const pending = total - accepted;
  const outdated = users.filter((u) => u.termsAcceptedAt && u.termsVersion && u.termsVersion !== CURRENT_TERMS_VERSION).length;

  const stat = (label: string, value: string | number, color?: string) => (
    <div style={{ flex: "1 1 130px", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "12px", padding: "12px 14px" }}>
      <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)", marginBottom: "4px" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: "20px", color: color ?? "var(--text-primary)" }}>{value}</div>
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: "14px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 800, fontFamily: "var(--font-display)", color: "var(--text-primary)", margin: "0 0 4px" }}>Agreements</h1>
        <p style={{ fontSize: "13px", color: "var(--text-tertiary)", maxWidth: "72ch" }}>
          Who has accepted the Terms of Service, when, and which version. Current version <strong>{CURRENT_TERMS_VERSION}</strong>. Acceptance is captured on sign-in via the terms modal.
        </p>
      </div>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "16px" }}>
        {stat("Users", total)}
        {stat("Accepted", accepted, "#00d395")}
        {stat("Pending", pending, pending > 0 ? "#f59e0b" : "var(--text-primary)")}
        {stat("Outdated version", outdated, outdated > 0 ? "#f59e0b" : "var(--text-primary)")}
      </div>
      <AgreementsClient users={users} currentVersion={CURRENT_TERMS_VERSION} />
    </div>
  );
}
