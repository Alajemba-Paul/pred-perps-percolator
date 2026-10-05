import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const require = createRequire(new URL("../package.json", import.meta.url));
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");

const PERCOLATOR = new PublicKey("Cerk8WwzTJY9YVF9SaHCtUjG15jNGHN26iqyNeUETqnC");
const MATCHER = new PublicKey("2w2uQ5t6fmiDybWEP9cdGwHUjA2GqgRUohcqMJcbfgbN");
const MARKET = new PublicKey("6T9L4mhZKjAv2YwYhuy2vJaeAcpuMGVkh2XcZTA7szoN");
const OLD_CONTEXT = new PublicKey("GhtKPreRFiBCVTpGSXkqWXbux1gtoCRayXQZgnHne3JA");
const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const PORTFOLIO_SPACE = 9563;
const CONTEXT_SPACE = 320;
const LP_SEED = "moxie-lp";

function loadEnvFile() {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
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

function ata(owner, mint) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), mint.toBuffer()],
    ATA_PROGRAM,
  )[0];
}

function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(Number(n)); return b; }
function u64(n) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; }
function u128(n) {
  let x = BigInt(n);
  const b = Buffer.alloc(16);
  b.writeBigUInt64LE(x & ((1n << 64n) - 1n), 0);
  b.writeBigUInt64LE(x >> 64n, 8);
  return b;
}
function i64(n) { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(n)); return b; }

function readU64(data, off) { return data.readBigUInt64LE(off); }
function readU32(data, off) { return data.readUInt32LE(off); }
function readU128(data, off) {
  return data.readBigUInt64LE(off) + (data.readBigUInt64LE(off + 8) << 64n);
}

async function send(connection, payer, ixs, signers) {
  const tx = new Transaction().add(
    ComputeBudgetProgram.requestHeapFrame({ bytes: 128 * 1024 }),
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
    ...ixs,
  );
  const sig = await sendAndConfirmTransaction(connection, tx, [payer, ...signers], { commitment: "confirmed" });
  console.log("signature", sig);
  return sig;
}

loadEnvFile();
const rpc = process.env.DEVNET_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keypairPath(), "utf8"))));
const connection = new Connection(rpc, "confirmed");
console.log("payer", payer.publicKey.toBase58());
console.log("rpc", rpc.replace(/\/v2\/[^/]+/, "/v2/***"));

const slot = await connection.getSlot("confirmed");
const expiry = BigInt(slot) + 100_000_000n;
const lpPortfolio = await PublicKey.createWithSeed(payer.publicKey, LP_SEED, PERCOLATOR);
const existing = await connection.getAccountInfo(lpPortfolio, "confirmed");

if (!existing) {
  const rent = await connection.getMinimumBalanceForRentExemption(PORTFOLIO_SPACE);
  await send(connection, payer, [
    SystemProgram.createAccountWithSeed({
      fromPubkey: payer.publicKey,
      newAccountPubkey: lpPortfolio,
      basePubkey: payer.publicKey,
      seed: LP_SEED,
      lamports: rent,
      space: PORTFOLIO_SPACE,
      programId: PERCOLATOR,
    }),
    new TransactionInstruction({
      programId: PERCOLATOR,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: false },
        { pubkey: MARKET, isSigner: false, isWritable: true },
        { pubkey: lpPortfolio, isSigner: false, isWritable: true },
      ],
      data: Buffer.from([1]),
    }),
  ], []);
  console.log("created LP portfolio", lpPortfolio.toBase58());
} else {
  console.log("LP portfolio already exists", lpPortfolio.toBase58());
}

const old = await connection.getAccountInfo(OLD_CONTEXT, "confirmed");
if (!old || old.data.length < 320) throw new Error("old matcher context missing");
const S = 64;
const context = Keypair.generate();
const [delegate] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("matcher"),
    MARKET.toBuffer(),
    lpPortfolio.toBuffer(),
    payer.publicKey.toBuffer(),
    MATCHER.toBuffer(),
    context.publicKey.toBuffer(),
  ],
  PERCOLATOR,
);
const init = Buffer.concat([
  Buffer.from([6]),
  u32(readU32(old.data, S + 48)),
  u32(readU32(old.data, S + 52)),
  u32(readU32(old.data, S + 56)),
  u32(readU32(old.data, S + 60)),
  u32(readU32(old.data, S + 64)),
  u32(readU32(old.data, S + 144)),
  u32(readU32(old.data, S + 148)),
  u32(readU32(old.data, S + 68)),
  u64(expiry),
  u128(readU128(old.data, S + 80)),
  u128(readU128(old.data, S + 96)),
  u128(readU128(old.data, S + 112)),
  u32(readU32(old.data, S + 152)),
  i64((1n << 63n) - 3n),
  i64((1n << 63n) - 2n),
  i64((1n << 63n) - 1n),
  u32(10_000),
  u32(10_000),
]);
if (init.length !== 125) throw new Error(`matcher init is ${init.length} bytes, expected 125`);
const contextRent = await connection.getMinimumBalanceForRentExemption(CONTEXT_SPACE);
await send(connection, payer, [
  SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: context.publicKey,
    lamports: contextRent,
    space: CONTEXT_SPACE,
    programId: MATCHER,
  }),
  new TransactionInstruction({
    programId: MATCHER,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      { pubkey: delegate, isSigner: false, isWritable: false },
      { pubkey: context.publicKey, isSigner: false, isWritable: true },
      { pubkey: PERCOLATOR, isSigner: false, isWritable: false },
      { pubkey: MARKET, isSigner: false, isWritable: false },
      { pubkey: lpPortfolio, isSigner: false, isWritable: false },
    ],
    data: init,
  }),
], [context]);
console.log("matcher context", context.publicKey.toBase58());
console.log("matcher delegate", delegate.toBase58());

const lpData = (await connection.getAccountInfo(lpPortfolio, "confirmed")).data;
const portfolioId = readU64(lpData, 9539);
const sequence = readU64(lpData, 9547);
const cfg = Buffer.alloc(28);
cfg[0] = 68;
u64(portfolioId).copy(cfg, 1);
u64(sequence).copy(cfg, 9);
cfg[17] = 1;
cfg.writeUInt16LE(500, 18);
u64(expiry).copy(cfg, 20);
await send(connection, payer, [
  new TransactionInstruction({
    programId: PERCOLATOR,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      { pubkey: MARKET, isSigner: false, isWritable: false },
      { pubkey: lpPortfolio, isSigner: false, isWritable: true },
      { pubkey: MATCHER, isSigner: false, isWritable: false },
      { pubkey: context.publicKey, isSigner: false, isWritable: false },
      { pubkey: delegate, isSigner: false, isWritable: false },
    ],
    data: cfg,
  }),
], []);

const marketInfo = await connection.getAccountInfo(MARKET, "confirmed");
const mint = new PublicKey(marketInfo.data.subarray(48, 80));
try {
  const source = ata(payer.publicKey, mint);
  const vaultAuth = PublicKey.findProgramAddressSync([Buffer.from("vault"), MARKET.toBuffer()], PERCOLATOR)[0];
  const vault = ata(vaultAuth, mint);
  const bal = await connection.getTokenAccountBalance(source, "confirmed").catch(() => null);
  const raw = BigInt(bal?.value?.amount || "0");
  if (raw > 0n) {
    const after = (await connection.getAccountInfo(lpPortfolio, "confirmed")).data;
    const amount = raw > 100_000_000n ? 100_000_000n : raw;
    const deposit = Buffer.concat([Buffer.from([3]), u64(readU64(after, 9539)), u64(readU64(after, 9547)), u128(amount)]);
    await send(connection, payer, [
      new TransactionInstruction({
        programId: PERCOLATOR,
        keys: [
          { pubkey: payer.publicKey, isSigner: true, isWritable: false },
          { pubkey: MARKET, isSigner: false, isWritable: true },
          { pubkey: lpPortfolio, isSigner: false, isWritable: true },
          { pubkey: source, isSigner: false, isWritable: true },
          { pubkey: vault, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
        ],
        data: deposit,
      }),
    ], []);
    console.log("deposited", amount.toString(), "token units into the LP");
  } else {
    console.log("payer has no test USDC. The LP can authorize trades, but it cannot pay a loss until you deposit.");
  }
} catch (err) {
  console.log("skipped USDC deposit:", err.message || err);
}

const out = {
  lpPortfolio: lpPortfolio.toBase58(),
  matcherContext: context.publicKey.toBase58(),
  matcherDelegate: delegate.toBase58(),
  expirySlot: expiry.toString(),
};
mkdirSync("apps/web/public", { recursive: true });
writeFileSync("apps/web/public/lp.json", JSON.stringify(out, null, 2) + "\n");
console.log("\nWrote apps/web/public/lp.json");
console.log("Set these on Vercel, then redeploy:");
console.log("NEXT_PUBLIC_LP_PORTFOLIO=" + out.lpPortfolio);
console.log("NEXT_PUBLIC_MATCHER_CONTEXT=" + out.matcherContext);
console.log("NEXT_PUBLIC_MATCHER_DELEGATE=" + out.matcherDelegate);
