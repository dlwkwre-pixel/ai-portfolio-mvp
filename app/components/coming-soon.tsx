"use client";

type ComingSoonProps = {
  title: string;
  subtitle: string;
  description: string;
  eta?: string;
  features?: string[];
  icon?: string;
};

export default function ComingSoon({
  title,
  subtitle,
  description,
  eta,
  features = [],
  icon = "🚧",
}: ComingSoonProps) {
  return (
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "48px 24px",
      textAlign: "center",
      maxWidth: "520px",
      margin: "0 auto",
    }}>
      {/* Icon */}
      <div style={{
        width: "72px", height: "72px",
        background: "linear-gradient(135deg, rgba(37,99,235,0.12), rgba(124,58,237,0.08))",
        border: "1px solid rgba(37,99,235,0.2)",
        borderRadius: "20px",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "32px",
        marginBottom: "24px",
        boxShadow: "0 0 32px rgba(37,99,235,0.12)",
      }}>
        {icon}
      </div>

      {/* Badge */}
      <span style={{
        display: "inline-flex", alignItems: "center", gap: "5px",
        padding: "3px 10px", borderRadius: "20px",
        background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.25)",
        fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em",
        textTransform: "uppercase", color: "var(--brand-blue)",
        marginBottom: "14px",
      }}>
        <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "var(--brand-blue)", display: "inline-block", animation: "pulse 2s infinite" }} />
        Coming Soon
      </span>

      {/* Heading */}
      <h1 style={{
        fontFamily: "var(--font-display)",
        fontSize: "26px", fontWeight: 700,
        color: "var(--text-primary)",
        letterSpacing: "-0.4px",
        marginBottom: "6px",
      }}>
        {title}
      </h1>

      <p style={{
        fontSize: "13px", color: "var(--text-tertiary)",
        marginBottom: "16px", fontWeight: 500,
      }}>
        {subtitle}
      </p>

      <p style={{
        fontSize: "13px", color: "var(--text-secondary)",
        lineHeight: 1.6, marginBottom: features.length > 0 ? "28px" : "0",
      }}>
        {description}
      </p>

      {/* Feature list */}
      {features.length > 0 && (
        <div style={{
          width: "100%",
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: "13px",
          padding: "16px 18px",
          marginBottom: eta ? "20px" : "0",
          textAlign: "left",
        }}>
          <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "12px" }}>
            What&apos;s planned
          </div>
          {features.map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "9px", marginBottom: i < features.length - 1 ? "9px" : "0" }}>
              <span style={{
                flexShrink: 0, marginTop: "2px",
                width: "14px", height: "14px",
                background: "rgba(37,99,235,0.12)",
                border: "1px solid rgba(37,99,235,0.25)",
                borderRadius: "4px",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="var(--brand-blue)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5 }}>{f}</span>
            </div>
          ))}
        </div>
      )}

      {/* ETA */}
      {eta && (
        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
          Expected: <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{eta}</span>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
