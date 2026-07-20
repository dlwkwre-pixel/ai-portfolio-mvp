import type { ButtonHTMLAttributes, ReactNode } from "react";

// Shared UI primitives. 771 buttons in the app, 96% bespoke — that's why hover,
// focus, disabled, and touch-target behavior drifts between screens. New code
// uses these; old code migrates whenever a file is touched. All appearance
// comes from globals.css tokens/classes (.bt-btn, .bt-badge), never inline hex.

type ButtonVariant = "primary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

export function Button({
  variant = "ghost",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const variantClass =
    variant === "primary" ? "bt-btn-primary" : variant === "danger" ? "bt-btn-danger" : "bt-btn-ghost";
  return (
    <button
      type="button"
      className={`bt-btn ${variantClass}${size === "sm" ? " bt-btn-sm" : ""}${className ? ` ${className}` : ""}`}
      {...rest}
    >
      {children}
    </button>
  );
}

// Small status/label chip. tone maps to the semantic tokens: up/positive =
// green, down/negative = red, neutral = surface, brand = blue tint.
export function Chip({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: "up" | "down" | "neutral" | "brand";
  children: ReactNode;
  className?: string;
}) {
  const toneStyle: React.CSSProperties =
    tone === "up" ? { background: "var(--green-bg)", color: "var(--green)", borderColor: "var(--green-border)" }
    : tone === "down" ? { background: "var(--red-bg)", color: "var(--red)", borderColor: "var(--red-border)" }
    : tone === "brand" ? { background: "rgba(14,165,160,0.12)", color: "var(--brand-blue)", borderColor: "rgba(14,165,160,0.25)" }
    : { background: "var(--surface-005)", color: "var(--text-secondary)", borderColor: "var(--border-subtle)" };
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: "3px 9px",
        borderRadius: "var(--radius-full)",
        border: "1px solid",
        fontSize: "var(--text-2xs)",
        fontWeight: 600,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        ...toneStyle,
      }}
    >
      {children}
    </span>
  );
}

// Uppercase section eyebrow with optional right-aligned action — the header
// idiom already used across the app, standardized.
export function SectionHeader({
  children,
  action,
  className = "",
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "12px" }}
    >
      <h2 style={{
        fontSize: "var(--text-xs)",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.07em",
        color: "var(--text-tertiary)",
        margin: 0,
      }}>
        {children}
      </h2>
      {action}
    </div>
  );
}
