import { Connection, PublicKey } from "@solana/web3.js";
import { DEVNET_DEPLOYMENT, decodeMarketAssetSlot, readMaxMarketSlots } from "./contracts";
import { listLiveJupiterMarkets } from "./jupiter-live";
import type { ApiMarket } from "./markets";

const FAR_CLOSE = "1893456000";

/** Slots the program will accept a new position on. Null means the account could not be read. */
export async function listOpenChainMarkets(): Promise<ApiMarket[] | null> {
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

function usableTitle(title: string | undefined): boolean {
  if (!title) return false;
  return (
    !title.startsWith("Unused Slot") &&
    !title.startsWith("Open market #") &&
    !title.startsWith("Percolator") &&
    !title.includes("(Record #1)") &&
    !/^Jupiter Live Market/i.test(title)
  );
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

/** Active on-chain slots only. Jupiter rows that are not imported are dropped. */
export async function listTradableDevnetMarkets(): Promise<ApiMarket[]> {
  const chain = await listOpenChainMarkets();
  if (!chain || chain.length === 0) return [];
  const [indexed, jupiter] = await Promise.all([
    indexedMarkets(),
    listLiveJupiterMarkets().catch(() => [] as ApiMarket[]),
  ]);

  return chain
    .filter((slot) => /^\d+$/.test(slot.marketId))
    .map((slot) => {
      const known = indexed.find((row) => row.marketId === slot.marketId && usableTitle(row.title));
      const live = known
        ? jupiter.find(
            (row) =>
              row.providerMarketId === known.providerMarketId ||
              row.marketId === known.providerMarketId,
          )
        : undefined;
      const titled = live && usableTitle(live.title) ? live : known;
      return {
        ...slot,
        title: titled && usableTitle(titled.title) ? titled.title : slot.title,
        rules: titled?.rules || slot.rules,
        providerMarketId: known?.providerMarketId || slot.providerMarketId,
        closeTime: known?.closeTime && known.closeTime !== "0" ? known.closeTime : slot.closeTime,
      };
    });
}
