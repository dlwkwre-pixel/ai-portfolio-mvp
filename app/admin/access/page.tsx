import { createAdminClient } from "@/lib/supabase/admin";
import { BLOCKABLE_PAGES } from "@/lib/access/page-blocks";
import AccessAdminClient, { type AccessUser } from "./access-admin-client";

export const metadata = { title: "Access — BuyTune Admin" };
export const dynamic = "force-dynamic";

// Per-account access control, in one place: whether the account can use the
// app at all (approval gate, enforced in proxy.ts) and which pages it can
// reach once in (page_blocks). Admin gate lives in app/admin/layout.tsx.
export default async function AccessAdminPage() {
  const admin = createAdminClient();

  const blocksByUser = new Map<string, Set<string>>();
  let tableMissing = false;
  try {
    const { data: blocks, error } = await admin.from("page_blocks").select("user_id, page");
    if (error) tableMissing = true;
    for (const b of blocks ?? []) {
      const set = blocksByUser.get(b.user_id) ?? new Set<string>();
      set.add(b.page as string);
      blocksByUser.set(b.user_id, set);
    }
  } catch { tableMissing = true; }

  const approvalByUser = new Map<string, boolean>();
  try {
    const { data: profiles } = await admin.from("user_profiles").select("id, approved");
    for (const p of profiles ?? []) approvalByUser.set(p.id as string, !!p.approved);
  } catch { /* non-fatal */ }

  const users: AccessUser[] = [];
  try {
    const { data: userList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of userList?.users ?? []) {
      users.push({
        id: u.id,
        email: u.email ?? "(no email)",
        blocked: [...(blocksByUser.get(u.id) ?? [])],
        approved: approvalByUser.get(u.id) ?? false,
      });
    }
  } catch { /* non-fatal */ }

  // Pending approval first (most actionable), then restricted users, then by email.
  users.sort((a, b) => (Number(a.approved) - Number(b.approved)) || (b.blocked.length - a.blocked.length) || a.email.localeCompare(b.email));

  return (
    <div>
      <div style={{ marginBottom: "16px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 800, fontFamily: "var(--font-display)", color: "var(--text-primary)", margin: "0 0 4px" }}>Access</h1>
        <p style={{ fontSize: "13px", color: "var(--text-tertiary)", maxWidth: "72ch" }}>
          New accounts can&apos;t use BuyTune at all until approved. Once approved, everyone
          starts with every page; toggle a section <strong>off</strong> for an account and it
          disappears from their navigation, showing an &ldquo;under construction&rdquo; notice
          if they reach it by link anyway.
        </p>
      </div>
      {tableMissing && (
        <p style={{ fontSize: "12.5px", color: "#f59e0b", marginBottom: "14px" }}>
          Run <span style={{ fontFamily: "var(--font-mono)" }}>supabase/page-blocks.sql</span> in the SQL editor, then reload.
        </p>
      )}
      <AccessAdminClient users={users} pages={BLOCKABLE_PAGES.map((p) => ({ ...p }))} />
    </div>
  );
}
