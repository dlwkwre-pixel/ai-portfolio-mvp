import { createAdminClient } from "@/lib/supabase/admin";
import { BLOCKABLE_PAGES } from "@/lib/access/page-blocks";
import AccessAdminClient, { type AccessUser } from "./access-admin-client";

export const metadata = { title: "Page Access — BuyTune Admin" };
export const dynamic = "force-dynamic";

// Per-account page access. Every account starts with everything; toggling a
// page OFF here hides it from that user's nav and shows an under-construction
// wall if they reach it anyway. Admin gate lives in app/admin/layout.tsx.
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

  const users: AccessUser[] = [];
  try {
    const { data: userList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of userList?.users ?? []) {
      users.push({
        id: u.id,
        email: u.email ?? "(no email)",
        blocked: [...(blocksByUser.get(u.id) ?? [])],
      });
    }
  } catch { /* non-fatal */ }

  // Restricted users first, then by email.
  users.sort((a, b) => (b.blocked.length - a.blocked.length) || a.email.localeCompare(b.email));

  return (
    <div>
      <div style={{ marginBottom: "16px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 800, fontFamily: "var(--font-display)", color: "var(--text-primary)", margin: "0 0 4px" }}>Page access</h1>
        <p style={{ fontSize: "13px", color: "var(--text-tertiary)", maxWidth: "72ch" }}>
          Everyone starts with every page. Toggle a section <strong>off</strong> for an account and it
          disappears from their navigation; if they reach it by link anyway they see an
          &ldquo;under construction&rdquo; notice — never your name on it.
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
