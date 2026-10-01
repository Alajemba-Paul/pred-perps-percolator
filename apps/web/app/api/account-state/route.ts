import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  DEVNET_DEPLOYMENT,
  getUserAta,
  deriveUserPortfolioAddress,
  decodePortfolioSummary,
} from "@/lib/contracts";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get("address");

    if (!address) {
      return NextResponse.json({ error: "Missing address query parameter" }, { status: 400 });
    }

    let userPubkey: PublicKey;
    try {
      userPubkey = new PublicKey(address);
    } catch {
      return NextResponse.json({ error: "Invalid Solana address" }, { status: 400 });
    }

    const rpcUrl =
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      process.env.SOLANA_RPC_URL ||
      DEVNET_DEPLOYMENT.rpcUrl ||
      "https://api.devnet.solana.com";

    const connection = new Connection(rpcUrl, "confirmed");

    // Execute balance and account queries in parallel
    const solPromise = connection.getBalance(userPubkey).then(
      (lamports) => ({ sol: lamports / LAMPORTS_PER_SOL, solError: null }),
      (err) => ({ sol: null, solError: err?.message || "RPC timeout" })
    );

    let usdcPromise: Promise<{ usdc: number | null; usdcError: string | null }>;
    if (!DEVNET_DEPLOYMENT.usdcMint) {
      usdcPromise = Promise.resolve({ usdc: null, usdcError: "USDC mint not configured" });
    } else {
      const mintPubkey = new PublicKey(DEVNET_DEPLOYMENT.usdcMint);
      const userAta = getUserAta(userPubkey, mintPubkey);
      usdcPromise = connection.getTokenAccountBalance(userAta).then(
        (tokenRes) => ({ usdc: tokenRes.value.uiAmount ?? 0, usdcError: null }),
        (err) => {
          const msg = String(err?.message || "").toLowerCase();
          if (
            msg.includes("could not find account") ||
            msg.includes("account not found") ||
            msg.includes("does not exist")
          ) {
            return { usdc: 0, usdcError: null };
          }
          return { usdc: null, usdcError: err?.message || "RPC timeout" };
        }
      );
    }

    const portfolioPromise = deriveUserPortfolioAddress(userPubkey)
      .then(async (portfolioPubkey) => {
        const accInfo = await connection.getAccountInfo(portfolioPubkey);
        if (accInfo && accInfo.data.length >= DEVNET_DEPLOYMENT.portfolioAccountLen) {
          const summary = decodePortfolioSummary(accInfo.data);
          return {
            hasPortfolio: true,
            portfolioPubkey: portfolioPubkey.toBase58(),
            portfolioData: summary,
          };
        }
        return {
          hasPortfolio: false,
          portfolioPubkey: portfolioPubkey.toBase58(),
          portfolioData: null,
        };
      })
      .catch((err) => ({
        hasPortfolio: false,
        portfolioPubkey: null,
        portfolioData: null,
        portfolioError: err?.message,
      }));

    const [solRes, usdcRes, portfolioRes] = await Promise.all([
      solPromise,
      usdcPromise,
      portfolioPromise,
    ]);

    let rpcHost = "api.devnet.solana.com";
    try {
      rpcHost = new URL(rpcUrl).host;
    } catch {}

    return NextResponse.json({
      address: userPubkey.toBase58(),
      sol: solRes.sol,
      solError: solRes.solError,
      usdc: usdcRes.usdc,
      usdcError: usdcRes.usdcError,
      hasPortfolio: portfolioRes.hasPortfolio,
      portfolioPubkey: portfolioRes.portfolioPubkey,
      portfolioData: portfolioRes.portfolioData,
      rpcHost,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to fetch account state" },
      { status: 500 }
    );
  }
}
