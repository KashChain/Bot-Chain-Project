import { NextRequest } from "next/server";
import { jsonOk, handle } from "@/lib/api";
import { listSubscriptions, subscribe } from "@/lib/billing/subscriptions";
import { listPlans } from "@/lib/billing/plans";
import { requireOwner } from "@/lib/auth/require-owner";
import {
  createSubscriptionSchema,
  subscriptionQuerySchema,
} from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handle(async () => {
    const parsed = subscriptionQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    const owner = requireOwner(request, parsed.success ? parsed.data.ownerAddress : undefined);
    const subscriptions = await listSubscriptions(owner);
    return jsonOk({ subscriptions, plans: listPlans(), ownerAddress: owner });
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    const body = await request.json().catch(() => ({}));
    const parsed = createSubscriptionSchema.safeParse(body);
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
    const subscription = await subscribe({
      ownerAddress: owner,
      planId: parsed.data.planId,
      agentId: parsed.data.agentId ?? null,
    });
    return jsonOk({ subscription }, 201);
  });
}
