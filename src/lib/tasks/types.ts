import type { TaskStatus } from "../task-state";

export interface PublicTask {
  id: string;
  agentSlug: string;
  agentName?: string;
  clientAddress: string;
  inputPreview: string;
  inputHash: string;
  status: TaskStatus;
  priceWei: string;
  currency: string;
  paymentTxHash: string | null;
  resultHash: string | null;
  result: unknown | null;
  error: string | null;
  onchainTxHash: string | null;
  createdAt: string;
  updatedAt: string;
  explorerUrl: string | null;
}

export interface PaymentInstructions {
  currency: string;
  amountWei: string;
  amountFormatted: string;
  recipient: string | null;
  chainId: number;
  explorerUrl: string;
  mode: "mock" | "onchain";
}
