import { NextResponse } from "next/server";
import { listTradableDevnetMarkets } from "@/lib/open-markets";

export const dynamic = "force-dynamic";
export const maxDuration = 35;

export async function GET() {
  const markets = await listTradableDevnetMarkets();
  return NextResponse.json(markets, {
    headers: {
      "cache-control": "no-store, max-age=0",
      "x-source": "devnet-slots",
    },
  });
}