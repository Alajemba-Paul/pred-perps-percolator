import {
  type ApiMarket,
  type ApiPortfolio,
  type Market,
  toMarket,
} from "./markets";
import { listOpenChainMarkets } from "./open-markets";
import { DEVNET_DEPLOYMENT, decodePortfolioSummary, decodeImportedMarket } from "./contracts";
import { Connection, PublicKey } from "@solana/web3.js";
import fs from "fs";
import path from "path";

const isBrowser = typeof window !== "undefined";

const DEFAULT_INDEXER_URL = "https://pred-perps-percolator.onrender.com";

/**
 * Normalizes indexer public/internal URL:
 * - Falls back to production Render URL if unset
 * - Trims trailing slash and /v1 suffix
 */
export function getIndexerUrl(): string {
  const raw =
    process.env.MOXIE_API_URL ||
    process.env.NEXT_PUBLIC_MOXIE_API_URL ||
    (process.env.NODE_ENV === "development" ? "http://127.0.0.1:8787" : DEFAULT_INDEXER_URL);

  return raw.replace(/\/+$/, "").replace(/\/v1$/, "");
}

function getBaseUrl() {
  if (isBrowser) return "";
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/**
 * Reads live Jupiter market manifest if available on disk (Node/server only).
 */
function getLocalJupiterManifest() {
  if (isBrowser) return null;
  try {
    const manifestPath = path.resolve(process.cwd(), "deployments/jupiter-live-market.json");
    if (fs.existsSync(manifestPath)) {
      return JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    }
  } catch (e) {
    // Ignore in browser or non-file environments
  }
  return null;
}

/**
 * Direct RPC fallback to decode real on-chain Devnet market.
 * Does NOT return fake dummy markets.
 */
async function getDevnetOnchainMarkets(): Promise<Market[]> {
  try {
    const rpcUrl =
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      DEVNET_DEPLOYMENT.rpcUrl ||
      "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");

    const marketPubkey = new PublicKey(DEVNET_DEPLOYMENT.marketAccount);
    const recordPubkey = new PublicKey(DEVNET_DEPLOYMENT.importedRecord);

    const [marketInfo, recordInfo] = await Promise.all([
      connection.getAccountInfo(marketPubkey),
      connection.getAccountInfo(recordPubkey),
    ]);

    if (!marketInfo || !recordInfo) {
      console.warn("Devnet market accounts not found on-chain");
      return [];
    }

    const decoded = decodeImportedMarket(recordInfo.data);
    const manifest = getLocalJupiterManifest();

        const title = manifest?.title || "Brazil Presidential Election: Flavio Bolsonaro";
    const rules =
      manifest?.rules ||
      "A presidential election is scheduled to take place in Brazil on October 4, 2026. Resolves to 1 (YES) if Flavio Bolsonaro wins, 0 (NO) otherwise.";

    const apiMarket: ApiMarket = {
      address: DEVNET_DEPLOYMENT.importedRecord,
      providerMarketId: manifest?.providerMarketId || "POLY-601826",
      title,
      rules,
      slot: 0,
      assetIndex: Number(decoded.assetIndex),
      marketId: decoded.marketId.toString(),
      status: decoded.status,
      markE6: decoded.markE6.toString(),
      indexE6: decoded.indexE6.toString(),
      closeTime: decoded.externalCloseTime.toString(),
      oracleUpdatedAt: new Date(Number(decoded.lastSourceTimestamp) * 1000).toISOString(),
    };
    const liveMarket: Market = toMarket(apiMarket);

    return [liveMarket];
  } catch (err) {
    console.error("Failed to read onchain markets from Devnet RPC:", err);
    return [];
  }
}

export type { ApiPortfolio, ApiMarket, Market };

/**
 * Fetch markets from indexer (server-side direct or browser proxy),
 * falling back to on-chain Devnet state.
 */
export async function getMarkets(): Promise<Market[]> {
  const open = await listOpenChainMarkets();
  if (open) return open.map(toMarket);

  const indexerUrl = getIndexerUrl();

  // 1. On server: direct fetch to Render indexer (avoids extra proxy round-trip)
  if (!isBrowser && indexerUrl) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(`${indexerUrl}/v1/markets`, {
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data: ApiMarket[] = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return data.map(toMarket);
        }
      }
    } catch (err) {
      console.warn(`Direct server fetch to ${indexerUrl}/v1/markets failed:`, err);
    }
  }

  // 2. In browser (or server fallback): internal proxy /api/indexer/markets
  try {
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

  // 3. Fallback to direct Devnet RPC query
  return await getDevnetOnchainMarkets();
}

/**
 * Fetch a specific market by slug/address/id.
 */
export async function getMarket(address: string): Promise<Market | null> {
  const open = await listOpenChainMarkets();
  if (open) {
    const markets = open.map(toMarket);
    return (
      markets.find(
        (m) => m.slug === address || m.address === address || m.marketId === address || m.providerMarketId === address,
      ) ?? null
    );
  }

  const indexerUrl = getIndexerUrl();

  // On server: try direct fetch for specific market
  if (!isBrowser && indexerUrl && address) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${indexerUrl}/v1/markets/${encodeURIComponent(address)}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (data && data.address) {
          return toMarket(data);
        }
      }
    } catch {
      // ignore and check full list
    }
  }

  const markets = await getMarkets();
  const found = markets.find(
    (m) =>
      m.slug === address ||
      m.address === address ||
      m.marketId === address ||
      m.providerMarketId === address
  );
  if (found) return found;

  // If queried by the default deployment record, try direct fetch
  if (address === DEVNET_DEPLOYMENT.importedRecord) {
    const fallbackList = await getDevnetOnchainMarkets();
    if (fallbackList.length > 0) return fallbackList[0];
  }

  return null;
}

export async function getPortfolio(address: string): Promise<ApiPortfolio | null> {
  const target =
    address === "demo-trader-portfolio" ? DEVNET_DEPLOYMENT.demoTraderPortfolio : address;

  const indexerUrl = getIndexerUrl();

  // On server: direct fetch from indexer
  if (!isBrowser && indexerUrl) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${indexerUrl}/v1/portfolios/${encodeURIComponent(target)}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn(`Direct fetch to ${indexerUrl}/v1/portfolios failed:`, e);
    }
  }

  try {
    const url = isBrowser
      ? `/api/indexer/portfolios/${target}`
      : `${getBaseUrl()}/api/indexer/portfolios/${target}`;
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn(`Failed fetching portfolio from indexer for ${target}:`, e);
  }

  // Direct RPC fallback for portfolio account
  try {
    const rpcUrl =
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      DEVNET_DEPLOYMENT.rpcUrl ||
      "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    const pubkey = new PublicKey(target);
    const acc = await connection.getAccountInfo(pubkey);
    if (!acc || acc.data.length < DEVNET_DEPLOYMENT.portfolioAccountLen) {
      return null;
    }

    const decoded = decodePortfolioSummary(acc.data);
    return {
      address: target,
      owner: target,
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
        marketId: p.marketId.toString(),
        assetIndex: p.assetIndex,
        side: (p.side === "long" || (p.side as any) === 0) ? "long" : "short",
        sizeQ: p.sizeQ.toString(),
        entryNotional: p.entryNotional.toString(),
        stale: p.stale,
      })),
    };
  } catch (err) {
    console.error("Direct RPC portfolio fetch error:", err);
    return null;
  }
}
