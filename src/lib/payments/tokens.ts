import { Interface, JsonRpcProvider, getAddress } from "ethers";
import { getServerConfig } from "../config";
import { AppError } from "../errors";
import {
  buildMockPayment,
  getPaymentConfig,
  verifyOnchainPayment,
  type VerifiedPayment,
} from "../payment";

export const NATIVE_TOKEN_SYMBOL = "BOT";
export const CREDIT_CURRENCY = "CREDITS";

export interface TokenConfig {
  symbol: string;
  kind: "native" | "erc20";
  address: string | null;
  decimals: number;
  chainId: number;
  label: string;
}

const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

function isAddress(value: string | undefined | null): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

export function getSupportedTokens(): TokenConfig[] {
  const config = getServerConfig();
  const chainId = config.BOTCHAIN_TESTNET_CHAIN_ID;
  const tokens: TokenConfig[] = [
    {
      symbol: NATIVE_TOKEN_SYMBOL,
      kind: "native",
      address: null,
      decimals: 18,
      chainId,
      label: "BOT (native)",
    },
  ];
  const erc20s: Array<{ symbol: string; address?: string; decimals: number; label: string }> = [
    { symbol: "USDTC", address: config.TOKEN_USDT_ADDRESS, decimals: 6, label: "USDTC (test USDT)" },
    { symbol: "USDC", address: config.TOKEN_USDC_ADDRESS, decimals: 6, label: "USDC" },
  ];
  for (const token of erc20s) {
    if (isAddress(token.address)) {
      tokens.push({
        symbol: token.symbol,
        kind: "erc20",
        address: token.address,
        decimals: token.decimals,
        chainId,
        label: token.label,
      });
    }
  }
  tokens.push({
    symbol: CREDIT_CURRENCY,
    kind: "erc20",
    address: null,
    decimals: 18,
    chainId,
    label: "Platform credits",
  });
  return tokens;
}

export function getTokenBySymbol(symbol: string): TokenConfig | null {
  const normalized = symbol.trim().toUpperCase();
  return (
    getSupportedTokens().find((token) => token.symbol.toUpperCase() === normalized) ??
    null
  );
}

export function isSupportedToken(symbol: string): boolean {
  return getTokenBySymbol(symbol) !== null;
}

export function parseTokenAmount(value: string, decimals: number): bigint {
  const [whole, fraction = ""] = value.split(".");
  const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(`${whole || "0"}${paddedFraction}`);
}

export function formatTokenAmount(amount: bigint, decimals: number): string {
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = amount / divisor;
  const fraction = (amount % divisor).toString().padStart(decimals, "0").slice(0, 4);
  return `${whole}.${fraction}`;
}

function provider(): JsonRpcProvider {
  const config = getServerConfig();
  return new JsonRpcProvider(config.BOTCHAIN_TESTNET_RPC_URL, {
    chainId: config.BOTCHAIN_TESTNET_CHAIN_ID,
    name: "botchain-testnet",
  });
}

async function loadTx(txHash: string, rpc: JsonRpcProvider) {
  let network;
  try {
    network = await rpc.getNetwork();
  } catch (error) {
    throw new AppError(
      `Could not reach BOT Chain RPC: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
      502,
      "RPC_UNREACHABLE",
    );
  }
  const config = getServerConfig();
  if (Number(network.chainId) !== config.BOTCHAIN_TESTNET_CHAIN_ID) {
    throw new AppError(
      `RPC chainId ${Number(network.chainId)} does not match expected ${config.BOTCHAIN_TESTNET_CHAIN_ID}`,
      502,
      "CHAIN_ID_MISMATCH",
    );
  }
  const [tx, receipt] = await Promise.all([
    rpc.getTransaction(txHash),
    rpc.getTransactionReceipt(txHash),
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
  return { tx, receipt, chainId: Number(network.chainId) };
}

export interface VerifyTokenPaymentInput {
  token: string;
  txHash: string;
  expectedTo: string;
  expectedAmount: string;
  expectedFrom: string;
}

export async function verifyErc20Payment(
  input: VerifyTokenPaymentInput,
  token: TokenConfig,
): Promise<VerifiedPayment> {
  if (!isAddress(token.address)) {
    throw new AppError(`Token ${token.symbol} is not configured`, 503, "TOKEN_NOT_CONFIGURED");
  }
  const rpc = provider();
  const { tx, receipt, chainId } = await loadTx(input.txHash, rpc);

  const expectedTo = getAddress(input.expectedTo).toLowerCase();
  const expectedFrom = getAddress(input.expectedFrom).toLowerCase();
  const tokenAddress = getAddress(token.address).toLowerCase();

  let to: string | null;
  let from: string;
  try {
    from = getAddress(tx.from).toLowerCase();
    to = tx.to ? getAddress(tx.to).toLowerCase() : null;
  } catch {
    throw new AppError("Could not parse transaction addresses", 502, "TX_BAD_FORMAT");
  }
  if (to !== tokenAddress) {
    throw new AppError(
      `Transaction did not call the ${token.symbol} token contract ${tokenAddress}.`,
      400,
      "TOKEN_MISMATCH",
    );
  }
  if (from !== expectedFrom) {
    throw new AppError(
      `Payment sender mismatch. This task must be paid from ${expectedFrom}.`,
      400,
      "SENDER_MISMATCH",
    );
  }

  const iface = new Interface(ERC20_ABI);
  let transferred = 0n;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== tokenAddress) continue;
    let parsed;
    try {
      parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
    } catch {
      continue;
    }
    if (!parsed || parsed.name !== "Transfer") continue;
    const logFrom = getAddress(parsed.args[0] as string).toLowerCase();
    const logTo = getAddress(parsed.args[1] as string).toLowerCase();
    const value = parsed.args[2] as bigint;
    if (logFrom === expectedFrom && logTo === expectedTo) {
      transferred += value;
    }
  }

  if (transferred < BigInt(input.expectedAmount)) {
    throw new AppError(
      `Payment amount too low. Expected at least ${input.expectedAmount} ${token.symbol}-base-units but received ${transferred.toString()}.`,
      400,
      "AMOUNT_TOO_LOW",
    );
  }

  return {
    txHash: tx.hash,
    chainId,
    fromAddress: from,
    toAddress: expectedTo,
    amountWei: transferred.toString(),
    status: "confirmed",
    blockNumber: tx.blockNumber,
  };
}

/**
 * Verify a payment for any supported token. Native BOT is verified with the
 * existing native-transfer path; ERC-20 tokens are verified by decoding
 * `Transfer` logs. Mock mode is honoured for local development.
 */
export async function verifyTokenPayment(
  input: VerifyTokenPaymentInput,
): Promise<VerifiedPayment> {
  const token = getTokenBySymbol(input.token);
  if (!token) {
    throw new AppError(
      `Unsupported payment token: ${input.token}`,
      400,
      "UNSUPPORTED_TOKEN",
    );
  }
  const { mode } = getPaymentConfig();
  if (mode === "mock") {
    return buildMockPayment({
      txHash: input.txHash,
      expectedTo: input.expectedTo,
      expectedAmountWei: input.expectedAmount,
      expectedFrom: input.expectedFrom,
    });
  }
  if (token.kind === "native") {
    return verifyOnchainPayment({
      txHash: input.txHash,
      expectedTo: input.expectedTo,
      expectedAmountWei: input.expectedAmount,
      expectedFrom: input.expectedFrom,
    });
  }
  return verifyErc20Payment(input, token);
}

