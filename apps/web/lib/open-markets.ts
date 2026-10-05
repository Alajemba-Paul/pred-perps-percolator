import { Connection, PublicKey } from "@solana/web3.js";
import { DEVNET_DEPLOYMENT, decodeMarketAssetSlot, readMaxMarketSlots } from "./contracts";
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
