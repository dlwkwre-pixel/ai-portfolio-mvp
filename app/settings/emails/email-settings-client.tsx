"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toggleDigestEnabled } from "@/app/portfolios/[id]/email-digest-actions";

const FREQUENCY_LABELS: Record<string, string> = {
  daily_close:   "Daily (weekdays)",
  weekly_monday: "Weekly Monday",
  weekly_friday: "Weekly Friday",
  monthly_first: "Monthly",
};

const TIMEZONE_SHORT: Record<string, string> = {
  "America/New_York":    "ET",
  "America/Chicago":     "CT",
  "America/Denver":      "MT",
  "America/Los_Angeles": "PT",
  "America/Anchorage":   "AKT",
  "Pacific/Honolulu":    "HT",
  "Europe/London":       "GMT",
  "Europe/Paris":        "CET",
  "Europe/Berlin":       "CET",
  "Asia/Tokyo":          "JST",
  "Asia/Shanghai":       "CST",
  "Asia/Kolkata":        "IST",
  "Australia/Sydney":    "AEST",
  "UTC":                 "UTC",
};

function fmtHour(h: number): string {
  if (h === 0)  return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

type PortfolioRow = {
  id: string;
  name: string;
  digestEnabled: boolean;
  frequency: string | null;
  sendHour: number | null;
  timezone: string | null;
};

export default function EmailSettingsClient({ portfolios }: { portfolios: PortfolioRow[] }) {
  const [rows, setRows] = useState(portfolios);
  const [pending, startTransition] = useTransition();
  const [toggling, setToggling] = useState<string | null>(null);

  function toggle(id: string, newEnabled: boolean) {
    setToggling(id);
    startTransition(async () => {
      const result = await toggleDigestEnabled(id, newEnabled);
      if (!result.error) {
        setRows((prev) => prev.map((r) => r.id === id ? { ...r, digestEnabled: newEnabled } : r));
      }
      setToggling(null);
    });
  }

  if (rows.length === 0) {
    return (
      <div style={{ maxWidth: "560px", margin: "0 auto" }}>
        <div style={{
          padding: "32px 24px",
          background: "var(--bg-card)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "12px",
          textAlign: "center",
        }}>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "12px" }}>
            No portfolios yet. Create one to set up email digests.
          </p>
          <Link href="/portfolios/new" style={{ fontSize: "13px", color: "#0ea5a0" }}>
            Create a portfolio →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "560px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "10px" }}>
      <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "6px" }}>
        Enable email digests per portfolio. Configure content, frequency, and delivery time on each portfolio&apos;s Emails tab.
      </p>
      {rows.map((p) => {
        const tz = p.timezone ? (TIMEZONE_SHORT[p.timezone] ?? p.timezone) : "CT";
        const timeStr = p.sendHour != null ? `${fmtHour(p.sendHour)} ${tz}` : "4 PM CT";
        const freqStr = p.frequency ? (FREQUENCY_LABELS[p.frequency] ?? p.frequency) : "Weekly Friday";
        const isToggling = toggling === p.id && pending;

        return (
          <div
            key={p.id}
            style={{
              padding: "16px 18px",
              background: "var(--bg-card)",
              border: `1px solid ${p.digestEnabled ? "rgba(14,165,160,0.25)" : "var(--border-subtle)"}`,
              borderRadius: "12px",
              display: "flex",
              alignItems: "center",
              gap: "14px",
              transition: "border-color 0.2s",
            }}
          >
            {/* Toggle */}
            <button
              onClick={() => toggle(p.id, !p.digestEnabled)}
              disabled={isToggling}
              style={{
                width: "40px",
                height: "22px",
                borderRadius: "11px",
                background: p.digestEnabled ? "#0ea5a0" : "var(--border-default)",
                border: "none",
                cursor: isToggling ? "not-allowed" : "pointer",
                position: "relative",
                flexShrink: 0,
                transition: "background 0.2s",
                opacity: isToggling ? 0.6 : 1,
              }}
            >
              <div style={{
                position: "absolute",
                top: "3px",
                left: p.digestEnabled ? "20px" : "3px",
                width: "16px",
                height: "16px",
                borderRadius: "50%",
                background: "#fff",
                transition: "left 0.2s",
                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
              }} />
            </button>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.name}
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                {p.digestEnabled
                  ? `${freqStr} · ${timeStr}`
                  : "Digest off"}
              </div>
            </div>

            {/* Configure link */}
            <Link
              href={`/portfolios/${p.id}?tab=emails`}
              style={{
                fontSize: "12px",
                color: "var(--text-tertiary)",
                textDecoration: "none",
                flexShrink: 0,
                padding: "4px 8px",
                borderRadius: "6px",
                border: "1px solid var(--border-subtle)",
                transition: "all 0.15s",
              }}
            >
              Configure →
            </Link>
          </div>
        );
      })}
    </div>
  );
}
