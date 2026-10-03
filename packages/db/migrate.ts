import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function runMigration() {
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL or POSTGRES_URL environment variable is required to run migration.");
    process.exit(1);
  }

  console.log("[db:migrate] Connecting to Neon Postgres...");
  const sql = neon(dbUrl.trim());

  const migrationFile = resolve(__dirname, "migrations/0000_neon_cache.sql");
  console.log(`[db:migrate] Reading migration: ${migrationFile}`);
  const migrationSql = readFileSync(migrationFile, "utf-8");

  console.log("[db:migrate] Executing migration statements...");
  const statements = migrationSql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  for (const stmt of statements) {
    console.log(`[db:migrate] Executing: ${stmt.slice(0, 50).replace(/\s+/g, " ")}...`);
    await sql(stmt);
  }

  console.log("[db:migrate] Migration applied successfully to Neon Postgres branch production!");
}

runMigration().catch((err) => {
  console.error("[db:migrate] Migration failed:", err);
  process.exit(1);
});