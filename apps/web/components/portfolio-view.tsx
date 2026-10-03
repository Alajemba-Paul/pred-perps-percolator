"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import {
  type Market,
  formatPrice,
  formatProbability,
} from "@/lib/markets";
import {
  DEVNET_DEPLOYMENT,
  deriveUserPortfolioAddress,
  getUserAta,
  decodePortfolioSummary,
  buildDepositData,
  buildCreatePortfolioData,
} from "@/lib/contracts";
import { useUnifiedWallet } from "./wallet-providers";
import {
  Wallet,
  PlusCircle,
  ArrowDownLeft,
  Loader2,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Coins,
} from "lucide-react";

if (typeof window !== "undefined" && !(window as any).Buffer) {
  (window as any).Buffer = Buffer;
}

function shortAddress(address: string) {
  return `${address.slice(0, 4)}�${address.slice(-4)}`;
}

export function PortfolioView({ markets }: { markets: Market[] }) {
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [hasPortfolio, setHasPortfolio] = useState<boolean | null>(null);
  const [portfolioData, setPortfolioData] = useState<any | null>(null);
  const [userPortfolioAddress, setUserPortfolioAddress] = useState<string | null>(null);

  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isFaucetLoading, setIsFaucetLoading] = useState(false);
  const [isFaucetDisabled, setIsFaucetDisabled] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedPortfolio, setCopiedPortfolio] = useState(false);
  const [faucetNotice, setFaucetNotice] = useState<string | null>(null);

  const wallet = useUnifiedWallet();
  const { connection } = useConnection();

  const activeAddress = wallet.activeAddress;
  const activePubkey = wallet.activePubkey;

  useEffect(() => {
    fetch("/api/faucet/usdc")
      .then((r) => r.json())
      .then((d) => {
        if (d && d.configured === false) setIsFaucetDisabled(true);
      })
      .catch(() => {});
  }, []);

  // Fetch balances and onchain portfolio state
  const refreshPortfolio = useCallback(async () => {
    if (!activePubkey) {
      setSolBalance(null);
      setUsdcBalance(null);
      setHasPortfolio(null);
      setPortfolioData(null);
      setUserPortfolioAddress(null);
      return;
    }

    try {
      const res = await fetch(`/api/account-state?address=${activePubkey.toBase58()}`, { cache: "no-store" });
      if (res.ok) {
        const state = await res.json();
        setSolBalance(state.sol !== null && state.sol !== undefined ? state.sol : null);
        setUsdcBalance(state.usdc !== null && state.usdc !== undefined ? state.usdc : null);
        setHasPortfolio(Boolean(state.hasPortfolio));
        setUserPortfolioAddress(state.portfolioPubkey || null);
        setPortfolioData(state.portfolioData || null);
        return;
      }
    } catch {
      // Fall through to direct RPC
    }

    try {
      const lamports = await connection.getBalance(activePubkey);
      setSolBalance(lamports / LAMPORTS_PER_SOL);

      if (DEVNET_DEPLOYMENT.usdcMint) {
        try {
          const mintPubkey = new PublicKey(DEVNET_DEPLOYMENT.usdcMint);
          const userAta = getUserAta(activePubkey, mintPubkey);
          const tokenRes = await connection.getTokenAccountBalance(userAta);
          setUsdcBalance(tokenRes.value.uiAmount ?? 0);
        } catch {
          setUsdcBalance(0);
        }
      }

      const pPubkey = await deriveUserPortfolioAddress(activePubkey);
      setUserPortfolioAddress(pPubkey.toBase58());

      const accInfo = await connection.getAccountInfo(pPubkey);
      if (accInfo && accInfo.data.length >= DEVNET_DEPLOYMENT.portfolioAccountLen) {
        setHasPortfolio(true);
        const decoded = decodePortfolioSummary(accInfo.data);
        setPortfolioData(decoded);
      } else {
        setHasPortfolio(false);
        setPortfolioData(null);
      }
    } catch (e) {
      console.warn("Portfolio fetch error:", e);
    }
  }, [activePubkey, connection]);

  useEffect(() => {
    refreshPortfolio();
    const interval = setInterval(refreshPortfolio, 6000);
    return () => clearInterval(interval);
  }, [refreshPortfolio]);

  function copyAddress() {
    if (activeAddress) {
      navigator.clipboard.writeText(activeAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function copyPortfolioAddress() {
    if (userPortfolioAddress) {
      navigator.clipboard.writeText(userPortfolioAddress);
      setCopiedPortfolio(true);
      setTimeout(() => setCopiedPortfolio(false), 2000);
    }
  }

  function handleGetDevnetSol() {
    if (!activeAddress) return;
    copyAddress();
    setFaucetNotice("Address copied. Opening Solana faucet in new tab...");
    window.open("https://faucet.solana.com", "_blank", "noopener,noreferrer");
    setTimeout(() => setFaucetNotice(null), 4000);
  }

  // Action: Get test USDC
  async function handleGetTestUsdc() {
    if (!activeAddress) {
      setActionError("Reconnect wallet");
      return;
    }

    setIsFaucetLoading(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch("/api/faucet/usdc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: activeAddress }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionSuccess(
          data.signature
            ? `Minted 500 Test USDC! Tx: ${data.signature.slice(0, 8)}...`
            : "Received 500 Test USDC!"
        );
        await refreshPortfolio();
      } else {
        if (res.status === 503 || data?.unconfigured) {
          setIsFaucetDisabled(true);
        }
        setActionError(data?.error || "Could not claim test USDC.");
      }
    } catch (err: any) {
      setActionError(err?.message || "Could not claim test USDC.");
    } finally {
      setIsFaucetLoading(false);
    }
  }

  // Action: Create trading account
  async function handleCreatePortfolio() {
    if (!wallet.connected || !activePubkey) {
      setActionError("Reconnect wallet");
      return;
    }

    if (!DEVNET_DEPLOYMENT.marketAccount || !DEVNET_DEPLOYMENT.percolatorProgramId) {
      setActionError("Trading network configuration is missing.");
      return;
    }

    if ((solBalance ?? 0) <= 0) {
      setActionError("You need devnet SOL to pay transaction fees. Click 'Get devnet SOL' above.");
      return;
    }

    setIsActionLoading(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const percolatorProgramId = new PublicKey(DEVNET_DEPLOYMENT.percolatorProgramId);
      const marketAccount = new PublicKey(DEVNET_DEPLOYMENT.marketAccount);
      const portfolioPubkey = await deriveUserPortfolioAddress(activePubkey);

      const rent = await connection
        .getMinimumBalanceForRentExemption(DEVNET_DEPLOYMENT.portfolioAccountLen || 9563)
        .catch(() => 80000000);

      const tx = new Transaction();

      tx.add(
        SystemProgram.createAccountWithSeed({
          fromPubkey: activePubkey,
          newAccountPubkey: portfolioPubkey,
          basePubkey: activePubkey,
          seed: DEVNET_DEPLOYMENT.portfolioSeed || "moxie",
          lamports: rent,
          space: DEVNET_DEPLOYMENT.portfolioAccountLen || 9563,
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
          data: Buffer.from(buildCreatePortfolioData()),
        })
      );

      const sig = await wallet.signAndSendTransaction(tx, connection);
      const pAddress = portfolioPubkey.toBase58();
      setUserPortfolioAddress(pAddress);

      // Upsert portfolio to Neon cache
      fetch("/api/portfolios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletPubkey: activePubkey.toBase58(),
          portfolioAddress: pAddress,
          marketAddress: DEVNET_DEPLOYMENT.marketAccount || "global",
        }),
      }).catch((e) => console.warn("Portfolio Neon cache upsert skipped:", e));
      if (typeof window !== "undefined") {
        localStorage.setItem(`moxie_portfolio_${activePubkey.toBase58()}`, pAddress);
      }
      setActionSuccess(`Trading account created! Address: ${shortAddress(pAddress)}`);
      setHasPortfolio(true);
      await refreshPortfolio();
    } catch (err: any) {
      console.error("Trading account creation error:", err);
      const msg = err?.message || String(err);
      setActionError(msg.includes("Reconnect") ? "Reconnect wallet" : msg);
    } finally {
      setIsActionLoading(false);
    }
  }

  // Action: Deposit $100 Margin
  async function handleDepositMargin() {
    if (!wallet.connected || !activePubkey) {
      setActionError("Reconnect wallet");
      return;
    }
    setIsActionLoading(true);
    setActionError(null);
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

      const sig = await wallet.signAndSendTransaction(tx, connection);
      setActionSuccess(`Deposited $100 Margin! Tx: ${sig.slice(0, 8)}...`);
      await refreshPortfolio();
    } catch (err: any) {
      const msg = err?.message || String(err);
      setActionError(msg.includes("Reconnect") ? "Reconnect wallet" : msg);
    } finally {
      setIsActionLoading(false);
    }
  }

  if (!activeAddress) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px" }}>
        <Wallet size={32} style={{ color: "#c7ff4a", marginBottom: "12px" }} />
        <h2 style={{ fontSize: "18px", color: "#fff", margin: "0 0 8px" }}>Wallet Not Connected</h2>
        <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.6)", margin: "0 0 20px", maxWidth: "440px", marginInline: "auto" }}>
          Connect your Solana Devnet wallet in the top right to view your trading account, balances, and open positions.
        </p>
      </div>
    );
  }

  const capitalUsdc = portfolioData ? Number(portfolioData.capital) / 1e6 : 0;
  const pnlUsdc = portfolioData ? Number(portfolioData.pnl) / 1e6 : 0;
  const equityUsdc = portfolioData ? Number(portfolioData.equity) / 1e6 : 0;
  const positions = portfolioData?.positions || [];
  const hasZeroSol = (solBalance ?? 0) <= 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Account Info Header */}
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>CONNECTED WALLET</span>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: "3px",
                  background: hasPortfolio ? "rgba(199,255,74,0.15)" : "rgba(255,180,0,0.15)",
                  color: hasPortfolio ? "#c7ff4a" : "#ffb400",
                }}
              >
                {hasPortfolio ? "Trading Account Active" : "No Trading Account"}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <code style={{ fontSize: "14px", color: "#c7ff4a" }}>{shortAddress(activeAddress)}</code>
              <button
                type="button"
                onClick={copyAddress}
                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "2px", fontSize: "11px" }}
              >
                {copied ? <Check size={12} color="#c7ff4a" /> : <Copy size={12} />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>
            {userPortfolioAddress && hasPortfolio && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "8px" }}>
                <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>TRADING ACCOUNT:</span>
                <code style={{ fontSize: "12px", color: "rgba(255,255,255,0.8)" }}>{shortAddress(userPortfolioAddress)}</code>
                <button
                  type="button"
                  onClick={copyPortfolioAddress}
                  title="Copy Trading Account Address"
                  style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "2px", fontSize: "11px" }}
                >
                  {copiedPortfolio ? <Check size={11} color="#c7ff4a" /> : <Copy size={11} />}
                </button>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleGetDevnetSol}
              style={{
                background: "rgba(199,255,74,0.1)",
                border: "1px solid rgba(199,255,74,0.25)",
                color: "#c7ff4a",
                fontSize: "12px",
                fontWeight: 600,
                padding: "8px 14px",
                borderRadius: "4px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <span>Get devnet SOL</span>
            </button>

            {hasPortfolio && (
              <button
                type="button"
                onClick={handleGetTestUsdc}
                disabled={isFaucetLoading}
                style={{
                  background: "rgba(199,255,74,0.1)",
                  border: "1px solid rgba(199,255,74,0.25)",
                  color: "#c7ff4a",
                  fontSize: "12px",
                  fontWeight: 600,
                  padding: "8px 14px",
                  borderRadius: "4px",
                  cursor: (isFaucetLoading || isFaucetDisabled) ? "not-allowed" : "pointer",
                  opacity: isFaucetDisabled ? 0.5 : 1,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                {isFaucetLoading ? <Loader2 size={13} className="animate-spin" /> : <Coins size={13} />}
                <span>Get 500 test USDC</span>
              </button>
            )}
          </div>
        </div>

        {faucetNotice && (
          <div style={{ marginTop: "12px", background: "rgba(199,255,74,0.1)", border: "1px solid rgba(199,255,74,0.3)", borderRadius: "4px", padding: "8px 12px", fontSize: "12px", color: "#c7ff4a" }}>
            {faucetNotice}
          </div>
        )}
      </div>

      {/* Metrics Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px" }}>
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", padding: "16px 20px", borderRadius: "8px" }}>
          <small style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", display: "block", marginBottom: "4px" }}>DEVNET SOL</small>
          <strong style={{ fontSize: "20px", color: "#fff" }}>
            {solBalance !== null ? `${solBalance.toFixed(3)} SOL` : "0.000 SOL"}
          </strong>
          <span style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.5)", marginTop: "4px" }}>For Solana transaction fees</span>
        </div>

        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", padding: "16px 20px", borderRadius: "8px" }}>
          <small style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", display: "block", marginBottom: "4px" }}>TEST USDC</small>
          <strong style={{ fontSize: "20px", color: "#fff" }}>
            ${usdcBalance !== null ? usdcBalance.toFixed(2) : "0.00"}
          </strong>
          <span style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.5)", marginTop: "4px" }}>Available trading balance</span>
        </div>

        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", padding: "16px 20px", borderRadius: "8px" }}>
          <small style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", display: "block", marginBottom: "4px" }}>ACCOUNT EQUITY</small>
          <strong style={{ fontSize: "20px", color: "#c7ff4a" }}>${equityUsdc.toFixed(2)}</strong>
          <span style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.5)", marginTop: "4px" }}>Deposited � Profit</span>
        </div>

        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", padding: "16px 20px", borderRadius: "8px" }}>
          <small style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", display: "block", marginBottom: "4px" }}>REALIZED PNL</small>
          <strong style={{ fontSize: "20px", color: pnlUsdc >= 0 ? "#c7ff4a" : "#ff8474" }}>
            {pnlUsdc >= 0 ? "+" : ""}${pnlUsdc.toFixed(2)}
          </strong>
          <span style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.5)", marginTop: "4px" }}>Closed position profit</span>
        </div>
      </div>

      {/* Trading Account Initialization Card */}
      {!hasPortfolio && (
        <div style={{ background: "rgba(255,180,0,0.06)", border: "1px solid rgba(255,180,0,0.25)", borderRadius: "8px", padding: "20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
          <div style={{ maxWidth: "560px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#fff", margin: "0 0 6px" }}>
              Trading Account Needed
            </h3>
            <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.7)", margin: 0, lineHeight: 1.5 }}>
              Create a trading account on Solana to open positions and manage margin.
            </p>
            {hasZeroSol && (
              <p style={{ fontSize: "12px", color: "#ffb400", margin: "8px 0 0", fontWeight: 500 }}>
                You need devnet SOL for transaction fees. Click "Get devnet SOL" above.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleCreatePortfolio}
            disabled={isActionLoading || hasZeroSol}
            style={{
              padding: "12px 20px",
              background: hasZeroSol ? "rgba(255,255,255,0.1)" : "#c7ff4a",
              border: "none",
              color: hasZeroSol ? "rgba(255,255,255,0.4)" : "#000",
              fontWeight: 700,
              fontSize: "13px",
              borderRadius: "6px",
              cursor: hasZeroSol ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {isActionLoading ? <Loader2 size={14} className="animate-spin" /> : <PlusCircle size={14} />}
            <span>{isActionLoading ? "Creating Account..." : "Create trading account"}</span>
          </button>
        </div>
      )}

      {/* Feedback Banners */}
      {actionSuccess && (
        <div style={{ background: "rgba(199,255,74,0.1)", border: "1px solid rgba(199,255,74,0.3)", borderRadius: "6px", padding: "12px 16px", color: "#c7ff4a", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }}>
          <CheckCircle2 size={16} />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div style={{ background: "rgba(255,77,77,0.1)", border: "1px solid rgba(255,77,77,0.3)", borderRadius: "6px", padding: "12px 16px", color: "#ff8474", fontSize: "13px", display: "flex", alignItems: "flex-start", gap: "8px" }}>
          <AlertTriangle size={16} style={{ marginTop: "2px", flexShrink: 0 }} />
          <span>{actionError}</span>
        </div>
      )}

      {/* Positions Section */}
      <section style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", padding: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 600, color: "#fff", margin: 0 }}>
            Your positions ({positions.length})
          </h2>
          {hasPortfolio && (
            <button
              type="button"
              onClick={handleDepositMargin}
              disabled={isActionLoading || (usdcBalance ?? 0) < 100}
              style={{
                background: "rgba(199,255,74,0.1)",
                border: "1px solid rgba(199,255,74,0.3)",
                color: "#c7ff4a",
                padding: "6px 12px",
                borderRadius: "4px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: (usdcBalance ?? 0) < 100 ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <ArrowDownLeft size={12} />
              <span>Deposit $100 USDC</span>
            </button>
          )}
        </div>

        {positions.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", textAlign: "left", color: "rgba(255,255,255,0.5)" }}>
                  <th style={{ padding: "10px 12px" }}>Event</th>
                  <th style={{ padding: "10px 12px" }}>Side</th>
                  <th style={{ padding: "10px 12px" }}>Contracts</th>
                  <th style={{ padding: "10px 12px" }}>Position Value</th>
                  <th style={{ padding: "10px 12px" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((pos: any, idx: number) => {
                  const sizeContracts = Math.abs(Number(pos.sizeQ) / 1e6);
                  const notional = Number(pos.entryNotional) / 1e6;
                  const matchingMarket = markets.find(
                    (m) => m.assetIndex === pos.assetIndex || m.marketId === pos.marketId
                  );
                  const marketTitle = matchingMarket?.title || `Event #${pos.marketId}`;

                  return (
                    <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "12px", color: "#fff", fontWeight: 600 }}>{marketTitle}</td>
                      <td style={{ padding: "12px" }}>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: "3px",
                            background: pos.side === "long" ? "rgba(199,255,74,0.15)" : "rgba(255,132,116,0.15)",
                            color: pos.side === "long" ? "#c7ff4a" : "#ff8474",
                          }}
                        >
                          {pos.side === "long" ? "YES" : "NO"}
                        </span>
                      </td>
                      <td style={{ padding: "12px", color: "#fff" }}>{sizeContracts.toFixed(1)}</td>
                      <td style={{ padding: "12px", color: "#fff" }}>${notional.toFixed(2)}</td>
                      <td style={{ padding: "12px" }}>
                        {matchingMarket && (
                          <Link
                            href={`/trade/${matchingMarket.slug || matchingMarket.address}`}
                            style={{ color: "#c7ff4a", textDecoration: "underline", fontSize: "12px" }}
                          >
                            Trade
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "36px 16px", color: "rgba(255,255,255,0.5)" }}>
            <p style={{ margin: "0 0 16px", fontSize: "13px" }}>
              You have no open positions.
            </p>
            <Link
              href="/markets"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 16px",
                background: "#c7ff4a",
                color: "#000",
                fontWeight: 600,
                fontSize: "13px",
                borderRadius: "4px",
                textDecoration: "none",
              }}
            >
              <span>View Markets</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
