"use client";

import { useState } from "react";
import NewStrategyForm from "./new-strategy-form";
import StrategyQuestionnaire from "./strategy-questionnaire";

export default function StrategiesHeader() {
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);

  return (
    <>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-blue-400">Strategy Library</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Investing Strategies</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Create reusable frameworks that guide AI analysis across your portfolios.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowQuestionnaire(true)}
            className="flex items-center gap-2 rounded-xl border border-blue-500/25 bg-blue-500/10 px-4 py-2.5 text-sm font-semibold text-blue-300 transition hover:bg-blue-500/20"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192zM6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.897l-2.051-.684a1 1 0 01-.633-.633L6.95 5.684z" />
            </svg>
            AI Strategy Builder
          </button>
          <NewStrategyForm />
        </div>
      </div>

      {showQuestionnaire && (
        <StrategyQuestionnaire onClose={() => setShowQuestionnaire(false)} />
      )}
    </>
  );
}
