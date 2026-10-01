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

// In-memory rate limiting: 1 request per 20 seconds per pubkey
const rateLimitMap = new Map<string, number>();

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

    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(recipient);
    } catch {
      return NextResponse.json({ error: "Invalid recipient address" }, { status: 400 });
    }

    const payer = getPayerKeypair();
    if (!payer) {
      return NextResponse.json(
        {
          error: "Faucet keypair not configured (set DEVNET_PAYER_SECRET on Vercel)",
        },
        { status: 503 }
      );
    }

    // Rate limit check
    const pubkeyStr = recipientPubkey.toBase58();
    const lastRequest = rateLimitMap.get(pubkeyStr) || 0;
    const now = Date.now();
    if (now - lastRequest < 20_000) {
      const waitSec = Math.ceil((20_000 - (now - lastRequest)) / 1000);
      return NextResponse.json(
        { error: `Rate limited. Please wait ${waitSec}s before requesting Devnet SOL again.` },
        { status: 429 }
      );
    }

    const rpcUrl =
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      process.env.SOLANA_RPC_URL ||
      DEVNET_DEPLOYMENT.rpcUrl ||
      "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");

    // Transfer 0.1 SOL directly from server payer
    const amountLamports = BigInt(Math.floor(0.1 * LAMPORTS_PER_SOL));
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: recipientPubkey,
        lamports: amountLamports,
      })
    );

    const sig = await sendAndConfirmTransaction(connection, tx, [payer], {
      commitment: "confirmed",
    });

    rateLimitMap.set(pubkeyStr, now);

    return NextResponse.json({
      success: true,
      signature: sig,
      amount: "0.1 SOL",
      recipient: pubkeyStr,
      explorerUrl: `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
    });
  } catch (err: any) {
    console.error("SOL Faucet error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to transfer Devnet SOL" },
      { status: 500 }
    );
  }
}
