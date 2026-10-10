# Problems in pred-perps-percolator

Reviewed against `main` at `a1d2d11` (10 October 2026).

Two different “it did not land on devnet” failures are mixed together:

1. A user clicks Long or Short, the wallet asks for a signature, and no confirmed devnet transaction shows up.
2. `pnpm run deploy:devnet:live` prints success and writes nothing new on-chain. The Braves market in `deployments/jupiter-live-market.json` was never activated. The script exits 0 on purpose.

## 1. A signed trade still does not land

The trade button builds one legacy transaction in [apps/web/components/terminal.tsx](apps/web/components/terminal.tsx), simulates it, then calls `signAndSendTransaction` in [apps/web/components/wallet-providers.tsx](apps/web/components/wallet-providers.tsx). The wallet popup is not the send. The send is a second step, and that step is wrong.

### 1.1 The blockhash that is signed is not the blockhash that is confirmed

`signAndSendTransaction` does this:

1. Fetches blockhash A and writes it onto the transaction.
2. Calls `signTransaction(tx, connection)`.
3. `signTransaction` fetches blockhash B and overwrites `tx.recentBlockhash` before the wallet signs.
4. `sendRawTransaction` sends the bytes signed over B.
5. `confirmTransaction` waits on A (`blockhash` and `lastValidBlockHeight` from step 1).

A and B are two RPC calls. They are often different. Confirmation then watches the wrong blockhash. On Alchemy devnet this is worse: the HTTP RPC does not support `signatureSubscribe`, so the client polls until the blockhash it was given expires. That expiry is A’s expiry, which is already older than the signed transaction. The UI reports failure after the user has signed. The transaction may never have been accepted, or it may have landed and the page gave up.

The same helper is used for InitPortfolio and deposit in [apps/web/components/portfolio-view.tsx](apps/web/components/portfolio-view.tsx), so those signatures fail the same way.

### 1.2 The wallet popup itself burns the blockhash

Devnet blockhashes live about 60 to 90 seconds. The fresh blockhash is taken before the popup. If the user reads the Phantom or Privy prompt, the hash is already dead when `sendRawTransaction` runs.

Preflight is on (`skipPreflight: false`). The RPC simulates again and refuses with “Blockhash not found”. The transaction is not broadcast. The user already signed.

The retry only continues when the error text matches `/blockhash not found/i`. A wrapped Privy error, or “TransactionExpiredBlockheightExceededError”, does not match, so there is no second attempt.

### 1.3 The simulation that gates the button is not the transaction that gets signed

Before the popup, the page simulates a `VersionedTransaction` compiled from the message, with `replaceRecentBlockhash: true` and `sigVerify: false`. That proves the instruction accounts can be processed against some recent blockhash. It does not prove the legacy transaction the wallet signs, with the blockhash from section 1.1, will pass preflight a minute later.

If that local simulation fails, the code returns and the wallet never opens. If it passes, the later preflight can still reject. Those are two different results for one click.

### 1.4 The program can still reject the signed trade

These are checked on-chain after the signature, inside program `Cerk8WwzTJY9YVF9SaHCtUjG15jNGHN26iqyNeUETqnC`:

| Code | Meaning | Why it still happens |
| --- | --- | --- |
| `0x8` | LP matcher is not authorized | The LP control word was not enabled, or the matcher context / delegate / expiry no longer matches. The UI tells the operator to run `pnpm reauthorize:lp`. A normal user cannot fix it. |
| `0x9` | Invalid instruction | Matcher context owner or length is wrong, on-chain price is 0, the matcher quote misses the signed limit, or the fee floor is above the market max. |
| `0x15` | Asset is not Active | Lifecycle other than 2 (DrainOnly, Retired, Pending). A new position is rejected. |
| `0x1e` | Market id moved | The id in the instruction does not match the slot read at execution. |
| `0xc` | Vault account is wrong | Deposit path, not the trade instruction. |
| `0xd` | Token program mismatch | USDC accounts are not owned by the token program stored on the market. |
| `0xf` | Arithmetic overflow | Size was too large for the risk math. The button now forces size `1_000_000`, so this should be rare unless the accounts themselves overflow. |

The matcher context `GhtKPreRFiBCVTpGSXkqWXbux1gtoCRayXQZgnHne3JA` was initialized with `expiry_slot` `505317663`. Devnet is past that slot. `programs/moxie-matcher/src/lib.rs` returns no quote when `slot > expiry_slot`. Percolator then rejects the trade. There is no instruction to extend that expiry. A new context has to be created and the LP has to authorize it. `scripts/reauthorize-lp.mjs` does that only when someone runs it locally with the payer key. The website cannot.

### 1.5 The dollar amount on the form is not what gets signed

The input is “Position Size (USDC)”. `handleExecuteTrade` ignores it and always sends size `1_000_000` (one engine unit). The user signs a different trade from the one on screen. If their portfolio has no free margin for that unit, the program rejects the transaction after the signature.

### 1.6 Jupiter cards never reach a real devnet trade

[apps/web/lib/jupiter-live.ts](apps/web/lib/jupiter-live.ts) lists up to eight Jupiter markets and uses the Jupiter id (`POLY-5203709-0`) as `marketId`. [apps/web/components/terminal.tsx](apps/web/components/terminal.tsx) refuses any id that is not all digits:

```ts
if (!/^\d+$/.test(String(market.marketId))) {
  setTradeError("This event is not imported on devnet yet.");
  return;
}
```

So the markets the page shows cannot be signed. The only clicks that open a wallet are old numeric slots on the single market account `6T9L4mhZKjAv2YwYhuy2vJaeAcpuMGVkh2XcZTA7szoN`. Those slots are the already-imported book, not the Braves game from `smoke:jupiter`.

### 1.7 Privy can sign a different key from the one on screen

If Privy is authenticated, `activeWalletType` is forced to `"privy"` even when Phantom is also connected. The fee payer becomes the Privy embedded wallet. The user can approve in a popup for an empty devnet account while the Phantom account that holds the SOL is never the signer.

## 2. Why `deploy:devnet:live` does not add markets

`scripts/deploy-local.mjs` has a hard stop once `--devnet --live` is set:

```js
console.log("[deploy] Refusing append activation on full market group to prevent custom error 0x15.");
process.exit(0);
```

It does not read the market account. It does not count free slots. It does not retire a market that closes after 30 October. It exits 0, so the shell looks successful. The programs are skipped because they are already deployed. Bootstrap is never started. `deployments/jupiter-live-market.json` stays a local file.

The group really does have eight asset slots. Earlier imports filled them. Percolator returns `0x15` if you append past the live capacity. Replacing a slot means retiring or settling the old asset first, then activating the new Jupiter market into that slot. Nothing in the deploy script does that.

`smoke:jupiter` also only keeps one market, the first candidate. It cannot fill the book with every open Jupiter market that closes by 30 October 2026.

The Atlanta Braves market from the last smoke run closes at `closeTimeMs` `1791763200000` (12 October 2026). It is inside the window. It was still not deployed, because of the hard stop above, not because of its date.

## 3. Other problems

### Markets and prices

- The markets page and the trade page do not read the indexer or the chain book. They read Jupiter, then refuse to trade those rows. The chain book and the page are two different lists.
- Prices are the Jupiter midpoint. The signed limit is the on-chain packed price at bytes 17 and 25, plus or minus `50_000`. The number on the button is not the number in the transaction.
- If `JUPITER_API_KEY` is missing on Vercel, the list is empty or frozen on the last warm-instance cache and marked `stale`. There is no shared cache across serverless instances.
- `lastGood` in `jupiter-live.ts` lives in module memory. A new Vercel isolate does not have it.
- Old titles are still hardcoded in `KNOWN_MARKET_TITLES` in [apps/web/lib/markets.ts](apps/web/lib/markets.ts) (Brazil election, Columbus tennis, BetBoom). `resolveMarketTitleAndRules` will still substitute those names if an id matches.
- `getDevnetOnchainMarkets` in [apps/web/lib/api.ts](apps/web/lib/api.ts) still falls back to the Brazil election title. Nothing calls it after the Jupiter switch, but the fake title is still in the file.
- `listOpenChainMarkets` labels an open slot `Open market #N` with a close time in 2030. The markets page no longer uses it. Any caller that does will show a market the October filter should hide.
- The client filter drops anything that closes after 30 October 2026, 23:59 UTC. The on-chain slots were not rebuilt to match.

### Wallet, portfolio, faucet

- Faucet routes look for `DEVNET_PAYER_SECRET` and then for `C:\Users\OBINNA\.config\solana\id.json`. That Windows path does not exist on Vercel. If the env var is missing or is not a JSON byte array, every visitor gets “Faucet keypair not configured”.
- The faucet key pays from the operator wallet. It is not a user-signed airdrop. A wrong or empty secret means the button cannot work, no matter what the user’s wallet holds.
- InitPortfolio size is fixed at `9563` bytes. If the deployed portfolio layout changes, create-account writes the wrong length and the program rejects it after the signature.
- LP portfolio, matcher context, and matcher delegate are compiled into `DEVNET_DEPLOYMENT` and optionally overwritten by `/lp.json` in `loadLpConfig`. If that file is missing on the deployment, the page keeps talking to the expired context.
- `readMatcherControl` assumes the control word is at byte `9531`. That is the offset of one portfolio length. A shorter or longer account decodes the epoch, fee cap, and enabled bit from the wrong bytes.
- SOL balance `<= 0` blocks the button. A wallet with dust below the rent for a portfolio still passes this check and then fails on-chain.

### Indexer, Render, Neon

- The web app no longer uses the Render indexer for the market list. The indexer can be healthy and the page can still show a different set, or nothing.
- Render’s free tier sleeps. The indexer process is not what the markets page waits on anymore, but portfolio and health routes still call it and will time out on a cold start.
- Neon is a cache. Several older routes still prefer it. A successful Jupiter read is not what those routes serve if they were not switched. The database is not the source of truth, and it also is not updated by a trade.
- `packages/db` and `apps/web/lib/db.ts` both define the market table. They can drift.

### Programs and local deploy

- `scripts/deploy-local.mjs` compares the genesis hash to `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`. A different RPC, or a URL that is not devnet, aborts before any program call. The check is right for public devnet and wrong for any other cluster.
- The script requires `percolator_prog.so`, `moxie_matcher.so`, and `moxie_oracle.so` on disk even when it is going to skip deploy. A clean checkout without `cargo build-sbf` cannot run the script at all.
- `moxie-oracle` was patched by hand to match `percolator-prog` instruction names. Those names are not a stable public interface. A submodule update breaks the oracle build again.
- The matcher has no “update expiry” instruction. After `expiry_slot`, every quote is a reject until a new context is created.
- Custom program errors are easy to misread in the UI. The text `"0x9"` is searched inside the whole message, so a longer id can be labeled InvalidInstruction. `"failed: c"` is the check for error `0xc`.

### Product behavior that does not match the screen

- “Get devnet SOL” and “Get 500 Test USDC” depend on the operator key. They are not the public Solana faucet.
- Long and Short do not use the typed USDC size.
- A listed Jupiter event says Trade, then “This event is not imported on devnet yet.”
- `pnpm run deploy:devnet:live` can exit 0 without sending a transaction.
- One market group, eight slots, no retire-and-replace path. Markets that close after 30 October cannot be swapped out by the command the README tells you to run.

## 4. What has to be true before a user signature can land

1. Confirm with the same blockhash the wallet signed, and do not fetch a second one in `signTransaction`.
2. Refresh the blockhash immediately before the popup, or retry with a new signature when preflight says the hash expired. Do not treat confirmation timeout as proof the program failed.
3. Use an RPC that can confirm over HTTP. Do not wait on `signatureSubscribe` against Alchemy.
4. Point the trade at a slot whose lifecycle is Active (`2`), whose market id is the one in the instruction, and whose matcher context is unexpired and authorized by the LP.
5. Retire a slot that fails the date rule, then activate the Jupiter market into that slot. Do not call `deploy:devnet:live` while it exits 0 without bootstrap.
