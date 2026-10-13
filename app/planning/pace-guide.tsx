"use client";

import { MONTH_NAMES } from "./planning-shared";

// Pace check for the month in progress. "88% of budget used on the 13th" is misleading when
// most of it is rent, so spending is split in two:
// - fixed bills (rent, utilities, insurance, scheduled bills): expected up front, judged
//   paid vs planned — never projected forward;
// - flexible spending (food, gas, shopping, fun): judged against how much of the month
//   has passed, with a daily allowance and the categories running hot.

export type PaceCategory = { label: string; actual: number; budget: number; expected: number; projected: number };

export type PaceData = {
  day: number;
  daysInMonth: number;
  month: number;
  fixedBudget: number;
  fixedActual: number;
  flexBudget: number;
  flexActual: number;
  flexProjected: number;
  perDayLeft: number;
  daysLeft: number;
  slowDown: PaceCategory[];
};

export default function PaceGuide({ data, isPrivate }: { data: PaceData; isPrivate: boolean }) {
  const money = (n: number) => (isPrivate ? "••••" : `$${Math.round(Math.abs(n)).toLocaleString()}`);
  const pctMonth = Math.round((data.day / data.daysInMonth) * 100);
  const flexExpected = data.flexBudget * (data.day / data.daysInMonth);
  const flexAhead = data.flexActual > flexExpected * 1.05;
  const fixedDone = data.fixedBudget > 0 && data.fixedActual >= data.fixedBudget * 0.95;
  const flexFill = data.flexBudget > 0 ? Math.min(100, (data.flexActual / data.flexBudget) * 100) : 0;
  const fixedFill = data.fixedBudget > 0 ? Math.min(100, (data.fixedActual / data.fixedBudget) * 100) : 0;
  const monthName = MONTH_NAMES[data.month - 1];

  const bar = (fill: number, color: string, marker?: number) => (
    <div style={{ position: "relative", height: "7px", borderRadius: "var(--radius-full)", background: "var(--surface-006)", overflow: "visible", marginTop: "6px" }}>
      <div style={{ height: "100%", width: `${fill}%`, borderRadius: "var(--radius-full)", background: color }} />
      {marker !== undefined && (
        <div title="Where you'd be if spending were even across the month"
          style={{ position: "absolute", top: "-3px", bottom: "-3px", left: `${Math.min(100, marker)}%`, width: "2px", background: "var(--text-primary)", opacity: 0.55, borderRadius: "1px" }} />
      )}
    </div>
  );

  return (
    <div className="cfo-zone" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "14px 18px", marginBottom: "10px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>Pace check</span>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
          {`Day ${data.day} of ${data.daysInMonth} · ${pctMonth}% of ${monthName} gone`}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "14px" }}>
        {data.fixedBudget > 0 && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", color: "var(--text-secondary)" }}>
              <span>Fixed bills</span>
              <span><span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{money(data.fixedActual)}</span>{` of ${money(data.fixedBudget)}`}</span>
            </div>
            {bar(fixedFill, "var(--brand-blue)")}
            <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginTop: "5px" }}>
              {fixedDone ? "Paid for the month. Planned, nothing to watch." : `${money(data.fixedBudget - data.fixedActual)} still to come this month.`}
            </div>
          </div>
        )}
        {data.flexBudget > 0 && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", color: "var(--text-secondary)" }}>
              <span>Flexible spending</span>
              <span><span style={{ fontFamily: "var(--font-mono)", color: flexAhead ? "var(--amber)" : "var(--text-primary)" }}>{money(data.flexActual)}</span>{` of ${money(data.flexBudget)}`}</span>
            </div>
            {bar(flexFill, flexAhead ? "var(--amber)" : "var(--green)", pctMonth)}
            <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginTop: "5px" }}>
              {`At this pace about ${money(data.flexProjected)} by ${monthName} ${data.daysInMonth}`}
              {data.flexProjected > data.flexBudget ? `, ${money(data.flexProjected - data.flexBudget)} over plan.` : ", within plan."}
            </div>
          </div>
        )}
      </div>

      {data.flexBudget > 0 && (
        <div style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
          {data.perDayLeft > 0
            ? <>{flexAhead ? "To stay on plan, keep flexible spending to about " : "On pace. You have about "}<strong style={{ fontFamily: "var(--font-mono)" }}>{money(data.perDayLeft)}/day</strong>{` for the next ${data.daysLeft} day${data.daysLeft !== 1 ? "s" : ""}.`}</>
            : <>{`Flexible spending is already past this month's plan by ${money(-data.perDayLeft * data.daysLeft)}. Anything more comes out of what you'd save.`}</>}
        </div>
      )}

      {data.slowDown.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ fontSize: "var(--text-2xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--amber)", fontFamily: "var(--font-body)" }}>Slow down on</span>
          {data.slowDown.map((c) => (
            <div key={c.label} style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "var(--text-xs)", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
              <span style={{ color: "var(--text-primary)" }}>{c.label}</span>
              <span>
                {c.budget <= 0
                  ? `${money(c.actual)} spent, nothing planned`
                  : c.actual >= c.budget
                    ? `${money(c.actual)} of ${money(c.budget)}, already over`
                    : `${money(c.actual)} of ${money(c.budget)}, on pace for ${money(c.projected)}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
