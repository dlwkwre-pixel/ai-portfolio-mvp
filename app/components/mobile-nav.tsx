"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/portfolios", label: "Portfolios" },
  { href: "/strategies", label: "Strategies" },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <div className="flex gap-2 overflow-x-auto border-b border-white/5 bg-white/2 px-4 py-3 lg:hidden">
      {navItems.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`shrink-0 rounded-xl border px-3 py-1.5 text-sm font-medium transition ${
              isActive
                ? "border-blue-500/30 bg-blue-500/15 text-blue-300"
                : "border-white/8 bg-white/4 text-slate-400"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
