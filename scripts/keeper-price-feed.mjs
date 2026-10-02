import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

// Load local .env if present
if (fs.existsSync(".env")) {
  try { process.loadEnvFile(".env"); } catch (e) {}
}

const rpcUrl =
  process.env.DEVNET_RPC_URL ||
  process.env.SOLANA_RPC_URL ||
  "https://solana-devnet.g.alchemy.com/v2/alch_2YqivxuFL93yY6EaRp0aO";

function getRpcConnection() {
  return new Connection(rpcUrl, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 30000,
  });
}

function loadReporterKeypair() {
  if (process.env.DEVNET_PAYER_SECRET) {
    let s = process.env.DEVNET_PAYER_SECRET.trim();
    if (!s.startsWith("[")) s = "[" + s;
    if (!s.endsWith("]")) s = s + "]";
    const raw = JSON.parse(s);
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  }

  const defaultKeypairPath = path.join(os.homedir(), ".config", "solana", "id.json");
  if (fs.existsSync(defaultKeypairPath)) {
    const secret = JSON.parse(fs.readFileSync(defaultKeypairPath, "utf-8"));
    return Keypair.fromSecretKey(Uint8Array.from(secret));
  }

  throw new Error("No reporter keypair found (checked DEVNET_PAYER_SECRET and ~/.config/solana/id.json)");
}

const PERCOLATOR_PROGRAM_ID = new PublicKey(
  process.env.PERCOLATOR_PROGRAM_ID || "Cerk8WwzTJY9YVF9SaHCtUjG15jNGHN26iqyNeUETqnC"
);

// Active imported prediction perps on Solana Devnet
const ACTIVE_MARKETS = [
  {
    name: "Columbus: Mees Rottgering vs Edward Winter",
    account: "ZxBtBZxNJJb77cAVn3F7dPXw5NLw9G2bWjv3uYGUtLZ",
    marketGroup: "2nkiwyGf8Lw1k49RQ1WEn2U3VBHq4SagKY3qbAkerLMr",
    assetIndex: 1,
    marketId: 2n,
    baseMarkE6: 958800n,
    minMarkE6: 940000n,
    maxMarkE6: 975000n,
  },
  {
    name: "Dota 2: BetBoom Team vs OG (BO3)",
    account: "DKmVXDGjLwdZdqXYVeVxxxM3G9L8t9nviFWspExQSD4C",
    marketGroup: "Do5eHrkRbftuUbv3N2GPV7i2543ZyHRdtHDaMyXY8qJf",
    assetIndex: 1,
    marketId: 2n,
    baseMarkE6: 750000n,
    minMarkE6: 720000n,
    maxMarkE6: 780000n,
  },
];

async function updateMarketPrice(conn, reporter, m) {
  const marketGroup = new PublicKey(m.marketGroup);
  const slot = await conn.getSlot();

  // Dynamic realistic mark price fluctuation (simulate active orderbook spread)
  const delta = BigInt(Math.floor((Math.random() - 0.48) * 3000));
  let nextMarkE6 = m.baseMarkE6 + delta;
  if (nextMarkE6 < m.minMarkE6) nextMarkE6 = m.minMarkE6;
  if (nextMarkE6 > m.maxMarkE6) nextMarkE6 = m.maxMarkE6;
  m.baseMarkE6 = nextMarkE6;

  // Observation sequence monotonically increasing
  const seq = BigInt(Date.now());

  // PushAuthMark instruction on Percolator:
  // tag: 63
  // asset_index: u16
  // market_id: u64
  // now_slot: u64
  // mark_e6: u64
  // observation_sequence: u64
  // authority_epoch: u64
  const buf = Buffer.alloc(43);
  buf[0] = 63;
  buf.writeUInt16LE(m.assetIndex, 1);
  buf.writeBigUInt64LE(m.marketId, 3);
  buf.writeBigUInt64LE(BigInt(slot), 11);
  buf.writeBigUInt64LE(nextMarkE6, 19);
  buf.writeBigUInt64LE(seq, 27);
  buf.writeBigUInt64LE(0n, 35);

  const tx = new Transaction().add(
    new TransactionInstruction({
      programId: PERCOLATOR_PROGRAM_ID,
      keys: [
        { pubkey: reporter.publicKey, isSigner: true, isWritable: false },
        { pubkey: marketGroup, isSigner: false, isWritable: true },
      ],
      data: buf,
    })
  );

  tx.feePayer = reporter.publicKey;
  const latestBlockhash = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = latestBlockhash.blockhash;
  tx.sign(reporter);

  const rawTx = tx.serialize();
  const sig = await conn.sendRawTransaction(rawTx, { skipPreflight: false });

  // Poll signature status for fast confirmation without hanging websockets
  let confirmed = false;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const status = await conn.getSignatureStatus(sig);
    const confirmation = status?.value?.confirmationStatus;
    if (confirmation === "confirmed" || confirmation === "finalized") {
      confirmed = true;
      break;
    }
  }

  return {
    name: m.name,
    account: m.account,
    marketGroup: m.marketGroup,
    assetIndex: m.assetIndex,
    marketId: m.marketId.toString(),
    markE6: nextMarkE6.toString(),
    markFormatted: (Number(nextMarkE6) / 1e6).toFixed(4),
    signature: sig,
    confirmed,
  };
}

async function notifyIndexerPrices(updates) {
  const indexerUrls = [
    process.env.MOXIE_API_URL,
    "http://127.0.0.1:8787",
    "http://localhost:8787",
  ].filter(Boolean);

  for (const baseUrl of indexerUrls) {
    try {
      const url = baseUrl.replace(/\/+$/, "") + "/v1/prices";
      const payload = {
        prices: updates.map((u) => ({
          address: u.account,
          markE6: u.markE6,
        })),
      };
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        console.log(`[keeper] Indexer prices updated at ${baseUrl}`);
        break;
      }
    } catch (e) {
      // ignore unreachable local indexer
    }
  }

  for (const baseUrl of indexerUrls) {
    try {
      const url = baseUrl.replace(/\/+$/, "") + "/v1/sync";
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      if (res.ok) {
        console.log(`[keeper] Indexer sync triggered at ${baseUrl}`);
        break;
      }
    } catch (e) {}
  }
}

async function runKeeperCycle(conn, reporter) {
  console.log(`\n[keeper] === Price Observation Cycle at ${new Date().toISOString()} ===`);
  const updates = [];

  for (const m of ACTIVE_MARKETS) {
    try {
      const result = await updateMarketPrice(conn, reporter, m);
      console.log(`[keeper] ✓ ${result.name}:`);
      console.log(`         Mark: $${result.markFormatted} | Slot: Asset #${result.assetIndex}`);
      console.log(`         Tx: https://explorer.solana.com/tx/${result.signature}?cluster=devnet`);
      updates.push(result);
    } catch (err) {
      console.error(`[keeper] ✗ Failed to update ${m.name}:`, err?.message || err);
    }
  }

  if (updates.length > 0) {
    await notifyIndexerPrices(updates);
  }
}

async function main() {
  const reporter = loadReporterKeypair();
  const conn = getRpcConnection();

  console.log("==================================================");
  console.log("   Moxie Prediction Perps Live Price Keeper       ");
  console.log("==================================================");
  console.log(`Reporter: ${reporter.publicKey.toBase58()}`);
  console.log(`Program:  ${PERCOLATOR_PROGRAM_ID.toBase58()}`);

  const balance = await conn.getBalance(reporter.publicKey);
  console.log(`Balance:  ${balance / 1e9} SOL on Devnet`);

  const runOnce = process.argv.includes("--once");
  await runKeeperCycle(conn, reporter);

  if (runOnce) {
    console.log("[keeper] Single run completed (--once).");
    process.exit(0);
  }

  const intervalMs = Number(process.env.KEEPER_PRICE_INTERVAL_MS || "60000");
  console.log(`[keeper] Running price feed loop every ${intervalMs / 1000}s... (Ctrl+C to stop)`);
  setInterval(() => {
    runKeeperCycle(conn, reporter).catch((e) => console.error("[keeper] Cycle failed:", e));
  }, intervalMs);
}

main().catch((err) => {
  console.error("[keeper] Fatal error:", err);
  process.exit(1);
});
