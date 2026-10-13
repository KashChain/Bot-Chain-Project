import { timingSafeEqual } from "crypto";
import { getServerConfig } from "./config";
import { AppError, NotFoundError } from "./errors";

export function isAdminApiConfigured(): boolean {
  return Boolean(getServerConfig().ADMIN_API_TOKEN);
}

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/**
 * Gate admin-only endpoints. When ADMIN_API_TOKEN is not configured the
 * endpoint behaves as if it does not exist (404) so it cannot be probed.
 * When it is configured, a matching `x-admin-token` header is required.
 */
export function assertAdmin(request: Request): void {
  const token = getServerConfig().ADMIN_API_TOKEN;
  if (!token) {
    throw new NotFoundError("Admin endpoints are disabled");
  }
  const provided = request.headers.get("x-admin-token");
  if (!provided || !safeEqual(provided, token)) {
    throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
  }
}
