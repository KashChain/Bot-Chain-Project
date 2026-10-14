import { NextRequest } from "next/server";
import { jsonOk, handle } from "@/lib/api";
import { cancelSubscription } from "@/lib/billing/subscriptions";
import { requireOwner } from "@/lib/auth/require-owner";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await params;
    const provided = request.nextUrl.searchParams.get("ownerAddress");
    const owner = requireOwner(request, provided);
    const subscription = await cancelSubscription(id, owner);
    return jsonOk({ subscription });
  });
}
