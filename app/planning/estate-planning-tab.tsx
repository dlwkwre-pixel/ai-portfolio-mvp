"use client";

// Estate planning tab — extracted from planning-client.tsx and loaded on demand (dynamic import)
// so its code stays out of the initial /planning bundle. Rendered only when the Estate tab opens.

import { useState, useTransition } from "react";
import type { EstateProfile, BalanceSheetItem, ProfileKid, EstateBeneficiary, EstateAccount } from "./planning-actions";
import { upsertEstateProfile, upsertEstateBeneficiaries, upsertEstateAccounts, upsertFamilyInstructions } from "./planning-actions";

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

const DOC_STATUSES = [
  { value: "none",       label: "Not started",  color: "var(--text-muted)" },
  { value: "draft",      label: "Draft",         color: "#f59e0b" },
  { value: "signed",     label: "Signed",        color: "#3b82f6" },
  { value: "notarized",  label: "Notarized",     color: "#8b5cf6" },
  { value: "filed",      label: "Filed",         color: "var(--green)" },
] as const;

const DOCS: { key: keyof Pick<EstateProfile, "doc_will"|"doc_living_trust"|"doc_durable_poa"|"doc_healthcare_directive"|"doc_beneficiary_desig"|"doc_digital_assets">; label: string; description: string }[] = [
  { key: "doc_will",                 label: "Last Will & Testament",        description: "Distributes assets, names executor and guardians" },
  { key: "doc_living_trust",         label: "Living Trust",                 description: "Avoids probate, controls asset distribution" },
  { key: "doc_durable_poa",          label: "Durable Power of Attorney",    description: "Authorizes someone to manage finances if incapacitated" },
  { key: "doc_healthcare_directive", label: "Healthcare Directive / POA",   description: "Medical decisions and end-of-life instructions" },
  { key: "doc_beneficiary_desig",    label: "Beneficiary Designations",     description: "Named on accounts, retirement plans, and insurance" },
  { key: "doc_digital_assets",       label: "Digital Assets Inventory",     description: "Passwords, crypto, online accounts list" },
];

const RELATIONSHIPS = ["Spouse","Partner","Child","Parent","Sibling","Grandchild","Friend","Charity","Trust","Other"];

function statusColor(val: string): string {
  return DOC_STATUSES.find((s) => s.value === val)?.color ?? "var(--text-muted)";
}
function statusLabel(val: string): string {
  return DOC_STATUSES.find((s) => s.value === val)?.label ?? "Not started";
}

function EstatePlanningTab({
  estateProfile,
  balanceItems,
  portfolioTotalValue,
  isPrivate,
  profileKids,
}: {
  estateProfile: EstateProfile | null;
  balanceItems: BalanceSheetItem[];
  portfolioTotalValue: number;
  isPrivate: boolean;
  profileKids: ProfileKid[];
}) {
  const [editing, setEditing] = useState(!estateProfile);
  const [pending, startTransition] = useTransition();
  const [beneficiaries, setBeneficiaries] = useState<EstateBeneficiary[]>(
    () => estateProfile?.beneficiaries ?? []
  );
  const [addingBenef, setAddingBenef] = useState(false);
  const [newBenef, setNewBenef] = useState<Omit<EstateBeneficiary, "id">>({ name: "", relationship: "Spouse", allocation_pct: 0, notes: "" });
  const [benPending, setBenPending] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // Account access state
  const [accounts, setAccounts] = useState<EstateAccount[]>(() => estateProfile?.estate_accounts ?? []);
  const [addingAcct, setAddingAcct] = useState(false);
  const [newAcct, setNewAcct] = useState<Omit<EstateAccount, "id">>({ institution: "", account_type: "Checking", contact: "", notes: "" });
  const [acctPending, setAcctPending] = useState(false);

  // Family instructions state
  const [editingInstr, setEditingInstr] = useState(false);
  const [instrValue, setInstrValue] = useState(estateProfile?.family_instructions ?? "");
  const [instrPending, setInstrPending] = useState(false);
  const [instrMsg, setInstrMsg] = useState("");

  const totalAssets = balanceItems.filter((i) => !i.is_liability).reduce((s, i) => s + i.value, 0) + portfolioTotalValue;
  const totalLiabilities = balanceItems.filter((i) => i.is_liability).reduce((s, i) => s + i.value, 0);
  const estateValue = totalAssets - totalLiabilities;
  const FEDERAL_THRESHOLD = 13_610_000;

  const docComplete = DOCS.filter((d) => (estateProfile?.[d.key] ?? "none") !== "none").length;
  const allocTotal = beneficiaries.reduce((s, b) => s + b.allocation_pct, 0);

  function fmt(n: number) {
    return isPrivate ? "••••" : `$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }

  async function saveBeneficiaries(updated: EstateBeneficiary[]) {
    setBenPending(true);
    await upsertEstateBeneficiaries(updated);
    setBenPending(false);
  }

  function addBeneficiary() {
    if (!newBenef.name.trim()) return;
    const updated = [...beneficiaries, { ...newBenef, id: crypto.randomUUID() }];
    setBeneficiaries(updated);
    void saveBeneficiaries(updated);
    setNewBenef({ name: "", relationship: "Spouse", allocation_pct: 0, notes: "" });
    setAddingBenef(false);
  }

  function removeBeneficiary(id: string) {
    const updated = beneficiaries.filter((b) => b.id !== id);
    setBeneficiaries(updated);
    void saveBeneficiaries(updated);
  }

  async function saveAccounts(updated: EstateAccount[]) {
    setAcctPending(true);
    await upsertEstateAccounts(updated);
    setAcctPending(false);
  }

  function addAccount() {
    if (!newAcct.institution.trim()) return;
    const updated = [...accounts, { ...newAcct, id: crypto.randomUUID() }];
    setAccounts(updated);
    void saveAccounts(updated);
    setNewAcct({ institution: "", account_type: "Checking", contact: "", notes: "" });
    setAddingAcct(false);
  }

  function removeAccount(id: string) {
    const updated = accounts.filter((a) => a.id !== id);
    setAccounts(updated);
    void saveAccounts(updated);
  }

  async function saveInstructions() {
    setInstrPending(true);
    await upsertFamilyInstructions(instrValue);
    setInstrPending(false);
    setEditingInstr(false);
    setInstrMsg("Saved.");
    setTimeout(() => setInstrMsg(""), 3000);
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "7px 10px", borderRadius: "8px", fontSize: "13px",
    background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
    color: "var(--text-primary)", fontFamily: "var(--font-body)",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: "11px", fontWeight: 500, color: "var(--text-tertiary)",
    textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "5px",
  };

  const DOC_WEIGHTS: Record<string, number> = {
    doc_will: 20, doc_living_trust: 15, doc_durable_poa: 20,
    doc_healthcare_directive: 20, doc_beneficiary_desig: 15, doc_digital_assets: 10,
  };
  const estateScore = DOCS.reduce((sum, doc) => {
    const status = estateProfile?.[doc.key] ?? "none";
    return status !== "none" ? sum + (DOC_WEIGHTS[doc.key] ?? 0) : sum;
  }, 0);

  const PRIORITY_ORDER: (keyof typeof DOC_WEIGHTS)[] = [
    "doc_will", "doc_durable_poa", "doc_healthcare_directive",
    "doc_beneficiary_desig", "doc_living_trust", "doc_digital_assets",
  ];
  const firstMissing = PRIORITY_ORDER.find((k) => (estateProfile?.[k as keyof EstateProfile] ?? "none") === "none");
  const firstMissingLabel = firstMissing ? DOCS.find((d) => d.key === firstMissing)?.label ?? "" : null;

  const estateFinnInsight = (() => {
    if (!estateProfile) return "Add your estate documents to track readiness and receive personalized guidance.";
    const will = estateProfile.doc_will ?? "none";
    const poa = estateProfile.doc_durable_poa ?? "none";
    const hcd = estateProfile.doc_healthcare_directive ?? "none";
    const ben = estateProfile.doc_beneficiary_desig ?? "none";
    if (will === "none") return "A Last Will & Testament is missing. Without it, state intestacy laws determine how your assets are distributed — not you.";
    if (poa === "none") return "A Durable Power of Attorney is not on file. Without it, no one can legally manage your finances if you are incapacitated.";
    if (hcd === "none") return "A Healthcare Directive is missing. This document ensures your medical wishes are followed when you cannot speak for yourself.";
    if (ben === "none") return "Beneficiary designations override your will on retirement accounts and life insurance. Ensure all financial accounts are designated.";
    if (estateScore >= 80) return "Your estate plan is well-organized. Review it after major life events — marriage, divorce, new children, or significant asset changes.";
    return `Your estate plan covers ${docComplete} of ${DOCS.length} key documents. Complete the remaining items to achieve full readiness.`;
  })();

  const ringCirc = 200;
  const eRingOffset = ringCirc - (estateScore / 100) * ringCirc;
  const eScoreColor = estateScore >= 75 ? "var(--green)" : estateScore >= 45 ? "var(--amber)" : "var(--red)";

  const ACCOUNT_TYPES = ["Checking", "Savings", "Brokerage", "401(k)", "IRA", "Roth IRA", "Life Insurance", "Pension", "HSA", "529 Plan", "Crypto", "Real Estate", "Business", "Other"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* Header Banner — Protect Your Plan */}
      <div style={{
        borderRadius: "var(--radius-lg)", overflow: "hidden",
        background: "var(--hero-violet-bg)",
        border: "1px solid var(--hero-violet-border)",
        padding: "20px 24px",
        display: "flex", alignItems: "center", gap: "18px",
      }}>
        <div style={{
          width: "40px", height: "40px", borderRadius: "10px", flexShrink: 0,
          background: "var(--violet-bg)",
          border: "1px solid var(--violet-border)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path d="M10 2L3 6v4c0 5 3.5 8.5 7 9 3.5-.5 7-4 7-9V6L10 2z" stroke="var(--violet)" strokeWidth="1.5" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>Protect Your Plan</div>
          <div style={{ fontSize: "12px", color: "var(--hero-violet-text)", marginTop: "3px", lineHeight: 1.5 }}>
            Document your estate readiness, record where everything is, and leave clear instructions for the people who matter.
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: "22px", fontFamily: "var(--font-mono)", fontWeight: 700, color: eScoreColor }}>{estateScore}</div>
          <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>readiness</div>
        </div>
      </div>

      {/* Estate Readiness Score */}
      <div style={{
        background: "var(--bg-surface)", border: "1px solid var(--card-border)",
        borderRadius: "var(--radius-lg)", padding: "20px 24px",
        display: "flex", gap: "24px", alignItems: "center", flexWrap: "wrap",
      }}>
        <style>{`
          @keyframes er-ring-draw { from { stroke-dashoffset: ${ringCirc}; } }
          .er-ring-fill { animation: er-ring-draw 1.2s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
        `}</style>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexShrink: 0 }}>
          <svg width="72" height="72" viewBox="0 0 72 72" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="36" cy="36" r="31.85" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
            <circle
              className="er-ring-fill"
              cx="36" cy="36" r="31.85" fill="none"
              stroke={eScoreColor} strokeWidth="6" strokeLinecap="round"
              strokeDasharray={ringCirc}
              strokeDashoffset={eRingOffset}
            />
          </svg>
          <div>
            <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", fontFamily: "var(--font-body)", marginBottom: "2px" }}>Estate Readiness</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "28px", fontWeight: 700, color: eScoreColor, lineHeight: 1 }}>{estateScore}</div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-body)", marginTop: "2px" }}>
              {estateScore >= 80 ? "Well covered" : estateScore >= 50 ? "Gaps remain" : "Needs attention"}
            </div>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: "200px", display: "flex", flexDirection: "column", gap: "6px" }}>
          {DOCS.map((doc) => {
            const status = estateProfile?.[doc.key] ?? "none";
            const done = status !== "none";
            const wt = DOC_WEIGHTS[doc.key] ?? 0;
            return (
              <div key={doc.key} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "7px", height: "7px", borderRadius: "50%", flexShrink: 0, background: done ? "var(--green)" : "rgba(255,255,255,0.1)" }} />
                <span style={{ flex: 1, fontSize: "12px", color: done ? "var(--text-secondary)" : "var(--text-muted)", fontFamily: "var(--font-body)" }}>{doc.label}</span>
                <span style={{ fontSize: "10px", color: done ? eScoreColor : "var(--text-muted)", fontFamily: "var(--font-mono)", fontWeight: done ? 600 : 400 }}>{done ? `+${wt}` : `${wt} pts`}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Atlas Estate Insight */}
      <div style={{
        padding: "14px 18px", borderRadius: "var(--radius-lg)",
        background: "color-mix(in oklch, oklch(0.55 0.18 270) 6%, var(--card-bg))",
        border: "1px solid color-mix(in oklch, oklch(0.55 0.18 270) 22%, transparent)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "8px" }}>
          <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "oklch(0.65 0.18 270)", flexShrink: 0 }} />
          <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "oklch(0.65 0.18 270)", fontFamily: "var(--font-body)" }}>Atlas</span>
        </div>
        <p style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.65, margin: 0 }}>{estateFinnInsight}</p>
      </div>

      {/* Recommended Next Step */}
      {firstMissingLabel && (
        <div style={{
          display: "flex", alignItems: "center", gap: "14px", padding: "14px 18px",
          borderRadius: "var(--radius-lg)", background: "rgba(37,99,235,0.07)",
          border: "1px solid rgba(37,99,235,0.2)",
        }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(37,99,235,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <path d="M10 3v14M3 10l7 7 7-7" stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#60a5fa", fontFamily: "var(--font-body)", marginBottom: "2px" }}>Recommended Next Step</div>
            <div style={{ fontSize: "13px", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>Start your {firstMissingLabel}</div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-body)", marginTop: "1px" }}>Click Edit below to update your document status</div>
          </div>
        </div>
      )}

      {/* Legal disclaimer */}
      <div style={{
        padding: "10px 14px", borderRadius: "var(--radius-md)", fontSize: "11px",
        background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.18)",
        color: "var(--text-muted)", lineHeight: 1.6,
      }}>
        This is an organizational tool only. BuyTune is not a law firm and this is not legal advice.
        Consult a licensed estate attorney in your state for document preparation and legal guidance.
      </div>

      {/* Estate value summary */}
      <div style={{
        display: "flex", gap: "16px", flexWrap: "wrap", padding: "14px 18px",
        borderRadius: "var(--radius-lg)", background: "var(--bg-surface)", border: "1px solid var(--card-border)",
      }}>
        {[
          { label: "Estimated estate value", value: fmt(estateValue), note: "assets minus liabilities" },
          { label: "Federal exemption 2024", value: "$13.6M", note: estateValue >= FEDERAL_THRESHOLD ? "Estate may be taxable" : "Below threshold" },
          { label: "Documents complete", value: `${docComplete}/${DOCS.length}`, note: docComplete === DOCS.length ? "All accounted for" : `${DOCS.length - docComplete} remaining` },
        ].map(({ label, value, note }) => (
          <div key={label} style={{ flex: "1 1 140px" }}>
            <div style={labelStyle}>{label}</div>
            <div style={{ fontSize: "18px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-primary)" }}>{value}</div>
            <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>{note}</div>
          </div>
        ))}
      </div>

      {/* Documents checklist */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Document Checklist</div>
          <button onClick={() => { setEditing((v) => !v); setSaveMsg(""); }} style={{ fontSize: "11px", color: "var(--brand-blue)", background: "none", border: "none", cursor: "pointer" }}>
            {editing ? "Cancel" : "Edit"}
          </button>
        </div>
        {editing ? (
          <form
            action={(fd) => {
              // preserve beneficiaries — not part of this form
              startTransition(async () => {
                const result = await upsertEstateProfile(fd);
                if (!result.error) { setEditing(false); setSaveMsg("Saved."); }
              });
            }}
            style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "14px" }}
          >
            {/* Document status dropdowns */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "10px" }}>
              {DOCS.map((doc) => (
                <div key={doc.key}>
                  <div style={labelStyle}>{doc.label}</div>
                  <select name={doc.key} defaultValue={estateProfile?.[doc.key] ?? "none"} style={{ ...inputStyle, width: "100%" }}>
                    {DOC_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "3px" }}>{doc.description}</div>
                </div>
              ))}
            </div>

            {/* Key contacts */}
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", borderTop: "1px solid var(--border-subtle)", paddingTop: "12px" }}>Key Contacts</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "10px" }}>
              {[
                { prefix: "executor",         label: "Executor" },
                { prefix: "attorney",         label: "Estate Attorney" },
                { prefix: "healthcare_proxy", label: "Healthcare Proxy" },
              ].map(({ prefix, label }) => (
                <div key={prefix} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)" }}>{label}</div>
                  <input name={`${prefix}_name`}  defaultValue={(estateProfile as Record<string, string | null> | null)?.[`${prefix}_name`] ?? ""} placeholder="Name" style={inputStyle} />
                  {prefix !== "healthcare_proxy" && (
                    <input name={`${prefix}_email`} defaultValue={(estateProfile as Record<string, string | null> | null)?.[`${prefix}_email`] ?? ""} placeholder="Email" style={inputStyle} />
                  )}
                </div>
              ))}
            </div>

            {/* Last reviewed + notes */}
            <div className="estate-review-grid" style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "10px" }}>
              <div>
                <div style={labelStyle}>Last reviewed</div>
                <input type="date" name="last_reviewed_at" defaultValue={estateProfile?.last_reviewed_at ?? ""} style={inputStyle} />
              </div>
              <div>
                <div style={labelStyle}>Notes / instructions</div>
                <textarea name="notes" defaultValue={estateProfile?.notes ?? ""} rows={3} placeholder="e.g. Safe deposit box location, digital password manager, specific bequests…" style={{ ...inputStyle, resize: "vertical" }} />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button type="submit" disabled={pending} style={{ padding: "8px 18px", borderRadius: "8px", background: "var(--brand-blue)", color: "#fff", border: "none", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                {pending ? "Saving…" : "Save"}
              </button>
              {saveMsg && <span style={{ fontSize: "12px", color: "var(--green)" }}>{saveMsg}</span>}
            </div>
          </form>
        ) : (
          <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {DOCS.map((doc) => {
              const status = estateProfile?.[doc.key] ?? "none";
              return (
                <div key={doc.key} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{
                    width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0,
                    background: statusColor(status),
                  }} />
                  <div style={{ flex: 1, fontSize: "13px", color: "var(--text-primary)" }}>{doc.label}</div>
                  <div style={{ fontSize: "11px", fontWeight: 500, color: statusColor(status) }}>{statusLabel(status)}</div>
                </div>
              );
            })}
            {estateProfile?.last_reviewed_at && (
              <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--text-muted)" }}>
                Last reviewed: {estateProfile.last_reviewed_at}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Key contacts read view */}
      {!editing && estateProfile && (estateProfile.executor_name || estateProfile.attorney_name || estateProfile.healthcare_proxy_name) && (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "14px 18px" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "12px" }}>Key Contacts</div>
          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
            {[
              { label: "Executor",         name: estateProfile.executor_name,         email: estateProfile.executor_email },
              { label: "Estate Attorney",  name: estateProfile.attorney_name,         email: estateProfile.attorney_email },
              { label: "Healthcare Proxy", name: estateProfile.healthcare_proxy_name, email: null },
            ].filter((c) => c.name).map((c) => (
              <div key={c.label} style={{ flex: "1 1 160px" }}>
                <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>{c.label}</div>
                <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>{isPrivate ? "••••••" : c.name}</div>
                {c.email && <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{isPrivate ? "••••••" : c.email}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Beneficiary suggestion from profile kids */}
      {profileKids.length > 0 && beneficiaries.length === 0 && (
        <div style={{ padding: "12px 16px", borderRadius: "var(--radius-lg)", background: "oklch(0.45 0.15 270 / 0.08)", border: "1px solid oklch(0.45 0.15 270 / 0.25)", display: "flex", alignItems: "flex-start", gap: "12px" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "50%", flexShrink: 0, background: "oklch(0.45 0.15 270 / 0.15)", border: "1px solid oklch(0.55 0.18 270 / 0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 2L3 6v4c0 5 3.5 8.5 7 9 3.5-.5 7-4 7-9V6L10 2z" stroke="oklch(0.7 0.18 270)" strokeWidth="1.5" strokeLinejoin="round"/></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "oklch(0.72 0.15 270)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "3px" }}>Dependants in Your Profile</div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: "8px" }}>
              {profileKids.map((k) => k.name || "Child").join(", ")} {profileKids.length === 1 ? "is" : "are"} listed in your profile but not named as a beneficiary here. Consider adding {profileKids.length === 1 ? "them" : "them"} to your beneficiary designations.
            </div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {profileKids.map((kid, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setNewBenef({ name: kid.name || "Child", relationship: "Child", allocation_pct: 0, notes: "" });
                    setAddingBenef(true);
                  }}
                  style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, cursor: "pointer", background: "oklch(0.45 0.15 270 / 0.15)", border: "1px solid oklch(0.55 0.18 270 / 0.3)", color: "oklch(0.72 0.15 270)" }}
                >
                  + Add {kid.name || `Child ${i + 1}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Beneficiaries */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Beneficiaries</div>
            {beneficiaries.length > 0 && (
              <div style={{ fontSize: "11px", color: allocTotal === 100 ? "var(--green)" : "var(--red)", marginTop: "2px" }}>
                {allocTotal}% allocated {allocTotal !== 100 && `— ${allocTotal < 100 ? `${100 - allocTotal}% unallocated` : `${allocTotal - 100}% over`}`}
              </div>
            )}
          </div>
          <button onClick={() => setAddingBenef((v) => !v)} style={{ fontSize: "11px", color: "var(--brand-blue)", background: "none", border: "none", cursor: "pointer" }}>
            {addingBenef ? "Cancel" : "+ Add"}
          </button>
        </div>

        {addingBenef && (
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 80px", gap: "8px" }}>
              <div>
                <div style={labelStyle}>Name</div>
                <input value={newBenef.name} onChange={(e) => setNewBenef((b) => ({ ...b, name: e.target.value }))} placeholder="Full name" style={inputStyle} />
              </div>
              <div>
                <div style={labelStyle}>Relationship</div>
                <select value={newBenef.relationship} onChange={(e) => setNewBenef((b) => ({ ...b, relationship: e.target.value }))} style={inputStyle}>
                  {RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <div style={labelStyle}>% Share</div>
                <input type="number" min="0" max="100" value={newBenef.allocation_pct} onChange={(e) => setNewBenef((b) => ({ ...b, allocation_pct: Number(e.target.value) }))} style={inputStyle} />
              </div>
            </div>
            <input value={newBenef.notes} onChange={(e) => setNewBenef((b) => ({ ...b, notes: e.target.value }))} placeholder="Notes (optional)" style={inputStyle} />
            <button onClick={addBeneficiary} disabled={!newBenef.name.trim() || benPending} style={{ alignSelf: "flex-start", padding: "6px 14px", borderRadius: "8px", background: "var(--brand-blue)", color: "#fff", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
              {benPending ? "Saving…" : "Add Beneficiary"}
            </button>
          </div>
        )}

        {beneficiaries.length === 0 && !addingBenef ? (
          <div style={{ padding: "30px 18px", textAlign: "center", fontSize: "12px", color: "var(--text-muted)" }}>
            No beneficiaries added yet.
          </div>
        ) : (
          <div style={{ padding: "6px 0" }}>
            {beneficiaries.map((b) => (
              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 18px", borderBottom: "1px solid var(--border-subtle)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>{isPrivate ? "••••••" : b.name}</div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{b.relationship}{b.notes && ` · ${b.notes}`}</div>
                </div>
                <div style={{
                  padding: "2px 10px", borderRadius: "4px", fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700,
                  background: allocTotal === 100 ? "rgba(34,197,94,0.1)" : "var(--bg-elevated)",
                  color: allocTotal === 100 ? "var(--green)" : "var(--text-secondary)",
                }}>
                  {b.allocation_pct}%
                </div>
                <button onClick={() => removeBeneficiary(b.id)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "14px", padding: "2px 6px" }}><span aria-hidden="true">×</span><span className="bt-sr-only">Remove</span></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notes read view (kept for doc-edit form notes field) */}
      {!editing && estateProfile?.notes && (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "14px 18px" }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "8px" }}>Document Notes</div>
          <div style={{ fontSize: "13px", color: "var(--text-primary)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {isPrivate ? "••••••••••••" : estateProfile.notes}
          </div>
        </div>
      )}

      {/* Account Access Planning */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Account Access</div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>Where your accounts live and how to reach them</div>
          </div>
          <button onClick={() => setAddingAcct((v) => !v)} style={{ fontSize: "11px", color: "var(--brand-blue)", background: "none", border: "none", cursor: "pointer" }}>
            {addingAcct ? "Cancel" : "+ Add"}
          </button>
        </div>

        {/* Security notice */}
        <div style={{ margin: "12px 18px 0", padding: "9px 12px", borderRadius: "8px", background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.22)", display: "flex", alignItems: "flex-start", gap: "8px" }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: "1px" }}>
            <path d="M8 1.5L1.5 13h13L8 1.5z" stroke="rgba(245,158,11,0.9)" strokeWidth="1.4" strokeLinejoin="round"/>
            <path d="M8 6v4M8 11.5v.5" stroke="rgba(245,158,11,0.9)" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <span style={{ fontSize: "11px", color: "oklch(0.78 0.12 80)", lineHeight: 1.55 }}>
            <strong>Do not enter passwords, PINs, or login credentials here.</strong> Record institution names, account types, and customer service numbers only — enough for your family to locate accounts, not to access them.
          </span>
        </div>

        {addingAcct && (
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "8px" }}>
              <div>
                <div style={labelStyle}>Institution</div>
                <input value={newAcct.institution} onChange={(e) => setNewAcct((a) => ({ ...a, institution: e.target.value }))} placeholder="e.g. Fidelity, Chase, Coinbase" style={inputStyle} />
              </div>
              <div>
                <div style={labelStyle}>Account type</div>
                <select value={newAcct.account_type} onChange={(e) => setNewAcct((a) => ({ ...a, account_type: e.target.value }))} style={inputStyle}>
                  {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div>
                <div style={labelStyle}>Customer service number</div>
                <input value={newAcct.contact} onChange={(e) => setNewAcct((a) => ({ ...a, contact: e.target.value }))} placeholder="e.g. 800-555-0100" style={inputStyle} />
              </div>
              <div>
                <div style={labelStyle}>Notes</div>
                <input value={newAcct.notes} onChange={(e) => setNewAcct((a) => ({ ...a, notes: e.target.value }))} placeholder="e.g. joint account, in safe deposit box" style={inputStyle} />
              </div>
            </div>
            <button onClick={addAccount} disabled={!newAcct.institution.trim() || acctPending} style={{ alignSelf: "flex-start", padding: "6px 14px", borderRadius: "8px", background: "var(--brand-blue)", color: "#fff", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
              {acctPending ? "Saving…" : "Add Account"}
            </button>
          </div>
        )}

        {accounts.length === 0 && !addingAcct ? (
          <div style={{ padding: "30px 18px", textAlign: "center" }}>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px" }}>No accounts recorded yet.</div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", maxWidth: "300px", margin: "0 auto", lineHeight: 1.6 }}>
              Record where each account lives so your family can find everything quickly.
            </div>
          </div>
        ) : (
          <div style={{ padding: "6px 0" }}>
            {accounts.map((a) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 18px", borderBottom: "1px solid var(--border-subtle)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>{isPrivate ? "••••••" : a.institution}</div>
                    <div style={{ fontSize: "10px", padding: "1px 7px", borderRadius: "4px", background: "var(--bg-elevated)", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>{a.account_type}</div>
                  </div>
                  {(a.contact || a.notes) && (
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                      {isPrivate ? "••••••" : [a.contact, a.notes].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
                <button onClick={() => removeAccount(a.id)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "14px", padding: "2px 6px" }}><span aria-hidden="true">×</span><span className="bt-sr-only">Remove</span></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Family Instructions */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: editingInstr ? "1px solid var(--border-subtle)" : "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Family Instructions</div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>What your family needs to know if something happens to you</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {instrMsg && <span style={{ fontSize: "11px", color: "var(--green)" }}>{instrMsg}</span>}
            <button onClick={() => { setEditingInstr((v) => !v); if (!editingInstr) setInstrValue(estateProfile?.family_instructions ?? ""); }} style={{ fontSize: "11px", color: "var(--brand-blue)", background: "none", border: "none", cursor: "pointer" }}>
              {editingInstr ? "Cancel" : (estateProfile?.family_instructions ? "Edit" : "Add")}
            </button>
          </div>
        </div>

        {editingInstr ? (
          <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.6 }}>
              Consider covering: location of important documents, contact your attorney and executor first, passwords in [location], final wishes, and anything else your family needs to navigate without you.
            </div>
            <textarea
              value={instrValue}
              onChange={(e) => setInstrValue(e.target.value)}
              rows={8}
              placeholder="Write freely — this is for your family, not a legal document. Where are your will and trust documents? Who should they call first? Where is the safe deposit box key? What accounts need immediate attention?"
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button onClick={saveInstructions} disabled={instrPending} style={{ padding: "7px 16px", borderRadius: "8px", background: "var(--brand-blue)", color: "#fff", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                {instrPending ? "Saving…" : "Save Instructions"}
              </button>
            </div>
          </div>
        ) : estateProfile?.family_instructions ? (
          <div style={{ padding: "14px 18px" }}>
            <div style={{ fontSize: "13px", color: "var(--text-primary)", lineHeight: 1.75, whiteSpace: "pre-wrap" }}>
              {isPrivate ? "••••••••••••" : estateProfile.family_instructions}
            </div>
          </div>
        ) : (
          <div style={{ padding: "24px 18px", textAlign: "center" }}>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px" }}>No instructions written yet.</div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", maxWidth: "340px", margin: "0 auto", lineHeight: 1.6 }}>
              Leave a plain-language guide for the people who will need to act on your behalf. The clearer this is, the easier you make an already difficult time.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default EstatePlanningTab;
