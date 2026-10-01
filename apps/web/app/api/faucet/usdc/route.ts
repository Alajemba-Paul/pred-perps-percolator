import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  SystemProgram,
} from "@solana/web3.js";
import { DEVNET_DEPLOYMENT, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@/lib/contracts";
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

    if (!DEVNET_DEPLOYMENT.usdcMint) {
      return NextResponse.json(
        { error: "USDC mint not configured" },
        { status: 400 }
      );
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
        { error: `Rate limited. Please wait ${waitSec}s before requesting Test USDC again.` },
        { status: 429 }
      );
    }

    const mintPubkey = new PublicKey(DEVNET_DEPLOYMENT.usdcMint);
    const rpcUrl =
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      process.env.SOLANA_RPC_URL ||
      DEVNET_DEPLOYMENT.rpcUrl ||
      "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");

    // Check mint authority
    const mintInfo = await connection.getAccountInfo(mintPubkey);
    if (!mintInfo) {
      return NextResponse.json({ error: "USDC mint account not found on devnet" }, { status: 400 });
    }

    // Mint authority is located at offset 4..36 in SPL Mint layout
    let mintAuthorityPubkey: PublicKey | null = null;
    if (mintInfo.data.length >= 36 && mintInfo.data[0] === 1) {
      mintAuthorityPubkey = new PublicKey(mintInfo.data.subarray(4, 36));
    }

    if (
      mintAuthorityPubkey &&
      !mintAuthorityPubkey.equals(payer.publicKey) &&
      payer.publicKey.toBase58() !== DEVNET_DEPLOYMENT.marketAuthority
    ) {
      return NextResponse.json(
        { error: "payer cannot mint" },
        { status: 403 }
      );
    }

    const tx = new Transaction();

    // 1. Derive or Create Associated Token Account
    const [ata] = PublicKey.findProgramAddressSync(
      [recipientPubkey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mintPubkey.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const ataInfo = await connection.getAccountInfo(ata);
    if (!ataInfo) {
      tx.add(
        new TransactionInstruction({
          programId: ASSOCIATED_TOKEN_PROGRAM_ID,
          keys: [
            { pubkey: payer.publicKey, isSigner: true, isWritable: true },
            { pubkey: ata, isSigner: false, isWritable: true },
            { pubkey: recipientPubkey, isSigner: false, isWritable: false },
            { pubkey: mintPubkey, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          ],
          data: Buffer.alloc(0),
        })
      );
    }

    // 2. Mint 500 Test USDC (SPL Token MintTo: tag 7, 500_000_000 atoms)
    const amountAtoms = 500_000_000n;
    const mintData = Buffer.alloc(9);
    mintData.writeUInt8(7, 0);
    mintData.writeBigUInt64LE(amountAtoms, 1);

    tx.add(
      new TransactionInstruction({
        programId: TOKEN_PROGRAM_ID,
        keys: [
          { pubkey: mintPubkey, isSigner: false, isWritable: true },
          { pubkey: ata, isSigner: false, isWritable: true },
          { pubkey: payer.publicKey, isSigner: true, isWritable: false },
        ],
        data: mintData,
      })
    );

    const sig = await sendAndConfirmTransaction(connection, tx, [payer], {
      commitment: "confirmed",
    });

    rateLimitMap.set(pubkeyStr, now);

    return NextResponse.json({
      success: true,
      signature: sig,
      amount: "500 USDC",
      recipient: pubkeyStr,
      ata: ata.toBase58(),
      explorerUrl: `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
    });
  } catch (err: any) {
    console.error("USDC Faucet error:", err);
    const msg = String(err?.message || "");
    if (msg.toLowerCase().includes("owner does not match") || msg.toLowerCase().includes("custom program error: 0x4")) {
      return NextResponse.json({ error: "payer cannot mint" }, { status: 403 });
    }
    return NextResponse.json(
      { error: err.message || "Failed to mint Test USDC" },
      { status: 500 }
    );
  }
}
