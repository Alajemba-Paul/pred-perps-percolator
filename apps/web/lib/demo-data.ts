import { toMarket, type ApiMarket, type Market } from "./markets";
import type { ApiPortfolio } from "./api";

const closeInDays = (days: number) => String(Math.floor(Date.now() / 1000) + days * 86400);

export const DEMO_API_MARKETS: ApiMarket[] = [
  {
    address: "sol-250-friday",
    providerMarketId: "demo-sol-250",
    title: "Will SOL trade above $250 by Friday?",
    rules: "Resolves YES if SOL/USD prints above 250 before Friday 23:59 UTC.",
    slot: 1,
    assetIndex: 0,
    marketId: "1",
    status: 1,
    markE6: "634000",
    indexE6: "618000",
    closeTime: closeInDays(4),
    oracleUpdatedAt: new Date().toISOString(),
  },
  {
    address: "btc-100k-q4",
    providerMarketId: "demo-btc-100k",
    title: "Will BTC close above $100k this quarter?",
    rules: "Resolves from the official CME BTC quarter-end print.",
    slot: 2,
    assetIndex: 1,
    marketId: "2",
    status: 1,
    markE6: "412000",
    indexE6: "398000",
    closeTime: closeInDays(21),
    oracleUpdatedAt: new Date().toISOString(),
  },
  {
    address: "fed-cut-next",
    providerMarketId: "demo-fed-cut",
    title: "Will the Fed cut rates at the next meeting?",
    rules: "Resolves YES on a 25bps or larger cut at the next FOMC.",
    slot: 3,
    assetIndex: 2,
    marketId: "3",
    status: 1,
    markE6: "271000",
    indexE6: "264000",
    closeTime: closeInDays(12),
    oracleUpdatedAt: new Date().toISOString(),
  },
];

export const DEMO_MARKETS: Market[] = DEMO_API_MARKETS.map((market) => ({
  ...toMarket(market),
  category: market.address.includes("fed") ? "POLITICS" : "CRYPTO",
  provider: "Demo / Devnet",
  change: market.address === "sol-250-friday" ? 8.2 : market.address === "btc-100k-q4" ? 3.1 : -1.4,
  volume: market.address === "sol-250-friday" ? "$842K" : market.address === "btc-100k-q4" ? "$510K" : "$188K",
  oi: market.address === "sol-250-friday" ? "$2.1M" : market.address === "btc-100k-q4" ? "$1.4M" : "$420K",
}));

export const DEMO_PORTFOLIO: ApiPortfolio = {
  address: "DemoPortfolio111111111111111111111111111",
  owner: "DemoTrader11111111111111111111111111111",
  slot: 184221,
  capital: "2500000000",
  pnl: "18420000",
  health: {
    valid: true,
    equity: "2518420000",
    initialRequirement: "420000000",
    maintenanceRequirement: "210000000",
    liquidationDeficit: "0",
    worstCaseLoss: "88000000",
  },
  positions: [
    {
      slot: 0,
      assetIndex: 0,
      marketId: "1",
      side: "long",
      sizeQ: "1500000",
      entryNotional: "945000000",
      stale: false,
    },
  ],
};
