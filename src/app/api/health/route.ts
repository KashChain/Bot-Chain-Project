import { getServerConfig } from "@/lib/config";
import { getRepositoryKind } from "@/lib/repo";
import { getLlmMode } from "@/lib/ai/llm";
import { getPaymentConfig } from "@/lib/payment";
import { isOnchainReceiptConfigured } from "@/lib/contract";
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
  return jsonOk({
    status: "ok",
    time: new Date().toISOString(),
    chainId: config.BOTCHAIN_TESTNET_CHAIN_ID,
    repository: getRepositoryKind(),
    databaseConfigured: config.hasDatabase,
    llmMode: getLlmMode() ?? "unconfigured",
    paymentMode,
    onchainReceipts: isOnchainReceiptConfigured(),
    paymentRecipientConfigured: Boolean(
      process.env.NEXT_PUBLIC_PAYMENT_RECIPIENT &&
        /^0x[a-fA-F0-9]{40}$/.test(process.env.NEXT_PUBLIC_PAYMENT_RECIPIENT),
    ),
  });
}
