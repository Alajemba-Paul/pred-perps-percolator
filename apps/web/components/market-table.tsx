"use client";

import Link from "next/link";
import { type Market, formatProbability, formatPrice, getStatusLabel, getLifecyclePhase, toMarket } from "@/lib/markets";
import { ArrowRight, AlertTriangle, RefreshCw, Clock, ShieldCheck, Activity, Info } from "lucide-react";
import { useState } from "react";

export function MarketTable({ markets: initialMarkets }: { markets: Market[] }) {
  const [markets, setMarkets] = useState<Market[]>(initialMarkets);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [retryStatus, setRetryStatus] = useState<string | null>(null);

  async function handleRefresh() {
    setIsRefreshing(true);
    setRetryStatus("Pinging indexer...");
    try {
      // First ping markets API
      const res = await fetch("/api/indexer/markets", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setMarkets(data.map(toMarket));
          setRetryStatus(null);
          setIsRefreshing(false);
          return;
        }
      }
      setRetryStatus("Waking Render indexer (cold start can take 30–60s)...");
      // Wait 3 seconds and retry once more
      await new Promise((r) => setTimeout(r, 3000));
      const secondRes = await fetch("/api/indexer/markets", { cache: "no-store" });
      if (secondRes.ok) {
        const secondData = await secondRes.json();
        if (Array.isArray(secondData) && secondData.length > 0) {
          setMarkets(secondData.map(toMarket));
          setRetryStatus(null);
          setIsRefreshing(false);
          return;
        }
      }
      window.location.reload();
    } catch (e) {
      console.error("Refresh error:", e);
      setRetryStatus("Connection failed. Please retry.");
    } finally {
      setIsRefreshing(false);
    }
  }

  if (!markets || markets.length === 0) {
    return (
      <div
        style={{
          border: "1px solid rgba(255, 77, 77, 0.4)",
          background: "rgba(255, 77, 77, 0.05)",
          borderRadius: "8px",
          padding: "36px 24px",
          textAlign: "center",
          margin: "24px 0",
        }}
      >
        <div style={{ display: "inline-flex", padding: "12px", background: "rgba(255, 77, 77, 0.1)", borderRadius: "50%", color: "#ff4d4d", marginBottom: "12px" }}>
          <AlertTriangle size={32} />
        </div>
        <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#fff", marginBottom: "8px" }}>
          Live markets unavailable — indexer/bootstrap offline
        </h3>
        <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.7)", maxWidth: "540px", margin: "0 auto 12px", lineHeight: 1.5 }}>
          The Moxie indexer is currently unreachable or no imported prediction markets are active on Devnet. Trading is disabled until an active market is indexed.
        </p>
        <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", maxWidth: "500px", margin: "0 auto 20px", lineHeight: 1.4, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
          <Info size={13} color="#c7ff4a" />
          <span>Note: Render free tier spins down after idle. First load after idle can take 30–60s while the service boots.</span>
        </p>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              background: "#c7ff4a",
              color: "#000",
              border: "none",
              borderRadius: "4px",
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: isRefreshing ? "wait" : "pointer",
            }}
          >
            <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
            <span>{isRefreshing ? (retryStatus || "Connecting to Render...") : "Retry Indexer Connection"}</span>
          </button>
          {retryStatus && (
            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)" }}>
              {retryStatus}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="market-table-container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#c7ff4a", background: "rgba(199,255,74,0.1)", padding: "4px 8px", borderRadius: "4px" }}>
            <Activity size={12} /> Live Devnet Markets ({markets.length})
          </span>
          <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)" }}>
            1× Isolated Binary Perps
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

      <div className="market-cards" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {markets.map((market) => {
          const yesPrice = market.currentPrice;
          const noPrice = Math.max(0, 1 - yesPrice);
          const isTradable = market.status === "active";
          const formattedClose = market.closeTime
            ? new Date(market.closeTime).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "Until Resolved";

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
                        background: isTradable ? "rgba(199,255,74,0.15)" : "rgba(255,180,0,0.15)",
                        color: isTradable ? "#c7ff4a" : "#ffb400",
                      }}
                    >
                      {getStatusLabel(market.status)}
                    </span>
                    <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>
                      {market.providerMarketId || "Imported Jupiter Market"}
                    </span>
                  </div>
                  <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#fff", margin: 0, lineHeight: 1.4 }}>
                    {market.title || "Jupiter Prediction Market"}
                  </h3>
                </div>

                <Link
                  href={`/trade/${market.slug || market.address}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    background: isTradable ? "#c7ff4a" : "rgba(255,255,255,0.1)",
                    color: isTradable ? "#000" : "rgba(255,255,255,0.6)",
                    fontWeight: 600,
                    fontSize: "13px",
                    padding: "8px 16px",
                    borderRadius: "4px",
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                  }}
                >
                  <span>Trade</span>
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
