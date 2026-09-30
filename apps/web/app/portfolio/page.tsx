import { AppShell } from "@/components/app-shell";
import { PortfolioView } from "@/components/portfolio-view";
import { getMarkets } from "@/lib/api";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Portfolio | Moxie Prediction Perps",
  description: "View your on-chain Percolator balances, margin solvency, and active positions on Solana Devnet.",
};

export default async function PortfolioPage() {
  const markets = await getMarkets();

  return (
    <AppShell>
      <div className="content-surface" style={{ maxWidth: "1000px", margin: "0 auto", padding: "32px 24px" }}>
        <header style={{ marginBottom: "28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#c7ff4a", background: "rgba(199,255,74,0.1)", padding: "2px 8px", borderRadius: "4px" }}>
              Percolator v16
            </span>
            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>
              Cross-Margin Solvency
            </span>
          </div>
          <h1 style={{ fontSize: "28px", fontWeight: 700, margin: "0 0 8px", color: "#fff" }}>
            Your Trading Portfolio
          </h1>
          <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.7)", margin: 0 }}>
            Tied directly to your connected Solana Devnet wallet. All positions backed by 100% initial margin.
          </p>
        </header>

        <PortfolioView markets={markets} />
      </div>
    </AppShell>
  );
}
