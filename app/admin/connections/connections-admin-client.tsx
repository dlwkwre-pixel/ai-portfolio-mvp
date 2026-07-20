"use client";

import { useMemo, useState, useTransition } from "react";
import { setFeatureAccess } from "./actions";

export type AccessUser = { id: string; email: string; brokerage: boolean; bank: boolean };

function Toggle({ on, label, color, onClick, disabled }: {
  on: boolean; label: string; color: string; onClick: () => void; disabled: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 11px", borderRadius: "999px",
        fontSize: "11.5px", fontWeight: 600, cursor: disabled ? "default" : "pointer", fontFamily: "var(--font-body)",
        border: `1px solid ${on ? color : "var(--border-subtle)"}`,
        background: on ? `${color}22` : "transparent",
        color: on ? color : "var(--text-tertiary)", opacity: disabled ? 0.5 : 1, transition: "all .12s",
      }}>
      <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: on ? color : "var(--text-muted, #475569)" }} />
      {label}{on ? " · on" : ""}
    </button>
  );
}

export default function ConnectionsAdminClient({ users }: { users: AccessUser[] }) {
  const [rows, setRows] = useState(users);
  const [q, setQ] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [err, setErr] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? rows.filter((r) => r.email.toLowerCase().includes(s)) : rows;
  }, [rows, q]);

  const grantedCount = rows.filter((r) => r.brokerage || r.bank).length;

  function toggle(u: AccessUser, feature: "brokerage_connect" | "bank_connect") {
    const key = feature === "brokerage_connect" ? "brokerage" : "bank";
    const next = !u[key];
    setPendingId(u.id + feature);
    setErr("");
    // Optimistic.
    setRows((prev) => prev.map((r) => (r.id === u.id ? { ...r, [key]: next } : r)));
    startTransition(async () => {
      const res = await setFeatureAccess(u.id, feature, next);
      if (res.error) {
        setErr(res.error.includes("feature_access") ? "Run supabase/feature-access.sql first." : res.error);
        setRows((prev) => prev.map((r) => (r.id === u.id ? { ...r, [key]: !next } : r))); // revert
      }
      setPendingId(null);
    });
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "12px" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by email"
          style={{ flex: "1 1 240px", padding: "9px 12px", borderRadius: "10px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", fontSize: "13px" }} />
        <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>{grantedCount} granted · {rows.length} users</span>
      </div>
      {err && <div style={{ fontSize: "12px", color: "#f59e0b", marginBottom: "10px" }}>{err}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {filtered.map((u) => (
          <div key={u.id} style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", padding: "10px 12px", borderRadius: "10px", background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
            <span style={{ flex: "1 1 200px", minWidth: 0, fontSize: "13px", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</span>
            <div style={{ display: "flex", gap: "7px", flexShrink: 0 }}>
              <Toggle on={u.brokerage} label="Brokerage" color="#00d395" disabled={pendingId === u.id + "brokerage_connect"} onClick={() => toggle(u, "brokerage_connect")} />
              <Toggle on={u.bank} label="Bank" color="#5fbf9a" disabled={pendingId === u.id + "bank_connect"} onClick={() => toggle(u, "bank_connect")} />
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>No users match.</p>}
      </div>
    </div>
  );
}
