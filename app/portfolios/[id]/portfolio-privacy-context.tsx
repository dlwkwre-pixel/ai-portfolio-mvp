"use client";

import { createContext, useContext, useState, ReactNode } from "react";

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
  const [isPrivate, setIsPrivate] = useState(false);

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
