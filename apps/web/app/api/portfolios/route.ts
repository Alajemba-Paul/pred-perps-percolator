import { NextResponse } from "next/server";
import { upsertPortfolioRecord, getDatabaseUrl } from "../../../lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { walletPubkey, portfolioAddress, marketAddress } = body;

    if (!walletPubkey || !portfolioAddress) {
      return NextResponse.json(
        { error: "Missing required fields: walletPubkey and portfolioAddress" },
        { status: 400 }
      );
    }

    if (!getDatabaseUrl()) {
      return NextResponse.json({ ok: true, skipped: true, reason: "DATABASE_URL not configured" });
    }

    const saved = await upsertPortfolioRecord(
      String(walletPubkey),
      String(portfolioAddress),
      String(marketAddress || "global")
    );

    return NextResponse.json({ ok: true, saved });
  } catch (err: any) {
    console.warn("[api/portfolios] Error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Internal error" },
      { status: 500 }
    );
  }
}
