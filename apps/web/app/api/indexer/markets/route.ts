import { NextResponse } from "next/server";
import type { ApiMarket } from "@/lib/markets";
import { getIndexerUrl } from "@/lib/api";
import { VERIFIED_CANDIDATE_MARKETS } from "@/lib/market-candidates";
import { getMarketsFromNeon, upsertMarketsCache } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 35;

const CUTOFF_TIMESTAMP_SEC = 1791158400; // 2026-10-05T00:00:00Z

export async function GET() {
  // 1. Try reading from Neon Postgres first if configured
  try {
    const neonMarkets = await getMarketsFromNeon();
    if (neonMarkets && neonMarkets.length > 0) {
      return NextResponse.json(neonMarkets, {
        headers: {
          "cache-control": "no-store, max-age=0",
          "x-source": "neon-cache",
        },
      });
    }
  } catch (dbErr) {
    console.warn("[api/indexer/markets] Neon read failed, falling back to indexer:", dbErr);
  }

  const candidates = VERIFIED_CANDIDATE_MARKETS;
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

  // If indexer provided data, map slots replacing old/closed matches with candidates closing >= 5 Oct 2026
  if (liveMarkets.length > 0) {
    const results = liveMarkets
      .filter((m) => Number(m.status) !== 4)
      .map((m, idx) => {
        const closeSec = Number(m.closeTime || 0);
        const isOldOrBeforeCutoff =
          closeSec < CUTOFF_TIMESTAMP_SEC ||
          m.title.startsWith("Unused Slot") ||
          m.title.startsWith("Percolator Collateral") ||
          m.title.includes("(Record #1)") ||
          m.title.includes("Columbus") ||
          m.title.includes("BetBoom") ||
          m.providerMarketId === "86fc6f6f6137b7307cac30d6d73f85af21bb9804eb7b143682a4546a9ea78c06" ||
          m.providerMarketId === "b406280f15eb31f25dd0eece1eefe403f29d0d22a5b113269afa9573cc0546a3";

        if (isOldOrBeforeCutoff) {
          const rep = candidates[idx % candidates.length];
          const repCloseSec = Math.floor(rep.closeTimeMs / 1000);
          const repMark = String(rep.initialMarkE6 || 500000);
          return {
            address: rep.providerMarketId || `moxie-market-slot-${idx}`,
            providerMarketId: rep.providerMarketId || `POLY-slot-${idx}`,
            title: rep.title,
            rules: rep.rules,
            slot: m.slot || 0,
            assetIndex: idx,
            marketId: String(idx),
            status: 1, // Active
            markE6: repMark,
            indexE6: repMark,
            closeTime: String(repCloseSec),
            oracleUpdatedAt: String(Math.floor(Date.now() / 1000)),
          };
        }

        return m;
      })
      .filter((m) => {
        const assetIndex = Number(m.assetIndex);
        return Number(m.status) !== 4
          && Number(m.closeTime || 0) >= CUTOFF_TIMESTAMP_SEC
          && Number.isInteger(assetIndex)
          && assetIndex >= 0
          && assetIndex < 2;
      });

    upsertMarketsCache(results).catch(() => {});
    return NextResponse.json(results, {
      headers: { "x-source": "indexer-live" },
    });
  }

  // Fallback: Return all 8 verified candidates
  const results: ApiMarket[] = candidates.map((c, idx) => {
    const closeSec = Math.floor(c.closeTimeMs / 1000);
    const markE6 = String(c.initialMarkE6 || 500000);
    return {
      address: c.providerMarketId || `moxie-market-slot-${idx + 1}`,
      providerMarketId: c.providerMarketId || `POLY-slot-${idx + 1}`,
      title: c.title,
      rules: c.rules,
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

  upsertMarketsCache(results).catch(() => {});
  return NextResponse.json(results, {
    headers: { "x-source": "candidate-fallback" },
  });
}