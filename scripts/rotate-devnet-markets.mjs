import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const require = createRequire(new URL("../package.json", import.meta.url));
const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  ComputeBudgetProgram,
} = require("@solana/web3.js");

const PERCOLATOR = new PublicKey("Cerk8WwzTJY9YVF9SaHCtUjG15jNGHN26iqyNeUETqnC");
const ORACLE = new PublicKey("AecrmxU7nvFAVEAy7LcJbEpTFPXax3ByyouKANGSGuD5");
const MARKET = new PublicKey("6T9L4mhZKjAv2YwYhuy2vJaeAcpuMGVkh2XcZTA7szoN");
const ORACLE_CONFIG = new PublicKey("78hrLhgJLdDZGj93rbo6CidrjeWeh2DANZYUYC4jATZY");
const ACTIVE = 2;
const DRAIN = 3;
const RETIRED = 4;
const RECOVERY = 5;

function keypairPath() {
  if (process.env.SOLANA_KEYPAIR && existsSync(process.env.SOLANA_KEYPAIR)) return process.env.SOLANA_KEYPAIR;
  try {
    const text = execFileSync("solana", ["config", "get"], { encoding: "utf8" });
    const found = text.match(/^Keypair Path:\s+(.+)$/m)?.[1]?.trim();
    if (found && existsSync(found)) return found;
  } catch {}
  const fallback = join(homedir(), ".config", "solana", "id.json");
  if (existsSync(fallback)) return fallback;
  throw new Error("No Solana keypair. Set SOLANA_KEYPAIR or run solana-keygen.");
}

function u16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; }
function u64(n) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; }
function i64(n) { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(n)); return b; }
function u128(n) { const b = Buffer.alloc(16); const x = BigInt(n); b.writeBigUInt64LE(x & ((1n << 64n) - 1n), 0); b.writeBigUInt64LE(x >> 64n, 8); return b; }
function sha(text) { return createHash("sha256").update(text).digest(); }

function readSlots(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const max = view.getUint32(498, true);
  const nextMarketId = view.getBigUint64(1013, true);
  const slots = [];
  const limit = max > 0 && max <= 64 ? max : 8;
  for (let assetIndex = 0; assetIndex < limit; assetIndex++) {
    const off = 1702 + assetIndex * 1813;
    if (off + 26 > data.length) break;
    slots.push({
      assetIndex,
      marketId: view.getBigUint64(off, true),
      lifecycle: data[off + 16],
    });
  }
  return { nextMarketId, slots };
}

async function send(connection, payer, ix) {
  const tx = new Transaction().add(
    ComputeBudgetProgram.requestHeapFrame({ bytes: 128 * 1024 }),
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
    ix,
  );
  const latest = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = latest.blockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, preflightCommitment: "confirmed" });
  for (let i = 0; i < 40; i++) {
    const status = await connection.getSignatureStatuses([sig], { searchTransactionHistory: true });
    const value = status.value[0];
    if (value?.err) throw new Error(sig + " " + JSON.stringify(value.err));
    if (value && (value.confirmationStatus === "confirmed" || value.confirmationStatus === "finalized")) return sig;
    const height = await connection.getBlockHeight("confirmed");
    if (height > latest.lastValidBlockHeight) throw new Error("Blockhash not found for " + sig);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("timed out waiting for " + sig);
}

function retireData(assetIndex, marketId, nowSlot) {
  return Buffer.concat([
    Buffer.from([40, 2]),
    u16(assetIndex),
    u64(marketId),
    u64(0),
    u64(nowSlot),
    u64(0),
    u128(0),
    Buffer.alloc(128),
  ]);
}

function activateData(market, assetIndex, marketId, nowSec) {
  const close = BigInt(Math.floor(market.closeTimeMs / 1000));
  const hard = close - 60n;
  const reduce = hard - 30n;
  const restricted = reduce - 30n;
  if (restricted <= BigInt(nowSec)) throw new Error("market closes too soon: " + market.providerMarketId);
  return Buffer.concat([
    Buffer.from([5]),
    sha(market.providerMarketId),
    sha(String(market.yesAssetId)),
    sha(String(market.noAssetId)),
    sha(market.title),
    sha(market.rules),
    i64(close),
    u16(assetIndex),
    u64(marketId),
    u64(market.initialMarkE6),
    u64(0),
    i64(restricted),
    i64(reduce),
    i64(hard),
  ]);
}

async function indexedRows() {
  const raw = process.env.MOXIE_API_URL || "https://pred-perps-percolator.onrender.com";
  try {
    const res = await fetch(raw.replace(/\/v1$/, "") + "/v1/markets");
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function advanceLifecycle(connection, payer, record) {
  await send(connection, payer, new TransactionInstruction({
    programId: ORACLE,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      { pubkey: ORACLE_CONFIG, isSigner: false, isWritable: false },
      { pubkey: record, isSigner: false, isWritable: true },
      { pubkey: MARKET, isSigner: false, isWritable: true },
      { pubkey: PERCOLATOR, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([6]),
  }));
}

async function jupiterMarkets() {
  const path = "deployments/jupiter-live-market.json";
  if (!existsSync(path)) return [];
  const one = JSON.parse(readFileSync(path, "utf8"));
  return one?.providerMarketId ? [one] : [];
}

const rpc = process.env.DEVNET_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keypairPath(), "utf8"))));
const connection = new Connection(rpc, "confirmed");
console.log("payer", payer.publicKey.toBase58());

let info = await connection.getAccountInfo(MARKET, "confirmed");
if (!info) throw new Error("market account missing");
let decoded = readSlots(new Uint8Array(info.data));
const rows = await indexedRows();
const nowSecIndex = Math.floor(Date.now() / 1000);
const expired = new Set(rows.filter((row) => Number(row.closeTime) > 0 && Number(row.closeTime) < nowSecIndex).map((row) => String(row.marketId)));
const recordByMarket = new Map(rows.filter((row) => row.address && row.marketId).map((row) => [String(row.marketId), row.address]));
const slotNow = await connection.getSlot("confirmed");

console.log("market slots:");
for (const slot of decoded.slots) {
  console.log(`  slot ${slot.assetIndex} market=${slot.marketId} lifecycle=${slot.lifecycle}`);
}

const candidates = decoded.slots
  .filter((slot) => slot.assetIndex > 0 && slot.marketId !== 0n && slot.lifecycle !== RETIRED)
  .sort((left, right) => {
    const rank = (slot) => (slot.lifecycle === DRAIN || slot.lifecycle === RECOVERY ? 0 : expired.has(slot.marketId.toString()) ? 1 : 2);
    return rank(left) - rank(right);
  });

for (const slot of candidates) {
  const record = recordByMarket.get(slot.marketId.toString());
  if (record && expired.has(slot.marketId.toString())) {
    try {
      await advanceLifecycle(connection, payer, new PublicKey(record));
      console.log("advanced lifecycle for slot", slot.assetIndex);
    } catch (err) {
      console.log("lifecycle advance skipped for slot", slot.assetIndex, (err.message || err).split("\n")[0]);
    }
  }
  try {
    const sig = await send(connection, payer, new TransactionInstruction({
      programId: PERCOLATOR,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: false },
        { pubkey: MARKET, isSigner: false, isWritable: true },
      ],
      data: retireData(slot.assetIndex, slot.marketId, slotNow),
    }));
    console.log("retired slot", slot.assetIndex, sig);
    break;
  } catch (err) {
    const text = err.message || String(err);
    if (text.includes("0x15")) {
      console.log("slot", slot.assetIndex, "blocked by 0x15 (EngineLockActive: positions or market lock). Trying the next slot.");
    } else {
      console.log("slot", slot.assetIndex, "retire failed. Trying the next slot.", text.split("\n")[0]);
    }
  }
}

info = await connection.getAccountInfo(MARKET, "confirmed");
decoded = readSlots(new Uint8Array(info.data));
const freeSlots = decoded.slots
  .filter((slot) => slot.assetIndex > 0 && slot.lifecycle === RETIRED)
  .map((slot) => slot.assetIndex);
if (freeSlots.length === 0) {
  console.error("[rotate] Tried every slot except 0. None came back retired. 0x15 means that slot still has positions or the market lock is on. The program will not free it.");
  process.exit(1);
}

const markets = await jupiterMarkets();
if (markets.length === 0) throw new Error("deployments/jupiter-live-market.json is missing");
const mapped = [];
const nowSec = Math.floor(Date.now() / 1000);
for (const assetIndex of freeSlots) {
  const market = markets[mapped.length];
  if (!market) break;
  const marketId = decoded.nextMarketId + BigInt(mapped.length);
  const [record] = PublicKey.findProgramAddressSync(
    [Buffer.from("imported"), ORACLE_CONFIG.toBuffer(), sha(market.providerMarketId)],
    ORACLE,
  );
  const sig = await send(connection, payer, new TransactionInstruction({
    programId: ORACLE,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      { pubkey: ORACLE_CONFIG, isSigner: false, isWritable: false },
      { pubkey: record, isSigner: false, isWritable: true },
      { pubkey: MARKET, isSigner: false, isWritable: true },
      { pubkey: PERCOLATOR, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: activateData(market, assetIndex, marketId, nowSec),
  }));
  console.log("activated", market.providerMarketId, "slot", assetIndex, "market", marketId.toString(), sig);
  mapped.push({
    providerMarketId: market.providerMarketId,
    assetIndex,
    marketId: marketId.toString(),
    title: market.title,
    signature: sig,
  });
}

mkdirSync("deployments", { recursive: true });
writeFileSync("deployments/devnet-markets.json", JSON.stringify({ updatedAt: new Date().toISOString(), markets: mapped }, null, 2) + "\n");
console.log("wrote deployments/devnet-markets.json");
if (mapped.length === 0) process.exit(1);
