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
    return status.charAt(0).toUpperCase() + status.slice(1);
  }
  switch (status) {
    case 1:
      return "Active";
    case 2:
      return "Restricted";
    case 3:
      return "Reduce Only";
    case 4:
      return "Locked";
    case 5:
      return "Resolved";
    default:
      return "Active";
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

export function toMarket(x: ApiMarket): Market {
  const title = x.title && x.title.trim().length > 0 ? x.title.trim() : `Imported prediction market #${x.marketId}`;
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
    status: x.status === 1 ? "active" : x.status,
    marketId: x.marketId,
    assetIndex: x.assetIndex,
    oracleUpdatedAt: x.oracleUpdatedAt,
    rules: x.rules,
    providerMarketId: x.providerMarketId,
    book: {
      yesBid: Math.max(0.01, yesMark - 0.01),
      yesAsk: Math.min(0.99, yesMark + 0.01),
      noBid: Math.max(0.01, noMark - 0.01),
      noAsk: Math.min(0.99, noMark + 0.01),
    },
  };
}
