"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
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
  KNOWN_MARKET_TITLES,
} from "@/lib/markets";
import {
  DEVNET_DEPLOYMENT,
  deriveUserPortfolioAddress,
  getUserAta,
  decodePortfolioSummary,
  buildDepositData,
} from "@/lib/contracts";
import { usePrivyWalletState } from "./wallet-providers";
import {
  Wallet,
  ShieldCheck,
  PlusCircle,
  ArrowDownLeft,
  Loader2,
  ExternalLink,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

function shortAddress(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function PortfolioView({ markets }: { markets: Market[] }) {
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [hasPortfolio, setHasPortfolio] = useState<boolean | null>(null);
  const [portfolioData, setPortfolioData] = useState<any | null>(null);
  const [userPortfolioAddress, setUserPortfolioAddress] = useState<string | null>(null);

  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const privy = usePrivyWalletState();
  const external = useWallet();
  const { connection } = useConnection();

  const activeAddress = privy.address || external.publicKey?.toBase58() || null;
  const activePubkey = useMemo(() => (activeAddress ? new PublicKey(activeAddress) : null), [activeAddress]);

  // Unified signer supporting Privy and standard wallet adapters
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

  // Fetch live portfolio data from connected wallet
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
      // 1. Fetch account state from fast server route
      const res = await fetch(`/api/account-state?address=${activePubkey.toBase58()}`, { cache: "no-store" });
      if (res.ok) {
        const state = await res.json();
        setSolBalance(state.sol);
        setUsdcBalance(state.usdc);
        setHasPortfolio(Boolean(state.hasPortfolio));
        setUserPortfolioAddress(state.portfolioPubkey);
        setPortfolioData(state.portfolioData);
        return;
      }
    } catch {
      // Fall back to direct RPC
    }

    try {
      // 2. Direct RPC fallback
      const lamports = await connection.getBalance(activePubkey);
      setSolBalance(lamports / LAMPORTS_PER_SOL);

      if (DEVNET_DEPLOYMENT.usdcMint) {
        const mintPubkey = new PublicKey(DEVNET_DEPLOYMENT.usdcMint);
        const userAta = getUserAta(activePubkey, mintPubkey);
        try {
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

  // Action: Create Trading Account
  async function handleCreatePortfolio() {
    if (!activePubkey) return;
    setIsActionLoading(true);
    setActionError(null);
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
          data: Buffer.from([1]),
        })
      );

      const sig = await signAndSendTransaction(tx);
      setActionSuccess(`Trading account created! Tx: ${sig.slice(0, 8)}...`);
      await refreshPortfolio();
    } catch (err: any) {
      setActionError(err?.message || "Failed to create portfolio account.");
    } finally {
      setIsActionLoading(false);
    }
  }

  // Action: Deposit Margin ($100 USDC)
  async function handleDepositMargin() {
    if (!activePubkey) return;
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

      const sig = await signAndSendTransaction(tx);
      setActionSuccess(`Deposited $100 Margin! Tx: ${sig.slice(0, 8)}...`);
      await refreshPortfolio();
    } catch (err: any) {
      setActionError(err?.message || "Failed to deposit margin.");
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
          Connect your Solana Devnet wallet in the top right to view your personal on-chain Percolator portfolio, margin equity, and open positions.
        </p>
      </div>
    );
  }

  const capitalUsdc = portfolioData ? Number(portfolioData.capital) / 1e6 : 0;
  const pnlUsdc = portfolioData ? Number(portfolioData.pnl) / 1e6 : 0;
  const equityUsdc = portfolioData ? Number(portfolioData.equity) / 1e6 : 0;
  const initialReqUsdc = portfolioData ? Number(portfolioData.initialRequirement) / 1e6 : 0;
  const positions = portfolioData?.positions || [];

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
                {hasPortfolio ? "Portfolio Active" : "No Portfolio"}
              </span>
            </div>
            <code style={{ fontSize: "14px", color: "#c7ff4a" }}>{activeAddress}</code>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.8)" }}>
              Wallet: <b>{solBalance !== null ? `${solBalance.toFixed(2)} SOL` : "…"}</b> • <b>${usdcBalance !== null ? usdcBalance.toFixed(2) : "0.00"} USDC</b>
            </span>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", padding: "16px 20px", borderRadius: "8px" }}>
          <small style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", display: "block", marginBottom: "4px" }}>COLLATERAL (DEPOSITED)</small>
          <strong style={{ fontSize: "22px", color: "#fff" }}>${capitalUsdc.toFixed(2)}</strong>
          <span style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.5)", marginTop: "4px" }}>USDC deposited in vault</span>
        </div>

        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", padding: "16px 20px", borderRadius: "8px" }}>
          <small style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", display: "block", marginBottom: "4px" }}>ACCOUNT EQUITY</small>
          <strong style={{ fontSize: "22px", color: "#c7ff4a" }}>${equityUsdc.toFixed(2)}</strong>
          <span style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.5)", marginTop: "4px" }}>Collateral ± Unrealized PnL</span>
        </div>

        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", padding: "16px 20px", borderRadius: "8px" }}>
          <small style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", display: "block", marginBottom: "4px" }}>REALIZED PNL</small>
          <strong style={{ fontSize: "22px", color: pnlUsdc >= 0 ? "#c7ff4a" : "#ff8474" }}>
            {pnlUsdc >= 0 ? "+" : ""}${pnlUsdc.toFixed(2)}
          </strong>
          <span style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.5)", marginTop: "4px" }}>Settled position profits</span>
        </div>

        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", padding: "16px 20px", borderRadius: "8px" }}>
          <small style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", display: "block", marginBottom: "4px" }}>MARGIN HEALTH</small>
          <strong style={{ fontSize: "22px", color: "#c7ff4a", display: "flex", alignItems: "center", gap: "6px" }}>
            <ShieldCheck size={20} /> 100% Solvency
          </strong>
          <span style={{ display: "block", fontSize: "11px", color: "rgba(255,255,255,0.5)", marginTop: "4px" }}>1× isolated margin backing</span>
        </div>
      </div>

      {/* Action Banners */}
      {!hasPortfolio && (
        <div style={{ background: "rgba(255,180,0,0.06)", border: "1px solid rgba(255,180,0,0.25)", borderRadius: "8px", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#fff", margin: "0 0 4px" }}>
              Portfolio Account Not Initialized
            </h3>
            <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)", margin: 0 }}>
              Initialize your trading PDA on Percolator to open positions and deposit margin. Requires ~0.08 SOL rent.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreatePortfolio}
            disabled={isActionLoading}
            style={{
              padding: "10px 18px",
              background: "#c7ff4a",
              border: "none",
              color: "#000",
              fontWeight: 700,
              fontSize: "13px",
              borderRadius: "4px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {isActionLoading ? <Loader2 size={13} className="animate-spin" /> : <PlusCircle size={13} />}
            <span>InitPortfolio</span>
          </button>
        </div>
      )}

      {actionSuccess && (
        <div style={{ background: "rgba(199,255,74,0.1)", border: "1px solid rgba(199,255,74,0.3)", borderRadius: "6px", padding: "12px 16px", color: "#c7ff4a", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }}>
          <CheckCircle2 size={16} />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div style={{ background: "rgba(255,77,77,0.1)", border: "1px solid rgba(255,77,77,0.3)", borderRadius: "6px", padding: "12px 16px", color: "#ff8474", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }}>
          <AlertTriangle size={16} />
          <span>{actionError}</span>
        </div>
      )}

      {/* Positions Table */}
      <section style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", padding: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 600, color: "#fff", margin: 0 }}>
            Open Perpetual Positions ({positions.length})
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
              <span>Deposit $100 Margin</span>
            </button>
          )}
        </div>

        {positions.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", textAlign: "left", color: "rgba(255,255,255,0.5)" }}>
                  <th style={{ padding: "10px 12px" }}>Market</th>
                  <th style={{ padding: "10px 12px" }}>Side</th>
                  <th style={{ padding: "10px 12px" }}>Contracts</th>
                  <th style={{ padding: "10px 12px" }}>Entry Notional</th>
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
                  const marketTitle = matchingMarket?.title || `Market #${pos.marketId}`;

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
                          {pos.side.toUpperCase()}
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
          <div style={{ textAlign: "center", padding: "40px 16px", color: "rgba(255,255,255,0.4)" }}>
            <p style={{ margin: "0 0 16px", fontSize: "13px" }}>
              No open positions found for your connected Devnet wallet.
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
              <span>Explore Live Markets</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
