import type { ApiMarket } from "./markets";

const LATEST_CLOSE_MS = Date.parse("2026-10-30T23:59:59Z");
const BASE = (process.env.JUPITER_PREDICTION_BASE_URL ?? "https://api.jup.ag/prediction/v1").replace(/\/$/, "");

type Book = { bid: number; ask: number };

let lastGood: ApiMarket[] = [];

function num(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function epochMs(value: unknown): number | undefined {
  const n = num(value);
  if (n !== undefined) return n < 10_000_000_000 ? n * 1000 : n;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function e6(value: unknown): number | undefined {
  const n = num(value);
  if (n === undefined || n < 0) return undefined;
  if (n <= 1) return Math.round(n * 1_000_000);
  if (Number.isInteger(n) && n <= 1_000_000) return n;
  return undefined;
}

function book(market: Record<string, unknown>): Book | null {
  const pricing = (market.pricing ?? {}) as Record<string, unknown>;
  const bid = e6(pricing.sellYesPriceUsd);
  const ask = e6(pricing.buyYesPriceUsd);
  if (bid === undefined || ask === undefined) return null;
  if (bid <= 0 || ask >= 1_000_000 || ask <= bid) return null;
  return { bid, ask };
}

function isOpen(status: unknown): boolean {
  const s = String(status ?? "").toLowerCase();
  return s === "open" || s === "active" || s === "trading" || s === "";
}

function badTitle(title: string): boolean {
  return (
    !title ||
    /^[0-9a-f]{64}$/i.test(title) ||
    title.startsWith("Unused Slot") ||
    title.startsWith("Percolator") ||
    title.includes("(Record #1)") ||
    /^Jupiter Live Market/i.test(title) ||
    title.startsWith("Open market #")
  );
}

function eventsOf(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (!payload || typeof payload !== "object") return [];
  const body = payload as Record<string, unknown>;
  for (const key of ["events", "data", "items"]) {
    if (Array.isArray(body[key])) return body[key] as Record<string, unknown>[];
  }
  return [];
}

async function page(start: number, apiKey: string): Promise<Record<string, unknown>[]> {
  const query = new URLSearchParams({
    includeMarkets: "true",
    filter: "live",
    start: String(start),
    end: String(start + 20),
  });
  const res = await fetch(`${BASE}/events?${query}`, {
    headers: { "x-api-key": apiKey, accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Jupiter ${res.status}`);
  return eventsOf(await res.json());
}

function toRow(market: Record<string, unknown>, eventId: string, prices: Book, index: number, stale = false): ApiMarket {
  const meta = (market.metadata ?? {}) as Record<string, unknown>;
  const title = String(meta.title ?? market.title ?? "").trim();
  const rules = [meta.rulesPrimary ?? market.rulesPrimary, meta.rulesSecondary ?? market.rulesSecondary]
    .filter((part) => typeof part === "string" && part)
    .join("\n\n");
  const id = String(market.marketId ?? market.id);
  const closeMs = epochMs(meta.closeTime ?? market.closeTime) ?? 0;
  const mid = Math.round((prices.bid + prices.ask) / 2);
  return {
    address: id,
    providerMarketId: id,
    title,
    rules: rules || title,
    slot: 0,
    assetIndex: index,
    marketId: id,
    status: 1,
    markE6: String(mid),
    indexE6: String(mid),
    closeTime: String(Math.floor(closeMs / 1000)),
    oracleUpdatedAt: new Date().toISOString(),
    providerEventId: eventId,
    yesBidE6: String(prices.bid),
    yesAskE6: String(prices.ask),
    stale,
  };
}

export async function listLiveJupiterMarkets(): Promise<ApiMarket[]> {
  const apiKey = process.env.JUPITER_API_KEY;
  const now = Date.now();
  if (!apiKey) {
    console.warn("[jupiter] JUPITER_API_KEY is not set");
    return lastGood.map((row) => ({ ...row, stale: true }));
  }

  try {
    const picked: ApiMarket[] = [];
    const seen = new Set<string>();
    for (let start = 0; start < 100 && picked.length < 8; start += 20) {
      const events = await page(start, apiKey);
      if (events.length === 0) break;
      for (const event of events) {
        const eventId = String(event.eventId ?? "");
        const markets = Array.isArray(event.markets) ? event.markets : [];
        for (const raw of markets) {
          if (!raw || typeof raw !== "object") continue;
          const market = raw as Record<string, unknown>;
          const meta = (market.metadata ?? {}) as Record<string, unknown>;
          const title = String(meta.title ?? market.title ?? "").trim();
          const id = String(market.marketId ?? market.id ?? "");
          const closeMs = epochMs(meta.closeTime ?? market.closeTime);
          const prices = book(market);
          if (!id || seen.has(id) || badTitle(title) || !isOpen(meta.status ?? market.status)) continue;
          if (closeMs === undefined || closeMs <= now || closeMs > LATEST_CLOSE_MS) continue;
          if (!prices) continue;
          seen.add(id);
          picked.push(toRow(market, eventId, prices, picked.length));
          if (picked.length >= 8) break;
        }
        if (picked.length >= 8) break;
      }
    }
    if (picked.length > 0) {
      lastGood = picked;
      return picked;
    }
  } catch (err) {
    console.warn("[jupiter] live list failed:", err);
  }

  return lastGood.map((row) => ({ ...row, stale: true }));
}
