"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type Sched = { id: string; label: string; amount: number; nextDue: string; cadenceText: string };
type Data = { available: boolean; count: number; monthlyPace: number; next: Sched | null; schedules: Sched[] };

const fmt = (n: number) => "$" + Math.round(n).toLocaleString();
function dueText(iso: string) {
  const d = new Date(iso + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (days <= 0) return { text: "due today", soon: true };
  if (days === 1) return { text: "due tomorrow", soon: true };
  if (days <= 7) return { text: `in ${days} days`, soon: true };
  return { text: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), soon: false };
}

export default function DcaCard() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/contributions/next")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Data) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading || !data || !data.available) return null;

  const iconWrap = {
    width: "34px", height: "34px", borderRadius: "10px", flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)",
  } as const;
  const Icon = (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M5 9l7-7 7 7" /><circle cx="12" cy="18" r="3" /></svg>
  );

  // Empty state — gentle CTA to set up a plan.
  if (data.count === 0 || !data.next) {
    return (
      <Link href="/planning/contributions" style={{
        display: "flex", alignItems: "center", gap: "12px", marginTop: "16px",
        padding: "13px 16px", borderRadius: "var(--radius-lg)", textDecoration: "none",
        background: "var(--card-bg)", border: "1px dashed var(--card-border)",
      }}>
        <div style={iconWrap}>{Icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Set up auto-invest</div>
          <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Schedule recurring contributions and we&apos;ll remind you to invest, every time.</div>
        </div>
        <span style={{ fontSize: "13px", color: "var(--accent, var(--green))", fontWeight: 600, flexShrink: 0 }}>→</span>
      </Link>
    );
  }

  const due = dueText(data.next.nextDue);
  return (
    <Link href="/planning/contributions" style={{
      display: "flex", alignItems: "center", gap: "12px", marginTop: "16px",
      padding: "13px 16px", borderRadius: "var(--radius-lg)", textDecoration: "none",
      background: due.soon ? "linear-gradient(135deg, rgba(16,185,129,0.1), rgba(14,165,160,0.06))" : "var(--card-bg)",
      border: `1px solid ${due.soon ? "rgba(16,185,129,0.25)" : "var(--card-border)"}`,
    }}>
      <div style={iconWrap}>{Icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>Next contribution</span>
          <span style={{ fontSize: "11px", fontWeight: 700, color: due.soon ? "#34d399" : "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{due.text}</span>
        </div>
        <div style={{ fontSize: "11.5px", color: "var(--text-tertiary)" }}>
          <strong style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{fmt(data.next.amount)}</strong> to {data.next.label}
          {data.count > 1 ? ` · +${data.count - 1} more` : ""} · {fmt(data.monthlyPace)}/mo pace
        </div>
      </div>
      <span style={{ fontSize: "13px", color: "var(--accent, var(--green))", fontWeight: 600, flexShrink: 0 }}>→</span>
    </Link>
  );
}
