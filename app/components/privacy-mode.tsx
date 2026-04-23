"use client";

import { createContext, useContext, useState, ReactNode } from "react";

type PrivacyContextType = {
  isPrivate: boolean;
  toggle: () => void;
  hide: (value: string) => string;
  hideMoney: (value: string | number | null | undefined) => string;
};

const PrivacyContext = createContext<PrivacyContextType>({
  isPrivate: false,
  toggle: () => {},
  hide: (v) => v,
  hideMoney: () => "—",
});

export function usePrivacy() {
  return useContext(PrivacyContext);
}

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [isPrivate, setIsPrivate] = useState(false);

  function toggle() {
    setIsPrivate((prev) => !prev);
  }

  function hide(value: string): string {
    if (!isPrivate) return value;
    return "••••••";
  }

  function hideMoney(value: string | number | null | undefined): string {
    if (!isPrivate) {
      if (value === null || value === undefined) return "—";
      if (typeof value === "number") {
        return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
      return String(value);
    }
    return "$••••••";
  }

  return (
    <PrivacyContext.Provider value={{ isPrivate, toggle, hide, hideMoney }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function PrivacyToggle() {
  const { isPrivate, toggle } = usePrivacy();

  return (
    <button
      type="button"
      onClick={toggle}
      title={isPrivate ? "Show values" : "Hide values (privacy mode)"}
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition ${
        isPrivate
          ? "border-purple-500/30 bg-purple-500/15 text-purple-300 hover:bg-purple-500/20"
          : "border-white/10 bg-white/4 text-slate-400 hover:bg-white/8 hover:text-white"
      }`}
    >
      {isPrivate ? (
        <>
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06l-1.745-1.745a10.029 10.029 0 003.3-4.38 1.651 1.651 0 000-1.185A10.004 10.004 0 009.999 3a9.956 9.956 0 00-4.744 1.194L3.28 2.22zM7.752 6.69l1.092 1.092a2.5 2.5 0 013.374 3.373l1.091 1.092a4 4 0 00-5.557-5.557z" clipRule="evenodd" />
            <path d="M10.748 13.93l2.523 2.523a9.987 9.987 0 01-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 010-1.186A10.007 10.007 0 012.839 6.02L6.07 9.252a4 4 0 004.678 4.678z" />
          </svg>
          Privacy On
        </>
      ) : (
        <>
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
            <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41z" clipRule="evenodd" />
          </svg>
          Privacy
        </>
      )}
    </button>
  );
}
