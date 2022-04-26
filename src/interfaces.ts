export interface Swap {
  id: string;
  output: string;
  poolId: number;
  blockTimestamp: number;
  tokenInAmount: number;
  tokenIn: string;
  tokenOutAmount: number;
  tokenOut: string;
  receiptId: string;
  predecessorId: string;
}

export type TokenData = { decimal: number; symbol: string; price: string };
