# Moxie

## What this is
Moxie is a demo website for prediction market trading on Solana Devnet.
You trade on the chance that a real-world event happens.
All trades use test money on the Solana Devnet test network.
Event names come from Jupiter prediction markets, but trades execute on a Solana program called Percolator.
The live demo website is https://moxie-devnet-demo.vercel.app.

## What a visitor can do
- Connect a Solana wallet.
- Request free devnet SOL to pay network transaction fees.
- Request free test USDC to use as trading collateral.
- Create an on-chain trading account on Solana Devnet.
- Deposit test USDC into the trading account.
- Browse a list of real-world events.
- Open a Long position if you think the chance of the event will go up.
- Open a Short position if you think the chance of the event will go down.
- View your open positions and balance in your portfolio.

## What is real and what is not

### Real
- Wallet connection through your Solana wallet or email.
- Devnet SOL used to pay network fees.
- Real on-chain trading accounts created on Solana Devnet.
- Real transaction signatures that you can check on Solana Explorer.
- Event names and resolution rules imported from real prediction markets.

### Not real
- Real money. No real money or mainnet funds are used.
- Test USDC tokens. They are play tokens and have no cash value.
- The full Jupiter catalog. The site imports only selected events.
- Automatic price movements. Prices do not change by themselves without an oracle update.

## How the pieces fit, in plain words
- **Website**: Hosted on Vercel at https://moxie-devnet-demo.vercel.app.
- **Market list service**: Hosted on Render at https://pred-perps-percolator.onrender.com. It reads market details and serves them to the website.
- **Trading program**: Runs on the Solana Devnet blockchain. The blockchain executes deposits and trades.
- **Database (optional)**: A Neon Postgres database stores cached market titles and account summaries.
- **Source of truth**: The Solana blockchain is always the single source of truth.

## Run it on your computer

### What you need
- Node.js (version 20 or newer)
- pnpm package manager
- A Solana wallet set to the Devnet network
- A `.env` file with your settings

### Commands
Run these commands in your terminal, one per line:

```bash
git clone https://github.com/Alajemba-Paul/pred-perps-percolator.git
cd pred-perps-percolator
pnpm install
cp .env.example .env
pnpm run build
pnpm run dev
```

Open http://localhost:3000 in your web browser.

### Settings and keys
Do not share private keys, API keys, or payer secrets.
Never commit secret values to version control.
Copy `.env.example` to `.env` and configure the variable names listed there:
- `SOLANA_RPC_URL`: RPC endpoint for local testing.
- `DEVNET_RPC_URL`: Solana Devnet RPC endpoint.
- `NEXT_PUBLIC_SOLANA_RPC_URL`: Public RPC endpoint for the browser.
- `NEXT_PUBLIC_PRIVY_APP_ID`: Application ID for wallet login.
- `DATABASE_URL`: Optional database connection string for Neon Postgres cache.
- `JUPITER_API_KEY`: Optional API key to fetch live events from Jupiter.

## Words we use
- **Long**: A trade that gains value when the chance of the outcome goes up.
- **Short**: A trade that gains value when the chance of the outcome goes down.
- **Trading account**: An account on the Solana blockchain that holds your trading balance.
- **Devnet SOL**: Free test cryptocurrency used to pay network transaction fees on Solana Devnet.
- **Test USDC**: Free test tokens used as collateral to place demo trades.
- **Price**: The cost of one contract in cents. 55 cents means a 55% chance.
- **Close time**: The date and time when trading stops and the final outcome is decided.

## For developers

### Devnet program addresses
- Percolator Program: `Cerk8WwzTJY9YVF9SaHCtUjG15jNGHN26iqyNeUETqnC`
- Oracle Program: `AecrmxU7nvFAVEAy7LcJbEpTFPXax3ByyouKANGSGuD5`
- Market Account: `33x7syToGkpZRLmPyzQ2adiPYXFzr4vmCX5SX2Xz6Sm1`

### Verification and tests
Run unit tests across all workspace packages:

```bash
pnpm test
```

Run unit tests directly:

```bash
pnpm run test:unit
```

Verify upstream Percolator compatibility:

```bash
pnpm run verify:upstream
```
