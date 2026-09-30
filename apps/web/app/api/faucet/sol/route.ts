import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { DEVNET_DEPLOYMENT } from "@/lib/contracts";
import fs from "fs";

export const dynamic = "force-dynamic";

function getPayerKeypair(): Keypair | null {
  if (process.env.DEVNET_PAYER_SECRET) {
    try {
      const secret = JSON.parse(process.env.DEVNET_PAYER_SECRET);
      return Keypair.fromSecretKey(Uint8Array.from(secret));
    } catch (e) {
      console.error("Failed to parse DEVNET_PAYER_SECRET as JSON array", e);
    }
  }

  const idPaths = [
    "C:\\Users\\OBINNA\\.config\\solana\\id.json",
    process.env.HOME ? `${process.env.HOME}/.config/solana/id.json` : "",
  ].filter(Boolean);

  for (const p of idPaths) {
    if (p && fs.existsSync(p)) {
      try {
        const secret = JSON.parse(fs.readFileSync(p, "utf-8"));
        return Keypair.fromSecretKey(Uint8Array.from(secret));
      } catch (e) {
        // ignore local file error
      }
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { recipient } = await req.json();
    if (!recipient) {
      return NextResponse.json({ error: "Missing recipient address" }, { status: 400 });
    }

    const recipientPubkey = new PublicKey(recipient);
    const rpcUrl =
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      DEVNET_DEPLOYMENT.rpcUrl ||
      "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");

    const payer = getPayerKeypair();

    // 1. Try server payer direct transfer (0.1 SOL)
    if (payer) {
      try {
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: recipientPubkey,
            lamports: BigInt(Math.floor(0.1 * LAMPORTS_PER_SOL)),
          })
        );
        const sig = await sendAndConfirmTransaction(connection, tx, [payer]);
        return NextResponse.json({
          success: true,
          method: "payer_transfer",
          signature: sig,
          amount: "0.1 SOL",
          recipient: recipientPubkey.toBase58(),
        });
      } catch (err: any) {
        console.warn("Server payer transfer failed, attempting public airdrop fallback:", err);
      }
    }

    // 2. Fallback to public Devnet airdrop
    try {
      const airdropSig = await connection.requestAirdrop(
        recipientPubkey,
        Math.floor(0.5 * LAMPORTS_PER_SOL)
      );
      const latestBlockhash = await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction(
        { signature: airdropSig, ...latestBlockhash },
        "confirmed"
      );
      return NextResponse.json({
        success: true,
        method: "public_airdrop",
        signature: airdropSig,
        amount: "0.5 SOL",
        recipient: recipientPubkey.toBase58(),
      });
    } catch (airdropErr: any) {
      console.error("Public airdrop also failed:", airdropErr);
    }

    return NextResponse.json(
      {
        error: "Faucet keypair not configured (set DEVNET_PAYER_SECRET on Vercel)",
      },
      { status: 503 }
    );
  } catch (err: any) {
    console.error("SOL Faucet error:", err);
    return NextResponse.json({ error: err.message || "SOL faucet error" }, { status: 500 });
  }
}
