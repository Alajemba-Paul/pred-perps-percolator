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
  "86fc6f6f6137b7307cac30d6d73f85af21bb9804eb7b143682a4546a9ea78c06": {
    title: "Columbus: Mees Rottgering vs Edward Winter",
    rules: "This market resolves to 1 (YES) if Mees Rottgering advances against Edward Winter, or 0 (NO) if Edward Winter advances.",
  },
  "b406280f15eb31f25dd0eece1eefe403f29d0d22a5b113269afa9573cc0546a3": {
    title: "Dota 2: BetBoom Team vs OG (BO3)",
    rules: "This market refers to the Dota 2 match between BetBoom Team and OG in BLAST Slam Group C. Resolves to 1 (YES) if BetBoom Team wins, 0 (NO) if OG wins.",
  },
  "708a95e19c4438233b8b610bc0de672c46f6fb4cdfd8f25232f0aa7287fb11ac": {
    title: "Columbus: Mees Rottgering vs Edward Winter (Record #1)",
    rules: "Initial Devnet import record #1. State locked on-chain.",
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
    rules: "Initial Devnet import record #1. State locked on-chain.",
  },
  "POLY-5140154-0": {
    title: "Dota 2: Aurora vs Team Liquid (BO3)",
    rules: "This market refers to the Dota 2 match between Aurora and Team Liquid in BLAST Slam Group D. Resolves to 1 (YES) if Aurora wins, 0 (NO) if Team Liquid wins.",
  },
  "POLY-5174679-0": {
    title: "Counter-Strike: Galorys vs Gremio Esports (BO3)",
    rules: "This market refers to the Counter-Strike match between Galorys and Gremio Esports in CCT South America Series 6 Playoffs. Resolves to 1 (YES) if Galorys wins, 0 (NO) if Gremio Esports wins.",
  },
  "POLY-5197167-0": {
    title: "Curitiba (Doubles): Arias/Carou vs Miguel/Ribeiro",
    rules: "This market refers to the Curitiba Doubles tennis match between Arias/Carou and Miguel/Ribeiro. Resolves to 1 (YES) if Arias/Carou win, 0 (NO) if Miguel/Ribeiro win.",
  },
  "POLY-5194257-0": {
    title: "Bitcoin: Up or Down (15-min Perp)",
    rules: "Resolves to 1 (YES) if Bitcoin price moves UP during the active session, 0 (NO) if DOWN.",
  },
  "POLY-5194248-0": {
    title: "Ethereum: Up or Down (15-min Perp)",
    rules: "Resolves to 1 (YES) if Ethereum price moves UP during the active session, 0 (NO) if DOWN.",
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
