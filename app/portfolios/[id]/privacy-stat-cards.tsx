"use client";

import { PrivacyProvider, PrivacyToggle, usePrivacy } from "./privacy-mode";

type StatCard = {
  label: string;
  value: string;
  highlight?: boolean;
  isMoney?: boolean;
};

type PrivacyStatCardsProps = {
  stats: StatCard[];
};

function StatCardInner({ stat }: { stat: StatCard }) {
  const { isPrivate } = usePrivacy();

  const displayValue = isPrivate && stat.isMoney ? "$••••••" : stat.value;

  return (
    <div className={`rounded-2xl p-5 ${stat.highlight ? "border border-blue-500/20 bg-blue-500/8" : ""}`}
      style={!stat.highlight ? { border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)" } : {}}>
      <p className="text-xs font-medium uppercase tracking-widest text-slate-500">{stat.label}</p>
      <p className={`mt-2 text-2xl font-semibold tracking-tight ${stat.highlight ? "text-blue-300" : "text-white"}`}>
        {displayValue}
      </p>
    </div>
  );
}

export function PrivacyStatCards({ stats }: PrivacyStatCardsProps) {
  return (
    <PrivacyProvider>
      <div className="space-y-4">
        {/* Privacy toggle */}
        <div className="flex justify-end">
          <PrivacyToggle />
        </div>

        {/* Stat cards */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <StatCardInner key={stat.label} stat={stat} />
          ))}
        </div>
      </div>
    </PrivacyProvider>
  );
}
