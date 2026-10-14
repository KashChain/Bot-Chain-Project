import type { NextRequest } from "next/server";
import { getServerConfig } from "../config";
import { RateLimitError, UnauthorizedError } from "../errors";
import { enforceRateLimit, rateLimitKey } from "../rate-limit";
import { verifyApiKey } from "./service";
import type { ApiKeyRecord } from "../repo/types";

export interface ApiKeyAuth {
  key: ApiKeyRecord;
  ownerAddress: string;
  remaining: number;
  limit: number;
}

export function extractApiKeyToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (header) {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (match) return match[1].trim();
  }
  const direct = request.headers.get("x-api-key");
  if (direct) return direct.trim();
  return null;
}

export async function authenticateApiKey(
  request: NextRequest,
): Promise<ApiKeyAuth> {
  const token = extractApiKeyToken(request);
  if (!token) {
    throw new UnauthorizedError(
      "Missing API key. Provide it via 'Authorization: Bearer <key>' or 'x-api-key'.",
    );
  }
  const verified = await verifyApiKey(token);
  if (!verified) {
    throw new UnauthorizedError("Invalid or revoked API key");
  }
  const config = getServerConfig();
  const result = await enforceRateLimit(
    rateLimitKey("apikey", verified.record.id),
    verified.record.rateLimit || config.API_KEY_RATE_LIMIT_DEFAULT,
    config.API_KEY_RATE_WINDOW_MS,
  );
  if (!result.allowed) {
    throw new RateLimitError(
      `API key rate limit exceeded (${result.limit}/window). Retry in ${result.retryAfterSeconds}s.`,
    );
  }
  return {
    key: verified.record,
    ownerAddress: verified.ownerAddress,
    remaining: result.remaining,
    limit: result.limit,
  };
}

export function requireScope(auth: ApiKeyAuth, scope: string): void {
  if (auth.key.scopes.length === 0) return;
  if (!auth.key.scopes.includes(scope)) {
    throw new UnauthorizedError(`API key is missing the '${scope}' scope`);
  }
}
