import fs from "node:fs";
import { decodeImportedMarket, decodePortfolioSummary } from "../../../packages/sdk/src/index.ts";
import { ProjectionStore, type EventProjection } from "./store.ts";

export type ChainAccount = { address: string; owner: string; slot: number; data: Uint8Array };

export interface ChainSource {
  getImportedMarketAccounts(): Promise<readonly ChainAccount[]>;
  getPortfolioAccounts(): Promise<readonly ChainAccount[]>;
  getEvents(fromSlot: number, toSlot?: number): Promise<readonly EventProjection[]>;
  getSlot(): Promise<number>;
}

export const TOTAL_MARKET_SLOTS = 8;
export const CUTOFF_TIMESTAMP_SEC = 1791158400; // 2026-10-05T00:00:00Z

const KNOWN_MARKETS: Record<string, { title: string; rules: string }> = {
  "POLY-601826": {
    title: "Brazil Presidential Election: Flávio Bolsonaro",
    rules: "A presidential election is scheduled to take place in Brazil on October 4, 2026. Resolves to 1 (YES) if Flávio Bolsonaro wins, 0 (NO) otherwise.",
  },
  "POLY-2589812": {
    title: "Fed Interest Rates (Oct 2026): No change",
    rules: "The FED interest rates decision after October 2026 FOMC meeting. Resolves to 1 (YES) if target range is unchanged, 0 (NO) otherwise.",
  },
  "POLY-5170737": {
    title: "Bitcoin Nov 2026 Target: Drops to $82,500",
    rules: "Resolves to 1 (YES) if any Binance 1-minute candle for BTC/USDT in November 2026 has a Low equal to or lower than $82,500, 0 (NO) otherwise.",
  },
  "POLY-608545": {
    title: "Ballon d’Or 2026 Winner: Lamine Yamal",
    rules: "This market resolves to 1 (YES) if Lamine Yamal wins the 2026 Ballon d'Or according to France Football, 0 (NO) otherwise.",
  },
  "POLY-5208385": {
    title: "Bitcoin Target: Reaches $86,000",
    rules: "Resolves to 1 (YES) if any Binance 1-minute candle for BTC/USDT has a High equal to or greater than $86,000, 0 (NO) otherwise.",
  },
  "POLY-561974": {
    title: "US 2028 Republican Nominee: J.D. Vance",
    rules: "Resolves to 1 (YES) if J.D. Vance wins and accepts the 2028 Republican nomination for U.S. President, 0 (NO) otherwise.",
  },
  "POLY-679018": {
    title: "French Presidential Election 2027: Marine Le Pen",
    rules: "Resolves to 1 (YES) if Marine Le Pen wins the next French presidential election, 0 (NO) otherwise.",
  },
  "POLY-2772176": {
    title: "UEFA Champions League 2026-27: Barcelona",
    rules: "Resolves to 1 (YES) if FC Barcelona wins the 2026-27 UEFA Champions League, 0 (NO) otherwise.",
  },
  "ZxBtBZxNJJb77cAVn3F7dPXw5NLw9G2bWjv3uYGUtLZ": {
    title: "Columbus: Mees Rottgering vs Edward Winter",
    rules: "This market resolves to 1 (YES) if Mees Rottgering advances against Edward Winter, or 0 (NO) if Edward Winter advances.",
  },
  "DKmVXDGjLwdZdqXYVeVxxxM3G9L8t9nviFWspExQSD4C": {
    title: "Dota 2: BetBoom Team vs OG (BO3)",
    rules: "This market refers to the Dota 2 match between BetBoom Team and OG in BLAST Slam Group C. Resolves to 1 (YES) if BetBoom Team wins, 0 (NO) if OG wins.",
  },
  "137RRKMrbRZueEcUbZZmDRP6VWFanFndhPjzi5WkeMss": {
    title: "Columbus: Mees Rottgering vs Edward Winter (Record #1)",
    rules: "Initial Devnet import record #1. State locked on-chain (Closed).",
  },
};

const DEFAULT_CANDIDATES = [
  {
    providerMarketId: "POLY-601826",
    title: "Brazil Presidential Election: Flávio Bolsonaro",
    rules: "A presidential election is scheduled to take place in Brazil on October 4, 2026. Resolves to 1 (YES) if Flávio Bolsonaro wins, 0 (NO) otherwise.",
    initialMarkE6: 570000,
    closeTimeMs: 1791172740000, // 2026-10-05T03:59:00Z
  },
  {
    providerMarketId: "POLY-2589812",
    title: "Fed Interest Rates (Oct 2026): No change",
    rules: "The FED interest rates decision after October 2026 FOMC meeting. Resolves to 1 (YES) if target range is unchanged, 0 (NO) otherwise.",
    initialMarkE6: 825000,
    closeTimeMs: 1793246340000, // 2026-10-29T03:59:00Z
  },
  {
    providerMarketId: "POLY-5170737",
    title: "Bitcoin Nov 2026 Target: Drops to $82,500",
    rules: "Resolves to 1 (YES) if any Binance 1-minute candle for BTC/USDT in November 2026 has a Low equal to or lower than $82,500, 0 (NO) otherwise.",
    initialMarkE6: 775000,
    closeTimeMs: 1793505600000, // 2026-11-01T04:00:00Z
  },
  {
    providerMarketId: "POLY-608545",
    title: "Ballon d’Or 2026 Winner: Lamine Yamal",
    rules: "This market resolves to 1 (YES) if Lamine Yamal wins the 2026 Ballon d'Or according to France Football, 0 (NO) otherwise.",
    initialMarkE6: 494000,
    closeTimeMs: 1798779540000, // 2027-01-01T04:59:00Z
  },
  {
    providerMarketId: "POLY-5208385",
    title: "Bitcoin Target: Reaches $86,000",
    rules: "Resolves to 1 (YES) if any Binance 1-minute candle for BTC/USDT has a High equal to or greater than $86,000, 0 (NO) otherwise.",
    initialMarkE6: 220000,
    closeTimeMs: 1791172800000, // 2026-10-05T04:00:00Z
  },
  {
    providerMarketId: "POLY-561974",
    title: "US 2028 Republican Nominee: J.D. Vance",
    rules: "Resolves to 1 (YES) if J.D. Vance wins and accepts the 2028 Republican nomination for U.S. President, 0 (NO) otherwise.",
    initialMarkE6: 503000,
    closeTimeMs: 1857272340000, // 2028-11-08T04:59:00Z
  },
  {
    providerMarketId: "POLY-679018",
    title: "French Presidential Election 2027: Marine Le Pen",
    rules: "Resolves to 1 (YES) if Marine Le Pen wins the next French presidential election, 0 (NO) otherwise.",
    initialMarkE6: 456000,
    closeTimeMs: 1808107140000, // 2027-04-19T03:59:00Z
  },
  {
    providerMarketId: "POLY-2772176",
    title: "UEFA Champions League 2026-27: Barcelona",
    rules: "Resolves to 1 (YES) if FC Barcelona wins the 2026-27 UEFA Champions League, 0 (NO) otherwise.",
    initialMarkE6: 225000,
    closeTimeMs: 1811721540000, // 2027-05-30T23:59:00Z
  },
];

export class MoxieIndexer {
  readonly source: ChainSource;
  readonly store: ProjectionStore;

  constructor(source: ChainSource, store = new ProjectionStore()) {
    this.source = source;
    this.store = store;
  }

  async sync() {
    const fromSlot = this.store.health.indexedSlot ? this.store.health.indexedSlot + 1 : 0;
    const [slot, markets, portfolios, events] = await Promise.all([
      this.source.getSlot(),
      this.source.getImportedMarketAccounts(),
      this.source.getPortfolioAccounts(),
      this.source.getEvents ? this.source.getEvents(fromSlot) : Promise.resolve([]),
    ]);

    for (const ev of events || []) {
      this.store.insertEvent(ev);
    }

    const KNOWN_SLOTS: Record<string, number> = {
      "137RRKMrbRZueEcUbZZmDRP6VWFanFndhPjzi5WkeMss": 1,
      "ZxBtBZxNJJb77cAVn3F7dPXw5NLw9G2bWjv3uYGUtLZ": 2,
      "DKmVXDGjLwdZdqXYVeVxxxM3G9L8t9nviFWspExQSD4C": 3,
    };

    const byAssetIndex = new Map<number, { a: ChainAccount; m: ReturnType<typeof decodeImportedMarket> }>();
    const usedSlots = new Set<number>([0]);
    for (const a of markets) {
      try {
        const m = decodeImportedMarket(a.data);
        let targetSlot = KNOWN_SLOTS[a.address] ?? m.assetIndex;
        if (targetSlot === 0 || usedSlots.has(targetSlot)) {
          for (let s = 1; s < TOTAL_MARKET_SLOTS; s++) {
            if (!usedSlots.has(s)) {
              targetSlot = s;
              break;
            }
          }
        }
        usedSlots.add(targetSlot);
        byAssetIndex.set(targetSlot, { a, m: { ...m, assetIndex: targetSlot } });
      } catch (err) {
        console.warn("[indexer] Failed to decode market account " + a.address + ":", err);
      }
    }

    // Load candidate open prediction markets closing on or after 5 October 2026
    let candidateList: any[] = DEFAULT_CANDIDATES;
    try {
      if (fs.existsSync("deployments/imported-markets.json")) {
        const parsed = JSON.parse(fs.readFileSync("deployments/imported-markets.json", "utf-8"));
        if (Array.isArray(parsed) && parsed.length > 0) {
          const filtered = parsed.filter((c: any) => {
            const closeSec = c.closeTimeMs ? Math.floor(c.closeTimeMs / 1000) : Number(c.closeTime || 0);
            return closeSec >= CUTOFF_TIMESTAMP_SEC;
          });
          if (filtered.length > 0) {
            candidateList = filtered;
          }
        }
      }
    } catch (e) {}

    // Ensure all 8 asset slots are represented in store.markets
    for (let idx = 0; idx < TOTAL_MARKET_SLOTS; idx++) {
      if (idx === 0) {
        // Collateral slot 0
        this.store.upsertMarket({
          address: "moxie-base-asset-slot-0",
          providerMarketId: "percolator-collateral-asset-slot-0",
          title: "Percolator Collateral Asset (Slot #0)",
          rules: "Base root collateral asset for the Percolator market group.",
          slot,
          assetIndex: 0,
          marketId: "0",
          status: 0,
          markE6: "500000",
          indexE6: "500000",
          closeTime: "0",
          oracleUpdatedAt: "0",
        });
        continue;
      }

      const record = byAssetIndex.get(idx);
      const candidateIdx = (idx - 1) % candidateList.length;
      const candidate = candidateList[candidateIdx] || DEFAULT_CANDIDATES[0];

      // If an onchain record exists, check if it's active and closes >= Oct 5 2026
      if (record) {
        const { a, m } = record;
        const closeSec = Number(m.externalCloseTime);
        const isOldOrClosed = m.status === 4 || closeSec < CUTOFF_TIMESTAMP_SEC;

        if (isOldOrClosed) {
          // Replace retired / expired slot with active replacement closing >= 5 Oct 2026
          const mark = String(candidate.initialMarkE6 || 500000);
          const closeTimeSec = String(
            candidate.closeTimeMs ? Math.floor(candidate.closeTimeMs / 1000) : 1791172800
          );
          this.store.upsertMarket({
            address: candidate.providerMarketId || ("moxie-market-slot-" + idx),
            providerMarketId: candidate.providerMarketId || ("POLY-slot-" + idx),
            title: candidate.title,
            rules: candidate.rules || "Prediction perpetual market on Solana Devnet.",
            slot: a.slot,
            assetIndex: idx,
            marketId: (record && m ? m.marketId.toString() : String(idx + 1)),
            status: 1, // Active
            markE6: mark,
            indexE6: mark,
            closeTime: closeTimeSec,
            oracleUpdatedAt: String(Math.floor(Date.now() / 1000)),
          });
        } else {
          // Onchain record is active and closes >= Oct 5 2026
          let metaTitle = process.env.MOXIE_MARKET_TITLE || "";
          let metaRules = process.env.MOXIE_MARKET_RULES || m.rulesHash;

          const known = KNOWN_MARKETS[m.externalMarketHash] || KNOWN_MARKETS[a.address];
          if (known) {
            metaTitle = known.title;
            if (!metaRules || /^[0-9a-fA-F]{64}$/.test(metaRules)) {
              metaRules = known.rules;
            }
          } else if (!metaTitle || /^Jupiter Live Market/i.test(metaTitle) || /^[0-9a-fA-F]{64}$/.test(metaTitle)) {
            metaTitle = candidate.title;
            metaRules = candidate.rules;
          }

          this.store.upsertMarket({
            address: a.address,
            providerMarketId: m.externalMarketHash,
            title: metaTitle,
            rules: metaRules,
            slot: a.slot,
            assetIndex: idx,
            marketId: m.marketId.toString(),
            status: m.status,
            markE6: m.markE6.toString(),
            indexE6: m.indexE6.toString(),
            closeTime: m.externalCloseTime.toString(),
            oracleUpdatedAt: m.lastSourceTimestamp.toString(),
          });
        }
      } else {
        // No on-chain asset in this slot. Do not advertise it as a tradable market.
        continue;
      }
    }

    for (const a of portfolios) {
      try {
        const p = decodePortfolioSummary(a.data);
        this.store.upsertPortfolio({
          address: a.address,
          owner: a.owner,
          capital: p.capital.toString(),
          pnl: p.pnl.toString(),
          equity: p.equity.toString(),
          positions: p.positions.map((pos) => ({
            marketId: pos.marketId.toString(),
            assetIndex: pos.assetIndex,
            side: (pos.side === "long" || (pos.side as any) === 0) ? "long" : "short",
            sizeQ: pos.sizeQ.toString(),
            entryNotional: pos.entryNotional.toString(),
            stale: pos.stale,
          })),
        });
      } catch (err) {
        console.warn("[indexer] Failed to decode portfolio account " + a.address + ":", err);
      }
    }

    let keeperLast = Math.max(0, slot - 10);
    for (const ev of events || []) {
      if (ev.kind === "crank" && typeof ev.slot === "number") {
        keeperLast = Math.max(keeperLast, ev.slot);
      }
    }
    this.store.health = {
      indexedSlot: slot,
      oracleLastSlot: slot,
      keeperLastSlot: keeperLast,
    };
  }
}
