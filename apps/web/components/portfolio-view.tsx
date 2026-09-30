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
      // 1. SOL
      const lamports = await connection.getBalance(activePubkey);
      setSolBalance(lamports / LAMPORTS_PER_SOL);

      // 2. USDC ATA
      const mintPubkey = new PublicKey(DEVNET_DEPLOYMENT.usdcMint);
      const userAta = getUserAta(activePubkey, mintPubkey);
      try {
        const tokenRes = await connection.getTokenAccountBalance(userAta);
        setUsdcBalance(tokenRes.value.uiAmount ?? 0);
      } catch {
        setUsdcBalance(0);
      }

      // 3. User Portfolio Account
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
    const interval = setInterval(refreshPortfolio, 5000);
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
      setActionError(err.message || "Failed to create portfolio account.");
    } finally {
      setIsActionLoading(false);
    }
  }

  // Action: Deposit $100 Margin
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
      setActionError(err.message || "Deposit failed");
    } finally {
      setIsActionLoading(false);
    }
  }

  // Action: Faucet
  async function handleFaucet() {
    if (!activeAddress) return;
    setIsActionLoading(true);
    setActionError(null);
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
      await refreshPortfolio();
    } catch (err: any) {
      setActionError(err.message || "Faucet error");
    } finally {
      setIsActionLoading(false);
    }
  }

  // Not connected
  if (!activeAddress) {
    return (
      <div style={{ textAlign: "center", padding: "60px 24px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px" }}>
        <div style={{ display: "inline-flex", padding: "14px", background: "rgba(199,255,74,0.1)", borderRadius: "50%", color: "#c7ff4a", marginBottom: "16px" }}>
          <Wallet size={32} />
        </div>
        <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#fff", marginBottom: "8px" }}>
          Connect Wallet to View Portfolio
        </h2>
        <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.7)", maxWidth: "460px", margin: "0 auto 24px", lineHeight: 1.5 }}>
          Your Percolator portfolio is tied directly to your Solana Devnet wallet. Connect to see your collateral, margin solvency, and open positions.
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
            fontSize: "14px",
            padding: "10px 24px",
            borderRadius: "4px",
            border: "none",
            cursor: "pointer",
          }}
        >
          <Wallet size={16} />
          <span>Connect Devnet Wallet</span>
        </button>
      </div>
    );
  }

  // Connected but no portfolio
  if (hasPortfolio === false) {
    return (
      <div style={{ padding: "36px 24px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", textAlign: "center" }}>
        <div style={{ display: "inline-flex", padding: "14px", background: "rgba(255,180,0,0.1)", borderRadius: "50%", color: "#ffb400", marginBottom: "16px" }}>
          <AlertTriangle size={32} />
        </div>
        <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#fff", marginBottom: "8px" }}>
          No Percolator Trading Account Found
        </h2>
        <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.7)", maxWidth: "520px", margin: "0 auto 20px", lineHeight: 1.5 }}>
          Wallet <code style={{ color: "#c7ff4a" }}>{shortAddress(activeAddress)}</code> has not yet initialized a Percolator portfolio PDA on Solana Devnet.
        </p>

        <div style={{ display: "flex", justifyContent: "center", gap: "12px", marginBottom: "20px" }}>
          <button
            type="button"
            onClick={handleCreatePortfolio}
            disabled={isActionLoading || (solBalance ?? 0) < 0.05}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              background: "#c7ff4a",
              color: "#000",
              fontWeight: 600,
              fontSize: "14px",
              padding: "10px 24px",
              borderRadius: "4px",
              border: "none",
              cursor: (solBalance ?? 0) >= 0.05 ? "pointer" : "not-allowed",
            }}
          >
            {isActionLoading ? <Loader2 size={16} className="animate-spin" /> : <PlusCircle size={16} />}
            <span>1-Click: Create Trading Account (InitPortfolio)</span>
          </button>
        </div>

        {(solBalance ?? 0) < 0.05 && (
          <p style={{ fontSize: "12px", color: "#ffb400", marginBottom: "16px" }}>
            Requires ~0.05 SOL for rent exemption. Use &quot;Get 500 Test USDC + SOL&quot; below first.
          </p>
        )}

        <button
          type="button"
          onClick={handleFaucet}
          disabled={isActionLoading}
          style={{
            background: "none",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "rgba(255,255,255,0.8)",
            padding: "8px 16px",
            borderRadius: "4px",
            fontSize: "12px",
            cursor: "pointer",
          }}
        >
          {isActionLoading ? "Requesting..." : "Get 500 Test USDC + SOL"}
        </button>

        {actionError && <p style={{ fontSize: "12px", color: "#ff4d4d", marginTop: "16px" }}>{actionError}</p>}
        {actionSuccess && <p style={{ fontSize: "12px", color: "#c7ff4a", marginTop: "16px" }}>{actionSuccess}</p>}
      </div>
    );
  }

  // Loading state
  if (hasPortfolio === null || !portfolioData) {
    return (
      <div style={{ textAlign: "center", padding: "60px 24px" }}>
        <Loader2 size={28} className="animate-spin" style={{ margin: "0 auto 12px", color: "#c7ff4a" }} />
        <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.6)" }}>Loading your portfolio from Devnet...</p>
      </div>
    );
  }

  // Active Portfolio State
  const capitalUsdc = Number(portfolioData.capital) / 1e6;
  const pnlUsdc = Number(portfolioData.pnl) / 1e6;
  const equityUsdc = Number(portfolioData.equity) / 1e6;
  const activePositions = portfolioData.positions.filter((p: any) => BigInt(p.sizeQ) !== 0n);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Portfolio Info Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.03)", padding: "14px 20px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div>
          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", display: "block" }}>CONNECTED PORTFOLIO ACCOUNT</span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <code style={{ fontSize: "13px", color: "#c7ff4a", fontWeight: 600 }}>
              {userPortfolioAddress ? shortAddress(userPortfolioAddress) : "…"}
            </code>
            <a
              href={`https://explorer.solana.com/address/${userPortfolioAddress}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center" }}
            >
              <ExternalLink size={12} />
            </a>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="button"
            onClick={handleDepositMargin}
            disabled={isActionLoading || (usdcBalance ?? 0) < 100}
            style={{
              padding: "8px 14px",
              background: "#c7ff4a",
              color: "#000",
              fontWeight: 600,
              fontSize: "12px",
              borderRadius: "4px",
              border: "none",
              cursor: (usdcBalance ?? 0) >= 100 ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {isActionLoading ? <Loader2 size={12} className="animate-spin" /> : <ArrowDownLeft size={12} />}
            <span>Deposit $100 Margin</span>
          </button>

          <button
            type="button"
            onClick={handleFaucet}
            disabled={isActionLoading}
            style={{
              padding: "8px 14px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#fff",
              fontWeight: 600,
              fontSize: "12px",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Get Test USDC
          </button>
        </div>
      </div>

      {actionSuccess && (
        <p style={{ margin: 0, fontSize: "12px", color: "#c7ff4a", background: "rgba(199,255,74,0.1)", padding: "10px 14px", borderRadius: "6px" }}>
          {actionSuccess}
        </p>
      )}

      {/* Metric Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px" }}>
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", padding: "16px 20px", borderRadius: "8px" }}>
          <small style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px", display: "block", marginBottom: "4px" }}>Deposited Collateral</small>
          <strong style={{ fontSize: "22px", color: "#fff" }}>${capitalUsdc.toFixed(2)}</strong>
          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", display: "block", marginTop: "4px" }}>Test USDC in Vault</span>
        </div>

        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", padding: "16px 20px", borderRadius: "8px" }}>
          <small style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px", display: "block", marginBottom: "4px" }}>Total Equity</small>
          <strong style={{ fontSize: "22px", color: "#c7ff4a" }}>${equityUsdc.toFixed(2)}</strong>
          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", display: "block", marginTop: "4px" }}>Collateral + Matured PnL</span>
        </div>

        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", padding: "16px 20px", borderRadius: "8px" }}>
          <small style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px", display: "block", marginBottom: "4px" }}>Realized PnL</small>
          <strong style={{ fontSize: "22px", color: pnlUsdc >= 0 ? "#c7ff4a" : "#ff4d4d" }}>
            {pnlUsdc >= 0 ? "+" : ""}${pnlUsdc.toFixed(2)}
          </strong>
          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", display: "block", marginTop: "4px" }}>Settled on Percolator</span>
        </div>

        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", padding: "16px 20px", borderRadius: "8px" }}>
          <small style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px", display: "block", marginBottom: "4px" }}>Solvency Status</small>
          <strong style={{ fontSize: "16px", color: "#c7ff4a", display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <ShieldCheck size={16} /> 100% Solvency
          </strong>
          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", display: "block", marginTop: "6px" }}>1× Isolated Binary Model</span>
        </div>
      </div>

      {/* Positions Across Live Markets */}
      <section style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", padding: "20px 24px" }}>
        <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#fff", margin: "0 0 16px" }}>
          Active Positions Across Imported Markets
        </h3>

        {activePositions.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px", background: "rgba(0,0,0,0.15)", borderRadius: "6px" }}>
            <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", margin: "0 0 12px" }}>
              No open positions. Use your deposited collateral to trade live markets.
            </p>
            <Link
              href="/markets"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: "#c7ff4a",
                color: "#000",
                fontWeight: 600,
                fontSize: "12px",
                padding: "8px 16px",
                borderRadius: "4px",
                textDecoration: "none",
              }}
            >
              <span>Browse Markets</span>
              <ArrowUpRight size={14} />
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {activePositions.map((pos: any, idx: number) => {
              const targetMarket = markets.find((m) => m.address === DEVNET_DEPLOYMENT.importedRecord) || markets[0];
              const sizeContracts = Number(pos.sizeQ) / 1e6;
              const notionalUsdc = Number(pos.entryNotional) / 1e6;
              const sideLabel = (pos.side === 'long' || pos.side === 0) ? 'LONG YES' : 'SHORT NO';

              return (
                <div
                  key={idx}
                  style={{
                    background: "rgba(0,0,0,0.25)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: "6px",
                    padding: "16px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "12px",
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: "3px",
                        background: (pos.side === 'long' || pos.side === 0) ? 'rgba(199,255,74,0.15)' : 'rgba(255,132,116,0.15)',
                        color: (pos.side === 'long' || pos.side === 0) ? '#c7ff4a' : '#ff8474',
                        marginRight: "8px",
                      }}
                    >
                      {sideLabel}
                    </span>
                    <strong style={{ fontSize: "14px", color: "#fff" }}>
                      {targetMarket?.title || "Jupiter Imported Prediction Market"}
                    </strong>
                  </div>

                  <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
                    <div>
                      <small style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", display: "block" }}>Contracts</small>
                      <strong style={{ fontSize: "13px", color: "#fff" }}>{sizeContracts.toLocaleString()}</strong>
                    </div>

                    <div>
                      <small style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", display: "block" }}>Notional</small>
                      <strong style={{ fontSize: "13px", color: "#fff" }}>${notionalUsdc.toFixed(2)}</strong>
                    </div>

                    <Link
                      href={`/trade/${targetMarket?.slug || DEVNET_DEPLOYMENT.importedRecord}`}
                      style={{
                        padding: "6px 12px",
                        background: "rgba(255,255,255,0.1)",
                        color: "#fff",
                        fontWeight: 600,
                        fontSize: "12px",
                        borderRadius: "4px",
                        textDecoration: "none",
                      }}
                    >
                      Trade
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
