import { Connection, PublicKey } from "@solana/web3.js";
import { DEVNET_DEPLOYMENT, decodeMarketAssetSlot, readMaxMarketSlots } from "./contracts";
import fs from "node:fs";
import { listLiveJupiterMarkets } from "./jupiter-live";
import { applySavedGroup } from "./saved-group";
import type { ApiMarket } from "./markets";

const FAR_CLOSE = "1893456000";

/** Slots the program will accept a new position on. Null means the account could not be read. */
export async function listOpenChainMarkets(): Promise<ApiMarket[] | null> {
  applySavedGroup();
  const rpc =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    process.env.SOLANA_RPC_URL ||
    DEVNET_DEPLOYMENT.rpcUrl ||
    "https://api.devnet.solana.com";
  const marketAccount = DEVNET_DEPLOYMENT.marketAccount;
  try {
    const connection = new Connection(rpc, "confirmed");
    const info = await connection.getAccountInfo(new PublicKey(marketAccount), "confirmed");
    if (!info) return [];
    const data = new Uint8Array(info.data);
    const max = readMaxMarketSlots(data);
    const open: ApiMarket[] = [];
    for (let assetIndex = 0; assetIndex < max; assetIndex++) {
      let slot;
      try {
        slot = decodeMarketAssetSlot(data, assetIndex);
      } catch {
        continue;
      }
      const price = slot.effectivePrice;
      // Lifecycle 2 is Active. DrainOnly, Retired, and Recovery return 0x15 on a new position.
      if (slot.lifecycle !== 2 || slot.marketId === 0n) continue;
      if (price <= 0n || price >= 1_000_000n) continue;
      if (slot.targetPrice !== price) continue;
      open.push({
        address: `open-${assetIndex}`,
        providerMarketId: `percolator-${slot.marketId.toString()}`,
        title: `Open market #${slot.marketId.toString()}`,
        rules: "This book is open on Solana devnet. A long or short uses the on-chain price.",
        slot: 0,
        assetIndex,
        marketId: slot.marketId.toString(),
        status: 1,
        markE6: price.toString(),
        indexE6: price.toString(),
        closeTime: FAR_CLOSE,
        oracleUpdatedAt: String(Math.floor(Date.now() / 1000)),
      });
    }
    return open;
  } catch (err) {
    console.warn("[open-markets] chain read failed:", err);
    return null;
  }
}

async function indexedMarkets(): Promise<ApiMarket[]> {
  const raw =
    process.env.MOXIE_API_URL ||
    process.env.NEXT_PUBLIC_MOXIE_API_URL ||
    "https://pred-perps-percolator.onrender.com";
  const base = raw.replace(/\/+$/, "").replace(/\/v1$/, "");
  try {
    const res = await fetch(`${base}/v1/markets`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Jupiter rows, each stamped with a live numeric slot when one exists. */
export async function listTradableDevnetMarkets(): Promise<ApiMarket[]> {
  const chain = (await listOpenChainMarkets()) ?? [];
  const [indexed, jupiter] = await Promise.all([
    indexedMarkets(),
    listLiveJupiterMarkets().catch(() => [] as ApiMarket[]),
  ]);
  const fileMap = readSlotMap();
  if (jupiter.length === 0) return chain;

  return jupiter.map((row) => {
    const fromFile = fileMap.find((item) => item.providerMarketId === row.providerMarketId);
    const fromIndex = indexed.find(
      (item) => item.providerMarketId === row.providerMarketId || item.providerMarketId === row.marketId,
    );
    const marketId = String(fromFile?.marketId ?? (fromIndex && /^\d+$/.test(fromIndex.marketId) ? fromIndex.marketId : ""));
    const assetIndex = Number(fromFile?.assetIndex ?? fromIndex?.assetIndex);
    const slot = chain.find((item) => item.marketId === marketId && item.assetIndex === assetIndex);
    if (!slot) return row;
    return {
      ...row,
      address: `open-${slot.assetIndex}`,
      marketId: slot.marketId,
      assetIndex: slot.assetIndex,
      markE6: slot.markE6,
      indexE6: slot.indexE6,
    };
  });
}

function readSlotMap(): Array<{ providerMarketId: string; marketId: string; assetIndex: number }> {
  try {
    const raw = JSON.parse(fs.readFileSync("deployments/devnet-markets.json", "utf8"));
    return Array.isArray(raw.markets) ? raw.markets : [];
  } catch {
    return [];
  }
}
