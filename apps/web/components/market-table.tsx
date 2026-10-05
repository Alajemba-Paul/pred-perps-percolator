"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { type Market, formatPrice } from "@/lib/markets";
import { ArrowRight, Clock, RefreshCw } from "lucide-react";

export function MarketTable({ markets: initialMarkets }: { markets: Market[] }) {
  const [markets, setMarkets] = useState<Market[]>(initialMarkets);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Poll indexer markets every 10 seconds
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
          const { toMarket } = await import("@/lib/markets");
          setMarkets(data.map(toMarket));
        }
      }
    } catch (e) {
      console.warn("Market refresh error:", e);
    } finally {
      setIsRefreshing(false);
    }
  }

  const latestClose = Date.parse("2026-10-30T23:59:59Z");
  const tradableMarkets = markets.filter((m) => {
    const isActive = m.status === "active" || m.status === 1;
    const isSpecialSlot =
      m.title.startsWith("Unused Slot") ||
      m.title.startsWith("Percolator Collateral") ||
      m.title.startsWith("Open market #") ||
      m.title.includes("(Record #1)");
    const closeMs = m.closeTime ? new Date(m.closeTime).getTime() : 0;
    return isActive && !isSpecialSlot && closeMs > Date.now() && closeMs <= latestClose;
  });

  return (
    <div className="market-table-container">
      {/* Top Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.7)" }}>
            {tradableMarkets.length} active market{tradableMarkets.length === 1 ? "" : "s"}
          </span>
        </div>

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

      {/* Market Cards */}
      <div className="market-cards" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {tradableMarkets.length > 0 ? (
          tradableMarkets.map((market) => {
            const longCents = Math.round(market.currentPrice * 100);
            const shortCents = Math.max(0, 100 - longCents);
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
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
                  <div>
                    <h3 style={{ fontSize: "17px", fontWeight: 600, color: "#fff", margin: "0 0 6px", lineHeight: 1.4 }}>
                      {market.title}
                    </h3>
                    {market.rules && (
                      <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.65)", margin: 0, lineHeight: 1.5, maxHeight: "42px", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {market.rules}
                      </p>
                    )}
                  </div>

                  <Link
                    href={targetHref}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      background: "#c7ff4a",
                      color: "#000",
                      fontWeight: 600,
                      fontSize: "13px",
                      padding: "8px 16px",
                      borderRadius: "4px",
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span>Trade</span>
                    <ArrowRight size={14} />
                  </Link>
                </div>

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
                    <small style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.5)", marginBottom: "2px" }}>Long Price</small>
                    <strong style={{ fontSize: "15px", color: "#c7ff4a" }}>
                      {longCents}¢{market.stale ? " stale" : ""}</strong>
                  </div>

                  <div>
                    <small style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.5)", marginBottom: "2px" }}>Short Price</small>
                    <strong style={{ fontSize: "15px", color: "#ff8474" }}>
                      {shortCents}¢</strong>
                  </div>

                  <div>
                    <small style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.5)", marginBottom: "2px" }}>Closes</small>
                    <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.8)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <Clock size={12} /> {formattedClose}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div style={{ textAlign: "center", padding: "40px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", color: "rgba(255,255,255,0.5)" }}>
            No open Jupiter markets close by 30 October 2026.
          </div>
        )}
      </div>

      <div style={{ marginTop: "24px", textAlign: "center", fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>
        Closed markets stay on-chain; hidden in the UI.
      </div>
    </div>
  );
}
