import { getMarkets } from "@/lib/api";
import { SiteHeader } from "@/components/site-header";
import { MarketTable } from "@/components/market-table";
import { ShieldCheck, Activity } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MarketsPage() {
  const markets = await getMarkets();

  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="content-surface">
        <header className="page-header" style={{ marginBottom: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#c7ff4a", background: "rgba(199,255,74,0.1)", padding: "2px 8px", borderRadius: "4px" }}>
              Solana Devnet
            </span>
            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>
              Percolator Engine v16
            </span>
          </div>
          <h1 style={{ fontSize: "28px", fontWeight: 700, margin: "0 0 8px" }}>
            Live Prediction Markets
          </h1>
          <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.7)", margin: 0, maxWidth: "640px", lineHeight: 1.5 }}>
            Real event contracts imported from Jupiter and settled on-chain via Percolator. Trade YES or NO outcomes with isolated 1× leverage using test USDC.
          </p>
        </header>

        <MarketTable markets={markets} />

        <footer style={{ marginTop: "40px", paddingTop: "20px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>
          <span>Solana Devnet only • No real funds at risk • Cluster verified</span>
          <span>100% Initial Margin (1× Isolated Solvency)</span>
        </footer>
      </main>
    </div>
  );
}
