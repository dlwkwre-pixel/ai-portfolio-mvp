"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type SidebarProps = {
  userEmail?: string | null;
};

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/portfolios", label: "Portfolios" },
  { href: "/strategies", label: "Strategies" },
];

export default function Sidebar({ userEmail }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-white/5 bg-white/2 lg:flex">
      <div className="px-5 pb-4 pt-6">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-blue-400" stroke="currentColor" strokeWidth="2">
              <path d="M4 16c2.5-3 4.5-4 7-4 2 0 3.5 1 5 3 1.5-4 3-7 4-8" />
              <circle cx="5" cy="16" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="11" cy="12" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="16" cy="15" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="20" cy="7" r="1.2" fill="currentColor" stroke="none" />
            </svg>
          </div>
          <span className="text-base font-semibold tracking-tight text-white">BuyTune.io</span>
        </Link>
      </div>

      <nav className="flex-1 px-3 pt-2">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-600">Navigation</p>
        <div className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? "border border-blue-500/25 bg-blue-500/15 text-blue-300"
                    : "text-slate-400 hover:bg-white/6 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-white/5 px-3 pb-6 pt-4 space-y-2">
        {userEmail && (
          <p className="truncate px-1 text-xs text-slate-600">{userEmail}</p>
        )}
        <button
          type="button"
          onClick={handleSignOut}
          disabled={loading}
          className="w-full rounded-xl border border-white/8 bg-white/4 px-4 py-2.5 text-left text-sm text-slate-400 transition hover:bg-white/8 hover:text-white disabled:opacity-60"
        >
          {loading ? "Signing out..." : "Sign Out"}
        </button>
      </div>
    </aside>
  );
}
