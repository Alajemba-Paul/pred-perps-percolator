-- Moxie Prediction Perps - Neon Postgres Cache Schema
-- Migration 0000_neon_cache.sql

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

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  wallet_pubkey TEXT NOT NULL UNIQUE,
  privy_user_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS portfolios (
  id SERIAL PRIMARY KEY,
  wallet_pubkey TEXT NOT NULL,
  portfolio_address TEXT NOT NULL,
  market_address TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS marks (
  id SERIAL PRIMARY KEY,
  market_address TEXT NOT NULL,
  mark_e6 TEXT NOT NULL,
  observed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_markets_status_close_time ON markets (status, close_time);
CREATE INDEX IF NOT EXISTS idx_portfolios_wallet ON portfolios (wallet_pubkey);
CREATE INDEX IF NOT EXISTS idx_marks_market ON marks (market_address);
