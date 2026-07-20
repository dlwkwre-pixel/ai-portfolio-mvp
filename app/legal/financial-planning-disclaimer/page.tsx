export const metadata = { title: "Financial Planning Disclaimer — BuyTune" };

const EFFECTIVE = "May 26, 2026";

export default function FinancialPlanningDisclaimerPage() {
  return (
    <article>
      <div style={{ marginBottom: "32px" }}>
        <div style={{ fontSize: "10px", fontWeight: 700, color: "#0ea5a0", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Legal</div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "28px", fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.5px", marginBottom: "8px" }}>Financial Planning Disclaimer</h1>
        <p style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>Effective date: {EFFECTIVE} &nbsp;·&nbsp; Governing law: Texas, United States</p>
      </div>

      <div style={{ padding: "14px 18px", background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.18)", borderRadius: "10px", marginBottom: "32px" }}>
        <p style={{ fontSize: "13px", color: "#6ee7b7", lineHeight: 1.7 }}>
          BuyTune&apos;s financial planning tools are illustrative calculators, not professional financial plans. All projections are based on user-provided assumptions and simplified models. They are not a substitute for advice from a licensed financial planner or CFP.
        </p>
      </div>

      <section className="legal-section">
        <h2 className="legal-h2">1. Nature of Financial Planning Tools</h2>
        <p className="legal-p">BuyTune provides the following financial planning features:</p>
        <ul className="legal-ul">
          <li>Retirement projection calculators</li>
          <li>Net worth tracking (assets and liabilities)</li>
          <li>Cash flow modeling (income and expenses)</li>
          <li>Savings rate analysis</li>
          <li>Financial health scoring</li>
          <li>Life event planning (home purchase, major expenses)</li>
          <li>AI-generated financial planning commentary</li>
        </ul>
        <p className="legal-p">These tools are <strong>educational calculators</strong>. They are designed to help you understand your financial situation, visualize scenarios, and explore possibilities. They are <strong>not</strong> a comprehensive financial plan prepared by a licensed professional.</p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">2. Projections Are Illustrative Only</h2>
        <p className="legal-p">Retirement projections, net worth forecasts, and savings trajectories displayed on BuyTune are based on:</p>
        <ul className="legal-ul">
          <li>Data you manually enter (may be incomplete or inaccurate)</li>
          <li>User-defined assumptions (expected return, inflation rate, savings rate)</li>
          <li>Simplified mathematical models that do not account for all real-world variables</li>
          <li>Historical averages that may not reflect future conditions</li>
        </ul>
        <p className="legal-p"><strong>Projections are not predictions.</strong> Actual outcomes will differ from illustrated scenarios due to market volatility, unexpected life events, tax changes, inflation, employment changes, and other factors. BuyTune makes no representation that any projection will be achieved.</p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">3. What These Tools Do Not Account For</h2>
        <p className="legal-p">BuyTune&apos;s financial planning tools do not consider:</p>
        <ul className="legal-ul">
          <li><strong>Taxes</strong> — Income tax, capital gains tax, Required Minimum Distributions (RMDs), Roth conversion strategies, or state-specific tax rules</li>
          <li><strong>Social Security</strong> — Estimated benefits, optimal claiming age, or spousal benefit strategies</li>
          <li><strong>Estate planning</strong> — Inheritance, beneficiary designations, trusts, or estate taxes</li>
          <li><strong>Insurance</strong> — Life insurance, disability insurance, long-term care, or health care costs in retirement</li>
          <li><strong>Debt strategy</strong> — Mortgage payoff optimization, student loan repayment, or debt prioritization beyond what you enter</li>
          <li><strong>Pension or defined benefit plans</strong> — Employer pension income or other guaranteed income sources not manually entered</li>
          <li><strong>Behavioral finance</strong> — Your actual behavior during market downturns or major life transitions</li>
        </ul>
        <p className="legal-p">A comprehensive financial plan prepared by a Certified Financial Planner (CFP) would address all of these factors.</p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">4. AI-Generated Financial Planning Commentary</h2>
        <p className="legal-p">Some financial planning features include AI-generated commentary (currently powered by Google Gemini). This commentary:</p>
        <ul className="legal-ul">
          <li>Is generated based on the data you have entered and general financial principles</li>
          <li>May not reflect your complete financial situation</li>
          <li>Is not reviewed by a licensed financial professional before being displayed</li>
          <li>Should be treated as a starting point for your own thinking, not a recommendation to act</li>
        </ul>
        <p className="legal-p">See our <a href="/legal/ai-disclaimer" className="legal-link">AI Disclaimer</a> for more detail on AI limitations.</p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">5. No Fiduciary Relationship</h2>
        <p className="legal-p">BuyTune is not a fiduciary. No financial planning tool, calculation, or AI-generated commentary on BuyTune creates a fiduciary duty, adviser-client relationship, or obligation for BuyTune to act in your financial interest. A licensed financial planner or registered investment adviser has legal duties to you that BuyTune does not.</p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">6. Seek Professional Advice for Major Decisions</h2>
        <p className="legal-p">BuyTune&apos;s tools are most useful for awareness, exploration, and tracking — not for replacing professional advice on major financial decisions. Consider consulting a licensed professional for:</p>
        <ul className="legal-ul">
          <li>Retirement planning decisions, especially within 10 years of your target retirement date</li>
          <li>Decisions involving significant tax consequences</li>
          <li>Estate planning and inheritance matters</li>
          <li>Major investment decisions (large purchases, concentrated positions, illiquid assets)</li>
          <li>Insurance and risk management planning</li>
        </ul>
        <p className="legal-p">NAPFA (napfa.org), CFP Board (cfp.net), and FINRA BrokerCheck are resources for finding licensed financial professionals.</p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">7. Data Accuracy Is Your Responsibility</h2>
        <p className="legal-p">The quality of any financial planning output depends entirely on the accuracy of the data you enter. BuyTune does not verify the accuracy of manually entered assets, liabilities, income, or expense figures. Inaccurate inputs will produce inaccurate outputs. Review your entered data regularly.</p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">8. Limitation of Liability</h2>
        <p className="legal-p">BuyTune and its operators shall not be liable for any financial loss, missed opportunity, or consequential damages arising from your use of or reliance on any financial planning tool, projection, or AI-generated commentary on the platform. See our <a href="/legal/terms" className="legal-link">Terms of Service</a> for the full limitation of liability.</p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">9. Contact</h2>
        <p className="legal-p">Questions about this disclaimer: <strong>legal@buytune.io</strong></p>
      </section>
    </article>
  );
}
