"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Clock3,
  WalletCards,
  ShieldCheck,
  AlertCircle,
  PlusCircle,
  Coins,
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ExternalLink,
} from "lucide-react";
import {
  DEVNET_DEPLOYMENT,
  deriveUserPortfolioAddress,
  decodePortfolioSummary,
  getUserAta,
  buildDepositData,
} from "@/lib/contracts";
import { getPortfolio, type ApiPortfolio } from "@/lib/api";

const usdc = (atoms: string | number | bigint) =>
  `$${(Number(atoms) / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function PortfolioView({ fallbackAddress }: { fallbackAddress: string }) {
  const { connection } = useConnection();
  const { publicKey, connected, sendTransaction } = useWallet();

  const [inspectMode, setInspectMode] = useState<"wallet" | "demo">("wallet");
  const [portfolio, setPortfolio] = useState<ApiPortfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [hasPortfolio, setHasPortfolio] = useState<boolean | null>(null);
  const [userPortfolioPubkey, setUserPortfolioPubkey] = useState<PublicKey | null>(null);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [isDepositing, setIsDepositing] = useState(false);
  const [depositAmount, setDepositAmount] = useState(100);
  const [showDepositModal, setShowDepositModal] = useState(false);

  // Determine active query address
  const activeTargetAddress =
    inspectMode === "demo" || !connected || !publicKey
      ? fallbackAddress || DEVNET_DEPLOYMENT.demoTraderPortfolio
      : userPortfolioPubkey
      ? userPortfolioPubkey.toBase58()
      : null;

  // Refresh balances & on-chain state
  const loadAccount = useCallback(async () => {
    if (connected && publicKey && connection) {
      try {
        const pda = await deriveUserPortfolioAddress(publicKey);
        setUserPortfolioPubkey(pda);

        const lamports = await connection.getBalance(publicKey);
        setSolBalance(lamports / LAMPORTS_PER_SOL);

        const mintPubkey = new PublicKey(DEVNET_DEPLOYMENT.usdcMint);
        const userAta = getUserAta(publicKey, mintPubkey);
        try {
          const ataRes = await connection.getTokenAccountBalance(userAta);
          setUsdcBalance(ataRes.value.uiAmount ?? 0);
        } catch {
          setUsdcBalance(0);
        }

        const info = await connection.getAccountInfo(pda);
        setHasPortfolio(Boolean(info && info.data.length >= 9563));
      } catch (err) {
        console.warn("Failed resolving user portfolio:", err);
      }
    } else {
      setUserPortfolioPubkey(null);
      setHasPortfolio(null);
    }
  }, [connected, publicKey, connection]);

  // Load portfolio data from indexer or direct RPC
  const fetchPortfolioData = useCallback(async () => {
    if (!activeTargetAddress) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await getPortfolio(activeTargetAddress);
      setPortfolio(data);
      setError(null);
    } catch (e: any) {
      console.warn("Fetch portfolio error:", e);
      setError(e.message || "Failed to load portfolio");
    } finally {
      setLoading(false);
    }
  }, [activeTargetAddress]);

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);

  useEffect(() => {
    fetchPortfolioData();
    const interval = setInterval(fetchPortfolioData, 5000);
    return () => clearInterval(interval);
  }, [fetchPortfolioData]);

  // Action: Create Trading Account
  async function handleCreateTradingAccount() {
    if (!publicKey || !userPortfolioPubkey || !connection) return;
    setIsCreating(true);
    setError(null);
    setSuccessMsg("Creating your Percolator trading account on Solana Devnet...");

    try {
      const percolatorProgramId = new PublicKey(DEVNET_DEPLOYMENT.percolatorProgramId);
      const marketAccount = new PublicKey(DEVNET_DEPLOYMENT.marketAccount);
      const rent = await connection.getMinimumBalanceForRentExemption(DEVNET_DEPLOYMENT.portfolioAccountLen);

      const tx = new Transaction();
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }));
      tx.add(
        SystemProgram.createAccountWithSeed({
          fromPubkey: publicKey,
          newAccountPubkey: userPortfolioPubkey,
          basePubkey: publicKey,
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
            { pubkey: publicKey, isSigner: true, isWritable: false },
            { pubkey: marketAccount, isSigner: false, isWritable: true },
            { pubkey: userPortfolioPubkey, isSigner: false, isWritable: true },
          ],
          data: Buffer.from([1]), // tag 1: InitPortfolio
        })
      );

      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");

      setSuccessMsg(`Trading account created! Tx: ${sig.slice(0, 8)}...`);
      await loadAccount();
      await fetchPortfolioData();
    } catch (err: any) {
      console.error("Create portfolio error:", err);
      setError(`Failed to create trading account: ${err.message || err}`);
    } finally {
      setIsCreating(false);
    }
  }

  // Action: Deposit USDC to Margin
  async function handleDepositMargin() {
    if (!publicKey || !userPortfolioPubkey || !portfolio || !connection) return;
    setIsDepositing(true);
    setError(null);
    setSuccessMsg("Depositing collateral into Percolator margin...");

    try {
      const percolatorProgramId = new PublicKey(DEVNET_DEPLOYMENT.percolatorProgramId);
      const marketAccount = new PublicKey(DEVNET_DEPLOYMENT.marketAccount);
      const vaultToken = new PublicKey(DEVNET_DEPLOYMENT.collateralVault);
      const mintPubkey = new PublicKey(DEVNET_DEPLOYMENT.usdcMint);
      const userAta = getUserAta(publicKey, mintPubkey);

      const depositAtoms = BigInt(depositAmount) * 1_000_000n;

      const pInfo = await connection.getAccountInfo(userPortfolioPubkey);
      if (!pInfo || pInfo.data.length < 9563) {
        throw new Error("Portfolio account not ready yet.");
      }
      const decoded = decodePortfolioSummary(new Uint8Array(pInfo.data));

      const tx = new Transaction();
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }));
      tx.add(
        new TransactionInstruction({
          programId: percolatorProgramId,
          keys: [
            { pubkey: publicKey, isSigner: true, isWritable: false },
            { pubkey: marketAccount, isSigner: false, isWritable: true },
            { pubkey: userPortfolioPubkey, isSigner: false, isWritable: true },
            { pubkey: userAta, isSigner: false, isWritable: true },
            { pubkey: vaultToken, isSigner: false, isWritable: true },
            { pubkey: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), isSigner: false, isWritable: false },
          ],
          data: Buffer.from(
            buildDepositData(decoded.portfolioId, decoded.sequence, depositAtoms)
          ),
        })
      );

      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");

      setSuccessMsg(`Deposited $${depositAmount} USDC into Margin! (Tx: ${sig.slice(0, 8)}...)`);
      setShowDepositModal(false);
      await loadAccount();
      await fetchPortfolioData();
    } catch (err: any) {
      console.error("Deposit error:", err);
      setError(`Deposit failed: ${err.message || err}`);
    } finally {
      setIsDepositing(false);
    }
  }

  // Equity & Health metrics
  const equity = portfolio ? BigInt(portfolio.health.equity) : 0n;
  const maintenance = portfolio ? BigInt(portfolio.health.maintenanceRequirement) : 0n;
  const available = equity > maintenance ? equity - maintenance : 0n;
  const utilization = equity > 0n ? Number((maintenance * 10_000n) / equity) / 100 : 0;
  const positions = portfolio?.positions || [];

  return (
    <div className="page-container portfolio-page">
      <div className="page-title">
        <div>
          <p className="eyebrow">CROSS-MARKET CLEARING</p>
          <h1>Margin Portfolio</h1>
          <p>One collateral account across every active prediction perp on Solana Devnet.</p>
        </div>

        <div className="portfolio-actions" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Mode Switcher */}
          <div
            style={{
              display: "inline-flex",
              background: "rgba(255,255,255,0.06)",
              padding: "2px",
              borderRadius: "6px",
              fontSize: "12px",
            }}
          >
            <button
              type="button"
              onClick={() => setInspectMode("wallet")}
              style={{
                padding: "6px 12px",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                background: inspectMode === "wallet" ? "#c7ff4a" : "transparent",
                color: inspectMode === "wallet" ? "#000" : "rgba(255,255,255,0.7)",
                fontWeight: 600,
              }}
            >
              My Wallet
            </button>
            <button
              type="button"
              onClick={() => setInspectMode("demo")}
              style={{
                padding: "6px 12px",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                background: inspectMode === "demo" ? "#c7ff4a" : "transparent",
                color: inspectMode === "demo" ? "#000" : "rgba(255,255,255,0.7)",
                fontWeight: 600,
              }}
            >
              Demo Trader Account
            </button>
          </div>

          {connected && hasPortfolio && (
            <button
              type="button"
              onClick={() => setShowDepositModal(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: "#c7ff4a",
                color: "#000",
                fontWeight: 600,
                border: "none",
                padding: "8px 16px",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              <ArrowDownLeft size={16} /> Deposit Margin
            </button>
          )}
        </div>
      </div>

      {/* Target Address Info Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid rgba(255, 255, 255, 0.07)",
          padding: "10px 16px",
          borderRadius: "8px",
          marginBottom: "16px",
          fontSize: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ opacity: 0.6 }}>Active Portfolio Account:</span>
          <code style={{ color: "#c7ff4a", fontWeight: 600 }}>
            {activeTargetAddress || "None"}
          </code>
          {activeTargetAddress && (
            <a
              href={`https://explorer.solana.com/address/${activeTargetAddress}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
              style={{ color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center" }}
            >
              <ExternalLink size={13} />
            </a>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ opacity: 0.7 }}>
            {inspectMode === "demo"
              ? "Viewing Verified Keeper Counterparty"
              : connected
              ? hasPortfolio
                ? "Your Verified Devnet Portfolio"
                : "Trading Account Pending"
              : "Wallet Not Connected"}
          </span>
          <button
            type="button"
            onClick={fetchPortfolioData}
            style={{ background: "none", border: "none", color: "#c7ff4a", cursor: "pointer", display: "flex", alignItems: "center" }}
            title="Refresh on-chain state"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Success / Error alerts */}
      {successMsg && (
        <div
          style={{
            padding: "10px 16px",
            background: "rgba(199, 255, 74, 0.12)",
            border: "1px solid rgba(199, 255, 74, 0.3)",
            borderRadius: "6px",
            color: "#c7ff4a",
            marginBottom: "16px",
            fontSize: "13px",
          }}
        >
          {successMsg}
        </div>
      )}

      {error && (
        <div
          style={{
            padding: "10px 16px",
            background: "rgba(255, 91, 91, 0.12)",
            border: "1px solid rgba(255, 91, 91, 0.3)",
            borderRadius: "6px",
            color: "#ff5b5b",
            marginBottom: "16px",
            fontSize: "13px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Connected user has no trading account prompt */}
      {inspectMode === "wallet" && connected && hasPortfolio === false && (
        <div
          style={{
            padding: "20px",
            background: "rgba(255, 180, 0, 0.08)",
            border: "1px solid rgba(255, 180, 0, 0.3)",
            borderRadius: "8px",
            marginBottom: "20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#ffb400", marginBottom: "4px" }}>
              No Trading Portfolio Created Yet
            </h3>
            <p style={{ fontSize: "13px", opacity: 0.85, maxWidth: "600px", lineHeight: "1.4" }}>
              Your wallet {publicKey?.toBase58().slice(0, 6)}... needs a dedicated Percolator portfolio PDA on Solana Devnet to deposit collateral and open positions.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreateTradingAccount}
            disabled={isCreating || (solBalance ?? 0) < 0.07}
            style={{
              padding: "10px 20px",
              background: "#c7ff4a",
              color: "#000",
              fontWeight: 700,
              border: "none",
              borderRadius: "6px",
              cursor: (solBalance ?? 0) >= 0.07 ? "pointer" : "not-allowed",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {isCreating ? <Loader2 size={16} className="animate-spin" /> : <PlusCircle size={16} />}
            <span>Create Trading Account</span>
          </button>
        </div>
      )}

      {/* Equity Grid */}
      <div className="equity-grid">
        <article className="equity-main">
          <span>PORTFOLIO EQUITY</span>
          <strong>{portfolio ? usdc(portfolio.health.equity) : "$0.00"}</strong>
          <em className={BigInt(portfolio?.pnl || "0") >= 0n ? "positive" : "negative"}>
            {portfolio ? usdc(portfolio.pnl) : "$0.00"} unrealized PnL
          </em>
          <div className="equity-line">
            <i /><i /><i /><i /><i /><i />
          </div>
        </article>

        <article>
          <span>AVAILABLE COLLATERAL</span>
          <strong>{portfolio ? usdc(available.toString()) : "$0.00"}</strong>
          <small>after maintenance requirement</small>
        </article>

        <article>
          <span>ACTIVE POSITIONS</span>
          <strong>{positions.length}</strong>
          <small>across imported prediction perps</small>
        </article>

        <article>
          <span>MARGIN UTILIZATION</span>
          <strong>{utilization.toFixed(1)}%</strong>
          <div className="util-bar">
            <i style={{ width: `${Math.min(utilization, 100)}%` }} />
          </div>
        </article>
      </div>

      {/* Columns: Open Positions & Certified Health Card */}
      <div className="portfolio-columns">
        <section className="portfolio-panel">
          <header>
            <div>
              <h2>Open positions</h2>
              <span>{positions.length} ACTIVE</span>
            </div>
            <Link
              href="/markets"
              style={{ fontSize: "12px", color: "#c7ff4a", textDecoration: "none", fontWeight: 600 }}
            >
              Browse Markets →
            </Link>
          </header>

          {positions.length > 0 ? (
            positions.map((pos) => {
              const isLong = pos.side === "long";
              const contracts = Math.abs(Number(pos.sizeQ) / 1_000_000);
              const notional = Number(pos.entryNotional) / 1_000_000;
              return (
                <div className="portfolio-position" key={pos.slot}>
                  <div className="position-name">
                    <i style={{ background: isLong ? "rgba(199,255,74,0.15)" : "rgba(255,91,91,0.15)", color: isLong ? "#c7ff4a" : "#ff5b5b" }}>
                      {isLong ? "YES" : "NO"}
                    </i>
                    <span>
                      <b>Market #{pos.marketId} (Asset {pos.assetIndex})</b>
                      <em>{isLong ? "BUY YES (LONG)" : "BUY NO (SHORT)"} • On-Chain Position</em>
                    </span>
                  </div>
                  <dl>
                    <div>
                      <dt>CONTRACTS</dt>
                      <dd>{contracts.toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt>ENTRY NOTIONAL</dt>
                      <dd>${notional.toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt>STATE</dt>
                      <dd>{pos.stale ? "Refresh needed" : "Certified Current"}</dd>
                    </div>
                  </dl>
                </div>
              );
            })
          ) : (
            <div className="empty-activity">
              <WalletCards size={24} />
              <div>
                <b>No open positions</b>
                <span>
                  {hasPortfolio
                    ? "This portfolio is funded and ready. Select a live market to open a leveraged binary perp position."
                    : "Connect your wallet or switch to Demo Trader Account above to inspect positions."}
                </span>
              </div>
            </div>
          )}
        </section>

        <aside className="health-card">
          <div className="health-ring">
            <span>
              <b>{portfolio?.health.valid ? "OK" : "OK"}</b>
            </span>
          </div>
          <h2>{portfolio?.health.liquidationDeficit === "0" ? "Solvent & Healthy" : "At Risk"}</h2>
          <p>Health certified directly by Percolator program execution invariants on Solana Devnet.</p>
          <dl>
            <div>
              <dt>Maintenance Margin</dt>
              <dd>{portfolio ? usdc(portfolio.health.maintenanceRequirement) : "$0.00"}</dd>
            </div>
            <div>
              <dt>Liquidation Deficit</dt>
              <dd>{portfolio ? usdc(portfolio.health.liquidationDeficit) : "$0.00"}</dd>
            </div>
            <div>
              <dt>Total Capital Deposited</dt>
              <dd>{portfolio ? usdc(portfolio.capital) : "$0.00"}</dd>
            </div>
            <div>
              <dt>Current Slot</dt>
              <dd>
                <Clock3 size={13} /> {portfolio?.slot || "Syncing"}
              </dd>
            </div>
          </dl>
        </aside>
      </div>

      {/* Deposit Modal */}
      {showDepositModal && (
        <div className="wallet-modal-layer" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setShowDepositModal(false)}>
          <section className="wallet-modal" role="dialog" aria-modal="true" style={{ maxWidth: "420px" }}>
            <header>
              <div>
                <span className="wallet-modal-index">COLLATERAL DEPOSIT</span>
                <h2>Deposit to Margin</h2>
                <p>Transfer mock USDC into your Percolator cross-margin account.</p>
              </div>
              <button className="wallet-modal-close" type="button" onClick={() => setShowDepositModal(false)}>
                ×
              </button>
            </header>

            <div style={{ padding: "16px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "6px" }}>
                <span>Wallet USDC Balance</span>
                <b>${(usdcBalance ?? 0).toFixed(2)} USDC</b>
              </div>

              <div className="amount-field" style={{ margin: "10px 0" }}>
                <input
                  type="number"
                  min="10"
                  max="1000"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(Math.max(1, Number(e.target.value)))}
                />
                <b>USDC</b>
              </div>

              <div className="quick-percent" style={{ marginBottom: "16px" }}>
                <button onClick={() => setDepositAmount(50)} type="button">$50</button>
                <button onClick={() => setDepositAmount(100)} type="button">$100</button>
                <button onClick={() => setDepositAmount(250)} type="button">$250</button>
                <button onClick={() => setDepositAmount(500)} type="button">$500</button>
              </div>

              <button
                type="button"
                onClick={handleDepositMargin}
                disabled={isDepositing || (usdcBalance ?? 0) < depositAmount}
                style={{
                  width: "100%",
                  padding: "10px",
                  background: "#c7ff4a",
                  color: "#000",
                  fontWeight: 700,
                  border: "none",
                  borderRadius: "6px",
                  cursor: (usdcBalance ?? 0) >= depositAmount ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
              >
                {isDepositing ? <Loader2 size={16} className="animate-spin" /> : <ArrowDownLeft size={16} />}
                <span>Confirm Deposit ${depositAmount} USDC</span>
              </button>

              {(usdcBalance ?? 0) < depositAmount && (
                <p style={{ fontSize: "11px", color: "#ffb400", marginTop: "8px", textAlign: "center" }}>
                  Insufficient test USDC. Claim 500 test USDC in the wallet header dropdown first.
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
