"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import {
  useWallets as usePrivySolanaWallets,
  useSignTransaction,
} from "@privy-io/react-auth/solana";
import { confirmSignatureHttp, isExpiredBlockhash } from "@/lib/confirm";
import { loadLpConfig } from "@/lib/contracts";
import { ConnectionProvider } from "@solana/wallet-adapter-react";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";

export type UnifiedWallet = {
  connected: boolean;
  walletType: "privy" | "phantom" | null;
  activeAddress: string | null;
  activePubkey: PublicKey | null;
  isConnecting: boolean;
  error: string | null;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  signAndSendTransaction: (tx: Transaction, connection: Connection) => Promise<string>;
  connectPhantom: () => Promise<void>;
  connectPrivy: () => void;
  disconnect: () => Promise<void>;
  // Compatibility fields with previous PrivyWalletState
  enabled: boolean;
  ready: boolean;
  authenticated: boolean;
  address: string | null;
  wallet: any | null;
  login: () => void;
  logout: () => Promise<void>;
};

const defaultUnifiedWallet: UnifiedWallet = {
  connected: false,
  walletType: null,
  activeAddress: null,
  activePubkey: null,
  isConnecting: false,
  error: null,
  signTransaction: async () => {
    throw new Error("Reconnect wallet");
  },
  signAndSendTransaction: async () => {
    throw new Error("Reconnect wallet");
  },
  connectPhantom: async () => undefined,
  connectPrivy: () => undefined,
  disconnect: async () => undefined,
  enabled: false,
  ready: true,
  authenticated: false,
  address: null,
  wallet: null,
  login: () => undefined,
  logout: async () => undefined,
};

const UnifiedWalletContext = createContext<UnifiedWallet>(defaultUnifiedWallet);


// Helper to extract logs from transaction errors (SendTransactionError, simulation, etc.)
async function extractTransactionLogs(err: any, connection: Connection, signedTx?: Transaction): Promise<string[]> {
  if (Array.isArray(err?.logs) && err.logs.length > 0) {
    return err.logs;
  }
  if (typeof err?.getLogs === "function") {
    try {
      const logs = await err.getLogs(connection);
      if (Array.isArray(logs) && logs.length > 0) return logs;
    } catch {}
  }
  if (signedTx) {
    try {
      const sim = await connection.simulateTransaction(signedTx, undefined, true);
      if (Array.isArray(sim.value.logs) && sim.value.logs.length > 0) {
        return sim.value.logs;
      }
    } catch {}
  }
  return [];
}

function parseErrorSummary(err: any, logs: string[]): string {
  const rawMsg = err?.message || String(err);
  const allLogs = logs.join(" ");

  // Map 0x1e (PercolatorError::AssetGenerationMismatch = 30)
  if (
    allLogs.includes("0x1e") ||
    allLogs.includes("Custom: 30") ||
    allLogs.includes("AssetGenerationMismatch") ||
    rawMsg.includes("0x1e") ||
    rawMsg.includes("Custom: 30") ||
    rawMsg.includes("AssetGenerationMismatch")
  ) {
    return "Market updated. Refresh and try again.";
  }

  // Map 0xd (PercolatorError::InvalidTokenProgram = 13)
  if (
    allLogs.includes("0xd") ||
    allLogs.includes("Custom: 13") ||
    allLogs.includes("InvalidTokenProgram") ||
    rawMsg.includes("0xd") ||
    rawMsg.includes("Custom: 13") ||
    rawMsg.includes("InvalidTokenProgram")
  ) {
    return "Wrong token program on the USDC accounts.";
  }

  // Show real program log from getLogs() if available
  if (logs.length > 0) {
    const prioritized = [...logs].reverse().find(
      (l) =>
        l.includes("Program log:") ||
        l.includes("Program failed") ||
        l.includes("custom program error") ||
        l.includes("Error:") ||
        l.includes("insufficient funds") ||
        l.includes("already in use")
    );
    if (prioritized) {
      return prioritized
        .replace(/^.*?Program log:\s*/i, "")
        .replace(/^Transaction simulation failed:\s*/i, "")
        .replace(/^Error processing Instruction \d+:\s*/i, "")
        .trim();
    }
  }

  if (/blockhash not found/i.test(rawMsg)) {
    return "Simulation failed: Blockhash not found. Transaction expired before confirmation. Please try again.";
  }
  return rawMsg
    .replace(/^Transaction simulation failed:\s*/i, "")
    .replace(/^Error processing Instruction \d+:\s*/i, "")
    .trim() || "Transaction failed on Solana Devnet.";
}

function UnifiedWalletBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = usePrivySolanaWallets();
  const { signTransaction: privySignTransaction } = useSignTransaction();

  const [directPhantomAddress, setDirectPhantomAddress] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<"privy" | "phantom" | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  // Restore Phantom session if saved in localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("moxie_direct_phantom");
    const choice = localStorage.getItem("moxie_wallet_choice");
    if (saved) setDirectPhantomAddress(saved);
    if (choice === "phantom" || choice === "privy") setActiveType(choice);
    else if (saved && !authenticated) setActiveType("phantom");
  }, [authenticated]);

  const { activeAddress, activeWalletType } = useMemo(() => {
    const phantomChosen = activeType === "phantom" && Boolean(directPhantomAddress);
    if (phantomChosen) {
      return {
        activeAddress: directPhantomAddress,
        activeWalletType: "phantom" as const,
      };
    }
    if (wallets[0]?.address && (activeType === "privy" || authenticated || !directPhantomAddress)) {
      return {
        activeAddress: wallets[0].address,
        activeWalletType: "privy" as const,
      };
    }
    if (directPhantomAddress) {
      return {
        activeAddress: directPhantomAddress,
        activeWalletType: "phantom" as const,
      };
    }
    return {
      activeAddress: null,
      activeWalletType: null,
    };
  }, [authenticated, wallets, directPhantomAddress, activeType]);

  const activePubkey = useMemo(() => {
    if (!activeAddress) return null;
    try {
      return new PublicKey(activeAddress);
    } catch {
      return null;
    }
  }, [activeAddress]);

  const signTransaction = useCallback(
    async (tx: Transaction): Promise<Transaction> => {
      if (!tx.recentBlockhash || !tx.feePayer) {
        throw new Error("Reconnect wallet");
      }
      if (!tx.feePayer.equals(activePubkey!)) {
        throw new Error("Reconnect wallet");
      }

      if (activeWalletType === "privy" && wallets[0]) {
        if (wallets[0].address !== activePubkey!.toBase58()) throw new Error("Reconnect wallet");
        const serialized = tx.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        });
        const res = await privySignTransaction({
          transaction: serialized,
          wallet: wallets[0],
          chain: "solana:devnet",
        });
        return Transaction.from(res.signedTransaction);
      }

      if (activeWalletType === "phantom") {
        if (typeof window === "undefined" || !(window as any).solana) {
          throw new Error("Reconnect wallet");
        }
        const phantom = (window as any).solana;
        if (!phantom.publicKey) await phantom.connect();
        if (!phantom.publicKey || phantom.publicKey.toBase58() !== activePubkey!.toBase58()) {
          throw new Error("Reconnect wallet");
        }
        return await phantom.signTransaction(tx);
      }

      throw new Error("Reconnect wallet");
    },
    [activeWalletType, wallets, privySignTransaction, activePubkey]
  );

  const signAndSendTransaction = useCallback(
    async (tx: Transaction, connection: Connection): Promise<string> => {
      if (!activePubkey) throw new Error("Reconnect wallet");

      let attempt = 0;
      while (attempt < 2) {
        attempt++;
        const latest = await connection.getLatestBlockhash("confirmed");
        tx.feePayer = activePubkey;
        tx.recentBlockhash = latest.blockhash;

        let signedTx: Transaction;
        try {
          signedTx = await signTransaction(tx);
        } catch (signErr: any) {
          console.error("Sign transaction error:", signErr);
          throw signErr;
        }
        if (signedTx.recentBlockhash !== latest.blockhash) {
          throw new Error("Wallet changed the blockhash. Reconnect and try again.");
        }

        try {
          const sig = await connection.sendRawTransaction(signedTx.serialize(), {
            skipPreflight: false,
            preflightCommitment: "confirmed",
          });
          await confirmSignatureHttp(connection, sig, latest.lastValidBlockHeight);
          return sig;
        } catch (err: any) {
          console.error("sendRawTransaction error (attempt " + attempt + "):", err);
          const rawMsg = err?.message || String(err);
          if (isExpiredBlockhash(rawMsg) && attempt === 1) {
            console.warn("Blockhash expired. Asking for a new signature.");
            continue;
          }
          const logs = await extractTransactionLogs(err, connection, signedTx);
          throw new Error(parseErrorSummary(err, logs));
        }
      }

      throw new Error("Transaction failed: Blockhash expired. Please try again.");
    },
    [activePubkey, signTransaction]
  );

  // Connect Phantom
  const connectPhantom = useCallback(async () => {
    setIsConnecting(true);
    setWalletError(null);
    try {
      if (typeof window === "undefined" || !(window as any).solana) {
        throw new Error("Phantom extension not detected. Please install Phantom or use Privy.");
      }
      const resp = await (window as any).solana.connect();
      const pubkeyStr = resp.publicKey.toBase58();
      setDirectPhantomAddress(pubkeyStr);
      setActiveType("phantom");
      if (typeof window !== "undefined") {
        localStorage.setItem("moxie_direct_phantom", pubkeyStr);
        localStorage.setItem("moxie_wallet_choice", "phantom");
      }
    } catch (err: any) {
      setWalletError(err?.message || "Failed to connect to Phantom.");
      throw err;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  // Connect Privy
  const connectPrivy = useCallback(() => {
    setWalletError(null);
    setActiveType("privy");
    if (typeof window !== "undefined") localStorage.setItem("moxie_wallet_choice", "privy");
    login({ loginMethods: ["email", "google"] });
  }, [login]);

  // Disconnect
  const disconnect = useCallback(async () => {
    if (authenticated) {
      await logout();
    }
    setDirectPhantomAddress(null);
    setActiveType(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("moxie_direct_phantom");
      localStorage.removeItem("moxie_wallet_choice");
      if ((window as any).solana?.disconnect) {
        try {
          (window as any).solana.disconnect();
        } catch {}
      }
    }
  }, [authenticated, logout]);

  const value: UnifiedWallet = {
    connected: Boolean(activeAddress),
    walletType: activeWalletType,
    activeAddress,
    activePubkey,
    isConnecting,
    error: walletError,
    signTransaction,
    signAndSendTransaction,
    connectPhantom,
    connectPrivy,
    disconnect,
    enabled: true,
    ready,
    authenticated,
    address: activeAddress,
    wallet: wallets[0] ?? null,
    login: connectPrivy,
    logout: disconnect,
  };

  return (
    <UnifiedWalletContext.Provider value={value}>
      {children}
    </UnifiedWalletContext.Provider>
  );
}

export function useUnifiedWallet() {
  return useContext(UnifiedWalletContext);
}

// Backward-compatible alias
export function usePrivyWalletState() {
  return useContext(UnifiedWalletContext);
}

export function WalletProviders({ children }: { children: ReactNode }) {
  const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
  useEffect(() => {
    loadLpConfig().catch(() => undefined);
  }, []);

  if (!privyAppId) {
    return (
      <ConnectionProvider endpoint={endpoint}>
        <UnifiedWalletContext.Provider value={defaultUnifiedWallet}>
          {children}
        </UnifiedWalletContext.Provider>
      </ConnectionProvider>
    );
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ["email", "google"],
        appearance: {
          theme: "dark",
          accentColor: "#c7ff4a",
          walletChainType: "solana-only",
          showWalletLoginFirst: false,
        },
        embeddedWallets: {
          ethereum: { createOnLogin: "off" },
          solana: { createOnLogin: "all-users" },
        },
      }}
    >
      <ConnectionProvider endpoint={endpoint}>
        <UnifiedWalletBridge>{children}</UnifiedWalletBridge>
      </ConnectionProvider>
    </PrivyProvider>
  );
}
