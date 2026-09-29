export type Market = {
  slug: string;
  address: string;
  category: string;
  question: string;
  short: string;
  provider: string;
  moxie: number;
  index: number;
  mark: number;
  change: number | null;
  volume: string;
  oi: string;
  lock: string;
  leverage: string;
  status: number;
  marketId: string;
  assetIndex: number;
  oracleUpdatedAt: string;
  rules?: string;
  providerMarketId?: string;
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
  if (!Number.isFinite(remaining)) return "–";
  if (remaining <= 0) return "Locked";
  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
};

export function getStatusLabel(status: number): { label: string; tradable: boolean } {
  switch (status) {
    case 1:
      return { label: "Active", tradable: true };
    case 2:
      return { label: "Restricted", tradable: false };
    case 3:
      return { label: "Reduce Only", tradable: false };
    case 4:
      return { label: "Locked", tradable: false };
    case 5:
      return { label: "Resolved", tradable: false };
    default:
      return { label: "Unknown", tradable: false };
  }
}

export function toMarket(x: ApiMarket): Market {
  const title = x.title && x.title.trim().length > 0 ? x.title.trim() : `Imported prediction market #${x.marketId}`;
  return {
    slug: x.address,
    address: x.address,
    category: "EVENT",
    question: title,
    short: `MARKET #${x.marketId}`,
    provider: "Jupiter / Polymarket",
    moxie: cents(x.markE6),
    index: cents(x.indexE6),
    mark: cents(x.markE6),
    change: null,
    volume: "ONCHAIN",
    oi: "ONCHAIN",
    lock: lockLabel(x.closeTime),
    leverage: "1× (Isolated)",
    status: x.status,
    marketId: x.marketId,
    assetIndex: x.assetIndex,
    oracleUpdatedAt: x.oracleUpdatedAt,
    rules: x.rules,
    providerMarketId: x.providerMarketId,
  };
}
