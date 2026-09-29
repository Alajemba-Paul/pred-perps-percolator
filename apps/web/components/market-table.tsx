"use client";

import Link from "next/link";
import { ArrowUpRight, ShieldCheck, Clock, TrendingUp } from "lucide-react";
import type { Market } from "@/lib/markets";
import { getStatusLabel } from "@/lib/markets";

export function MarketTable({ markets }: { markets: Market[] }) {
  return (
    <div className="market-table-wrap">
      <table className="market-table">
        <thead>
          <tr>
            <th>Event / Prediction Market</th>
            <th>Moxie Mark (YES)</th>
            <th>Provider Index</th>
            <th>Leverage Cap</th>
            <th>Close Time</th>
            <th>Lifecycle</th>
            <th style={{ textAlign: "right" }}>Trade</th>
          </tr>
        </thead>
        <tbody>
          {markets.map((market) => {
            const statusInfo = getStatusLabel(market.status);
            return (
              <tr key={market.slug}>
                <td>
                  <Link href={`/trade/${market.slug}`}>
                    <i className={`market-symbol symbol-${market.category.toLowerCase()}`}>
                      {market.short.slice(0, 3)}
                    </i>
                    <span>
                      <b>{market.question}</b>
                      <em>{market.provider} • Market #{market.marketId}</em>
                    </span>
                  </Link>
                </td>
                <td>
                  <strong style={{ color: "#c7ff4a", fontSize: "14px" }}>
                    {market.moxie.toFixed(1)}¢
                  </strong>
                </td>
                <td>
                  <span style={{ opacity: 0.85 }}>{market.index.toFixed(1)}¢</span>
                </td>
                <td>
                  <span
                    style={{
                      background: "rgba(199, 255, 74, 0.1)",
                      color: "#c7ff4a",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      fontSize: "11px",
                      fontWeight: 600,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <ShieldCheck size={12} /> 1× Isolated
                  </span>
                </td>
                <td>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", opacity: 0.8 }}>
                    <Clock size={12} /> {market.lock}
                  </span>
                </td>
                <td>
                  <span
                    className={`status-pill status-${statusInfo.label.toLowerCase().replace(" ", "-")}`}
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: "12px",
                      fontSize: "11px",
                      fontWeight: 600,
                      background: statusInfo.tradable ? "rgba(199,255,74,0.15)" : "rgba(255,180,0,0.15)",
                      color: statusInfo.tradable ? "#c7ff4a" : "#ffb400",
                    }}
                  >
                    {statusInfo.label}
                  </span>
                </td>
                <td style={{ textAlign: "right" }}>
                  <Link
                    className="row-action"
                    aria-label={`Trade ${market.question}`}
                    href={`/trade/${market.slug}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "6px 12px",
                      background: "rgba(199,255,74,0.1)",
                      border: "1px solid rgba(199,255,74,0.3)",
                      borderRadius: "4px",
                      color: "#c7ff4a",
                      fontSize: "12px",
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    <span>Trade</span>
                    <ArrowUpRight size={14} />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
