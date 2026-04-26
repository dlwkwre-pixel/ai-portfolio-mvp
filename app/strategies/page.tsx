import Link from "next/link";

export default function LandingPage() {
  return (
    <html lang="en" style={{ background: "#07090f" }}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0, padding: 0, background: "#07090f", color: "#e2e8f0", fontFamily: "'DM Sans', sans-serif", overflowX: "hidden" }}>
        <style>{`
          *, *::before, *::after { box-sizing: border-box; }

          /* Animations */
          @keyframes fadeUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-8px); } }
          @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
          @keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
          @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
          @keyframes glow-pulse { 0%, 100% { box-shadow: 0 0 20px rgba(37,99,235,0.3); } 50% { box-shadow: 0 0 40px rgba(37,99,235,0.6); } }

          .fade-up { animation: fadeUp 0.7s ease forwards; }
          .fade-up-1 { animation: fadeUp 0.7s 0.1s ease both; }
          .fade-up-2 { animation: fadeUp 0.7s 0.2s ease both; }
          .fade-up-3 { animation: fadeUp 0.7s 0.3s ease both; }
          .fade-up-4 { animation: fadeUp 0.7s 0.4s ease both; }
          .float { animation: float 4s ease-in-out infinite; }

          /* Gradient text */
          .grad-text {
            background: linear-gradient(135deg, #ffffff 0%, #93c5fd 50%, #a78bfa 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }

          .shimmer-text {
            background: linear-gradient(90deg, #ffffff 0%, #93c5fd 25%, #a78bfa 50%, #93c5fd 75%, #ffffff 100%);
            background-size: 200% auto;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            animation: shimmer 4s linear infinite;
          }

          /* Nav */
          nav {
            position: fixed; top: 0; left: 0; right: 0; z-index: 100;
            padding: 16px 40px;
            display: flex; align-items: center; justify-content: space-between;
            background: rgba(7,9,15,0.8); backdrop-filter: blur(16px);
            border-bottom: 1px solid rgba(255,255,255,0.06);
          }

          .nav-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; }
          .nav-logo-mark {
            width: 32px; height: 32px;
            background: linear-gradient(135deg, #2563eb, #7c3aed);
            border-radius: 9px;
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 4px 16px rgba(37,99,235,0.4);
          }
          .nav-logo-text {
            font-family: 'Syne', sans-serif;
            font-weight: 700; font-size: 16px; color: #fff; letter-spacing: -0.3px;
          }
          .nav-logo-text span { color: #7c3aed; }

          .nav-links { display: flex; align-items: center; gap: 32px; }
          .nav-links a { font-size: 13px; color: #64748b; text-decoration: none; transition: color 0.15s; }
          .nav-links a:hover { color: #e2e8f0; }

          .nav-cta {
            display: flex; align-items: center; gap: 10px;
          }
          .btn-nav-ghost {
            padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 500;
            color: #94a3b8; background: transparent;
            border: 1px solid rgba(255,255,255,0.1);
            text-decoration: none; transition: all 0.15s; cursor: pointer;
          }
          .btn-nav-ghost:hover { color: #fff; border-color: rgba(255,255,255,0.2); }
          .btn-nav-primary {
            padding: 8px 18px; border-radius: 8px; font-size: 13px; font-weight: 600;
            color: #fff; background: linear-gradient(135deg, #2563eb, #7c3aed);
            border: none; text-decoration: none;
            box-shadow: 0 4px 16px rgba(37,99,235,0.3);
            transition: all 0.2s; cursor: pointer;
          }
          .btn-nav-primary:hover { box-shadow: 0 6px 24px rgba(37,99,235,0.5); transform: translateY(-1px); }

          /* Hero */
          .hero {
            min-height: 100vh; display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            text-align: center; padding: 120px 24px 80px;
            position: relative;
          }

          .hero-glow {
            position: absolute; inset: 0; pointer-events: none;
            background: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(37,99,235,0.12) 0%, transparent 60%),
                        radial-gradient(ellipse 40% 40% at 80% 20%, rgba(124,58,237,0.08) 0%, transparent 50%);
          }

          .hero-badge {
            display: inline-flex; align-items: center; gap: 7px;
            padding: 6px 14px; border-radius: 99px;
            border: 1px solid rgba(167,139,250,0.25);
            background: rgba(124,58,237,0.08);
            font-size: 12px; color: #a78bfa; font-weight: 500;
            margin-bottom: 28px;
          }

          .hero-badge-dot {
            width: 6px; height: 6px; border-radius: 50%;
            background: #a78bfa;
            animation: pulse-dot 2s ease infinite;
          }

          h1.hero-title {
            font-family: 'Syne', sans-serif;
            font-size: clamp(42px, 7vw, 80px);
            font-weight: 800;
            line-height: 1.05;
            letter-spacing: -2px;
            color: #fff;
            margin: 0 0 24px;
            max-width: 900px;
          }

          .hero-sub {
            font-size: clamp(16px, 2vw, 20px);
            color: #64748b;
            line-height: 1.7;
            max-width: 560px;
            margin: 0 auto 40px;
          }

          .hero-actions {
            display: flex; align-items: center; gap: 12px;
            flex-wrap: wrap; justify-content: center;
            margin-bottom: 64px;
          }

          .btn-primary-lg {
            padding: 14px 28px; border-radius: 12px;
            font-size: 15px; font-weight: 600; color: #fff;
            background: linear-gradient(135deg, #2563eb, #7c3aed);
            border: none; text-decoration: none; cursor: pointer;
            box-shadow: 0 8px 32px rgba(37,99,235,0.4);
            transition: all 0.2s;
            display: flex; align-items: center; gap: 8px;
          }
          .btn-primary-lg:hover { box-shadow: 0 12px 40px rgba(37,99,235,0.6); transform: translateY(-2px); }

          .btn-ghost-lg {
            padding: 14px 28px; border-radius: 12px;
            font-size: 15px; font-weight: 500; color: #94a3b8;
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.1);
            text-decoration: none; cursor: pointer;
            transition: all 0.15s;
          }
          .btn-ghost-lg:hover { color: #fff; border-color: rgba(255,255,255,0.2); background: rgba(255,255,255,0.07); }

          /* Dashboard preview */
          .dashboard-preview {
            position: relative; max-width: 960px; width: 100%;
            margin: 0 auto;
          }

          .preview-glow {
            position: absolute; inset: -40px;
            background: radial-gradient(ellipse 80% 60% at 50% 50%, rgba(37,99,235,0.15), transparent 70%);
            pointer-events: none;
          }

          .preview-window {
            border-radius: 16px;
            border: 1px solid rgba(255,255,255,0.1);
            background: #0a0d15;
            overflow: hidden;
            box-shadow: 0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05);
            position: relative; z-index: 1;
          }

          .preview-topbar {
            padding: 12px 20px;
            border-bottom: 1px solid rgba(255,255,255,0.06);
            display: flex; align-items: center; gap: 8px;
          }

          .preview-dot { width: 10px; height: 10px; border-radius: 50%; }

          .preview-body {
            display: flex; height: 340px;
          }

          .preview-sidebar {
            width: 180px; min-width: 180px;
            border-right: 1px solid rgba(255,255,255,0.05);
            padding: 16px 12px;
          }

          .preview-nav-item {
            display: flex; align-items: center; gap: 8px;
            padding: 7px 10px; border-radius: 7px;
            font-size: 12px; margin-bottom: 3px;
          }
          .preview-nav-item.active { background: rgba(37,99,235,0.12); color: #93c5fd; }
          .preview-nav-item:not(.active) { color: #475569; }

          .preview-main { flex: 1; padding: 16px 20px; overflow: hidden; }

          .preview-chart-area {
            background: rgba(255,255,255,0.03);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 10px;
            padding: 14px 16px;
            height: 160px;
            margin-bottom: 12px;
            position: relative;
            overflow: hidden;
          }

          .preview-chart-label {
            font-size: 9px; letter-spacing: 0.08em;
            text-transform: uppercase; color: #475569; margin-bottom: 4px;
          }

          .preview-chart-value {
            font-family: 'DM Mono', monospace;
            font-size: 22px; font-weight: 500; color: #fff; letter-spacing: -0.5px;
          }

          .preview-chart-change {
            font-family: 'DM Mono', monospace;
            font-size: 12px; color: #00d395; margin-top: 2px;
          }

          .preview-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

          .preview-card {
            background: rgba(255,255,255,0.025);
            border: 1px solid rgba(255,255,255,0.05);
            border-radius: 8px; padding: 10px 12px;
          }

          .preview-card-label { font-size: 9px; color: #334155; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 4px; }
          .preview-card-value { font-family: 'DM Mono', monospace; font-size: 13px; color: #e2e8f0; }

          /* Ticker bar */
          .ticker-bar {
            overflow: hidden; border-top: 1px solid rgba(255,255,255,0.05);
            border-bottom: 1px solid rgba(255,255,255,0.05);
            padding: 10px 0; background: rgba(255,255,255,0.01);
          }

          .ticker-track {
            display: flex; gap: 40px; width: max-content;
            animation: ticker 30s linear infinite;
            font-family: 'DM Mono', monospace; font-size: 12px;
          }

          .ticker-item { display: flex; align-items: center; gap: 8px; white-space: nowrap; color: #475569; }
          .ticker-item .up { color: #00d395; }
          .ticker-item .down { color: #ff5c5c; }

          /* Features section */
          .section { padding: 100px 40px; max-width: 1100px; margin: 0 auto; }

          .section-label {
            font-size: 11px; font-weight: 600; letter-spacing: 0.1em;
            text-transform: uppercase; color: #2563eb;
            margin-bottom: 16px;
          }

          .section-title {
            font-family: 'Syne', sans-serif;
            font-size: clamp(28px, 4vw, 44px); font-weight: 700;
            letter-spacing: -1px; color: #fff; margin: 0 0 16px;
            line-height: 1.15;
          }

          .section-sub {
            font-size: 16px; color: #64748b; line-height: 1.7;
            max-width: 520px; margin: 0 0 56px;
          }

          /* How it works */
          .steps { display: grid; grid-template-columns: repeat(3,1fr); gap: 24px; }

          .step {
            background: rgba(255,255,255,0.02);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 16px; padding: 28px;
            position: relative; overflow: hidden;
            transition: border-color 0.2s;
          }
          .step:hover { border-color: rgba(37,99,235,0.25); }

          .step-num {
            font-family: 'DM Mono', monospace;
            font-size: 11px; font-weight: 500; letter-spacing: 0.05em;
            color: #334155; margin-bottom: 20px;
          }

          .step-icon {
            width: 44px; height: 44px; border-radius: 12px;
            display: flex; align-items: center; justify-content: center;
            margin-bottom: 16px;
          }

          .step-title {
            font-family: 'Syne', sans-serif;
            font-size: 17px; font-weight: 600; color: #e2e8f0;
            margin: 0 0 8px;
          }

          .step-desc { font-size: 13px; color: #64748b; line-height: 1.6; margin: 0; }

          /* Feature cards */
          .features-grid {
            display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
          }

          .feature-card {
            background: rgba(255,255,255,0.02);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 16px; padding: 24px;
            transition: all 0.2s;
          }
          .feature-card:hover {
            background: rgba(255,255,255,0.035);
            border-color: rgba(255,255,255,0.1);
            transform: translateY(-2px);
          }

          .feature-icon {
            width: 40px; height: 40px; border-radius: 10px;
            display: flex; align-items: center; justify-content: center;
            margin-bottom: 14px;
          }

          .feature-title { font-family: 'Syne', sans-serif; font-size: 15px; font-weight: 600; color: #e2e8f0; margin: 0 0 8px; }
          .feature-desc { font-size: 13px; color: #64748b; line-height: 1.6; margin: 0; }

          /* Vs section */
          .vs-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; max-width: 700px; }

          .vs-card {
            border-radius: 16px; padding: 24px 28px;
          }

          .vs-card.bad { background: rgba(255,92,92,0.05); border: 1px solid rgba(255,92,92,0.12); }
          .vs-card.good { background: rgba(37,99,235,0.06); border: 1px solid rgba(37,99,235,0.15); }

          .vs-title {
            font-family: 'Syne', sans-serif;
            font-size: 14px; font-weight: 600; margin: 0 0 14px;
          }
          .vs-card.bad .vs-title { color: #ff5c5c; }
          .vs-card.good .vs-title { color: #93c5fd; }

          .vs-item {
            display: flex; align-items: flex-start; gap: 8px;
            font-size: 12px; color: #64748b; margin-bottom: 8px; line-height: 1.5;
          }
          .vs-item-icon { flex-shrink: 0; margin-top: 1px; }

          /* CTA section */
          .cta-section {
            padding: 100px 40px; text-align: center;
            position: relative;
          }

          .cta-glow {
            position: absolute; inset: 0; pointer-events: none;
            background: radial-gradient(ellipse 60% 50% at 50% 50%, rgba(37,99,235,0.1), transparent 70%);
          }

          .cta-box {
            max-width: 640px; margin: 0 auto; position: relative; z-index: 1;
            background: rgba(255,255,255,0.025);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 24px; padding: 56px 48px;
          }

          .cta-title {
            font-family: 'Syne', sans-serif;
            font-size: clamp(28px, 4vw, 40px); font-weight: 800;
            letter-spacing: -1px; color: #fff; margin: 0 0 14px; line-height: 1.15;
          }

          .cta-sub { font-size: 15px; color: #64748b; margin: 0 0 32px; line-height: 1.6; }

          /* Footer */
          footer {
            padding: 32px 40px;
            border-top: 1px solid rgba(255,255,255,0.06);
            display: flex; align-items: center; justify-content: space-between;
            font-size: 12px; color: #334155;
          }
        `}</style>

        {/* Nav */}
        <nav>
          <a href="/" className="nav-logo">
            <div className="nav-logo-mark">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <path d="M4 16c2.5-3 4.5-4 7-4 2 0 3.5 1 5 3 1.5-4 3-7 4-8" />
                <circle cx="5" cy="16" r="1.2" fill="white" stroke="none" />
                <circle cx="11" cy="12" r="1.2" fill="white" stroke="none" />
                <circle cx="16" cy="15" r="1.2" fill="white" stroke="none" />
                <circle cx="20" cy="7" r="1.2" fill="white" stroke="none" />
              </svg>
            </div>
            <span className="nav-logo-text">Buy<span>Tune</span>.io</span>
          </a>

          <div className="nav-links">
            <a href="#how-it-works">How it works</a>
            <a href="#features">Features</a>
            <a href="#why-buytune">Why BuyTune</a>
          </div>

          <div className="nav-cta">
            <Link href="/login" className="btn-nav-ghost">Sign in</Link>
            <Link href="/signup" className="btn-nav-primary">Get started free</Link>
          </div>
        </nav>

        {/* Hero */}
        <section className="hero">
          <div className="hero-glow" />

          <div className="hero-badge fade-up">
            <div className="hero-badge-dot" />
            AI-powered portfolio analysis
          </div>

          <h1 className="hero-title fade-up-1">
            Your own{" "}
            <span className="grad-text">financial advisor.</span>
            <br />Without the fees.
          </h1>

          <p className="hero-sub fade-up-2">
            BuyTune connects institutional-grade AI to your existing brokerage account.
            Live market analysis, personalized strategy, and actionable recommendations —
            all in one place.
          </p>

          <div className="hero-actions fade-up-3">
            <Link href="/signup" className="btn-primary-lg">
              Start for free
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
              </svg>
            </Link>
            <a href="#how-it-works" className="btn-ghost-lg">See how it works</a>
          </div>

          {/* Dashboard preview */}
          <div className="dashboard-preview fade-up-4">
            <div className="preview-glow" />
            <div className="preview-window">
              <div className="preview-topbar">
                <div className="preview-dot" style={{ background: "#ff5f57" }} />
                <div className="preview-dot" style={{ background: "#febc2e" }} />
                <div className="preview-dot" style={{ background: "#28c840" }} />
                <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
                  <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: "6px", padding: "3px 16px", fontSize: "11px", color: "#475569" }}>
                    buytuneio.vercel.app/portfolios
                  </div>
                </div>
              </div>

              <div className="preview-body">
                {/* Sidebar */}
                <div className="preview-sidebar">
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ fontSize: "9px", color: "#334155", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Total Portfolio</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "18px", fontWeight: 500, color: "#fff" }}>$12,847.32</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#00d395", marginTop: "2px" }}>▲ +14.2%</div>
                  </div>
                  {[
                    { label: "Dashboard", active: false },
                    { label: "Portfolios", active: true },
                    { label: "Strategies", active: false },
                    { label: "Learn", active: false },
                  ].map((item) => (
                    <div key={item.label} className={`preview-nav-item ${item.active ? "active" : ""}`}>
                      <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: item.active ? "#93c5fd" : "#334155" }} />
                      {item.label}
                    </div>
                  ))}
                </div>

                {/* Main */}
                <div className="preview-main">
                  <div className="preview-chart-area">
                    <div className="preview-chart-label">Investment Return</div>
                    <div className="preview-chart-value">+14.2%</div>
                    <div className="preview-chart-change">▲ +$1,642 · Deposits excluded</div>
                    {/* Mini chart SVG */}
                    <svg style={{ position: "absolute", bottom: 0, left: 0, right: 0, width: "100%", height: "70px" }} viewBox="0 0 400 70" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="previewGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#00d395" stopOpacity="0.2" />
                          <stop offset="100%" stopColor="#00d395" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path d="M0,60 C30,55 60,45 100,38 C140,31 170,22 220,18 C270,14 310,12 360,8 L400,6 L400,70 L0,70 Z" fill="url(#previewGrad)" />
                      <path d="M0,60 C30,55 60,45 100,38 C140,31 170,22 220,18 C270,14 310,12 360,8 L400,6" fill="none" stroke="#00d395" strokeWidth="2" />
                    </svg>
                  </div>

                  <div className="preview-grid">
                    <div className="preview-card">
                      <div className="preview-card-label">AI Insight</div>
                      <div style={{ fontSize: "11px", color: "#a78bfa", lineHeight: 1.5 }}>Trim NFLX — concentration at 24%</div>
                    </div>
                    <div className="preview-card">
                      <div className="preview-card-label">vs SPY</div>
                      <div className="preview-card-value" style={{ color: "#00d395" }}>+11.8% excess</div>
                    </div>
                    <div className="preview-card">
                      <div className="preview-card-label">Positions</div>
                      <div className="preview-card-value">14</div>
                    </div>
                    <div className="preview-card">
                      <div className="preview-card-label">AI Pending</div>
                      <div className="preview-card-value" style={{ color: "#a78bfa" }}>5 recs</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Ticker */}
        <div className="ticker-bar">
          <div className="ticker-track">
            {[
              { t: "NVDA", v: "+2.4%", up: true }, { t: "AAPL", v: "-0.8%", up: false },
              { t: "MSFT", v: "+1.2%", up: true }, { t: "TSLA", v: "+5.1%", up: true },
              { t: "SPY", v: "+0.4%", up: true }, { t: "AMZN", v: "-1.3%", up: false },
              { t: "GOOGL", v: "+0.9%", up: true }, { t: "META", v: "+3.2%", up: true },
              { t: "NFLX", v: "-0.5%", up: false }, { t: "AMD", v: "+4.1%", up: true },
              { t: "QQQ", v: "+0.7%", up: true }, { t: "AVGO", v: "+1.8%", up: true },
              { t: "NVDA", v: "+2.4%", up: true }, { t: "AAPL", v: "-0.8%", up: false },
              { t: "MSFT", v: "+1.2%", up: true }, { t: "TSLA", v: "+5.1%", up: true },
              { t: "SPY", v: "+0.4%", up: true }, { t: "AMZN", v: "-1.3%", up: false },
              { t: "GOOGL", v: "+0.9%", up: true }, { t: "META", v: "+3.2%", up: true },
            ].map((item, i) => (
              <div key={i} className="ticker-item">
                <span style={{ color: "#64748b" }}>{item.t}</span>
                <span className={item.up ? "up" : "down"}>{item.v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* How it works */}
        <section className="section" id="how-it-works">
          <div className="section-label">How it works</div>
          <h2 className="section-title">Three steps to smarter investing</h2>
          <p className="section-sub">
            BuyTune sits between you and your brokerage — you stay in control, the AI does the heavy lifting.
          </p>

          <div className="steps">
            {[
              {
                num: "01",
                title: "Add your portfolio",
                desc: "Enter your existing holdings and cash balance. BuyTune tracks performance, calculates real returns, and monitors every position.",
                color: "#2563eb",
                bg: "rgba(37,99,235,0.1)",
                icon: (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="#2563eb">
                    <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                  </svg>
                ),
              },
              {
                num: "02",
                title: "Set your strategy",
                desc: "Define your investing style — growth, value, income, or anything in between. Use our AI questionnaire or build your own rules.",
                color: "#7c3aed",
                bg: "rgba(124,58,237,0.1)",
                icon: (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="#a78bfa">
                    <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192z" />
                    <path d="M6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.897l-2.051-.684a1 1 0 01-.633-.633L6.95 5.684z" />
                  </svg>
                ),
              },
              {
                num: "03",
                title: "Get AI recommendations",
                desc: "Grok searches live prices, news, and market sentiment — then gives you institutional-quality buy, hold, and sell recommendations.",
                color: "#00d395",
                bg: "rgba(0,211,149,0.1)",
                icon: (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="#00d395">
                    <path fillRule="evenodd" d="M12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z" clipRule="evenodd" />
                  </svg>
                ),
              },
            ].map((step) => (
              <div key={step.num} className="step">
                <div className="step-num">{step.num}</div>
                <div className="step-icon" style={{ background: step.bg }}>
                  {step.icon}
                </div>
                <h3 className="step-title">{step.title}</h3>
                <p className="step-desc">{step.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="section" id="features" style={{ paddingTop: 0 }}>
          <div className="section-label">Features</div>
          <h2 className="section-title">Everything your advisor has.<br />At a fraction of the cost.</h2>
          <p className="section-sub">
            Built for self-directed investors who want data-driven decisions without the noise.
          </p>

          <div className="features-grid">
            {[
              {
                title: "Live AI Analysis",
                desc: "Grok searches real-time market data, earnings news, and X sentiment before every recommendation.",
                icon: "🤖", color: "#a78bfa", bg: "rgba(124,58,237,0.1)",
              },
              {
                title: "True Performance Tracking",
                desc: "Modified Dietz method strips out deposits so you see actual investment returns — not inflated by cash additions.",
                icon: "📈", color: "#00d395", bg: "rgba(0,211,149,0.1)",
              },
              {
                title: "Benchmark Comparison",
                desc: "Compare your portfolio against SPY, QQQ, or any index to see if you're actually beating the market.",
                icon: "⚖️", color: "#38bdf8", bg: "rgba(56,189,248,0.1)",
              },
              {
                title: "Earnings Alerts",
                desc: "Get notified before any of your holdings report earnings so you're never caught off guard.",
                icon: "📅", color: "#f59e0b", bg: "rgba(245,158,11,0.1)",
              },
              {
                title: "Custom Strategies",
                desc: "Define position sizing, sector limits, holding periods, and risk tolerance. The AI follows your rules.",
                icon: "🎯", color: "#2563eb", bg: "rgba(37,99,235,0.1)",
              },
              {
                title: "Portfolio Health Score",
                desc: "Gemini Flash cross-checks every analysis with a 1–100 health score covering concentration, gaps, and strengths.",
                icon: "💡", color: "#a78bfa", bg: "rgba(124,58,237,0.1)",
              },
            ].map((f) => (
              <div key={f.title} className="feature-card">
                <div className="feature-icon" style={{ background: f.bg, fontSize: "20px" }}>
                  {f.icon}
                </div>
                <h3 className="feature-title">{f.title}</h3>
                <p className="feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Why BuyTune */}
        <section className="section" id="why-buytune" style={{ paddingTop: 0 }}>
          <div className="section-label">Why BuyTune</div>
          <h2 className="section-title">The gap between DIY<br />and a financial advisor — closed.</h2>
          <p className="section-sub">
            You have a brokerage account. You have goals. What you're missing is the intelligence layer in between.
          </p>

          <div className="vs-grid">
            <div className="vs-card bad">
              <div className="vs-title">Without BuyTune</div>
              {[
                "Financial advisors charge 1–2% of AUM annually",
                "No live market context when making decisions",
                "Manual tracking across spreadsheets",
                "No benchmark comparison or performance attribution",
                "Generic advice not tied to your strategy",
              ].map((item) => (
                <div key={item} className="vs-item">
                  <span className="vs-item-icon">
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="#ff5c5c"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                  </span>
                  {item}
                </div>
              ))}
            </div>

            <div className="vs-card good">
              <div className="vs-title">With BuyTune</div>
              {[
                "Free to use — you own your brokerage account",
                "Grok searches live data before every recommendation",
                "Automatic daily snapshots and performance tracking",
                "Beat the market? You'll know exactly by how much",
                "AI follows YOUR strategy and position sizing rules",
              ].map((item) => (
                <div key={item} className="vs-item">
                  <span className="vs-item-icon">
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="#00d395"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>
                  </span>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="cta-section">
          <div className="cta-glow" />
          <div className="cta-box">
            <div style={{ fontSize: "32px", marginBottom: "16px" }}>✦</div>
            <h2 className="cta-title">
              Start investing<br />
              <span className="shimmer-text">with an edge.</span>
            </h2>
            <p className="cta-sub">
              Connect your holdings, set your strategy, and let AI do the analysis.
              No subscription. No advisor fees. Just smarter decisions.
            </p>
            <Link href="/signup" className="btn-primary-lg" style={{ display: "inline-flex" }}>
              Create free account
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
              </svg>
            </Link>
            <p style={{ fontSize: "12px", color: "#334155", marginTop: "16px" }}>
              Works with any brokerage · No credit card required
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "20px", height: "20px", background: "linear-gradient(135deg,#2563eb,#7c3aed)", borderRadius: "5px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <path d="M4 16c2.5-3 4.5-4 7-4 2 0 3.5 1 5 3 1.5-4 3-7 4-8" />
              </svg>
            </div>
            <span style={{ color: "#475569", fontSize: "12px" }}>BuyTune.io</span>
          </div>
          <span>© 2026 BuyTune. All rights reserved.</span>
          <div style={{ display: "flex", gap: "20px" }}>
            <a href="#" style={{ color: "#334155", textDecoration: "none" }}>Privacy</a>
            <a href="#" style={{ color: "#334155", textDecoration: "none" }}>Terms</a>
          </div>
        </footer>

      </body>
    </html>
  );
}
