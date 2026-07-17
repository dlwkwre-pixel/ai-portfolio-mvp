"use client";

import { useRouter, usePathname } from "next/navigation";

type Tab = {
  id: string;
  label: string;
  icon: React.ReactNode;
  mobileHidden?: boolean;
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
    id: "analytics",
    label: "Analytics",
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11 4a1 1 0 10-2 0v4a1 1 0 102 0V7zm-3 1a1 1 0 10-2 0v3a1 1 0 102 0V8zM8 9a1 1 0 00-2 0v2a1 1 0 102 0V9z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "income",
    label: "Income",
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 7.234 6 8.009 6 9c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V17a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 15.766 14 14.991 14 14c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 11.092V9.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V6z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "transactions",
    label: "Transactions",
    mobileHidden: true,
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.798 7.45c.512-.67 1.135-.95 1.702-.95s1.19.28 1.702.95a.75.75 0 001.192-.91C12.637 5.55 11.596 5 10.5 5s-2.137.55-2.894 1.54A5.205 5.205 0 006.83 8H5.75a.75.75 0 000 1.5h.77a6.333 6.333 0 000 1h-.77a.75.75 0 000 1.5h1.08c.183.528.442 1.023.776 1.46.757.99 1.798 1.54 2.894 1.54s2.137-.55 2.894-1.54a.75.75 0 00-1.192-.91c-.512.67-1.135.95-1.702.95s-1.19-.28-1.702-.95a3.505 3.505 0 01-.343-.55h1.795a.75.75 0 000-1.5H8.026a4.835 4.835 0 010-1h2.224a.75.75 0 000-1.5H8.455c.098-.195.212-.38.343-.55z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "journal",
    label: "Journal",
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5 2a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V4a2 2 0 00-2-2H5zm2.5 3a.75.75 0 000 1.5h5a.75.75 0 000-1.5h-5zM7 9.75A.75.75 0 017.75 9h5a.75.75 0 010 1.5h-5A.75.75 0 017 9.75zm.75 3.25a.75.75 0 000 1.5h3a.75.75 0 000-1.5h-3z" clipRule="evenodd" />
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
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
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
            className={tab.mobileHidden ? "hidden sm:flex" : "flex"}
            style={{
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
              <span className="bt-badge bt-badge-ai" style={{ fontSize: "10px", padding: "1px 5px" }}>
                AI
              </span>
            )}
          </button>
        );
      })}

      {/* Email digest — a settings-style destination, tucked behind a gear so it
          doesn't take a full tab slot. Highlights when the emails view is open. */}
      {(() => {
        const isActive = activeTab === "emails";
        return (
          <button
            type="button"
            onClick={() => handleTabChange("emails")}
            title="Email digest settings"
            aria-label="Email digest settings"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              marginLeft: "auto",
              padding: "10px 14px",
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
            <span style={{ opacity: isActive ? 1 : 0.5, display: "flex" }}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.53 1.53 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.53 1.53 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.53 1.53 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.532 1.532 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.53 1.53 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.53 1.53 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.53 1.53 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
            </span>
            Emails
          </button>
        );
      })()}
    </div>
  );
}
