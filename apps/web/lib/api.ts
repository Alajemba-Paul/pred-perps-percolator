import { Connection, PublicKey } from "@solana/web3.js";
import { DEMO_MARKETS, DEMO_PORTFOLIO } from "./demo-data";
import { toMarket, type ApiMarket, type Market } from "./markets";
import {
  DEVNET_DEPLOYMENT,
  decodeImportedMarket,
  decodePortfolioSummary,
} from "./contracts";

export type ApiPosition = {
  slot: number;
  assetIndex: number;
  marketId: string;
  side: "long" | "short";
  sizeQ: string;
  entryNotional: string;
  stale: boolean;
};

export type ApiPortfolio = {
  address: string;
  owner: string;
  slot: number;
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
  positions: ApiPosition[];
};

const isBrowser = typeof window !== "undefined";

const getBaseUrl = () => {
  if (isBrowser) return "";
  if (process.env.MOXIE_API_URL) return process.env.MOXIE_API_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://127.0.0.1:3000";
};

async function getDevnetOnchainMarkets(): Promise<Market[]> {
  try {
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || DEVNET_DEPLOYMENT.rpcUrl || "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    const recordPubkey = new PublicKey(DEVNET_DEPLOYMENT.importedRecord);
    const info = await connection.getAccountInfo(recordPubkey);

    if (!info || info.data.length < 384) {
      console.warn("Devnet record account not found or too small");
      return DEMO_MARKETS;
    }

    const decoded = decodeImportedMarket(new Uint8Array(info.data));
    const nowSec = Math.floor(Date.now() / 1000);
    const remaining = Number(decoded.externalCloseTime) - nowSec;
    const lock =
      remaining <= 0
        ? "Locked"
        : remaining > 86400
        ? `${Math.floor(remaining / 86400)}d ${Math.floor((remaining % 86400) / 3600)}h`
        : `${Math.floor(remaining / 3600)}h`;

    const cents = (e6: bigint) => Number(e6) / 10_000;

    const liveMarket: Market = {
      slug: DEVNET_DEPLOYMENT.importedRecord,
      address: DEVNET_DEPLOYMENT.importedRecord,
      category: "EVENT",
      question: "Columbus: Mees Rottgering vs Edward Winter — Mees Rottgering",
      short: `MARKET #${decoded.marketId}`,
      provider: "Jupiter / Polymarket (Live Devnet)",
      moxie: cents(decoded.markE6),
      index: cents(decoded.indexE6),
      mark: cents(decoded.markE6),
      change: null,
      volume: "ONCHAIN",
      oi: "ONCHAIN",
      lock,
      leverage: "1× (Isolated)",
      status: decoded.status,
      marketId: decoded.marketId.toString(),
      assetIndex: decoded.assetIndex,
      oracleUpdatedAt: new Date().toISOString(),
      rules: "This market resolves to 1 (YES) if Mees Rottgering advances against Edward Winter, or 0 (NO) if Edward Winter advances.",
      providerMarketId: "POLY-5013959-0",
    };

    return [liveMarket, ...DEMO_MARKETS.slice(1)];
  } catch (err) {
    console.error("Failed to read onchain markets from Devnet RPC:", err);
    return DEMO_MARKETS;
  }
}

export async function getMarkets(): Promise<Market[]> {
  try {
    // 1. If in browser or running Next.js server, call the internal /api/indexer/markets
    const url = isBrowser ? "/api/indexer/markets" : `${getBaseUrl()}/api/indexer/markets`;
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      const data: ApiMarket[] = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.map(toMarket);
      }
    }
  } catch (e) {
    console.warn("Failed fetching from /api/indexer/markets:", e);
  }

  // 2. Fallback to direct RPC query
  return await getDevnetOnchainMarkets();
}

export async function getMarket(address: string): Promise<Market> {
  const markets = await getMarkets();
  const found = markets.find(
    (m) =>
      m.slug === address ||
      m.address === address ||
      m.marketId === address ||
      m.providerMarketId === address
  );
  if (found) return found;

  const demo = DEMO_MARKETS.find((market) => market.slug === address || market.address === address);
  if (demo) return demo;

  if (markets.length > 0) return markets[0];
  throw new Error(`Market not found for address ${address}`);
}

export async function getPortfolio(address: string): Promise<ApiPortfolio> {
  const target =
    address === "demo-trader-portfolio" ? DEVNET_DEPLOYMENT.demoTraderPortfolio : address;

  try {
    const url = isBrowser
      ? `/api/indexer/portfolios/${encodeURIComponent(target)}`
      : `${getBaseUrl()}/api/indexer/portfolios/${encodeURIComponent(target)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      const data: ApiPortfolio = await res.json();
      return data;
    }
  } catch (e) {
    console.warn("Could not query portfolio from indexer API:", e);
  }

  // Fallback to direct Devnet RPC query
  try {
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || DEVNET_DEPLOYMENT.rpcUrl || "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    const pubkey = new PublicKey(target);
    const info = await connection.getAccountInfo(pubkey);
    if (info && info.data.length >= 9563) {
      const decoded = decodePortfolioSummary(new Uint8Array(info.data));
      return {
        address: target,
        owner: pubkey.toBase58(),
        slot: await connection.getSlot(),
        capital: decoded.capital.toString(),
        pnl: decoded.pnl.toString(),
        health: {
          valid: decoded.valid,
          equity: decoded.equity.toString(),
          initialRequirement: decoded.initialRequirement.toString(),
          maintenanceRequirement: decoded.maintenanceRequirement.toString(),
          liquidationDeficit: decoded.liquidationDeficit.toString(),
          worstCaseLoss: "0",
        },
        positions: decoded.positions.map((p) => ({
          slot: p.slot,
          assetIndex: p.assetIndex,
          marketId: p.marketId,
          side: p.side,
          sizeQ: p.sizeQ,
          entryNotional: p.entryNotional,
          stale: p.stale,
        })),
      };
    }
  } catch (e) {
    console.warn("Direct RPC portfolio query failed:", e);
  }

  return { ...DEMO_PORTFOLIO, address: target };
}
