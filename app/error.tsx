"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/app/components/ui-primitives";
import { reportClientError } from "@/app/components/error-reporter";

// App-wide fallback when a page crashes. Server-side crashes (they carry a digest) are
// already recorded by instrumentation.ts; ones that happened in the browser are reported here.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (!error?.digest) reportClientError(error, "error-boundary");
  }, [error]);

  return (
    <main style={{ minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px", fontFamily: "var(--font-body)", color: "var(--text-primary)" }}>
      <div style={{ maxWidth: "420px", width: "100%", textAlign: "center", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "28px 20px" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)", fontWeight: 600, margin: "0 0 8px" }}>
          Something went wrong on this page
        </h1>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 18px" }}>
          It&apos;s been reported automatically. Trying again usually works; if it doesn&apos;t, your dashboard is a safe place to start over.
        </p>
        {error?.digest && (
          <p style={{ fontSize: "var(--text-2xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", margin: "0 0 16px" }}>
            Ref: {error.digest}
          </p>
        )}
        <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
          <Button variant="primary" onClick={reset} style={{ minHeight: "44px" }}>Try again</Button>
          <Link href="/dashboard" className="bt-btn bt-btn-ghost" style={{ minHeight: "44px", display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
