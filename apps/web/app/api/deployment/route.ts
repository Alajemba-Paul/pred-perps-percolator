import { NextResponse } from "next/server";
import { DEVNET_DEPLOYMENT } from "@/lib/contracts";
import { getIndexerUrl } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const hasSecret = Boolean(process.env.DEVNET_PAYER_SECRET);

  const indexerUrl = getIndexerUrl();
  let indexerUrlHost: string | null = null;
  if (indexerUrl) {
    try {
      indexerUrlHost = new URL(indexerUrl).host;
    } catch {
      indexerUrlHost = indexerUrl;
    }
  }

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
    faucetConfigured: hasSecret,
    indexerUrlHost,
    indexerUrl,
  });
}
