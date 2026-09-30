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
      return NextResponse.json({ error: "Mock USDC mint is not configured on Devnet." }, { status: 400 });
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

    const recipientPubkey = new PublicKey(recipient);
    const mintPubkey = new PublicKey(DEVNET_DEPLOYMENT.usdcMint);
    const rpcUrl =
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      DEVNET_DEPLOYMENT.rpcUrl ||
      "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");

    const tx = new Transaction();

    // 1. Derive ATA
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

    // 2. Mint 500 mock USDC (SPL Token MintTo: tag 7, amount 500_000_000 atoms)
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

    const sig = await sendAndConfirmTransaction(connection, tx, [payer]);

    return NextResponse.json({
      success: true,
      signature: sig,
      recipient: recipientPubkey.toBase58(),
      ata: ata.toBase58(),
      amount: "500 USDC",
    });
  } catch (err: any) {
    console.error("USDC Faucet error:", err);
    return NextResponse.json({ error: err.message || "USDC faucet error" }, { status: 500 });
  }
}
