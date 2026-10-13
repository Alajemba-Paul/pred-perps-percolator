import type { Connection } from "@solana/web3.js";

export function isExpiredBlockhash(message: string): boolean {
  return /blockhash not found|blockheight|blockhash expired|expired blockhash|transaction expired/i.test(message);
}

/** Confirm over HTTP. Alchemy devnet does not support signatureSubscribe. */
export async function confirmSignatureHttp(
  connection: Connection,
  signature: string,
  lastValidBlockHeight: number,
): Promise<void> {
  for (let i = 0; i < 45; i++) {
    const status = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
    const value = status.value[0];
    if (value?.err) {
      throw new Error("Transaction failed on Solana Devnet: " + JSON.stringify(value.err));
    }
    if (value?.confirmationStatus === "confirmed" || value?.confirmationStatus === "finalized") return;
    const height = await connection.getBlockHeight("confirmed");
    if (height > lastValidBlockHeight) throw new Error("Blockhash not found");
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("Blockhash not found");
}
