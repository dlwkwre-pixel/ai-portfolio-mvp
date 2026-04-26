"use client";

import { useState } from "react";
import NewStrategyForm from "./new-strategy-form";
import StrategyQuestionnaire from "./strategy-questionnaire";

export default function StrategiesHeader() {
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);

  return (
    <>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <button
          type="button"
          onClick={() => setShowQuestionnaire(true)}
          className="bt-btn bt-btn-ghost bt-btn-sm"
          style={{ gap: "6px" }}
        >
          <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
            <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192zM6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.897l-2.051-.684a1 1 0 01-.633-.633L6.95 5.684z" />
          </svg>
          AI Builder
        </button>
        <NewStrategyForm />
      </div>

      {showQuestionnaire && (
        <StrategyQuestionnaire onClose={() => setShowQuestionnaire(false)} />
      )}
    </>
  );
}
