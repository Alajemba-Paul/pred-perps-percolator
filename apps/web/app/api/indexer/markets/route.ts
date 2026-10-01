import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { DEVNET_DEPLOYMENT, decodeImportedMarket } from "@/lib/contracts";
import type { ApiMarket } from "@/lib/markets";
import { getIndexerUrl } from "@/lib/api";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const maxDuration = 35;

const KNOWN_MARKET_METADATA: Record<string, { title: string; rules: string }> = {
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
};

function normalizeMarket(m: ApiMarket): ApiMarket {
  const byProvider = m.providerMarketId ? KNOWN_MARKET_METADATA[m.providerMarketId] : null;
  const byAddress = m.address ? KNOWN_MARKET_METADATA[m.address] : null;
  const known = byProvider || byAddress;

  let title = m.title;
  let rules = m.rules;

  if (known) {
    title = known.title;
    if (!rules || /^[0-9a-fA-F]{64}$/.test(rules)) {
      rules = known.rules;
    }
  } else {
    const is64Hex = /^[0-9a-fA-F]{64}$/.test(title || "");
    const isGeneric = /^Jupiter Live Market/i.test(title || "");
    if (!title || is64Hex || isGeneric) {
      const shortAddr = m.address ? `…${m.address.slice(-6)}` : "";
      title = `Market #${m.marketId || 2} (${shortAddr})`;
    }
    if (/^[0-9a-fA-F]{64}$/.test(rules || "")) {
      rules = "Percolator binary perpetual market on Solana Devnet.";
    }
  }

  return {
    ...m,
    title,
    rules: rules || "Percolator binary perpetual market on Solana Devnet.",
  };
}

function getManifestInfo(): { title: string; rules: string } {
  const defaultInfo = {
    title: "Dota 2: BetBoom Team vs OG (BO3) - BLAST Slam Group C",
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
      const timer = setTimeout(() => controller.abort(), 30000); // 30s timeout for Render free tier
      const res = await fetch(`${indexerBase}/v1/markets`, {
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const normalized = data.map(normalizeMarket);
          return NextResponse.json(normalized);
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

    const marketPubkey = new PublicKey(DEVNET_DEPLOYMENT.marketAccount);
    const recordPubkey = new PublicKey(DEVNET_DEPLOYMENT.importedRecord);

    const [marketInfo, recordInfo] = await Promise.all([
      connection.getAccountInfo(marketPubkey),
      connection.getAccountInfo(recordPubkey),
    ]);

    if (!marketInfo || !recordInfo) {
      return NextResponse.json([]);
    }

    const decoded = decodeImportedMarket(recordInfo.data);
    const fallbackMarket: ApiMarket = {
      address: DEVNET_DEPLOYMENT.importedRecord,
      providerMarketId: "POLY-4904811-0",
      title: manifestInfo.title,
      rules: manifestInfo.rules,
      slot: 0,
      assetIndex: Number(decoded.assetIndex),
      marketId: decoded.marketId.toString(),
      status: decoded.status,
      markE6: decoded.markE6.toString(),
      indexE6: decoded.indexE6.toString(),
      closeTime: decoded.externalCloseTime.toString(),
      oracleUpdatedAt: new Date(Number(decoded.lastSourceTimestamp) * 1000).toISOString(),
    };

    return NextResponse.json([normalizeMarket(fallbackMarket)]);
  } catch (rpcErr) {
    console.error("Direct RPC Devnet market fallback failed:", rpcErr);
    return NextResponse.json([]);
  }
}
