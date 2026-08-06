"use client";

import { useState, useTransition } from "react";
import { setApproval } from "./actions";

export type ApprovalUser = { id: string; email: string; createdAt: string; approved: boolean; approvedAt: string | null };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// One row per account: email, signup date, approval status, Approve/Revoke
// toggle. Optimistic updates, server-verified via setApproval. Pending
// accounts are listed first (sorted server-side).
export default function ApprovalsClient({ users }: { users: ApprovalUser[] }) {
  const [approvedMap, setApprovedMap] = useState<Map<string, boolean>>(
    () => new Map(users.map((u) => [u.id, u.approved])),
  );
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState("");

  function toggle(userId: string, nextApproved: boolean) {
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
  const pendingCount = users.filter((u) => !(approvedMap.get(u.id) ?? u.approved)).length;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px", flexWrap: "wrap" }}>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by email…"
          aria-label="Filter users by email"
          style={{
            width: "100%", maxWidth: "320px",
            background: "var(--surface-005)", border: "1px solid var(--border-subtle)",
            borderRadius: "10px", padding: "8px 12px", fontSize: "13px",
            color: "var(--text-primary)", outline: "none",
          }}
        />
        {pendingCount > 0 && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 600, color: "#f59e0b" }}>
            {pendingCount} pending
          </span>
        )}
      </div>
      {err && <p style={{ fontSize: "12px", color: "var(--red)", marginBottom: "10px" }}>{err}</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {shown.map((u) => {
          const approved = approvedMap.get(u.id) ?? u.approved;
          return (
            <div key={u.id} style={{
              display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
              background: "var(--bg-card)", border: "1px solid var(--border-subtle)",
              borderRadius: "12px", padding: "12px 16px",
            }}>
              <div style={{ flex: 1, minWidth: "180px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{u.email}</div>
                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginTop: "2px" }}>
                  signed up {formatDate(u.createdAt)}
                </div>
              </div>
              <span style={{
                fontSize: "11px", fontWeight: 600, padding: "4px 10px", borderRadius: "999px",
                color: approved ? "var(--green)" : "#f59e0b",
                background: approved ? "var(--green-bg)" : "rgba(245,158,11,0.1)",
                border: `1px solid ${approved ? "var(--green-border)" : "rgba(245,158,11,0.3)"}`,
              }}>
                {approved ? "Approved" : "Pending"}
              </span>
              <button
                onClick={() => toggle(u.id, !approved)}
                disabled={isPending}
                style={{
                  padding: "7px 14px", borderRadius: "8px", fontSize: "12.5px", fontWeight: 600,
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
          );
        })}
        {shown.length === 0 && (
          <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>No users match.</p>
        )}
      </div>
    </div>
  );
}
