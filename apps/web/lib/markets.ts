export type Market = {
  slug: string;
  address: string;
  category: string;
  question: string;
  title: string;
  short: string;
  provider: string;
  moxie: number;
  index: number;
  mark: number;
  currentPrice: number;
  change: number | null;
  volume: string;
  oi: string;
  lock: string;
  closeTime: string;
  leverage: string;
  status: number | string;
  marketId: string;
  assetIndex: number;
  oracleUpdatedAt: string;
  rules?: string;
  providerMarketId?: string;
  symbol?: string;
  underlyingAsset?: string;
  contractSize?: number;
  quoteAsset?: string;
  makerFee?: number;
  takerFee?: number;
  liquidationFee?: number;
  minOrderSize?: number;
  maxPositionSize?: number;
  depthLevels?: number;
  fundingIntervalHours?: number;
  oracleProvider?: string;
  oracleAddress?: string;
  oracleStalenessThresholdSeconds?: number;
  indexPrice?: number;
  markPrice?: number;
  fundingRate?: number;
  volume24h?: number;
  openInterest?: number;
  book?: {
    yesBid: number;
    yesAsk: number;
    noBid: number;
    noAsk: number;
  };
};

export type ApiPortfolio = {
  address: string;
  owner: string;
  slot?: number;
  capital: string;
  pnl: string;
  health: {
    valid: boolean;
    equity: string;
    initialRequirement: string;
    maintenanceRequirement: string;
    liquidationDeficit: string;
    worstCaseLoss: string;
  };
  positions: Array<{
    slot?: number;
    marketId: string;
    assetIndex: number;
    side: "long" | "short";
    sizeQ: string;
    entryNotional: string;
    stale: boolean;
  }>;
};

export type ApiMarket = {
  address: string;
  providerMarketId: string;
  title: string;
  rules: string;
  slot: number;
  assetIndex: number;
  marketId: string;
  status: number;
  markE6: string;
  indexE6: string;
  closeTime: string;
  oracleUpdatedAt: string;
};

export const cents = (e6: string | number | bigint) => Number(e6) / 10_000;

export const lockLabel = (seconds: string | number | bigint) => {
  const remaining = Number(seconds) - Math.floor(Date.now() / 1000);
  if (!Number.isFinite(remaining)) return "—";
  if (remaining <= 0) return "Locked";
  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
};

export function getStatusLabel(status: number | string): string {
  if (typeof status === "string") {
    const s = status.toLowerCase();
    if (s === "locked" || s === "closed" || s === "4") return "Closed";
    if (s === "unused" || s === "0") return "Unused";
    return status.charAt(0).toUpperCase() + status.slice(1);
  }
  switch (status) {
    case 0:
      return "Unused";
    case 1:
      return "Active";
    case 2:
      return "Restricted";
    case 3:
      return "Reduce Only";
    case 4:
      return "Closed";
    case 5:
      return "Resolved";
    default:
      return "Unused";
  }
}

export function getLifecyclePhase(status: number | string): string {
  return getStatusLabel(status);
}

export function formatPrice(price: number): string {
  return `$${price.toFixed(3)}`;
}

export function formatProbability(prob: number): string {
  const pct = Math.round(prob * 1000) / 10;
  return `${pct.toFixed(1)}%`;
}

export const KNOWN_MARKET_TITLES: Record<string, { title: string; rules: string }> = {
  "POLY-601826": {
    title: "Brazil Presidential Election: Flávio Bolsonaro",
    rules: "A presidential election is scheduled to take place in Brazil on October 4, 2026. Resolves to 1 (YES) if Flávio Bolsonaro wins, 0 (NO) otherwise.",
  },
  "POLY-2589812": {
    title: "Fed Interest Rates (Oct 2026): No change",
    rules: "The FED interest rates decision after October 2026 FOMC meeting. Resolves to 1 (YES) if target range is unchanged, 0 (NO) otherwise.",
  },
  "POLY-5170737": {
    title: "Bitcoin Nov 2026 Target: Drops to $82,500",
    rules: "Resolves to 1 (YES) if any Binance 1-minute candle for BTC/USDT in November 2026 has a Low equal to or lower than $82,500, 0 (NO) otherwise.",
  },
  "POLY-608545": {
    title: "Ballon d’Or 2026 Winner: Lamine Yamal",
    rules: "This market resolves to 1 (YES) if Lamine Yamal wins the 2026 Ballon d'Or according to France Football, 0 (NO) otherwise.",
  },
  "POLY-5208385": {
    title: "Bitcoin Target: Reaches $86,000",
    rules: "Resolves to 1 (YES) if any Binance 1-minute candle for BTC/USDT has a High equal to or greater than $86,000, 0 (NO) otherwise.",
  },
  "POLY-561974": {
    title: "US 2028 Republican Nominee: J.D. Vance",
    rules: "Resolves to 1 (YES) if J.D. Vance wins and accepts the 2028 Republican nomination for U.S. President, 0 (NO) otherwise.",
  },
  "POLY-679018": {
    title: "French Presidential Election 2027: Marine Le Pen",
    rules: "Resolves to 1 (YES) if Marine Le Pen wins the next French presidential election, 0 (NO) otherwise.",
  },
  "POLY-2772176": {
    title: "UEFA Champions League 2026-27: Barcelona",
    rules: "Resolves to 1 (YES) if FC Barcelona wins the 2026-27 UEFA Champions League, 0 (NO) otherwise.",
  },
  "ZxBtBZxNJJb77cAVn3F7dPXw5NLw9G2bWjv3uYGUtLZ": {
    title: "Columbus: Mees Rottgering vs Edward Winter",
    rules: "This market resolves to 1 (YES) if Mees Rottgering advances against Edward Winter, or 0 (NO) if Edward Winter advances.",
  },
  "DKmVXDGjLwdZdqXYVeVxxxM3G9L8t9nviFWspExQSD4C": {
    title: "Dota 2: BetBoom Team vs OG (BO3)",
    rules: "This market refers to the Dota 2 match between BetBoom Team and OG in BLAST Slam Group C. Resolves to 1 (YES) if BetBoom Team wins, 0 (NO) if OG wins.",
  },
  "137RRKMrbRZueEcUbZZmDRP6VWFanFndhPjzi5WkeMss": {
    title: "Columbus: Mees Rottgering vs Edward Winter (Record #1)",
    rules: "Initial Devnet import record #1. State locked on-chain (Closed).",
  },
};

export function resolveMarketTitleAndRules(x: {
  title?: string;
  rules?: string;
  providerMarketId?: string;
  address?: string;
  marketId?: string | number;
}): { title: string; rules: string } {
  const byProvider = x.providerMarketId ? KNOWN_MARKET_TITLES[x.providerMarketId] : null;
  const byAddress = x.address ? KNOWN_MARKET_TITLES[x.address] : null;
  const known = byProvider || byAddress;

  if (known) {
    return {
      title: known.title,
      rules: known.rules,
    };
  }

  let title = (x.title || "").trim();
  let rules = (x.rules || "").trim();

  const is64Hex = /^[0-9a-fA-F]{64}$/.test(title);
  const isGeneric = /^Jupiter Live Market/i.test(title);

  if (!title || is64Hex || isGeneric) {
    const shortAddr = x.address ? `…${x.address.slice(-6)}` : "";
    title = `Market #${x.marketId || 2} (${shortAddr})`;
  } else if (title.startsWith("Percolator") || title.startsWith("Unused Slot")) {
    return { title, rules: rules || "Percolator binary perpetual slot on Solana Devnet." };
  }

  if (!rules || /^[0-9a-fA-F]{64}$/.test(rules)) {
    rules = "Percolator binary perpetual market on Solana Devnet.";
  }

  return { title, rules };
}

export const CUTOFF_TIMESTAMP_SEC = 1791158400; // 2026-10-05T00:00:00Z

export function toMarket(x: ApiMarket): Market {
  const { title, rules } = resolveMarketTitleAndRules(x);
  const yesMark = Number(x.markE6) / 1_000_000;
  const noMark = Math.max(0, 1 - yesMark);

  return {
    slug: x.address,
    address: x.address,
    category: "EVENT",
    question: title,
    title,
    short: `MARKET #${x.marketId}`,
    provider: "Jupiter / Polymarket",
    moxie: cents(x.markE6),
    index: cents(x.indexE6),
    mark: yesMark,
    currentPrice: yesMark,
    indexPrice: yesMark,
    markPrice: yesMark,
    change: null,
    volume: "ONCHAIN",
    oi: "ONCHAIN",
    lock: lockLabel(x.closeTime),
    closeTime: new Date(Number(x.closeTime) * 1000).toISOString(),
    leverage: "1× (Isolated)",
    status: x.status === 1 ? "active" : x.status === 4 ? "closed" : x.status === 0 ? "unused" : x.status,
    marketId: x.marketId,
    assetIndex: x.assetIndex,
    oracleUpdatedAt: x.oracleUpdatedAt,
    rules,
    providerMarketId: x.providerMarketId,
    book: {
      yesBid: Math.max(0.01, yesMark - 0.01),
      yesAsk: Math.min(0.99, yesMark + 0.01),
      noBid: Math.max(0.01, noMark - 0.01),
      noAsk: Math.min(0.99, noMark + 0.01),
    },
  };
}
