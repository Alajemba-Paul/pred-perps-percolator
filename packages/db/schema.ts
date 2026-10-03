import { pgTable, text, integer, timestamp, serial } from "drizzle-orm/pg-core";

export const markets = pgTable("markets", {
  address: text("address").primaryKey(),
  providerMarketId: text("provider_market_id").notNull(),
  title: text("title").notNull(),
  rules: text("rules").notNull(),
  status: integer("status").notNull(),
  markE6: text("mark_e6").notNull(),
  indexE6: text("index_e6").notNull(),
  closeTime: text("close_time").notNull(),
  assetIndex: integer("asset_index").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  walletPubkey: text("wallet_pubkey").notNull().unique(),
  privyUserId: text("privy_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const portfolios = pgTable("portfolios", {
  id: serial("id").primaryKey(),
  walletPubkey: text("wallet_pubkey").notNull(),
  portfolioAddress: text("portfolio_address").notNull(),
  marketAddress: text("market_address").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const marks = pgTable("marks", {
  id: serial("id").primaryKey(),
  marketAddress: text("market_address").notNull(),
  markE6: text("mark_e6").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).defaultNow().notNull(),
});

export type MarketRow = typeof markets.$inferSelect;
export type NewMarketRow = typeof markets.$inferInsert;
export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type PortfolioRow = typeof portfolios.$inferSelect;
export type NewPortfolioRow = typeof portfolios.$inferInsert;
export type MarkRow = typeof marks.$inferSelect;
export type NewMarkRow = typeof marks.$inferInsert;
