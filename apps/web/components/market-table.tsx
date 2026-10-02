"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  type Market,
  formatPrice,
  formatProbability,
  getStatusLabel,
} from "@/lib/markets";
import {
  ArrowRight,
  ShieldCheck,
  Clock,
  Activity,
  RefreshCw,
  Terminal,
  ExternalLink,
  ChevronDown,
  Info,
} from "lucide-react";

export function MarketTable({ markets: initialMarkets }: { markets: Market[] }) {
  const [markets, setMarkets] = useState<Market[]>(initialMarkets);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showKeeperDoc, setShowKeeperDoc] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      handleRefresh();
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/indexer/markets", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          // Re-map with toMarket
          const { toMarket } = await import("@/lib/markets");
          setMarkets(data.map(toMarket));
        }
      }
    } catch (e) {
      console.warn("Market refresh failed:", e);
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <div className="market-table-container">
      {/* Header bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#c7ff4a", background: "rgba(199,255,74,0.1)", padding: "4px 8px", borderRadius: "4px", fontWeight: 600 }}>
            <Activity size={12} /> {markets.length} market{markets.length === 1 ? "" : "s"} indexed
          </span>
          <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>
            1× Isolated Binary Perps on Solana Devnet
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            type="button"
            onClick={() => setShowKeeperDoc(!showKeeperDoc)}
            style={{
              background: "none",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "rgba(255,255,255,0.7)",
              padding: "4px 10px",
              borderRadius: "4px",
              fontSize: "12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <Info size={12} />
            <span>How to Import More Markets</span>
          </button>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            style={{
              background: "none",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "rgba(255,255,255,0.8)",
              padding: "4px 10px",
              borderRadius: "4px",
              fontSize: "12px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <RefreshCw size={12} className={isRefreshing ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Keeper Documentation Drawer */}
      {showKeeperDoc && (
        <div style={{ marginBottom: "20px", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(199,255,74,0.2)", borderRadius: "6px", padding: "16px" }}>
          <h4 style={{ margin: "0 0 8px", fontSize: "13px", color: "#c7ff4a", display: "flex", alignItems: "center", gap: "6px" }}>
            <Terminal size={14} /> Keeper Path: Importing Additional Jupiter Markets
          </h4>
          <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.8)", margin: "0 0 10px", lineHeight: 1.5 }}>
            All active markets shown below are real on-chain imported records. To import and list additional live Jupiter / Polymarket events onto Devnet:
          </p>
          <pre style={{ background: "rgba(0,0,0,0.6)", padding: "10px", borderRadius: "4px", fontSize: "11px", color: "#c7ff4a", overflowX: "auto", margin: 0 }}>
            <code>{`# 1. Pull latest candidate prediction events from Jupiter
pnpm run smoke:jupiter

# 2. Append or import asset onto the existing Percolator market group
pnpm run deploy:devnet:live`}</code>
          </pre>
        </div>
      )}

      {/* Market Cards */}
      <div className="market-cards" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {markets.map((market) => {
          const yesPrice = market.currentPrice;
          const noPrice = Math.max(0, 1 - yesPrice);
          const isTradable = market.status === "active" || market.status === 1;
          const statusLabel = getStatusLabel(market.status);
          const formattedClose = market.closeTime
            ? new Date(market.closeTime).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "Until Resolved";

          const targetHref = `/trade/${market.slug || market.address}`;

          return (
            <div
              key={market.address || market.slug}
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "8px",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
                transition: "border-color 0.2s",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        padding: "2px 6px",
                        borderRadius: "3px",
                        background: isTradable ? "rgba(199,255,74,0.15)" : market.status === "closed" || market.status === 4 ? "rgba(255,77,77,0.15)" : "rgba(255,255,255,0.08)",
                        color: isTradable ? "#c7ff4a" : market.status === "closed" || market.status === 4 ? "#ff8474" : "rgba(255,255,255,0.5)",
                      }}
                    >
                      {statusLabel}
                    </span>
                    <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>
                      Market #{market.marketId} • {market.address ? `…${market.address.slice(-6)}` : ""}
                    </span>
                  </div>
                  <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#fff", margin: 0, lineHeight: 1.4 }}>
                    {market.title}
                  </h3>
                </div>

                <Link
                  href={targetHref}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    background: isTradable ? "#c7ff4a" : "rgba(255,255,255,0.1)",
                    color: isTradable ? "#000" : "rgba(255,255,255,0.7)",
                    fontWeight: 600,
                    fontSize: "13px",
                    padding: "8px 16px",
                    borderRadius: "4px",
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                  }}
                >
                  <span>{isTradable ? "Trade" : market.status === "closed" || market.status === 4 ? "Closed" : "Unused"}</span>
                  <ArrowRight size={14} />
                </Link>
              </div>

              {market.rules && (
                <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)", margin: 0, lineHeight: 1.5, maxHeight: "40px", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {market.rules}
                </p>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: "12px",
                  paddingTop: "12px",
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div>
                  <small style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.5)", marginBottom: "2px" }}>YES Mark</small>
                  <strong style={{ fontSize: "14px", color: "#c7ff4a" }}>
                    {(yesPrice * 100).toFixed(1)}¢ ({formatProbability(yesPrice)})
                  </strong>
                </div>

                <div>
                  <small style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.5)", marginBottom: "2px" }}>NO Mark</small>
                  <strong style={{ fontSize: "14px", color: "#ff8474" }}>
                    {(noPrice * 100).toFixed(1)}¢ ({formatProbability(noPrice)})
                  </strong>
                </div>

                <div>
                  <small style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.5)", marginBottom: "2px" }}>Closes / Resolution</small>
                  <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.8)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <Clock size={12} /> {formattedClose}
                  </span>
                </div>

                <div>
                  <small style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.5)", marginBottom: "2px" }}>Risk / Leverage</small>
                  <span style={{ fontSize: "12px", color: "#c7ff4a", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <ShieldCheck size={12} /> 1× Isolated Binary Perp
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
