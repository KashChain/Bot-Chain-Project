import { NextRequest } from "next/server";
import { jsonOk, handle } from "@/lib/api";
import { revokeApiKey, toPublicApiKey } from "@/lib/api-keys/service";
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
    const revoked = await revokeApiKey(id, owner);
    return jsonOk({ key: toPublicApiKey(revoked) });
  });
}
