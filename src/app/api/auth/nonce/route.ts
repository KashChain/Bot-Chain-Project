import { NextRequest } from "next/server";
import { jsonOk, handle, getClientIp } from "@/lib/api";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getServerConfig } from "@/lib/config";
import { ConfigurationError } from "@/lib/errors";
import { issueNonce } from "@/lib/auth/nonce-store";
import { siweNonceQuerySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handle(async () => {
    checkRateLimit(rateLimitKey("auth:nonce", getClientIp(request)));
    if (!getServerConfig().hasSession) {
      throw new ConfigurationError(
        "SESSION_SECRET is not configured; wallet sign-in is disabled",
      );
    }
    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = siweNonceQuerySchema.safeParse(params);
    if (!parsed.success) {
      return jsonOk(
        { error: "A valid wallet address is required", code: "VALIDATION_ERROR" },
        422,
      );
    }
    const nonce = issueNonce(parsed.data.address);
    return jsonOk({ nonce });
  });
}
