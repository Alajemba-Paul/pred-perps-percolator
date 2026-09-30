import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import type { ProjectionStore } from "./store.ts";

function getCorsHeaders(origin: string | undefined): Record<string, string> {
  const defaultAllowed = [
    "https://moxie-devnet-demo.vercel.app",
    "http://localhost:3000",
  ];

  const envOrigins = (process.env.CORS_ORIGIN || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const allowed = Array.from(new Set([...defaultAllowed, ...envOrigins]));
  const reqOrigin = origin ? origin.trim().toLowerCase() : undefined;

  const allowOrigin =
    allowed.includes("*") || (reqOrigin && allowed.includes(reqOrigin))
      ? origin || "*"
      : defaultAllowed[0];

  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "GET, POST, OPTIONS, HEAD",
    "access-control-allow-headers": "Content-Type, Authorization, X-Requested-With",
    "access-control-max-age": "86400",
  };
}

const json = (res: ServerResponse, status: number, body: unknown, origin?: string) => {
  const cors = getCorsHeaders(origin);
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    ...cors,
  });
  res.end(JSON.stringify(body, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
};

export function createIndexerApi(store: ProjectionStore): Server {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    const origin = req.headers.origin;
    const cors = getCorsHeaders(origin);

    // Handle preflight OPTIONS
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean);

    // Health check endpoint required by Render and frontend
    if (url.pathname === "/health") {
      return json(res, 200, {
        ok: true,
        cluster: process.env.MOXIE_CLUSTER || "devnet",
        marketCount: store.markets.size,
        health: store.health,
      }, origin);
    }

    // List all indexed markets
    if (url.pathname === "/v1/markets") {
      const marketsList = [...store.markets.values()];
      if (marketsList.length === 0) {
        console.warn("[indexer] GET /v1/markets requested but 0 markets currently indexed.");
      }
      return json(res, 200, marketsList, origin);
    }

    // Single market and sub-resources
    if (parts[0] === "v1" && parts[1] === "markets" && parts[2]) {
      const x = store.markets.get(parts[2]);
      if (!x) return json(res, 404, { error: "not-found", message: `Market ${parts[2]} not indexed` }, origin);
      if (parts[3] === "trades") {
        return json(res, 200, [...store.events.values()].filter((e) => e.kind === "trade" && e.marketId === x.marketId), origin);
      }
      if (parts[3] === "funding") {
        return json(res, 200, [...store.events.values()].filter((e) => e.kind === "funding" && e.marketId === x.marketId), origin);
      }
      return json(res, 200, x, origin);
    }

    // Portfolio and positions
    if (parts[0] === "v1" && parts[1] === "portfolios" && parts[2]) {
      const x = store.portfolios.get(parts[2]);
      if (!x) return json(res, 404, { error: "not-found", message: `Portfolio ${parts[2]} not indexed` }, origin);
      if (parts[3] === "positions") return json(res, 200, x.positions, origin);
      if (parts[3] === "transactions") {
        return json(res, 200, [...store.events.values()].filter((e) => e.portfolio === x.address), origin);
      }
      return json(res, 200, x, origin);
    }

    // Status diagnostics
    if (url.pathname === "/v1/status/oracle") {
      return json(res, 200, { lastSlot: store.health.oracleLastSlot, indexedSlot: store.health.indexedSlot }, origin);
    }
    if (url.pathname === "/v1/status/keeper") {
      return json(res, 200, { lastSlot: store.health.keeperLastSlot, indexedSlot: store.health.indexedSlot }, origin);
    }
    if (url.pathname === "/v1/events") {
      return json(res, 200, [...store.events.values()].sort((a, b) => b.slot - a.slot), origin);
    }

    return json(res, 404, { error: "not-found" }, origin);
  });
}
