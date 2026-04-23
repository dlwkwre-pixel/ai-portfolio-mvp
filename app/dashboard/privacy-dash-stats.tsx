"use client";

import { PrivacyProvider, PrivacyToggle, usePrivacy } from "@/app/components/privacy-mode";

type DashStat = {
  label: string;
  value: string;
  subLabel?: string;
  isMoney?: boolean;
  icon?: React.ReactNode;
};

function DashStatInner({ stat }: { stat: DashStat }) {
  const { isPrivate } = usePrivacy();
  const displayValue = isPrivate && stat.isMoney ? "$••••••" : stat.value;

  return (
    <div className="rounded-2xl p-5" style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)" }}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-widest text-slate-500">{stat.label}</p>
        {stat.icon && (
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5">
            {stat.icon}
          </div>
        )}
      </div>
      <p className="mt-2 text-2xl font-semibold text-white">{displayValue}</p>
      {stat.subLabel && <p className="mt-1 text-xs text-slate-600">{stat.subLabel}</p>}
    </div>
  );
}

export function PrivacyDashStats({ stats }: { stats: DashStat[] }) {
  return (
    <PrivacyProvider>
      <div className="space-y-3">
        <div className="flex justify-end">
          <PrivacyToggle />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <DashStatInner key={stat.label} stat={stat} />
          ))}
        </div>
      </div>
    </PrivacyProvider>
  );
}
