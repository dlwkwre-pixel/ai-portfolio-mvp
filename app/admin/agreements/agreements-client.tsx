"use client";

import { useMemo, useState } from "react";

export type AgreementUser = {
  id: string;
  email: string;
  createdAt: string | null;
  termsAcceptedAt: string | null;
  termsVersion: string | null;
};

type Filter = "all" | "accepted" | "pending" | "outdated";

function fmt(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); } catch { return "—"; }
}

export default function AgreementsClient({ users, currentVersion }: { users: AgreementUser[]; currentVersion: string }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = users;
    if (filter === "accepted") list = list.filter((u) => u.termsAcceptedAt);
    else if (filter === "pending") list = list.filter((u) => !u.termsAcceptedAt);
    else if (filter === "outdated") list = list.filter((u) => u.termsAcceptedAt && u.termsVersion && u.termsVersion !== currentVersion);
    if (s) list = list.filter((u) => u.email.toLowerCase().includes(s));
    // Pending first, then most recently accepted.
    return [...list].sort((a, b) => {
      if (!a.termsAcceptedAt && b.termsAcceptedAt) return -1;
      if (a.termsAcceptedAt && !b.termsAcceptedAt) return 1;
      return (b.termsAcceptedAt ?? "").localeCompare(a.termsAcceptedAt ?? "");
    });
  }, [users, q, filter, currentVersion]);

  const tabs: { id: Filter; label: string }[] = [
    { id: "all", label: "All" }, { id: "accepted", label: "Accepted" }, { id: "pending", label: "Pending" }, { id: "outdated", label: "Outdated" },
  ];

  function exportCsv() {
    const header = ["email", "status", "accepted_at", "version"];
    const lines = rows.map((u) => [
      u.email,
      u.termsAcceptedAt ? "accepted" : "pending",
      u.termsAcceptedAt ?? "",
      u.termsVersion ?? "",
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "agreements.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          {tabs.map((t) => (
            <button key={t.id} type="button" onClick={() => setFilter(t.id)}
              style={{ padding: "6px 12px", borderRadius: "999px", fontSize: "12px", fontWeight: filter === t.id ? 600 : 500, cursor: "pointer", fontFamily: "var(--font-body)",
                color: filter === t.id ? "#fff" : "var(--text-tertiary)", background: filter === t.id ? "linear-gradient(135deg,#2563eb,#4f46e5)" : "transparent", border: `1px solid ${filter === t.id ? "transparent" : "var(--border-subtle)"}` }}>
              {t.label}
            </button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email"
          style={{ flex: "1 1 200px", padding: "8px 12px", borderRadius: "10px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", fontSize: "13px" }} />
        <button type="button" onClick={exportCsv}
          style={{ padding: "8px 12px", borderRadius: "10px", fontSize: "12px", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-secondary)" }}>
          Export CSV
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
        {rows.map((u) => {
          const accepted = !!u.termsAcceptedAt;
          const outdated = accepted && u.termsVersion && u.termsVersion !== currentVersion;
          return (
            <div key={u.id} style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", padding: "9px 12px", borderRadius: "10px", background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
              <span style={{ flex: "1 1 200px", minWidth: 0, fontSize: "13px", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</span>
              <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0,
                color: accepted ? "var(--green)" : "#f59e0b", background: accepted ? "rgba(0,211,149,0.1)" : "rgba(245,158,11,0.1)", border: `1px solid ${accepted ? "rgba(0,211,149,0.3)" : "rgba(245,158,11,0.3)"}`, borderRadius: "6px", padding: "2px 7px" }}>
                {accepted ? "Accepted" : "Pending"}
              </span>
              <span style={{ fontSize: "11.5px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", flexShrink: 0, minWidth: "90px", textAlign: "right" }}>{fmt(u.termsAcceptedAt)}</span>
              <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: outdated ? "#f59e0b" : "var(--text-tertiary)", flexShrink: 0, minWidth: "80px", textAlign: "right" }} title={outdated ? "Older than current version" : ""}>
                {u.termsVersion ?? "—"}{outdated ? " ⚠" : ""}
              </span>
            </div>
          );
        })}
        {rows.length === 0 && <p style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>No users match.</p>}
      </div>
    </div>
  );
}
