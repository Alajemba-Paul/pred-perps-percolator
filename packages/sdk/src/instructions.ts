import {
  buildCreatePortfolioData,
  buildDepositData,
  buildPermissionlessCrankData,
  buildTradeCpiData,
  buildTradeNoCpiData,
  buildWithdrawData,
  type TradeRequest,
} from "./percolator.ts";

export type AccountMeta = {
  address: string;
  isSigner: boolean;
  isWritable: boolean;
};

export type MoxieInstruction = {
  programAddress: string;
  accounts: readonly AccountMeta[];
  data: Uint8Array;
};

const meta = (address: string, isSigner = false, isWritable = false): AccountMeta => ({
  address,
  isSigner,
  isWritable,
});

export function createPortfolioInstruction(x: {
  program: string;
  owner: string;
  market: string;
  portfolio: string;
}): MoxieInstruction {
  return {
    programAddress: x.program,
    accounts: [meta(x.owner, true), meta(x.market, false, true), meta(x.portfolio, false, true)],
    data: buildCreatePortfolioData(),
  };
}

export function depositInstruction(x: {
  program: string;
  owner: string;
  market: string;
  portfolio: string;
  sourceToken: string;
  vault: string;
  tokenProgram: string;
  portfolioId: bigint;
  sequence: bigint;
  amount: bigint;
}): MoxieInstruction {
  return {
    programAddress: x.program,
    accounts: [
      meta(x.owner, true),
      meta(x.market, false, true),
      meta(x.portfolio, false, true),
      meta(x.sourceToken, false, true),
      meta(x.vault, false, true),
      meta(x.tokenProgram),
    ],
    data: buildDepositData(x.portfolioId, x.sequence, x.amount),
  };
}

export function withdrawInstruction(x: {
  program: string;
  owner: string;
  market: string;
  portfolio: string;
  destinationToken: string;
  vault: string;
  vaultAuthority: string;
  tokenProgram: string;
  portfolioId: bigint;
  sequence: bigint;
  amount: bigint;
}): MoxieInstruction {
  return {
    programAddress: x.program,
    accounts: [
      meta(x.owner, true),
      meta(x.market, false, true),
      meta(x.portfolio, false, true),
      meta(x.destinationToken, false, true),
      meta(x.vault, false, true),
      meta(x.vaultAuthority),
      meta(x.tokenProgram),
    ],
    data: buildWithdrawData(x.portfolioId, x.sequence, x.amount),
  };
}

export function tradeInstruction(
  x: TradeRequest & {
    program: string;
    traderAuthority: string;
    market: string;
    traderPortfolio: string;
    lpPortfolio: string;
    matcherProgram: string;
    matcherContext: string;
    matcherDelegate: string;
  }
): MoxieInstruction {
  return {
    programAddress: x.program,
    accounts: [
      meta(x.traderAuthority, true),
      meta(x.market, false, true),
      meta(x.traderPortfolio, false, true),
      meta(x.lpPortfolio, false, true),
      meta(x.matcherProgram),
      meta(x.matcherContext, false, true),
      meta(x.matcherDelegate),
    ],
    data: buildTradeCpiData(x),
  };
}

export function tradeNoCpiInstruction(x: {
  program: string;
  signerA: string;
  signerB: string;
  market: string;
  portfolioA: string;
  portfolioB: string;
  accountAPortfolioId: bigint;
  accountAPositionEpoch: bigint;
  accountBPortfolioId: bigint;
  accountBPositionEpoch: bigint;
  assetIndex: number;
  marketId: bigint;
  sizeQ: bigint;
  execPrice: bigint;
  feeBps: bigint;
  backingFeeCapBps?: number;
}): MoxieInstruction {
  return {
    programAddress: x.program,
    accounts: [
      meta(x.signerA, true),
      meta(x.signerB, true),
      meta(x.market, false, true),
      meta(x.portfolioA, false, true),
      meta(x.portfolioB, false, true),
    ],
    data: buildTradeNoCpiData(x),
  };
}

export function crankInstruction(x: {
  program: string;
  authority: string;
  market: string;
  portfolio: string;
  nowSlot: bigint;
  assets: readonly number[];
}): MoxieInstruction {
  return {
    programAddress: x.program,
    accounts: [
      meta(x.authority),
      meta(x.market, false, true),
      meta(x.portfolio, false, true),
    ],
    data: buildPermissionlessCrankData(x.nowSlot, x.assets),
  };
}
