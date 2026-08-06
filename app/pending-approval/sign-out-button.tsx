"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const TEAL = "#0e9488";

export default function SignOutButton() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={loading}
      style={{
        background: "none", border: "none", padding: 0, cursor: loading ? "not-allowed" : "pointer",
        fontSize: "13px", fontWeight: 600, color: TEAL, textDecoration: "underline",
        textUnderlineOffset: "2px", opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? "Signing out..." : "Sign out"}
    </button>
  );
}
