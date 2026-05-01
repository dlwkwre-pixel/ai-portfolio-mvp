"use client";

import { useRouter } from "next/navigation";

export default function LaunchSetupButton() {
  const router = useRouter();

  function handleClick() {
    try { localStorage.removeItem("bt-onboarding-done"); } catch {}
    router.push("/dashboard?onboarding=1");
  }

  return (
    <button onClick={handleClick} className="bt-btn bt-btn-primary bt-btn-sm" style={{ marginTop: "10px" }}>
      Launch Setup Guide →
    </button>
  );
}
