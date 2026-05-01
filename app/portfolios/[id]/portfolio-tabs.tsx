"use client";

import { useRouter, usePathname } from "next/navigation";

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
      <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
        <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
      </svg>
    ),
  },
  {
    id: "ai",
    label: "AI Analysis",
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
        <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192z" />
        <path d="M6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.897l-2.051-.684a1 1 0 01-.633-.633L6.95 5.684z" />
      </svg>
    ),
  },
  {
    id: "transactions",
    label: "Transactions",
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.798 7.45c.512-.67 1.135-.95 1.702-.95s1.19.28 1.702.95a.75.75 0 001.192-.91C12.637 5.55 11.596 5 10.5 5s-2.137.55-2.894 1.54A5.205 5.205 0 006.83 8H5.75a.75.75 0 000 1.5h.77a6.333 6.333 0 000 1h-.77a.75.75 0 000 1.5h1.08c.183.528.442 1.023.776 1.46.757.99 1.798 1.54 2.894 1.54s2.137-.55 2.894-1.54a.75.75 0 00-1.192-.91c-.512.67-1.135.95-1.702.95s-1.19-.28-1.702-.95a3.505 3.505 0 01-.343-.55h1.795a.75.75 0 000-1.5H8.026a4.835 4.835 0 010-1h2.224a.75.75 0 000-1.5H8.455c.098-.195.212-.38.343-.55z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "notes",
    label: "Notes",
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
      </svg>
    ),
  },
];

export default function PortfolioTabs({
  activeTab,
  portfolioId,
}: {
  activeTab: string;
  portfolioId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function handleTabChange(tabId: string) {
    const params = new URLSearchParams();
    if (tabId !== "overview") params.set("tab", tabId);
    const query = params.toString();
    router.push(`${pathname}${query ? `?${query}` : ""}`);
  }

  return (
    <div className="bt-tabs-scroll" style={{ display: "flex", gap: "0", overflowX: "auto", scrollbarWidth: "none" }}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabChange(tab.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "10px 16px",
              fontSize: "12px",
              fontWeight: isActive ? 500 : 400,
              color: isActive ? "var(--text-primary)" : "var(--text-tertiary)",
              background: "none",
              border: "none",
              borderBottom: `2px solid ${isActive ? "var(--brand-blue)" : "transparent"}`,
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              transition: "var(--transition-base)",
              marginBottom: "-1px",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ opacity: isActive ? 1 : 0.5 }}>{tab.icon}</span>
            {tab.label}
            {tab.id === "ai" && (
              <span className="bt-badge bt-badge-ai" style={{ fontSize: "8px", padding: "1px 5px" }}>
                AI
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
