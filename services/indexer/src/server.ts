import fs from "node:fs";

// Load .env only if file exists locally (Render supplies env vars via process.env)
if (fs.existsSync(".env")) {
  try {
    process.loadEnvFile(".env");
  } catch (err) {
    console.warn("[indexer] Note: could not load local .env:", err);
  }
}

import { createIndexerApi } from "./api.ts";
import { MoxieIndexer } from "./indexer.ts";
import { loadSnapshot, saveSnapshot } from "./persistence.ts";
import { SolanaRpcSource } from "./rpc-source.ts";
import { upsertMarketsCache } from "../../../packages/db/index.ts";

const required = (name: string) => {
  const x = process.env[name];
  if (!x) throw new Error(`${name} is required`);
  return x;
};

const rpcUrl =
  process.env.SOLANA_RPC_URL ||
  process.env.DEVNET_RPC_URL ||
  "https://api.devnet.solana.com";

const oracleProgramId = required("MOXIE_ORACLE_PROGRAM_ID");
const percolatorProgramId = required("PERCOLATOR_PROGRAM_ID");

console.log(`[indexer] Starting Moxie Indexer on cluster: ${process.env.MOXIE_CLUSTER || "devnet"}`);
console.log(`[indexer] Oracle: ${oracleProgramId}`);
console.log(`[indexer] Percolator: ${percolatorProgramId}`);
console.log(`[indexer] RPC: ${rpcUrl.replace(/(api-key|v2)\/[^/?]+/i, "$1/***")}`);

const source = new SolanaRpcSource(rpcUrl, oracleProgramId, percolatorProgramId);
const indexer = new MoxieIndexer(source);
const snapshot = process.env.INDEXER_SNAPSHOT ?? ".data/moxie-index.json";

try {
  const restored = await loadSnapshot(indexer.store, snapshot);
  if (restored) {
    console.log(`[indexer] Restored snapshot with ${indexer.store.markets.size} market(s).`);
  }
} catch (e) {
  console.warn("[indexer] Snapshot restore skipped:", e);
}

try {
  await indexer.sync();
  if (indexer.store.markets.size === 0) {
    console.warn(
      "[indexer] 0 markets indexed from Solana chain. If bootstrap hasn't run or market account is new, /v1/markets will be empty until on-chain markets are detected."
    );
  } else {
    console.log(`[indexer] Initial sync succeeded: ${indexer.store.markets.size} market(s) active.`);
  }
  await saveSnapshot(indexer.store, snapshot);
  await syncMarketsToNeon();
} catch (e) {
  console.error("[indexer] Initial sync failed (will retry in background):", e);
}

const interval = Number(process.env.INDEXER_POLL_MS ?? "5000");
setInterval(async () => {
  try {
    await indexer.sync();
    await saveSnapshot(indexer.store, snapshot);
    await syncMarketsToNeon();
  } catch (e) {
    console.error("[indexer] Background sync failed:", e);
  }
}, interval).unref();

// Parse port strictly, rejecting NaN or <= 0 (e.g. port 0 binds an ephemeral port and breaks Render health check)
const rawPort = Number(process.env.PORT);
const port = !Number.isNaN(rawPort) && rawPort > 0 ? rawPort : 8787;
const host = "0.0.0.0";

const server = createIndexerApi(indexer.store, () => indexer.sync());
server.listen(port, host, () => {
  const addr = server.address();
  const actualPort = typeof addr === "object" && addr?.port ? addr.port : port;
  console.log(`[indexer] Moxie indexer API listening on http://${host}:${actualPort}`);
});

async function syncMarketsToNeon() {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) return;
  try {
    const list = [...indexer.store.markets.values()].map((m) => ({
      address: m.address,
      providerMarketId: m.providerMarketId || m.address,
      title: m.title,
      rules: m.rules,
      status: Number(m.status),
      markE6: String(m.markE6),
      indexE6: String(m.indexE6),
      closeTime: String(m.closeTime),
      assetIndex: Number(m.assetIndex),
    }));
    await upsertMarketsCache(list);
  } catch (err) {
    console.warn("[indexer] Neon cache upsert error:", err);
  }
}