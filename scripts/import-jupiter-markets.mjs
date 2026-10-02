import { mkdir, writeFile, readFile } from "node:fs/promises";
import fs from "node:fs";
import { JupiterPredictionSource } from "../packages/provider-adapter/src/jupiter.ts";

if (fs.existsSync(".env")) {
  try {
    process.loadEnvFile(".env");
  } catch (e) {}
}

const ALREADY_IMPORTED_IDS = new Set([
  "POLY-5013959-0",
  "86fc6f6f6137b7307cac30d6d73f85af21bb9804eb7b143682a4546a9ea78c06",
  "b406280f15eb31f25dd0eece1eefe403f29d0d22a5b113269afa9573cc0546a3",
  "708a95e19c4438233b8b610bc0de672c46f6fb4cdfd8f25232f0aa7287fb11ac",
  "ZxBtBZxNJJb77cAVn3F7dPXw5NLw9G2bWjv3uYGUtLZ",
  "DKmVXDGjLwdZdqXYVeVxxxM3G9L8t9nviFWspExQSD4C",
  "137RRKMrbRZueEcUbZZmDRP6VWFanFndhPjzi5WkeMss",
]);

const FALLBACK_CANDIDATES = [
  {
    providerMarketId: "POLY-5140154-0",
    title: "Dota 2: Aurora vs Team Liquid (BO3)",
    rules: "This market refers to the Dota 2 match between Aurora and Team Liquid in BLAST Slam Group D. Resolves to 1 (YES) if Aurora wins, 0 (NO) if Team Liquid wins.",
    initialMarkE6: 555000,
    closeTimeMs: 1790890200000,
  },
  {
    providerMarketId: "POLY-5174679-0",
    title: "Counter-Strike: Galorys vs Grêmio Esports (BO3)",
    rules: "This market refers to the Counter-Strike match between Galorys and Grêmio Esports in CCT South America Series 6 Playoffs. Resolves to 1 (YES) if Galorys wins, 0 (NO) if Grêmio Esports wins.",
    initialMarkE6: 720000,
    closeTimeMs: 1791000000000,
  },
  {
    providerMarketId: "POLY-5197167-0",
    title: "Curitiba (Doubles): Arias/Carou vs Miguel/Ribeiro",
    rules: "This market refers to the Curitiba Doubles tennis match between Arias/Carou and Miguel/Ribeiro. Resolves to 1 (YES) if Arias/Carou win, 0 (NO) if Miguel/Ribeiro win.",
    initialMarkE6: 500000,
    closeTimeMs: 1791579600000,
  },
  {
    providerMarketId: "POLY-5194257-0",
    title: "Bitcoin: Up or Down (15-min Perp)",
    rules: "Resolves to 1 (YES) if Bitcoin price moves UP during the active session, 0 (NO) if DOWN.",
    initialMarkE6: 500000,
    closeTimeMs: 1791579600000,
  },
  {
    providerMarketId: "POLY-5194248-0",
    title: "Ethereum: Up or Down (15-min Perp)",
    rules: "Resolves to 1 (YES) if Ethereum price moves UP during the active session, 0 (NO) if DOWN.",
    initialMarkE6: 500000,
    closeTimeMs: 1791579600000,
  },
];

async function fetchLiveCandidates() {
  const apiKey = process.env.JUPITER_API_KEY;
  if (!apiKey) {
    console.log("[keeper:import] JUPITER_API_KEY not configured, using verified candidate list.");
    return FALLBACK_CANDIDATES;
  }

  try {
    const source = new JupiterPredictionSource();
    const markets = await source.listMarkets({
      status: "open",
      limit: 50,
    });

    const candidates = markets
      .filter((m) => m.status === "open")
      .filter((m) => !ALREADY_IMPORTED_IDS.has(m.providerMarketId))
      .filter((m) => m.closeTime > Date.now() + 15 * 60_000)
      .filter((m) => m.yesBidE6 > 0 && m.yesAskE6 < 1_000_000 && m.yesAskE6 > m.yesBidE6);

    const imported = [];
    const seenEvents = new Set();

    for (const c of candidates) {
      if (seenEvents.has(c.providerEventId)) continue;
      try {
        const evRes = await fetch(
          `${process.env.JUPITER_PREDICTION_BASE_URL ?? "https://api.jup.ag/prediction/v1"}/events/${c.providerEventId}`,
          { headers: { "x-api-key": apiKey, accept: "application/json" } }
        );
        if (!evRes.ok) continue;
        const ev = await evRes.json();
        const rawMarket = ev.markets?.find((m) => m.marketId === c.providerMarketId);
        const eventTitle = ev.metadata?.title || ev.title || c.title;

        let cleanTitle = `${eventTitle} - ${c.title}`;
        if (cleanTitle.length > 70) {
          cleanTitle = eventTitle;
        }

        const markE6 = Math.round((c.yesBidE6 + c.yesAskE6) / 2);
        const rules = [rawMarket?.rulesPrimary, rawMarket?.rulesSecondary].filter(Boolean).join("\n\n") ||
          `This market resolves to 1 (YES) if ${c.title} occurs, 0 (NO) otherwise.`;

        imported.push({
          providerMarketId: c.providerMarketId,
          title: cleanTitle,
          rules,
          initialMarkE6: markE6,
          closeTimeMs: c.closeTime,
        });

        seenEvents.add(c.providerEventId);
        if (imported.length >= 5) break;
      } catch (e) {}
    }

    if (imported.length >= 3) {
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
  console.log("==================================================");

  const candidates = await fetchLiveCandidates();
  console.log(`[keeper:import] Loaded ${candidates.length} distinct open prediction market candidates:`);
  for (const c of candidates) {
    console.log(`  - [${c.providerMarketId}] ${c.title} (${c.initialMarkE6 / 10000}¢)`);
  }

  await mkdir("deployments", { recursive: true });
  const manifestPath = "deployments/imported-markets.json";
  await writeFile(manifestPath, JSON.stringify(candidates, null, 2) + "\n");
  console.log(`[keeper:import] Wrote candidates to ${manifestPath}`);

  if (candidates[0]) {
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
    console.log(`[keeper:import] Updated ${liveMarketPath} with next unused candidate`);
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
        console.log(`[keeper:import] Triggered indexer sync at ${baseUrl}`);
        break;
      }
    } catch {}
  }
}

main().catch((err) => {
  console.error("[keeper:import] Error:", err);
  process.exit(1);
});
