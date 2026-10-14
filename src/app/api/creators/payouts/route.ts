import { NextRequest } from "next/server";
import { handle, jsonOk, getClientIp } from "@/lib/api";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getSession } from "@/lib/auth/session";
import { getRepository } from "@/lib/repo";
import { AppError } from "@/lib/errors";
import { getCreatorEarnings } from "@/lib/creators/earnings";
import { creatorQuerySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

function resolveOwner(request: NextRequest, bodyAddress?: string): string {
  const session = getSession(request);
  const owner = (session?.address ?? bodyAddress ?? "").toLowerCase();
  if (!owner) {
    throw new AppError(
      "An owner address is required (sign in or pass ownerAddress)",
      400,
      "MISSING_OWNER",
    );
  }
  return owner;
}

export async function GET(request: NextRequest) {
  return handle(async () => {
    const parsed = creatorQuerySchema.safeParse({
      ownerAddress: request.nextUrl.searchParams.get("ownerAddress") ?? undefined,
    });
    if (!parsed.success) {
      return jsonOk({ error: "Invalid owner address", code: "VALIDATION_ERROR" }, 422);
    }
    const owner = resolveOwner(request, parsed.data.ownerAddress);
    const repo = getRepository();
    const [payouts, earnings] = await Promise.all([
      repo.listPayoutsByOwner(owner),
      getCreatorEarnings(owner),
    ]);
    return jsonOk({ payouts, earnings });
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    checkRateLimit(rateLimitKey("payouts:claim", getClientIp(request)));
    const body = (await request.json().catch(() => null)) as
      | { ownerAddress?: string }
      | null;
    const owner = resolveOwner(request, body?.ownerAddress);

    const earnings = await getCreatorEarnings(owner);
    if (BigInt(earnings.availableWei) <= 0n) {
      throw new AppError("No funds available to claim", 409, "NOTHING_TO_CLAIM");
    }

    const repo = getRepository();
    const payout = await repo.createPayout({
      ownerAddress: owner,
      amountWei: earnings.availableWei,
      status: "PROCESSED",
      processedAt: new Date(),
    });
    const updated = await getCreatorEarnings(owner);
    return jsonOk({ payout, earnings: updated }, 201);
  });
}
