"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  type Market,
  formatPrice,
  formatProbability,
  getStatusLabel,
} from "@/lib/markets";
import {
  DEVNET_DEPLOYMENT,
  deriveUserPortfolioAddress,
  getUserAta,
  decodePortfolioSummary,
  buildTradeCpiData,
} from "@/lib/contracts";
import { usePrivyWalletState } from "./wallet-providers";
import {
  Clock,
  ShieldCheck,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  PlusCircle,
  Activity,
} from "lucide-react";

function shortAddress(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function Terminal({ market }: { market: Market }) {
  const [side, setSide] = useState<"YES" | "NO">("YES");
  const [sizeUsdc, setSizeUsdc] = useState<string>("50");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [tradeError, setTradeError] = useState<string | null>(null);

  // User onchain state
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [portfolioCapital, setPortfolioCapital] = useState<number | null>(null);
  const [hasPortfolio, setHasPortfolio] = useState<boolean | null>(null);
  const [userPortfolioPubkeyStr, setUserPortfolioPubkeyStr] = useState<string | null>(null);
  const [isCreatingPortfolio, setIsCreatingPortfolio] = useState(false);

  // Position state on THIS market for connected wallet
  const [position, setPosition] = useState<{
    side: "long" | "short";
    sizeContracts: number;
    notionalUsdc: number;
    entryPrice: number;
    uPnlUsdc: number;
    uPnlPct: number;
  } | null>(null);

  // All positions on all markets for connected wallet
  const [allPositions, setAllPositions] = useState<Array<any>>([]);

  const privy = usePrivyWalletState();
  const external = useWallet();
  const { connection } = useConnection();

  const activeAddress = privy.address || external.publicKey?.toBase58() || null;
  const activePubkey = useMemo(() => (activeAddress ? new PublicKey(activeAddress) : null), [activeAddress]);

  // Unified signer supporting Privy & external adapters
  const signAndSendTransaction = useCallback(
    async (tx: Transaction): Promise<string> => {
      if (!activePubkey) throw new Error("Wallet not connected");

      tx.feePayer = activePubkey;
      const latestBlockhash = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = latestBlockhash.blockhash;

      if (privy.wallet) {
        if (typeof privy.wallet.signTransaction === "function") {
          const signedTx = await privy.wallet.signTransaction(tx);
          const rawTx = signedTx.serialize();
          const sig = await connection.sendRawTransaction(rawTx, { skipPreflight: false });
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
        const rawTx = signedTx.serialize();
        const sig = await connection.sendRawTransaction(rawTx, { skipPreflight: false });
        await connection.confirmTransaction({ signature: sig, ...latestBlockhash }, "confirmed");
        return sig;
      }

      // Direct window.solana fallback
      if (typeof window !== "undefined" && (window as any).solana?.signAndSendTransaction) {
        const res = await (window as any).solana.signAndSendTransaction(tx);
        const sig = res.signature || res;
        await connection.confirmTransaction({ signature: sig, ...latestBlockhash }, "confirmed");
        return sig;
      }

      throw new Error("No compatible signing method available on connected wallet.");
    },
    [activePubkey, connection, external, privy.wallet]
  );

  // Fetch user balances & portfolio state
  const refreshAccountAndPosition = useCallback(async () => {
    if (!activePubkey) {
      setSolBalance(null);
      setUsdcBalance(null);
      setHasPortfolio(null);
      setPortfolioCapital(null);
      setPosition(null);
      setAllPositions([]);
      setUserPortfolioPubkeyStr(null);
      return;
    }

    try {
      // 1. Fetch account state from fast server route
      const res = await fetch(`/api/account-state?address=${activePubkey.toBase58()}`, { cache: "no-store" });
      if (res.ok) {
        const state = await res.json();
        setSolBalance(state.sol);
        setUsdcBalance(state.usdc);
        setHasPortfolio(Boolean(state.hasPortfolio));
        setUserPortfolioPubkeyStr(state.portfolioPubkey);

        if (state.hasPortfolio && state.portfolioData) {
          setPortfolioCapital(Number(state.portfolioData.capital) / 1e6);
          const rawPositions = state.portfolioData.positions || [];
          setAllPositions(rawPositions);

          // Find position on this market
          const targetAssetIndex = Number(market.assetIndex);
          const targetPos = rawPositions.find(
            (p: any) => (p.assetIndex === targetAssetIndex || p.marketId === market.marketId) && BigInt(p.sizeQ) !== 0n
          );

          if (targetPos) {
            const sizeContracts = Math.abs(Number(targetPos.sizeQ) / 1e6);
            const entryNotional = Number(targetPos.entryNotional) / 1e6;
            const entryPrice = sizeContracts > 0 ? entryNotional / sizeContracts : market.currentPrice;
            const currentPrice = targetPos.side === "long" ? market.currentPrice : Math.max(0, 1 - market.currentPrice);
            const currentNotional = sizeContracts * currentPrice;
            const uPnl = currentNotional - entryNotional;
            const uPnlPct = entryNotional > 0 ? (uPnl / entryNotional) * 100 : 0;

            setPosition({
              side: targetPos.side === "long" ? "long" : "short",
              sizeContracts,
              notionalUsdc: currentNotional,
              entryPrice,
              uPnlUsdc: uPnl,
              uPnlPct,
            });
          } else {
            setPosition(null);
          }
        } else {
          setPortfolioCapital(0);
          setPosition(null);
          setAllPositions([]);
        }
      }
    } catch (e) {
      console.warn("Terminal account poll:", e);
    }
  }, [activePubkey, market.assetIndex, market.currentPrice, market.marketId]);

  useEffect(() => {
    refreshAccountAndPosition();
    const interval = setInterval(refreshAccountAndPosition, 5000);
    return () => clearInterval(interval);
  }, [refreshAccountAndPosition]);

  // InitPortfolio inline action
  async function handleCreatePortfolio() {
    if (!activePubkey) return;
    setIsCreatingPortfolio(true);
    setTradeError(null);

    try {
      const percolatorProgramId = new PublicKey(DEVNET_DEPLOYMENT.percolatorProgramId);
      const marketAccount = new PublicKey(DEVNET_DEPLOYMENT.marketAccount);
      const portfolioPubkey = await deriveUserPortfolioAddress(activePubkey);

      const rent = await connection.getMinimumBalanceForRentExemption(DEVNET_DEPLOYMENT.portfolioAccountLen);
      const tx = new Transaction();

      tx.add(
        SystemProgram.createAccountWithSeed({
          fromPubkey: activePubkey,
          newAccountPubkey: portfolioPubkey,
          basePubkey: activePubkey,
          seed: DEVNET_DEPLOYMENT.portfolioSeed,
          lamports: rent,
          space: DEVNET_DEPLOYMENT.portfolioAccountLen,
          programId: percolatorProgramId,
        })
      );

      tx.add(
        new TransactionInstruction({
          programId: percolatorProgramId,
          keys: [
            { pubkey: activePubkey, isSigner: true, isWritable: false },
            { pubkey: marketAccount, isSigner: false, isWritable: true },
            { pubkey: portfolioPubkey, isSigner: false, isWritable: true },
          ],
          data: Buffer.from([1]),
        })
      );

      const sig = await signAndSendTransaction(tx);
      setTxSignature(sig);
      setHasPortfolio(true);
      await refreshAccountAndPosition();
    } catch (err: any) {
      setTradeError(err?.message || "Failed to initialize portfolio account.");
    } finally {
      setIsCreatingPortfolio(false);
    }
  }

  // Prices and calculation
  const yesMark = market.currentPrice;
  const noMark = Math.max(0, 1 - yesMark);
  const activeMark = side === "YES" ? yesMark : noMark;
  const numSizeUsdc = Math.max(0, parseFloat(sizeUsdc) || 0);

  // Contracts = Size USDC / Mark price
  const estimatedContracts = activeMark > 0 ? numSizeUsdc / activeMark : 0;
  const maxPayout = estimatedContracts * 1.0;
  const potentialProfit = Math.max(0, maxPayout - numSizeUsdc);
  const potentialRoiPct = numSizeUsdc > 0 ? (potentialProfit / numSizeUsdc) * 100 : 0;

  const isTradable = market.status === "active" || market.status === 1;

  // Execute Trade on Devnet
  async function handleExecuteTrade() {
    if (!activePubkey) {
      setTradeError("Please connect your Solana Devnet wallet.");
      return;
    }
    if (!hasPortfolio) {
      setTradeError("Please initialize your Percolator portfolio account first.");
      return;
    }
    if (numSizeUsdc <= 0) {
      setTradeError("Please enter a valid USDC trade amount.");
      return;
    }
    if ((usdcBalance ?? 0) < numSizeUsdc) {
      setTradeError(`Insufficient USDC balance ($${(usdcBalance ?? 0).toFixed(2)}). Use 'Get 500 Test USDC' in the wallet menu.`);
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

      // Binary size in micro-contracts (1 contract = 1,000,000 units)
      const sizeMicroUnits = BigInt(Math.floor(estimatedContracts * 1_000_000));
      const signedSizeQ = side === "YES" ? sizeMicroUnits : -sizeMicroUnits;
      const limitPriceE6 = BigInt(Math.floor(activeMark * 1_000_000));

      const tradeData = buildTradeCpiData({
        assetIndex: Number(market.assetIndex),
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
      console.error("Trade submission error:", err);
      setTradeError(err?.message || "Trade transaction rejected or failed on Devnet.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Event Header Banner */}
      <section style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  padding: "2px 6px",
                  borderRadius: "3px",
                  background: isTradable ? "rgba(199,255,74,0.15)" : "rgba(255,180,0,0.15)",
                  color: isTradable ? "#c7ff4a" : "#ffb400",
                }}
              >
                {getStatusLabel(market.status)}
              </span>
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>
                Market #{market.marketId} • {market.address ? `…${market.address.slice(-6)}` : ""}
              </span>
            </div>
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 6px", color: "#fff" }}>
              {market.title}
            </h1>
            {market.rules && (
              <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)", margin: 0, lineHeight: 1.5, maxWidth: "700px" }}>
                {market.rules}
              </p>
            )}
          </div>

          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            <div style={{ textAlign: "right" }}>
              <small style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>YES Mark</small>
              <strong style={{ fontSize: "18px", color: "#c7ff4a" }}>
                {(yesMark * 100).toFixed(1)}¢
              </strong>
            </div>
            <div style={{ textAlign: "right" }}>
              <small style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>NO Mark</small>
              <strong style={{ fontSize: "18px", color: "#ff8474" }}>
                {(noMark * 100).toFixed(1)}¢
              </strong>
            </div>
          </div>
        </div>
      </section>
      {(market.status === 'closed' || market.status === 4) && (
        <div
          style={{
            background: 'rgba(255,180,0,0.12)',
            border: '1px solid rgba(255,180,0,0.3)',
            borderRadius: '8px',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            color: '#ffb400',
            fontSize: '13px',
          }}
        >
          <AlertTriangle size={18} style={{ flexShrink: 0 }} />
          <div>
            <strong>Market Closed / Inactive:</strong> Trading is disabled on this asset slot. Historical or retired record retained for on-chain audit.
          </div>
        </div>
      )}

      {(market.status === 'unused' || market.status === 0) && (
        <div 
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '8px',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            color: 'rgba(255,255,255,0.7)',
            fontSize: '13px',
          }}
        >
          <AlertTriangle size={18} style={{ flexShrink: 0 }} />
          <div>
            <strong>Slot Unused / Candidate:</strong> This asset slot is not currently active for on-chain trading.
          </div>
        </div>
      )}

      {/* Main Trade Section: Simplified Ticket + Position Overview */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>
        {/* Left: Simplified Order Ticket */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 600, color: "#fff", margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Order Ticket
          </h2>

          {/* YES / NO Switcher */}
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
                transition: "all 0.15s",
              }}
            >
              Buy YES ({(yesMark * 100).toFixed(1)}¢)
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
                transition: "all 0.15s",
              }}
            >
              Buy NO ({(noMark * 100).toFixed(1)}¢)
            </button>
          </div>

          {/* Size in USDC Input */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <label style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)" }}>Size (USDC)</label>
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>
                Avail: ${usdcBalance !== null ? usdcBalance.toFixed(2) : "0.00"}
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

            {/* Quick chips */}
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

          {/* Trade Preview Breakdown */}
          <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: "6px", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px", fontSize: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", color: "rgba(255,255,255,0.6)" }}>
              <span>Outcome Selection</span>
              <strong style={{ color: side === "YES" ? "#c7ff4a" : "#ff8474" }}>Buy {side}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "rgba(255,255,255,0.6)" }}>
              <span>Execution Price</span>
              <span style={{ color: "#fff" }}>{(activeMark * 100).toFixed(1)}¢ per contract</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "rgba(255,255,255,0.6)" }}>
              <span>Est. Contracts</span>
              <span style={{ color: "#fff" }}>{estimatedContracts.toFixed(1)} units</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "rgba(255,255,255,0.6)" }}>
              <span>Max Payout (if {side} wins)</span>
              <strong style={{ color: "#c7ff4a" }}>${maxPayout.toFixed(2)} (+{potentialRoiPct.toFixed(0)}%)</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "rgba(255,255,255,0.6)", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "8px" }}>
              <span>Leverage & Margin</span>
              <span style={{ color: "#c7ff4a", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <ShieldCheck size={12} /> 1× Isolated (100% Margin)
              </span>
            </div>
          </div>

          {/* Feedback & Error */}
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
                <strong>Trade Executed on Devnet!</strong>
              </div>
              <a
                href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#c7ff4a", textDecoration: "underline", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px" }}
              >
                <span>View Transaction on Explorer</span>
                <ExternalLink size={10} />
              </a>
            </div>
          )}

          {/* Primary Action Button */}
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
                color: "rgba(255,255,255,0.6)",
                fontWeight: 600,
                fontSize: "14px",
                cursor: "not-allowed",
              }}
            >
              Connect Wallet in Header to Trade
            </button>
          ) : !hasPortfolio ? (
            <button
              type="button"
              onClick={handleCreatePortfolio}
              disabled={isCreatingPortfolio}
              style={{
                width: "100%",
                padding: "14px",
                background: "#c7ff4a",
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
              {isCreatingPortfolio ? <Loader2 size={16} className="animate-spin" /> : <PlusCircle size={16} />}
              <span>{isCreatingPortfolio ? "Initializing..." : "Initialize Portfolio Account"}</span>
            </button>
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
              {market.status === 'closed' || market.status === 4 ? 'Market Closed (Trading Disabled)' : market.status === 'unused' || market.status === 0 ? 'Unused Slot (Trading Disabled)' : 'Market Locked (Trading Disabled)'}
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
                  <span>Submitting Trade to Solana...</span>
                </>
              ) : (
                <span>Sign Trade (Buy {side} for ${numSizeUsdc.toFixed(0)})</span>
              )}
            </button>
          )}
        </div>

        {/* Right: Connected Wallet Positions & Account Panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Active Market Position Card */}
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", padding: "20px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#fff", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Your Position on This Market
            </h3>

            {position ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "3px",
                      background: position.side === "long" ? "rgba(199,255,74,0.15)" : "rgba(255,132,116,0.15)",
                      color: position.side === "long" ? "#c7ff4a" : "#ff8474",
                    }}
                  >
                    HOLDING {position.side.toUpperCase()}
                  </span>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>
                    {position.sizeContracts.toFixed(1)} Contracts
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", background: "rgba(0,0,0,0.3)", padding: "10px", borderRadius: "6px" }}>
                  <div>
                    <small style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)" }}>Entry Price</small>
                    <div style={{ fontSize: "13px", color: "#fff", fontWeight: 600 }}>
                      {(position.entryPrice * 100).toFixed(1)}¢
                    </div>
                  </div>

                  <div>
                    <small style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)" }}>Current Value</small>
                    <div style={{ fontSize: "13px", color: "#fff", fontWeight: 600 }}>
                      ${position.notionalUsdc.toFixed(2)}
                    </div>
                  </div>

                  <div>
                    <small style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)" }}>Unrealized PnL</small>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: position.uPnlUsdc >= 0 ? "#c7ff4a" : "#ff8474" }}>
                      {position.uPnlUsdc >= 0 ? "+" : ""}${position.uPnlUsdc.toFixed(2)} ({position.uPnlPct.toFixed(1)}%)
                    </div>
                  </div>

                  <div>
                    <small style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)" }}>Resolution</small>
                    <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.8)" }}>
                      Deterministic ($1 or $0)
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: "16px 0", textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: "13px" }}>
                {activeAddress
                  ? "No open position on this market for your connected wallet."
                  : "Connect wallet to view your active positions."}
              </div>
            )}
          </div>

          {/* Account Health & Solvency Card */}
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", padding: "20px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#fff", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Portfolio Margin & Solvency
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div style={{ background: "rgba(0,0,0,0.3)", padding: "10px", borderRadius: "6px" }}>
                <small style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)" }}>PORTFOLIO STATUS</small>
                <div style={{ fontSize: "13px", color: hasPortfolio ? "#c7ff4a" : "#ffb400", fontWeight: 600, marginTop: "2px" }}>
                  {hasPortfolio ? "Created & Verified" : "Not Initialized"}
                </div>
              </div>

              <div style={{ background: "rgba(0,0,0,0.3)", padding: "10px", borderRadius: "6px" }}>
                <small style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)" }}>MARGIN SOLVENCY</small>
                <div style={{ fontSize: "13px", color: "#c7ff4a", fontWeight: 600, marginTop: "2px", display: "flex", alignItems: "center", gap: "4px" }}>
                  <ShieldCheck size={13} /> 100% (1× Isolated)
                </div>
              </div>

              <div style={{ background: "rgba(0,0,0,0.3)", padding: "10px", borderRadius: "6px" }}>
                <small style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)" }}>COLLATERAL (USDC)</small>
                <div style={{ fontSize: "13px", color: "#fff", fontWeight: 600, marginTop: "2px" }}>
                  ${portfolioCapital !== null ? portfolioCapital.toFixed(2) : "0.00"}
                </div>
              </div>

              <div style={{ background: "rgba(0,0,0,0.3)", padding: "10px", borderRadius: "6px" }}>
                <small style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)" }}>PORTFOLIO PDA</small>
                <div style={{ fontSize: "12px", color: "#c7ff4a", fontFamily: "monospace", marginTop: "2px" }}>
                  {userPortfolioPubkeyStr ? shortAddress(userPortfolioPubkeyStr) : "—"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
