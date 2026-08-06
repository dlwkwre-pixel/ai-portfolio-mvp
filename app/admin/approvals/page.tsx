import { createAdminClient } from "@/lib/supabase/admin";
import ApprovalsClient, { type ApprovalUser } from "./approvals-client";

export const metadata = { title: "Approvals — BuyTune Admin" };
export const dynamic = "force-dynamic";

// Account-approval gate. New signups can't use the app (proxy.ts blocks
// every route) until approved here. Admin gate lives in app/admin/layout.tsx.
export default async function ApprovalsAdminPage() {
  const admin = createAdminClient();

  const approvedById = new Map<string, { approved: boolean; approvedAt: string | null }>();
  let tableMissing = false;
  try {
    const { data: profiles, error } = await admin.from("user_profiles").select("id, approved, approved_at");
    if (error) tableMissing = true;
    for (const p of profiles ?? []) {
      approvedById.set(p.id as string, { approved: !!p.approved, approvedAt: (p.approved_at as string | null) ?? null });
    }
  } catch { tableMissing = true; }

  const users: ApprovalUser[] = [];
  try {
    const { data: userList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of userList?.users ?? []) {
      const info = approvedById.get(u.id);
      users.push({
        id: u.id,
        email: u.email ?? "(no email)",
        createdAt: u.created_at,
        approved: info?.approved ?? false,
        approvedAt: info?.approvedAt ?? null,
      });
    }
  } catch { /* non-fatal */ }

  // Pending first, then newest signups first within each group.
  users.sort((a, b) => (Number(a.approved) - Number(b.approved)) || (b.createdAt.localeCompare(a.createdAt)));

  return (
    <div>
      <div style={{ marginBottom: "16px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 800, fontFamily: "var(--font-display)", color: "var(--text-primary)", margin: "0 0 4px" }}>Approvals</h1>
        <p style={{ fontSize: "13px", color: "var(--text-tertiary)", maxWidth: "72ch" }}>
          New accounts can&apos;t use BuyTune until approved here. Approve an account
          to unlock the whole app for it; revoke to lock it back out.
        </p>
      </div>
      {tableMissing && (
        <p style={{ fontSize: "12.5px", color: "#f59e0b", marginBottom: "14px" }}>
          Run <span style={{ fontFamily: "var(--font-mono)" }}>supabase/account-approval.sql</span> in the SQL editor, then reload.
        </p>
      )}
      <ApprovalsClient users={users} />
    </div>
  );
}
