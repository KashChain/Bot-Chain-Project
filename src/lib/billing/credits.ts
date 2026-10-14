import { getServerConfig } from "../config";
import { AppError, ConfigurationError, ConflictError } from "../errors";
import { getRepository } from "../repo";
import type { CreditTransactionRecord } from "../repo/types";

export function creditsEnabled(): boolean {
  return getServerConfig().ENABLE_CREDITS;
}

function assertEnabled(): void {
  if (!creditsEnabled()) {
    throw new ConfigurationError(
      "Platform credits are disabled (set ENABLE_CREDITS=true to enable).",
    );
  }
}

function assertAmount(amountWei: string): void {
  if (!/^\d+$/.test(amountWei) || BigInt(amountWei) <= 0n) {
    throw new AppError("amountWei must be a positive integer string", 400, "BAD_AMOUNT");
  }
}

export async function getCreditBalance(
  ownerAddress: string,
): Promise<{ ownerAddress: string; balanceWei: string }> {
  const balance = await getRepository().getCreditBalance(ownerAddress);
  return { ownerAddress: balance.ownerAddress, balanceWei: balance.balanceWei };
}

export async function listCreditTransactions(
  ownerAddress: string,
  limit = 50,
): Promise<CreditTransactionRecord[]> {
  return getRepository().listCreditTransactions(ownerAddress, limit);
}

/**
 * Idempotent top-up. When a `reference` is supplied and a transaction with the
 * same reference already exists, the existing transaction is returned instead
 * of crediting the balance twice.
 */
export async function topUpCredits(input: {
  ownerAddress: string;
  amountWei: string;
  reference?: string | null;
}): Promise<CreditTransactionRecord> {
  assertEnabled();
  assertAmount(input.amountWei);
  const repo = getRepository();
  if (input.reference) {
    const existing = await repo.findCreditTransactionByReference(input.reference);
    if (existing) return existing;
  }
  return repo.applyCredit({
    ownerAddress: input.ownerAddress,
    type: "TOPUP",
    amountWei: input.amountWei,
    reference: input.reference ?? null,
  });
}

/**
 * Spend credits. Requires a unique `reference` so retries are safe and the same
 * spend cannot be applied twice.
 */
export async function spendCredits(input: {
  ownerAddress: string;
  amountWei: string;
  reference: string;
}): Promise<CreditTransactionRecord> {
  assertEnabled();
  assertAmount(input.amountWei);
  const repo = getRepository();
  const existing = await repo.findCreditTransactionByReference(input.reference);
  if (existing) return existing;
  const balance = await repo.getCreditBalance(input.ownerAddress);
  if (BigInt(balance.balanceWei) < BigInt(input.amountWei)) {
    throw new ConflictError("Insufficient platform credits for this task");
  }
  return repo.applyCredit({
    ownerAddress: input.ownerAddress,
    type: "SPEND",
    amountWei: `-${input.amountWei}`,
    reference: input.reference,
  });
}

export function formatCreditBalance(balanceWei: string): string {
  const wei = BigInt(balanceWei);
  const whole = wei / BigInt(10) ** BigInt(18);
  const fraction = (wei % BigInt(10) ** BigInt(18))
    .toString()
    .padStart(18, "0")
    .slice(0, 4);
  return `${whole}.${fraction}`;
}
