export const metadata = { title: "AI Disclaimer — BuyTune" };

const EFFECTIVE = "May 26, 2026";

export default function AIDisclaimerPage() {
  return (
    <article>
      <div style={{ marginBottom: "32px" }}>
        <div style={{ fontSize: "10px", fontWeight: 700, color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Legal</div>
        <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: "28px", fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.5px", marginBottom: "8px" }}>AI Disclaimer</h1>
        <p style={{ fontSize: "13px", color: "#475569" }}>Effective date: {EFFECTIVE} &nbsp;·&nbsp; Governing law: Texas, United States</p>
      </div>

      <div style={{ padding: "14px 18px", background: "rgba(124,58,237,0.07)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: "10px", marginBottom: "32px" }}>
        <p style={{ fontSize: "13px", color: "#c4b5fd", lineHeight: 1.7 }}>
          BuyTune uses artificial intelligence to generate analysis, insights, and projections. AI output is for educational and informational purposes only. It is not investment advice. Users remain solely responsible for all financial decisions.
        </p>
      </div>

      <section className="legal-section">
        <h2 className="legal-h2">1. What AI Generates on BuyTune</h2>
        <p className="legal-p">BuyTune uses large language models (currently Google Gemini and xAI Grok) to generate:</p>
        <ul className="legal-ul">
          <li>Portfolio analysis and health scores</li>
          <li>Investment observations and portfolio insights</li>
          <li>Risk assessments and diversification commentary</li>
          <li>Financial planning projections and retirement illustrations</li>
          <li>Cash flow simulations and savings rate analysis</li>
          <li>Strategy suggestions and allocation commentary</li>
          <li>Market context and news summaries</li>
        </ul>
        <p className="legal-p">All AI-generated outputs are clearly labeled within the platform. They are educational illustrations, not professional financial advice.</p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">2. Limitations of AI-Generated Content</h2>
        <p className="legal-p">You acknowledge that AI-generated content on BuyTune:</p>
        <ul className="legal-ul">
          <li><strong>May contain errors</strong> — AI models can produce factually incorrect statements, hallucinate data, or misinterpret portfolio inputs</li>
          <li><strong>May be incomplete</strong> — AI cannot access your full financial picture, tax situation, liabilities, or personal circumstances</li>
          <li><strong>May be outdated</strong> — Market conditions, regulations, and tax laws change faster than AI training data</li>
          <li><strong>Does not predict the future</strong> — Projections are statistical illustrations based on historical data and assumptions, not forecasts</li>
          <li><strong>Does not account for your full situation</strong> — AI has no knowledge of your risk tolerance, time horizon, tax bracket, employment status, family obligations, or other material factors</li>
          <li><strong>Is not a substitute for professional advice</strong> — A licensed financial advisor, CPA, or attorney has legal duties to you; AI does not</li>
        </ul>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">3. How AI Providers Process Your Data</h2>
        <p className="legal-p">When BuyTune generates AI analysis, a summary of your portfolio context (ticker symbols, quantities, allocation percentages) is sent to third-party AI providers via their APIs:</p>
        <ul className="legal-ul">
          <li><strong>Google Gemini</strong> — Used for health scores, financial planning analysis, and strategy generation. <a href="https://policies.google.com/privacy" className="legal-link" target="_blank" rel="noopener noreferrer">Google Privacy Policy</a></li>
          <li><strong>xAI Grok</strong> — Used for portfolio analysis with live web and market context. <a href="https://x.ai/legal/privacy" className="legal-link" target="_blank" rel="noopener noreferrer">xAI Privacy Policy</a></li>
        </ul>
        <p className="legal-p">BuyTune does not send your full name, email address, or account credentials to AI providers. Portfolio data is sent only for the purpose of generating the requested analysis and is not used to train AI models, subject to each provider&apos;s enterprise terms.</p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">4. No Fiduciary Duty</h2>
        <p className="legal-p">AI-generated content on BuyTune does not create a fiduciary, advisory, or agency relationship. BuyTune has no legal duty to act in your financial interest. Nothing in any AI-generated analysis should be construed as a duty of care, loyalty, or best interest on BuyTune&apos;s part.</p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">5. User Responsibility</h2>
        <p className="legal-p">You are solely responsible for:</p>
        <ul className="legal-ul">
          <li>Evaluating the accuracy and appropriateness of any AI-generated content</li>
          <li>All investment and financial decisions you make, regardless of what BuyTune&apos;s AI suggested</li>
          <li>Consulting a licensed professional for decisions involving significant capital, tax implications, or retirement planning</li>
          <li>Understanding that past performance and statistical projections do not guarantee future results</li>
        </ul>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">6. Regulatory Status</h2>
        <p className="legal-p">BuyTune is <strong>not</strong> registered with, nor regulated by:</p>
        <ul className="legal-ul">
          <li>The U.S. Securities and Exchange Commission (SEC) as an investment adviser or broker-dealer</li>
          <li>The Financial Industry Regulatory Authority (FINRA)</li>
          <li>Any state securities regulator as a registered investment adviser</li>
          <li>The Commodity Futures Trading Commission (CFTC)</li>
        </ul>
        <p className="legal-p">AI-generated investment observations on BuyTune are not regulated financial advice under the Investment Advisers Act of 1940 or any applicable state law.</p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">7. Feedback and Errors</h2>
        <p className="legal-p">If you believe BuyTune&apos;s AI has generated inaccurate, misleading, or harmful content, please report it to <strong>support@buytune.io</strong>. We take AI quality seriously and review all reports.</p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">8. Contact</h2>
        <p className="legal-p">Questions about our AI systems: <strong>support@buytune.io</strong></p>
        <p className="legal-p">Legal inquiries: <strong>legal@buytune.io</strong></p>
      </section>
    </article>
  );
}
