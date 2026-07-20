"use client";

import { useState, useTransition, useEffect } from "react";
import { upsertDigestPrefs, type DigestPrefs } from "./email-digest-actions";

const FREQUENCIES = [
  { value: "daily_close",   label: "Daily",          description: "Weekdays only" },
  { value: "weekly_friday", label: "Weekly Friday",   description: "Every Friday" },
  { value: "weekly_monday", label: "Weekly Monday",   description: "Every Monday" },
  { value: "monthly_first", label: "Monthly",         description: "1st of each month" },
] as const;


type ContentKey =
  | "include_performance" | "include_holdings" | "include_earnings" | "include_ai_score"
  | "include_top_movers" | "include_benchmark" | "include_ai_recs" | "include_week_ahead"
  | "include_news" | "include_transactions" | "include_cash";

type ContentGroup = { group: string; options: { key: ContentKey; label: string; description: string }[] };

const CONTENT_GROUPS: ContentGroup[] = [
  {
    group: "Your Portfolio",
    options: [
      { key: "include_performance", label: "Performance",   description: "All-time return and this week's change" },
      { key: "include_top_movers",  label: "Top Movers",     description: "This week's biggest gainer and biggest drag" },
      { key: "include_benchmark",   label: "vs. S&P 500",    description: "How you did against your benchmark this week" },
      { key: "include_holdings",    label: "Top Holdings",   description: "Your largest positions with allocation %" },
      { key: "include_cash",        label: "Cash Position",  description: "How much you're holding in cash, with context" },
    ],
  },
  {
    group: "Activity & Signals",
    options: [
      { key: "include_transactions", label: "Trades This Week", description: "A recap of the buys and sells you made" },
      { key: "include_ai_recs",      label: "AI Recommendations", description: "Pending buy/sell signals awaiting your call" },
      { key: "include_ai_score",     label: "AI Health Score",  description: "Portfolio health score from the last AI run" },
    ],
  },
  {
    group: "Market Context",
    options: [
      { key: "include_earnings",   label: "Upcoming Earnings", description: "Earnings reports for your holdings in the next 7 days" },
      { key: "include_week_ahead", label: "The Week Ahead",    description: "Market outlook: lean, volatility, and key events" },
      { key: "include_news",       label: "Top Headlines",     description: "Recent news for your largest holding" },
    ],
  },
];

export default function EmailDigestSettings({
  portfolioId,
  userEmail,
  initialPrefs,
  unsubscribed,
}: {
  portfolioId: string;
  userEmail: string;
  initialPrefs: DigestPrefs | null;
  unsubscribed?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showUnsubBanner, setShowUnsubBanner] = useState(unsubscribed ?? false);

  const [enabled, setEnabled] = useState(initialPrefs?.enabled ?? false);
  const [frequency, setFrequency] = useState<DigestPrefs["frequency"]>(
    initialPrefs?.frequency ?? "weekly_friday"
  );
  const [content, setContent] = useState<Record<ContentKey, boolean>>({
    include_performance:  initialPrefs?.include_performance  ?? true,
    include_holdings:     initialPrefs?.include_holdings     ?? true,
    include_earnings:     initialPrefs?.include_earnings     ?? true,
    include_ai_score:     initialPrefs?.include_ai_score     ?? false,
    include_top_movers:   initialPrefs?.include_top_movers   ?? true,
    include_benchmark:    initialPrefs?.include_benchmark    ?? false,
    include_ai_recs:      initialPrefs?.include_ai_recs      ?? false,
    include_week_ahead:   initialPrefs?.include_week_ahead   ?? false,
    include_news:         initialPrefs?.include_news         ?? false,
    include_transactions: initialPrefs?.include_transactions ?? false,
    include_cash:         initialPrefs?.include_cash         ?? false,
  });
  const [attachPdf, setAttachPdf] = useState(initialPrefs?.attach_pdf ?? true);
  const [emailOverride, setEmailOverride] = useState(initialPrefs?.email_override ?? "");
  const [sendHour] = useState(initialPrefs?.send_hour ?? 16);
  const [timezone] = useState(initialPrefs?.timezone ?? "America/Chicago");
  const [localCronTime, setLocalCronTime] = useState<string | null>(null);

  // Compute local time equivalent of 9pm UTC cron
  useEffect(() => {
    const d = new Date();
    d.setUTCHours(21, 0, 0, 0);
    setLocalCronTime(d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }));
  }, []);

  // Clear saved flash after 3s
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(t);
  }, [saved]);

  function handleSave() {
    setSaveError(null);
    startTransition(async () => {
      const result = await upsertDigestPrefs(portfolioId, {
        enabled,
        frequency,
        ...content,
        attach_pdf: attachPdf,
        email_override: emailOverride || null,
        send_hour: sendHour,
        timezone,
      });
      if (result.error) {
        setSaveError(result.error);
      } else {
        setSaved(true);
      }
    });
  }

  function toggleContent(key: keyof typeof content) {
    setContent((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ ok?: boolean; error?: string } | null>(null);

  async function handleSendTest() {
    setSendingTest(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/portfolios/test-digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolioId }),
      });
      const json = await res.json() as { ok?: boolean; error?: string; sentTo?: string };
      setTestResult(json.ok ? { ok: true } : { error: json.error ?? "Failed to send" });
      setTimeout(() => setTestResult(null), 5000);
    } catch {
      setTestResult({ error: "Network error" });
    } finally {
      setSendingTest(false);
    }
  }

  const lastSent = initialPrefs?.last_sent_at
    ? new Date(initialPrefs.last_sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <div style={{ maxWidth: "560px" }}>

      {/* Unsubscribed banner */}
      {showUnsubBanner && (
        <div
          style={{
            marginBottom: "20px",
            padding: "12px 16px",
            background: "rgba(74,222,128,0.08)",
            border: "1px solid rgba(74,222,128,0.2)",
            borderRadius: "10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <span style={{ fontSize: "13px", color: "#4ade80" }}>
            Unsubscribed from this portfolio&apos;s digest. You can re-enable it below.
          </span>
          <button
            onClick={() => setShowUnsubBanner(false)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", fontSize: "16px", padding: "0 4px" }}
          >
            ×
          </button>
        </div>
      )}

      {/* Enable toggle */}
      <div
        style={{
          padding: "20px 20px",
          background: "var(--bg-card)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "12px",
          marginBottom: "16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          cursor: "pointer",
        }}
        onClick={() => setEnabled((v) => !v)}
      >
        <div>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "3px" }}>
            Email Digest
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
            Receive portfolio updates by email
          </div>
        </div>
        {/* Toggle pill */}
        <div
          style={{
            width: "44px",
            height: "24px",
            borderRadius: "12px",
            background: enabled ? "#0ea5a0" : "var(--border-default)",
            position: "relative",
            flexShrink: 0,
            transition: "background 0.2s",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "3px",
              left: enabled ? "22px" : "3px",
              width: "18px",
              height: "18px",
              borderRadius: "50%",
              background: "#fff",
              transition: "left 0.2s",
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            }}
          />
        </div>
      </div>

      {enabled && (
        <>
          {/* Frequency */}
          <div
            style={{
              padding: "20px",
              background: "var(--bg-card)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "12px",
              marginBottom: "16px",
            }}
          >
            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-tertiary)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "14px" }}>
              Frequency
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {FREQUENCIES.map((f) => (
                <label
                  key={f.value}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px 14px",
                    borderRadius: "9px",
                    border: `1px solid ${frequency === f.value ? "#0ea5a0" : "var(--border-subtle)"}`,
                    background: frequency === f.value ? "rgba(14,165,160,0.08)" : "var(--bg-base)",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  <input
                    type="radio"
                    name="frequency"
                    value={f.value}
                    checked={frequency === f.value}
                    onChange={() => setFrequency(f.value)}
                    style={{ accentColor: "#0ea5a0", width: "15px", height: "15px", flexShrink: 0 }}
                  />
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{f.label}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "1px" }}>{f.description}</div>
                  </div>
                </label>
              ))}
            </div>
            {localCronTime && (
              <div style={{ marginTop: "12px", padding: "9px 12px", background: "rgba(14,165,160,0.06)", border: "1px solid rgba(14,165,160,0.14)", borderRadius: "7px", fontSize: "12px", color: "var(--text-secondary)" }}>
                Sends around <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{localCronTime}</span> your time
              </div>
            )}
          </div>

          {/* Content — grouped, "design your email" */}
          <div
            style={{
              padding: "20px",
              background: "var(--bg-card)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "12px",
              marginBottom: "16px",
            }}
          >
            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-tertiary)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "6px" }}>
              Email Content
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginBottom: "16px" }}>
              Pick the sections you want. Sections with no data that week are skipped automatically.
            </div>

            {CONTENT_GROUPS.map((grp) => (
              <div key={grp.group} style={{ marginBottom: "18px" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "8px" }}>
                  {grp.group}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {grp.options.map((opt) => (
                    <label
                      key={opt.key}
                      onClick={() => toggleContent(opt.key)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "11px 14px",
                        borderRadius: "9px",
                        border: `1px solid ${content[opt.key] ? "rgba(14,165,160,0.3)" : "var(--border-subtle)"}`,
                        background: content[opt.key] ? "rgba(14,165,160,0.06)" : "var(--bg-base)",
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      <div
                        style={{
                          width: "16px", height: "16px", borderRadius: "4px",
                          border: `1.5px solid ${content[opt.key] ? "#0ea5a0" : "var(--border-default)"}`,
                          background: content[opt.key] ? "#0ea5a0" : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0, transition: "all 0.15s",
                        }}
                      >
                        {content[opt.key] && (
                          <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                            <path d="M1.5 5l2.5 2.5 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{opt.label}</div>
                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "1px" }}>{opt.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}

            {/* Delivery: PDF attachment */}
            <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "8px" }}>
              Delivery
            </div>
            <label
              onClick={() => setAttachPdf((v) => !v)}
              style={{
                display: "flex", alignItems: "center", gap: "12px", padding: "11px 14px",
                borderRadius: "9px",
                border: `1px solid ${attachPdf ? "rgba(14,165,160,0.3)" : "var(--border-subtle)"}`,
                background: attachPdf ? "rgba(14,165,160,0.06)" : "var(--bg-base)",
                cursor: "pointer", transition: "all 0.15s",
              }}
            >
              <div
                style={{
                  width: "16px", height: "16px", borderRadius: "4px",
                  border: `1.5px solid ${attachPdf ? "#0ea5a0" : "var(--border-default)"}`,
                  background: attachPdf ? "#0ea5a0" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, transition: "all 0.15s",
                }}
              >
                {attachPdf && (
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5l2.5 2.5 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Attach PDF report</div>
                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "1px" }}>Include a printable investor-update PDF with each email</div>
              </div>
            </label>
          </div>

          {/* Email address */}
          <div
            style={{
              padding: "20px",
              background: "var(--bg-card)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "12px",
              marginBottom: "16px",
            }}
          >
            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-tertiary)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "14px" }}>
              Deliver To
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "10px" }}>
              Default: <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{userEmail}</span>
            </div>
            <input
              type="email"
              placeholder="Override email (optional)"
              value={emailOverride}
              onChange={(e) => setEmailOverride(e.target.value)}
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: "8px",
                border: "1px solid var(--border-subtle)",
                background: "var(--bg-base)",
                color: "var(--text-primary)",
                fontSize: "13px",
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "var(--font-body)",
              }}
            />
          </div>
        </>
      )}

      {/* Save + status */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <button
          onClick={handleSave}
          disabled={isPending}
          style={{
            padding: "9px 20px",
            borderRadius: "8px",
            border: "none",
            background: isPending ? "rgba(14,165,160,0.5)" : "#0ea5a0",
            color: "#fff",
            fontSize: "13px",
            fontWeight: 600,
            cursor: isPending ? "not-allowed" : "pointer",
            fontFamily: "var(--font-body)",
            transition: "background 0.15s",
          }}
        >
          {isPending ? "Saving…" : "Save preferences"}
        </button>

        <button
          onClick={handleSendTest}
          disabled={sendingTest}
          style={{
            padding: "9px 16px",
            borderRadius: "8px",
            border: "1px solid var(--border-subtle)",
            background: "var(--bg-card)",
            color: "var(--text-secondary)",
            fontSize: "13px",
            fontWeight: 500,
            cursor: sendingTest ? "not-allowed" : "pointer",
            fontFamily: "var(--font-body)",
            transition: "all 0.15s",
            opacity: sendingTest ? 0.6 : 1,
          }}
        >
          {sendingTest ? "Sending…" : "Send test email"}
        </button>

        {saved && <span style={{ fontSize: "12px", color: "#4ade80" }}>Saved</span>}
        {saveError && <span style={{ fontSize: "12px", color: "var(--red)" }}>{saveError}</span>}
        {testResult?.ok && <span style={{ fontSize: "12px", color: "#4ade80" }}>Test email sent!</span>}
        {testResult?.error && <span style={{ fontSize: "12px", color: "var(--red)" }}>{testResult.error}</span>}
      </div>

      {/* Last sent info */}
      {lastSent && (
        <div style={{ marginTop: "16px", fontSize: "11px", color: "var(--text-tertiary)" }}>
          Last digest sent: {lastSent}
        </div>
      )}

    </div>
  );
}
