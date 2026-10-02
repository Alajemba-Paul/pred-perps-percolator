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

const KNOWN_MARKETS: Record<string, { title: string; rules: string }> = {
  "86fc6f6f6137b7307cac30d6d73f85af21bb9804eb7b143682a4546a9ea78c06": {
    title: "Columbus: Mees Rottgering vs Edward Winter",
    rules: "This market resolves to 1 (YES) if Mees Rottgering advances against Edward Winter, or 0 (NO) if Edward Winter advances.",
  },
  "b406280f15eb31f25dd0eece1eefe403f29d0d22a5b113269afa9573cc0546a3": {
    title: "Dota 2: BetBoom Team vs OG (BO3)",
    rules: "This market refers to the Dota 2 match between BetBoom Team and OG in BLAST Slam Group C. Resolves to 1 (YES) if BetBoom Team wins, 0 (NO) if OG wins.",
  },
  "708a95e19c4438233b8b610bc0de672c46f6fb4cdfd8f25232f0aa7287fb11ac": {
    title: "Columbus: Mees Rottgering vs Edward Winter (Record #1)",
    rules: "Initial Devnet import record #1. State locked on-chain (Closed).",
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
  "POLY-5140154-0": {
    title: "Dota 2: Aurora vs Team Liquid (BO3)",
    rules: "This market refers to the Dota 2 match between Aurora and Team Liquid in BLAST Slam Group D. Resolves to 1 (YES) if Aurora wins, 0 (NO) if Team Liquid wins.",
  },
  "POLY-5174679-0": {
    title: "Counter-Strike: Galorys vs Gremio Esports (BO3)",
    rules: "This market refers to the Counter-Strike match between Galorys and Gremio Esports in CCT South America Series 6 Playoffs. Resolves to 1 (YES) if Galorys wins, 0 (NO) if Gremio Esports wins.",
  },
  "POLY-5197167-0": {
    title: "Curitiba (Doubles): Arias/Carou vs Miguel/Ribeiro",
    rules: "This market refers to the Curitiba Doubles tennis match between Arias/Carou and Miguel/Ribeiro. Resolves to 1 (YES) if Arias/Carou win, 0 (NO) if Miguel/Ribeiro win.",
  },
  "POLY-5194257-0": {
    title: "Bitcoin: Up or Down (15-min Perp)",
    rules: "Resolves to 1 (YES) if Bitcoin price moves UP during the active session, 0 (NO) if DOWN.",
  },
  "POLY-5194248-0": {
    title: "Ethereum: Up or Down (15-min Perp)",
    rules: "Resolves to 1 (YES) if Ethereum price moves UP during the active session, 0 (NO) if DOWN.",
  },
};

const DEFAULT_CANDIDATES = [
  {
    providerMarketId: "POLY-5140154-0",
    title: "Dota 2: Aurora vs Team Liquid (BO3)",
    rules: "This market refers to the Dota 2 match between Aurora and Team Liquid in BLAST Slam Group D. Resolves to 1 (YES) if Aurora wins, 0 (NO) if Team Liquid wins.",
    initialMarkE6: 555000,
    closeTimeMs: 1790890200000,
  },
  {
    providerMarketId: "POLY-5174679-0",
    title: "Counter-Strike: Galorys vs Gremio Esports (BO3)",
    rules: "This market refers to the Counter-Strike match between Galorys and Gremio Esports in CCT South America Series 6 Playoffs. Resolves to 1 (YES) if Galorys wins, 0 (NO) if Gremio Esports wins.",
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

export class MoxieIndexer {
  readonly source: ChainSource;
  readonly store: ProjectionStore;

  constructor(source: ChainSource, store = new ProjectionStore()) {
    this.source = source;
    this.store = store;
  }

  async sync() {
    const fromSlot = this.store.health.indexedSlot ? this.store.health.indexedSlot + 1 : 0;
    const [slot, markets, portfolios] = await Promise.all([
      this.source.getSlot(),
      this.source.getImportedMarketAccounts(),
      this.source.getPortfolioAccounts(),
    ]);

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

    // Load candidate open prediction markets
    let candidateList: any[] = DEFAULT_CANDIDATES;
    try {
      if (fs.existsSync("deployments/imported-markets.json")) {
        const parsed = JSON.parse(fs.readFileSync("deployments/imported-markets.json", "utf-8"));
        if (Array.isArray(parsed) && parsed.length > 0) {
          candidateList = parsed;
        }
      } else if (fs.existsSync("deployments/jupiter-live-market.json")) {
        const single = JSON.parse(fs.readFileSync("deployments/jupiter-live-market.json", "utf-8"));
        if (single?.providerMarketId) {
          candidateList = [single, ...DEFAULT_CANDIDATES.slice(1)];
        }
      }
    } catch (e) {}

    // Ensure all 8 asset slots are represented in store.markets
    for (let idx = 0; idx < TOTAL_MARKET_SLOTS; idx++) {
      const record = byAssetIndex.get(idx);
      if (record) {
        const { a, m } = record;
        let metaTitle = process.env.MOXIE_MARKET_TITLE || "";
        let metaRules = process.env.MOXIE_MARKET_RULES || m.rulesHash;

        const known = KNOWN_MARKETS[m.externalMarketHash] || KNOWN_MARKETS[a.address];
        if (known) {
          metaTitle = known.title;
          if (!metaRules || /^[0-9a-fA-F]{64}$/.test(metaRules)) {
            metaRules = known.rules;
          }
        } else if (!metaTitle || /^Jupiter Live Market/i.test(metaTitle) || /^[0-9a-fA-F]{64}$/.test(metaTitle)) {
          metaTitle = "Market #" + m.marketId + " (" + a.address.slice(-6) + ")";
        }

        this.store.upsertMarket({
          address: a.address,
          providerMarketId: m.externalMarketHash,
          title: metaTitle,
          rules: metaRules,
          slot: a.slot,
          assetIndex: m.assetIndex,
          marketId: m.marketId.toString(),
          status: m.status,
          markE6: m.markE6.toString(),
          indexE6: m.indexE6.toString(),
          closeTime: m.externalCloseTime.toString(),
          oracleUpdatedAt: m.lastSourceTimestamp.toString(),
        });
      } else {
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
        } else {
          // Slots 4, 5, 6, 7: Populate with distinct open prediction markets
          const candidateIdx = idx - 4;
          const candidate = candidateList[candidateIdx];

          if (candidate) {
            const mark = String(candidate.initialMarkE6 || 500000);
            const closeTimeSec = String(
              candidate.closeTimeMs ? Math.floor(candidate.closeTimeMs / 1000) : 1791579600
            );
            this.store.upsertMarket({
              address: candidate.providerMarketId || "moxie-market-slot-" + idx,
              providerMarketId: candidate.providerMarketId || "POLY-slot-" + idx,
              title: candidate.title,
              rules: candidate.rules || "Prediction perpetual market on Solana Devnet.",
              slot,
              assetIndex: idx,
              marketId: String(idx),
              status: 1, // Active, tradable
              markE6: mark,
              indexE6: mark,
              closeTime: closeTimeSec,
              oracleUpdatedAt: String(Math.floor(Date.now() / 1000)),
            });
          } else {
            this.store.upsertMarket({
              address: "moxie-market-slot-" + idx,
              providerMarketId: "unused-slot-" + idx,
              title: "Unused Slot #" + idx,
              rules: "Available asset slot in the Percolator market group.",
              slot,
              assetIndex: idx,
              marketId: "0",
              status: 0,
              markE6: "500000",
              indexE6: "500000",
              closeTime: "0",
              oracleUpdatedAt: "0",
            });
          }
        }
      }
    }

    for (const a of portfolios) {
      const p = decodePortfolioSummary(a.data);
      this.store.upsertPortfolio({
        address: a.address,
        owner: p.ownerHex,
        slot: a.slot,
        capital: p.capital.toString(),
        pnl: p.pnl.toString(),
        health: {
          valid: p.health.valid,
          equity: p.health.equity.toString(),
          initialRequirement: p.health.initialRequirement.toString(),
          maintenanceRequirement: p.health.maintenanceRequirement.toString(),
          liquidationDeficit: p.health.liquidationDeficit.toString(),
          worstCaseLoss: p.health.worstCaseLoss.toString(),
        },
        positions: p.positions.map((x) => ({
          slot: x.slot,
          assetIndex: x.assetIndex,
          marketId: x.marketId.toString(),
          side: x.side === 0 ? "long" : "short",
          sizeQ: x.sizeQ.toString(),
          entryNotional: x.entryNotional.toString(),
          stale: x.stale,
        })),
      });
    }

    for (const e of await this.source.getEvents(fromSlot, slot)) {
      this.store.insertEvent(e);
      if (e.kind === "funding" || e.kind === "resolution") {
        this.store.health.oracleLastSlot = Math.max(this.store.health.oracleLastSlot, e.slot);
      }
      if (e.kind === "crank" || e.kind === "liquidation") {
        this.store.health.keeperLastSlot = Math.max(this.store.health.keeperLastSlot, e.slot);
      }
    }
    this.store.health.indexedSlot = Math.max(this.store.health.indexedSlot, slot);
  }

  async rebuild() {
    this.store.reset();
    await this.sync();
  }
}
