"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  Check,
  ChevronRight,
  LogOut,
  Mail,
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

export function WalletControl() {
  const [open, setOpen] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Balances & Onchain state
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [hasPortfolio, setHasPortfolio] = useState<boolean | null>(null);
  const [portfolioData, setPortfolioData] = useState<any | null>(null);
  const [isCreatingPortfolio, setIsCreatingPortfolio] = useState(false);
  const [isDepositing, setIsDepositing] = useState(false);
  const [isAirdropping, setIsAirdropping] = useState(false);
  const [faucetLoading, setFaucetLoading] = useState(false);

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const privy = usePrivyWalletState();
  const external = useWallet();
  const { connection } = useConnection();

  const externalWallets = useMemo(
    () => external.wallets.filter(({ adapter }) => !adapter.name.toLowerCase().includes("privy")),
    [external.wallets]
  );
  const externalAddress = external.publicKey?.toBase58() ?? null;
  const activeAddress = externalAddress ?? privy.address;
  const activeLabel = externalAddress ? external.wallet?.adapter.name : privy.address ? "Privy" : null;

  const activePubkey = useMemo(() => {
    if (!activeAddress) return null;
    try {
      return new PublicKey(activeAddress);
    } catch {
      return null;
    }
  }, [activeAddress]);

  // Refresh balances & portfolio state
  const refreshAccountState = useCallback(async () => {
    if (!activePubkey || !connection) return;

    try {
      // 1. SOL balance
      const lamports = await connection.getBalance(activePubkey);
      setSolBalance(lamports / LAMPORTS_PER_SOL);

      // 2. USDC ATA balance
      const mintPubkey = new PublicKey(DEVNET_DEPLOYMENT.usdcMint);
      const userAta = getUserAta(activePubkey, mintPubkey);
      try {
        const ataRes = await connection.getTokenAccountBalance(userAta);
        setUsdcBalance(ataRes.value.uiAmount ?? 0);
      } catch {
        setUsdcBalance(0);
      }

      // 3. User Percolator portfolio check
      const portfolioPubkey = await deriveUserPortfolioAddress(activePubkey);
      const portfolioInfo = await connection.getAccountInfo(portfolioPubkey);

      if (portfolioInfo && portfolioInfo.data.length >= 9563) {
        setHasPortfolio(true);
        const decoded = decodePortfolioSummary(new Uint8Array(portfolioInfo.data));
        setPortfolioData(decoded);
      } else {
        setHasPortfolio(false);
        setPortfolioData(null);
      }
    } catch (err) {
      console.warn("Error refreshing account state:", err);
    }
  }, [activePubkey, connection]);

  useEffect(() => {
    if (activePubkey) {
      refreshAccountState();
      const interval = setInterval(refreshAccountState, 10000);
      return () => clearInterval(interval);
    } else {
      setSolBalance(null);
      setUsdcBalance(null);
      setHasPortfolio(null);
      setPortfolioData(null);
    }
  }, [activePubkey, refreshAccountState]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleDialogKeys);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleDialogKeys);
    };
  }, [open]);

  async function connectExternal(name: (typeof externalWallets)[number]["adapter"]["name"]) {
    const choice = externalWallets.find(({ adapter }) => adapter.name === name);
    if (!choice) return;
    setConnecting(name);
    setError(null);
    try {
      external.select(name);
      await choice.adapter.connect();
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not connect ${name}.`);
    } finally {
      setConnecting(null);
    }
  }

  async function disconnectActive() {
    setError(null);
    try {
      if (external.connected) await external.disconnect();
      else if (privy.authenticated) await privy.logout();
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not disconnect the wallet.");
    }
  }

  // Action: Create Trading Account (InitPortfolio)
  async function handleCreatePortfolio() {
    if (!activePubkey) return;
    setIsCreatingPortfolio(true);
    setError(null);
    setActionSuccess(null);

    try {
      const percolatorProgramId = new PublicKey(DEVNET_DEPLOYMENT.percolatorProgramId);
      const marketAccount = new PublicKey(DEVNET_DEPLOYMENT.marketAccount);
      const portfolioPubkey = await deriveUserPortfolioAddress(activePubkey);

      const rent = await connection.getMinimumBalanceForRentExemption(DEVNET_DEPLOYMENT.portfolioAccountLen);
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

      // 2. InitPortfolio instruction
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

      if (!external.sendTransaction) {
        throw new Error("Connected wallet does not support sendTransaction. Please use Phantom, Backpack, or Solflare.");
      }

      const sig = await external.sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");

      setActionSuccess(`Trading account created! Tx: ${sig.slice(0, 8)}...`);
      await refreshAccountState();
    } catch (err: any) {
      console.error("Create portfolio failed:", err);
      setError(err.message || "Failed to create trading account");
    } finally {
      setIsCreatingPortfolio(false);
    }
  }

  // Action: Request Devnet SOL
  async function handleRequestSol() {
    if (!activePubkey) return;
    setIsAirdropping(true);
    setError(null);
    setActionSuccess(null);
    try {
      const sig = await connection.requestAirdrop(activePubkey, 1 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
      setActionSuccess("Received 1 Devnet SOL airdrop!");
      await refreshAccountState();
    } catch (err: any) {
      console.warn("RPC airdrop rate limit, falling back to keeper faucet:", err);
      // Faucet route also airdrops 0.2 SOL if balance is low
      await handleClaimFaucet();
    } finally {
      setIsAirdropping(false);
    }
  }

  // Action: Claim 500 Mock USDC from Faucet
  async function handleClaimFaucet() {
    if (!activePubkey) return;
    setFaucetLoading(true);
    setError(null);
    setActionSuccess(null);
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: activePubkey.toBase58() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Faucet failed");
      setActionSuccess(`Minted 500 Test USDC! Tx: ${data.signature.slice(0, 8)}...`);
      await refreshAccountState();
    } catch (err: any) {
      setError(err.message || "Faucet claim failed");
    } finally {
      setFaucetLoading(false);
    }
  }

  // Action: Quick Deposit 100 USDC to Margin
  async function handleDepositMargin() {
    if (!activePubkey || !portfolioData) return;
    setIsDepositing(true);
    setError(null);
    setActionSuccess(null);

    try {
      const percolatorProgramId = new PublicKey(DEVNET_DEPLOYMENT.percolatorProgramId);
      const marketAccount = new PublicKey(DEVNET_DEPLOYMENT.marketAccount);
      const vaultToken = new PublicKey(DEVNET_DEPLOYMENT.collateralVault);
      const mintPubkey = new PublicKey(DEVNET_DEPLOYMENT.usdcMint);
      const userAta = getUserAta(activePubkey, mintPubkey);
      const portfolioPubkey = await deriveUserPortfolioAddress(activePubkey);

      const amountUSDC = 100;
      const amountAtoms = BigInt(amountUSDC) * 1_000_000n;

      const depositData = buildDepositData(
        portfolioData.portfolioId,
        portfolioData.sequence,
        amountAtoms
      );

      const tx = new Transaction();
      tx.add(
        new TransactionInstruction({
          programId: percolatorProgramId,
          keys: [
            { pubkey: activePubkey, isSigner: true, isWritable: false },
            { pubkey: marketAccount, isSigner: false, isWritable: true },
            { pubkey: portfolioPubkey, isSigner: false, isWritable: true },
            { pubkey: userAta, isSigner: false, isWritable: true },
            { pubkey: vaultToken, isSigner: false, isWritable: true },
            { pubkey: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), isSigner: false, isWritable: false },
          ],
          data: Buffer.from(depositData),
        })
      );

      if (!external.sendTransaction) {
        throw new Error("Connected wallet does not support sendTransaction.");
      }

      const sig = await external.sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");

      setActionSuccess(`Deposited $100 USDC into Margin! Tx: ${sig.slice(0, 8)}...`);
      await refreshAccountState();
    } catch (err: any) {
      console.error("Deposit failed:", err);
      setError(err.message || "Deposit to margin failed");
    } finally {
      setIsDepositing(false);
    }
  }

  const copyAddress = () => {
    if (!activeAddress) return;
    navigator.clipboard.writeText(activeAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const marginUSDC = portfolioData ? Number(portfolioData.capital) / 1_000_000 : 0;

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
        <Wallet size={16} aria-hidden="true" />
        {activeAddress ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <span>{shortAddress(activeAddress)}</span>
            {solBalance !== null && (
              <span style={{ opacity: 0.7, fontSize: "11px" }}>{solBalance.toFixed(2)} SOL</span>
            )}
            {hasPortfolio && (
              <span
                style={{
                  background: "rgba(199, 255, 74, 0.15)",
                  color: "#c7ff4a",
                  padding: "1px 5px",
                  borderRadius: "4px",
                  fontSize: "11px",
                }}
              >
                ${marginUSDC.toFixed(0)}
              </span>
            )}
          </span>
        ) : (
          "Connect"
        )}
      </button>

      {open ? (
        <div
          className="wallet-modal-layer"
          role="presentation"
          onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}
        >
          <section className="wallet-modal" role="dialog" aria-modal="true" aria-labelledby="wallet-modal-title">
            <header>
              <div>
                <span className="wallet-modal-index">
                  CLUSTER / SOLANA DEVNET
                </span>
                <h2 id="wallet-modal-title">{activeAddress ? "Devnet Account" : "Enter Moxie"}</h2>
                <p>
                  {activeAddress
                    ? "Manage your Solana devnet signer & Percolator margin."
                    : "Connect Privy embedded wallet or standard Solana extension."}
                </p>
              </div>
              <button
                ref={closeButtonRef}
                className="wallet-modal-close"
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close wallet dialog"
              >
                <X size={17} aria-hidden="true" />
              </button>
            </header>

            {activeAddress ? (
              <div className="wallet-connected-panel" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {/* Header bar */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="wallet-source">
                    <Check size={13} aria-hidden="true" /> {activeLabel}
                  </span>
                  <span
                    style={{
                      background: "rgba(199, 255, 74, 0.15)",
                      color: "#c7ff4a",
                      fontSize: "11px",
                      padding: "2px 8px",
                      borderRadius: "12px",
                      fontWeight: 600,
                    }}
                  >
                    Devnet Active
                  </span>
                </div>

                {/* Address code & copy */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "rgba(255, 255, 255, 0.04)",
                    padding: "8px 12px",
                    borderRadius: "6px",
                  }}
                >
                  <code style={{ fontSize: "12px", letterSpacing: "0.5px" }}>{shortAddress(activeAddress)}</code>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      onClick={copyAddress}
                      title="Copy Address"
                      style={{ background: "none", border: "none", color: "#c7ff4a", cursor: "pointer" }}
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                    <a
                      href={`https://explorer.solana.com/address/${activeAddress}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                      title="View on Solana Explorer"
                      style={{ color: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center" }}
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>

                {/* Balances Grid */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "8px",
                    marginTop: "4px",
                  }}
                >
                  <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", padding: "10px", borderRadius: "6px" }}>
                    <span style={{ fontSize: "11px", opacity: 0.6 }}>SOL BALANCE</span>
                    <div style={{ fontSize: "16px", fontWeight: 700, margin: "2px 0 6px" }}>
                      {solBalance !== null ? `${solBalance.toFixed(3)} SOL` : "Loading..."}
                    </div>
                    <button
                      type="button"
                      onClick={handleRequestSol}
                      disabled={isAirdropping}
                      style={{
                        fontSize: "11px",
                        padding: "3px 8px",
                        background: "rgba(255,255,255,0.08)",
                        border: "none",
                        borderRadius: "4px",
                        color: "#fff",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      {isAirdropping ? <Loader2 size={11} className="animate-spin" /> : <Coins size={11} />}
                      <span>Airdrop SOL</span>
                    </button>
                  </div>

                  <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", padding: "10px", borderRadius: "6px" }}>
                    <span style={{ fontSize: "11px", opacity: 0.6 }}>WALLET USDC</span>
                    <div style={{ fontSize: "16px", fontWeight: 700, margin: "2px 0 6px" }}>
                      {usdcBalance !== null ? `$${usdcBalance.toFixed(2)}` : "Loading..."}
                    </div>
                    <button
                      type="button"
                      onClick={handleClaimFaucet}
                      disabled={faucetLoading}
                      style={{
                        fontSize: "11px",
                        padding: "3px 8px",
                        background: "rgba(199, 255, 74, 0.12)",
                        border: "1px solid #c7ff4a",
                        borderRadius: "4px",
                        color: "#c7ff4a",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      {faucetLoading ? <Loader2 size={11} className="animate-spin" /> : <Coins size={11} />}
                      <span>Get 500 USDC</span>
                    </button>
                  </div>
                </div>

                {/* Trading Account Section */}
                <div
                  style={{
                    background: hasPortfolio ? "rgba(199, 255, 74, 0.05)" : "rgba(255, 180, 0, 0.05)",
                    border: hasPortfolio ? "1px solid rgba(199, 255, 74, 0.2)" : "1px solid rgba(255, 180, 0, 0.2)",
                    borderRadius: "6px",
                    padding: "12px",
                    marginTop: "4px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                      <ShieldCheck size={14} color={hasPortfolio ? "#c7ff4a" : "#ffb400"} />
                      <span>{hasPortfolio ? "Percolator Trading Portfolio" : "Trading Account Needed"}</span>
                    </span>
                    {hasPortfolio && (
                      <span style={{ fontSize: "11px", opacity: 0.7 }}>
                        ID #{portfolioData?.portfolioId.toString()}
                      </span>
                    )}
                  </div>

                  {hasPortfolio ? (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "6px 0" }}>
                        <span style={{ fontSize: "11px", opacity: 0.7 }}>Active Margin Collateral</span>
                        <strong style={{ fontSize: "16px", color: "#c7ff4a" }}>${marginUSDC.toFixed(2)} USDC</strong>
                      </div>
                      <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                        <button
                          type="button"
                          onClick={handleDepositMargin}
                          disabled={isDepositing || (usdcBalance ?? 0) < 100}
                          style={{
                            flex: 1,
                            padding: "6px 12px",
                            fontSize: "12px",
                            fontWeight: 600,
                            background: "#c7ff4a",
                            color: "#000",
                            border: "none",
                            borderRadius: "4px",
                            cursor: (usdcBalance ?? 0) >= 100 ? "pointer" : "not-allowed",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "6px",
                          }}
                        >
                          {isDepositing ? <Loader2 size={13} className="animate-spin" /> : <ArrowDownLeft size={13} />}
                          <span>Deposit $100 to Margin</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p style={{ fontSize: "11px", opacity: 0.8, margin: "4px 0 10px" }}>
                        Initialize a program-owned portfolio to trade leveraged prediction perps with zero trust.
                      </p>
                      <button
                        type="button"
                        onClick={handleCreatePortfolio}
                        disabled={isCreatingPortfolio || (solBalance ?? 0) < 0.07}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          fontSize: "12px",
                          fontWeight: 600,
                          background: "#c7ff4a",
                          color: "#000",
                          border: "none",
                          borderRadius: "4px",
                          cursor: (solBalance ?? 0) >= 0.07 ? "pointer" : "not-allowed",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                        }}
                      >
                        {isCreatingPortfolio ? <Loader2 size={13} className="animate-spin" /> : <PlusCircle size={13} />}
                        <span>Create Trading Account</span>
                      </button>
                      {(solBalance ?? 0) < 0.07 && (
                        <p style={{ fontSize: "11px", color: "#ffb400", marginTop: "6px" }}>
                          Requires ~0.07 SOL for rent exemption. Use &quot;Airdrop SOL&quot; above first.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {actionSuccess && (
                  <p style={{ fontSize: "11px", color: "#c7ff4a", background: "rgba(199,255,74,0.1)", padding: "6px 10px", borderRadius: "4px" }}>
                    {actionSuccess}
                  </p>
                )}

                {error && (
                  <p className="wallet-error" role="alert" style={{ fontSize: "11px" }}>
                    {error}
                  </p>
                )}

                <button className="wallet-disconnect" type="button" onClick={disconnectActive} style={{ marginTop: "4px" }}>
                  <LogOut size={15} aria-hidden="true" /> Disconnect
                </button>
              </div>
            ) : (
              <div className="wallet-methods">
                <button
                  className="wallet-method featured"
                  type="button"
                  onClick={() => privy.login()}
                  disabled={!privy.enabled || !privy.ready}
                >
                  <span className="wallet-method-icon">
                    <Mail size={18} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>Continue with Privy</strong>
                    <small>Email or Google • devnet wallet created for you</small>
                  </span>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
                {!privy.enabled ? (
                  <p className="wallet-config-note">
                    Privy needs <code>NEXT_PUBLIC_PRIVY_APP_ID</code>. Regular wallets remain available.
                  </p>
                ) : null}

                <div className="wallet-divider">
                  <span>OR USE A SOLANA WALLET</span>
                </div>

                <div className="wallet-list">
                  {externalWallets.length ? (
                    externalWallets.map(({ adapter, readyState }) => {
                      const installed =
                        readyState === WalletReadyState.Installed || readyState === WalletReadyState.Loadable;
                      return (
                        <button
                          className="wallet-method"
                          type="button"
                          key={adapter.name}
                          onClick={() => connectExternal(adapter.name)}
                          disabled={connecting !== null}
                        >
                          <span className="wallet-method-icon wallet-icon-image">
                            <img src={adapter.icon} alt="" />
                          </span>
                          <span>
                            <strong>{adapter.name}</strong>
                            <small>
                              {connecting === adapter.name
                                ? "Waiting for approval…"
                                : installed
                                ? "Detected in this browser"
                                : "Open wallet"}
                            </small>
                          </span>
                          <ChevronRight size={16} aria-hidden="true" />
                        </button>
                      );
                    })
                  ) : (
                    <div className="wallet-empty-state">
                      <Wallet size={18} aria-hidden="true" />
                      <span>
                        <strong>No Solana wallet detected</strong>
                        <small>Install Phantom, Solflare, or Backpack, then reload.</small>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {error && !activeAddress ? <p className="wallet-error" role="alert">{error}</p> : null}
            <footer>Solana Devnet transactions only. Never commits secrets or accesses mainnet.</footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
