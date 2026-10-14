import { NextRequest } from "next/server";
import { jsonOk, handle } from "@/lib/api";
import { getRepository } from "@/lib/repo";
import { createApiKey, toPublicApiKey } from "@/lib/api-keys/service";
import { requireOwner } from "@/lib/auth/require-owner";
import { createApiKeySchema, apiKeyQuerySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handle(async () => {
    const parsed = apiKeyQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    const owner = requireOwner(request, parsed.success ? parsed.data.ownerAddress : undefined);
    const keys = await getRepository().listApiKeysByOwner(owner);
    return jsonOk({ keys: keys.map(toPublicApiKey), ownerAddress: owner });
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    const body = await request.json().catch(() => ({}));
    const parsed = createApiKeySchema.safeParse(body);
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
    const created = await createApiKey({
      name: parsed.data.name,
      ownerAddress: owner,
      rateLimit: parsed.data.rateLimit,
      scopes: parsed.data.scopes,
    });
    return jsonOk(
      {
        key: created,
        warning: "Store this token now. It will not be shown again.",
      },
      201,
    );
  });
}
