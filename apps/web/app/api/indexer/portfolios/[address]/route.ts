import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { DEVNET_DEPLOYMENT, decodePortfolioSummary } from "@/lib/contracts";
import { getIndexerUrl } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 35;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;
  if (!address) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }

  const targetAddress =
    address === "demo-trader-portfolio"
      ? DEVNET_DEPLOYMENT.demoTraderPortfolio
      : address;

  const indexerBase = getIndexerUrl();

  if (indexerBase) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(`${indexerBase}/v1/portfolios/${encodeURIComponent(targetAddress)}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }
    } catch (err) {
      console.warn(`Indexer portfolio fetch to ${indexerBase} failed, falling back to direct Devnet RPC:`, err);
    }
  }

  // Fallback: direct Solana Devnet RPC query
  try {
    const rpcUrl =
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      DEVNET_DEPLOYMENT.rpcUrl ||
      "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    const pubkey = new PublicKey(targetAddress);
    const info = await connection.getAccountInfo(pubkey);

    if (!info) {
      return NextResponse.json({ error: "Portfolio account not found on-chain", exists: false }, { status: 404 });
    }

    if (info.data.length < 9563) {
      return NextResponse.json({ error: "Account data too small for Percolator portfolio" }, { status: 400 });
    }

    const decoded = decodePortfolioSummary(new Uint8Array(info.data));

    return NextResponse.json({
      address: targetAddress,
      owner: pubkey.toBase58(),
      slot: await connection.getSlot(),
      capital: decoded.capital.toString(),
      pnl: decoded.pnl.toString(),
      health: {
        valid: decoded.valid,
        equity: decoded.equity.toString(),
        initialRequirement: decoded.initialRequirement.toString(),
        maintenanceRequirement: decoded.maintenanceRequirement.toString(),
        liquidationDeficit: decoded.liquidationDeficit.toString(),
        worstCaseLoss: "0",
      },
      positions: decoded.positions.map((p) => ({
        slot: p.slot,
        assetIndex: p.assetIndex,
        marketId: p.marketId,
        side: p.side,
        sizeQ: p.sizeQ,
        entryNotional: p.entryNotional,
        stale: p.stale,
      })),
    });
  } catch (err: any) {
    console.error("Failed to query onchain portfolio:", err);
    return NextResponse.json({ error: err.message || "Failed to query portfolio" }, { status: 500 });
  }
}
