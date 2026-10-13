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
const EMPTY = 0;
const args = process.argv.slice(2);
const freshGroup = args.includes("--fresh-group");
const targetFlag = args.indexOf("--target-slot");
const targetSlot = targetFlag === -1 ? null : Number(args[targetFlag + 1]);
if (targetSlot !== null && (!Number.isInteger(targetSlot) || targetSlot < 0 || targetSlot > 7)) {
  throw new Error("--target-slot must be an integer from 0 to 7");
}

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
  const configured = view.getUint32(498, true);
  const nextMarketId = view.getBigUint64(1013, true);
  const freeCount = view.getUint16(214, true);
  const capacity = Math.max(configured, Math.min(8, Math.floor((data.length - 1190) / 1813)));
  const slots = [];
  for (let assetIndex = 0; assetIndex < capacity; assetIndex++) {
    if (assetIndex >= configured) {
      slots.push({ assetIndex, marketId: 0n, lifecycle: EMPTY, empty: true });
      continue;
    }
    const off = 1702 + assetIndex * 1813;
    if (off + 26 > data.length) break;
    slots.push({
      assetIndex,
      marketId: view.getBigUint64(off, true),
      lifecycle: data[off + 16],
      empty: false,
    });
  }
  return { nextMarketId, configured, capacity, freeCount, slots };
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

function activatePercolatorData(assetIndex, marketId, price, authority) {
  return Buffer.concat([
    Buffer.from([40, 0]),
    u16(assetIndex),
    u64(marketId),
    u64(0),
    u64(0),
    u64(price),
    u128(0),
    authority,
    authority,
    authority,
    authority,
  ]);
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

function readMapped() {
  try {
    const raw = JSON.parse(readFileSync("deployments/devnet-markets.json", "utf8"));
    return Array.isArray(raw.markets) ? raw.markets : [];
  } catch {
    return [];
  }
}

function priceE6(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n <= 1) return Math.round(n * 1_000_000);
  if (Number.isInteger(n) && n <= 1_000_000) return n;
  return null;
}

async function jupiterMarkets() {
  const used = new Set(readMapped().map((row) => row.providerMarketId));
  const key = process.env.JUPITER_API_KEY;
  const base = (process.env.JUPITER_PREDICTION_BASE_URL || "https://api.jup.ag/prediction/v1").replace(/\/$/, "");
  const found = [];
  let eventCount = 0;
  if (!key) console.log("JUPITER_API_KEY is not set for the rotate script");
  if (key) {
    for (let start = 0; start < 80 && found.length < 8; start += 20) {
      const query = new URLSearchParams({ includeMarkets: "true", filter: "live", start: String(start), end: String(start + 20) });
      const res = await fetch(`${base}/events?${query}`, { headers: { "x-api-key": key, accept: "application/json" } });
      if (!res.ok) throw new Error("Jupiter events " + res.status);
      const payload = await res.json();
      const events = Array.isArray(payload) ? payload : payload.events || payload.data || payload.items || [];
      if (!Array.isArray(events) || events.length === 0) break;
      eventCount += events.length;
      for (const event of events) {
        for (const market of event.markets || []) {
          const providerMarketId = market.marketId || market.id;
          if (!providerMarketId || used.has(providerMarketId) || found.some((row) => row.providerMarketId === providerMarketId)) continue;
          const pricing = market.pricing || {};
          const bid = priceE6(pricing.sellYesPriceUsd);
          const ask = priceE6(pricing.buyYesPriceUsd);
          const close = Date.parse(market.metadata?.closeTime || market.closeTime || "");
          if (bid === null || ask === null || bid <= 0 || ask >= 1_000_000 || ask <= bid) continue;
          if (!Number.isFinite(close) || close < Date.now() + 15 * 60_000) continue;
          const mark = Math.round((bid + ask) / 2);
          const title = `${event.metadata?.title || event.title || providerMarketId} — ${market.metadata?.title || market.title || ""}`.trim();
          found.push({ providerMarketId, title, initialMarkE6: mark, closeTimeMs: close });
          if (found.length === 8) break;
        }
      }
    }
  }
  console.log("Jupiter events", eventCount, "new markets", found.length, "already deployed", used.size);
  if (found.length === 0 && existsSync("deployments/jupiter-live-market.json")) {
    const one = JSON.parse(readFileSync("deployments/jupiter-live-market.json", "utf8"));
    if (one?.providerMarketId && !used.has(one.providerMarketId)) found.push(one);
    else if (one?.providerMarketId) console.log(one.providerMarketId, "is already deployed");
  }
  return found;
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
const markets = await jupiterMarkets();
if (markets.length === 0) throw new Error("No new Jupiter market left to activate. The last smoke market is already on devnet, or the live list had no priced open markets.");

function lifecycleName(slot) {
  if (slot.empty) return "empty";
  return { 2: "active", 3: "drain-only", 4: "retired", 5: "recovery" }[slot.lifecycle] || String(slot.lifecycle);
}

console.log(`configured=${decoded.configured} capacity=${decoded.capacity} freeRetired=${decoded.freeCount} nextMarketId=${decoded.nextMarketId}`);
console.log("market slots:");
for (const slot of decoded.slots) {
  console.log(`  slot ${slot.assetIndex} market=${slot.marketId} lifecycle=${slot.lifecycle} (${lifecycleName(slot)})`);
}

const inScope = (slot) => targetSlot === null || slot.assetIndex === targetSlot;

async function activateAt(assetIndex, market, mapped) {
  info = await connection.getAccountInfo(MARKET, "confirmed");
  decoded = readSlots(new Uint8Array(info.data));
  const marketId = decoded.nextMarketId;
  console.log("activating", market.providerMarketId, "into slot", assetIndex);
  const sig = await send(connection, payer, new TransactionInstruction({
    programId: PERCOLATOR,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      { pubkey: MARKET, isSigner: false, isWritable: true },
    ],
    data: activatePercolatorData(assetIndex, marketId, market.initialMarkE6, payer.publicKey.toBuffer()),
  }));
  console.log("activated", market.providerMarketId, "slot", assetIndex, "market", marketId.toString(), sig);
  mapped.push({
    providerMarketId: market.providerMarketId,
    assetIndex,
    marketId: marketId.toString(),
    title: market.title,
    signature: sig,
  });
  mkdirSync("deployments", { recursive: true });
  writeFileSync("deployments/devnet-markets.json", JSON.stringify({
    updatedAt: new Date().toISOString(),
    marketGroup: MARKET.toBase58(),
    markets: mapped,
  }, null, 2) + "\n");
}

const mapped = readMapped();
let cursor = 0;
let activated = 0;
while (cursor < markets.length) {
  info = await connection.getAccountInfo(MARKET, "confirmed");
  decoded = readSlots(new Uint8Array(info.data));
  const frontier = decoded.slots.find((slot) => slot.empty && slot.assetIndex === decoded.configured && inScope(slot));
  if (!frontier || decoded.freeCount !== 0) break;
  await activateAt(frontier.assetIndex, markets[cursor], mapped);
  cursor += 1;
  activated += 1;
}
if (activated > 0) {
  info = await connection.getAccountInfo(MARKET, "confirmed");
  decoded = readSlots(new Uint8Array(info.data));
  const empty = decoded.slots.filter((slot) => slot.empty).map((slot) => slot.assetIndex);
  console.log("activated", activated, "market(s). wrote deployments/devnet-markets.json");
  console.log("empty slots left:", empty.length ? empty.join(", ") : "none");
  console.log("slot 0 cannot be replaced. A drain-only slot with positions cannot be replaced either.");
  process.exit(0);
}

const retired = decoded.slots.find((slot) => inScope(slot) && slot.lifecycle === RETIRED);
if (retired && decoded.freeCount > 0) {
  console.log("slot", retired.assetIndex, "is already retired. Activating there.");
  await activateAt(retired.assetIndex, markets[cursor] || markets[0], mapped);
  process.exit(0);
}

const retireOrder = decoded.slots
  .filter((slot) => inScope(slot) && !slot.empty && slot.lifecycle !== RETIRED && slot.lifecycle !== EMPTY)
  .sort((left, right) => {
    const rank = (slot) => (slot.lifecycle === DRAIN || slot.lifecycle === RECOVERY ? 0 : expired.has(slot.marketId.toString()) ? 1 : 2);
    return rank(left) - rank(right);
  });

for (const slot of retireOrder) {
  if (slot.assetIndex === 0) {
    console.log("slot 0 is", lifecycleName(slot) + ". The program rejects retire when the asset index is 0, so it cannot be rotated.");
    continue;
  }
  if (slot.lifecycle !== ACTIVE && slot.lifecycle !== DRAIN && slot.lifecycle !== RECOVERY) {
    console.log("slot", slot.assetIndex, "lifecycle", slot.lifecycle, "is not retirable. Skipping.");
    continue;
  }
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
    if (cursor >= markets.length) throw new Error("no Jupiter market left to activate");
    await activateAt(slot.assetIndex, markets[cursor], mapped);
    process.exit(0);
  } catch (err) {
    const text = err.message || String(err);
    if (text.includes("0x15")) {
      console.log("slot", slot.assetIndex, "lifecycle", slot.lifecycle, "is locked (0x15 EngineLockActive). Open positions block retire. Trying the next slot.");
    } else {
      console.log("slot", slot.assetIndex, "retire failed. Trying the next slot.", text.split("\n")[0]);
    }
  }
}

if (freshGroup) {
  console.log("[rotate] No slot on this group can be reused. Starting a new market group.");
  const { spawnSync } = await import("node:child_process");
  const payerPath = keypairPath();
  const rpc = process.env.DEVNET_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const result = spawnSync("cargo", [
    "run", "--quiet", "--manifest-path", "tools/moxie-bootstrap/Cargo.toml", "--",
    rpc,
    "vendor/percolator-prog/target/deploy/percolator_prog-keypair.json",
    "programs/moxie-matcher/target/deploy/moxie_matcher-keypair.json",
    "programs/moxie-oracle/target/deploy/moxie_oracle-keypair.json",
    "config/percolator.market-group.json",
    "deployments/devnet.local.json",
    payerPath,
    "deployments/jupiter-live-market.json",
  ], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
  const deployment = JSON.parse(readFileSync("deployments/devnet.local.json", "utf8"));
  const imported = deployment.importedMarkets?.[0];
  writeFileSync("deployments/devnet-markets.json", JSON.stringify({
    updatedAt: new Date().toISOString(),
    marketGroup: deployment.marketAccount,
    markets: imported ? [{
      providerMarketId: imported.providerMarketId,
      assetIndex: imported.assetIndex,
      marketId: String(imported.marketId),
      title: markets[0].title,
    }] : [],
  }, null, 2) + "\n");
  console.log("new market group", deployment.marketAccount);
  console.log("Set NEXT_PUBLIC_MARKET_ACCOUNT to that address on Vercel, then redeploy. Slot 0 is the group base. The Jupiter market is the next slot.");
  process.exit(0);
}

console.error("[rotate] No empty slot, and no occupied slot could be retired. Slot 0 cannot be retired. Re-run with --fresh-group to create a new market group.");
process.exit(1);
