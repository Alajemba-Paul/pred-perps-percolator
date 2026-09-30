import Link from "next/link";
import { getMarkets } from "@/lib/api";
import { SiteHeader } from "@/components/site-header";
import { TechnologyMotionExplainer } from "@/components/technology-motion-explainer";
import {
  ArrowRight,
  ShieldCheck,
  Globe,
  Radio,
  Clock,
  Sparkles,
  Activity,
  CheckCircle2,
} from "lucide-react";
import { DEVNET_DEPLOYMENT } from "@/lib/contracts";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const markets = await getMarkets();
  const primaryMarket = markets.length > 0 ? markets[0] : null;

  return (
    <div className="app-shell">
      <SiteHeader floating />
      <main className="landing-surface">
        {/* ============================================================== */}
        {/* HERO SECTION                                                   */}
        {/* ============================================================== */}
        <section
          style={{
            minHeight: "75vh",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "80px 24px 60px",
            maxWidth: "1100px",
            margin: "0 auto",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "16px", maxWidth: "780px" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(199,255,74,0.1)", border: "1px solid rgba(199,255,74,0.25)", padding: "4px 12px", borderRadius: "100px" }}>
              <Activity size={13} color="#c7ff4a" />
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#c7ff4a" }}>
                Solana Devnet Live Demo
              </span>
              <span style={{ color: "rgba(255,255,255,0.4)" }}>•</span>
              <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.8)" }}>
                Percolator Engine v16
              </span>
            </div>

            <h1
              style={{
                fontSize: "clamp(34px, 5vw, 54px)",
                fontWeight: 800,
                lineHeight: 1.1,
                letterSpacing: "-0.03em",
                margin: 0,
                color: "#fff",
              }}
            >
              Trade Live Jupiter Predictions with 1× Isolated Perp Leverage
            </h1>

            <p
              style={{
                fontSize: "16px",
                lineHeight: 1.6,
                color: "rgba(255,255,255,0.7)",
                margin: 0,
                maxWidth: "640px",
              }}
            >
              Moxie converts real prediction events from Jupiter into binary perpetuals on Solana. Sign trades with test USDC, hold YES or NO positions with 100% solvency backing, and settle deterministically to $1 or $0.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", marginTop: "12px" }}>
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
                  padding: "12px 24px",
                  borderRadius: "6px",
                  textDecoration: "none",
                }}
              >
                <span>Browse Live Markets</span>
                <ArrowRight size={16} />
              </Link>

              <Link
                href={primaryMarket ? `/trade/${primaryMarket.slug || primaryMarket.address}` : `/trade/${DEVNET_DEPLOYMENT.importedRecord}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: "14px",
                  padding: "12px 24px",
                  borderRadius: "6px",
                  textDecoration: "none",
                }}
              >
                <span>Open Trading Terminal</span>
              </Link>
            </div>
          </div>

          {/* Clean Informational Event Preview (Not a fake tradable ticket) */}
          {primaryMarket ? (
            <div
              style={{
                marginTop: "48px",
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "8px",
                padding: "20px 24px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "10px", fontWeight: 700, background: "rgba(199,255,74,0.15)", color: "#c7ff4a", padding: "2px 6px", borderRadius: "3px" }}>
                    FEATURED JUPITER EVENT
                  </span>
                  <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>
                    {primaryMarket.providerMarketId}
                  </span>
                </div>
                <span style={{ fontSize: "12px", color: "#c7ff4a", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <ShieldCheck size={13} /> 1× Isolated Binary Solvency
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
                <div>
                  <h3 style={{ fontSize: "17px", fontWeight: 600, color: "#fff", margin: "0 0 4px" }}>
                    {primaryMarket.title}
                  </h3>
                  <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <Clock size={12} /> Closes: {new Date(primaryMarket.closeTime).toLocaleDateString()}
                  </span>
                </div>

                <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
                  <div>
                    <small style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", display: "block" }}>YES Mark</small>
                    <strong style={{ fontSize: "16px", color: "#c7ff4a" }}>
                      {(primaryMarket.currentPrice * 100).toFixed(1)}¢
                    </strong>
                  </div>

                  <div>
                    <small style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", display: "block" }}>NO Mark</small>
                    <strong style={{ fontSize: "16px", color: "#ff8474" }}>
                      {((1 - primaryMarket.currentPrice) * 100).toFixed(1)}¢
                    </strong>
                  </div>

                  <Link
                    href={`/trade/${primaryMarket.slug || primaryMarket.address}`}
                    style={{
                      padding: "8px 16px",
                      background: "#c7ff4a",
                      color: "#000",
                      fontWeight: 600,
                      fontSize: "12px",
                      borderRadius: "4px",
                      textDecoration: "none",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <span>Trade</span>
                    <ArrowRight size={12} />
                  </Link>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        {/* ============================================================== */}
        {/* HOW MOXIE WORKS (5-BEAT MOTION EXPLAINER)                      */}
        {/* ============================================================== */}
        <section
          style={{
            padding: "60px 24px 80px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            maxWidth: "1100px",
            margin: "0 auto",
          }}
        >
          <header style={{ marginBottom: "36px", textAlign: "center" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#c7ff4a", background: "rgba(199,255,74,0.1)", padding: "3px 10px", borderRadius: "4px" }}>
              The Moxie Architecture
            </span>
            <h2 style={{ fontSize: "28px", fontWeight: 700, color: "#fff", margin: "12px 0 8px" }}>
              How Prediction Perps Work in Plain English
            </h2>
            <p style={{ fontSize: "15px", color: "rgba(255,255,255,0.7)", margin: 0, maxWidth: "600px", marginInline: "auto" }}>
              Follow the 5 simple steps from copying the event on Jupiter to trading with test USDC and final settlement.
            </p>
          </header>

          <TechnologyMotionExplainer />
        </section>

        <footer style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "24px", textAlign: "center", fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>
          Solana Devnet only • Verified on-chain solvency proofs • Cluster EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG
        </footer>
      </main>
    </div>
  );
}
