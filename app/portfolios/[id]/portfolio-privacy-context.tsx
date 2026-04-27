"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

const PRIVACY_KEY = "bt-privacy-mode";

type PortfolioPrivacyContextType = {
  isPrivate: boolean;
  setIsPrivate: (v: boolean) => void;
  hide: (value: string, isMoney?: boolean) => string;
};

const PortfolioPrivacyContext = createContext<PortfolioPrivacyContextType>({
  isPrivate: false,
  setIsPrivate: () => {},
  hide: (v) => v,
});

export function usePortfolioPrivacy() {
  return useContext(PortfolioPrivacyContext);
}

export function PortfolioPrivacyProvider({ children }: { children: ReactNode }) {
  const [isPrivate, setIsPrivateState] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PRIVACY_KEY);
      if (stored === "true") setIsPrivateState(true);
    } catch {}
  }, []);

  function setIsPrivate(v: boolean) {
    setIsPrivateState(v);
    try { localStorage.setItem(PRIVACY_KEY, String(v)); } catch {}
  }

  function hide(value: string, isMoney = false): string {
    if (!isPrivate) return value;
    return isMoney ? "$••••••" : "••••••";
  }

  return (
    <PortfolioPrivacyContext.Provider value={{ isPrivate, setIsPrivate, hide }}>
      {children}
    </PortfolioPrivacyContext.Provider>
  );
}
