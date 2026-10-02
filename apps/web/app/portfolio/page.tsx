import { AppShell } from "@/components/app-shell";
import { PortfolioView } from "@/components/portfolio-view";
import { getMarkets } from "@/lib/api";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Portfolio | Moxie",
  description: "View your balances, trading account, and open positions on Solana Devnet.",
};

export default async function PortfolioPage() {
  const markets = await getMarkets();

  return (
    <AppShell>
      <div className="content-surface" style={{ maxWidth: "1000px", margin: "0 auto", padding: "32px 24px" }}>
        <header style={{ marginBottom: "28px" }}>
          <h1 style={{ fontSize: "28px", fontWeight: 700, margin: "0 0 8px", color: "#fff" }}>
            Your Portfolio
          </h1>
          <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.7)", margin: 0 }}>
            Manage your devnet balances, create your trading account, and track your active positions.
          </p>
        </header>

        <PortfolioView markets={markets} />
      </div>
    </AppShell>
  );
}
