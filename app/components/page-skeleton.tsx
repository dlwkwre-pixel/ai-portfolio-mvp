// Instant route-transition skeleton. App Router streams this immediately on navigation
// while the server component fetches data, so clicks feel instant instead of "click → wait".
export default function PageSkeleton({ title }: { title?: string }) {
  const bar = (w: string, h = "14px") => (
    <div className="bt-sk" style={{ width: w, height: h, borderRadius: "6px" }} />
  );
  const card = (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg, 14px)", padding: "18px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
      {bar("38%", "11px")}
      {bar("70%", "22px")}
      <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
        {bar("22%")}{bar("22%")}{bar("22%")}
      </div>
    </div>
  );
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-base)" }}>
      <style>{`
        @keyframes bt-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .bt-sk { background: linear-gradient(90deg, var(--surface-006, rgba(255,255,255,0.04)) 25%, var(--surface-010, rgba(255,255,255,0.08)) 37%, var(--surface-006, rgba(255,255,255,0.04)) 63%); background-size: 200% 100%; animation: bt-shimmer 1.4s ease-in-out infinite; }
      `}</style>
      {/* Sidebar rail placeholder (desktop) */}
      <div className="hidden lg:flex" style={{ width: "240px", flexShrink: 0, borderRight: "1px solid var(--border-subtle)", background: "var(--bg-surface)", padding: "20px 16px", flexDirection: "column", gap: "10px" }}>
        <div className="bt-sk" style={{ width: "60%", height: "20px", borderRadius: "6px", marginBottom: "12px" }} />
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="bt-sk" style={{ width: `${85 - i * 6}%`, height: "13px", borderRadius: "6px" }} />)}
      </div>
      {/* Main content */}
      <div style={{ flex: 1, padding: "28px 24px", display: "flex", flexDirection: "column", gap: "16px", maxWidth: "1100px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "6px" }}>
          {bar("180px", "24px")}
          {bar("280px", "12px")}
        </div>
        {card}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>{card}{card}</div>
        {card}
        {title && <span style={{ position: "fixed", bottom: 0, left: 0, opacity: 0 }}>{title}</span>}
      </div>
    </div>
  );
}
