"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import { type Market, formatPrice } from "@/lib/markets";
import {
  DEVNET_DEPLOYMENT,
  deriveUserPortfolioAddress,
  getUserAta,
  decodePortfolioSummary,
  buildTradeCpiData,
} from "@/lib/contracts";
import { usePrivyWalletState } from "./wallet-providers";
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
  const [side, setSide] = useState<"YES" | "NO">("YES");
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

  const privy = usePrivyWalletState();
  const external = useWallet();
  const { connection } = useConnection();

  const activeAddress =
    privy.address ||
    (external.connected && external.publicKey ? external.publicKey.toBase58() : null) ||
    (typeof window !== "undefined" ? localStorage.getItem("moxie_direct_phantom") : null) ||
    null;

  const activePubkey = useMemo(() => {
    if (!activeAddress) return null;
    try {
      return new PublicKey(activeAddress);
    } catch {
      return null;
    }
  }, [activeAddress]);

  // Unified signer
  const signAndSendTransaction = useCallback(
    async (tx: Transaction): Promise<string> => {
      if (!activePubkey) throw new Error("Wallet not connected");

      tx.feePayer = activePubkey;
      const latestBlockhash = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = latestBlockhash.blockhash;

      if (privy.wallet) {
        if (typeof privy.wallet.signTransaction === "function") {
          const signedTx = await privy.wallet.signTransaction(tx);
          const rawTx = (signedTx as any).serialize();
          const sig = await connection.sendRawTransaction(rawTx as any, { skipPreflight: false });
          await connection.confirmTransaction({ signature: sig, ...latestBlockhash }, "confirmed");
          return sig;
        }
        if (typeof privy.wallet.sendTransaction === "function") {
          const sig = await privy.wallet.sendTransaction(tx, connection);
          await connection.confirmTransaction({ signature: sig, ...latestBlockhash }, "confirmed");
          return sig;
        }
      }

      if (external.sendTransaction) {
        const sig = await external.sendTransaction(tx, connection);
        await connection.confirmTransaction({ signature: sig, ...latestBlockhash }, "confirmed");
        return sig;
      }

      if (external.signTransaction) {
        const signedTx = await external.signTransaction(tx);
        const rawTx = (signedTx as any).serialize();
        const sig = await connection.sendRawTransaction(rawTx as any, { skipPreflight: false });
        await connection.confirmTransaction({ signature: sig, ...latestBlockhash }, "confirmed");
        return sig;
      }

      if (typeof window !== "undefined" && (window as any).solana?.signAndSendTransaction) {
        const res = await (window as any).solana.signAndSendTransaction(tx);
        const sig = res?.signature || res;
        await connection.confirmTransaction({ signature: sig, ...latestBlockhash }, "confirmed");
        return sig;
      }

      throw new Error("No compatible signing method available on connected wallet.");
    },
    [activePubkey, connection, external, privy.wallet]
  );

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
        setSolBalance(state.sol);
        setUsdcBalance(state.usdc);
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
          const sizeContracts = Math.abs(Number(pos.sizeQ)) / 1e6;
          const notional = Number(pos.entryNotional) / 1e6;
          setPosition({
            side: pos.side,
            sizeContracts,
            notionalUsdc: notional,
            entryPrice: sizeContracts > 0 ? notional / sizeContracts : 0,
          });
        } else {
          setPosition(null);
        }
      } else {
        setHasPortfolio(false);
        setPosition(null);
      }
    } catch (e) {
      console.warn("Terminal account poll:", e);
    }
  }, [activePubkey, connection, market.assetIndex, market.marketId]);

  useEffect(() => {
    refreshAccountAndPosition();
    const interval = setInterval(refreshAccountAndPosition, 6000);
    return () => clearInterval(interval);
  }, [refreshAccountAndPosition]);

  // Pricing calculations
  const yesMark = market.currentPrice;
  const noMark = Math.max(0, 1 - yesMark);
  const yesCents = Math.round(yesMark * 100);
  const noCents = Math.max(0, 100 - yesCents);
  const activeMark = side === "YES" ? yesMark : noMark;
  const numSizeUsdc = Math.max(0, parseFloat(sizeUsdc) || 0);

  const estimatedContracts = activeMark > 0 ? numSizeUsdc / activeMark : 0;
  const maxPayout = estimatedContracts * 1.0;
  const potentialProfit = Math.max(0, maxPayout - numSizeUsdc);

  const isTradable = market.status === "active" || market.status === 1;

  // Execute trade
  async function handleExecuteTrade() {
    if (!activePubkey) {
      setTradeError("Please connect your wallet.");
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
    if ((usdcBalance ?? 0) < numSizeUsdc) {
      setTradeError(`Insufficient test USDC balance ($${(usdcBalance ?? 0).toFixed(2)} available).`);
      return;
    }

    setIsSubmitting(true);
    setTradeError(null);
    setTxSignature(null);

    try {
      const percolatorProgramId = new PublicKey(DEVNET_DEPLOYMENT.percolatorProgramId);
      const marketAccount = new PublicKey(DEVNET_DEPLOYMENT.marketAccount);
      const userPortfolioPubkey = await deriveUserPortfolioAddress(activePubkey);
      const lpPortfolioPubkey = new PublicKey(DEVNET_DEPLOYMENT.lpPortfolio);
      const matcherContextPubkey = new PublicKey(DEVNET_DEPLOYMENT.matcherContext);
      const matcherDelegatePubkey = new PublicKey(DEVNET_DEPLOYMENT.matcherDelegate);

      const sizeMicroUnits = BigInt(Math.floor(estimatedContracts * 1_000_000));
      const signedSizeQ = side === "YES" ? sizeMicroUnits : -sizeMicroUnits;
      const limitPriceE6 = BigInt(Math.floor(activeMark * 1_000_000));

      const tradeData = buildTradeCpiData({
        assetIndex: Number(market.assetIndex) || 1,
        sizeQ: signedSizeQ,
        limitPriceE6,
        marketId: BigInt(market.marketId || "2"),
      });

      const tx = new Transaction();
      tx.add(
        new TransactionInstruction({
          programId: percolatorProgramId,
          keys: [
            { pubkey: activePubkey, isSigner: true, isWritable: true },
            { pubkey: marketAccount, isSigner: false, isWritable: true },
            { pubkey: userPortfolioPubkey, isSigner: false, isWritable: true },
            { pubkey: lpPortfolioPubkey, isSigner: false, isWritable: true },
            { pubkey: matcherContextPubkey, isSigner: false, isWritable: true },
            { pubkey: matcherDelegatePubkey, isSigner: false, isWritable: false },
          ],
          data: Buffer.from(tradeData),
        })
      );

      const sig = await signAndSendTransaction(tx);
      setTxSignature(sig);
      await refreshAccountAndPosition();
    } catch (err: any) {
      console.error("Trade execution error:", err);
      setTradeError(err?.message || "Trade transaction rejected or failed on Devnet.");
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
              <small style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>YES Price</small>
              <strong style={{ fontSize: "20px", color: "#c7ff4a" }}>{yesCents}¢</strong>
            </div>
            <div style={{ textAlign: "right" }}>
              <small style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>NO Price</small>
              <strong style={{ fontSize: "20px", color: "#ff8474" }}>{noCents}¢</strong>
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
          <h2 style={{ fontSize: "15px", fontWeight: 600, color: "#fff", margin: 0 }}>
            Order Ticket
          </h2>

          {/* YES / NO Toggle */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setSide("YES")}
              style={{
                padding: "12px",
                borderRadius: "6px",
                border: "none",
                fontWeight: 700,
                fontSize: "14px",
                cursor: "pointer",
                background: side === "YES" ? "#c7ff4a" : "rgba(255,255,255,0.06)",
                color: side === "YES" ? "#000" : "rgba(255,255,255,0.7)",
              }}
            >
              Buy YES ({yesCents}¢)
            </button>

            <button
              type="button"
              onClick={() => setSide("NO")}
              style={{
                padding: "12px",
                borderRadius: "6px",
                border: "none",
                fontWeight: 700,
                fontSize: "14px",
                cursor: "pointer",
                background: side === "NO" ? "#ff8474" : "rgba(255,255,255,0.06)",
                color: side === "NO" ? "#000" : "rgba(255,255,255,0.7)",
              }}
            >
              Buy NO ({noCents}¢)
            </button>
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
              <strong style={{ color: side === "YES" ? "#c7ff4a" : "#ff8474" }}>Buy {side}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "rgba(255,255,255,0.6)" }}>
              <span>Price</span>
              <span style={{ color: "#fff" }}>{side === "YES" ? yesCents : noCents}¢</span>
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
            <div style={{ background: "rgba(255,77,77,0.1)", border: "1px solid rgba(255,77,77,0.3)", borderRadius: "6px", padding: "10px", fontSize: "12px", color: "#ff8474", display: "flex", alignItems: "flex-start", gap: "6px" }}>
              <AlertTriangle size={14} style={{ marginTop: "2px", flexShrink: 0 }} />
              <span>{tradeError}</span>
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
              <span>Create Trading Account on Portfolio ↗</span>
            </Link>
          ) : !isTradable ? (
            <button
              type="button"
              disabled
              style={{
                width: "100%",
                padding: "14px",
                background: "rgba(255,255,255,0.06)",
                border: "none",
                borderRadius: "6px",
                color: "rgba(255,255,255,0.4)",
                fontWeight: 600,
                fontSize: "14px",
                cursor: "not-allowed",
              }}
            >
              Market Closed
            </button>
          ) : (
            <button
              type="button"
              onClick={handleExecuteTrade}
              disabled={isSubmitting || numSizeUsdc <= 0}
              style={{
                width: "100%",
                padding: "14px",
                background: side === "YES" ? "#c7ff4a" : "#ff8474",
                border: "none",
                borderRadius: "6px",
                color: "#000",
                fontWeight: 700,
                fontSize: "14px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Submitting Trade...</span>
                </>
              ) : (
                <span>Sign Trade (Buy {side} for ${numSizeUsdc.toFixed(0)})</span>
              )}
            </button>
          )}
        </div>

        {/* Your Position Card */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", padding: "20px" }}>
          <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#fff", margin: "0 0 16px" }}>
            Your Position on This Event
          </h3>

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
                  {position.side === "long" ? "YES" : "NO"}
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)" }}>Contracts</span>
                <strong style={{ color: "#fff", fontSize: "14px" }}>{position.sizeContracts.toFixed(1)} units</strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)" }}>Total Value</span>
                <strong style={{ color: "#fff", fontSize: "14px" }}>${position.notionalUsdc.toFixed(2)}</strong>
              </div>
            </div>
          ) : (
            <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", margin: 0 }}>
              You have no active position on this event.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
