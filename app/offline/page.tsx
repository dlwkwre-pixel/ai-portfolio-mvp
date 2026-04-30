export default function OfflinePage() {
  return (
    <main style={{
      minHeight: "100vh", background: "#07090f",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'DM Sans', sans-serif", color: "#e2e8f0",
      padding: "24px", textAlign: "center",
    }}>
      <div style={{ width: "56px", height: "56px", background: "linear-gradient(135deg,#2563eb,#7c3aed)", borderRadius: "14px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "24px" }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
          <path d="M4 16c2.5-3 4.5-4 7-4 2 0 3.5 1 5 3 1.5-4 3-7 4-8"/>
        </svg>
      </div>
      <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: "24px", fontWeight: 700, marginBottom: "8px" }}>
        You're offline
      </h1>
      <p style={{ fontSize: "15px", color: "#64748b", maxWidth: "320px", lineHeight: 1.6, marginBottom: "24px" }}>
        BuyTune needs an internet connection to fetch live market data and run AI analysis.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{ padding: "12px 24px", background: "linear-gradient(135deg,#2563eb,#7c3aed)", border: "none", borderRadius: "10px", color: "#fff", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}
      >
        Try again
      </button>
    </main>
  );
}
