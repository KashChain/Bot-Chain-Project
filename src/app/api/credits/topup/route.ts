import { NextRequest } from "next/server";
import { jsonOk, handle } from "@/lib/api";
import { getCreditBalance, topUpCredits } from "@/lib/billing/credits";
import { requireOwner } from "@/lib/auth/require-owner";
import { creditTopupSchema } from "@/lib/validation";
import { getPaymentConfig } from "@/lib/payment";

export const dynamic = "force-dynamic";

/**
 * Top up a platform credit balance.
 *
 * In mock/testnet mode this credits the balance directly. When an on-chain
 * payment token is configured, callers should pass a `reference` (e.g. a
 * verified transaction hash) so retries are idempotent.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const body = await request.json().catch(() => ({}));
    const parsed = creditTopupSchema.safeParse(body);
    if (!parsed.success) {
      return jsonOk(
        {
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        422,
      );
    }
    const owner = requireOwner(request, parsed.data.ownerAddress);
    const { mode } = getPaymentConfig();
    const transaction = await topUpCredits({
      ownerAddress: owner,
      amountWei: parsed.data.amountWei,
      reference: parsed.data.reference ?? `topup:${owner}:${Date.now()}`,
    });
    const balance = await getCreditBalance(owner);
    return jsonOk({ transaction, balanceWei: balance.balanceWei, mode }, 201);
  });
}
