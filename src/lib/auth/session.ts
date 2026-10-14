import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest, NextResponse } from "next/server";
import { getServerConfig, isProductionRuntime } from "../config";
import { ConfigurationError, UnauthorizedError } from "../errors";

export const SESSION_COOKIE = "agenthub_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SessionPayload {
  address: string;
  exp: number;
}

function getSecret(): string {
  const secret = getServerConfig().SESSION_SECRET;
  if (!secret) {
    throw new ConfigurationError(
      isProductionRuntime()
        ? "SESSION_SECRET is required in production; wallet sign-in is unavailable until it is configured."
        : "SESSION_SECRET is not configured; wallet sign-in is disabled",
    );
  }
  return secret;
}

/** Whether an HMAC secret is available to sign/verify session cookies. */
export function isSessionConfigured(): boolean {
  return Boolean(getServerConfig().SESSION_SECRET);
}

/**
 * Owner-scoped endpoints are enforced when a session secret exists, and always
 * in production (where sessions must not silently degrade to disabled).
 */
export function sessionsEnforced(): boolean {
  return isSessionConfigured() || isProductionRuntime();
}

/**
 * Fail fast with an actionable message when the session secret is missing.
 * In production this is a hard requirement rather than a soft "disabled" state.
 */
export function assertSessionAvailable(): void {
  getSecret();
}

/**
 * Require a valid, verified wallet session. Throws a 503 `ConfigurationError`
 * when no secret is configured (production) or a 401 `UnauthorizedError` when
 * the caller is not signed in.
 */
export function requireSession(request: NextRequest): SessionPayload {
  assertSessionAvailable();
  const session = getSession(request);
  if (!session) {
    throw new UnauthorizedError(
      "Sign in with your wallet to access this resource",
    );
  }
  return session;
}

/**
 * Enforce a session for owner-scoped endpoints. Returns the session when one
 * exists, `null` when sessions are not enforced (local dev / tests), and
 * throws a clear 401/503 otherwise.
 */
export function requireSessionIfEnforced(
  request: NextRequest,
): SessionPayload | null {
  if (!sessionsEnforced()) return getSession(request);
  return requireSession(request);
}

function base64url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(body: string): string {
  return base64url(createHmac("sha256", getSecret()).update(body).digest());
}

export function createSessionToken(address: string, ttlMs = SESSION_TTL_MS): string {
  const payload: SessionPayload = {
    address: address.toLowerCase(),
    exp: Date.now() + ttlMs,
  };
  const body = base64url(Buffer.from(JSON.stringify(payload)));
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  let expected: string;
  try {
    expected = sign(body);
  } catch {
    return null;
  }
  const provided = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (provided.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(provided, expectedBuf)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
        "utf8",
      ),
    ) as SessionPayload;
    if (typeof payload.address !== "string" || typeof payload.exp !== "number") {
      return null;
    }
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getSession(request: NextRequest): SessionPayload | null {
  return verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
