"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  Check,
  LogOut,
  Wallet,
  X,
  ExternalLink,
  Copy,
  RefreshCw,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  Coins,
} from "lucide-react";
import { useUnifiedWallet } from "./wallet-providers";
import { DEVNET_DEPLOYMENT, getUserAta } from "@/lib/contracts";

function shortAddress(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs = 8000, errorMsg = "RPC timeout"): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), timeoutMs)),
  ]);
}

export function WalletControl() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [faucetNotice, setFaucetNotice] = useState<string | null>(null);
  const [isFaucetLoading, setIsFaucetLoading] = useState(false);
  const [isFaucetDisabled, setIsFaucetDisabled] = useState(false);

  // Balances
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [solLoading, setSolLoading] = useState(false);
  const [solError, setSolError] = useState<string | null>(null);

  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [usdcLoading, setUsdcLoading] = useState(false);
  const [usdcError, setUsdcError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/faucet/usdc")
      .then((r) => r.json())
      .then((d) => {
        if (d && d.configured === false) setIsFaucetDisabled(true);
      })
      .catch(() => {});
  }, []);

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const wallet = useUnifiedWallet();
  const { connection } = useConnection();

  const activeAddress = wallet.activeAddress;
  const activePubkey = wallet.activePubkey;

  // Fetch balances
  const refreshAccountState = useCallback(async () => {
    if (!activePubkey) {
      setSolBalance(null);
      setUsdcBalance(null);
      return;
    }

    setSolLoading(true);
    setUsdcLoading(true);
    setSolError(null);
    setUsdcError(null);

    // 1. Try fast server route
    try {
      const res = await withTimeout(
        fetch(`/api/account-state?address=${activePubkey.toBase58()}`, { cache: "no-store" }),
        5000,
        "Server state timeout"
      );
      if (res.ok) {
        const data = await res.json();
        setSolBalance(data.sol !== null && data.sol !== undefined ? data.sol : null);
        setSolError(data.solError || null);
        setUsdcBalance(data.usdc !== null && data.usdc !== undefined ? data.usdc : null);
        setUsdcError(data.usdcError || null);
        setSolLoading(false);
        setUsdcLoading(false);
        return;
      }
    } catch {
      // Fall through to direct RPC
    }

    // 2. Direct client RPC
    try {
      const lamports = await withTimeout(connection.getBalance(activePubkey), 8000, "RPC timeout");
      setSolBalance(lamports / LAMPORTS_PER_SOL);
      setSolError(null);
    } catch (err: any) {
      const msg = String(err?.message || "");
      if (msg.includes("429")) setSolError("RPC Rate limited");
      else setSolError("RPC timeout");
    } finally {
      setSolLoading(false);
    }

    if (DEVNET_DEPLOYMENT.usdcMint) {
      try {
        const mintPubkey = new PublicKey(DEVNET_DEPLOYMENT.usdcMint);
        const userAta = getUserAta(activePubkey, mintPubkey);
        const tokenBalance = await withTimeout(connection.getTokenAccountBalance(userAta), 8000, "RPC timeout");
        setUsdcBalance(tokenBalance.value.uiAmount ?? 0);
        setUsdcError(null);
      } catch (err: any) {
        const msg = String(err?.message || "").toLowerCase();
        if (msg.includes("could not find account") || msg.includes("account not found") || msg.includes("does not exist")) {
          setUsdcBalance(0);
          setUsdcError(null);
        } else {
          setUsdcError("RPC timeout");
        }
      } finally {
        setUsdcLoading(false);
      }
    } else {
      setUsdcBalance(0);
      setUsdcLoading(false);
    }
  }, [activePubkey, connection]);

  useEffect(() => {
    refreshAccountState();
    const interval = setInterval(refreshAccountState, 10000);
    return () => clearInterval(interval);
  }, [refreshAccountState]);

  // Connect Phantom
  async function connectPhantom() {
    setError(null);
    try {
      await wallet.connectPhantom();
      setOpen(false);
    } catch (cause: any) {
      setError(cause?.message || "Failed to connect Phantom.");
    }
  }

  // Connect Privy
  function connectPrivy() {
    setError(null);
    try {
      wallet.connectPrivy();
    } catch (cause: any) {
      setError(cause?.message || "Could not open login modal.");
    }
  }

  // Disconnect
  async function disconnectActive() {
    try {
      await wallet.disconnect();
      setOpen(false);
      setSolBalance(null);
      setUsdcBalance(null);
    } catch (cause: any) {
      setError(cause?.message || "Failed to disconnect.");
    }
  }

  function copyAddress() {
    if (activeAddress) {
      navigator.clipboard.writeText(activeAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleGetDevnetSol() {
    if (!activeAddress) return;
    copyAddress();
    setFaucetNotice("Address copied. Opening Solana faucet in new tab...");
    window.open("https://faucet.solana.com", "_blank", "noopener,noreferrer");
    setTimeout(() => setFaucetNotice(null), 4000);
  }

  async function handleGetTestUsdc() {
    if (!activeAddress) return;
    setIsFaucetLoading(true);
    setFaucetNotice(null);
    try {
      const res = await fetch("/api/faucet/usdc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: activeAddress }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFaucetNotice(
          data.signature
            ? `500 Test USDC minted! Tx: ${data.signature.slice(0, 8)}...`
            : "500 Test USDC minted! Refreshing balance..."
        );
        await refreshAccountState();
      } else {
        if (res.status === 503 || data?.unconfigured) {
          setIsFaucetDisabled(true);
        }
        setFaucetNotice(data?.error || "Could not claim test USDC.");
      }
    } catch (err: any) {
      setFaucetNotice(err?.message || "Could not claim test USDC.");
    } finally {
      setIsFaucetLoading(false);
      setTimeout(() => setFaucetNotice(null), 8000);
    }
  }

  const isConnected = Boolean(activeAddress);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="wallet-button"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 14px",
          background: isConnected ? "rgba(199,255,74,0.1)" : "#c7ff4a",
          border: isConnected ? "1px solid rgba(199,255,74,0.3)" : "none",
          borderRadius: "4px",
          color: isConnected ? "#c7ff4a" : "#000",
          fontWeight: 600,
          fontSize: "13px",
          cursor: "pointer",
        }}
      >
        <Wallet size={14} />
        <span>{isConnected ? shortAddress(activeAddress!) : "Connect Wallet"}</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <section
            aria-labelledby="wallet-panel-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#0c1012",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "8px",
              padding: "24px",
              width: "100%",
              maxWidth: "420px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
              position: "relative",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 id="wallet-panel-title" style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#fff" }}>
                {isConnected ? "Devnet Wallet" : "Connect Wallet"}
              </h2>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", padding: "4px" }}
              >
                <X size={16} />
              </button>
            </div>

            {isConnected ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* Connected Info */}
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", padding: "12px 14px", borderRadius: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <small style={{ color: "rgba(255,255,255,0.5)", fontSize: "11px" }}>CONNECTED ADDRESS</small>
                    <span style={{ fontSize: "10px", color: "#c7ff4a", fontWeight: 700, textTransform: "uppercase" }}>
                      {wallet.walletType || "Devnet"}
                    </span>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                    <code style={{ fontSize: "13px", color: "#fff", wordBreak: "break-all" }}>
                      {shortAddress(activeAddress!)}
                    </code>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        type="button"
                        onClick={copyAddress}
                        title="Copy Address"
                        style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", padding: "2px" }}
                      >
                        {copied ? <Check size={14} color="#c7ff4a" /> : <Copy size={14} />}
                      </button>
                      <a
                        href={`https://explorer.solana.com/address/${activeAddress}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="View on Solana Explorer"
                        style={{ color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center" }}
                      >
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  </div>
                </div>

                {/* Balances Grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  {/* Devnet SOL */}
                  <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", padding: "12px", borderRadius: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <small style={{ color: "rgba(255,255,255,0.5)", fontSize: "11px" }}>Devnet SOL</small>
                      <button
                        type="button"
                        onClick={refreshAccountState}
                        title="Retry Balance"
                        style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", padding: 0, cursor: "pointer" }}
                      >
                        <RefreshCw size={11} className={solLoading ? "animate-spin" : ""} />
                      </button>
                    </div>

                    <div style={{ marginTop: "4px", minHeight: "22px" }}>
                      {solBalance !== null ? (
                        <strong style={{ fontSize: "16px", color: "#fff" }}>
                          {solBalance.toFixed(3)} SOL
                        </strong>
                      ) : solError ? (
                        <span style={{ fontSize: "12px", color: "#ff8474" }}>{solError}</span>
                      ) : (
                        <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>Loading...</span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleGetDevnetSol}
                      style={{
                        marginTop: "10px",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "#c7ff4a",
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        textDecoration: "underline",
                      }}
                    >
                      <span>Get devnet SOL</span>
                    </button>
                  </div>

                  {/* Test USDC */}
                  <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", padding: "12px", borderRadius: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <small style={{ color: "rgba(255,255,255,0.5)", fontSize: "11px" }}>Test USDC</small>
                      <button
                        type="button"
                        onClick={refreshAccountState}
                        title="Retry Balance"
                        style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", padding: 0, cursor: "pointer" }}
                      >
                        <RefreshCw size={11} className={usdcLoading ? "animate-spin" : ""} />
                      </button>
                    </div>

                    <div style={{ marginTop: "4px", minHeight: "22px" }}>
                      {usdcBalance !== null ? (
                        <strong style={{ fontSize: "16px", color: "#fff" }}>
                          ${usdcBalance.toFixed(2)}
                        </strong>
                      ) : usdcError ? (
                        <span style={{ fontSize: "12px", color: "#ff8474" }}>{usdcError}</span>
                      ) : (
                        <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>Loading...</span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleGetTestUsdc}
                      disabled={isFaucetLoading || isFaucetDisabled}
                      style={{
                        marginTop: "10px",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "#c7ff4a",
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: (isFaucetLoading || isFaucetDisabled) ? "not-allowed" : "pointer",
                        opacity: isFaucetDisabled ? 0.5 : 1,
                        textDecoration: "underline",
                      }}
                    >
                      {isFaucetLoading ? <Loader2 size={11} className="animate-spin" /> : <Coins size={11} />}
                      <span>Get 500 test USDC</span>
                    </button>
                  </div>
                </div>

                {faucetNotice && (
                  <div style={{ background: "rgba(199,255,74,0.1)", border: "1px solid rgba(199,255,74,0.3)", borderRadius: "6px", padding: "8px 12px", fontSize: "12px", color: "#c7ff4a" }}>
                    {faucetNotice}
                  </div>
                )}

                {error && (
                  <div style={{ background: "rgba(255,77,77,0.1)", border: "1px solid rgba(255,77,77,0.3)", borderRadius: "6px", padding: "10px 12px", fontSize: "12px", color: "#ff8474", display: "flex", alignItems: "flex-start", gap: "6px" }}>
                    <AlertTriangle size={14} style={{ marginTop: "2px", flexShrink: 0 }} />
                    <span>{error}</span>
                  </div>
                )}

                {/* Disconnect */}
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

                <button
                  type="button"
                  onClick={connectPhantom}
                  disabled={wallet.isConnecting}
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
                    <span>Connect Phantom</span>
                  </div>
                  {wallet.isConnecting ? <Loader2 size={16} className="animate-spin" /> : <span> </span>}
                </button>

                <button
                  type="button"
                  onClick={connectPrivy}
                  disabled={wallet.isConnecting}
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
                    <span>Privy (Email / Google)</span>
                  </div>
                  {wallet.isConnecting ? <Loader2 size={16} className="animate-spin" /> : <span> </span>}
                </button>

                <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", margin: "8px 0 0", textAlign: "center", lineHeight: 1.4 }}>
                  Solana Devnet only   Free mock USDC & SOL available once connected.
                </p>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
