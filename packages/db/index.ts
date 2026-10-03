import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.ts";

export * from "./schema.ts";

export const CUTOFF_TIMESTAMP_SEC = 1791158400; // 2026-10-05T00:00:00Z

export function getDatabaseUrl(): string | null {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url || typeof url !== "string" || !url.trim()) {
    return null;
  }
  return url.trim();
}

let cachedDb: ReturnType<typeof drizzle> | null = null;
let cachedSql: ReturnType<typeof neon> | null = null;

export function getNeonSql(): ReturnType<typeof neon> | null {
  const url = getDatabaseUrl();
  if (!url) return null;
  if (!cachedSql) {
    cachedSql = neon(url);
  }
  return cachedSql;
}

export function getDb() {
  const url = getDatabaseUrl();
  if (!url) return null;
  if (!cachedDb) {
    const sql = getNeonSql()!;
    cachedDb = drizzle(sql, { schema });
  }
  return cachedDb;
}

export async function initSchema(): Promise<boolean> {
  const sql = getNeonSql();
  if (!sql) return false;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS markets (
        address TEXT PRIMARY KEY,
        provider_market_id TEXT NOT NULL,
        title TEXT NOT NULL,
        rules TEXT NOT NULL,
        status INTEGER NOT NULL,
        mark_e6 TEXT NOT NULL,
        index_e6 TEXT NOT NULL,
        close_time TEXT NOT NULL,
        asset_index INTEGER NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        wallet_pubkey TEXT NOT NULL UNIQUE,
        privy_user_id TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS portfolios (
        id SERIAL PRIMARY KEY,
        wallet_pubkey TEXT NOT NULL,
        portfolio_address TEXT NOT NULL,
        market_address TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS marks (
        id SERIAL PRIMARY KEY,
        market_address TEXT NOT NULL,
        mark_e6 TEXT NOT NULL,
        observed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_markets_status ON markets (status, close_time);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_portfolios_wallet ON portfolios (wallet_pubkey);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_marks_market ON marks (market_address);`;
    return true;
  } catch (err) {
    console.warn("[neon-db] Failed to init schema:", err);
    return false;
  }
}

export interface MarketCacheInput {
  address: string;
  providerMarketId?: string;
  title: string;
  rules?: string;
  status: number;
  markE6: string;
  indexE6?: string;
  closeTime?: string;
  assetIndex: number;
}

export async function upsertMarketsCache(items: MarketCacheInput[]): Promise<number> {
  const sql = getNeonSql();
  if (!sql || items.length === 0) return 0;

  let count = 0;
  for (const item of items) {
    try {
      const address = item.address;
      const providerMarketId = item.providerMarketId || address;
      const title = item.title;
      const rules = item.rules || "";
      const status = Number(item.status ?? 0);
      const markE6 = String(item.markE6 ?? "500000");
      const indexE6 = String(item.indexE6 ?? markE6);
      const closeTime = String(item.closeTime ?? "0");
      const assetIndex = Number(item.assetIndex ?? 0);

      await sql`
        INSERT INTO markets (address, provider_market_id, title, rules, status, mark_e6, index_e6, close_time, asset_index, updated_at)
        VALUES (${address}, ${providerMarketId}, ${title}, ${rules}, ${status}, ${markE6}, ${indexE6}, ${closeTime}, ${assetIndex}, NOW())
        ON CONFLICT (address) DO UPDATE SET
          provider_market_id = EXCLUDED.provider_market_id,
          title = EXCLUDED.title,
          rules = EXCLUDED.rules,
          status = EXCLUDED.status,
          mark_e6 = EXCLUDED.mark_e6,
          index_e6 = EXCLUDED.index_e6,
          close_time = EXCLUDED.close_time,
          asset_index = EXCLUDED.asset_index,
          updated_at = NOW();
      `;
      count++;
    } catch (e) {
      console.warn(`[neon-db] Failed to upsert market ${item.address}:`, e);
    }
  }
  return count;
}

export async function getMarketsFromNeon(): Promise<any[] | null> {
  const sql = getNeonSql();
  if (!sql) return null;

  try {
    const rows = await sql`
      SELECT address, provider_market_id, title, rules, status, mark_e6, index_e6, close_time, asset_index, updated_at
      FROM markets
      WHERE status != 4 AND close_time >= ${String(CUTOFF_TIMESTAMP_SEC)}
      ORDER BY asset_index ASC;
    `;

    if (!rows || rows.length === 0) return null;

    return rows.map((r: any) => ({
      address: r.address,
      providerMarketId: r.provider_market_id,
      title: r.title,
      rules: r.rules,
      status: Number(r.status),
      markE6: r.mark_e6,
      indexE6: r.index_e6,
      closeTime: r.close_time,
      assetIndex: Number(r.asset_index),
      oracleUpdatedAt: String(Math.floor(new Date(r.updated_at).getTime() / 1000)),
    }));
  } catch (err) {
    console.warn("[neon-db] Error fetching markets from Neon:", err);
    return null;
  }
}

export async function upsertPortfolioRecord(walletPubkey: string, portfolioAddress: string, marketAddress: string): Promise<boolean> {
  const sql = getNeonSql();
  if (!sql) return false;

  try {
    await sql`
      INSERT INTO portfolios (wallet_pubkey, portfolio_address, market_address, created_at)
      VALUES (${walletPubkey}, ${portfolioAddress}, ${marketAddress}, NOW());
    `;
    return true;
  } catch (err) {
    console.warn("[neon-db] Error upserting portfolio:", err);
    return false;
  }
}

export async function recordMarkObservation(marketAddress: string, markE6: string): Promise<boolean> {
  const sql = getNeonSql();
  if (!sql) return false;

  try {
    await sql`
      INSERT INTO marks (market_address, mark_e6, observed_at)
      VALUES (${marketAddress}, ${markE6}, NOW());
    `;
    return true;
  } catch (err) {
    console.warn("[neon-db] Error recording mark:", err);
    return false;
  }
}
