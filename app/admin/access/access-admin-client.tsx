"use client";

import { useState, useTransition } from "react";
import { setPageBlock, setApproval } from "./actions";

export type AccessUser = { id: string; email: string; blocked: string[]; approved: boolean };
type PageDef = { id: string; label: string };

// Toggle grid: one row per account, approval status + a chip per page. Green
// chip = has access (default); dim struck chip = blocked. Optimistic
// updates, server-verified.
export default function AccessAdminClient({ users, pages }: { users: AccessUser[]; pages: PageDef[] }) {
  const [blockedMap, setBlockedMap] = useState<Map<string, Set<string>>>(
    () => new Map(users.map((u) => [u.id, new Set(u.blocked)])),
  );
  const [approvedMap, setApprovedMap] = useState<Map<string, boolean>>(
    () => new Map(users.map((u) => [u.id, u.approved])),
  );
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState("");

  function toggle(userId: string, page: string) {
    const current = blockedMap.get(userId) ?? new Set<string>();
    const nextBlocked = !current.has(page);
    setErr(null);
    // optimistic
    setBlockedMap((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(userId) ?? []);
      if (nextBlocked) set.add(page); else set.delete(page);
      next.set(userId, set);
      return next;
    });
    startTransition(async () => {
      const res = await setPageBlock(userId, page, nextBlocked);
      if (res.error) {
        setErr(`${res.error}`);
        // revert
        setBlockedMap((prev) => {
          const next = new Map(prev);
          const set = new Set(next.get(userId) ?? []);
          if (nextBlocked) set.delete(page); else set.add(page);
          next.set(userId, set);
          return next;
        });
      }
    });
  }

  function toggleApproval(userId: string, nextApproved: boolean) {
    setErr(null);
    setApprovedMap((prev) => new Map(prev).set(userId, nextApproved));
    startTransition(async () => {
      const res = await setApproval(userId, nextApproved);
      if (res.error) {
        setErr(res.error);
        setApprovedMap((prev) => new Map(prev).set(userId, !nextApproved));
      }
    });
  }

  const shown = filter
    ? users.filter((u) => u.email.toLowerCase().includes(filter.toLowerCase()))
    : users;

  return (
    <div>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by email…"
        aria-label="Filter users by email"
        style={{
          width: "100%", maxWidth: "320px", marginBottom: "14px",
          background: "var(--surface-005)", border: "1px solid var(--border-subtle)",
          borderRadius: "10px", padding: "8px 12px", fontSize: "13px",
          color: "var(--text-primary)", outline: "none",
        }}
      />
      {err && <p style={{ fontSize: "12px", color: "var(--red)", marginBottom: "10px" }}>{err}</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {shown.map((u) => {
          const blocked = blockedMap.get(u.id) ?? new Set<string>();
          const approved = approvedMap.get(u.id) ?? u.approved;
          return (
            <div key={u.id} style={{
              background: "var(--bg-card)", border: "1px solid var(--border-subtle)",
              borderRadius: "12px", padding: "12px 16px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "9px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginRight: "auto" }}>{u.email}</span>
                {blocked.size > 0 && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "#f59e0b" }}>
                    {blocked.size} page{blocked.size !== 1 ? "s" : ""} blocked
                  </span>
                )}
                <span style={{
                  fontSize: "11px", fontWeight: 600, padding: "4px 10px", borderRadius: "999px",
                  color: approved ? "var(--green)" : "#f59e0b",
                  background: approved ? "var(--green-bg)" : "rgba(245,158,11,0.1)",
                  border: `1px solid ${approved ? "var(--green-border)" : "rgba(245,158,11,0.3)"}`,
                }}>
                  {approved ? "Approved" : "Pending"}
                </span>
                <button
                  onClick={() => toggleApproval(u.id, !approved)}
                  disabled={isPending}
                  style={{
                    padding: "6px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 600,
                    cursor: "pointer", border: "1px solid",
                    borderColor: approved ? "var(--border-subtle)" : "var(--green-border)",
                    background: approved ? "transparent" : "var(--green-bg)",
                    color: approved ? "var(--text-muted)" : "var(--green)",
                    opacity: isPending ? 0.7 : 1,
                  }}
                >
                  {approved ? "Revoke" : "Approve"}
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {pages.map((p) => {
                  const isBlocked = blocked.has(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggle(u.id, p.id)}
                      disabled={isPending}
                      aria-pressed={!isBlocked}
                      aria-label={`${p.label}: ${isBlocked ? "blocked — click to restore" : "accessible — click to block"}`}
                      title={isBlocked ? "Blocked — click to restore" : "Accessible — click to block"}
                      style={{
                        padding: "5px 11px", borderRadius: "999px", fontSize: "11px", fontWeight: 600,
                        cursor: "pointer", border: "1px solid", transition: "all 120ms", minHeight: "28px",
                        borderColor: isBlocked ? "var(--border-subtle)" : "var(--green-border)",
                        background: isBlocked ? "transparent" : "var(--green-bg)",
                        color: isBlocked ? "var(--text-muted)" : "var(--green)",
                        textDecoration: isBlocked ? "line-through" : "none",
                        opacity: isPending ? 0.7 : 1,
                      }}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {shown.length === 0 && (
          <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>No users match.</p>
        )}
      </div>
    </div>
  );
}
