import type { NextRequest } from "next/server";
import { getServerConfig } from "../config";
import { ForbiddenError, UnauthorizedError } from "../errors";
import { getSession } from "./session";

/**
 * Resolve the acting wallet for owner-scoped endpoints.
 *
 * - When a wallet session exists it always wins; a mismatching `provided`
 *   address is rejected.
 * - When sessions are not configured (SESSION_SECRET unset, e.g. local dev or
 *   tests) an explicitly supplied address is accepted.
 */
export function requireOwner(
  request: NextRequest,
  provided?: string | null,
): string {
  const config = getServerConfig();
  const session = getSession(request);
  if (session) {
    if (provided && provided.toLowerCase() !== session.address.toLowerCase()) {
      throw new ForbiddenError("Address does not match the signed-in wallet");
    }
    return session.address;
  }
  if (config.hasSession) {
    throw new UnauthorizedError(
      "Sign in with your wallet to access this resource",
    );
  }
  if (!provided) {
    throw new UnauthorizedError("ownerAddress is required");
  }
  return provided.toLowerCase();
}
