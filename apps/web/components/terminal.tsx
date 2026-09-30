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
  getLifecyclePhase,
} from "@/lib/markets";
import {
  DEVNET_DEPLOYMENT,
  deriveUserPortfolioAddress,
  getUserAta,
  decodePortfolioSummary,
  buildTradeCpiData,
  buildDepositData,
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
  ArrowDownLeft,
  XCircle,
  Wallet,
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
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Position state on THIS market
  const [position, setPosition] = useState<{
    side: "long" | "short";
    sizeContracts: number;
    notionalUsdc: number;
    entryPrice: number;
    uPnlUsdc: number;
    uPnlPct: number;
  } | null>(null);

  const privy = usePrivyWalletState();
  const external = useWallet();
  const { connection } = useConnection();

  const activeAddress = privy.address || external.publicKey?.toBase58() || null;
  const activePubkey = useMemo(() => (activeAddress ? new PublicKey(activeAddress) : null), [activeAddress]);

  // Unified signer supporting Privy embedded wallets & external adapters
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
      return;
    }

    try {
      // 1. SOL Balance
      const lamports = await connection.getBalance(activePubkey);
      setSolBalance(lamports / LAMPORTS_PER_SOL);

      // 2. USDC ATA Balance
      const mintPubkey = new PublicKey(DEVNET_DEPLOYMENT.usdcMint);
      const userAta = getUserAta(activePubkey, mintPubkey);
      try {
        const tokenRes = await connection.getTokenAccountBalance(userAta);
        setUsdcBalance(tokenRes.value.uiAmount ?? 0);
      } catch {
        setUsdcBalance(0);
      }

      // 3. User Portfolio Account
      const userPortfolioPubkey = await deriveUserPortfolioAddress(activePubkey);
      const accInfo = await connection.getAccountInfo(userPortfolioPubkey);

      if (accInfo && accInfo.data.length >= DEVNET_DEPLOYMENT.portfolioAccountLen) {
        setHasPortfolio(true);
        const decoded = decodePortfolioSummary(accInfo.data);
        setPortfolioCapital(Number(decoded.capital) / 1e6);

        // Check for position on this market (assetIndex 1 in devnet deployment)
        const targetAssetIndex = 1;
        const targetPos = decoded.positions.find((p) => p.assetIndex === targetAssetIndex && BigInt(p.sizeQ) !== 0n);

        if (targetPos) {
          const sizeContracts = Number(targetPos.sizeQ) / 1e6;
          const entryNotional = Number(targetPos.entryNotional) / 1e6;
          const entryPrice = sizeContracts > 0 ? entryNotional / sizeContracts : market.currentPrice;
          const currentPrice = (targetPos.side === 'long' || (targetPos.side as any) === 0) ? market.currentPrice : Math.max(0, 1 - market.currentPrice);
          const currentNotional = sizeContracts * currentPrice;
          const uPnl = currentNotional - entryNotional;
          const uPnlPct = entryNotional > 0 ? (uPnl / entryNotional) * 100 : 0;

          setPosition({
            side: (targetPos.side === 'long' || (targetPos.side as any) === 0) ? 'long' : 'short',
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
        setHasPortfolio(false);
        setPortfolioCapital(0);
        setPosition(null);
      }
    } catch (e) {
      console.warn("Error refreshing terminal position state:", e);
    }
  }, [activePubkey, connection, market.currentPrice]);

  useEffect(() => {
    refreshAccountAndPosition();
    const interval = setInterval(refreshAccountAndPosition, 4000);
    return () => clearInterval(interval);
  }, [refreshAccountAndPosition]);

  // Prices and calculation
  const yesMark = market.currentPrice;
  const noMark = Math.max(0, 1 - yesMark);
  const activeMark = side === "YES" ? yesMark : noMark;
  const numSizeUsdc = Math.max(0, parseFloat(sizeUsdc) || 0);

  // Contracts = USDC size / price per contract
  const estContracts = activeMark > 0 ? Math.floor(numSizeUsdc / activeMark) : 0;
  const tradeFeeBps = 30; // 0.30%
  const estFeeUsdc = (numSizeUsdc * tradeFeeBps) / 10_000;
  const marginRequired = numSizeUsdc; // 100% initial margin = 1x isolated perp

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

  // Action: 1-Click Create Trading Account
  async function handleCreatePortfolio() {
    if (!activePubkey) return;
    setIsActionLoading(true);
    setTradeError(null);
    setActionSuccess(null);

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
          data: Buffer.from([1]), // tag 1: InitPortfolio
        })
      );

      const sig = await signAndSendTransaction(tx);
      setActionSuccess(`Trading account created! Tx: ${sig.slice(0, 8)}...`);
      await refreshAccountAndPosition();
    } catch (err: any) {
      setTradeError(err.message || "Failed to initialize portfolio.");
    } finally {
      setIsActionLoading(false);
    }
  }

  // Action: 1-Click Faucet
  async function handleFaucet() {
    if (!activeAddress) return;
    setIsActionLoading(true);
    setTradeError(null);
    setActionSuccess(null);

    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: activeAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Faucet failed");
      setActionSuccess("Received 500 Test USDC + Devnet SOL!");
      await refreshAccountAndPosition();
    } catch (err: any) {
      setTradeError(err.message || "Faucet error");
    } finally {
      setIsActionLoading(false);
    }
  }

  // Action: 1-Click Deposit Margin
  async function handleDepositMargin() {
    if (!activePubkey) return;
    setIsActionLoading(true);
    setTradeError(null);
    setActionSuccess(null);

    try {
      const percolatorProgramId = new PublicKey(DEVNET_DEPLOYMENT.percolatorProgramId);
      const marketAccount = new PublicKey(DEVNET_DEPLOYMENT.marketAccount);
      const portfolioPubkey = await deriveUserPortfolioAddress(activePubkey);
      const mintPubkey = new PublicKey(DEVNET_DEPLOYMENT.usdcMint);
      const vaultAuthority = new PublicKey(DEVNET_DEPLOYMENT.vaultAuthority);
      const collateralVault = new PublicKey(DEVNET_DEPLOYMENT.collateralVault);
      const userAta = getUserAta(activePubkey, mintPubkey);

      const depositAmountAtoms = 100_000_000n; // 100 USDC
      const depositData = buildDepositData(depositAmountAtoms);

      const tx = new Transaction();
      tx.add(
        new TransactionInstruction({
          programId: percolatorProgramId,
          keys: [
            { pubkey: activePubkey, isSigner: true, isWritable: true },
            { pubkey: marketAccount, isSigner: false, isWritable: true },
            { pubkey: portfolioPubkey, isSigner: false, isWritable: true },
            { pubkey: userAta, isSigner: false, isWritable: true },
            { pubkey: collateralVault, isSigner: false, isWritable: true },
            { pubkey: vaultAuthority, isSigner: false, isWritable: false },
            { pubkey: new PublicKey(DEVNET_DEPLOYMENT.tokenProgramId), isSigner: false, isWritable: false },
          ],
          data: Buffer.from(depositData),
        })
      );

      const sig = await signAndSendTransaction(tx);
      setActionSuccess(`Deposited $100 Margin! Tx: ${sig.slice(0, 8)}...`);
      await refreshAccountAndPosition();
    } catch (err: any) {
      setTradeError(err.message || "Deposit failed");
    } finally {
      setIsActionLoading(false);
    }
  }

  // Action: Submit Trade on Solana Devnet
  async function handleSubmitTrade() {
    if (!activePubkey) return;
    if (!hasPortfolio) {
      setTradeError("You must create a trading account first.");
      return;
    }
    if ((portfolioCapital ?? 0) < numSizeUsdc) {
      setTradeError(`Insufficient portfolio margin. You have $${portfolioCapital?.toFixed(2) ?? "0.00"}, need $${numSizeUsdc}.`);
      return;
    }

    setIsSubmitting(true);
    setTradeError(null);
    setTxSignature(null);

    try {
      const matcherProgramId = new PublicKey(DEVNET_DEPLOYMENT.matcherProgramId);
      const percolatorProgramId = new PublicKey(DEVNET_DEPLOYMENT.percolatorProgramId);
      const marketAccount = new PublicKey(DEVNET_DEPLOYMENT.marketAccount);
      const userPortfolio = await deriveUserPortfolioAddress(activePubkey);
      const lpPortfolio = new PublicKey(DEVNET_DEPLOYMENT.lpPortfolio);
      const matcherContext = new PublicKey(DEVNET_DEPLOYMENT.matcherContext);

      const isLong = side === "YES";
      const absSizeQ = BigInt(Math.floor(estContracts * 1_000_000));
      const sizeQ = isLong ? absSizeQ : -absSizeQ;
      const limitPriceE6 = BigInt(Math.round(activeMark * 1_000_000));
      const assetIndex = 1;

      const tradeData = buildTradeCpiData({
        assetIndex,
        sizeQ,
        limitPriceE6,
      });

      const tx = new Transaction();
      tx.add(
        new TransactionInstruction({
          programId: matcherProgramId,
          keys: [
            { pubkey: activePubkey, isSigner: true, isWritable: false },
            { pubkey: matcherContext, isSigner: false, isWritable: true },
            { pubkey: percolatorProgramId, isSigner: false, isWritable: false },
            { pubkey: marketAccount, isSigner: false, isWritable: true },
            { pubkey: userPortfolio, isSigner: false, isWritable: true },
            { pubkey: lpPortfolio, isSigner: false, isWritable: true },
          ],
          data: Buffer.from(tradeData),
        })
      );

      const sig = await signAndSendTransaction(tx);
      setTxSignature(sig);
      await refreshAccountAndPosition();
    } catch (err: any) {
      console.error("Trade submission error:", err);
      setTradeError(err.message || "Transaction rejected or simulation failed on Devnet.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "900px", margin: "0 auto" }}>
      {/* ============================================================== */}
      {/* BAND 1: MARKET HEADER                                          */}
      {/* ============================================================== */}
      <section
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "8px",
          padding: "20px 24px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", marginBottom: "12px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  padding: "2px 8px",
                  borderRadius: "4px",
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
            <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#fff", margin: 0, lineHeight: 1.3 }}>
              {market.title || "Jupiter Prediction Market"}
            </h1>
          </div>

          <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", display: "block" }}>Risk Model</span>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#c7ff4a", display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <ShieldCheck size={14} /> 1× Isolated Perp
            </span>
          </div>
        </div>

        {market.rules && (
          <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.65)", margin: "0 0 16px", lineHeight: 1.5 }}>
            {market.rules}
          </p>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "12px",
            paddingTop: "14px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div>
            <small style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", display: "block" }}>YES Mark</small>
            <strong style={{ fontSize: "18px", color: "#c7ff4a" }}>
              {(yesMark * 100).toFixed(1)}¢ <span style={{ fontSize: "12px", fontWeight: 400 }}>({formatProbability(yesMark)})</span>
            </strong>
          </div>

          <div>
            <small style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", display: "block" }}>NO Mark</small>
            <strong style={{ fontSize: "18px", color: "#ff8474" }}>
              {(noMark * 100).toFixed(1)}¢ <span style={{ fontSize: "12px", fontWeight: 400 }}>({formatProbability(noMark)})</span>
            </strong>
          </div>

          <div>
            <small style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", display: "block" }}>Closes / Resolution</small>
            <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.85)", display: "inline-flex", alignItems: "center", gap: "5px" }}>
              <Clock size={13} /> {formattedClose}
            </span>
          </div>

          <div>
            <small style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", display: "block" }}>Trade Fee</small>
            <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.85)" }}>
              0.30% (Base Fee)
            </span>
          </div>
        </div>
      </section>

      {/* ============================================================== */}
      {/* BAND 2: SIMPLE TRADING TICKET                                  */}
      {/* ============================================================== */}
      <section
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "8px",
          padding: "24px",
        }}
      >
        <h2 style={{ fontSize: "16px", fontWeight: 600, margin: "0 0 16px", color: "#fff" }}>
          Trade 1× Binary Perp
        </h2>

        {/* YES / NO Toggle */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "18px" }}>
          <button
            type="button"
            onClick={() => setSide("YES")}
            style={{
              padding: "12px",
              borderRadius: "6px",
              border: side === "YES" ? "2px solid #c7ff4a" : "1px solid rgba(255,255,255,0.1)",
              background: side === "YES" ? "rgba(199,255,74,0.15)" : "rgba(255,255,255,0.02)",
              color: side === "YES" ? "#c7ff4a" : "rgba(255,255,255,0.7)",
              fontWeight: 700,
              fontSize: "14px",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span>BUY YES</span>
            <span style={{ fontSize: "12px", fontWeight: 400 }}>{(yesMark * 100).toFixed(1)}¢</span>
          </button>

          <button
            type="button"
            onClick={() => setSide("NO")}
            style={{
              padding: "12px",
              borderRadius: "6px",
              border: side === "NO" ? "2px solid #ff8474" : "1px solid rgba(255,255,255,0.1)",
              background: side === "NO" ? "rgba(255,132,116,0.15)" : "rgba(255,255,255,0.02)",
              color: side === "NO" ? "#ff8474" : "rgba(255,255,255,0.7)",
              fontWeight: 700,
              fontSize: "14px",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span>BUY NO</span>
            <span style={{ fontSize: "12px", fontWeight: 400 }}>{(noMark * 100).toFixed(1)}¢</span>
          </button>
        </div>

        {/* Size Input */}
        <div style={{ marginBottom: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "6px" }}>
            <span style={{ color: "rgba(255,255,255,0.6)" }}>Position Size (USDC)</span>
            <span style={{ color: "rgba(255,255,255,0.6)" }}>
              Available Margin: <strong style={{ color: "#fff" }}>${portfolioCapital?.toFixed(2) ?? "0.00"}</strong>
            </span>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="number"
              min="1"
              step="5"
              value={sizeUsdc}
              onChange={(e) => setSizeUsdc(e.target.value)}
              placeholder="50"
              style={{
                flex: 1,
                padding: "10px 14px",
                background: "rgba(0,0,0,0.3)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "4px",
                color: "#fff",
                fontSize: "16px",
                fontWeight: 600,
              }}
            />
            {["25", "50", "100", "250"].map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setSizeUsdc(amt)}
                style={{
                  padding: "0 12px",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "4px",
                  color: "rgba(255,255,255,0.8)",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                ${amt}
              </button>
            ))}
          </div>
        </div>

        {/* Preview Summary */}
        <div
          style={{
            background: "rgba(0,0,0,0.2)",
            borderRadius: "6px",
            padding: "14px 16px",
            marginBottom: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            fontSize: "12px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "rgba(255,255,255,0.6)" }}>Contracts to Buy</span>
            <strong style={{ color: "#fff" }}>{estContracts.toLocaleString()} contracts</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "rgba(255,255,255,0.6)" }}>Est. Entry Price</span>
            <span style={{ color: "#fff" }}>{(activeMark * 100).toFixed(1)}¢ per contract</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "rgba(255,255,255,0.6)" }}>Est. Fee (0.30%)</span>
            <span style={{ color: "#fff" }}>${estFeeUsdc.toFixed(3)} USDC</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "rgba(255,255,255,0.6)" }}>Required Margin (100% Solvency)</span>
            <strong style={{ color: "#c7ff4a" }}>${marginRequired.toFixed(2)} USDC (1× Isolated)</strong>
          </div>
        </div>

        {/* Readiness Checklist / In-line Actions */}
        {!activeAddress ? (
          <div style={{ textAlign: "center", padding: "16px", background: "rgba(255,255,255,0.02)", borderRadius: "6px" }}>
            <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.7)", margin: "0 0 10px" }}>
              Connect your Devnet wallet to start trading.
            </p>
            <button
              type="button"
              onClick={privy.login}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                background: "#c7ff4a",
                color: "#000",
                fontWeight: 600,
                fontSize: "13px",
                padding: "10px 20px",
                borderRadius: "4px",
                border: "none",
                cursor: "pointer",
              }}
            >
              <Wallet size={15} />
              <span>Connect Wallet to Trade</span>
            </button>
          </div>
        ) : !hasPortfolio ? (
          <div style={{ padding: "14px", background: "rgba(255,180,0,0.08)", border: "1px solid rgba(255,180,0,0.25)", borderRadius: "6px", marginBottom: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", color: "#ffb400" }}>
              <AlertTriangle size={15} />
              <strong style={{ fontSize: "13px" }}>Trading Account Required</strong>
            </div>
            <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)", margin: "0 0 10px" }}>
              Percolator requires an initialized on-chain portfolio account to track margin solvency.
            </p>
            <button
              type="button"
              onClick={handleCreatePortfolio}
              disabled={isActionLoading || (solBalance ?? 0) < 0.05}
              style={{
                width: "100%",
                padding: "10px",
                background: "#c7ff4a",
                color: "#000",
                fontWeight: 600,
                fontSize: "13px",
                borderRadius: "4px",
                border: "none",
                cursor: (solBalance ?? 0) >= 0.05 ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              {isActionLoading ? <Loader2 size={14} className="animate-spin" /> : <PlusCircle size={14} />}
              <span>1-Click: Create Trading Account (InitPortfolio)</span>
            </button>
          </div>
        ) : (portfolioCapital ?? 0) < numSizeUsdc ? (
          <div style={{ padding: "14px", background: "rgba(255,180,0,0.08)", border: "1px solid rgba(255,180,0,0.25)", borderRadius: "6px", marginBottom: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", color: "#ffb400" }}>
              <AlertTriangle size={15} />
              <strong style={{ fontSize: "13px" }}>Insufficient Portfolio Margin</strong>
            </div>
            <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)", margin: "0 0 10px" }}>
              You have ${portfolioCapital?.toFixed(2) ?? "0.00"} deposited in your Percolator portfolio, but need ${numSizeUsdc.toFixed(2)}.
            </p>
            <div style={{ display: "flex", gap: "8px" }}>
              {(usdcBalance ?? 0) < 100 ? (
                <button
                  type="button"
                  onClick={handleFaucet}
                  disabled={isActionLoading}
                  style={{
                    flex: 1,
                    padding: "8px",
                    background: "rgba(255,255,255,0.1)",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: "12px",
                    borderRadius: "4px",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                  }}
                >
                  {isActionLoading ? <Loader2 size={12} className="animate-spin" /> : <PlusCircle size={12} />}
                  <span>Get 500 Test USDC</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleDepositMargin}
                disabled={isActionLoading || (usdcBalance ?? 0) < 100}
                style={{
                  flex: 1,
                  padding: "8px",
                  background: "#c7ff4a",
                  color: "#000",
                  fontWeight: 600,
                  fontSize: "12px",
                  borderRadius: "4px",
                  border: "none",
                  cursor: (usdcBalance ?? 0) >= 100 ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
              >
                {isActionLoading ? <Loader2 size={12} className="animate-spin" /> : <ArrowDownLeft size={12} />}
                <span>Deposit $100 Margin</span>
              </button>
            </div>
          </div>
        ) : (
          /* Main Submit Button */
          <button
            type="button"
            onClick={handleSubmitTrade}
            disabled={isSubmitting || !isTradable || estContracts <= 0}
            style={{
              width: "100%",
              padding: "14px",
              background: isTradable ? (side === "YES" ? "#c7ff4a" : "#ff8474") : "rgba(255,255,255,0.1)",
              color: isTradable ? "#000" : "rgba(255,255,255,0.5)",
              fontWeight: 700,
              fontSize: "15px",
              borderRadius: "4px",
              border: "none",
              cursor: isTradable && estContracts > 0 ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Simulating & Signing on Devnet...</span>
              </>
            ) : !isTradable ? (
              <span>Market {getStatusLabel(market.status)} — Trading Disabled</span>
            ) : (
              <span>Sign {side === "YES" ? "BUY YES" : "BUY NO"} on Devnet (1× Isolated)</span>
            )}
          </button>
        )}

        {/* Feedback / Alert */}
        {txSignature && (
          <div
            style={{
              marginTop: "16px",
              padding: "12px 14px",
              background: "rgba(199,255,74,0.1)",
              border: "1px solid rgba(199,255,74,0.3)",
              borderRadius: "6px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#c7ff4a", fontSize: "13px" }}>
              <CheckCircle2 size={16} />
              <strong>Trade executed successfully on Devnet!</strong>
            </div>
            <a
              href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: "12px",
                color: "#c7ff4a",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                textDecoration: "underline",
              }}
            >
              <span>View Explorer</span>
              <ExternalLink size={12} />
            </a>
          </div>
        )}

        {actionSuccess && !txSignature && (
          <p style={{ marginTop: "12px", fontSize: "12px", color: "#c7ff4a", background: "rgba(199,255,74,0.1)", padding: "8px 12px", borderRadius: "4px" }}>
            {actionSuccess}
          </p>
        )}

        {tradeError && (
          <div
            style={{
              marginTop: "14px",
              padding: "10px 14px",
              background: "rgba(255,77,77,0.1)",
              border: "1px solid rgba(255,77,77,0.3)",
              borderRadius: "4px",
              color: "#ff4d4d",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <AlertTriangle size={14} />
            <span>{tradeError}</span>
          </div>
        )}
      </section>

      {/* ============================================================== */}
      {/* BAND 3: MY POSITION ON THIS MARKET                             */}
      {/* ============================================================== */}
      <section
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "8px",
          padding: "20px 24px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 600, margin: 0, color: "#fff" }}>
            My Position on This Market
          </h2>
          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>
            Auto-polling Devnet state
          </span>
        </div>

        {!activeAddress ? (
          <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", margin: 0 }}>
            Connect wallet to view your live position.
          </p>
        ) : !position ? (
          <div style={{ padding: "20px", textAlign: "center", background: "rgba(0,0,0,0.15)", borderRadius: "6px" }}>
            <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", margin: 0 }}>
              No open positions on this market for {shortAddress(activeAddress)}.
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "14px", background: "rgba(0,0,0,0.2)", padding: "16px", borderRadius: "6px" }}>
            <div>
              <small style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", display: "block" }}>Side</small>
              <strong style={{ fontSize: "15px", color: position.side === "long" ? "#c7ff4a" : "#ff8474" }}>
                {position.side === "long" ? "LONG YES" : "SHORT NO"}
              </strong>
            </div>

            <div>
              <small style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", display: "block" }}>Contracts</small>
              <strong style={{ fontSize: "15px", color: "#fff" }}>
                {position.sizeContracts.toLocaleString()}
              </strong>
            </div>

            <div>
              <small style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", display: "block" }}>Entry Mark</small>
              <span style={{ fontSize: "14px", color: "#fff" }}>
                {(position.entryPrice * 100).toFixed(1)}¢
              </span>
            </div>

            <div>
              <small style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", display: "block" }}>Current Mark</small>
              <span style={{ fontSize: "14px", color: "#fff" }}>
                {(activeMark * 100).toFixed(1)}¢
              </span>
            </div>

            <div>
              <small style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", display: "block" }}>Unrealized PnL</small>
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: position.uPnlUsdc >= 0 ? "#c7ff4a" : "#ff4d4d",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "2px",
                }}
              >
                {position.uPnlUsdc >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                ${Math.abs(position.uPnlUsdc).toFixed(2)} ({position.uPnlPct >= 0 ? "+" : ""}{position.uPnlPct.toFixed(1)}%)
              </span>
            </div>

            <div>
              <small style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", display: "block" }}>Margin Locked</small>
              <span style={{ fontSize: "14px", color: "#fff" }}>
                ${position.notionalUsdc.toFixed(2)} (1×)
              </span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
