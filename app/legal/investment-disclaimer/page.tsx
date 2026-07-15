export const metadata = { title: "Investment Disclaimer — BuyTune" };

const EFFECTIVE = "May 26, 2026";

export default function InvestmentDisclaimerPage() {
  return (
    <article>
      <div style={{ marginBottom: "32px" }}>
        <div style={{ fontSize: "10px", fontWeight: 700, color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Legal</div>
        <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: "28px", fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.5px", marginBottom: "8px" }}>Investment Disclaimer</h1>
        <p style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>Effective date: {EFFECTIVE} &nbsp;·&nbsp; Governing law: Texas, United States</p>
      </div>

      <div style={{ padding: "14px 18px", background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.18)", borderRadius: "10px", marginBottom: "32px" }}>
        <p style={{ fontSize: "13px", color: "#fca5a5", lineHeight: 1.7 }}>
          <strong>BuyTune is not a registered investment adviser.</strong> Nothing on this platform constitutes investment advice, a recommendation to buy or sell any security, or a solicitation of any investment. All investing involves risk, including the possible loss of principal.
        </p>
      </div>

      <section className="legal-section">
        <h2 className="legal-h2">1. Not Investment Advice</h2>
        <p className="legal-p">All content on BuyTune — including AI-generated analysis, portfolio scores, strategy suggestions, market data, charts, and community posts — is provided for <strong>educational and informational purposes only</strong>. None of it constitutes:</p>
        <ul className="legal-ul">
          <li>Investment advice or recommendations</li>
          <li>A solicitation to buy, sell, or hold any security, ETF, mutual fund, cryptocurrency, or other financial instrument</li>
          <li>Portfolio management or discretionary investment management</li>
          <li>Tax advice or legal advice related to investments</li>
          <li>An offer or solicitation to buy or sell any security in any jurisdiction where such offer is unlawful</li>
        </ul>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">2. No Registration or Licensure</h2>
        <p className="legal-p">BuyTune is not registered as an investment adviser under the U.S. Investment Advisers Act of 1940, is not a registered broker-dealer under the Securities Exchange Act of 1934, and is not a member of FINRA or SIPC. BuyTune does not hold any securities license in any U.S. state or foreign jurisdiction.</p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">3. Past Performance</h2>
        <p className="legal-p">Any historical returns, backtests, performance scenarios, or portfolio projections shown on BuyTune are for illustrative purposes only. <strong>Past performance does not guarantee future results.</strong> The value of investments can decrease as well as increase. You may receive back less than you invest.</p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">4. Investment Risk</h2>
        <p className="legal-p">All investing involves risk. You should be aware of the following risks before making any investment decision:</p>
        <ul className="legal-ul">
          <li><strong>Market risk</strong> — The value of investments fluctuates with market conditions</li>
          <li><strong>Concentration risk</strong> — Portfolios concentrated in a few securities or sectors carry higher volatility</li>
          <li><strong>Liquidity risk</strong> — Some securities may be difficult to sell at a fair price</li>
          <li><strong>Inflation risk</strong> — Returns may not keep pace with inflation</li>
          <li><strong>Currency risk</strong> — International investments are exposed to exchange rate fluctuations</li>
          <li><strong>Company-specific risk</strong> — Individual companies can underperform, restructure, or fail</li>
          <li><strong>Interest rate risk</strong> — Rising rates can reduce the value of fixed-income investments</li>
        </ul>
        <p className="legal-p">BuyTune&apos;s analysis tools are not a substitute for your own due diligence or the guidance of a qualified financial professional.</p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">5. Market Data Accuracy</h2>
        <p className="legal-p">BuyTune displays market data provided by Finnhub and other third-party sources. This data is provided for informational purposes and may be delayed, incomplete, or inaccurate. BuyTune makes no warranty about the accuracy, timeliness, or completeness of any market data displayed on the platform. Do not rely on BuyTune for real-time trading data.</p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">6. Community Content</h2>
        <p className="legal-p">BuyTune&apos;s community features allow users to share portfolio strategies, allocations, and investment ideas. Community content reflects the opinions of individual users, not BuyTune. BuyTune does not review, endorse, or verify the accuracy of user-generated content. Community posts are not investment advice. Always evaluate community strategies in the context of your own financial situation before acting on them.</p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">7. Seek Professional Advice</h2>
        <p className="legal-p">Before making significant investment decisions, consider consulting a licensed financial professional. BuyTune&apos;s AI analysis cannot account for:</p>
        <ul className="legal-ul">
          <li>Your complete financial picture, liabilities, and obligations</li>
          <li>Your tax situation and tax-efficiency strategies</li>
          <li>Your specific risk tolerance and investment time horizon</li>
          <li>Life events that may affect your financial goals</li>
          <li>Estate planning considerations</li>
        </ul>
        <p className="legal-p">A registered investment adviser or certified financial planner has a fiduciary duty to act in your best interest. BuyTune does not.</p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">8. Limitation of Liability</h2>
        <p className="legal-p">BuyTune and its operators shall not be liable for any investment losses, financial damages, or consequential losses arising from your use of or reliance on any content, analysis, or data provided by the platform. See our <a href="/legal/terms" className="legal-link">Terms of Service</a> for the full limitation of liability.</p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">9. Contact</h2>
        <p className="legal-p">Questions about this disclaimer: <strong>legal@buytune.io</strong></p>
      </section>
    </article>
  );
}
