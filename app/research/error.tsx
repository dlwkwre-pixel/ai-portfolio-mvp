"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ResearchError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error in the browser console for debugging
    console.error("[research] render error:", error, "digest:", error?.digest);
  }, [error]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        color: "var(--text-primary)",
        fontFamily: "var(--font-body)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div className="bt-glow" style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: "420px",
          textAlign: "center",
          background: "var(--surface-003)",
          border: "1px solid var(--line-008)",
          borderRadius: "var(--radius-lg)",
          padding: "32px 24px",
        }}
      >
        <div style={{ width: "44px", height: "44px", margin: "0 auto 16px", borderRadius: "12px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="22" height="22" viewBox="0 0 20 20" fill="var(--red)">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
        </div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}>
          Research hit a snag
        </h1>
        <p style={{ fontSize: "13px", color: "var(--text-tertiary)", lineHeight: 1.6, marginBottom: "20px" }}>
          We couldn&apos;t load this page. This is usually temporary. Try again, or head back to your dashboard.
        </p>
        {error?.digest && (
          <p style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginBottom: "18px" }}>
            Ref: {error.digest}
          </p>
        )}
        <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "9px 18px",
              borderRadius: "var(--radius-md)",
              background: "var(--brand-blue, #2563eb)",
              color: "#fff",
              border: "none",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            style={{
              padding: "9px 18px",
              borderRadius: "var(--radius-md)",
              background: "var(--surface-005)",
              color: "var(--text-secondary)",
              border: "1px solid var(--line-010)",
              fontSize: "13px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
