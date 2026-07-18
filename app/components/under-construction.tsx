import Link from "next/link";

// Shown in place of a section's content when the admin has revoked it for the
// current account (page_blocks). Reads as routine maintenance, not a lockout.
export default function UnderConstruction({ section }: { section: string }) {
  return (
    <main style={{
      minHeight: "100vh", background: "var(--bg-base)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: "24px",
      fontFamily: "var(--font-body)",
    }}>
      <div style={{ textAlign: "center", maxWidth: "420px" }}>
        <div style={{ fontSize: "40px", marginBottom: "14px" }} aria-hidden>🚧</div>
        <h1 style={{
          fontFamily: "var(--font-display)", fontSize: "22px", fontWeight: 700,
          color: "var(--text-primary)", margin: "0 0 8px", letterSpacing: "-0.4px",
        }}>
          {section} is under construction
        </h1>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 20px" }}>
          This section isn&apos;t available right now. Check back later.
        </p>
        <Link href="/dashboard" className="bt-btn bt-btn-ghost bt-btn-sm">
          ← Back to dashboard
        </Link>
      </div>
    </main>
  );
}
