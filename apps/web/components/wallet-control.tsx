"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  Check,
  LogOut,
  Wallet,
  X,
  Coins,
  Loader2,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  PlusCircle,
  ArrowDownLeft,
  Copy,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { usePrivyWalletState } from "./wallet-providers";
import {
  DEVNET_DEPLOYMENT,
  deriveUserPortfolioAddress,
  getUserAta,
  decodePortfolioSummary,
  buildDepositData,
} from "@/lib/contracts";

function shortAddress(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs = 8000, errorMsg = "RPC timeout (8s)"): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), timeoutMs)),
  ]);
}

export function WalletControl() {
  const [open, setOpen] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<{ message: string; signature?: string; explorerUrl?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Direct window.solana (Phantom) fallback state
  const [directPhantomAddress, setDirectPhantomAddress] = useState<string | null>(null);

  // Deployment configuration state
  const [faucetConfigured, setFaucetConfigured] = useState<boolean | null>(null);

  // Balances & Onchain state
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [solLoading, setSolLoading] = useState(false);
  const [solError, setSolError] = useState<string | null>(null);

  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [usdcLoading, setUsdcLoading] = useState(false);
  const [usdcError, setUsdcError] = useState<string | null>(null);

  const [hasPortfolio, setHasPortfolio] = useState<boolean | null>(null);
  const [portfolioPubkeyStr, setPortfolioPubkeyStr] = useState<string | null>(null);
  const [portfolioData, setPortfolioData] = useState<any | null>(null);
  const [isCreatingPortfolio, setIsCreatingPortfolio] = useState(false);
  const [isDepositing, setIsDepositing] = useState(false);
  const [isAirdroppingSol, setIsAirdroppingSol] = useState(false);
  const [faucetUsdcLoading, setFaucetUsdcLoading] = useState(false);

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const privy = usePrivyWalletState();
  const external = useWallet();
  const { connection } = useConnection();

  // Restore direct phantom session from localStorage if present
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("moxie_direct_phantom");
      if (saved) {
        setDirectPhantomAddress(saved);
      }
    }
  }, []);

  const activeAddress = privy.address || external.publicKey?.toBase58() || directPhantomAddress || null;
  const activePubkey = useMemo(() => (activeAddress ? new PublicKey(activeAddress) : null), [activeAddress]);

  // Load deployment public state
  useEffect(() => {
    fetch("/api/deployment")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.faucetConfigured === "boolean") {
          setFaucetConfigured(data.faucetConfigured);
        }
      })
      .catch(() => {});
  }, []);

  // Unified signer supporting Privy, standard Solana adapters, and direct window.solana
  const signAndSendTransaction = useCallback(
    async (tx: Transaction): Promise<string> => {
      if (!activePubkey) throw new Error("Wallet not connected");

      tx.feePayer = activePubkey;
      const latestBlockhash = await withTimeout(
        connection.getLatestBlockhash("confirmed"),
        8000,
        "Devnet RPC timeout fetching blockhash"
      );
      tx.recentBlockhash = latestBlockhash.blockhash;

      // 1. Direct window.solana fallback
      if (directPhantomAddress && typeof window !== "undefined" && (window as any).solana?.signAndSendTransaction) {
        const res = await (window as any).solana.signAndSendTransaction(tx);
        const sig = res.signature || res;
        await connection.confirmTransaction({ signature: sig, ...latestBlockhash }, "confirmed");
        return sig;
      }

      // 2. Privy embedded wallet path
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

      // 3. Standard Solana Wallet Adapter path
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

      throw new Error("No signing method available on connected wallet. Please use Privy or Phantom.");
    },
    [activePubkey, connection, directPhantomAddress, external, privy.wallet]
  );

  // Fetch balances & portfolio state using server endpoint first with client fallback
  const refreshAccountState = useCallback(async () => {
    if (!activePubkey) {
      setSolBalance(null);
      setUsdcBalance(null);
      setHasPortfolio(null);
      setPortfolioData(null);
      setPortfolioPubkeyStr(null);
      setSolError(null);
      setUsdcError(null);
      return;
    }

    setSolLoading(true);
    setUsdcLoading(true);
    setSolError(null);
    setUsdcError(null);

    // 1. Fast parallel server-side fetch (/api/account-state)
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`/api/account-state?address=${activePubkey.toBase58()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        setSolBalance(data.sol !== null && data.sol !== undefined ? data.sol : null);
        setSolError(data.solError || null);

        setUsdcBalance(data.usdc !== null && data.usdc !== undefined ? data.usdc : null);
        setUsdcError(data.usdcError || null);

        setHasPortfolio(Boolean(data.hasPortfolio));
        setPortfolioPubkeyStr(data.portfolioPubkey || null);
        setPortfolioData(data.portfolioData || null);

        setSolLoading(false);
        setUsdcLoading(false);
        return;
      }
    } catch {
      // Server route timed out or failed, fall back to direct client RPC
    }

    // 2. Direct client RPC fallback with 8s timeout
    const fetchSol = withTimeout(connection.getBalance(activePubkey), 8000, "RPC timeout")
      .then((lamports) => {
        setSolBalance(lamports / LAMPORTS_PER_SOL);
        setSolError(null);
      })
      .catch((err) => {
        const msg = String(err?.message || "");
        if (msg.includes("429")) setSolError("RPC 429 Rate limited");
        else if (msg.includes("401")) setSolError("RPC 401 Unauthorized");
        else setSolError("RPC timeout");
      })
      .finally(() => setSolLoading(false));

    let fetchUsdc: Promise<void>;
    if (!DEVNET_DEPLOYMENT.usdcMint) {
      setUsdcBalance(null);
      setUsdcError("USDC mint not configured");
      setUsdcLoading(false);
      fetchUsdc = Promise.resolve();
    } else {
      const mintPubkey = new PublicKey(DEVNET_DEPLOYMENT.usdcMint);
      const userAta = getUserAta(activePubkey, mintPubkey);
      fetchUsdc = withTimeout(connection.getTokenAccountBalance(userAta), 8000, "RPC timeout")
        .then((tokenBalance) => {
          setUsdcBalance(tokenBalance.value.uiAmount ?? 0);
          setUsdcError(null);
        })
        .catch((err) => {
          const msg = String(err?.message || "").toLowerCase();
          if (msg.includes("could not find account") || msg.includes("account not found") || msg.includes("does not exist")) {
            setUsdcBalance(0);
            setUsdcError(null);
          } else if (msg.includes("429")) {
            setUsdcError("RPC 429 Rate limited");
          } else if (msg.includes("401")) {
            setUsdcError("RPC 401 Unauthorized");
          } else {
            setUsdcError("RPC timeout");
          }
        })
        .finally(() => setUsdcLoading(false));
    }

    const fetchPortfolio = deriveUserPortfolioAddress(activePubkey)
      .then(async (portfolioAddress) => {
        setPortfolioPubkeyStr(portfolioAddress.toBase58());
        const accInfo = await withTimeout(connection.getAccountInfo(portfolioAddress), 8000, "RPC timeout");
        if (accInfo && accInfo.data.length >= DEVNET_DEPLOYMENT.portfolioAccountLen) {
          setHasPortfolio(true);
          const summary = decodePortfolioSummary(accInfo.data);
          setPortfolioData(summary);
        } else {
          setHasPortfolio(false);
          setPortfolioData(null);
        }
      })
      .catch((e) => {
        console.warn("Portfolio check:", e);
      });

    await Promise.allSettled([fetchSol, fetchUsdc, fetchPortfolio]);
  }, [activePubkey, connection]);

  useEffect(() => {
    refreshAccountState();
    const interval = setInterval(refreshAccountState, 10000);
    return () => clearInterval(interval);
  }, [refreshAccountState]);

  // Connect helper: Direct Phantom fallback
  async function connectDirectPhantom() {
    setConnecting("Phantom");
    setError(null);
    try {
      if (typeof window === "undefined" || !(window as any).solana) {
        throw new Error("Phantom extension not detected in this browser. Please install Phantom or use Privy.");
      }
      const resp = await (window as any).solana.connect();
      const pubkey = resp.publicKey.toBase58();
      setDirectPhantomAddress(pubkey);
      localStorage.setItem("moxie_direct_phantom", pubkey);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to connect to Phantom.");
    } finally {
      setConnecting(null);
    }
  }

  // Connect helper: Privy
  function connectPrivy() {
    setConnecting("Privy");
    setError(null);
    try {
      privy.login();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open Privy modal. Please try Phantom directly.");
    } finally {
      setConnecting(null);
    }
  }

  // Disconnect helper
  async function disconnectActive() {
    try {
      if (external.connected) await external.disconnect();
      if (privy.authenticated) await privy.logout();
      setDirectPhantomAddress(null);
      if (typeof window !== "undefined") {
        localStorage.removeItem("moxie_direct_phantom");
      }
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not disconnect wallet.");
    }
  }

  // Action: Create Trading Account (InitPortfolio)
  async function handleCreatePortfolio() {
    if (!activePubkey) return;
    if (!DEVNET_DEPLOYMENT.marketAccount) {
      setError("Market account not configured (set MOXIE_MARKET_ACCOUNT on Vercel).");
      return;
    }

    if (solBalance === null || solBalance < 0.05) {
      setError("Insufficient SOL for rent exemption (~0.08 SOL required). Please click 'Get Devnet SOL' first.");
      return;
    }

    setIsCreatingPortfolio(true);
    setError(null);
    setActionSuccess(null);

    try {
      const percolatorProgramId = new PublicKey(DEVNET_DEPLOYMENT.percolatorProgramId);
      const marketAccount = new PublicKey(DEVNET_DEPLOYMENT.marketAccount);
      const portfolioPubkey = await deriveUserPortfolioAddress(activePubkey);

      const rent = await withTimeout(
        connection.getMinimumBalanceForRentExemption(DEVNET_DEPLOYMENT.portfolioAccountLen),
        8000,
        "Devnet RPC timeout getting rent exemption"
      );
      const tx = new Transaction();

      // 1. Create account with seed
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

      // 2. InitPortfolio instruction (tag 1)
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
      const explorerUrl = `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
      if (typeof window !== "undefined") {
        localStorage.setItem(`moxie_portfolio_${activeAddress}`, portfolioPubkey.toBase58());
      }
      setHasPortfolio(true);
      setPortfolioPubkeyStr(portfolioPubkey.toBase58());
      setActionSuccess({
        message: `Trading account initialized! Portfolio: ${shortAddress(portfolioPubkey.toBase58())}`,
        signature: sig,
        explorerUrl,
      });
      await refreshAccountState();
    } catch (err: any) {
      console.error("InitPortfolio error:", err);
      setError(err?.message || "Failed to initialize portfolio account.");
    } finally {
      setIsCreatingPortfolio(false);
    }
  }

  // Action: Faucet SOL
  async function handleFaucetSol() {
    if (!activeAddress) return;
    if (faucetConfigured === false) {
      setError("Faucet keypair not configured (set DEVNET_PAYER_SECRET on Vercel)");
      return;
    }

    setIsAirdroppingSol(true);
    setError(null);
    setActionSuccess(null);

    try {
      const res = await fetch("/api/faucet/sol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: activeAddress }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "SOL faucet request failed.");
      }

      setActionSuccess({
        message: `Transferred ${data.amount || "0.1 SOL"}!`,
        signature: data.signature,
        explorerUrl: data.explorerUrl,
      });
      await refreshAccountState();
    } catch (err: any) {
      setError(err.message || "Failed to request Devnet SOL.");
    } finally {
      setIsAirdroppingSol(false);
    }
  }

  // Action: Faucet 500 Test USDC
  async function handleFaucetUsdc() {
    if (!activeAddress) return;
    if (faucetConfigured === false) {
      setError("Faucet keypair not configured (set DEVNET_PAYER_SECRET on Vercel)");
      return;
    }

    setFaucetUsdcLoading(true);
    setError(null);
    setActionSuccess(null);

    try {
      const res = await fetch("/api/faucet/usdc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: activeAddress }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "USDC faucet request failed.");
      }

      setActionSuccess({
        message: `Minted 500 Test USDC!`,
        signature: data.signature,
        explorerUrl: data.explorerUrl,
      });
      await refreshAccountState();
    } catch (err: any) {
      setError(err.message || "Failed to request Test USDC.");
    } finally {
      setFaucetUsdcLoading(false);
    }
  }

  // Action: Deposit Margin into Percolator
  async function handleDepositMargin() {
    if (!activePubkey) return;
    setIsDepositing(true);
    setError(null);
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
      setActionSuccess({
        message: `Deposited $100 Margin!`,
        signature: sig,
        explorerUrl: `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
      });
      await refreshAccountState();
    } catch (err: any) {
      console.error("Deposit error:", err);
      setError(err?.message || "Failed to deposit margin.");
    } finally {
      setIsDepositing(false);
    }
  }

  function copyAddress() {
    if (activeAddress) {
      navigator.clipboard.writeText(activeAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const faucetDisabledTitle = faucetConfigured === false
    ? "Faucet keypair not configured (set DEVNET_PAYER_SECRET on Vercel)"
    : undefined;

  return (
    <>
      <button
        className={`wallet-button${activeAddress ? " connected" : ""}`}
        type="button"
        onClick={() => {
          setError(null);
          setActionSuccess(null);
          setOpen(true);
        }}
        aria-haspopup="dialog"
      >
        <Wallet size={15} aria-hidden="true" />
        {activeAddress ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontWeight: 600 }}>{shortAddress(activeAddress)}</span>
            <span style={{ opacity: 0.75, fontSize: "11px" }}>
              {solBalance !== null ? `${solBalance.toFixed(2)} SOL` : solLoading ? "…" : "0 SOL"}
            </span>
            <span style={{ opacity: 0.75, fontSize: "11px" }}>
              {usdcBalance !== null ? `$${usdcBalance.toFixed(0)} USDC` : usdcLoading ? "…" : "$0 USDC"}
            </span>
            <span
              style={{
                fontSize: "10px",
                fontWeight: 700,
                padding: "2px 6px",
                borderRadius: "3px",
                background: hasPortfolio ? "rgba(199,255,74,0.18)" : "rgba(255,180,0,0.18)",
                color: hasPortfolio ? "#c7ff4a" : "#ffb400",
              }}
            >
              {hasPortfolio ? "Portfolio Active" : "No Portfolio"}
            </span>
          </span>
        ) : (
          <span>Connect Devnet Wallet</span>
        )}
      </button>

      {open ? (
        <div className="wallet-modal-overlay" role="presentation" onClick={() => setOpen(false)}>
          <section
            className="wallet-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-title"
            onClick={(event) => event.stopPropagation()}
            style={{ maxWidth: "440px" }}
          >
            <header className="wallet-modal-header">
              <div>
                <span className="wallet-modal-badge">Solana Devnet</span>
                <h2 id="wallet-title" style={{ fontSize: "18px" }}>
                  {activeAddress ? "Account & Balances" : "Connect Wallet"}
                </h2>
              </div>
              <button
                className="wallet-close"
                type="button"
                ref={closeButtonRef}
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </header>

            {activeAddress ? (
              <div className="wallet-account-details" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* Pubkey bar */}
                <div style={{ background: "rgba(255,255,255,0.04)", padding: "10px 14px", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <small style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", display: "block" }}>CONNECTED WALLET</small>
                    <code style={{ fontSize: "12px", color: "#c7ff4a" }}>{shortAddress(activeAddress)}</code>
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={copyAddress}
                      title="Copy Address"
                      style={{ background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "4px", padding: "4px 8px", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", fontSize: "11px" }}
                    >
                      {copied ? <Check size={12} color="#c7ff4a" /> : <Copy size={12} />}
                      <span>{copied ? "Copied" : "Copy"}</span>
                    </button>
                    <a
                      href={`https://explorer.solana.com/address/${activeAddress}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="View on Solana Explorer"
                      style={{ background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "4px", padding: "4px 8px", color: "#fff", display: "flex", alignItems: "center" }}
                    >
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>

                {/* Balances Card */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  {/* SOL Balance */}
                  <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", padding: "10px 12px", borderRadius: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <small style={{ color: "rgba(255,255,255,0.5)", fontSize: "11px" }}>Devnet SOL</small>
                      <button
                        type="button"
                        onClick={refreshAccountState}
                        title="Retry RPC Balances"
                        style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", padding: 0, cursor: "pointer" }}
                      >
                        <RefreshCw size={11} className={solLoading ? "animate-spin" : ""} />
                      </button>
                    </div>

                    <div style={{ marginTop: "4px", minHeight: "24px" }}>
                      {solBalance !== null ? (
                        <strong style={{ fontSize: "16px", color: "#fff" }}>
                          {solBalance.toFixed(3)} SOL
                        </strong>
                      ) : solError ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <span style={{ fontSize: "12px", color: "#ff8474" }}>{solError}</span>
                          <button
                            type="button"
                            onClick={refreshAccountState}
                            style={{ fontSize: "10px", color: "#c7ff4a", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}
                          >
                            Retry
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>Loading...</span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleFaucetSol}
                      disabled={isAirdroppingSol || faucetConfigured === false}
                      title={faucetDisabledTitle}
                      style={{
                        marginTop: "8px",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "11px",
                        color: faucetConfigured === false ? "rgba(255,255,255,0.3)" : "#c7ff4a",
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: faucetConfigured === false ? "not-allowed" : "pointer",
                      }}
                    >
                      {isAirdroppingSol ? <Loader2 size={11} className="animate-spin" /> : <Coins size={11} />}
                      <span>{isAirdroppingSol ? "Transferring..." : "Get Devnet SOL"}</span>
                    </button>
                  </div>

                  {/* USDC Balance */}
                  <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", padding: "10px 12px", borderRadius: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <small style={{ color: "rgba(255,255,255,0.5)", fontSize: "11px" }}>Test USDC Balance</small>
                      <button
                        type="button"
                        onClick={refreshAccountState}
                        title="Retry RPC Balances"
                        style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", padding: 0, cursor: "pointer" }}
                      >
                        <RefreshCw size={11} className={usdcLoading ? "animate-spin" : ""} />
                      </button>
                    </div>

                    <div style={{ marginTop: "4px", minHeight: "24px" }}>
                      {usdcBalance !== null ? (
                        <strong style={{ fontSize: "16px", color: "#fff" }}>
                          ${usdcBalance.toFixed(2)}
                        </strong>
                      ) : usdcError ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <span style={{ fontSize: "11px", color: usdcError === "USDC mint not configured" ? "#ffb400" : "#ff8474" }}>
                            {usdcError}
                          </span>
                          {usdcError !== "USDC mint not configured" && (
                            <button
                              type="button"
                              onClick={refreshAccountState}
                              style={{ fontSize: "10px", color: "#c7ff4a", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}
                            >
                              Retry
                            </button>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>Loading...</span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleFaucetUsdc}
                      disabled={faucetUsdcLoading || faucetConfigured === false}
                      title={faucetDisabledTitle}
                      style={{
                        marginTop: "8px",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "11px",
                        color: faucetConfigured === false ? "rgba(255,255,255,0.3)" : "#c7ff4a",
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: faucetConfigured === false ? "not-allowed" : "pointer",
                      }}
                    >
                      {faucetUsdcLoading ? <Loader2 size={11} className="animate-spin" /> : <Coins size={11} />}
                      <span>{faucetUsdcLoading ? "Minting..." : "Get 500 Test USDC"}</span>
                    </button>
                  </div>
                </div>

                {faucetConfigured === false && (
                  <div style={{ fontSize: "11px", color: "#ffb400", background: "rgba(255,180,0,0.08)", border: "1px solid rgba(255,180,0,0.2)", borderRadius: "4px", padding: "6px 10px" }}>
                    Faucet keypair not configured (set DEVNET_PAYER_SECRET on Vercel)
                  </div>
                )}

                {/* Portfolio Status Section */}
                <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", padding: "12px 14px", borderRadius: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <ShieldCheck size={14} color={hasPortfolio ? "#c7ff4a" : "#ffb400"} />
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "#fff" }}>Percolator Portfolio</span>
                    </div>
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: "3px",
                        background: hasPortfolio ? "rgba(199,255,74,0.15)" : "rgba(255,180,0,0.15)",
                        color: hasPortfolio ? "#c7ff4a" : "#ffb400",
                      }}
                    >
                      {hasPortfolio ? "Created & Verified" : "Not Initialized"}
                    </span>
                  </div>

                  {hasPortfolio ? (
                    <div>
                      <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)", margin: "0 0 10px", lineHeight: 1.4 }}>
                        Your on-chain trading account is active. Deposited margin backs your 1× isolated perp positions.
                      </p>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", background: "rgba(0,0,0,0.3)", padding: "8px 10px", borderRadius: "4px", marginBottom: "10px" }}>
                        <div>
                          <small style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)" }}>Account Capital</small>
                          <strong style={{ fontSize: "13px", color: "#c7ff4a", display: "block" }}>
                            ${portfolioData ? (Number(portfolioData.capital) / 1e6).toFixed(2) : "0.00"}
                          </strong>
                        </div>
                        <div>
                          <small style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)" }}>Account Equity</small>
                          <strong style={{ fontSize: "13px", color: "#fff", display: "block" }}>
                            ${portfolioData ? (Number(portfolioData.equity) / 1e6).toFixed(2) : "0.00"}
                          </strong>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleDepositMargin}
                        disabled={isDepositing || (usdcBalance ?? 0) < 100}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          background: "rgba(199,255,74,0.15)",
                          border: "1px solid rgba(199,255,74,0.3)",
                          color: "#c7ff4a",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: (usdcBalance ?? 0) < 100 ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                        }}
                      >
                        {isDepositing ? <Loader2 size={12} className="animate-spin" /> : <ArrowDownLeft size={12} />}
                        <span>Deposit $100 Margin</span>
                      </button>
                    </div>
                  ) : (
                    <div>
                      <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)", margin: "0 0 10px", lineHeight: 1.4 }}>
                        Create a Percolator portfolio PDA on Solana Devnet to open perp positions. Requires ~0.08 SOL rent exemption.
                      </p>

                      <button
                        type="button"
                        onClick={handleCreatePortfolio}
                        disabled={isCreatingPortfolio}
                        style={{
                          width: "100%",
                          padding: "10px 14px",
                          background: "#c7ff4a",
                          border: "none",
                          color: "#000",
                          borderRadius: "4px",
                          fontSize: "13px",
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                        }}
                      >
                        {isCreatingPortfolio ? <Loader2 size={13} className="animate-spin" /> : <PlusCircle size={13} />}
                        <span>{isCreatingPortfolio ? "Signing Transaction..." : "InitPortfolio (1 Click)"}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Feedback Messages */}
                {actionSuccess && (
                  <div style={{ background: "rgba(199,255,74,0.1)", border: "1px solid rgba(199,255,74,0.3)", borderRadius: "6px", padding: "10px 12px", fontSize: "12px", color: "#c7ff4a" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                      <Check size={14} />
                      <strong style={{ color: "#fff" }}>{actionSuccess.message}</strong>
                    </div>
                    {actionSuccess.explorerUrl && (
                      <a
                        href={actionSuccess.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#c7ff4a", textDecoration: "underline", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", marginTop: "2px" }}
                      >
                        <span>View Transaction on Solana Explorer</span>
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                )}

                {error && (
                  <div style={{ background: "rgba(255,77,77,0.1)", border: "1px solid rgba(255,77,77,0.3)", borderRadius: "6px", padding: "10px 12px", fontSize: "12px", color: "#ff8474", display: "flex", alignItems: "flex-start", gap: "6px" }}>
                    <AlertTriangle size={14} style={{ marginTop: "2px", flexShrink: 0 }} />
                    <div>
                      <span>{error}</span>
                    </div>
                  </div>
                )}

                {/* Disconnect Button */}
                <button
                  type="button"
                  onClick={disconnectActive}
                  style={{
                    width: "100%",
                    padding: "8px",
                    background: "none",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "rgba(255,255,255,0.7)",
                    borderRadius: "4px",
                    fontSize: "12px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                  }}
                >
                  <LogOut size={13} />
                  <span>Disconnect Wallet</span>
                </button>
              </div>
            ) : (
              /* Connect Options */
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {error && (
                  <div style={{ background: "rgba(255,77,77,0.1)", border: "1px solid rgba(255,77,77,0.3)", borderRadius: "6px", padding: "10px", fontSize: "12px", color: "#ff8474", display: "flex", alignItems: "center", gap: "6px" }}>
                    <AlertTriangle size={14} />
                    <span>{error}</span>
                  </div>
                )}

                {/* Option 1: Direct Phantom Fallback */}
                <button
                  type="button"
                  onClick={connectDirectPhantom}
                  disabled={connecting !== null}
                  style={{
                    padding: "14px 16px",
                    background: "#c7ff4a",
                    border: "none",
                    borderRadius: "6px",
                    color: "#000",
                    fontWeight: 700,
                    fontSize: "14px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <Wallet size={18} />
                    <span>Connect Phantom (Devnet)</span>
                  </div>
                  {connecting === "Phantom" ? <Loader2 size={16} className="animate-spin" /> : <span>→</span>}
                </button>

                {/* Option 2: Privy (Embedded / Social) */}
                <button
                  type="button"
                  onClick={connectPrivy}
                  disabled={connecting !== null}
                  style={{
                    padding: "14px 16px",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "6px",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: "14px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <ShieldCheck size={18} color="#c7ff4a" />
                    <span>Privy (Email / Embedded Solana)</span>
                  </div>
                  {connecting === "Privy" ? <Loader2 size={16} className="animate-spin" /> : <span>→</span>}
                </button>

                <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", margin: "8px 0 0", textAlign: "center", lineHeight: 1.4 }}>
                  Solana Devnet only • Free mock USDC & SOL available once connected.
                </p>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
