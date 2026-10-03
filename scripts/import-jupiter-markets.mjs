import { mkdir, writeFile, readFile } from "node:fs/promises";
import fs from "node:fs";
import { JupiterPredictionSource } from "../packages/provider-adapter/src/jupiter.ts";

if (fs.existsSync(".env")) {
  try {
    process.loadEnvFile(".env");
  } catch (e) {}
}

// Cutoff: 5 October 2026 00:00:00 UTC (1791158400 sec / 1791158400000 ms)
export const CUTOFF_TIMESTAMP_MS = new Date("2026-10-05T00:00:00Z").getTime();

const ALREADY_IMPORTED_IDS = new Set([
  "POLY-5013959-0",
  "86fc6f6f6137b7307cac30d6d73f85af21bb9804eb7b143682a4546a9ea78c06",
  "b406280f15eb31f25dd0eece1eefe403f29d0d22a5b113269afa9573cc0546a3",
  "708a95e19c4438233b8b610bc0de672c46f6fb4cdfd8f25232f0aa7287fb11ac",
  "ZxBtBZxNJJb77cAVn3F7dPXw5NLw9G2bWjv3uYGUtLZ",
  "DKmVXDGjLwdZdqXYVeVxxxM3G9L8t9nviFWspExQSD4C",
  "137RRKMrbRZueEcUbZZmDRP6VWFanFndhPjzi5WkeMss",
  "POLY-5140154-0", // Aurora - closed Oct 1, 2026 (< Oct 5)
  "POLY-5174679-0", // Galorys - closed Oct 3, 2026 (< Oct 5)
]);

export const FALLBACK_CANDIDATES = [
  {
    providerMarketId: "POLY-601826",
    providerEventId: "POLY-45915",
    title: "Brazil Presidential Election: Flávio Bolsonaro",
    rules: "A presidential election is scheduled to take place in Brazil on October 4, 2026. Resolves to 1 (YES) if Flávio Bolsonaro wins, 0 (NO) otherwise.",
    initialMarkE6: 570000,
    closeTimeMs: 1791172740000, // 2026-10-05T03:59:00Z
  },
  {
    providerMarketId: "POLY-2589812",
    providerEventId: "POLY-606422",
    title: "Fed Interest Rates (Oct 2026): No Change",
    rules: "The FED interest rates decision after October 2026 FOMC meeting. Resolves to 1 (YES) if target range is unchanged, 0 (NO) otherwise.",
    initialMarkE6: 825000,
    closeTimeMs: 1793246340000, // 2026-10-29T03:59:00Z
  },
  {
    providerMarketId: "POLY-5170737",
    providerEventId: "POLY-1112205",
    title: "Bitcoin Nov 2026 Target: Drops to $82,500",
    rules: "Resolves to 1 (YES) if any Binance 1-minute candle for BTC/USDT in November 2026 has a Low equal to or lower than $82,500, 0 (NO) otherwise.",
    initialMarkE6: 775000,
    closeTimeMs: 1793505600000, // 2026-11-01T04:00:00Z
  },
  {
    providerMarketId: "POLY-608545",
    providerEventId: "POLY-48361",
    title: "Ballon d’Or 2026 Winner: Lamine Yamal",
    rules: "This market resolves to 1 (YES) if Lamine Yamal wins the 2026 Ballon d'Or according to France Football, 0 (NO) otherwise.",
    initialMarkE6: 495000,
    closeTimeMs: 1798779540000, // 2027-01-01T04:59:00Z
  },
  {
    providerMarketId: "POLY-5208385",
    providerEventId: "POLY-1095772",
    title: "Bitcoin Target: Reaches $86,000",
    rules: "Resolves to 1 (YES) if any Binance 1-minute candle for BTC/USDT has a High equal to or greater than $86,000, 0 (NO) otherwise.",
    initialMarkE6: 265000,
    closeTimeMs: 1791172800000, // 2026-10-05T04:00:00Z
  },
  {
    providerMarketId: "POLY-561974",
    providerEventId: "POLY-31875",
    title: "US 2028 Republican Nominee: J.D. Vance",
    rules: "Resolves to 1 (YES) if J.D. Vance wins and accepts the 2028 Republican nomination for U.S. President, 0 (NO) otherwise.",
    initialMarkE6: 503000,
    closeTimeMs: 1857272340000, // 2028-11-08T04:59:00Z
  },
  {
    providerMarketId: "POLY-679018",
    providerEventId: "POLY-79987",
    title: "French Presidential Election 2027: Marine Le Pen",
    rules: "Resolves to 1 (YES) if Marine Le Pen wins the next French presidential election, 0 (NO) otherwise.",
    initialMarkE6: 456000,
    closeTimeMs: 1808107140000, // 2027-04-19T03:59:00Z
  },
  {
    providerMarketId: "POLY-2772176",
    providerEventId: "POLY-659671",
    title: "UEFA Champions League 2026-27: Barcelona",
    rules: "Resolves to 1 (YES) if FC Barcelona wins the 2026-27 UEFA Champions League, 0 (NO) otherwise.",
    initialMarkE6: 225000,
    closeTimeMs: 1811721540000, // 2027-05-30T23:59:00Z
  },
];

const EVENT_PREFIXES = {
  "POLY-45915": "Brazil Presidential Election: ",
  "POLY-606422": "Fed Interest Rates (Oct 2026): ",
  "POLY-1112205": "Bitcoin Nov 2026 Target: ",
  "POLY-48361": "Ballon d’Or 2026 Winner: ",
  "POLY-1095772": "Bitcoin Target: ",
  "POLY-31875": "US 2028 Republican Nominee: ",
  "POLY-79987": "French Presidential Election 2027: ",
  "POLY-659671": "UEFA Champions League 2026-27: ",
  "POLY-32228": "2026 US Midterms: ",
};

async function fetchLiveCandidates() {
  const apiKey = process.env.JUPITER_API_KEY;
  if (!apiKey) {
    console.log("[keeper:import] JUPITER_API_KEY not configured, using verified candidate list.");
    return FALLBACK_CANDIDATES;
  }

  try {
    const source = new JupiterPredictionSource();
    const markets = await source.listMarkets({
      limit: 100,
      cursor: "0",
    });

    const valid = markets.filter(
      (m) =>
        m.closeTime >= CUTOFF_TIMESTAMP_MS &&
        m.status === "open" &&
        !ALREADY_IMPORTED_IDS.has(m.providerMarketId) &&
        m.yesBidE6 > 20000 &&
        m.yesAskE6 < 980000 &&
        m.yesAskE6 > m.yesBidE6
    );

    const imported = [];
    const seenEvents = new Set();

    for (const m of valid) {
      if (seenEvents.has(m.providerEventId)) continue;
      seenEvents.add(m.providerEventId);

      const prefix = EVENT_PREFIXES[m.providerEventId] || "";
      let title = prefix ? (prefix + m.title) : m.title;
      if (title === "No change") title = "Fed Interest Rates: No Change";
      if (title === "↓ 82,500") title = "Bitcoin: Drops to $82,500 by Nov 2026";
      if (title === "↑ 86,000") title = "Bitcoin: Reaches $86,000 (Oct 2026)";
      if (title.length > 70) title = title.slice(0, 67) + "...";

      const markE6 = Math.round((m.yesBidE6 + m.yesAskE6) / 2);
      imported.push({
        providerMarketId: m.providerMarketId,
        providerEventId: m.providerEventId,
        title,
        rules: m.rules || ("This market resolves to 1 (YES) if " + title + " occurs, 0 (NO) otherwise."),
        initialMarkE6: markE6,
        closeTimeMs: m.closeTime,
      });

      if (imported.length >= 8) break;
    }

    if (imported.length >= 5) {
      return imported;
    }
  } catch (err) {
    console.warn("[keeper:import] Live Jupiter fetch warning:", err?.message || err);
  }

  return FALLBACK_CANDIDATES;
}

async function main() {
  console.log("==================================================");
  console.log("   Moxie Jupiter Market Import Keeper             ");
  console.log("   Cutoff: >= 5 October 2026                      ");
  console.log("==================================================");

  const candidates = await fetchLiveCandidates();
  console.log("[keeper:import] Loaded " + candidates.length + " distinct prediction market candidates closing >= 5 Oct 2026:");
  for (const c of candidates) {
    console.log("  - [" + c.providerMarketId + "] " + c.title + " (" + (c.initialMarkE6 / 10000).toFixed(1) + "c, closes " + new Date(c.closeTimeMs).toISOString() + ")");
  }

  await mkdir("deployments", { recursive: true });
  const manifestPath = "deployments/imported-markets.json";
  await writeFile(manifestPath, JSON.stringify(candidates, null, 2) + "\n");
  console.log("[keeper:import] Wrote candidates to " + manifestPath);

  // Write top candidate to jupiter-live-market.json only if it passes the cutoff
  if (candidates[0] && candidates[0].closeTimeMs >= CUTOFF_TIMESTAMP_MS) {
    const liveMarketPath = "deployments/jupiter-live-market.json";
    const existing = fs.existsSync(liveMarketPath)
      ? JSON.parse(await readFile(liveMarketPath, "utf-8"))
      : {};
    const updated = {
      ...existing,
      ...candidates[0],
      fetchedAt: new Date().toISOString(),
      provider: "jupiter",
    };
    await writeFile(liveMarketPath, JSON.stringify(updated, null, 2) + "\n");
    console.log("[keeper:import] Updated " + liveMarketPath + " with candidate " + candidates[0].providerMarketId);
  }

  const indexerUrls = [
    process.env.MOXIE_API_URL,
    "http://127.0.0.1:8787",
    "http://localhost:8787",
  ].filter(Boolean);

  for (const baseUrl of indexerUrls) {
    try {
      const url = baseUrl.replace(/\/+$/, "") + "/v1/sync";
      const res = await fetch(url, { method: "POST" });
      if (res.ok) {
        console.log("[keeper:import] Triggered indexer sync at " + baseUrl);
        break;
      }
    } catch {}
  }
}

main().catch((err) => {
  console.error("[keeper:import] Error:", err);
  process.exit(1);
});
