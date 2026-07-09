import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import ConnectionsAdminClient, { type AccessUser } from "./connections-admin-client";

export const dynamic = "force-dynamic";

export default async function AdminConnectionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) {
    return <p style={{ color: "var(--text-tertiary)" }}>Not authorized.</p>;
  }

  const admin = createAdminClient();

  // Current grants.
  const grantsByUser = new Map<string, Set<string>>();
  try {
    const { data: grants } = await admin.from("feature_access").select("user_id, feature");
    for (const g of grants ?? []) {
      const set = grantsByUser.get(g.user_id) ?? new Set<string>();
      set.add(g.feature as string);
      grantsByUser.set(g.user_id, set);
    }
  } catch { /* table may not exist yet */ }

  // All users.
  const users: AccessUser[] = [];
  try {
    const { data: userList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of userList?.users ?? []) {
      const set = grantsByUser.get(u.id) ?? new Set<string>();
      users.push({
        id: u.id,
        email: u.email ?? "(no email)",
        brokerage: set.has("brokerage_connect"),
        bank: set.has("bank_connect"),
      });
    }
  } catch { /* non-fatal */ }

  // Granted users first, then by email.
  users.sort((a, b) => {
    const ga = (a.brokerage || a.bank) ? 0 : 1;
    const gb = (b.brokerage || b.bank) ? 0 : 1;
    return ga - gb || a.email.localeCompare(b.email);
  });

  return (
    <div>
      <div style={{ marginBottom: "16px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 800, fontFamily: "var(--font-display)", color: "var(--text-primary)", margin: "0 0 4px" }}>Account connections</h1>
        <p style={{ fontSize: "13px", color: "var(--text-tertiary)", maxWidth: "72ch" }}>
          Private beta allowlist. Grant a user <strong>Brokerage</strong> (SnapTrade, read-only holdings) or <strong>Bank</strong> (Plaid) access. Nobody sees connect options until you switch them on here. Live wiring lands once the API keys are set; this controls who gets in.
        </p>
      </div>
      <ConnectionsAdminClient users={users} />
    </div>
  );
}
