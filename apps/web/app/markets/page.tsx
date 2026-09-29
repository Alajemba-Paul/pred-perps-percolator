import { Search, SlidersHorizontal, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { MarketTable } from "@/components/market-table";
import { getMarkets } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function MarketsPage() {
  const markets = await getMarkets();
  const tradableCount = markets.filter((x) => x.status === 1).length;

  return (
    <AppShell>
      <div className="page-container markets-page">
        <div className="page-title">
          <div>
            <p className="eyebrow">DISCOVER PREDICTION PERPS</p>
            <h1>Prediction Markets</h1>
            <p>Trade the movement in event probability on Solana Devnet with shared collateral.</p>
          </div>
          <div className="market-stats">
            <span><b>{markets.length}</b> INDEXED</span>
            <span><b>{tradableCount}</b> ACTIVE</span>
            <span><b>DEVNET</b> LIVE SOLANA</span>
          </div>
        </div>

        <div className="market-toolbar">
          <label className="search-box">
            <Search size={17} />
            <input type="search" aria-label="Search markets" placeholder="Search markets by title or asset..." />
          </label>
          <div className="filter-tabs">
            <button className="selected" type="button">All Markets</button>
            <button type="button">Sports</button>
            <button type="button">Crypto</button>
            <button type="button">Politics</button>
          </div>
          <button className="filter-button" type="button">
            <SlidersHorizontal size={16} /> Filters
          </button>
        </div>

        {markets.length > 0 ? (
          <MarketTable markets={markets} />
        ) : (
          <div className="empty-activity">
            <div>
              <b>No active markets</b>
              <span>Connecting to the Moxie indexer / Devnet Solana RPC.</span>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
