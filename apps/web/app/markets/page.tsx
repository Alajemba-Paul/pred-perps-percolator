import { getMarkets } from "@/lib/api";
import { SiteHeader } from "@/components/site-header";
import { MarketTable } from "@/components/market-table";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Markets | Moxie",
  description: "Browse live prediction markets. Buy Yes or No with instant settlement on Solana devnet.",
};

export default async function MarketsPage() {
  const markets = await getMarkets();

  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="content-surface" style={{ maxWidth: "1000px", margin: "0 auto", padding: "32px 24px" }}>
        <header style={{ marginBottom: "28px" }}>
          <h1 style={{ fontSize: "28px", fontWeight: 700, margin: "0 0 8px", color: "#fff" }}>
            Prediction Markets
          </h1>
          <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.7)", margin: 0, maxWidth: "640px", lineHeight: 1.5 }}>
            Browse active prediction markets. Buy YES or NO using test USDC with instant settlement on Solana devnet.
          </p>
        </header>

        <MarketTable markets={markets} />
      </main>
    </div>
  );
}
