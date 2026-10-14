import { NextRequest } from "next/server";
import { handle, jsonOk } from "@/lib/api";
import { requireSessionIfEnforced } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { getCreatorEarnings } from "@/lib/creators/earnings";
import { creatorQuerySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handle(async () => {
    const session = requireSessionIfEnforced(request);
    const parsed = creatorQuerySchema.safeParse({
      ownerAddress: request.nextUrl.searchParams.get("ownerAddress") ?? undefined,
    });
    if (!parsed.success) {
      return jsonOk({ error: "Invalid owner address", code: "VALIDATION_ERROR" }, 422);
    }

    const owner = (session?.address ?? parsed.data.ownerAddress ?? "").toLowerCase();
    if (!owner) {
      throw new AppError(
        "An owner address is required (sign in or pass ownerAddress)",
        400,
        "MISSING_OWNER",
      );
    }

    const earnings = await getCreatorEarnings(owner);
    return jsonOk({ earnings });
  });
}
