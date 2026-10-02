"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
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
} from "lucide-react";
import { usePrivyWalletState } from "./wallet-providers";
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
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [faucetNotice, setFaucetNotice] = useState<string | null>(null);

  // Direct window.solana (Phantom) fallback state
  const [directPhantomAddress, setDirectPhantomAddress] = useState<string | null>(null);

  // Balances
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [solLoading, setSolLoading] = useState(false);
  const [solError, setSolError] = useState<string | null>(null);

  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [usdcLoading, setUsdcLoading] = useState(false);
  const [usdcError, setUsdcError] = useState<string | null>(null);

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const privy = usePrivyWalletState();
  const external = useWallet();
  const { connection } = useConnection();

  // Restore direct phantom session from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("moxie_direct_phantom");
      if (saved) {
        setDirectPhantomAddress(saved);
      }
    }
  }, []);

  const activeAddress =
    privy.address ||
    (external.connected && external.publicKey ? external.publicKey.toBase58() : null) ||
    directPhantomAddress ||
    null;

  const activePubkey = useMemo(() => {
    if (!activeAddress) return null;
    try {
      return new PublicKey(activeAddress);
    } catch {
      return null;
    }
  }, [activeAddress]);

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
  async function connectDirectPhantom() {
    setConnecting("Phantom");
    setError(null);
    try {
      if (typeof window === "undefined" || !(window as any).solana) {
        throw new Error("Phantom extension not detected. Please install Phantom or use Privy.");
      }
      const resp = await (window as any).solana.connect();
      const pubkey = resp.publicKey.toBase58();
      setDirectPhantomAddress(pubkey);
      localStorage.setItem("moxie_direct_phantom", pubkey);
      setOpen(false);
    } catch (cause: any) {
      setError(cause instanceof Error ? cause.message : "Failed to connect to Phantom.");
    } finally {
      setConnecting(null);
    }
  }

  // Connect Privy
  function connectPrivy() {
    setConnecting("Privy");
    setError(null);
    try {
      privy.login();
    } catch (cause: any) {
      setError(cause instanceof Error ? cause.message : "Could not open login modal.");
    } finally {
      setConnecting(null);
    }
  }

  // Disconnect
  async function disconnectActive() {
    try {
      if (external.connected) await external.disconnect();
      if (privy.authenticated) await privy.logout();
      setDirectPhantomAddress(null);
      if (typeof window !== "undefined") {
        localStorage.removeItem("moxie_direct_phantom");
      }
      setOpen(false);
    } catch (cause: any) {
      setError(cause instanceof Error ? cause.message : "Could not disconnect wallet.");
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
    setFaucetNotice("Address copied! Opening Solana faucet in new tab...");
    window.open("https://faucet.solana.com", "_blank", "noopener,noreferrer");
    setTimeout(() => setFaucetNotice(null), 4000);
  }

  return (
    <>
      <button
        className={`wallet-button${activeAddress ? " connected" : ""}`}
        type="button"
        onClick={() => {
          setError(null);
          setFaucetNotice(null);
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
            style={{ maxWidth: "400px" }}
          >
            <header className="wallet-modal-header">
              <div>
                <span className="wallet-modal-badge">Solana Devnet</span>
                <h2 id="wallet-title" style={{ fontSize: "18px" }}>
                  {activeAddress ? "Connected Wallet" : "Connect Wallet"}
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
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* Address Bar */}
                <div style={{ background: "rgba(255,255,255,0.04)", padding: "10px 14px", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <small style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", display: "block" }}>WALLET ADDRESS</small>
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
                      <span>Get devnet SOL ↗</span>
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

                    <p style={{ margin: "8px 0 0", fontSize: "10px", color: "rgba(255,255,255,0.5)", lineHeight: 1.3 }}>
                      Test USDC is added after your trading account exists.
                    </p>
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
                    <span>Connect Phantom</span>
                  </div>
                  {connecting === "Phantom" ? <Loader2 size={16} className="animate-spin" /> : <span>→</span>}
                </button>

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
                    <span>Privy (Email / Google)</span>
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
