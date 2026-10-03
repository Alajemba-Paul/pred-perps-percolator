export interface MarketCandidate {
  providerMarketId: string;
  providerEventId: string;
  title: string;
  rules: string;
  initialMarkE6: number;
  closeTimeMs: number;
}

export const VERIFIED_CANDIDATE_MARKETS: MarketCandidate[] = [
  {
    providerMarketId: "POLY-601826",
    providerEventId: "POLY-45915",
    title: "Brazil Presidential Election: Flavio Bolsonaro",
    rules: "A presidential election is scheduled to take place in Brazil on October 4, 2026. Resolves to 1 (YES) if Flavio Bolsonaro wins, 0 (NO) otherwise.",
    initialMarkE6: 569500,
    closeTimeMs: 1791172740000, // 2026-10-05T03:59:00Z
  },
  {
    providerMarketId: "POLY-2589812",
    providerEventId: "POLY-606422",
    title: "Fed Interest Rates (Oct 2026): No change",
    rules: "The FED interest rates decision after October 2026 FOMC meeting. Resolves to 1 (YES) if target range is unchanged, 0 (NO) otherwise.",
    initialMarkE6: 825000,
    closeTimeMs: 1793246340000, // 2026-10-29T03:59:00Z
  },
  {
    providerMarketId: "POLY-5170737",
    providerEventId: "POLY-1112205",
    title: "Bitcoin Nov 2026 Target: Drops to $82,500",
    rules: "Resolves to 1 (YES) if any Binance 1-minute candle for BTC/USDT in November 2026 has a Low equal to or lower than $82,500, 0 (NO) otherwise.",
    initialMarkE6: 775000,
    closeTimeMs: 1793505600000, // 2026-11-01T04:00:00Z
  },
  {
    providerMarketId: "POLY-5208385",
    providerEventId: "POLY-1120892",
    title: "Bitcoin Target: Reaches $86,000",
    rules: "Resolves to 1 (YES) if any Binance 1-minute candle for BTC/USDT has a High equal to or greater than $86,000, 0 (NO) otherwise.",
    initialMarkE6: 275000,
    closeTimeMs: 1791172800000, // 2026-10-05T04:00:00Z
  },
  {
    providerMarketId: "POLY-608545",
    providerEventId: "POLY-48361",
    title: "Ballon d'Or 2026 Winner: Lamine Yamal",
    rules: "This market resolves to 1 (YES) if Lamine Yamal wins the 2026 Ballon d'Or according to France Football, 0 (NO) otherwise.",
    initialMarkE6: 494000,
    closeTimeMs: 1798779540000, // 2027-01-01T04:59:00Z
  },
  {
    providerMarketId: "POLY-561974",
    providerEventId: "POLY-41712",
    title: "US 2028 Republican Nominee: J.D. Vance",
    rules: "Resolves to 1 (YES) if J.D. Vance wins and accepts the 2028 Republican nomination for U.S. President, 0 (NO) otherwise.",
    initialMarkE6: 503000,
    closeTimeMs: 1857272340000, // 2028-11-08T04:59:00Z
  },
  {
    providerMarketId: "POLY-679018",
    providerEventId: "POLY-55829",
    title: "French Presidential Election 2027: Marine Le Pen",
    rules: "Resolves to 1 (YES) if Marine Le Pen wins the next French presidential election, 0 (NO) otherwise.",
    initialMarkE6: 457000,
    closeTimeMs: 1808107140000, // 2027-04-19T03:59:00Z
  },
  {
    providerMarketId: "POLY-2772176",
    providerEventId: "POLY-659671",
    title: "UEFA Champions League 2026-27: Barcelona",
    rules: "Resolves to 1 (YES) if FC Barcelona wins the 2026-27 UEFA Champions League, 0 (NO) otherwise.",
    initialMarkE6: 225000,
    closeTimeMs: 1811721540000, // 2027-05-30T23:59:00Z
  },
];
