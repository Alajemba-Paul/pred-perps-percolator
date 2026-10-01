import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { DEVNET_DEPLOYMENT, decodeImportedMarket } from "@/lib/contracts";
import type { ApiMarket } from "@/lib/markets";
import { getIndexerUrl } from "@/lib/api";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const maxDuration = 35;

function getManifestInfo(): { title: string; rules: string } {
  const defaultInfo = {
    title: "Dota 2: BetBoom Team vs OG (BO3) - BLAST Slam Group C — BetBoom Team",
    rules: "This market refers to the Dota 2 match between BetBoom Team and OG in the BLAST Slam Group C.\nResolves to 1 (YES) if BetBoom Team wins the match, 0 (NO) if OG wins.",
  };

  try {
    const candidatePaths = [
      path.resolve(process.cwd(), "deployments/jupiter-live-market.json"),
      path.resolve(process.cwd(), "../../deployments/jupiter-live-market.json"),
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, "utf-8"));
        return {
          title: data.title || defaultInfo.title,
          rules: data.rules || defaultInfo.rules,
        };
      }
    }
  } catch (e) {
    console.warn("Could not read manifest:", e);
  }

  return defaultInfo;
}

export async function GET() {
  const indexerBase = getIndexerUrl();

  if (indexerBase) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000); // 30s timeout for Render spin-down
      const res = await fetch(`${indexerBase}/v1/markets`, {
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          return NextResponse.json(data);
        }
      }
    } catch (err) {
      console.warn(`Indexer fetch to ${indexerBase}/v1/markets failed, falling back to direct Devnet RPC:`, err);
    }
  }

  // Fallback: Query Solana Devnet RPC directly
  try {
    const rpcUrl =
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      DEVNET_DEPLOYMENT.rpcUrl ||
      "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    const manifestInfo = getManifestInfo();

    const knownAddresses = [
      "ZxBtBZxNJJb77cAVn3F7dPXw5NLw9G2bWjv3uYGUtLZ",
      "DKmVXDGjLwdZdqXYVeVxxxM3G9L8t9nviFWspExQSD4C",
      DEVNET_DEPLOYMENT.importedRecord,
    ];

    const markets: ApiMarket[] = [];
    const accounts = await connection.getMultipleAccountsInfo(
      knownAddresses.map((a) => new PublicKey(a))
    );

    for (let i = 0; i < accounts.length; i++) {
      const info = accounts[i];
      if (!info || info.data.length < 384) continue;
      try {
        const decoded = decodeImportedMarket(new Uint8Array(info.data));
        markets.push({
          address: knownAddresses[i],
          providerMarketId: `POLY-${decoded.marketId}`,
          title: manifestInfo.title,
          rules: manifestInfo.rules,
          slot: await connection.getSlot(),
          assetIndex: decoded.assetIndex,
          marketId: decoded.marketId.toString(),
          status: decoded.status,
          markE6: decoded.markE6.toString(),
          indexE6: decoded.indexE6.toString(),
          closeTime: decoded.externalCloseTime.toString(),
          oracleUpdatedAt: decoded.lastSourceTimestamp.toString(),
        });
      } catch (e) {
        console.warn(`Failed to decode record ${knownAddresses[i]}:`, e);
      }
    }

    if (markets.length > 0) {
      return NextResponse.json(markets);
    }
  } catch (err: any) {
    console.error("Failed to query onchain markets:", err);
  }

  return NextResponse.json(
    {
      error: "No markets currently available",
      indexerUrl: indexerBase ? `${indexerBase}/v1/markets` : null,
    },
    { status: 503 }
  );
}
