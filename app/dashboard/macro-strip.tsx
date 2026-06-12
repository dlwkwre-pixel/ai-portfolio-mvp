import { getFredMacroSignals } from "@/lib/market-data/fred";

function fmt(value: number | null, decimals = 2): string {
  if (value === null) return "—";
  return value.toFixed(decimals);
}

type PillProps = {
  label: string;
  value: string;
  suffix?: string;
  alert?: boolean;
  dim?: boolean;
};

function Pill({ label, value, suffix = "%", alert = false, dim = false }: PillProps) {
  const valueColor = alert
    ? "var(--red)"
    : dim
    ? "var(--text-secondary)"
    : "var(--text-primary)";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        padding: "8px 14px",
        background: "var(--card-bg)",
        border: `1px solid ${alert ? "var(--red-border)" : "var(--card-border)"}`,
        borderRadius: "var(--radius-lg)",
        minWidth: "0",
        flex: "1 1 0",
        minHeight: "44px",
        justifyContent: "center",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "10px",
          fontWeight: 500,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "14px",
          fontWeight: 500,
          color: valueColor,
          lineHeight: 1,
          display: "flex",
          alignItems: "baseline",
          gap: "1px",
        }}
      >
        {value === "—" ? (
          <span style={{ color: "var(--text-tertiary)" }}>—</span>
        ) : (
          <>
            {value}
            <span style={{ fontSize: "11px", opacity: 0.7 }}>{suffix}</span>
          </>
        )}
        {alert && value !== "—" && (
          <span
            style={{
              marginLeft: "4px",
              fontSize: "11px",
              color: "var(--red)",
              lineHeight: 1,
            }}
            aria-label="inverted"
          >
            ▼
          </span>
        )}
      </span>
    </div>
  );
}

export default async function MacroStrip() {
  const signals = await getFredMacroSignals();

  if (!signals.fredAvailable) return null;

  const spreadInverted =
    signals.yieldCurveSpread !== null && signals.yieldCurveSpread < 0;
  const cpiElevated =
    signals.cpi !== null && signals.cpi > 3.5;

  return (
    <div
      style={{
        marginBottom: "10px",
      }}
      aria-label="Macro indicators"
    >
      {/* Desktop: single row | Mobile: 2×2 grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "6px",
        }}
        className="macro-strip-grid"
      >
        <Pill
          label="Fed Rate"
          value={fmt(signals.fedFundsRate)}
        />
        <Pill
          label="Inflation (CPI)"
          value={fmt(signals.cpi)}
          alert={cpiElevated}
        />
        <Pill
          label="10-yr Treasury"
          value={fmt(signals.yield10y)}
        />
        <Pill
          label="Yield Curve"
          value={fmt(signals.yieldCurveSpread)}
          alert={spreadInverted}
        />
      </div>

      <style>{`
        @media (max-width: 480px) {
          .macro-strip-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
    </div>
  );
}
