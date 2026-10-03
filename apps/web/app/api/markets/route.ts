import { NextResponse } from "next/server";
import { getMarketsFromNeon, upsertMarketsCache, CUTOFF_TIMESTAMP_SEC } from "../../../lib/db";
import { VERIFIED_CANDIDATE_MARKETS } from "../../../lib/market-candidates";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const INDEXER_URL =
  process.env.NEXT_PUBLIC_INDEXER_URL ||
  process.env.INDEXER_URL ||
  "https://pred-perps-percolator.onrender.com";

function filterValidMarkets(markets: any[]): any[] {
  if (!Array.isArray(markets)) return [];
  return markets.filter((m) => {
    if (Number(m.status) === 4) return false;
    const closeSec = Number(m.closeTime || 0);
    return closeSec >= CUTOFF_TIMESTAMP_SEC;
  });
}

export async function GET() {
  try {
    // 1. Try reading from Neon Postgres first if configured
    try {
      const neonMarkets = await getMarketsFromNeon();
      if (neonMarkets && neonMarkets.length > 0) {
        const filtered = filterValidMarkets(neonMarkets);
        if (filtered.length > 0) {
          return NextResponse.json(filtered, {
            headers: {
              "cache-control": "no-store, max-age=0",
              "x-source": "neon-cache",
            },
          });
        }
      }
    } catch (dbErr) {
      console.warn("[api/markets] Neon read failed, falling back to indexer:", dbErr);
    }

    // 2. Fall back to Render Indexer /v1/markets
    let fetchedMarkets: any[] = [];
    try {
      const res = await fetch(`${INDEXER_URL}/v1/markets`, {
        next: { revalidate: 0 },
        signal: AbortSignal.timeout(3500),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          fetchedMarkets = filterValidMarkets(data);
        }
      }
    } catch (fetchErr) {
      console.warn("[api/markets] Indexer fetch failed / cold:", fetchErr);
    }

    // 3. Fall back to local VERIFIED_CANDIDATE_MARKETS if indexer is cold / empty
    if (fetchedMarkets.length === 0) {
      fetchedMarkets = filterValidMarkets(
        VERIFIED_CANDIDATE_MARKETS.map((c, idx) => ({
          address: c.providerMarketId || `moxie-market-slot-${idx + 1}`,
          providerMarketId: c.providerMarketId || `POLY-slot-${idx + 1}`,
          title: c.title,
          rules: c.rules,
          status: 1,
          markE6: String(c.initialMarkE6 || 500000),
          indexE6: String(c.initialMarkE6 || 500000),
          closeTime: String(
            c.closeTimeMs ? Math.floor(c.closeTimeMs / 1000) : 1791172800
          ),
          assetIndex: idx + 1,
          oracleUpdatedAt: String(Math.floor(Date.now() / 1000)),
        }))
      );
    }

    // 4. Asynchronously upsert to Neon cache if markets were fetched
    if (fetchedMarkets.length > 0) {
      upsertMarketsCache(fetchedMarkets).catch((err) => {
        console.warn("[api/markets] Background Neon upsert failed:", err);
      });
    }

    return NextResponse.json(fetchedMarkets, {
      headers: {
        "cache-control": "no-store, max-age=0",
        "x-source": "indexer-fallback",
      },
    });
  } catch (error: any) {
    console.error("[api/markets] Fatal error:", error);
    return NextResponse.json(filterValidMarkets(VERIFIED_CANDIDATE_MARKETS), {
      headers: { "x-source": "hardcoded-fallback" },
    });
  }
}