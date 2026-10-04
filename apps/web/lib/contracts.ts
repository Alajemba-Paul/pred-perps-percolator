if (typeof window !== "undefined" && !(window as any).Buffer) {
  (window as any).Buffer = Buffer;
}
import { PublicKey, Connection, Transaction, TransactionInstruction, SystemProgram, ComputeBudgetProgram } from "@solana/web3.js";

export const DEVNET_DEPLOYMENT = {
  cluster: "devnet",
  rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com",
  percolatorProgramId: process.env.NEXT_PUBLIC_PERCOLATOR_PROGRAM_ID || "Cerk8WwzTJY9YVF9SaHCtUjG15jNGHN26iqyNeUETqnC",
  matcherProgramId: process.env.NEXT_PUBLIC_MATCHER_PROGRAM_ID || "2w2uQ5t6fmiDybWEP9cdGwHUjA2GqgRUohcqMJcbfgbN",
  oracleProgramId: process.env.NEXT_PUBLIC_ORACLE_PROGRAM_ID || "AecrmxU7nvFAVEAy7LcJbEpTFPXax3ByyouKANGSGuD5",
  oracleConfig: "78hrLhgJLdDZGj93rbo6CidrjeWeh2DANZYUYC4jATZY",
  marketAccount: process.env.NEXT_PUBLIC_MARKET_ACCOUNT || process.env.MOXIE_MARKET_ACCOUNT || "6T9L4mhZKjAv2YwYhuy2vJaeAcpuMGVkh2XcZTA7szoN",
  marketAuthority: "HcPnKBfkcBCw6fyEorVZAhRqWbZ8AqhaSqGkxXe6tUfm",
  usdcMint: process.env.NEXT_PUBLIC_USDC_MINT || "99NrJRkUwMCyo7TqZCq5GgHxhyfw4hQ5Dn7b8L5TxrkQ",
  collateralVault: process.env.NEXT_PUBLIC_COLLATERAL_VAULT || "2MEe65ZV46ksGFcC5Zb3pmVaF7rxLaWUwxwy7ijdSH5a",
  vaultAuthority: "Ho3YAHV8aFzoN3MwfQgc4YpfbtJnHQ3HwLAj1Xaowu9",
  importedRecord: process.env.NEXT_PUBLIC_IMPORTED_RECORD || "137RRKMrbRZueEcUbZZmDRP6VWFanFndhPjzi5WkeMss",
  lpPortfolio: process.env.NEXT_PUBLIC_LP_PORTFOLIO || "Hu6uGoDbponT6edQd6K1GtiKmSisfhsAUoZ86hUzAvUn",
  matcherContext: process.env.NEXT_PUBLIC_MATCHER_CONTEXT || "GhtKPreRFiBCVTpGSXkqWXbux1gtoCRayXQZgnHne3JA",
  matcherDelegate: process.env.NEXT_PUBLIC_MATCHER_DELEGATE || "5PkXaSsF4mS2K9wbMYdqiN6kkPh2CwQLAjMuYfcMhgtp",
  demoTraderPortfolio: "8xTjKWT52eQeSqwuS4mw6DMX7wCMFhVW57tefu11AFSX",
  portfolioAccountLen: 9563,
  portfolioSeed: "moxie",
  tokenProgramId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
};

export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

const out = (tag: number, length: number) => { const b = new Uint8Array(length); b[0] = tag; return b; };
const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const u16 = (v: DataView, o: number, x: number) => v.setUint16(o, x, true);
const u64 = (v: DataView, o: number, x: bigint) => v.setBigUint64(o, x, true);
const i128 = (v: DataView, o: number, x: bigint) => { const n = x < 0n ? (1n << 128n) + x : x; u64(v, o, n & ((1n << 64n) - 1n)); u64(v, o + 8, n >> 64n); };
const u128 = (v: DataView, o: number, x: bigint) => { if (x < 0n) throw new RangeError("negative u128"); i128(v, o, x); };

export const buildCreatePortfolioData = (): Uint8Array => Uint8Array.of(1);

export function buildDepositData(portfolioIdOrAmount: bigint, sequenceOpt?: bigint, amountOpt?: bigint): Uint8Array {
  const portfolioId = amountOpt !== undefined ? portfolioIdOrAmount : 0n;
  const sequence = amountOpt !== undefined ? (sequenceOpt ?? 0n) : 0n;
  const amount = amountOpt !== undefined ? amountOpt : portfolioIdOrAmount;
  const b = out(3, 33), v = view(b);
  u64(v, 1, portfolioId);
  u64(v, 9, sequence);
  u128(v, 17, amount);
  return b;
}

export function buildWithdrawData(portfolioId: bigint, sequence: bigint, amount: bigint): Uint8Array {
  const b = out(4, 33), v = view(b);
  u64(v, 1, portfolioId);
  u64(v, 9, sequence);
  u128(v, 17, amount);
  return b;
}

export type TradeRequest = {
  assetIndex: number;
  sizeQ: bigint;
  limitPriceE6: bigint;
  marketId?: bigint;
  traderPortfolioId?: bigint;
  traderPositionEpoch?: bigint;
  lpPortfolioId?: bigint;
  lpPositionEpoch?: bigint;
  lpMatcherSequence?: bigint;
  feeBps?: bigint;
  backingFeeCapBps?: number;
};

// Exact layout matching vendor/percolator-prog @ 4b974f1 (85 bytes):
// Tag (1) + traderPortfolioId (8) + traderPositionEpoch (8) + lpPortfolioId (8) + lpPositionEpoch (8) + lpMatcherSequence (8)
// + assetIndex (2) + marketId (8) + sizeQ (16) + feeBps (8) + limitPrice (8) + backingFeeCapBps (2) = 85 bytes
export function buildTradeCpiData(r: TradeRequest): Uint8Array {
  if (!r.sizeQ) throw new Error("trade size cannot be zero");
  const b = out(10, 85), v = view(b);
  let o = 1;
  const traderPortfolioId = r.traderPortfolioId ?? 0n;
  const traderPositionEpoch = r.traderPositionEpoch ?? 0n;
  const lpPortfolioId = r.lpPortfolioId ?? 2n;
  const lpPositionEpoch = r.lpPositionEpoch ?? 2n;
  const lpMatcherSequence = r.lpMatcherSequence ?? 2n;
  const marketId = r.marketId ?? 2n;
  const feeBps = r.feeBps ?? 30n;

  for (const x of [traderPortfolioId, traderPositionEpoch, lpPortfolioId, lpPositionEpoch, lpMatcherSequence]) {
    u64(v, o, x);
    o += 8;
  }
  u16(v, o, r.assetIndex); o += 2;
  u64(v, o, marketId); o += 8;
  i128(v, o, r.sizeQ); o += 16;
  u64(v, o, feeBps); o += 8;
  u64(v, o, r.limitPriceE6); o += 8;
  u16(v, o, r.backingFeeCapBps ?? 0);
  return b;
}

// Exact layout matching vendor/percolator-prog @ 4b974f1 (77 bytes):
export function buildTradeNoCpiData(r: {
  accountAPortfolioId: bigint;
  accountAPositionEpoch: bigint;
  accountBPortfolioId: bigint;
  accountBPositionEpoch: bigint;
  assetIndex: number;
  marketId: bigint;
  sizeQ: bigint;
  execPrice: bigint;
  feeBps: bigint;
  backingFeeCapBps?: number;
}): Uint8Array {
  if (!r.sizeQ) throw new Error("trade size cannot be zero");
  const b = out(6, 77), v = view(b);
  let o = 1;
  for (const x of [r.accountAPortfolioId, r.accountAPositionEpoch, r.accountBPortfolioId, r.accountBPositionEpoch]) {
    u64(v, o, x);
    o += 8;
  }
  u16(v, o, r.assetIndex); o += 2;
  u64(v, o, r.marketId); o += 8;
  i128(v, o, r.sizeQ); o += 16;
  u64(v, o, r.execPrice); o += 8;
  u64(v, o, r.feeBps); o += 8;
  u16(v, o, r.backingFeeCapBps ?? 0);
  return b;
}

export type DecodedImportedMarket = {
  status: number;
  assetIndex: number;
  marketId: bigint;
  externalCloseTime: bigint;
  lastSourceTimestamp: bigint;
  sequence: bigint;
  markE6: bigint;
  indexE6: bigint;
  fundingPremiumE6: bigint;
  fundingUnitE6: bigint;
};

export function decodeImportedMarket(b: Uint8Array): DecodedImportedMarket {
  if (b.length < 384) throw new Error("invalid imported market account length");
  const v = view(b);
  return {
    status: b[9],
    assetIndex: v.getUint16(10, true),
    externalCloseTime: v.getBigInt64(176, true),
    marketId: v.getBigUint64(184, true),
    lastSourceTimestamp: v.getBigInt64(256, true),
    sequence: v.getBigUint64(272, true),
    markE6: v.getBigUint64(280, true),
    indexE6: v.getBigUint64(288, true),
    fundingPremiumE6: v.getBigInt64(368, true),
    fundingUnitE6: v.getBigInt64(376, true),
  };
}

export type PortfolioPosition = {
  slot: number;
  assetIndex: number;
  marketId: string;
  side: "long" | "short";
  sizeQ: string;
  entryNotional: string;
  stale: boolean;
};

export type DecodedPortfolio = {
  portfolioId: bigint;
  positionEpoch: bigint;
  sequence: bigint;
  capital: bigint;
  pnl: bigint;
  equity: bigint;
  initialRequirement: bigint;
  maintenanceRequirement: bigint;
  liquidationDeficit: bigint;
  valid: boolean;
  positions: PortfolioPosition[];
};

const readU128 = (v: DataView, o: number) => v.getBigUint64(o, true) | (v.getBigUint64(o + 8, true) << 64n);
const readI128 = (v: DataView, o: number) => {
  const x = readU128(v, o);
  return x & (1n << 127n) ? x - (1n << 128n) : x;
};

export function decodePortfolioSummary(b: Uint8Array): DecodedPortfolio {
  if (b.length < 9563) throw new Error("invalid portfolio account length: " + b.length);
  const v = view(b);
  const base = 16;
  const capitalOffset = base + 100 + 32;
  const legsOffset = 356;
  const legSize = 139;
  const healthAt = 8852;

  const positions: PortfolioPosition[] = [];
  for (let slot = 0; slot < 16; slot++) {
    const o = legsOffset + slot * legSize;
    if (b[o] === 1) {
      positions.push({
        slot,
        assetIndex: v.getUint32(o + 1, true),
        marketId: v.getBigUint64(o + 5, true).toString(),
        side: b[o + 13] === 0 ? "long" : "short",
        sizeQ: readI128(v, o + 14).toString(),
        entryNotional: readU128(v, o + 30).toString(),
        stale: b[o + 138] === 1,
      });
    }
  }

  // PortfolioMatcherConfigV16 control is at offset 9531. position_epoch is bits 1..49:
  const control = v.getBigUint64(9531, true);
  const positionEpoch = (control >> 1n) & ((1n << 49n) - 1n);

  return {
    capital: readU128(v, capitalOffset),
    pnl: readI128(v, capitalOffset + 16),
    equity: readI128(v, healthAt),
    initialRequirement: readU128(v, healthAt + 16),
    maintenanceRequirement: readU128(v, healthAt + 32),
    liquidationDeficit: readU128(v, healthAt + 48),
    valid: b[healthAt + 120] === 1,
    positionEpoch,
    portfolioId: v.getBigUint64(9539, true),
    sequence: v.getBigUint64(9547, true),
    positions,
  };
}

export async function deriveUserPortfolioAddress(userPublicKey: PublicKey): Promise<PublicKey> {
  const percolatorProgramId = new PublicKey(DEVNET_DEPLOYMENT.percolatorProgramId);
  return await PublicKey.createWithSeed(
    userPublicKey,
    DEVNET_DEPLOYMENT.portfolioSeed,
    percolatorProgramId
  );
}

export function getUserAta(userPublicKey: PublicKey, mintPublicKey: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [userPublicKey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mintPublicKey.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}

export function createAssociatedTokenAccountInstruction(
  payer: PublicKey,
  associatedToken: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
  programId = TOKEN_PROGRAM_ID,
  associatedTokenProgramId = ASSOCIATED_TOKEN_PROGRAM_ID
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: programId, isSigner: false, isWritable: false },
    ],
    programId: associatedTokenProgramId,
    data: Buffer.alloc(0),
  });
}

export type MarketAssetSlot = {
  marketId: bigint;
  retiredSlot: bigint;
  lifecycle: number;
  targetPrice: bigint;
  effectivePrice: bigint;
};

export function decodeMarketAssetSlot(data: Uint8Array, assetIndex: number): MarketAssetSlot {
  if (data.length < 464 + 726) {
    throw new Error("Invalid market account length: " + data.length);
  }
  // dynamic_slot_offset = 464 + 726 + assetIndex * 1813 = 1190 + assetIndex * 1813
  // engine_slot_offset = dynamic_slot_offset + 512 = 1702 + assetIndex * 1813
  const engineOffset = 1702 + assetIndex * 1813;
  if (engineOffset + 35 > data.length) {
    throw new Error("Asset index " + assetIndex + " out of bounds in market account");
  }
  const v = view(data);
  return {
    marketId: v.getBigUint64(engineOffset, true),
    retiredSlot: v.getBigUint64(engineOffset + 8, true),
    lifecycle: data[engineOffset + 16],
    targetPrice: v.getBigUint64(engineOffset + 17, true),
    effectivePrice: v.getBigUint64(engineOffset + 25, true),
  };
}

export function decodeMarketHeader(data: Uint8Array): { nextMarketId: bigint } {
  if (data.length < 464 + 726) {
    throw new Error("Invalid market account length: " + data.length);
  }
  const v = view(data);
  return {
    nextMarketId: v.getBigUint64(1013, true),
  };
}

export type FreshChainState = {
  blockhash: string;
  lastValidBlockHeight: number;
  marketAccountData: Uint8Array;
  userPortfolioData: Uint8Array | null;
  lpPortfolioData: Uint8Array | null;
};

/**
 * Reads market account, user portfolio, and LP portfolio in the SAME RPC call as the fresh blockhash.
 * Uses a single batch JSON-RPC request for optimal speed and blockhash synchronization.
 */
export async function fetchFreshChainState(
  connection: Connection,
  userPublicKey: PublicKey
): Promise<FreshChainState> {
  const marketPubkey = new PublicKey(DEVNET_DEPLOYMENT.marketAccount);
  const userPortfolioPubkey = await deriveUserPortfolioAddress(userPublicKey);
  const lpPortfolioPubkey = new PublicKey(DEVNET_DEPLOYMENT.lpPortfolio);

  const rpcUrl = connection.rpcEndpoint;
  const addresses = [
    marketPubkey.toBase58(),
    userPortfolioPubkey.toBase58(),
    lpPortfolioPubkey.toBase58(),
  ];

  let blockhash = "";
  let lastValidBlockHeight = 0;
  let accountsData: (Uint8Array | null)[] = [null, null, null];

  // 1. Attempt standard Solana JSON-RPC batch request in a single HTTP network round-trip
  try {
    const batchBody = [
      { jsonrpc: "2.0", id: 1, method: "getLatestBlockhash", params: [{ commitment: "confirmed" }] },
      { jsonrpc: "2.0", id: 2, method: "getMultipleAccounts", params: [addresses, { encoding: "base64", commitment: "confirmed" }] },
    ];
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(batchBody),
    });
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json) && json.length === 2) {
        const bhResp = json.find((r: any) => r.id === 1);
        const accResp = json.find((r: any) => r.id === 2);
        if (bhResp?.result?.value?.blockhash && Array.isArray(accResp?.result?.value)) {
          blockhash = bhResp.result.value.blockhash;
          lastValidBlockHeight = bhResp.result.value.lastValidBlockHeight || 0;
          accountsData = accResp.result.value.map((acc: any) => {
            if (!acc || !acc.data || !acc.data[0]) return null;
            return Uint8Array.from(Buffer.from(acc.data[0], "base64"));
          });
        }
      }
    }
  } catch (batchErr) {
    console.warn("Batch RPC failed, falling back to parallel RPC:", batchErr);
  }

  // 2. Parallel fallback if batch returned empty or failed
  if (!blockhash || !accountsData[0]) {
    const [latestBlockhash, accInfos] = await Promise.all([
      connection.getLatestBlockhash("confirmed"),
      connection.getMultipleAccountsInfo([marketPubkey, userPortfolioPubkey, lpPortfolioPubkey], "confirmed"),
    ]);
    blockhash = latestBlockhash.blockhash;
    lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
    accountsData = accInfos.map((acc) => (acc ? acc.data : null));
  }

  if (!accountsData[0]) {
    throw new Error("Failed to load market account from Solana Devnet.");
  }

  return {
    blockhash,
    lastValidBlockHeight,
    marketAccountData: accountsData[0],
    userPortfolioData: accountsData[1],
    lpPortfolioData: accountsData[2],
  };
}
