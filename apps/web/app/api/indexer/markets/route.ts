import { NextResponse } from "next/server";
import { listLiveJupiterMarkets } from "@/lib/jupiter-live";

export const dynamic = "force-dynamic";
export const maxDuration = 35;

export async function GET() {
  const markets = await listLiveJupiterMarkets();
  const stale = markets.some((market) => market.stale);
  return NextResponse.json(markets, {
    headers: {
      "cache-control": "no-store, max-age=0",
      "x-source": stale ? "jupiter-stale" : "jupiter",
    },
  });
}
