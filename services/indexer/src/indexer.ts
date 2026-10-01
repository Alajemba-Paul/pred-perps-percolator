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
    rules: "Initial Devnet import record #1. State locked on-chain.",
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
    rules: "Initial Devnet import record #1. State locked on-chain.",
  },
};

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

    for (const a of markets) {
      const m = decodeImportedMarket(a.data);
      let metaTitle = process.env.MOXIE_MARKET_TITLE || "";
      let metaRules = process.env.MOXIE_MARKET_RULES || m.rulesHash;

      try {
        const manifestPath = process.env.MARKET_METADATA_PATH || "deployments/jupiter-live-market.json";
        if (fs.existsSync(manifestPath)) {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          if (!metaTitle && manifest.title) metaTitle = manifest.title;
          if ((!metaRules || metaRules === m.rulesHash) && manifest.rules) metaRules = manifest.rules;
        }
      } catch (e) {}

      // Resolve known human readable titles for indexed markets
      const known = KNOWN_MARKETS[m.externalMarketHash] || KNOWN_MARKETS[a.address];
      if (known) {
        metaTitle = known.title;
        if (!metaRules || /^[0-9a-fA-F]{64}$/.test(metaRules)) {
          metaRules = known.rules;
        }
      } else if (!metaTitle || /^Jupiter Live Market/i.test(metaTitle) || /^[0-9a-fA-F]{64}$/.test(metaTitle)) {
        metaTitle = `Market #${m.marketId} (…${a.address.slice(-6)})`;
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
