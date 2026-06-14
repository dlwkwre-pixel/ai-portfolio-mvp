"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import type { ApartmentListing, ListingStatus } from "./apartment-actions";
import { saveApartmentListing, deleteApartmentListing, toggleApartmentFavorite } from "./apartment-actions";
import type { FinancialProfile } from "@/app/planning/planning-actions";

// ── Formatters ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtD(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtPct(n: number): string { return n.toFixed(1) + "%"; }

// ── Types ─────────────────────────────────────────────────────────────────────

type View = "cards" | "compare";
type ApartmentVerdict = "GREAT_VALUE" | "REASONABLE" | "MANAGEABLE" | "STRETCH" | "TIGHT";

type Computed = {
  petMonthly: number;
  effectiveBaseRent: number;
  amortizedFees: number;
  trueMonthly: number;
  upfrontTotal: number;
  pricePerSqft: number | null;
  rentBurdenPct: number | null;
  verdict: ApartmentVerdict;
  investmentOpportunityCost10yr: number | null;
};

// ── Math ──────────────────────────────────────────────────────────────────────

function compute(l: ApartmentListing, monthlyIncome: number | null, cheapestTrueMonthly: number | null): Computed {
  const petMonthly = l.has_pets ? l.pet_rent_monthly * l.pet_count : 0;
  const effectiveBaseRent = Math.max(0, l.base_rent - l.concession_monthly_savings);
  const amortizedFees = l.lease_term_months > 0
    ? (l.application_fee + l.admin_fee) / l.lease_term_months
    : 0;
  const trueMonthly = effectiveBaseRent + petMonthly + l.parking_monthly + amortizedFees;
  const upfrontTotal = l.security_deposit + (l.has_pets ? l.pet_deposit * l.pet_count : 0) + l.application_fee + l.admin_fee;
  const pricePerSqft = l.square_feet && l.square_feet > 0 ? l.base_rent / l.square_feet : null;
  const rentBurdenPct = monthlyIncome && monthlyIncome > 0 ? (trueMonthly / monthlyIncome) * 100 : null;

  let verdict: ApartmentVerdict = "REASONABLE";
  if (rentBurdenPct !== null) {
    if (rentBurdenPct < 25) verdict = "GREAT_VALUE";
    else if (rentBurdenPct < 30) verdict = "REASONABLE";
    else if (rentBurdenPct < 33) verdict = "MANAGEABLE";
    else if (rentBurdenPct < 38) verdict = "STRETCH";
    else verdict = "TIGHT";
  }

  const investmentOpportunityCost10yr =
    cheapestTrueMonthly !== null && trueMonthly > cheapestTrueMonthly
      ? (() => {
          const monthlyDiff = trueMonthly - cheapestTrueMonthly;
          const r = 0.07 / 12;
          return monthlyDiff * ((Math.pow(1 + r, 120) - 1) / r);
        })()
      : null;

  return { petMonthly, effectiveBaseRent, amortizedFees, trueMonthly, upfrontTotal, pricePerSqft, rentBurdenPct, verdict, investmentOpportunityCost10yr };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_META: Record<ListingStatus, { label: string; color: string; bg: string }> = {
  considering: { label: "Considering",  color: "var(--text-muted)",   bg: "rgba(255,255,255,0.05)" },
  touring:     { label: "Touring",      color: "oklch(0.65 0.18 220)", bg: "rgba(59,130,246,0.12)"  },
  applied:     { label: "Applied",      color: "oklch(0.75 0.18 55)",  bg: "rgba(245,158,11,0.12)"  },
  offer:       { label: "Offer",        color: "var(--green)",         bg: "rgba(34,197,94,0.12)"   },
  pass:        { label: "Passed",       color: "var(--text-muted)",    bg: "rgba(255,255,255,0.05)" },
  rejected:    { label: "Rejected",     color: "var(--red)",           bg: "rgba(239,68,68,0.12)"   },
};

const VERDICT_META: Record<ApartmentVerdict, { label: string; color: string }> = {
  GREAT_VALUE: { label: "Great Value", color: "var(--green)"           },
  REASONABLE:  { label: "Reasonable",  color: "oklch(0.65 0.18 220)"  },
  MANAGEABLE:  { label: "Manageable",  color: "oklch(0.75 0.18 55)"   },
  STRETCH:     { label: "Stretch",     color: "oklch(0.70 0.20 30)"   },
  TIGHT:       { label: "Tight",       color: "var(--red)"             },
};

const BEDROOM_OPTIONS = [
  { value: "0", label: "Studio" },
  { value: "1", label: "1 BR" },
  { value: "2", label: "2 BR" },
  { value: "3", label: "3 BR" },
  { value: "4", label: "4+ BR" },
];

// ── Default draft ─────────────────────────────────────────────────────────────

function defaultDraft(): Omit<ApartmentListing, "id" | "user_id" | "created_at" | "updated_at"> {
  return {
    name: "", website: null, address: null, status: "considering",
    floorplan_name: null, bedrooms: null, bathrooms: null, square_feet: null, available_date: null,
    base_rent: 0, lease_term_months: 12,
    concession_text: null, concession_monthly_savings: 0, concession_explanation: null,
    application_fee: 0, admin_fee: 0, security_deposit: 0,
    has_pets: false, pet_count: 1, pet_deposit: 0, pet_rent_monthly: 0,
    parking_monthly: 0, commute_minutes: null, commute_cost_monthly: null,
    notes: null, user_score: null, is_favorite: false,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StarRating({ score, onChange }: { score: number | null; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "flex", gap: "3px" }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <button key={s} type="button" onClick={() => onChange(s)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", fontSize: "18px",
            color: score !== null && score >= s ? "oklch(0.75 0.18 55)" : "var(--border-subtle)" }}>
          ★
        </button>
      ))}
    </div>
  );
}

function InputRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <label style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: "13px", fontFamily: "var(--font-body)",
  boxSizing: "border-box",
};

const numInputStyle: React.CSSProperties = { ...inputStyle, fontFamily: "var(--font-mono)" };

// ── Main component ────────────────────────────────────────────────────────────

type Props = {
  listings: ApartmentListing[];
  profile: FinancialProfile | null;
  effectiveIncome: number;
};

export default function ApartmentClient({ listings: initialListings, profile, effectiveIncome }: Props) {
  const [listings, setListings] = useState<ApartmentListing[]>(initialListings);
  const [view, setView] = useState<View>("cards");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<Omit<ApartmentListing, "id" | "user_id" | "created_at" | "updated_at">>(defaultDraft);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const monthlyIncome = effectiveIncome > 0 ? effectiveIncome : null;

  const cheapestTrueMonthly = useMemo(() => {
    if (listings.length === 0) return null;
    return Math.min(...listings.map((l) => {
      const petM = l.has_pets ? l.pet_rent_monthly * l.pet_count : 0;
      const eff = Math.max(0, l.base_rent - l.concession_monthly_savings);
      const fees = l.lease_term_months > 0 ? (l.application_fee + l.admin_fee) / l.lease_term_months : 0;
      return eff + petM + l.parking_monthly + fees;
    }));
  }, [listings]);

  const computedMap = useMemo(() =>
    Object.fromEntries(listings.map((l) => [l.id, compute(l, monthlyIncome, cheapestTrueMonthly)])),
    [listings, monthlyIncome, cheapestTrueMonthly]
  );

  // ── Form helpers ──────────────────────────────────────────────────────────

  function openAdd() {
    setDraft(defaultDraft());
    setEditingId(null);
    setSaveError(null);
    setParseError(null);
    setShowForm(true);
  }

  function openEdit(l: ApartmentListing) {
    setDraft({
      name: l.name, website: l.website, address: l.address, status: l.status,
      floorplan_name: l.floorplan_name, bedrooms: l.bedrooms, bathrooms: l.bathrooms,
      square_feet: l.square_feet, available_date: l.available_date,
      base_rent: l.base_rent, lease_term_months: l.lease_term_months,
      concession_text: l.concession_text, concession_monthly_savings: l.concession_monthly_savings,
      concession_explanation: l.concession_explanation,
      application_fee: l.application_fee, admin_fee: l.admin_fee, security_deposit: l.security_deposit,
      has_pets: l.has_pets, pet_count: l.pet_count, pet_deposit: l.pet_deposit, pet_rent_monthly: l.pet_rent_monthly,
      parking_monthly: l.parking_monthly, commute_minutes: l.commute_minutes, commute_cost_monthly: l.commute_cost_monthly,
      notes: l.notes, user_score: l.user_score, is_favorite: l.is_favorite,
    });
    setEditingId(l.id);
    setSaveError(null);
    setParseError(null);
    setShowForm(true);
  }

  function set<K extends keyof typeof draft>(key: K, value: typeof draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function parseConcesssion() {
    if (!draft.concession_text?.trim() || draft.base_rent <= 0) return;
    setIsParsing(true);
    setParseError(null);
    try {
      const res = await fetch("/api/planning/apartment-finn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concession_text: draft.concession_text,
          base_rent: draft.base_rent,
          lease_term_months: draft.lease_term_months,
        }),
      });
      const data = await res.json() as { monthly_savings?: number; explanation?: string; error?: string };
      if (data.error) { setParseError(data.error); return; }
      setDraft((d) => ({
        ...d,
        concession_monthly_savings: data.monthly_savings ?? 0,
        concession_explanation: data.explanation ?? null,
      }));
    } catch {
      setParseError("Could not reach AI service.");
    } finally {
      setIsParsing(false);
    }
  }

  function handleSave() {
    if (!draft.name.trim()) { setSaveError("Property name is required."); return; }
    startTransition(async () => {
      const result = editingId
        ? await saveApartmentListing(draft, editingId)
        : await saveApartmentListing(draft);
      if (result.error) { setSaveError(result.error); return; }
      const newListing: ApartmentListing = {
        ...draft,
        id: result.id!,
        user_id: "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setListings((prev) =>
        editingId
          ? prev.map((l) => l.id === editingId ? { ...l, ...draft, updated_at: new Date().toISOString() } : l)
          : [newListing, ...prev]
      );
      setShowForm(false);
      setEditingId(null);
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteApartmentListing(id);
      setListings((prev) => prev.filter((l) => l.id !== id));
      setDeleteConfirm(null);
    });
  }

  function handleToggleFavorite(id: string, current: boolean) {
    startTransition(async () => {
      await toggleApartmentFavorite(id, !current);
      setListings((prev) => prev.map((l) => l.id === id ? { ...l, is_favorite: !current } : l));
    });
  }

  // ── Compare sort ──────────────────────────────────────────────────────────

  const sortedForCompare = useMemo(() =>
    [...listings].sort((a, b) => {
      const ca = computedMap[a.id]?.trueMonthly ?? 0;
      const cb = computedMap[b.id]?.trueMonthly ?? 0;
      return ca - cb;
    }),
    [listings, computedMap]
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="bt-mobile-nav-pad" style={{ maxWidth: "900px", margin: "0 auto", padding: "20px 16px 60px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <Link href="/planning" style={{ fontSize: "12px", color: "var(--text-muted)", textDecoration: "none", display: "flex", alignItems: "center", gap: "4px", marginBottom: "4px" }}>
            ← Planning
          </Link>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Apartment Planner</h1>
          {listings.length > 0 && (
            <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "2px 0 0" }}>
              {listings.length} {listings.length === 1 ? "listing" : "listings"} · comparing true monthly costs
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {listings.length > 1 && (
            <div style={{ display: "flex", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
              {(["cards", "compare"] as View[]).map((v) => (
                <button key={v} type="button" onClick={() => setView(v)}
                  style={{ padding: "6px 14px", background: view === v ? "var(--brand-blue)" : "none", border: "none",
                    color: view === v ? "#fff" : "var(--text-muted)", fontSize: "12px", cursor: "pointer", fontFamily: "var(--font-body)", textTransform: "capitalize" }}>
                  {v === "cards" ? "Cards" : "Compare"}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={openAdd}
            style={{ padding: "8px 16px", background: "var(--brand-blue)", border: "none", borderRadius: "var(--radius-sm)",
              color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}>
            + Add Apartment
          </button>
        </div>
      </div>

      {/* Empty state */}
      {listings.length === 0 && !showForm && (
        <div style={{ textAlign: "center", padding: "60px 20px", border: "1px dashed var(--border-subtle)", borderRadius: "var(--radius-lg)", background: "var(--bg-card)" }}>
          <div style={{ fontSize: "36px", marginBottom: "12px" }}>🏢</div>
          <h2 style={{ fontSize: "18px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>Start comparing apartments</h2>
          <p style={{ fontSize: "13px", color: "var(--text-muted)", maxWidth: "400px", margin: "0 auto 20px", lineHeight: 1.6 }}>
            Add apartments you're considering. BuyTune calculates your true monthly cost including concessions, fees, and pets — so you can compare apples to apples.
          </p>
          <button type="button" onClick={openAdd}
            style={{ padding: "10px 20px", background: "var(--brand-blue)", border: "none", borderRadius: "var(--radius-sm)",
              color: "#fff", fontSize: "14px", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}>
            Add Your First Apartment
          </button>
        </div>
      )}

      {/* Add / Edit Form */}
      {showForm && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "20px", marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
              {editingId ? "Edit Apartment" : "Add Apartment"}
            </h2>
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }}
              style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "18px", cursor: "pointer", lineHeight: 1 }}>×</button>
          </div>

          {/* Section: Property Info */}
          <p style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>Property</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
            <InputRow label="Property Name *">
              <input style={inputStyle} placeholder="The Arbor at Midtown" value={draft.name}
                onChange={(e) => set("name", e.target.value)} />
            </InputRow>
            <InputRow label="Status">
              <select style={inputStyle} value={draft.status} onChange={(e) => set("status", e.target.value as ListingStatus)}>
                {Object.entries(STATUS_META).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </InputRow>
            <InputRow label="Website">
              <input style={inputStyle} placeholder="https://" value={draft.website ?? ""}
                onChange={(e) => set("website", e.target.value || null)} />
            </InputRow>
            <InputRow label="Address">
              <input style={inputStyle} placeholder="123 Main St, City, ST" value={draft.address ?? ""}
                onChange={(e) => set("address", e.target.value || null)} />
            </InputRow>
          </div>

          {/* Section: Unit */}
          <p style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>Unit Details</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "16px" }}>
            <InputRow label="Floorplan">
              <input style={inputStyle} placeholder="A2 – 1BR/1BA" value={draft.floorplan_name ?? ""}
                onChange={(e) => set("floorplan_name", e.target.value || null)} />
            </InputRow>
            <InputRow label="Bedrooms">
              <select style={inputStyle} value={draft.bedrooms?.toString() ?? ""}
                onChange={(e) => set("bedrooms", e.target.value ? Number(e.target.value) : null)}>
                <option value="">–</option>
                {BEDROOM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </InputRow>
            <InputRow label="Sq Ft">
              <input style={numInputStyle} type="number" min="0" placeholder="850" value={draft.square_feet ?? ""}
                onChange={(e) => set("square_feet", e.target.value ? Number(e.target.value) : null)} />
            </InputRow>
            <InputRow label="Bathrooms">
              <input style={numInputStyle} type="number" min="0" step="0.5" placeholder="1" value={draft.bathrooms ?? ""}
                onChange={(e) => set("bathrooms", e.target.value ? Number(e.target.value) : null)} />
            </InputRow>
            <InputRow label="Available Date">
              <input style={inputStyle} type="date" value={draft.available_date ?? ""}
                onChange={(e) => set("available_date", e.target.value || null)} />
            </InputRow>
          </div>

          {/* Section: Pricing */}
          <p style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>Pricing</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
            <InputRow label="Base Rent / Month">
              <input style={numInputStyle} type="number" min="0" placeholder="2000" value={draft.base_rent || ""}
                onChange={(e) => set("base_rent", Number(e.target.value) || 0)} />
            </InputRow>
            <InputRow label="Lease Term (months)">
              <input style={numInputStyle} type="number" min="1" max="24" value={draft.lease_term_months}
                onChange={(e) => set("lease_term_months", Number(e.target.value) || 12)} />
            </InputRow>
          </div>

          {/* Section: Concessions (AI) */}
          <p style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>
            Concession / Special Offer
          </p>
          <div style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", marginBottom: "8px" }}>
              <div style={{ flex: 1 }}>
                <input style={inputStyle} placeholder='e.g. "2 months free on a 14-month lease" or "$500 off first month"'
                  value={draft.concession_text ?? ""}
                  onChange={(e) => { set("concession_text", e.target.value || null); set("concession_monthly_savings", 0); set("concession_explanation", null); }} />
              </div>
              <button type="button" onClick={parseConcesssion} disabled={isParsing || !draft.concession_text?.trim() || draft.base_rent <= 0}
                style={{ padding: "8px 14px", background: "var(--brand-blue)", border: "none", borderRadius: "var(--radius-sm)",
                  color: "#fff", fontSize: "12px", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)",
                  opacity: isParsing || !draft.concession_text?.trim() || draft.base_rent <= 0 ? 0.5 : 1, whiteSpace: "nowrap" }}>
                {isParsing ? "Parsing…" : "AI Parse"}
              </button>
            </div>
            {draft.concession_explanation && draft.concession_monthly_savings > 0 && (
              <div style={{ padding: "8px 12px", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "var(--radius-sm)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{draft.concession_explanation}</span>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--green)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap", marginLeft: "10px" }}>
                  −{fmtD(draft.concession_monthly_savings)}/mo
                </span>
              </div>
            )}
            {parseError && <p style={{ fontSize: "12px", color: "var(--red)", marginTop: "4px" }}>{parseError}</p>}
            {draft.base_rent <= 0 && draft.concession_text?.trim() && (
              <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>Enter base rent first so AI can calculate monthly savings.</p>
            )}
          </div>

          {/* Section: Fees */}
          <p style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>Fees & Deposit</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "16px" }}>
            <InputRow label="Application Fee">
              <input style={numInputStyle} type="number" min="0" placeholder="75" value={draft.application_fee || ""}
                onChange={(e) => set("application_fee", Number(e.target.value) || 0)} />
            </InputRow>
            <InputRow label="Admin Fee">
              <input style={numInputStyle} type="number" min="0" placeholder="200" value={draft.admin_fee || ""}
                onChange={(e) => set("admin_fee", Number(e.target.value) || 0)} />
            </InputRow>
            <InputRow label="Security Deposit">
              <input style={numInputStyle} type="number" min="0" placeholder="2000" value={draft.security_deposit || ""}
                onChange={(e) => set("security_deposit", Number(e.target.value) || 0)} />
            </InputRow>
          </div>

          {/* Section: Pets */}
          <div style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
              <button type="button" onClick={() => set("has_pets", !draft.has_pets)}
                style={{ width: "36px", height: "20px", borderRadius: "10px", border: "none", cursor: "pointer",
                  background: draft.has_pets ? "var(--brand-blue)" : "var(--border-subtle)", position: "relative", flexShrink: 0 }}>
                <span style={{ position: "absolute", top: "2px", left: draft.has_pets ? "18px" : "2px", width: "16px", height: "16px",
                  borderRadius: "50%", background: "#fff", transition: "left 0.15s" }} />
              </button>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: 0 }}>I have pets</p>
            </div>
            {draft.has_pets && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
                <InputRow label="Pet Count">
                  <input style={numInputStyle} type="number" min="1" max="5" value={draft.pet_count}
                    onChange={(e) => set("pet_count", Math.max(1, Number(e.target.value)))} />
                </InputRow>
                <InputRow label="Pet Deposit (per pet)">
                  <input style={numInputStyle} type="number" min="0" placeholder="500" value={draft.pet_deposit || ""}
                    onChange={(e) => set("pet_deposit", Number(e.target.value) || 0)} />
                </InputRow>
                <InputRow label="Pet Rent / Month (per pet)">
                  <input style={numInputStyle} type="number" min="0" placeholder="50" value={draft.pet_rent_monthly || ""}
                    onChange={(e) => set("pet_rent_monthly", Number(e.target.value) || 0)} />
                </InputRow>
              </div>
            )}
          </div>

          {/* Section: Extras */}
          <p style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>Extras</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "16px" }}>
            <InputRow label="Parking / Month">
              <input style={numInputStyle} type="number" min="0" placeholder="0 if included" value={draft.parking_monthly || ""}
                onChange={(e) => set("parking_monthly", Number(e.target.value) || 0)} />
            </InputRow>
            <InputRow label="Commute (min)">
              <input style={numInputStyle} type="number" min="0" placeholder="25" value={draft.commute_minutes ?? ""}
                onChange={(e) => set("commute_minutes", e.target.value ? Number(e.target.value) : null)} />
            </InputRow>
            <InputRow label="Commute Cost / Month">
              <input style={numInputStyle} type="number" min="0" placeholder="100" value={draft.commute_cost_monthly ?? ""}
                onChange={(e) => set("commute_cost_monthly", e.target.value ? Number(e.target.value) : null)} />
            </InputRow>
          </div>

          {/* Section: Your Take */}
          <p style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>Your Take</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px", marginBottom: "16px", alignItems: "start" }}>
            <InputRow label="Notes">
              <textarea style={{ ...inputStyle, minHeight: "64px", resize: "vertical" }} placeholder="Pros, cons, gut feel…"
                value={draft.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} />
            </InputRow>
            <InputRow label="Your Rating">
              <StarRating score={draft.user_score} onChange={(v) => set("user_score", v)} />
            </InputRow>
          </div>

          {saveError && <p style={{ fontSize: "12px", color: "var(--red)", marginBottom: "10px" }}>{saveError}</p>}

          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }}
              style={{ padding: "8px 16px", background: "none", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)",
                color: "var(--text-muted)", fontSize: "13px", cursor: "pointer", fontFamily: "var(--font-body)" }}>
              Cancel
            </button>
            <button type="button" onClick={handleSave}
              style={{ padding: "8px 20px", background: "var(--brand-blue)", border: "none", borderRadius: "var(--radius-sm)",
                color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}>
              {editingId ? "Save Changes" : "Add Apartment"}
            </button>
          </div>
        </div>
      )}

      {/* Cards View */}
      {listings.length > 0 && view === "cards" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "14px" }}>
          {listings.map((l) => {
            const c = computedMap[l.id];
            if (!c) return null;
            const status = STATUS_META[l.status];
            const verdict = VERDICT_META[c.verdict];
            const isCheapest = cheapestTrueMonthly !== null && Math.abs(c.trueMonthly - cheapestTrueMonthly) < 0.5;

            return (
              <div key={l.id} style={{ background: "var(--bg-card)", border: `1px solid ${isCheapest ? "rgba(34,197,94,0.3)" : "var(--border-subtle)"}`,
                borderRadius: "var(--radius-lg)", padding: "16px", display: "flex", flexDirection: "column", gap: "12px",
                boxShadow: isCheapest ? "0 0 0 1px rgba(34,197,94,0.12)" : "none" }}>

                {/* Top row: name + controls */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", wordBreak: "break-word" }}>{l.name}</span>
                      {l.is_favorite && <span style={{ fontSize: "14px", color: "oklch(0.75 0.18 55)" }}>★</span>}
                      {isCheapest && listings.length > 1 && (
                        <span style={{ fontSize: "9px", fontWeight: 700, color: "var(--green)", background: "rgba(34,197,94,0.12)", padding: "2px 6px", borderRadius: "4px", letterSpacing: "0.05em", textTransform: "uppercase" }}>Lowest Cost</span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: "6px", marginTop: "4px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "4px", fontWeight: 500,
                        color: status.color, background: status.bg }}>{status.label}</span>
                      {l.floorplan_name && <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{l.floorplan_name}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                    <button type="button" onClick={() => handleToggleFavorite(l.id, l.is_favorite)}
                      title={l.is_favorite ? "Unfavorite" : "Favorite"}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: "15px", color: l.is_favorite ? "oklch(0.75 0.18 55)" : "var(--border-subtle)", padding: "2px" }}>★</button>
                    <button type="button" onClick={() => openEdit(l)}
                      style={{ background: "none", border: "1px solid var(--border-subtle)", borderRadius: "4px", cursor: "pointer", fontSize: "11px", color: "var(--text-muted)", padding: "3px 8px", fontFamily: "var(--font-body)" }}>Edit</button>
                  </div>
                </div>

                {/* True monthly hero */}
                <div style={{ textAlign: "center", padding: "12px 0", borderTop: "1px solid var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)" }}>
                  <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "2px" }}>True Monthly Cost</div>
                  <div style={{ fontSize: "28px", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-mono)", lineHeight: 1 }}>
                    {fmt(c.trueMonthly)}
                  </div>
                  {c.trueMonthly !== l.base_rent && (
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "3px" }}>
                      Base {fmt(l.base_rent)}
                      {l.concession_monthly_savings > 0 && <span style={{ color: "var(--green)" }}> − {fmtD(l.concession_monthly_savings)} concession</span>}
                    </div>
                  )}
                </div>

                {/* Key metrics grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  {c.rentBurdenPct !== null && (
                    <div style={{ background: "var(--bg-surface)", borderRadius: "var(--radius-sm)", padding: "8px 10px" }}>
                      <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px" }}>Rent Burden</div>
                      <div style={{ fontSize: "16px", fontWeight: 600, color: verdict.color, fontFamily: "var(--font-mono)" }}>{fmtPct(c.rentBurdenPct)}</div>
                    </div>
                  )}
                  {l.square_feet && (
                    <div style={{ background: "var(--bg-surface)", borderRadius: "var(--radius-sm)", padding: "8px 10px" }}>
                      <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px" }}>$/Sq Ft</div>
                      <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                        {c.pricePerSqft !== null ? `$${c.pricePerSqft.toFixed(2)}` : "–"}
                      </div>
                    </div>
                  )}
                  <div style={{ background: "var(--bg-surface)", borderRadius: "var(--radius-sm)", padding: "8px 10px" }}>
                    <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px" }}>Upfront</div>
                    <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{fmt(c.upfrontTotal)}</div>
                  </div>
                  <div style={{ background: "var(--bg-surface)", borderRadius: "var(--radius-sm)", padding: "8px 10px" }}>
                    <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px" }}>Lease</div>
                    <div style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{l.lease_term_months}mo</div>
                  </div>
                </div>

                {/* Verdict + opportunity cost */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "5px",
                    color: verdict.color, border: `1px solid ${verdict.color}`, background: `color-mix(in oklch, ${verdict.color} 10%, transparent)`,
                    letterSpacing: "0.04em", textTransform: "uppercase" }}>
                    {verdict.label}
                  </span>
                  {c.investmentOpportunityCost10yr !== null && c.investmentOpportunityCost10yr > 0 && (
                    <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                      +{fmt(c.investmentOpportunityCost10yr)} less in 10yr vs cheapest
                    </span>
                  )}
                </div>

                {/* Commute + rating + notes */}
                {(l.commute_minutes || l.user_score || l.notes) && (
                  <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "10px", display: "flex", flexDirection: "column", gap: "5px" }}>
                    {l.commute_minutes && (
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                        🚗 {l.commute_minutes} min commute
                        {l.commute_cost_monthly ? ` · ${fmt(l.commute_cost_monthly)}/mo` : ""}
                      </div>
                    )}
                    {l.user_score && (
                      <div style={{ fontSize: "12px", color: "oklch(0.75 0.18 55)" }}>
                        {"★".repeat(l.user_score)}{"☆".repeat(5 - l.user_score)}
                      </div>
                    )}
                    {l.notes && <div style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.4 }}>{l.notes}</div>}
                  </div>
                )}

                {/* Delete */}
                {deleteConfirm === l.id ? (
                  <div style={{ display: "flex", gap: "6px", alignItems: "center", justifyContent: "flex-end" }}>
                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Remove this listing?</span>
                    <button type="button" onClick={() => handleDelete(l.id)}
                      style={{ padding: "4px 10px", background: "var(--red)", border: "none", borderRadius: "4px", color: "#fff", fontSize: "12px", cursor: "pointer", fontFamily: "var(--font-body)" }}>
                      Delete
                    </button>
                    <button type="button" onClick={() => setDeleteConfirm(null)}
                      style={{ padding: "4px 10px", background: "none", border: "1px solid var(--border-subtle)", borderRadius: "4px", color: "var(--text-muted)", fontSize: "12px", cursor: "pointer", fontFamily: "var(--font-body)" }}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setDeleteConfirm(l.id)}
                    style={{ alignSelf: "flex-end", background: "none", border: "none", color: "var(--text-muted)", fontSize: "11px", cursor: "pointer", fontFamily: "var(--font-body)", padding: 0 }}>
                    Remove
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Compare View */}
      {listings.length > 1 && view === "compare" && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ background: "var(--bg-surface)" }}>
                  {["Property", "Status", "Sq Ft", "Base Rent", "Concession", "True Monthly", "Upfront", "$/Sqft", monthlyIncome ? "Burden %" : null, "Verdict"].filter(Boolean).map((h) => (
                    <th key={h!} style={{ padding: "10px 12px", textAlign: "left", fontSize: "10px", color: "var(--text-muted)", fontWeight: 600,
                      textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap", borderBottom: "1px solid var(--border-subtle)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedForCompare.map((l, idx) => {
                  const c = computedMap[l.id];
                  if (!c) return null;
                  const status = STATUS_META[l.status];
                  const verdict = VERDICT_META[c.verdict];
                  const isCheapest = idx === 0;
                  return (
                    <tr key={l.id} style={{ background: isCheapest ? "color-mix(in oklch, var(--green) 4%, var(--bg-card))" : "transparent",
                      borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={{ padding: "10px 12px", color: "var(--text-primary)", fontWeight: 500, whiteSpace: "nowrap" }}>
                        {l.is_favorite && <span style={{ color: "oklch(0.75 0.18 55)", marginRight: "4px" }}>★</span>}
                        {l.name}
                        {l.floorplan_name && <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "4px" }}>({l.floorplan_name})</span>}
                        {isCheapest && <span style={{ fontSize: "9px", fontWeight: 700, color: "var(--green)", marginLeft: "6px" }}>LOWEST</span>}
                      </td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        <span style={{ color: status.color, fontSize: "11px" }}>{status.label}</span>
                      </td>
                      <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", textAlign: "right", whiteSpace: "nowrap" }}>
                        {l.square_feet ? l.square_feet.toLocaleString() : "–"}
                      </td>
                      <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", textAlign: "right", whiteSpace: "nowrap" }}>
                        {fmt(l.base_rent)}
                      </td>
                      <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", textAlign: "right", whiteSpace: "nowrap" }}>
                        {l.concession_monthly_savings > 0
                          ? <span style={{ color: "var(--green)" }}>−{fmtD(l.concession_monthly_savings)}/mo</span>
                          : <span style={{ color: "var(--text-muted)" }}>–</span>}
                      </td>
                      <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap",
                        color: isCheapest ? "var(--green)" : "var(--text-primary)" }}>
                        {fmt(c.trueMonthly)}
                      </td>
                      <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", textAlign: "right", whiteSpace: "nowrap" }}>
                        {fmt(c.upfrontTotal)}
                      </td>
                      <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", textAlign: "right", whiteSpace: "nowrap" }}>
                        {c.pricePerSqft !== null ? `$${c.pricePerSqft.toFixed(2)}` : "–"}
                      </td>
                      {monthlyIncome && (
                        <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", textAlign: "right", whiteSpace: "nowrap",
                          color: c.rentBurdenPct !== null ? verdict.color : "var(--text-muted)" }}>
                          {c.rentBurdenPct !== null ? fmtPct(c.rentBurdenPct) : "–"}
                        </td>
                      )}
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "4px",
                          color: verdict.color, border: `1px solid ${verdict.color}`,
                          background: `color-mix(in oklch, ${verdict.color} 10%, transparent)`, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                          {verdict.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {monthlyIncome && (
            <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border-subtle)", fontSize: "11px", color: "var(--text-muted)" }}>
              Burden % calculated on {fmt(monthlyIncome)}/mo income · True Monthly = effective rent + pet rent + parking + amortized fees
            </div>
          )}
        </div>
      )}

      {/* BuyTune integration — investment opportunity cost summary */}
      {listings.length >= 2 && cheapestTrueMonthly !== null && (() => {
        const sorted = sortedForCompare;
        const cheapest = sorted[0];
        const mostExpensive = sorted[sorted.length - 1];
        const cCheap = computedMap[cheapest.id];
        const cExp = computedMap[mostExpensive.id];
        if (!cCheap || !cExp) return null;
        const monthlyDiff = cExp.trueMonthly - cCheap.trueMonthly;
        if (monthlyDiff < 10) return null;
        const r = 0.07 / 12;
        const fv10yr = monthlyDiff * ((Math.pow(1 + r, 120) - 1) / r);
        return (
          <div style={{ marginTop: "16px", padding: "14px 16px", background: "var(--bg-card)",
            border: "1px solid color-mix(in oklch, var(--brand-blue) 20%, var(--border-subtle))",
            borderRadius: "var(--radius-md)", display: "flex", gap: "14px", alignItems: "flex-start" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "color-mix(in oklch, var(--brand-blue) 12%, transparent)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="var(--brand-blue)" strokeWidth="1.5">
                <path d="M10 3v14M5 8l5-5 5 5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "3px" }}>Portfolio opportunity cost</p>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
                Choosing <strong>{mostExpensive.name}</strong> over <strong>{cheapest.name}</strong> costs {fmt(monthlyDiff)}/mo more.
                Invested at 7% over 10 years, that difference grows to <strong style={{ color: "var(--brand-blue)" }}>{fmt(fv10yr)}</strong> in your portfolio.
              </p>
            </div>
          </div>
        );
      })()}

      <p style={{ marginTop: "24px", fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.5 }}>
        True Monthly = effective rent (after concessions) + pet rent + parking + amortized one-time fees.
        Opportunity cost assumes 7% annual return. For informational purposes only — not financial advice.
      </p>
    </div>
  );
}
