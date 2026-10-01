import Link from "next/link";
import { getMarkets } from "@/lib/api";
import { SiteHeader } from "@/components/site-header";
import { TechnologyMotionExplainer } from "@/components/technology-motion-explainer";
import {
  ArrowRight,
  ShieldCheck,
  Radio,
  Clock3,
  Braces,
  Activity,
  Terminal as TerminalIcon,
  ChevronDown,
  Layers,
  Sparkles,
} from "lucide-react";
import { DEVNET_DEPLOYMENT } from "@/lib/contracts";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const markets = await getMarkets();
  // Target first active tradable market if available
  const activeMarket = markets.find((m) => m.status === "active" || m.status === 1) || markets[0];
  const activeTradeHref = activeMarket ? `/trade/${activeMarket.slug || activeMarket.address}` : `/trade/${DEVNET_DEPLOYMENT.importedRecord}`;

  return (
    <div className="landing-layout" style={{ minHeight: "100vh", background: "#060809", color: "#f3f5f7" }}>
      <SiteHeader floating />

      <main>
        {/* ============================================================== */}
        {/* 1. HERO SECTION                                                */}
        {/* ============================================================== */}
        <section
          style={{
            minHeight: "75vh",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "120px 24px 60px",
            maxWidth: "1100px",
            margin: "0 auto",
          }}
        >
          <div style={{ maxWidth: "820px" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(199,255,74,0.1)", border: "1px solid rgba(199,255,74,0.25)", padding: "4px 12px", borderRadius: "100px", marginBottom: "20px" }}>
              <Activity size={13} color="#c7ff4a" />
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#c7ff4a" }}>
                Solana Devnet Live
              </span>
              <span style={{ color: "rgba(255,255,255,0.3)" }}>•</span>
              <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)" }}>
                Percolator Engine v16
              </span>
            </div>

            <h1
              style={{
                fontSize: "clamp(38px, 6vw, 64px)",
                fontWeight: 800,
                lineHeight: 1.08,
                letterSpacing: "-0.035em",
                margin: "0 0 20px",
                color: "#fff",
              }}
            >
              Markets have an opinion.<br />
              <span style={{ color: "#c7ff4a" }}>So should the price.</span>
            </h1>

            <p
              style={{
                fontSize: "18px",
                lineHeight: 1.6,
                color: "rgba(255,255,255,0.75)",
                margin: "0 0 32px",
                maxWidth: "640px",
              }}
            >
              Prediction perps on Solana Devnet. Prices quoted in cents (0¢–100¢). External venues anchor the event, and Moxie traders define real-time probability with 1× isolated margin.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "14px" }}>
              <Link
                href="/markets"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "#c7ff4a",
                  color: "#000",
                  fontWeight: 700,
                  fontSize: "14px",
                  padding: "14px 28px",
                  borderRadius: "6px",
                  textDecoration: "none",
                }}
              >
                <span>Browse Live Markets</span>
                <ArrowRight size={16} />
              </Link>

              <Link
                href={activeTradeHref}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: "14px",
                  padding: "14px 24px",
                  borderRadius: "6px",
                  textDecoration: "none",
                }}
              >
                <span>Open Terminal</span>
              </Link>
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* 2. LIVE TICKER STRIP                                           */}
        {/* ============================================================== */}
        <section
          style={{
            borderTop: "1px solid rgba(255,255,255,0.08)",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(0,0,0,0.4)",
            padding: "16px 24px",
          }}
        >
          <div
            style={{
              maxWidth: "1100px",
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#c7ff4a",
                  background: "rgba(199,255,74,0.15)",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  letterSpacing: "0.06em",
                }}
              >
                LIVE ONCHAIN
              </span>
              <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>
                {markets.length} market{markets.length === 1 ? "" : "s"} indexed
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap" }}>
              {markets.slice(0, 3).map((m) => {
                const isTradable = m.status === "active" || m.status === 1;
                return (
                  <Link
                    key={m.address}
                    href={`/trade/${m.slug || m.address}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "10px",
                      textDecoration: "none",
                      color: "#fff",
                      fontSize: "13px",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <span style={{ maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.title}
                    </span>
                    <strong style={{ color: "#c7ff4a" }}>{(m.currentPrice * 100).toFixed(1)}¢</strong>
                    <span style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "2px", background: isTradable ? "rgba(199,255,74,0.1)" : "rgba(255,180,0,0.1)", color: isTradable ? "#c7ff4a" : "#ffb400" }}>
                      {isTradable ? "ACTIVE" : "LOCKED"}
                    </span>
                  </Link>
                );
              })}

              <Link
                href="/markets"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "13px",
                  color: "#c7ff4a",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                <span>All markets</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* 3. THESIS & MECHANISM                                          */}
        {/* ============================================================== */}
        <section
          style={{
            padding: "80px 24px",
            maxWidth: "1100px",
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "40px",
          }}
        >
          <div>
            <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", color: "#c7ff4a", marginBottom: "12px" }}>
              01 / THESIS
            </p>
            <h2 style={{ fontSize: "28px", fontWeight: 700, margin: "0 0 16px", color: "#fff", lineHeight: 1.2 }}>
              Markets have an opinion.<br />
              <span style={{ color: "rgba(255,255,255,0.5)" }}>External venues anchor reality.</span>
            </h2>
            <p style={{ fontSize: "15px", lineHeight: 1.6, color: "rgba(255,255,255,0.7)", margin: 0 }}>
              Prediction market contracts shouldn't require locked-up spot capital for months. Moxie brings continuous perpetual pricing to real events with shared margin accounting.
            </p>
          </div>

          <div>
            <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", color: "#c7ff4a", marginBottom: "12px" }}>
              02 / PRICE FORMATION
            </p>
            <h2 style={{ fontSize: "28px", fontWeight: 700, margin: "0 0 16px", color: "#fff", lineHeight: 1.2 }}>
              One event.<br />
              <span style={{ color: "rgba(255,255,255,0.5)" }}>Three continuous signals.</span>
            </h2>
            <p style={{ fontSize: "15px", lineHeight: 1.6, color: "rgba(255,255,255,0.7)", margin: 0 }}>
              Order flow moves the Moxie perp price. A protected mark price prevents unnecessary liquidations. The external oracle index anchors the contract to deterministic resolution.
            </p>
          </div>
        </section>

        {/* ============================================================== */}
        {/* 4. UNDER THE SURFACE: 5 PLAIN SENTENCES                       */}
        {/* ============================================================== */}
        <section
          style={{
            padding: "80px 24px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            maxWidth: "1100px",
            margin: "0 auto",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: "48px" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", color: "#c7ff4a", marginBottom: "10px" }}>
              03 / TECHNOLOGY
            </p>
            <h2 style={{ fontSize: "32px", fontWeight: 800, color: "#fff", margin: "0 0 12px" }}>
              Built to clear on Solana Devnet.
            </h2>
            <p style={{ fontSize: "15px", color: "rgba(255,255,255,0.65)", margin: 0, maxWidth: "600px", marginInline: "auto" }}>
              Five simple principles explain the Moxie prediction perp engine.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "20px",
            }}
          >
            <article style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "20px" }}>
              <div style={{ color: "#c7ff4a", marginBottom: "12px" }}><Radio size={20} /></div>
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", fontWeight: 700 }}>01</span>
              <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#fff", margin: "6px 0 8px" }}>Provider Index</h3>
              <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.65)", margin: 0, lineHeight: 1.5 }}>
                Real event titles, rules, and outcomes are mirrored directly from Jupiter and Polymarket.
              </p>
            </article>

            <article style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "20px" }}>
              <div style={{ color: "#c7ff4a", marginBottom: "12px" }}><Braces size={20} /></div>
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", fontWeight: 700 }}>02</span>
              <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#fff", margin: "6px 0 8px" }}>Cents Pricing</h3>
              <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.65)", margin: 0, lineHeight: 1.5 }}>
                Binary contracts trade in cents (0¢–100¢) representing real-time probability before resolution.
              </p>
            </article>

            <article style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "20px" }}>
              <div style={{ color: "#c7ff4a", marginBottom: "12px" }}><ShieldCheck size={20} /></div>
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", fontWeight: 700 }}>03</span>
              <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#fff", margin: "6px 0 8px" }}>Percolator PDA</h3>
              <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.65)", margin: 0, lineHeight: 1.5 }}>
                Trader positions live inside an on-chain portfolio account with 100% initial margin (1× isolated).
              </p>
            </article>

            <article style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "20px" }}>
              <div style={{ color: "#c7ff4a", marginBottom: "12px" }}><Layers size={20} /></div>
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", fontWeight: 700 }}>04</span>
              <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#fff", margin: "6px 0 8px" }}>Matcher Cranks</h3>
              <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.65)", margin: 0, lineHeight: 1.5 }}>
                Matcher delegates execute trades via CPI against the market group with zero protocol debt risk.
              </p>
            </article>

            <article style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", padding: "20px" }}>
              <div style={{ color: "#c7ff4a", marginBottom: "12px" }}><Clock3 size={20} /></div>
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", fontWeight: 700 }}>05</span>
              <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#fff", margin: "6px 0 8px" }}>Resolution</h3>
              <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.65)", margin: 0, lineHeight: 1.5 }}>
                When the event finishes, the oracle locks the market to 100¢ or 0¢, paying out directly against the vault.
              </p>
            </article>
          </div>

          {/* Interactive Stepper Motion Explainer */}
          <div style={{ marginTop: "40px" }}>
            <TechnologyMotionExplainer />
          </div>
        </section>

        {/* ============================================================== */}
        {/* 5. COLLAPSED "FOR DEVELOPERS" BLOCK                            */}
        {/* ============================================================== */}
        <section
          style={{
            maxWidth: "1100px",
            margin: "0 auto 60px",
            padding: "0 24px",
          }}
        >
          <details
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "8px",
              padding: "16px 20px",
            }}
          >
            <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "14px", color: "#c7ff4a", display: "flex", alignItems: "center", gap: "8px" }}>
              <TerminalIcon size={14} />
              <span>For Developers: Solana Devnet Program IDs & Keeper Path</span>
            </summary>

            <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "12px", fontSize: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "8px" }}>
                <div style={{ background: "rgba(0,0,0,0.4)", padding: "8px 12px", borderRadius: "4px" }}>
                  <small style={{ color: "rgba(255,255,255,0.5)", display: "block" }}>PERCOLATOR PROGRAM</small>
                  <code style={{ color: "#c7ff4a" }}>{DEVNET_DEPLOYMENT.percolatorProgramId}</code>
                </div>
                <div style={{ background: "rgba(0,0,0,0.4)", padding: "8px 12px", borderRadius: "4px" }}>
                  <small style={{ color: "rgba(255,255,255,0.5)", display: "block" }}>ORACLE PROGRAM</small>
                  <code style={{ color: "#c7ff4a" }}>{DEVNET_DEPLOYMENT.oracleProgramId}</code>
                </div>
                <div style={{ background: "rgba(0,0,0,0.4)", padding: "8px 12px", borderRadius: "4px" }}>
                  <small style={{ color: "rgba(255,255,255,0.5)", display: "block" }}>MATCHER PROGRAM</small>
                  <code style={{ color: "#c7ff4a" }}>{DEVNET_DEPLOYMENT.matcherProgramId}</code>
                </div>
                <div style={{ background: "rgba(0,0,0,0.4)", padding: "8px 12px", borderRadius: "4px" }}>
                  <small style={{ color: "rgba(255,255,255,0.5)", display: "block" }}>MARKET ACCOUNT</small>
                  <code style={{ color: "#c7ff4a" }}>{DEVNET_DEPLOYMENT.marketAccount}</code>
                </div>
                <div style={{ background: "rgba(0,0,0,0.4)", padding: "8px 12px", borderRadius: "4px" }}>
                  <small style={{ color: "rgba(255,255,255,0.5)", display: "block" }}>TEST USDC MINT</small>
                  <code style={{ color: "#c7ff4a" }}>{DEVNET_DEPLOYMENT.usdcMint}</code>
                </div>
              </div>

              <div style={{ background: "rgba(0,0,0,0.4)", padding: "12px", borderRadius: "4px" }}>
                <small style={{ color: "#c7ff4a", display: "block", marginBottom: "4px", fontWeight: 700 }}>
                  KEEPER CLI COMMAND: IMPORT MORE JUPITER MARKETS
                </small>
                <code style={{ color: "rgba(255,255,255,0.8)" }}>
                  pnpm run smoke:jupiter && node scripts/deploy-local.mjs --devnet --live
                </code>
              </div>
            </div>
          </details>
        </section>

        {/* ============================================================== */}
        {/* 6. FOOTER                                                      */}
        {/* ============================================================== */}
        <footer
          style={{
            borderTop: "1px solid rgba(255,255,255,0.06)",
            padding: "28px 24px",
            maxWidth: "1100px",
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            fontSize: "12px",
            color: "rgba(255,255,255,0.4)",
          }}
        >
          <span>© 2026 MOXIE • DEVNET • EXPERIMENTAL</span>
          <div style={{ display: "flex", gap: "16px" }}>
            <Link href="/markets" style={{ color: "rgba(255,255,255,0.6)", textDecoration: "none" }}>Markets</Link>
            <Link href="/trade" style={{ color: "rgba(255,255,255,0.6)", textDecoration: "none" }}>Trade</Link>
            <Link href="/portfolio" style={{ color: "rgba(255,255,255,0.6)", textDecoration: "none" }}>Portfolio</Link>
            <Link href="/technology" style={{ color: "rgba(255,255,255,0.6)", textDecoration: "none" }}>Technology</Link>
            <a href="https://github.com/Alajemba-Paul/pred-perps-percolator" target="_blank" rel="noopener noreferrer" style={{ color: "rgba(255,255,255,0.6)", textDecoration: "none" }}>GitHub</a>
          </div>
        </footer>
      </main>
    </div>
  );
}
