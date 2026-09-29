import { NextResponse } from "next/server";
import { DEVNET_DEPLOYMENT } from "@/lib/contracts";

export async function GET() {
  return NextResponse.json({
    cluster: DEVNET_DEPLOYMENT.cluster,
    rpcUrl: DEVNET_DEPLOYMENT.rpcUrl,
    percolatorProgramId: DEVNET_DEPLOYMENT.percolatorProgramId,
    matcherProgramId: DEVNET_DEPLOYMENT.matcherProgramId,
    oracleProgramId: DEVNET_DEPLOYMENT.oracleProgramId,
    marketAccount: DEVNET_DEPLOYMENT.marketAccount,
    usdcMint: DEVNET_DEPLOYMENT.usdcMint,
    collateralVault: DEVNET_DEPLOYMENT.collateralVault,
    importedRecord: DEVNET_DEPLOYMENT.importedRecord,
    lpPortfolio: DEVNET_DEPLOYMENT.lpPortfolio,
    matcherContext: DEVNET_DEPLOYMENT.matcherContext,
    matcherDelegate: DEVNET_DEPLOYMENT.matcherDelegate,
    demoTraderPortfolio: DEVNET_DEPLOYMENT.demoTraderPortfolio,
    indexerUrl: process.env.MOXIE_API_URL || null,
  });
}
