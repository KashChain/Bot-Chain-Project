import { JsonRpcProvider, getAddress } from "ethers";
import { AppError, ConfigurationError } from "./errors";
import { getServerConfig } from "./config";

export interface VerifiedPayment {
  txHash: string;
  chainId: number;
  fromAddress: string;
  toAddress: string;
  amountWei: string;
  status: "confirmed" | "mock";
  blockNumber: number | null;
}

export function getPaymentConfig(): {
  mode: "mock" | "onchain";
  mockEnabled: boolean;
} {
  const config = getServerConfig();
  const mockEnabled = config.ENABLE_MOCK_PAYMENT;
  const mode = mockEnabled ? "mock" : config.PAYMENT_MODE;
  if (mode === "mock" && !mockEnabled) {
    throw new ConfigurationError(
      "PAYMENT_MODE=mock requires ENABLE_MOCK_PAYMENT=true",
    );
  }
  return { mode, mockEnabled };
}

export interface VerifyPaymentInput {
  txHash: string;
  expectedTo: string;
  expectedAmountWei: string;
  expectedFrom: string;
}

export async function verifyOnchainPayment(
  input: VerifyPaymentInput,
): Promise<VerifiedPayment> {
  const config = getServerConfig();
  const provider = new JsonRpcProvider(config.BOTCHAIN_TESTNET_RPC_URL, {
    chainId: config.BOTCHAIN_TESTNET_CHAIN_ID,
    name: "botchain-testnet",
  });

  let network;
  try {
    network = await provider.getNetwork();
  } catch (error) {
    throw new AppError(
      `Could not reach BOT Chain RPC: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
      502,
      "RPC_UNREACHABLE",
    );
  }

  if (Number(network.chainId) !== config.BOTCHAIN_TESTNET_CHAIN_ID) {
    throw new AppError(
      `RPC chainId ${Number(network.chainId)} does not match expected ${config.BOTCHAIN_TESTNET_CHAIN_ID}`,
      502,
      "CHAIN_ID_MISMATCH",
    );
  }

  const [tx, receipt] = await Promise.all([
    provider.getTransaction(input.txHash),
    provider.getTransactionReceipt(input.txHash),
  ]);

  if (!tx) {
    throw new AppError(
      "Transaction not found on BOT Chain testnet. If you just submitted it, wait for it to be mined and retry.",
      404,
      "TX_NOT_FOUND",
    );
  }

  if (!receipt) {
    throw new AppError(
      "Transaction is still pending and has no receipt yet.",
      409,
      "TX_PENDING",
    );
  }

  if (receipt.status !== 1) {
    throw new AppError(
      "Transaction was reverted on-chain and does not count as payment.",
      400,
      "TX_REVERTED",
    );
  }

  let from: string;
  let to: string | null;
  try {
    from = getAddress(tx.from).toLowerCase();
    to = tx.to ? getAddress(tx.to).toLowerCase() : null;
  } catch {
    throw new AppError("Could not parse transaction addresses", 502, "TX_BAD_FORMAT");
  }

  const expectedTo = getAddress(input.expectedTo).toLowerCase();
  const expectedFrom = getAddress(input.expectedFrom).toLowerCase();

  if (to !== expectedTo) {
    throw new AppError(
      `Payment recipient mismatch. Expected ${expectedTo} but transaction paid ${to ?? "nothing"}.`,
      400,
      "RECIPIENT_MISMATCH",
    );
  }

  if (from !== expectedFrom) {
    throw new AppError(
      `Payment sender mismatch. This task must be paid from ${expectedFrom}.`,
      400,
      "SENDER_MISMATCH",
    );
  }

  if (tx.value < BigInt(input.expectedAmountWei)) {
    throw new AppError(
      `Payment amount too low. Expected at least ${input.expectedAmountWei} wei but received ${tx.value.toString()} wei.`,
      400,
      "AMOUNT_TOO_LOW",
    );
  }

  return {
    txHash: tx.hash,
    chainId: Number(network.chainId),
    fromAddress: from,
    toAddress: expectedTo,
    amountWei: tx.value.toString(),
    status: "confirmed",
    blockNumber: tx.blockNumber,
  };
}

export function buildMockPayment(input: VerifyPaymentInput): VerifiedPayment {
  const { mockEnabled } = getPaymentConfig();
  if (!mockEnabled) {
    throw new ConfigurationError(
      "Mock payments are disabled. Set ENABLE_MOCK_PAYMENT=true only for development.",
    );
  }
  return {
    txHash: input.txHash,
    chainId: getServerConfig().BOTCHAIN_TESTNET_CHAIN_ID,
    fromAddress: input.expectedFrom.toLowerCase(),
    toAddress: input.expectedTo.toLowerCase(),
    amountWei: input.expectedAmountWei,
    status: "mock",
    blockNumber: null,
  };
}

export async function verifyPayment(
  input: VerifyPaymentInput,
): Promise<VerifiedPayment> {
  const { mode } = getPaymentConfig();
  if (mode === "mock") {
    return buildMockPayment(input);
  }
  return verifyOnchainPayment(input);
}
