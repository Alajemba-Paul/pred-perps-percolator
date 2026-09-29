import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { DEVNET_DEPLOYMENT, decodeImportedMarket } from "@/lib/contracts";
import type { ApiMarket } from "@/lib/markets";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

function getManifestInfo(): { title: string; rules: string } {
  const defaultInfo = {
    title: "Columbus: Mees Rottgering vs Edward Winter — Mees Rottgering",
    rules: "This market refers to the tennis match between Mees Rottgering and Edward Winter in Columbus.\nResolves to 1 (YES) if Mees Rottgering advances, 0 (NO) if Edward Winter advances.",
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
  const indexerBase = process.env.MOXIE_API_URL || (process.env.NODE_ENV === "development" ? "http://127.0.0.1:8787" : null);

  if (indexerBase) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${indexerBase}/v1/markets`, { cache: "no-store", signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }
    } catch (err) {
      console.warn("Indexer fetch failed, falling back to direct Devnet RPC:", err);
    }
  }

  // Fallback: Query Solana Devnet RPC directly
  try {
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || DEVNET_DEPLOYMENT.rpcUrl || "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    const manifestInfo = getManifestInfo();

    const knownAddresses = [
      DEVNET_DEPLOYMENT.importedRecord,
      "ZxBtBZxNJJb77cAVn3F7dPXw5NLw9G2bWjv3uYGUtLZ",
      "DKmVXDGjLwdZdqXYVeVxxxM3G9L8t9nviFWspExQSD4C",
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
          title: i === 0 ? manifestInfo.title : `Columbus: Live Devnet Binary Perp #${decoded.marketId}`,
          rules: i === 0 ? manifestInfo.rules : "Live devnet binary perp market settled against oracle record.",
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

  return NextResponse.json([], { status: 503 });
}
