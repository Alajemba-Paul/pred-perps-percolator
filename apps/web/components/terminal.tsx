"use client";

import Link from "next/link";
import { useMemo, useState, useEffect, useCallback } from "react";
import {
  ChevronDown,
  Clock3,
  ExternalLink,
  Info,
  Settings2,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Coins,
  Loader2,
  PlusCircle,
  ArrowDownLeft,
  RefreshCw,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  Transaction,
  TransactionInstruction,
  PublicKey,
  ComputeBudgetProgram,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import type { Market } from "@/lib/markets";
import { getStatusLabel, cents } from "@/lib/markets";
import {
  DEVNET_DEPLOYMENT,
  buildTradeCpiData,
  deriveUserPortfolioAddress,
  decodePortfolioSummary,
  getUserAta,
  buildDepositData,
} from "@/lib/contracts";
import { getPortfolio, type ApiPortfolio, type ApiPosition } from "@/lib/api";

const chartPaths = {
  market: "M0 215 C35 200 48 226 78 190 S130 178 160 191 S210 180 236 150 S278 171 302 126 S350 140 378 104 S422 118 450 72 S500 80 540 43 S600 65 650 24",
  index: "M0 225 C60 212 92 203 130 205 S208 174 252 166 S338 134 390 126 S470 92 520 78 S590 55 650 49",
};

export function Terminal({ market, markets }: { market: Market; markets: Market[] }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();

  // Side YES = Long, Side NO = Short
  const [side, setSide] = useState<"long" | "short">("long");
  const [collateral, setCollateral] = useState(50);
  const leverage = 1; // Exactly 1x as proven by Percolator solvency envelope (10000 bps IM/MM)
  const [statusText, setStatusText] = useState<string>("");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [faucetStatus, setFaucetStatus] = useState<string | null>(null);

  // User on-chain portfolio state
  const [userPortfolioPubkey, setUserPortfolioPubkey] = useState<PublicKey | null>(null);
  const [hasPortfolio, setHasPortfolio] = useState<boolean | null>(null);
  const [portfolioData, setPortfolioData] = useState<any | null>(null);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [isCreatingPortfolio, setIsCreatingPortfolio] = useState(false);
  const [isDepositing, setIsDepositing] = useState(false);
  const [activeTab, setActiveTab] = useState<"positions" | "details" | "rules">("positions");

  // Live positions query
  const [livePortfolio, setLivePortfolio] = useState<ApiPortfolio | null>(null);
  const [isRefreshingPositions, setIsRefreshingPositions] = useState(false);

  const marketStatus = getStatusLabel(market.status);
  const isMarketTradable = marketStatus.tradable;

  // Derive user portfolio and balances
  const refreshAccount = useCallback(async () => {
    if (!publicKey || !connection) {
      setUserPortfolioPubkey(null);
      setHasPortfolio(null);
      setPortfolioData(null);
      return;
    }

    try {
      const pda = await deriveUserPortfolioAddress(publicKey);
      setUserPortfolioPubkey(pda);

      // SOL balance
      const lamports = await connection.getBalance(publicKey);
      setSolBalance(lamports / LAMPORTS_PER_SOL);

      // USDC balance
      const mintPubkey = new PublicKey(DEVNET_DEPLOYMENT.usdcMint);
      const userAta = getUserAta(publicKey, mintPubkey);
      try {
        const ataRes = await connection.getTokenAccountBalance(userAta);
        setUsdcBalance(ataRes.value.uiAmount ?? 0);
      } catch {
        setUsdcBalance(0);
      }

      // Check on-chain portfolio account
      const info = await connection.getAccountInfo(pda);
      if (info && info.data.length >= 9563) {
        setHasPortfolio(true);
        const decoded = decodePortfolioSummary(new Uint8Array(info.data));
        setPortfolioData(decoded);
      } else {
        setHasPortfolio(false);
        setPortfolioData(null);
      }
    } catch (err) {
      console.warn("Failed refreshing terminal user account:", err);
    }
  }, [publicKey, connection]);

  // Poll live positions
  const pollPositions = useCallback(async () => {
    setIsRefreshingPositions(true);
    try {
      const targetAddress = userPortfolioPubkey
        ? userPortfolioPubkey.toBase58()
        : DEVNET_DEPLOYMENT.demoTraderPortfolio;

      const p = await getPortfolio(targetAddress);
      setLivePortfolio(p);
    } catch (e) {
      console.warn("Poll positions error:", e);
    } finally {
      setIsRefreshingPositions(false);
    }
  }, [userPortfolioPubkey]);

  useEffect(() => {
    refreshAccount();
    pollPositions();
    const interval = setInterval(() => {
      refreshAccount();
      pollPositions();
    }, 4000);
    return () => clearInterval(interval);
  }, [refreshAccount, pollPositions]);

  // Financial calculations
  const position = collateral * leverage;
  const entry = useMemo(
    () => market.moxie + (side === "long" ? 0.35 : -0.35),
    [market.moxie, side]
  );
  const tradeFee = position * 0.003; // 30 bps = 0.30%
  const marginRequired = position; // 1x isolated binary perp

  // Action: Create Trading Account
  async function handleCreateTradingAccount() {
    if (!publicKey || !userPortfolioPubkey) return;
    setIsCreatingPortfolio(true);
    setStatusError(null);
    setStatusText("Creating your Percolator trading account on Solana Devnet...");

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

      setStatusText("Awaiting wallet approval to create trading account...");
      const sig = await sendTransaction(tx, connection);
      setStatusText(`Transaction submitted! Confirming ${sig.slice(0, 8)}...`);
      await connection.confirmTransaction(sig, "confirmed");

      setStatusText("Trading account created successfully!");
      await refreshAccount();
      await pollPositions();
    } catch (err: any) {
      console.error("Create portfolio error:", err);
      setStatusError(`Account creation failed: ${err.message || err}`);
    } finally {
      setIsCreatingPortfolio(false);
    }
  }

  // Action: Deposit $50 to Margin
  async function handleDepositMargin() {
    if (!publicKey || !portfolioData || !userPortfolioPubkey) return;
    setIsDepositing(true);
    setStatusError(null);
    setStatusText("Depositing collateral into Percolator margin...");

    try {
      const percolatorProgramId = new PublicKey(DEVNET_DEPLOYMENT.percolatorProgramId);
      const marketAccount = new PublicKey(DEVNET_DEPLOYMENT.marketAccount);
      const vaultToken = new PublicKey(DEVNET_DEPLOYMENT.collateralVault);
      const mintPubkey = new PublicKey(DEVNET_DEPLOYMENT.usdcMint);
      const userAta = getUserAta(publicKey, mintPubkey);

      const depositAmountUSDC = 50;
      const depositAtoms = BigInt(depositAmountUSDC) * 1_000_000n;

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
            buildDepositData(portfolioData.portfolioId, portfolioData.sequence, depositAtoms)
          ),
        })
      );

      setStatusText("Awaiting wallet signature for deposit...");
      const sig = await sendTransaction(tx, connection);
      setStatusText(`Deposit submitted! Confirming ${sig.slice(0, 8)}...`);
      await connection.confirmTransaction(sig, "confirmed");

      setStatusText("Deposited $50 USDC to your Percolator margin!");
      await refreshAccount();
      await pollPositions();
    } catch (err: any) {
      console.error("Deposit error:", err);
      setStatusError(`Deposit failed: ${err.message || err}`);
    } finally {
      setIsDepositing(false);
    }
  }

  // Action: Airdrop Faucet USDC
  async function handleAirdropFaucet() {
    if (!publicKey) {
      setFaucetStatus("Connect wallet first to receive test USDC.");
      return;
    }
    setFaucetLoading(true);
    setFaucetStatus(null);
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: publicKey.toBase58() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Faucet failed");
      setFaucetStatus(`Airdropped 500 Test USDC! (Tx: ${data.signature.slice(0, 8)}...)`);
      await refreshAccount();
    } catch (err: any) {
      setFaucetStatus(`Faucet: ${err.message}`);
    } finally {
      setFaucetLoading(false);
    }
  }

  // Action: Submit Trade
  async function handleSubmitOrder() {
    setStatusError(null);
    setStatusText("");
    setTxSig(null);

    if (!connected || !publicKey) {
      setStatusError("Wallet not connected. Connect Phantom, Backpack, or Privy in the header.");
      return;
    }

    if ((solBalance ?? 0) < 0.005) {
      setStatusError("Insufficient SOL for transaction fees. Request devnet SOL in the wallet modal.");
      return;
    }

    if (!isMarketTradable) {
      setStatusError(`Trading is disabled: this market is ${marketStatus.label}.`);
      return;
    }

    if (!hasPortfolio || !userPortfolioPubkey || !portfolioData) {
      setStatusError("No Percolator trading account found. Click 'Create Trading Account' below first.");
      return;
    }

    const availableMargin = Number(portfolioData.capital) / 1_000_000;
    if (availableMargin < collateral) {
      setStatusError(`Insufficient margin ($${availableMargin.toFixed(2)} available). Deposit USDC to margin.`);
      return;
    }

    setIsSubmitting(true);
    setStatusText("Building authenticated TradeCpi transaction...");

    try {
      const programId = new PublicKey(DEVNET_DEPLOYMENT.percolatorProgramId);
      const marketAccount = new PublicKey(DEVNET_DEPLOYMENT.marketAccount);
      const lpPortfolio = new PublicKey(DEVNET_DEPLOYMENT.lpPortfolio);
      const matcherProgramId = new PublicKey(DEVNET_DEPLOYMENT.matcherProgramId);
      const matcherContext = new PublicKey(DEVNET_DEPLOYMENT.matcherContext);
      const matcherDelegate = new PublicKey(DEVNET_DEPLOYMENT.matcherDelegate);

      // Contracts in atomic units (e6): 1 contract = 1_000_000 atoms
      // YES is Long (positive size), NO is Short (negative size)
      const sizeSign = side === "long" ? 1n : -1n;
      const sizeQ = BigInt(position) * 1_000_000n * sizeSign;
      const limitPriceE6 = BigInt(Math.max(1, Math.round(entry * 10_000)));

      const tradeData = buildTradeCpiData({
        traderPortfolioId: portfolioData.portfolioId,
        traderPositionEpoch: 0n,
        lpPortfolioId: 2n,
        lpPositionEpoch: 0n,
        lpMatcherSequence: 1n,
        assetIndex: market.assetIndex || 1,
        marketId: BigInt(market.marketId || 2),
        sizeQ,
        feeBps: 30n,
        limitPriceE6,
        backingFeeCapBps: 0,
      });

      const tx = new Transaction();
      // Increase compute units for Percolator TradeCpi proof
      tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
      tx.add(
        new TransactionInstruction({
          programId,
          keys: [
            { pubkey: publicKey, isSigner: true, isWritable: false },
            { pubkey: marketAccount, isSigner: false, isWritable: true },
            { pubkey: userPortfolioPubkey, isSigner: false, isWritable: true },
            { pubkey: lpPortfolio, isSigner: false, isWritable: true },
            { pubkey: matcherProgramId, isSigner: false, isWritable: false },
            { pubkey: matcherContext, isSigner: false, isWritable: true },
            { pubkey: matcherDelegate, isSigner: false, isWritable: false },
          ],
          data: Buffer.from(tradeData),
        })
      );

      setStatusText("Awaiting wallet signature...");
      const signature = await sendTransaction(tx, connection);
      setStatusText(`Trade submitted! Confirming ${signature.slice(0, 8)}...`);

      const confirmation = await connection.confirmTransaction(signature, "confirmed");
      if (confirmation.value.err) {
        throw new Error(`Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
      }

      setTxSig(signature);
      setStatusText("Trade executed successfully on Solana Devnet!");
      await refreshAccount();
      await pollPositions();
    } catch (err: any) {
      console.error("Order error:", err);
      if (err.message?.includes("User rejected") || err.name === "WalletSignTransactionError") {
        setStatusError("Transaction cancelled: User rejected signature request.");
      } else {
        setStatusError(`Trade execution failed: ${err.message || err}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const userMargin = portfolioData ? Number(portfolioData.capital) / 1_000_000 : 0;
  const positionsList = livePortfolio?.positions || [];

  return (
    <div className="terminal-layout">
      {/* Left rail: Markets List */}
      <aside className="market-rail">
        <div className="rail-search">
          <span>LIVE MARKETS</span>
          <span style={{ fontSize: "11px", opacity: 0.7 }}>DEVNET</span>
        </div>
        {markets.map((item) => (
          <Link
            key={item.slug}
            href={`/trade/${item.slug}`}
            className={`rail-item${item.slug === market.slug ? " active" : ""}`}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <b>{item.short}</b>
              <span className={`status-pill status-${getStatusLabel(item.status).label.toLowerCase().replace(" ", "-")}`}>
                {getStatusLabel(item.status).label}
              </span>
            </div>
            <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.7)", margin: "4px 0" }}>
              {item.question.slice(0, 45)}...
            </p>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginTop: "2px" }}>
              <span style={{ color: "#c7ff4a", fontWeight: 600 }}>{item.moxie.toFixed(1)}¢</span>
              <span style={{ opacity: 0.6, fontSize: "11px" }}>{item.lock}</span>
            </div>
          </Link>
        ))}
      </aside>

      {/* Main center chart and positions panel */}
      <section className="terminal-main">
        <div className="market-masthead">
          <div className="masthead-left">
            <span className="market-type">SOLANA DEVNET PERP • ISOLATED 1×</span>
            <h1>{market.question}</h1>
            <p className="market-meta">
              <span>{market.provider}</span>
              <span className={`status-pill status-${marketStatus.label.toLowerCase().replace(" ", "-")}`}>
                {marketStatus.label}
              </span>
              <span><Clock3 size={13} /> Closes {market.lock}</span>
            </p>
          </div>
          <div className="masthead-stats">
            <div>
              <span className="stat-label">MOXIE MARK</span>
              <span className="stat-value highlight">{market.moxie.toFixed(1)}¢</span>
            </div>
            <div>
              <span className="stat-label">PROVIDER INDEX</span>
              <span className="stat-value">{market.index.toFixed(1)}¢</span>
            </div>
            <div>
              <span className="stat-label">LEVERAGE CAP</span>
              <span className="stat-value">1× (100% IM)</span>
            </div>
            <div>
              <span className="stat-label">TRADE FEE</span>
              <span className="stat-value">30 bps</span>
            </div>
          </div>
        </div>

        {/* Chart View */}
        <div className="chart-panel">
          <div className="chart-toolbar">
            <div>
              <button className="active" type="button">Price</button>
              <button type="button">Depth</button>
              <button type="button">Premium</button>
            </div>
            <div>
              <button className="active" type="button">1H</button>
              <button type="button">4H</button>
              <button type="button">1D</button>
              <button type="button">LIVE</button>
              <button aria-label="Chart settings" type="button"><Settings2 size={15} /></button>
            </div>
          </div>
          <div className="chart-area">
            <div className="chart-price">
              <strong>{market.moxie.toFixed(1)}¢</strong>
              <span>Protected on-chain mark (PushAuthMark)</span>
            </div>
            <svg viewBox="0 0 650 250" preserveAspectRatio="none" role="img" aria-label={`${market.short} price chart`}>
              <defs>
                <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#c7ff4a" stopOpacity=".22" />
                  <stop offset="1" stopColor="#c7ff4a" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path className="area-path" d={`${chartPaths.market} L650 250 L0 250 Z`} />
              <path className="index-path" d={chartPaths.index} />
              <path className="market-path" d={chartPaths.market} />
              <circle cx="650" cy="24" r="4" fill="#c7ff4a" />
            </svg>
            <div className="y-axis">
              <span>90¢</span><span>75¢</span><span>60¢</span><span>45¢</span><span>30¢</span>
            </div>
            <div className="x-axis">
              <span>04:00</span><span>08:00</span><span>12:00</span><span>16:00</span><span>20:00</span><span>NOW</span>
            </div>
          </div>
          <div className="chart-footer">
            <span><i className="moxie-dot" /> MOXIE {market.moxie.toFixed(1)}¢</span>
            <span><i className="index-dot" /> INDEX {market.index.toFixed(1)}¢</span>
            <span><i className="mark-dot" /> AUTH MARK {market.mark.toFixed(1)}¢</span>
            <em title={market.address}>RECORD {market.address.slice(0, 8)}...</em>
          </div>
        </div>

        {/* Lower tabs: Positions & Contract Details */}
        <div className="lower-panel">
          <div className="panel-tabs">
            <button
              className={activeTab === "positions" ? "active" : ""}
              onClick={() => setActiveTab("positions")}
              type="button"
            >
              Open Positions ({positionsList.length})
            </button>
            <button
              className={activeTab === "details" ? "active" : ""}
              onClick={() => setActiveTab("details")}
              type="button"
            >
              Market Rules & Identity
            </button>
            <button
              style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "4px" }}
              onClick={pollPositions}
              type="button"
              title="Refresh positions"
            >
              <RefreshCw size={12} className={isRefreshingPositions ? "animate-spin" : ""} />
              <span>Refresh</span>
            </button>
          </div>

          {activeTab === "positions" && (
            <div className="positions-container" style={{ padding: "12px 16px" }}>
              {positionsList.length > 0 ? (
                <div className="positions-table-wrap">
                  <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ opacity: 0.6, borderBottom: "1px solid rgba(255,255,255,0.08)", textAlign: "left" }}>
                        <th style={{ padding: "8px 6px" }}>MARKET</th>
                        <th style={{ padding: "8px 6px" }}>SIDE</th>
                        <th style={{ padding: "8px 6px" }}>CONTRACTS</th>
                        <th style={{ padding: "8px 6px" }}>ENTRY NOTIONAL</th>
                        <th style={{ padding: "8px 6px" }}>CURRENT MARK</th>
                        <th style={{ padding: "8px 6px" }}>STATUS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positionsList.map((pos) => {
                        const isLong = pos.side === "long";
                        const contracts = Math.abs(Number(pos.sizeQ) / 1_000_000);
                        const entryNotional = Number(pos.entryNotional) / 1_000_000;
                        return (
                          <tr key={pos.slot} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                            <td style={{ padding: "10px 6px", fontWeight: 600 }}>
                              Market #{pos.marketId} (Asset {pos.assetIndex})
                            </td>
                            <td style={{ padding: "10px 6px" }}>
                              <span
                                style={{
                                  color: isLong ? "#c7ff4a" : "#ff5b5b",
                                  fontWeight: 700,
                                  background: isLong ? "rgba(199,255,74,0.1)" : "rgba(255,91,91,0.1)",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                }}
                              >
                                {isLong ? "YES (LONG)" : "NO (SHORT)"}
                              </span>
                            </td>
                            <td style={{ padding: "10px 6px" }}>{contracts.toLocaleString()} contracts</td>
                            <td style={{ padding: "10px 6px" }}>${entryNotional.toFixed(2)}</td>
                            <td style={{ padding: "10px 6px", color: "#c7ff4a" }}>{market.moxie.toFixed(1)}¢</td>
                            <td style={{ padding: "10px 6px" }}>
                              <span style={{ color: pos.stale ? "#ffb400" : "#c7ff4a", fontSize: "11px" }}>
                                {pos.stale ? "Refresh needed" : "Certified Healthy"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-activity">
                  <div>
                    <b>
                      {connected
                        ? `Trading Account: ${userPortfolioPubkey ? userPortfolioPubkey.toBase58().slice(0, 6) + "..." : "Active"}`
                        : "No wallet connected"}
                    </b>
                    <span>
                      {connected
                        ? hasPortfolio
                          ? "Your trading account is active. No open positions currently on this market."
                          : "Create a trading account in the order ticket to submit trades directly on Solana Devnet."
                        : "Connect Phantom, Backpack, or Privy in the header to view your portfolio and trade."}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "details" && (
            <div style={{ padding: "16px", fontSize: "13px", lineHeight: "1.6", color: "rgba(255,255,255,0.85)" }}>
              <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "8px", color: "#fff" }}>
                Imported Jupiter Event Rules
              </h3>
              <p style={{ whiteSpace: "pre-line", opacity: 0.8 }}>
                {market.rules || "Event imported from Jupiter / Polymarket. Settles to 1 (YES) or 0 (NO) upon authenticated resolution."}
              </p>
              <div style={{ marginTop: "16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "12px" }}>
                <div>
                  <span style={{ opacity: 0.6 }}>Oracle Record PDA:</span>
                  <div style={{ fontFamily: "monospace", color: "#c7ff4a", marginTop: "2px" }}>{market.address}</div>
                </div>
                <div>
                  <span style={{ opacity: 0.6 }}>Percolator Market Account:</span>
                  <div style={{ fontFamily: "monospace", color: "#c7ff4a", marginTop: "2px" }}>{DEVNET_DEPLOYMENT.marketAccount}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Right Order Ticket */}
      <aside className="order-ticket">
        <div className="side-tabs">
          <button
            className={side === "long" ? "long active" : "long"}
            onClick={() => setSide("long")}
            type="button"
          >
            BUY YES
          </button>
          <button
            className={side === "short" ? "short active" : "short"}
            onClick={() => setSide("short")}
            type="button"
          >
            BUY NO
          </button>
        </div>

        <div className="order-types">
          <button className="active" type="button">Market</button>
          <button type="button" disabled title="Percolator v16 Trades are matched at authenticated mark">Oracle Limit</button>
        </div>

        <div className="balance-line">
          <span>Wallet Signer</span>
          <b>{publicKey ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}` : "Not connected"}</b>
        </div>

        <div className="balance-line" style={{ marginTop: "4px" }}>
          <span>Percolator Margin</span>
          <b style={{ color: userMargin > 0 ? "#c7ff4a" : "inherit" }}>
            {hasPortfolio ? `$${userMargin.toFixed(2)} USDC` : "No Account"}
          </b>
        </div>

        <label className="ticket-label" htmlFor="collateral">
          ORDER SIZE (USDC)
        </label>
        <div className="amount-field">
          <input
            id="collateral"
            type="number"
            min="10"
            max="1000"
            value={collateral}
            onChange={(event) => setCollateral(Math.max(1, Number(event.target.value)))}
          />
          <b>USDC</b>
        </div>

        <div className="quick-percent">
          <button onClick={() => setCollateral(25)} type="button">$25</button>
          <button onClick={() => setCollateral(50)} type="button">$50</button>
          <button onClick={() => setCollateral(100)} type="button">$100</button>
          <button onClick={() => setCollateral(250)} type="button">$250</button>
        </div>

        {/* Faucet helper */}
        <div style={{ margin: "12px 0 8px" }}>
          <button
            type="button"
            onClick={handleAirdropFaucet}
            disabled={faucetLoading || !connected}
            style={{
              width: "100%",
              background: "rgba(199, 255, 74, 0.08)",
              border: "1px solid rgba(199, 255, 74, 0.4)",
              color: "#c7ff4a",
              padding: "6px 12px",
              borderRadius: "6px",
              fontSize: "11px",
              cursor: connected ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
            }}
          >
            {faucetLoading ? <Loader2 size={12} className="animate-spin" /> : <Coins size={12} />}
            <span>Get 500 Devnet Test USDC</span>
          </button>
          {faucetStatus && (
            <p style={{ fontSize: "11px", color: "#c7ff4a", marginTop: "4px", textAlign: "center" }}>
              {faucetStatus}
            </p>
          )}
        </div>

        {/* Solvency-constrained Leverage Notice */}
        <div style={{ margin: "10px 0 6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
            <span style={{ opacity: 0.8 }}>LEVERAGE ENVELOPE</span>
            <b style={{ color: "#c7ff4a" }}>1× (Isolated Binary Perp)</b>
          </div>
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)", lineHeight: "1.4" }}>
            Percolator v16 exact solvency proof requires 10,000 bps initial & maintenance margin for binary outcomes.
          </div>
        </div>

        {/* Order Summary */}
        <div className="order-summary" style={{ marginTop: "12px" }}>
          <div>
            <span>Position outcome</span>
            <b>{side === "long" ? "YES (Mees Rottgering)" : "NO (Edward Winter)"}</b>
          </div>
          <div>
            <span>Est. entry price <Info size={12} /></span>
            <b>{entry.toFixed(2)}¢</b>
          </div>
          <div>
            <span>Contracts implied</span>
            <b>{(position / (entry / 100)).toFixed(1)}</b>
          </div>
          <div>
            <span>Margin required</span>
            <b>${marginRequired.toFixed(2)} USDC</b>
          </div>
          <div>
            <span>Trading fee (30 bps)</span>
            <b>${tradeFee.toFixed(2)}</b>
          </div>
        </div>

        {/* Safety & Lifecycle Notice */}
        <div className="risk-note" style={{ margin: "12px 0" }}>
          <ShieldCheck size={16} color="#c7ff4a" />
          <span>
            <b>Percolator TradeCpi on Devnet</b>
            Direct atomic execution against LP counterparty Hu6u...AvUn.
          </span>
        </div>

        {/* Action Button: Conditional on Wallet & Portfolio State */}
        {!connected ? (
          <button className="review-order long" type="button" disabled style={{ opacity: 0.7 }}>
            Connect Wallet to Trade
          </button>
        ) : !hasPortfolio ? (
          <button
            className="review-order long"
            type="button"
            onClick={handleCreateTradingAccount}
            disabled={isCreatingPortfolio || (solBalance ?? 0) < 0.07}
            style={{ background: "#c7ff4a", color: "#000" }}
          >
            {isCreatingPortfolio ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <Loader2 size={15} className="animate-spin" /> Creating Account...
              </span>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <PlusCircle size={15} /> Create Trading Account
              </span>
            )}
          </button>
        ) : userMargin < collateral ? (
          <button
            className="review-order long"
            type="button"
            onClick={handleDepositMargin}
            disabled={isDepositing || (usdcBalance ?? 0) < 50}
            style={{ background: "#c7ff4a", color: "#000" }}
          >
            {isDepositing ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <Loader2 size={15} className="animate-spin" /> Depositing...
              </span>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <ArrowDownLeft size={15} /> Deposit $50 to Margin
              </span>
            )}
          </button>
        ) : (
          <button
            className={`review-order ${side}`}
            type="button"
            onClick={handleSubmitOrder}
            disabled={isSubmitting || !isMarketTradable}
          >
            {isSubmitting ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <Loader2 size={15} className="animate-spin" /> Signing & Sending...
              </span>
            ) : !isMarketTradable ? (
              `Market ${marketStatus.label}`
            ) : (
              `Submit ${side === "long" ? "YES" : "NO"} Order ($${collateral})`
            )}
          </button>
        )}

        {/* Notices and Explorer Link */}
        {statusText && (
          <p
            className="order-notice"
            role="status"
            style={{ marginTop: "10px", fontSize: "12px", color: "#c7ff4a", textAlign: "center" }}
          >
            {statusText}
          </p>
        )}

        {statusError && (
          <div
            style={{
              marginTop: "10px",
              padding: "8px 12px",
              background: "rgba(255, 91, 91, 0.12)",
              border: "1px solid rgba(255, 91, 91, 0.3)",
              borderRadius: "6px",
              fontSize: "12px",
              color: "#ff5b5b",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            <span>{statusError}</span>
          </div>
        )}

        {txSig && (
          <div style={{ marginTop: "12px", textAlign: "center" }}>
            <a
              href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "#c7ff4a",
                fontSize: "12px",
                textDecoration: "underline",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <CheckCircle2 size={14} /> View Confirmed Transaction on Solana Explorer
            </a>
          </div>
        )}
      </aside>
    </div>
  );
}
