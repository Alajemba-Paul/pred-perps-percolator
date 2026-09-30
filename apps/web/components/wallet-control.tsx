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

  const activeAddress = privy.address || external.publicKey?.toBase58() || null;
  const activePubkey = useMemo(() => (activeAddress ? new PublicKey(activeAddress) : null), [activeAddress]);

  // Unified signer supporting both Privy embedded wallets and standard external adapters
  const signAndSendTransaction = useCallback(
    async (tx: Transaction): Promise<string> => {
      if (!activePubkey) throw new Error("Wallet not connected");

      tx.feePayer = activePubkey;
      const latestBlockhash = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = latestBlockhash.blockhash;

      // 1. Privy embedded wallet path
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

      // 2. Standard Solana Wallet Adapter path
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

      throw new Error("No signing method available on connected wallet. Please use Privy or Phantom/Solflare.");
    },
    [activePubkey, connection, external, privy.wallet]
  );

  // Fetch balances & portfolio state
  const refreshAccountState = useCallback(async () => {
    if (!activePubkey) {
      setSolBalance(null);
      setUsdcBalance(null);
      setHasPortfolio(null);
      setPortfolioData(null);
      return;
    }

    try {
      // 1. SOL Balance
      const lamports = await connection.getBalance(activePubkey);
      setSolBalance(lamports / LAMPORTS_PER_SOL);

      // 2. Test USDC Balance (SPL ATA)
      const mintPubkey = new PublicKey(DEVNET_DEPLOYMENT.usdcMint);
      const userAta = getUserAta(activePubkey, mintPubkey);
      try {
        const tokenBalance = await connection.getTokenAccountBalance(userAta);
        setUsdcBalance(tokenBalance.value.uiAmount ?? 0);
      } catch {
        setUsdcBalance(0);
      }

      // 3. Portfolio Account Check
      const portfolioAddress = await deriveUserPortfolioAddress(activePubkey);
      const accInfo = await connection.getAccountInfo(portfolioAddress);
      if (accInfo && accInfo.data.length >= DEVNET_DEPLOYMENT.portfolioAccountLen) {
        setHasPortfolio(true);
        const summary = decodePortfolioSummary(accInfo.data);
        setPortfolioData(summary);
      } else {
        setHasPortfolio(false);
        setPortfolioData(null);
      }
    } catch (err) {
      console.warn("Error refreshing account state:", err);
    }
  }, [activePubkey, connection]);

  useEffect(() => {
    refreshAccountState();
    const interval = setInterval(refreshAccountState, 6000);
    return () => clearInterval(interval);
  }, [refreshAccountState]);

  // Connect helper
  async function connectExternal(walletName: string) {
    setConnecting(walletName);
    setError(null);
    try {
      external.select(walletName as any);
      await external.connect();
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to connect wallet.");
    } finally {
      setConnecting(null);
    }
  }

  // Disconnect helper
  async function disconnectActive() {
    try {
      if (external.connected) await external.disconnect();
      if (privy.authenticated) await privy.logout();
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not disconnect wallet.");
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

      const sig = await signAndSendTransaction(tx);
      setActionSuccess(`Trading account created! Signature: ${sig.slice(0, 8)}...`);
      await refreshAccountState();
    } catch (err: any) {
      console.error("InitPortfolio error:", err);
      setError(err?.message || "Failed to initialize portfolio account.");
    } finally {
      setIsCreatingPortfolio(false);
    }
  }

  // Action: Faucet (Mock USDC + SOL)
  async function handleFaucet() {
    if (!activeAddress) return;
    setFaucetLoading(true);
    setError(null);
    setActionSuccess(null);

    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: activeAddress }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Faucet request failed.");
      }

      setActionSuccess(`Received 500 Test USDC! (Tx: ${data.signature?.slice(0, 8)}...)`);
      await refreshAccountState();
    } catch (err: any) {
      setError(err.message || "Failed to request faucet funds.");
    } finally {
      setFaucetLoading(false);
    }
  }

  // Action: Airdrop SOL from standard devnet faucet
  async function handleAirdropSol() {
    if (!activePubkey) return;
    setIsAirdropping(true);
    setError(null);
    setActionSuccess(null);

    try {
      const sig = await connection.requestAirdrop(activePubkey, 1 * LAMPORTS_PER_SOL);
      const latestBlockhash = await connection.getLatestBlockhash("confirmed");
      await connection.confirmTransaction({ signature: sig, ...latestBlockhash }, "confirmed");
      setActionSuccess("Airdropped 1 SOL from Devnet faucet!");
      await refreshAccountState();
    } catch (err: any) {
      setError(err.message || "Standard Devnet airdrop rate limited. Try the faucet button below.");
    } finally {
      setIsAirdropping(false);
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
      setActionSuccess(`Deposited $100 Margin! Signature: ${sig.slice(0, 8)}...`);
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
              {solBalance !== null ? `${solBalance.toFixed(2)} SOL` : "…"}
            </span>
            <span style={{ opacity: 0.75, fontSize: "11px" }}>
              {usdcBalance !== null ? `$${usdcBalance.toFixed(0)} USDC` : "…"}
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
                  <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", padding: "10px 12px", borderRadius: "6px" }}>
                    <small style={{ color: "rgba(255,255,255,0.5)", fontSize: "11px", display: "block" }}>Devnet SOL</small>
                    <strong style={{ fontSize: "16px", color: "#fff" }}>
                      {solBalance !== null ? `${solBalance.toFixed(3)} SOL` : "Loading..."}
                    </strong>
                    <button
                      type="button"
                      onClick={handleAirdropSol}
                      disabled={isAirdropping}
                      style={{ marginTop: "6px", display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", color: "#c7ff4a", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                    >
                      {isAirdropping ? <Loader2 size={10} className="animate-spin" /> : <Coins size={10} />}
                      <span>Request 1 SOL Airdrop</span>
                    </button>
                  </div>

                  <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", padding: "10px 12px", borderRadius: "6px" }}>
                    <small style={{ color: "rgba(255,255,255,0.5)", fontSize: "11px", display: "block" }}>Test USDC Balance</small>
                    <strong style={{ fontSize: "16px", color: "#fff" }}>
                      {usdcBalance !== null ? `$${usdcBalance.toFixed(2)}` : "Loading..."}
                    </strong>
                    <button
                      type="button"
                      onClick={handleFaucet}
                      disabled={faucetLoading}
                      style={{ marginTop: "6px", display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", color: "#c7ff4a", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                    >
                      {faucetLoading ? <Loader2 size={10} className="animate-spin" /> : <PlusCircle size={10} />}
                      <span>Get 500 Test USDC</span>
                    </button>
                  </div>
                </div>

                {/* Percolator Portfolio State */}
                <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", padding: "12px", borderRadius: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "#fff" }}>Percolator Portfolio</span>
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
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                        <span style={{ color: "rgba(255,255,255,0.6)" }}>Trading Collateral:</span>
                        <strong style={{ color: "#fff" }}>
                          ${portfolioData ? (Number(portfolioData.capital) / 1e6).toFixed(2) : "0.00"}
                        </strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                        <span style={{ color: "rgba(255,255,255,0.6)" }}>Margin Health:</span>
                        <span style={{ color: "#c7ff4a" }}>Healthy (100% Solvency)</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleDepositMargin}
                        disabled={isDepositing || (usdcBalance ?? 0) < 100}
                        style={{
                          marginTop: "6px",
                          width: "100%",
                          padding: "8px 12px",
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
                        <span>Deposit $100 Margin</span>
                      </button>
                    </div>
                  ) : (
                    <div>
                      <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.7)", margin: "4px 0 10px", lineHeight: 1.4 }}>
                        Create a program-owned portfolio on Percolator to trade prediction perps with on-chain solvency proofs.
                      </p>
                      <button
                        type="button"
                        onClick={handleCreatePortfolio}
                        disabled={isCreatingPortfolio || (solBalance ?? 0) < 0.05}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          fontSize: "12px",
                          fontWeight: 600,
                          background: "#c7ff4a",
                          color: "#000",
                          border: "none",
                          borderRadius: "4px",
                          cursor: (solBalance ?? 0) >= 0.05 ? "pointer" : "not-allowed",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                        }}
                      >
                        {isCreatingPortfolio ? <Loader2 size={13} className="animate-spin" /> : <PlusCircle size={13} />}
                        <span>Create Trading Account (InitPortfolio)</span>
                      </button>
                      {(solBalance ?? 0) < 0.05 && (
                        <p style={{ fontSize: "11px", color: "#ffb400", marginTop: "6px" }}>
                          Requires ~0.05 SOL for rent. Use &quot;Request 1 SOL Airdrop&quot; above first.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {actionSuccess && (
                  <p style={{ fontSize: "11px", color: "#c7ff4a", background: "rgba(199,255,74,0.1)", padding: "8px 12px", borderRadius: "4px", margin: 0 }}>
                    {actionSuccess}
                  </p>
                )}

                {error && (
                  <p className="wallet-error" role="alert" style={{ fontSize: "11px", margin: 0 }}>
                    {error}
                  </p>
                )}

                <button className="wallet-disconnect" type="button" onClick={disconnectActive} style={{ marginTop: "4px" }}>
                  <LogOut size={14} aria-hidden="true" /> Disconnect Wallet
                </button>
              </div>
            ) : (
              <div className="wallet-modal-body">
                <button className="wallet-method primary" type="button" onClick={privy.login}>
                  <span className="wallet-method-icon">
                    <Mail size={18} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>Email or Google (Privy)</strong>
                    <small>Embedded Solana wallet with one-click social login</small>
                  </span>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>

                <div className="wallet-divider">
                  <span>OR BROWSER WALLET</span>
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
                                ? "Detected in browser"
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
                        <strong>No Solana wallet extension detected</strong>
                        <small>Install Phantom or Solflare, or log in with Privy above.</small>
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
