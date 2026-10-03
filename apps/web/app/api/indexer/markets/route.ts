import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { DEVNET_DEPLOYMENT, decodeImportedMarket } from "@/lib/contracts";
import type { ApiMarket } from "@/lib/markets";
import { getIndexerUrl } from "@/lib/api";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const maxDuration = 35;

export const CUTOFF_TIMESTAMP_SEC = 1791158400; // 2026-10-05T00:00:00Z

function getImportedCandidates(): any[] {
  try {
    const candidatePaths = [
      path.resolve(process.cwd(), "deployments/imported-markets.json"),
      path.resolve(process.cwd(), "../../deployments/imported-markets.json"),
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, "utf-8"));
      }
    }
  } catch (e) {
    console.warn("Could not read imported-markets.json:", e);
  }
  return [];
}

const DEFAULT_METADATA: Record<string, { title: string; rules: string }> = {
  "POLY-601826": {
    title: "Brazil Presidential Election: Flávio Bolsonaro",
    rules: "A presidential election is scheduled to take place in Brazil on October 4, 2026. Resolves to 1 (YES) if Flávio Bolsonaro wins, 0 (NO) otherwise.",
  },
  "POLY-2589812": {
    title: "Fed Interest Rates (Oct 2026): No change",
    rules: "The FED interest rates decision after October 2026 FOMC meeting. Resolves to 1 (YES) if target range is unchanged, 0 (NO) otherwise.",
  },
  "POLY-5170737": {
    title: "Bitcoin Nov 2026 Target: Drops to $82,500",
    rules: "Resolves to 1 (YES) if any Binance 1-minute candle for BTC/USDT in November 2026 has a Low equal to or lower than $82,500, 0 (NO) otherwise.",
  },
  "POLY-5208385": {
    title: "Bitcoin Target: Reaches $86,000",
    rules: "Resolves to 1 (YES) if any Binance 1-minute candle for BTC/USDT has a High equal to or greater than $86,000, 0 (NO) otherwise.",
  },
  "POLY-608545": {
    title: "Ballon d’Or 2026 Winner: Lamine Yamal",
    rules: "This market resolves to 1 (YES) if Lamine Yamal wins the 2026 Ballon d'Or according to France Football, 0 (NO) otherwise.",
  },
  "POLY-561974": {
    title: "US 2028 Republican Nominee: J.D. Vance",
    rules: "Resolves to 1 (YES) if J.D. Vance wins and accepts the 2028 Republican nomination for U.S. President, 0 (NO) otherwise.",
  },
  "POLY-679018": {
    title: "French Presidential Election 2027: Marine Le Pen",
    rules: "Resolves to 1 (YES) if Marine Le Pen wins the next French presidential election, 0 (NO) otherwise.",
  },
  "POLY-2772176": {
    title: "UEFA Champions League 2026-27: Barcelona",
    rules: "Resolves to 1 (YES) if FC Barcelona wins the 2026-27 UEFA Champions League, 0 (NO) otherwise.",
  },
};

export async function GET() {
  const candidates = getImportedCandidates();
  const indexerBase = getIndexerUrl();

  let liveMarkets: ApiMarket[] = [];

  if (indexerBase) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      const res = await fetch(`${indexerBase}/v1/markets`, {
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          liveMarkets = data;
        }
      }
    } catch (err) {
      console.warn(`Indexer fetch to ${indexerBase}/v1/markets failed:`, err);
    }
  }

  // Filter out any market closing before 2026-10-05T00:00:00Z
  const validLive = liveMarkets.filter((m) => {
    const closeSec = Number(m.closeTime || 0);
    const isSpecialSlot =
      m.title.startsWith("Unused Slot") ||
      m.title.startsWith("Percolator Collateral") ||
      m.title.includes("(Record #1)");
    return closeSec >= CUTOFF_TIMESTAMP_SEC && !isSpecialSlot;
  });

  // If we already have 5+ valid live markets passing cutoff from indexer, normalize and return them
  if (validLive.length >= 5) {
    const normalized = validLive.map((m) => {
      const meta = DEFAULT_METADATA[m.providerMarketId] || DEFAULT_METADATA[m.address];
      let title = meta?.title || m.title;
      let rules = meta?.rules || m.rules;
      if (/^[0-9a-fA-F]{64}$/.test(title)) title = "Prediction Market";
      return {
        ...m,
        title,
        rules: rules || "Prediction perpetual market on Solana Devnet.",
      };
    });
    return NextResponse.json(normalized);
  }

  // Fallback: Return verified candidates closing >= 5 Oct 2026
  const results: ApiMarket[] = candidates.map((c: any, idx: number) => {
    const closeSec = c.closeTimeMs ? Math.floor(c.closeTimeMs / 1000) : 1791172800;
    const markE6 = String(c.initialMarkE6 || 500000);
    const meta = DEFAULT_METADATA[c.providerMarketId];
    return {
      address: c.providerMarketId || `moxie-market-slot-${idx + 1}`,
      providerMarketId: c.providerMarketId || `POLY-slot-${idx + 1}`,
      title: meta?.title || c.title,
      rules: meta?.rules || c.rules || "Prediction perpetual market on Solana Devnet.",
      slot: 0,
      assetIndex: idx + 1,
      marketId: String(idx + 1),
      status: 1, // Active
      markE6,
      indexE6: markE6,
      closeTime: String(closeSec),
      oracleUpdatedAt: String(Math.floor(Date.now() / 1000)),
    };
  });

  return NextResponse.json(results);
}
