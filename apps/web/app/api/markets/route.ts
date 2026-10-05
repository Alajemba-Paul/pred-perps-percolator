import { NextResponse } from "next/server";
import { listLiveJupiterMarkets } from "@/lib/jupiter-live";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const markets = await listLiveJupiterMarkets();
  return NextResponse.json(markets, {
    headers: {
      "cache-control": "no-store, max-age=0",
      "x-source": markets.some((market) => market.stale) ? "jupiter-stale" : "jupiter",
    },
  });
}
