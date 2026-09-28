import { DEMO_MARKETS, DEMO_PORTFOLIO } from "./demo-data";
import { toMarket, type ApiMarket, type Market } from "./markets";

const base = () =>
  process.env.MOXIE_API_URL ?? process.env.NEXT_PUBLIC_MOXIE_API_URL ?? "http://127.0.0.1:8787";

const useDemoFallback = () => process.env.MOXIE_DEMO_FALLBACK !== "0";

async function request<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`${base()}${path}`, { cache: "no-store", signal: controller.signal });
    if (!response.ok) {
      throw new Error(
        response.status === 404 ? "The requested Moxie account was not indexed." : "The Moxie indexer is unavailable.",
      );
    }
    return response.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

export async function getMarkets(): Promise<Market[]> {
  try {
    return (await request<ApiMarket[]>("/v1/markets")).map(toMarket);
  } catch (error) {
    if (useDemoFallback()) return DEMO_MARKETS;
    throw error;
  }
}

export async function getMarket(address: string): Promise<Market> {
  try {
    return toMarket(await request<ApiMarket>(`/v1/markets/${encodeURIComponent(address)}`));
  } catch (error) {
    const demo = DEMO_MARKETS.find((market) => market.slug === address || market.address === address);
    if (demo && useDemoFallback()) return demo;
    throw error;
  }
}

export type ApiPosition = {
  slot: number;
  assetIndex: number;
  marketId: string;
  side: "long" | "short";
  sizeQ: string;
  entryNotional: string;
  stale: boolean;
};

export type ApiPortfolio = {
  address: string;
  owner: string;
  slot: number;
  capital: string;
  pnl: string;
  health: {
    valid: boolean;
    equity: string;
    initialRequirement: string;
    maintenanceRequirement: string;
    liquidationDeficit: string;
    worstCaseLoss: string;
  };
  positions: ApiPosition[];
};

export async function getPortfolio(address: string): Promise<ApiPortfolio> {
  try {
    return await request<ApiPortfolio>(`/v1/portfolios/${encodeURIComponent(address)}`);
  } catch (error) {
    if (useDemoFallback()) return { ...DEMO_PORTFOLIO, address };
    throw error;
  }
}
