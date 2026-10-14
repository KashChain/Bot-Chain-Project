import type { NextRequest } from "next/server";
import { ForbiddenError, UnauthorizedError } from "../errors";
import { getSession, requireSession, sessionsEnforced } from "./session";

/**
 * Resolve the acting wallet for owner-scoped endpoints.
 *
 * - When a wallet session exists it always wins; a mismatching `provided`
 *   address is rejected.
 * - Otherwise, sessions are required whenever a secret is configured and
 *   always in production (never a silent "disabled" fallback).
 * - Only in non-production without a configured secret is an explicitly
 *   supplied address accepted (local development and tests).
 */
export function requireOwner(
  request: NextRequest,
  provided?: string | null,
): string {
  const session = getSession(request);
  if (session) {
    if (provided && provided.toLowerCase() !== session.address.toLowerCase()) {
      throw new ForbiddenError("Address does not match the signed-in wallet");
    }
    return session.address;
  }
  if (sessionsEnforced()) {
    return requireSession(request).address;
  }
  if (!provided) {
    throw new UnauthorizedError("ownerAddress is required");
  }
  return provided.toLowerCase();
}
