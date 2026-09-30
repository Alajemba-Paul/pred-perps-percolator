import { SiteHeader } from "@/components/site-header";
import { TechnologyMotionExplainer } from "@/components/technology-motion-explainer";

export const metadata = {
  title: "How Moxie Works | Moxie Prediction Perps",
  description: "A simple 5-step walkthrough of how Moxie imports prediction markets and settles them on Solana Devnet.",
};

export default function TechnologyPage() {
  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="content-surface">
        <header className="page-header" style={{ marginBottom: "28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#c7ff4a", background: "rgba(199,255,74,0.1)", padding: "2px 8px", borderRadius: "4px" }}>
              How Moxie Works
            </span>
            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>
              Plain Language Walkthrough
            </span>
          </div>
          <h1 style={{ fontSize: "30px", fontWeight: 700, margin: "0 0 10px" }}>
            From Event Discovery to Final Settlement
          </h1>
          <p style={{ fontSize: "15px", color: "rgba(255,255,255,0.75)", margin: 0, maxWidth: "680px", lineHeight: 1.5 }}>
            Moxie lets you trade prediction outcomes like perpetual contracts with test USDC on Solana Devnet. Here is how the pipeline works from start to finish.
          </p>
        </header>

        <TechnologyMotionExplainer />

        <footer style={{ marginTop: "48px", paddingTop: "20px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>
          <span>Solana Devnet only • Verified on-chain solvency proof</span>
          <span>1× Isolated Binary Perps</span>
        </footer>
      </main>
    </div>
  );
}
