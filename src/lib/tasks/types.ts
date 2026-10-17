import type { ReceiptStatus } from "../receipt-state";
import type { PaymentRecipientSource } from "../payments/recipient";
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
  receiptStatus: ReceiptStatus;
  receiptError: string | null;
  createdAt: string;
  updatedAt: string;
  explorerUrl: string | null;
}

export interface PaymentInstructions {
  currency: string;
  amountWei: string;
  amountFormatted: string;
  recipient: string | null;
  /**
   * Where `recipient` came from: `env` (explicitly configured), `treasury`
   * (fallback to PLATFORM_TREASURY_ADDRESS) or `default` (fallback to the
   * project's default testnet recipient). Undefined for credit payments.
   */
  recipientSource?: PaymentRecipientSource;
  chainId: number;
  explorerUrl: string;
  mode: "mock" | "onchain";
}
