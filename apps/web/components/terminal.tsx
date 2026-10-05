"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import { type Market, formatPrice } from "@/lib/markets";
import {
  DEVNET_DEPLOYMENT,
  deriveUserPortfolioAddress,
  getUserAta,
  decodePortfolioSummary,
  decodeMarketAssetSlot,
  buildTradeCpiData,
  readMatcherControl,
  readMaxMarketSlots,
  loadLpConfig,
} from "@/lib/contracts";
import { useUnifiedWallet } from "./wallet-providers";
import {
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";

if (typeof window !== "undefined" && !(window as any).Buffer) {
  (window as any).Buffer = Buffer;
}

export function Terminal({ market }: { market: Market }) {
  const [side, setSide] = useState<"Long" | "Short">("Long");
  const [sizeUsdc, setSizeUsdc] = useState<string>("50");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [tradeError, setTradeError] = useState<string | null>(null);

  // User state
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [hasPortfolio, setHasPortfolio] = useState<boolean | null>(null);

  // Position state on this market
  const [position, setPosition] = useState<{
    side: "long" | "short";
    sizeContracts: number;
    notionalUsdc: number;
    entryPrice: number;
  } | null>(null);

  const wallet = useUnifiedWallet();
  const { connection } = useConnection();

  const activeAddress = wallet.activeAddress;
  const activePubkey = wallet.activePubkey;

  // Poll balances and position
  const refreshAccountAndPosition = useCallback(async () => {
    if (!activePubkey) {
      setSolBalance(null);
      setUsdcBalance(null);
      setHasPortfolio(null);
      setPosition(null);
      return;
    }

    try {
      const res = await fetch(`/api/account-state?address=${activePubkey.toBase58()}`, { cache: "no-store" });
      if (res.ok) {
        const state = await res.json();
        setSolBalance(state.sol !== null && state.sol !== undefined ? state.sol : null);
        setUsdcBalance(state.usdc !== null && state.usdc !== undefined ? state.usdc : null);
        setHasPortfolio(Boolean(state.hasPortfolio));

        if (state.portfolioData?.positions) {
          const pos = state.portfolioData.positions.find(
            (p: any) => p.assetIndex === Number(market.assetIndex) || p.marketId === String(market.marketId)
          );
          if (pos) {
            const rawSize = Number(pos.sizeQ);
            const sizeContracts = Math.abs(rawSize) / 1e6;
            const notional = Number(pos.entryNotional) / 1e6;
            const entryPrice = sizeContracts > 0 ? notional / sizeContracts : 0;
            setPosition({
              side: pos.side,
              sizeContracts,
              notionalUsdc: notional,
              entryPrice,
            });
            return;
          }
        }
        setPosition(null);
        return;
      }
    } catch {
      // Fall through to RPC
    }

    try {
      const lamports = await connection.getBalance(activePubkey);
      setSolBalance(lamports / LAMPORTS_PER_SOL);

      if (DEVNET_DEPLOYMENT.usdcMint) {
        try {
          const userAta = getUserAta(activePubkey, new PublicKey(DEVNET_DEPLOYMENT.usdcMint));
          const tRes = await connection.getTokenAccountBalance(userAta);
          setUsdcBalance(tRes.value.uiAmount ?? 0);
        } catch {
          setUsdcBalance(0);
        }
      }

      const pPubkey = await deriveUserPortfolioAddress(activePubkey);
      const accInfo = await connection.getAccountInfo(pPubkey);
      if (accInfo && accInfo.data.length >= DEVNET_DEPLOYMENT.portfolioAccountLen) {
        setHasPortfolio(true);
        const decoded = decodePortfolioSummary(accInfo.data);
        const pos = decoded.positions.find(
          (p) => p.assetIndex === Number(market.assetIndex) || p.marketId === String(market.marketId)
        );
        if (pos) {
          const rawSize = Number(pos.sizeQ);
          const sizeContracts = Math.abs(rawSize) / 1e6;
          const notional = Number(pos.entryNotional) / 1e6;
          const entryPrice = sizeContracts > 0 ? notional / sizeContracts : 0;
          setPosition({
            side: pos.side,
            sizeContracts,
            notionalUsdc: notional,
            entryPrice,
          });
        } else {
          setPosition(null);
        }
      } else {
        setHasPortfolio(false);
        setPosition(null);
      }
    } catch (e) {
      console.warn("Account refresh error:", e);
    }
  }, [activePubkey, connection, market.assetIndex, market.marketId]);

  useEffect(() => {
    refreshAccountAndPosition();
    const interval = setInterval(refreshAccountAndPosition, 6000);
    return () => clearInterval(interval);
  }, [refreshAccountAndPosition]);

  // Pricing calculations
  const longMark = market.currentPrice;
  const shortMark = Math.max(0, 1 - longMark);
  const longCents = Math.round(longMark * 100);
  const shortCents = Math.max(0, 100 - longCents);
  const activeMark = side === "Long" ? longMark : shortMark;
  const activeCents = side === "Long" ? longCents : shortCents;
  const numSizeUsdc = Math.max(0, parseFloat(sizeUsdc) || 0);

  const estimatedContracts = activeMark > 0 ? numSizeUsdc / activeMark : 0;
  const maxPayout = estimatedContracts * 1.0;
  const potentialProfit = Math.max(0, maxPayout - numSizeUsdc);

  const isTradable = market.status === "active" || market.status === 1;

  // Execute trade (Single click handler, no page-load cache comparison)
  async function handleExecuteTrade() {
    if (isSubmitting) return;

    // Do not submit if the market is not active
    if (market.status !== "active" && market.status !== 1) {
      setTradeError("Market is not active.");
      return;
    }

    if (!wallet.connected || !activePubkey) {
      setTradeError("Reconnect wallet");
      return;
    }
    if (!hasPortfolio) {
      setTradeError("Please create your trading account on the Portfolio page first.");
      return;
    }
    if ((solBalance ?? 0) <= 0) {
      setTradeError("Insufficient devnet SOL for transaction fee. Get devnet SOL.");
      return;
    }
    if (numSizeUsdc <= 0) {
      setTradeError("Please enter a valid trade amount in USDC.");
      return;
    }

    setIsSubmitting(true);
    setTradeError(null);
    setTxSignature(null);

    try {
      const percolatorProgramId = new PublicKey(DEVNET_DEPLOYMENT.percolatorProgramId);
      await loadLpConfig();
      const marketAccount = new PublicKey(DEVNET_DEPLOYMENT.marketAccount);
      const userPortfolioPubkey = await deriveUserPortfolioAddress(activePubkey);
      const lpPortfolioPubkey = new PublicKey(DEVNET_DEPLOYMENT.lpPortfolio);
      const matcherProgramId = new PublicKey(DEVNET_DEPLOYMENT.matcherProgramId);
      const matcherContextPubkey = new PublicKey(DEVNET_DEPLOYMENT.matcherContext);
      const matcherDelegatePubkey = new PublicKey(DEVNET_DEPLOYMENT.matcherDelegate);

      // 1. Read market generation, asset index, portfolio epochs, and blockhash in the same flow (no stale cache)
      const [marketAccInfo, userAccInfo, lpAccInfo, matcherCtxInfo, latestBlockhash] = await Promise.all([
        connection.getAccountInfo(marketAccount, "confirmed"),
        connection.getAccountInfo(userPortfolioPubkey, "confirmed"),
        connection.getAccountInfo(lpPortfolioPubkey, "confirmed"),
        connection.getAccountInfo(matcherContextPubkey, "confirmed"),
        connection.getLatestBlockhash("confirmed"),
      ]);

      if (!matcherCtxInfo || matcherCtxInfo.executable || matcherCtxInfo.data.length < 64 || !matcherCtxInfo.owner.equals(matcherProgramId)) {
        setTradeError("Matcher context is not owned by the matcher program.");
        setIsSubmitting(false);
        return;
      }

      if (!marketAccInfo || marketAccInfo.data.length < 464 + 726) {
        throw new Error("Market account not found or invalid on Solana Devnet.");
      }

      if (!userAccInfo || userAccInfo.data.length < DEVNET_DEPLOYMENT.portfolioAccountLen) {
        setTradeError("Trading account not found onchain. Please create your trading account on the Portfolio page first.");
        setIsSubmitting(false);
        return;
      }

      // 2. Decode user portfolio
      const userDecoded = decodePortfolioSummary(userAccInfo.data);
      const traderPortfolioId = userDecoded.portfolioId;
      const traderControl = readMatcherControl(userAccInfo.data);
      const traderPositionEpoch = traderControl?.positionEpoch ?? userDecoded.positionEpoch;

      let lpPortfolioId = 2n;
      let lpPositionEpoch = 2n;
      let lpMatcherSequence = 2n;
      let lpFeeCapBps = 10_000;
      if (lpAccInfo && lpAccInfo.data.length >= DEVNET_DEPLOYMENT.portfolioAccountLen) {
        const lpDecoded = decodePortfolioSummary(lpAccInfo.data);
        const lpControl = readMatcherControl(lpAccInfo.data);
        lpPortfolioId = lpDecoded.portfolioId;
        lpPositionEpoch = lpControl?.positionEpoch ?? lpDecoded.positionEpoch;
        lpMatcherSequence = lpDecoded.sequence;
        lpFeeCapBps = lpControl?.feeCapBps ?? 10_000;
      }

      const rawIndex = Number(market.assetIndex);
      const targetAssetIndex = Number.isInteger(rawIndex) && rawIndex >= 0 ? rawIndex : 0;
      const chainSlot = decodeMarketAssetSlot(marketAccInfo.data, targetAssetIndex);
      const freshMarketId = chainSlot.marketId;
      const indexerMark = BigInt(Math.round((market.currentPrice || 0) * 1_000_000));
      const maxSlots = readMaxMarketSlots(marketAccInfo.data);
      if (targetAssetIndex >= maxSlots || chainSlot.marketId === 0n) {
        setTradeError("This market is not on the devnet book.");
        setIsSubmitting(false);
        return;
      }
      const usable = (p: bigint) => p > 0n && p < 1_000_000n;
      const chainPrice = usable(chainSlot.effectivePrice)
        ? chainSlot.effectivePrice
        : usable(chainSlot.targetPrice)
          ? chainSlot.targetPrice
          : 0n;
      console.log(
        "price decode",
        "assetIndex", targetAssetIndex,
        "effectivePrice", chainSlot.effectivePrice.toString(),
        "targetPrice", chainSlot.targetPrice.toString(),
        "indexerMark", indexerMark.toString(),
      );
      if (chainPrice === 0n) {
        setTradeError("This market has no usable price yet.");
        setIsSubmitting(false);
        return;
      }
      if (30 > lpFeeCapBps) {
        setTradeError(`Market fee is above the LP cap (${lpFeeCapBps} bps).`);
        setIsSubmitting(false);
        return;
      }

      const sizeQ = 1_000_000n;
      const signedSizeQ = side === "Long" ? sizeQ : -sizeQ;
      const slack = 50_000n;
      const limitPriceE6 = side === "Long"
        ? (chainPrice + slack > 999_999n ? 999_999n : chainPrice + slack)
        : (chainPrice > slack ? chainPrice - slack : 1n);

      const tradeData = buildTradeCpiData({
        traderPortfolioId,
        traderPositionEpoch,
        lpPortfolioId,
        lpPositionEpoch,
        lpMatcherSequence,
        assetIndex: targetAssetIndex,
        marketId: freshMarketId,
        sizeQ: signedSizeQ,
        limitPriceE6,
        feeBps: 0n,
        backingFeeCapBps: 0,
      });

      console.log("Instruction: TradeCpi, sizeQ:", signedSizeQ.toString(), "limit:", limitPriceE6.toString(), "mark:", chainPrice.toString());

      const tx = new Transaction();
      tx.add(ComputeBudgetProgram.requestHeapFrame({ bytes: 128 * 1024 }));
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
      tx.add(
        new TransactionInstruction({
          programId: percolatorProgramId,
          keys: [
            { pubkey: activePubkey, isSigner: true, isWritable: false },
            { pubkey: marketAccount, isSigner: false, isWritable: true },
            { pubkey: userPortfolioPubkey, isSigner: false, isWritable: true },
            { pubkey: lpPortfolioPubkey, isSigner: false, isWritable: true },
            { pubkey: matcherProgramId, isSigner: false, isWritable: false },
            { pubkey: matcherContextPubkey, isSigner: false, isWritable: true },
            { pubkey: matcherDelegatePubkey, isSigner: false, isWritable: false },
          ],
          data: Buffer.from(tradeData),
        })
      );

      tx.recentBlockhash = latestBlockhash.blockhash;
      tx.feePayer = activePubkey;

      const sim = await connection.simulateTransaction(tx, {
        sigVerify: false,
        replaceRecentBlockhash: true,
        commitment: "confirmed",
      });
      const simLogs = sim.value.logs ?? [];
      console.log("Transaction logs:", simLogs);
      if (sim.value.err) {
        const failLog = [...simLogs].reverse().find((l) => l.includes("failed") || l.includes("Error:"));
        const line = failLog || "Trade simulation failed.";
        if (line.includes("0x8")) {
          setTradeError("The liquidity account is not authorized to take this trade. From the project folder run: pnpm reauthorize:lp");
        } else {
          setTradeError(line);
        }
        setIsSubmitting(false);
        return;
      }

      const sig = await wallet.signAndSendTransaction(tx, connection);
      setTxSignature(sig);
      await refreshAccountAndPosition();
    } catch (err: any) {
      console.error("Trade execution error:", err);
      let logLine = "";
      if (typeof err?.getLogs === "function") {
        try {
          const logs = await err.getLogs();
          if (Array.isArray(logs) && logs.length > 0) {
            console.log("Transaction logs:", logs);
            const failLog = [...logs].reverse().find(
              (l: string) =>
                l.includes("failed") ||
                l.includes("Error:") ||
                l.includes("consumed") ||
                l.includes("Panicked")
            );
            if (failLog) logLine = failLog;
          }
        } catch {}
      } else if (Array.isArray(err?.logs) && err.logs.length > 0) {
        const failLog = [...err.logs].reverse().find(
          (l: string) =>
            l.includes("failed") ||
            l.includes("Error:") ||
            l.includes("consumed") ||
            l.includes("Panicked")
        );
        if (failLog) logLine = failLog;
      }

      const rawMsg = err?.message || String(err);
      const fullMsg = logLine ? `${rawMsg} (${logLine})` : rawMsg;

      // Show "Market updated. Refresh and try again." only if the program actually returns custom error 0x1e
      const is0x1e =
        fullMsg.includes("0x1e") ||
        fullMsg.includes("Custom: 30") ||
        fullMsg.includes("AssetGenerationMismatch") ||
        fullMsg.includes("Market updated. Refresh and try again.");

      if (is0x1e) {
        setTradeError("Market updated. Refresh and try again.");
        try {
          await refreshAccountAndPosition();
        } catch {}
        return;
      }

      const is0xd =
        fullMsg.includes("0xd") ||
        fullMsg.includes("Custom: 13") ||
        fullMsg.includes("InvalidTokenProgram") ||
        fullMsg.includes("Wrong token program on the USDC accounts.");

      if (is0xd) {
        setTradeError("Wrong token program on the USDC accounts.");
        return;
      }

      const is0xc =
        fullMsg.includes("0xc") ||
        fullMsg.includes("Custom: 12") ||
        fullMsg.includes("InvalidVaultAccount") ||
        /\bfailed: c\b/.test(fullMsg);

      if (is0xc) {
        setTradeError(logLine ? `Wrong market vault (${logLine})` : "Wrong market vault");
        return;
      }

      if (fullMsg.includes("0xf") || fullMsg.includes("Custom: 15")) {
        setTradeError(logLine ? `Trade size overflowed the risk math (${logLine})` : "Trade size overflowed the risk math.");
        return;
      }

      if (fullMsg.includes("0x9") || fullMsg.includes("Custom: 9")) {
        const ix = fullMsg.match(/Instruction (\d+)/);
        const where = ix ? `instruction ${ix[1]}` : "trade";
        setTradeError(logLine ? `${logLine}` : `Invalid instruction on ${where}: ${rawMsg}`);
        return;
      }

      if (fullMsg.includes("Reconnect")) {
        setTradeError("Reconnect wallet");
        return;
      }

      // One error line only. Clean up newlines or excessive whitespace.
      const cleanLine = fullMsg.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();
      setTradeError(cleanLine || "Trade simulation failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Event Header */}
      <section style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 8px", color: "#fff" }}>
              {market.title}
            </h1>
            {market.rules && (
              <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.65)", margin: 0, lineHeight: 1.5, maxWidth: "680px" }}>
                {market.rules}
              </p>
            )}
          </div>

          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            <div style={{ textAlign: "right" }}>
              <small style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>Long Price</small>
              <strong style={{ fontSize: "20px", color: "#c7ff4a" }}>{longCents}¢</strong>
            </div>
            <div style={{ textAlign: "right" }}>
              <small style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>Short Price</small>
              <strong style={{ fontSize: "20px", color: "#ff8474" }}>{shortCents}¢</strong>
            </div>
          </div>
        </div>
      </section>

      {!isTradable && (
        <div style={{ background: "rgba(255,180,0,0.1)", border: "1px solid rgba(255,180,0,0.3)", borderRadius: "6px", padding: "12px 16px", color: "#ffb400", fontSize: "13px" }}>
          This market is closed. Trading is disabled.
        </div>
      )}

      {/* Main Grid: Ticket + Your Position */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>
        {/* Ticket */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 600, color: "#fff", margin: 0 }}>Place Order</h2>

          {/* Long / Short Selector */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <button
              type="button"
              onClick={() => { setSide("Long"); setTradeError(null); }}
              style={{
                padding: "12px",
                borderRadius: "6px",
                border: "none",
                fontWeight: 700,
                fontSize: "14px",
                cursor: "pointer",
                background: side === "Long" ? "#c7ff4a" : "rgba(255,255,255,0.06)",
                color: side === "Long" ? "#000" : "rgba(255,255,255,0.7)",
              }}
            >
              Buy Long ({longCents}¢)
            </button>

            <button
              type="button"
              onClick={() => { setSide("Short"); setTradeError(null); }}
              style={{
                padding: "12px",
                borderRadius: "6px",
                border: "none",
                fontWeight: 700,
                fontSize: "14px",
                cursor: "pointer",
                background: side === "Short" ? "#ff8474" : "rgba(255,255,255,0.06)",
                color: side === "Short" ? "#000" : "rgba(255,255,255,0.7)",
              }}
            >
              Buy Short ({shortCents}¢)
            </button>
          </div>
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", marginTop: "-6px" }}>
            Long = price goes up (outcome happens) · Short = price goes down
          </div>

          {/* Size Input */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <label style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)" }}>Size (USDC)</label>
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>
                Available: ${usdcBalance !== null ? usdcBalance.toFixed(2) : "0.00"}
              </span>
            </div>
            <div style={{ position: "relative" }}>
              <input
                type="number"
                min="1"
                step="5"
                value={sizeUsdc}
                onChange={(e) => setSizeUsdc(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  background: "rgba(0,0,0,0.4)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: "6px",
                  color: "#fff",
                  fontSize: "16px",
                  fontWeight: 600,
                  boxSizing: "border-box",
                }}
              />
              <span style={{ position: "absolute", right: "12px", top: "14px", fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>
                USDC
              </span>
            </div>

            <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
              {["25", "50", "100", "250"].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setSizeUsdc(amt)}
                  style={{
                    flex: 1,
                    padding: "4px 8px",
                    background: sizeUsdc === amt ? "rgba(199,255,74,0.15)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${sizeUsdc === amt ? "#c7ff4a" : "rgba(255,255,255,0.1)"}`,
                    color: sizeUsdc === amt ? "#c7ff4a" : "rgba(255,255,255,0.7)",
                    borderRadius: "4px",
                    fontSize: "11px",
                    cursor: "pointer",
                  }}
                >
                  ${amt}
                </button>
              ))}
            </div>
          </div>

          {/* Breakdown */}
          <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: "6px", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px", fontSize: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", color: "rgba(255,255,255,0.6)" }}>
              <span>Outcome</span>
              <strong style={{ color: side === "Long" ? "#c7ff4a" : "#ff8474" }}>Buy {side}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "rgba(255,255,255,0.6)" }}>
              <span>Price</span>
              <span style={{ color: "#fff" }}>{activeCents}¢</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "rgba(255,255,255,0.6)" }}>
              <span>Contracts</span>
              <span style={{ color: "#fff" }}>{estimatedContracts.toFixed(1)} units</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "rgba(255,255,255,0.6)", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "8px" }}>
              <span>Payout if {side} wins</span>
              <strong style={{ color: "#c7ff4a" }}>${maxPayout.toFixed(2)}</strong>
            </div>
          </div>

          {/* Error Line */}
          {tradeError && (
            <div style={{ background: "rgba(255,77,77,0.1)", border: "1px solid rgba(255,77,77,0.3)", borderRadius: "6px", padding: "10px", fontSize: "12px", color: "#ff8474", display: "flex", alignItems: "center", gap: "6px" }}>
              <AlertTriangle size={14} style={{ flexShrink: 0 }} />
              <span style={{ whiteSpace: "normal" }}>{tradeError}</span>
            </div>
          )}

          {txSignature && (
            <div style={{ background: "rgba(199,255,74,0.1)", border: "1px solid rgba(199,255,74,0.3)", borderRadius: "6px", padding: "10px", fontSize: "12px", color: "#c7ff4a" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                <CheckCircle2 size={14} />
                <strong>Trade Confirmed on Solana!</strong>
              </div>
              <a
                href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#c7ff4a", textDecoration: "underline", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px" }}
              >
                <span>View Transaction</span>
                <ExternalLink size={10} />
              </a>
            </div>
          )}

          {/* Action Button */}
          {!activeAddress ? (
            <button
              type="button"
              disabled
              style={{
                width: "100%",
                padding: "14px",
                background: "rgba(255,255,255,0.1)",
                border: "none",
                borderRadius: "6px",
                color: "rgba(255,255,255,0.5)",
                fontWeight: 600,
                fontSize: "14px",
                cursor: "not-allowed",
              }}
            >
              Connect Wallet to Trade
            </button>
          ) : !hasPortfolio ? (
            <Link
              href="/portfolio"
              style={{
                width: "100%",
                padding: "14px",
                background: "#c7ff4a",
                borderRadius: "6px",
                color: "#000",
                fontWeight: 700,
                fontSize: "14px",
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                boxSizing: "border-box",
              }}
            >
              <span>Create Trading Account First</span>
              <ArrowRight size={14} />
            </Link>
          ) : (
            <button
              type="button"
              onClick={handleExecuteTrade}
              disabled={isSubmitting || !isTradable || (usdcBalance ?? 0) < numSizeUsdc}
              style={{
                width: "100%",
                padding: "14px",
                background: isTradable && (usdcBalance ?? 0) >= numSizeUsdc ? "#c7ff4a" : "rgba(255,255,255,0.1)",
                border: "none",
                borderRadius: "6px",
                color: isTradable && (usdcBalance ?? 0) >= numSizeUsdc ? "#000" : "rgba(255,255,255,0.4)",
                fontWeight: 700,
                fontSize: "14px",
                cursor: isTradable && (usdcBalance ?? 0) >= numSizeUsdc ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Submitting to Devnet...</span>
                </>
              ) : (
                <span>Trade {side} Perp</span>
              )}
            </button>
          )}
        </div>

        {/* Your Position */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 600, color: "#fff", margin: 0 }}>Your Position</h2>

          {position ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)" }}>Side</span>
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "4px",
                    background: position.side === "long" ? "rgba(199,255,74,0.15)" : "rgba(255,132,116,0.15)",
                    color: position.side === "long" ? "#c7ff4a" : "#ff8474",
                  }}
                >
                  {position.side === "long" ? "Long" : "Short"}
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)" }}>Contracts</span>
                <strong style={{ fontSize: "14px", color: "#fff" }}>{position.sizeContracts.toFixed(1)}</strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)" }}>Entry Price</span>
                <strong style={{ fontSize: "14px", color: "#fff" }}>
                  {(position.entryPrice * 100).toFixed(1)}¢
                </strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)" }}>Position Value</span>
                <strong style={{ fontSize: "14px", color: "#fff" }}>
                  ${position.notionalUsdc.toFixed(2)}
                </strong>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "rgba(255,255,255,0.5)", fontSize: "13px" }}>
              You have no open position on this market.
            </div>
          )}

          <div style={{ marginTop: "auto", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "16px" }}>
            <Link
              href="/portfolio"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                color: "#c7ff4a",
                fontSize: "13px",
                textDecoration: "none",
              }}
            >
              <span>View full portfolio</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
