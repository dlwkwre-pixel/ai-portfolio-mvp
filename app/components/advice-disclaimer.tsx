// Point-of-use advice disclaimer — mounted directly beneath AI-generated analysis
// surfaces (recommendations, strategy chat, tax AI, research analysis, Ask Atlas).
// Substance note: this doesn't change what the features are; it makes the app's
// posture explicit where the user is actually reading the output, not just in the
// legal pages. Server-safe (no client hooks).

export default function AdviceDisclaimer({ context = "analysis" }: { context?: "analysis" | "planning" | "tax" }) {
  const tail =
    context === "planning" ? "It is not financial planning advice — consider a licensed professional for decisions."
    : context === "tax" ? "It is not tax advice — consult a tax professional before acting."
    : "It is not investment advice or a recommendation to buy or sell any security.";
  return (
    <p style={{ fontSize: "10.5px", color: "var(--text-muted)", lineHeight: 1.55, margin: "10px 0 0", padding: "0 2px" }}>
      AI-generated educational analysis from your data. BuyTune is a software tool, not a registered
      investment adviser. {tail} You alone are responsible for your decisions.
    </p>
  );
}
