"use client";

import { useState } from "react";
import Link from "next/link";

export default function TermsAcceptModal() {
  const [checked, setChecked] = useState(false);
  const [emailOptIn, setEmailOptIn] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    if (!checked || isPending) return;
    setError(null);
    setIsPending(true);
    try {
      const res = await fetch("/api/accept-terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailOptIn }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setIsPending(false);
    }
  }

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 9999,
      background: "rgba(2,7,18,0.92)",
      backdropFilter: "blur(8px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
    }}>
      <div style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--card-border)",
        borderRadius: "16px",
        maxWidth: "520px",
        width: "100%",
        padding: "32px",
        boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
      }}>
        {/* Logo + heading */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{
            fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em",
            textTransform: "uppercase", color: "var(--brand-blue)", marginBottom: "12px",
          }}>
            BuyTune
          </div>
          <h2 style={{
            fontFamily: "var(--font-display)",
            fontSize: "20px", fontWeight: 700,
            color: "var(--text-primary)", letterSpacing: "-0.4px",
            marginBottom: "6px",
          }}>
            Before you continue
          </h2>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Please review and accept our terms to use BuyTune.
          </p>
        </div>

        {/* Not financial advice callout */}
        <div style={{
          padding: "12px 14px",
          background: "rgba(239,68,68,0.07)",
          border: "1px solid rgba(239,68,68,0.18)",
          borderRadius: "8px",
          marginBottom: "20px",
        }}>
          <div style={{
            fontSize: "10px", fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.07em", color: "#f87171", marginBottom: "5px",
          }}>
            Not Financial or Investment Advice
          </div>
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            BuyTune is an informational tool, not a registered investment advisor. AI-generated analysis and recommendations are for educational purposes only. All investment decisions are made solely at your own risk.
          </p>
        </div>

        {/* Key points */}
        <div style={{
          display: "flex", flexDirection: "column", gap: "8px",
          marginBottom: "24px",
        }}>
          {[
            "AI recommendations do not constitute investment advice",
            "Market data may be delayed or inaccurate — do not trade in real time from this app",
            "Your portfolio data is transmitted to AI providers (xAI, Google) to generate analysis",
            "You must be 18 or older to use BuyTune",
          ].map((point, i) => (
            <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"
                style={{ color: "var(--brand-blue)", flexShrink: 0, marginTop: "2px" }}>
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5 }}>{point}</span>
            </div>
          ))}
        </div>

        {/* Checkbox */}
        <label style={{
          display: "flex", alignItems: "flex-start", gap: "10px",
          cursor: "pointer", marginBottom: "20px",
        }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
          />
          <div style={{
            width: "16px", height: "16px", flexShrink: 0,
            border: `2px solid ${checked ? "var(--brand-blue)" : "var(--border-strong)"}`,
            borderRadius: "4px",
            background: checked ? "var(--brand-blue)" : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            marginTop: "1px", transition: "all 0.15s",
          }}>
            {checked && (
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            I have read and agree to BuyTune&apos;s{" "}
            <Link href="/terms" target="_blank" style={{ color: "var(--brand-blue)" }}>
              Terms of Service
            </Link>
            {" "}and{" "}
            <Link href="/privacy" target="_blank" style={{ color: "var(--brand-blue)" }}>
              Privacy Policy
            </Link>
            . I understand that BuyTune does not provide investment advice.
          </span>
        </label>

        {/* Email opt-in */}
        <label style={{
          display: "flex", alignItems: "flex-start", gap: "10px",
          cursor: "pointer", marginBottom: "20px",
        }}>
          <input
            type="checkbox"
            checked={emailOptIn}
            onChange={(e) => setEmailOptIn(e.target.checked)}
            style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
          />
          <div style={{
            width: "16px", height: "16px", flexShrink: 0,
            border: `2px solid ${emailOptIn ? "var(--brand-blue)" : "var(--border-strong)"}`,
            borderRadius: "4px",
            background: emailOptIn ? "var(--brand-blue)" : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            marginTop: "1px", transition: "all 0.15s",
          }}>
            {emailOptIn && (
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Send me a weekly FINN digest — portfolio highlights and one financial insight. Unsubscribe anytime. (Optional)
          </span>
        </label>

        {error && (
          <div style={{ fontSize: "12px", color: "var(--red)", marginBottom: "12px" }}>
            {error}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handleAccept}
          disabled={!checked || isPending}
          style={{
            width: "100%",
            padding: "11px",
            borderRadius: "10px",
            border: "none",
            background: checked ? "var(--brand-blue)" : "var(--bg-surface)",
            color: checked ? "#fff" : "var(--text-muted)",
            fontSize: "14px",
            fontWeight: 600,
            cursor: checked && !isPending ? "pointer" : "not-allowed",
            fontFamily: "var(--font-body)",
            transition: "all 0.15s",
            opacity: isPending ? 0.7 : 1,
          }}
        >
          {isPending ? "Saving..." : "Accept & Continue to BuyTune"}
        </button>

        <p style={{ fontSize: "11px", color: "var(--text-muted)", textAlign: "center", marginTop: "12px" }}>
          You can review the full{" "}
          <Link href="/terms" target="_blank" style={{ color: "var(--text-secondary)" }}>Terms</Link>
          {" "}and{" "}
          <Link href="/privacy" target="_blank" style={{ color: "var(--text-secondary)" }}>Privacy Policy</Link>
          {" "}at any time from the app.
        </p>
      </div>
    </div>
  );
}
