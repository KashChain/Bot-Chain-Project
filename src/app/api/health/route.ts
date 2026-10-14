import { getServerConfig } from "@/lib/config";
import { getRepositoryKind } from "@/lib/repo";
import { getLlmMode } from "@/lib/ai/llm";
import { getPaymentConfig } from "@/lib/payment";
import {
  isContractAddressConfigured,
  isOnchainReceiptConfigured,
} from "@/lib/contract";
import { isAdminApiConfigured } from "@/lib/admin";
import { monitoringStatus } from "@/lib/monitoring";
import { creditsEnabled } from "@/lib/billing/credits";
import { getSupportedTokens } from "@/lib/payments/tokens";
import { getDatabasePoolSettings } from "@/lib/prisma";
import { escrowMode, isEscrowOnchainConfigured } from "@/lib/escrow/service";
import { jsonOk } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = getServerConfig();
  let paymentMode: string;
  try {
    paymentMode = getPaymentConfig().mode;
  } catch {
    paymentMode = "misconfigured";
  }

  let databasePool: {
    provider: string;
    pooled: boolean;
    connectionLimit: number;
    poolTimeoutSeconds: number;
  } | null = null;
  if (config.hasDatabase) {
    try {
      const settings = getDatabasePoolSettings();
      databasePool = {
        provider: settings.provider,
        pooled: settings.pooled,
        connectionLimit: settings.connectionLimit,
        poolTimeoutSeconds: settings.poolTimeoutSeconds,
      };
    } catch {
      databasePool = null;
    }
  }

  return jsonOk({
    status: "ok",
    time: new Date().toISOString(),
    chainId: config.BOTCHAIN_TESTNET_CHAIN_ID,
    repository: getRepositoryKind(),
    databaseConfigured: config.hasDatabase,
    databasePool,
    escrow: {
      mode: escrowMode(),
      onchain: isEscrowOnchainConfigured(),
    },
    llmMode: getLlmMode() ?? "unconfigured",
    paymentMode,
    onchainReceipts: isOnchainReceiptConfigured(),
    onchainRegistry: isContractAddressConfigured(),
    adminApi: isAdminApiConfigured(),
    sessionAuth: config.hasSession,
    cronConfigured: config.hasCron,
    monitoring: monitoringStatus(),
    creditsEnabled: creditsEnabled(),
    supportedTokens: getSupportedTokens().map((token) => token.symbol),
    paymentRecipientConfigured: Boolean(
      process.env.NEXT_PUBLIC_PAYMENT_RECIPIENT &&
        /^0x[a-fA-F0-9]{40}$/.test(process.env.NEXT_PUBLIC_PAYMENT_RECIPIENT),
    ),
  });
}
