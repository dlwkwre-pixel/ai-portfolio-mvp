"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

type Tab = {
  id: string;
  label: string;
  icon: React.ReactNode;
};

const tabs: Tab[] = [
  {
    id: "overview",
    label: "Overview",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path d="M10.75 10.818v2.614A3.13 3.13 0 0011.888 13c.482-.315.612-.648.612-.875 0-.227-.13-.560-.612-.875a3.13 3.13 0 00-1.138-.432zM8.33 8.62c.053.055.115.11.184.164.208.16.46.284.736.363V6.603a2.45 2.45 0 00-.88.38c-.287.187-.383.401-.383.602 0 .2.096.414.383.601z" />
        <path fillRule="evenodd" d="M9.99 2a8 8 0 100 16 8 8 0 000-16zm.25 3.25a.75.75 0 00-1.5 0v.54a3.64 3.64 0 00-1.651.734C6.499 6.916 6 7.67 6 8.5c0 .83.499 1.584 1.089 2.005a4.28 4.28 0 001.661.755v2.516a1.867 1.867 0 01-.73-.28c-.287-.187-.52-.47-.52-.746a.75.75 0 00-1.5 0c0 .786.496 1.483 1.089 1.904a3.64 3.64 0 001.661.718v.578a.75.75 0 001.5 0v-.575a3.89 3.89 0 001.652-.756C12.499 14.584 13 13.83 13 13c0-.83-.499-1.584-1.098-2.005a4.44 4.44 0 00-1.652-.737V7.742c.26.066.503.181.73.28.287.187.52.47.52.728a.75.75 0 001.5 0c0-.786-.496-1.482-1.089-1.904A3.64 3.64 0 0010.24 6.29V5.25z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "ai",
    label: "AI Analysis",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192zM6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.897l-2.051-.684a1 1 0 01-.633-.633L6.95 5.684z" />
      </svg>
    ),
  },
  {
    id: "transactions",
    label: "Transactions",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.798 7.45c.512-.67 1.135-.95 1.702-.95s1.19.28 1.702.95a.75.75 0 001.192-.91C12.637 5.55 11.596 5 10.5 5s-2.137.55-2.894 1.54A5.205 5.205 0 006.83 8H5.75a.75.75 0 000 1.5h.77a6.333 6.333 0 000 1h-.77a.75.75 0 000 1.5h1.08c.183.528.442 1.023.776 1.46.757.99 1.798 1.54 2.894 1.54s2.137-.55 2.894-1.54a.75.75 0 00-1.192-.91c-.512.67-1.135.95-1.702.95s-1.19-.28-1.702-.95a3.505 3.505 0 01-.343-.55h1.795a.75.75 0 000-1.5H8.026a4.835 4.835 0 010-1h2.224a.75.75 0 000-1.5H8.455c.098-.195.212-.38.343-.55z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "notes",
    label: "Notes & Info",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
      </svg>
    ),
  },
];

type PortfolioTabsProps = {
  activeTab: string;
  portfolioId: string;
};

export default function PortfolioTabs({ activeTab, portfolioId }: PortfolioTabsProps) {
  const router = useRouter();
  const pathname = usePathname();

  function handleTabChange(tabId: string) {
    const params = new URLSearchParams();
    if (tabId !== "overview") params.set("tab", tabId);
    const query = params.toString();
    router.push(`${pathname}${query ? `?${query}` : ""}`);
  }

  return (
    <div className="flex gap-1 overflow-x-auto rounded-2xl border border-white/7 bg-white/2 p-1">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabChange(tab.id)}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
              isActive
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                : "text-slate-400 hover:bg-white/6 hover:text-white"
            }`}
          >
            <span className={isActive ? "text-white" : "text-slate-500"}>
              {tab.icon}
            </span>
            {tab.label}
            {tab.id === "ai" && (
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                isActive ? "bg-white/20 text-white" : "bg-blue-500/20 text-blue-400"
              }`}>
                AI
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
