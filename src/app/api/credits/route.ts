import { NextRequest } from "next/server";
import { jsonOk, handle } from "@/lib/api";
import { getCreditBalance, listCreditTransactions } from "@/lib/billing/credits";
import { requireOwner } from "@/lib/auth/require-owner";
import { creditQuerySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handle(async () => {
    const parsed = creditQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    const owner = requireOwner(request, parsed.success ? parsed.data.ownerAddress : undefined);
    const [balance, transactions] = await Promise.all([
      getCreditBalance(owner),
      listCreditTransactions(owner, parsed.success ? parsed.data.limit : undefined),
    ]);
    return jsonOk({
      ownerAddress: owner,
      balanceWei: balance.balanceWei,
      transactions,
    });
  });
}
